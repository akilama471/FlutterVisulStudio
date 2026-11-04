import {
  createDesignCanvas,
  MAX_CANVASES,
  MAX_CANVAS_NAME_LENGTH,
  type DesignCanvas,
  type DesignSet,
} from "./designSet";
import { parseDesignSet, serializeDesignSet } from "./designStorage";
import { cloneSubtree, type CanvasNode } from "./model";

export const DESIGN_FILE_FORMAT = "flutter-ui-studio-design";
export const DESIGN_FILE_VERSION = 1;
export const MAX_DESIGN_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PROJECT_LABEL_LENGTH = 120;
const MAX_EXPORTED_AT_LENGTH = 40;

export type DesignFileScope = "project" | "canvas";

export type DesignFilePreview = {
  scope: DesignFileScope;
  projectName: string;
  exportedAt: string;
  set: DesignSet;
  bytes: number;
  canvasCount: number;
  nodeCount: number;
};

export type DesignFileParseResult =
  { ok: true; file: DesignFilePreview } | { ok: false; error: string };

export function serializeDesignFile(
  set: DesignSet,
  scope: DesignFileScope,
  projectName: string,
  now: Date = new Date(),
): string {
  return JSON.stringify({
    format: DESIGN_FILE_FORMAT,
    version: DESIGN_FILE_VERSION,
    scope,
    exportedAt: now.toISOString(),
    projectName: projectName.slice(0, MAX_PROJECT_LABEL_LENGTH),
    design: JSON.parse(serializeDesignSet(set)) as unknown,
  });
}

export function parseDesignFile(raw: string): DesignFileParseResult {
  if (byteLength(raw) > MAX_DESIGN_FILE_BYTES) {
    return { ok: false, error: "The design file is larger than the 2 MB limit." };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }

  if (!isRecord(payload) || payload.format !== DESIGN_FILE_FORMAT) {
    return { ok: false, error: "That file is not a Flutter UI Studio design export." };
  }

  if (payload.version !== DESIGN_FILE_VERSION) {
    return {
      ok: false,
      error: "This design file version is not supported by this version of the studio.",
    };
  }

  if (payload.scope !== "project" && payload.scope !== "canvas") {
    return { ok: false, error: "The design file has an unknown export scope." };
  }

  const exportedAt = readString(payload.exportedAt, MAX_EXPORTED_AT_LENGTH);
  const projectName = readString(payload.projectName, MAX_PROJECT_LABEL_LENGTH);

  if (exportedAt === null || projectName === null) {
    return { ok: false, error: "The design file is missing its export information." };
  }

  const set = parseDesignSet(JSON.stringify(payload.design));

  if (!set) {
    return {
      ok: false,
      error: "The design data is invalid or uses an unsupported design version.",
    };
  }

  if (payload.scope === "canvas" && set.canvases.length !== 1) {
    return { ok: false, error: "A single-canvas design file must contain exactly one canvas." };
  }

  return {
    ok: true,
    file: {
      scope: payload.scope,
      projectName: projectName.trim() || "Design file",
      exportedAt,
      set,
      bytes: byteLength(raw),
      canvasCount: set.canvases.length,
      nodeCount: set.canvases.reduce((total, canvas) => total + countCanvasNodes(canvas), 0),
    },
  };
}

export function defaultDesignFileName(
  projectName: string,
  canvasName: string,
  scope: DesignFileScope,
): string {
  const source = scope === "canvas" ? canvasName : projectName;
  const base = sanitizeFileName(source) || "design";

  return `${base}-${scope}.json`;
}

export function reidentifyDesignSet(set: DesignSet): DesignSet {
  const activeIndex = Math.max(
    0,
    set.canvases.findIndex((canvas) => canvas.id === set.activeId),
  );
  const canvases = set.canvases.map((canvas) =>
    createDesignCanvas(canvas.name, cloneSubtree(canvas.root)),
  );

  return {
    canvases,
    activeId: canvases[activeIndex]?.id ?? canvases[0].id,
  };
}

export function addImportedCanvas(set: DesignSet, canvas: DesignCanvas): DesignSet | null {
  if (set.canvases.length >= MAX_CANVASES || canvas.root.kind !== "screen") {
    return null;
  }

  const imported = createDesignCanvas(
    importedCanvasName(set.canvases, canvas.name),
    cloneSubtree(canvas.root),
  );
  const activeIndex = set.canvases.findIndex((entry) => entry.id === set.activeId);
  const index = activeIndex >= 0 ? activeIndex + 1 : set.canvases.length;
  const canvases = [...set.canvases.slice(0, index), imported, ...set.canvases.slice(index)];

  return { canvases, activeId: imported.id };
}

export function importedCanvasName(canvases: readonly DesignCanvas[], name: string): string {
  const trimmed = name.trim().slice(0, MAX_CANVAS_NAME_LENGTH) || "Imported canvas";
  const used = new Set(canvases.map((canvas) => canvas.name.toLowerCase()));

  if (!used.has(trimmed.toLowerCase())) {
    return trimmed;
  }

  for (let index = 1; index <= MAX_CANVASES + 1; index += 1) {
    const suffix = index === 1 ? " (imported)" : ` (imported ${index})`;
    const base = trimmed.slice(0, Math.max(1, MAX_CANVAS_NAME_LENGTH - suffix.length)).trimEnd();
    const candidate = `${base}${suffix}`;

    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return trimmed;
}

export function countCanvasNodes(canvas: DesignCanvas): number {
  return countNodes(canvas.root);
}

function countNodes(root: CanvasNode): number {
  let count = 0;
  const stack: CanvasNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();

    if (!node) {
      continue;
    }

    count += 1;
    stack.push(...node.children);
  }

  return count;
}

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || value.length > maxLength) {
    return null;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
