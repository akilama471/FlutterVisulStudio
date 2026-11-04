import { createStarterRoot, type CanvasNode } from "./model";

export const MAX_CANVASES = 20;
export const MAX_CANVAS_NAME_LENGTH = 60;
const MAX_CANVAS_ID_LENGTH = 80;

export type DesignCanvas = {
  id: string;
  name: string;
  root: CanvasNode;
};

export type DesignSet = {
  canvases: DesignCanvas[];
  activeId: string;
};

export type RemovedCanvas = {
  canvas: DesignCanvas;
  index: number;
  previousId: string | null;
  nextId: string | null;
};

let canvasSequence = 0;

function nextCanvasId(): string {
  canvasSequence += 1;
  return `canvas-${canvasSequence}`;
}

export function adoptCanvasIds(set: DesignSet): void {
  for (const canvas of set.canvases) {
    const match = /-(\d+)$/.exec(canvas.id);
    if (!match) {
      continue;
    }

    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value)) {
      canvasSequence = Math.max(canvasSequence, value);
    }
  }
}

export function nextCanvasName(canvases: DesignCanvas[]): string {
  const used = new Set(canvases.map((canvas) => canvas.name.toLowerCase()));

  for (let index = 1; index <= MAX_CANVASES + 1; index += 1) {
    const name = `Canvas ${index}`;
    if (!used.has(name.toLowerCase())) {
      return name;
    }
  }

  return "Canvas";
}

export function createDesignCanvas(
  name: string,
  root: CanvasNode = createStarterRoot(),
): DesignCanvas {
  return {
    id: nextCanvasId(),
    name,
    root,
  };
}

export function createCanvasSet(): DesignSet {
  const canvas = createDesignCanvas("Canvas 1");
  return { canvases: [canvas], activeId: canvas.id };
}

export function findCanvas(set: DesignSet, id: string): DesignCanvas | null {
  return set.canvases.find((canvas) => canvas.id === id) ?? null;
}

export function addCanvas(set: DesignSet): DesignSet {
  if (set.canvases.length >= MAX_CANVASES) {
    return set;
  }

  const canvas = createDesignCanvas(nextCanvasName(set.canvases));
  return {
    canvases: [...set.canvases, canvas],
    activeId: canvas.id,
  };
}

export function selectCanvas(set: DesignSet, id: string): DesignSet {
  if (set.activeId === id || !findCanvas(set, id)) {
    return set;
  }

  return { ...set, activeId: id };
}

export function removeCanvas(
  set: DesignSet,
  id: string,
): { set: DesignSet; removed: RemovedCanvas | null } {
  if (set.canvases.length <= 1) {
    return { set, removed: null };
  }

  const index = set.canvases.findIndex((canvas) => canvas.id === id);
  if (index === -1) {
    return { set, removed: null };
  }

  const removed = set.canvases[index];
  const previousId = index > 0 ? set.canvases[index - 1].id : null;
  const nextId = index < set.canvases.length - 1 ? set.canvases[index + 1].id : null;
  const canvases = set.canvases.filter((canvas) => canvas.id !== id);
  const activeId =
    set.activeId === id ? canvases[Math.min(index, canvases.length - 1)].id : set.activeId;

  return {
    set: { canvases, activeId },
    removed: { canvas: removed, index, previousId, nextId },
  };
}

export function insertCanvas(set: DesignSet, canvas: DesignCanvas, index: number): DesignSet {
  if (set.canvases.length >= MAX_CANVASES || set.canvases.some((entry) => entry.id === canvas.id)) {
    return set;
  }

  const at = Math.min(Math.max(index, 0), set.canvases.length);
  const canvases = [...set.canvases.slice(0, at), canvas, ...set.canvases.slice(at)];

  return { canvases, activeId: canvas.id };
}

export function restoreCanvas(set: DesignSet, removed: RemovedCanvas): DesignSet {
  const nextIndex = removed.nextId
    ? set.canvases.findIndex((canvas) => canvas.id === removed.nextId)
    : -1;
  const previousIndex = removed.previousId
    ? set.canvases.findIndex((canvas) => canvas.id === removed.previousId)
    : -1;
  const index =
    removed.nextId === null
      ? set.canvases.length
      : nextIndex >= 0
        ? nextIndex
        : previousIndex >= 0
          ? previousIndex + 1
          : removed.index;

  return insertCanvas(set, removed.canvas, index);
}

export function replaceCanvasRoot(set: DesignSet, id: string, root: CanvasNode): DesignSet {
  const index = set.canvases.findIndex((canvas) => canvas.id === id);

  if (index === -1 || set.canvases[index].root === root) {
    return set;
  }

  const canvases = set.canvases.slice();
  canvases[index] = { ...canvases[index], root };

  return { ...set, canvases };
}

export type CanvasNameError = "empty" | "too-long" | "duplicate";

export function canvasNameError(
  canvases: readonly DesignCanvas[],
  id: string,
  name: string,
): CanvasNameError | null {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return "empty";
  }

  if (trimmed.length > MAX_CANVAS_NAME_LENGTH) {
    return "too-long";
  }

  const duplicate = canvases.some(
    (canvas) => canvas.id !== id && canvas.name.toLowerCase() === trimmed.toLowerCase(),
  );

  return duplicate ? "duplicate" : null;
}

export function renameCanvas(set: DesignSet, id: string, name: string): DesignSet {
  const index = set.canvases.findIndex((canvas) => canvas.id === id);

  if (index === -1) {
    return set;
  }

  const trimmed = name.trim();

  if (canvasNameError(set.canvases, id, trimmed) !== null) {
    return set;
  }

  if (set.canvases[index].name === trimmed) {
    return set;
  }

  const canvases = set.canvases.slice();
  canvases[index] = { ...canvases[index], name: trimmed };

  return { ...set, canvases };
}

export function isValidCanvasName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_CANVAS_NAME_LENGTH &&
    value.trim() === value
  );
}

export function isValidCanvasId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CANVAS_ID_LENGTH;
}
