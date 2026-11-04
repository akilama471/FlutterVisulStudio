import {
  adoptCanvasIds,
  createCanvasSet,
  isValidCanvasId,
  isValidCanvasName,
  MAX_CANVASES,
  type DesignCanvas,
  type DesignSet,
} from "./designSet";
import { adoptWidgetIds, canHaveChildren, type CanvasNode, type WidgetKind } from "./model";

const STORAGE_PREFIX = "flutter-ui-studio:designs:v2:";
const LEGACY_STORAGE_PREFIX = "flutter-ui-studio:design:v1:";
const DESIGN_VERSION = 2;
const LEGACY_DESIGN_VERSION = 1;
const MAX_NODES = 1000;
const MAX_DEPTH = 50;
const MAX_ID_LENGTH = 120;
const MAX_TEXT_LENGTH = 10_000;
const MAX_COLOR_LENGTH = 64;
const MAX_GAP = 64;
const MAX_PADDING = 96;

export const MAX_DESIGN_BYTES_WARNING = 1024 * 1024;

const WIDGET_KINDS: readonly WidgetKind[] = [
  "screen",
  "column",
  "row",
  "container",
  "text",
  "button",
];

export type DesignSaveStatus = "saving" | "saved" | "error";

export type DesignSetLoadStatus = "restored" | "migrated" | "missing" | "invalid" | "unavailable";

export type DesignSetLoadResult = {
  status: DesignSetLoadStatus;
  set: DesignSet;
};

type ParseStats = {
  count: number;
  ids: Set<string>;
};

export function designSetStorageKey(projectPath: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(projectPath)}`;
}

export function legacyDesignStorageKey(projectPath: string): string {
  return `${LEGACY_STORAGE_PREFIX}${encodeURIComponent(projectPath)}`;
}

export function serializeDesignSet(set: DesignSet): string {
  return JSON.stringify({
    version: DESIGN_VERSION,
    activeId: set.activeId,
    canvases: set.canvases.map(({ id, name, root }) => ({ id, name, root })),
  });
}

export function designSetBytes(set: DesignSet): number {
  return new TextEncoder().encode(serializeDesignSet(set)).length;
}

export function parseDesignSet(raw: string): DesignSet | null {
  let payload: unknown;

  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    !isRecord(payload) ||
    payload.version !== DESIGN_VERSION ||
    typeof payload.activeId !== "string" ||
    !Array.isArray(payload.canvases) ||
    payload.canvases.length < 1 ||
    payload.canvases.length > MAX_CANVASES
  ) {
    return null;
  }

  const canvases: DesignCanvas[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const value of payload.canvases) {
    if (!isRecord(value)) {
      return null;
    }

    const { id, name } = value;

    if (!isValidCanvasId(id) || ids.has(id)) {
      return null;
    }

    if (!isValidCanvasName(name) || names.has(name.toLowerCase())) {
      return null;
    }

    const stats: ParseStats = { count: 0, ids: new Set() };
    const root = parseNode(value.root, 0, stats);

    if (!root || root.kind !== "screen") {
      return null;
    }

    ids.add(id);
    names.add(name.toLowerCase());
    canvases.push({ id, name, root });
  }

  if (!ids.has(payload.activeId)) {
    return null;
  }

  return { canvases, activeId: payload.activeId };
}

export function loadDesignSet(projectPath: string): DesignSetLoadResult {
  let rawSet: string | null;
  let rawLegacy: string | null;

  try {
    rawSet = window.localStorage.getItem(designSetStorageKey(projectPath));
    rawLegacy = window.localStorage.getItem(legacyDesignStorageKey(projectPath));
  } catch {
    return { status: "unavailable", set: createCanvasSet() };
  }

  if (rawSet !== null) {
    const set = parseDesignSet(rawSet);

    if (set) {
      adoptLoadedDesignSet(set);
      return { status: "restored", set };
    }
  }

  if (rawLegacy !== null) {
    const root = parseLegacyDesign(rawLegacy);

    if (!root) {
      return { status: "invalid", set: createCanvasSet() };
    }

    adoptWidgetIds(root);
    const canvas: DesignCanvas = { id: "canvas-1", name: "Main", root };
    const set: DesignSet = { canvases: [canvas], activeId: canvas.id };
    adoptCanvasIds(set);

    return { status: "migrated", set };
  }

  return { status: rawSet !== null ? "invalid" : "missing", set: createCanvasSet() };
}

export function saveDesignSet(projectPath: string, set: DesignSet): boolean {
  const serialized = serializeDesignSet(set);

  if (parseDesignSet(serialized) === null) {
    return false;
  }

  try {
    window.localStorage.setItem(designSetStorageKey(projectPath), serialized);
    return true;
  } catch {
    return false;
  }
}

export function clearLegacyDesign(projectPath: string): void {
  try {
    window.localStorage.removeItem(legacyDesignStorageKey(projectPath));
  } catch {
    // Storage is unavailable; the migration payload cannot be cleaned up.
  }
}

function adoptLoadedDesignSet(set: DesignSet): void {
  for (const canvas of set.canvases) {
    adoptWidgetIds(canvas.root);
  }

  adoptCanvasIds(set);
}

function parseLegacyDesign(raw: string): CanvasNode | null {
  let payload: unknown;

  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(payload) || payload.version !== LEGACY_DESIGN_VERSION) {
    return null;
  }

  const stats: ParseStats = { count: 0, ids: new Set() };
  const root = parseNode(payload.root, 0, stats);

  if (!root || root.kind !== "screen") {
    return null;
  }

  return root;
}

export function parseDesignNode(value: unknown): CanvasNode | null {
  return parseNode(value, 0, { count: 0, ids: new Set() });
}

function parseNode(value: unknown, depth: number, stats: ParseStats): CanvasNode | null {
  if (depth > MAX_DEPTH || !isRecord(value)) {
    return null;
  }

  const { id, kind, props, children } = value;

  if (
    typeof id !== "string" ||
    id.trim().length === 0 ||
    id.length > MAX_ID_LENGTH ||
    stats.ids.has(id) ||
    !isWidgetKind(kind) ||
    (kind === "screen" && depth > 0) ||
    !isRecord(props) ||
    !Array.isArray(children) ||
    children.length > MAX_NODES
  ) {
    return null;
  }

  if (!canHaveChildren(kind) && children.length > 0) {
    return null;
  }

  const content = readString(props.content, MAX_TEXT_LENGTH);
  const label = readString(props.label, MAX_TEXT_LENGTH);
  const background = readString(props.background, MAX_COLOR_LENGTH);
  const padding = readNumber(props.padding, 0, MAX_PADDING);
  const gap = readNumber(props.gap, 0, MAX_GAP);

  if (
    content === null ||
    label === null ||
    background === null ||
    padding === null ||
    gap === null
  ) {
    return null;
  }

  stats.count += 1;
  if (stats.count > MAX_NODES) {
    return null;
  }
  stats.ids.add(id);

  const parsedChildren: CanvasNode[] = [];

  for (const child of children) {
    const parsedChild = parseNode(child, depth + 1, stats);
    if (!parsedChild) {
      return null;
    }
    parsedChildren.push(parsedChild);
  }

  return {
    id,
    kind,
    props: { content, label, padding, gap, background },
    children: parsedChildren,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWidgetKind(value: unknown): value is WidgetKind {
  return typeof value === "string" && WIDGET_KINDS.includes(value as WidgetKind);
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || value.length > maxLength) {
    return null;
  }

  return value;
}

function readNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }

  return value;
}
