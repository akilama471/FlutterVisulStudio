import { adoptWidgetIds, canHaveChildren, type CanvasNode, type WidgetKind } from "./model";

const STORAGE_PREFIX = "flutter-ui-studio:design:v1:";
const DESIGN_VERSION = 1;
const MAX_NODES = 1000;
const MAX_DEPTH = 50;
const MAX_ID_LENGTH = 120;
const MAX_TEXT_LENGTH = 10_000;
const MAX_COLOR_LENGTH = 64;
const MAX_GAP = 64;
const MAX_PADDING = 96;

const WIDGET_KINDS: readonly WidgetKind[] = [
  "screen",
  "column",
  "row",
  "container",
  "text",
  "button",
];

export type DesignSaveStatus = "saving" | "saved" | "error";

export type DesignLoadStatus = "restored" | "missing" | "invalid" | "unavailable";

export type DesignLoadResult = {
  status: DesignLoadStatus;
  root: CanvasNode | null;
};

type ParseStats = {
  count: number;
  ids: Set<string>;
};

export function designStorageKey(projectPath: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(projectPath)}`;
}

export function serializeDesign(root: CanvasNode): string {
  return JSON.stringify({ version: DESIGN_VERSION, root });
}

export function parseDesign(raw: string): CanvasNode | null {
  let payload: unknown;

  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(payload) || payload.version !== DESIGN_VERSION) {
    return null;
  }

  const stats: ParseStats = { count: 0, ids: new Set() };
  const root = parseNode(payload.root, 0, stats);

  if (!root || root.kind !== "screen") {
    return null;
  }

  return root;
}

export function loadDesign(projectPath: string): DesignLoadResult {
  let raw: string | null;

  try {
    raw = window.localStorage.getItem(designStorageKey(projectPath));
  } catch {
    return { status: "unavailable", root: null };
  }

  if (raw === null) {
    return { status: "missing", root: null };
  }

  const root = parseDesign(raw);

  if (!root) {
    return { status: "invalid", root: null };
  }

  adoptWidgetIds(root);
  return { status: "restored", root };
}

export function saveDesign(projectPath: string, root: CanvasNode): boolean {
  const serialized = serializeDesign(root);

  if (parseDesign(serialized) === null) {
    return false;
  }

  try {
    window.localStorage.setItem(designStorageKey(projectPath), serialized);
    return true;
  } catch {
    return false;
  }
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
