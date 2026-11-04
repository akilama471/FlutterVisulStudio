import { describe, expect, it } from "vitest";
import {
  addCanvas,
  adoptCanvasIds,
  canvasNameError,
  createCanvasSet,
  createDesignCanvas,
  duplicateCanvas,
  findCanvas,
  insertCanvas,
  isValidCanvasId,
  isValidCanvasName,
  MAX_CANVASES,
  nextCanvasCopyName,
  nextCanvasName,
  removeCanvas,
  renameCanvas,
  reorderCanvas,
  replaceCanvasRoot,
  restoreCanvas,
  selectCanvas,
  type DesignSet,
} from "./designSet";
import { createWidget } from "./model";

describe("design canvas sets", () => {
  it("creates a starter set with one active canvas", () => {
    const set = createCanvasSet();

    expect(set.canvases).toHaveLength(1);
    expect(set.activeId).toBe(set.canvases[0].id);
    expect(set.canvases[0].name).toBe("Canvas 1");
    expect(set.canvases[0].root.kind).toBe("screen");
    expect(findCanvas(set, set.activeId)).toBe(set.canvases[0]);
  });

  it("adds canvases with unique names and activates the new one", () => {
    let set = createCanvasSet();
    set = addCanvas(set);
    set = addCanvas(set);

    expect(set.canvases.map((canvas) => canvas.name)).toEqual(["Canvas 1", "Canvas 2", "Canvas 3"]);
    expect(set.activeId).toBe(set.canvases[2].id);
    expect(findCanvas(set, set.activeId)?.root).not.toBe(set.canvases[0].root);
  });

  it("fills gaps in generated names", () => {
    const canvas = createDesignCanvas("Canvas 2");
    const custom: DesignSet = { canvases: [canvas], activeId: canvas.id };

    expect(nextCanvasName(custom.canvases)).toBe("Canvas 1");
  });

  it("caps the number of canvases", () => {
    let set = createCanvasSet();

    for (let index = 1; index < MAX_CANVASES; index += 1) {
      set = addCanvas(set);
    }

    expect(set.canvases).toHaveLength(MAX_CANVASES);
    expect(addCanvas(set)).toBe(set);
  });

  it("selects only existing canvases and ignores the active one", () => {
    const set = addCanvas(createCanvasSet());
    const first = set.canvases[0];

    expect(selectCanvas(set, first.id).activeId).toBe(first.id);
    expect(selectCanvas(set, "missing")).toBe(set);
    expect(selectCanvas(set, set.activeId)).toBe(set);
  });

  it("removes a canvas, activates a neighbour, and keeps the last canvas", () => {
    let set = createCanvasSet();
    set = addCanvas(set);
    const [first, second] = set.canvases;

    const removed = removeCanvas(set, second.id);
    expect(removed.removed?.canvas.id).toBe(second.id);
    expect(removed.removed?.index).toBe(1);
    expect(removed.set.canvases.map((canvas) => canvas.id)).toEqual([first.id]);
    expect(removed.set.activeId).toBe(first.id);

    const last = removeCanvas(removed.set, first.id);
    expect(last.removed).toBeNull();
    expect(last.set).toBe(removed.set);
  });

  it("reinserts a removed canvas at its original index and activates it", () => {
    let set = createCanvasSet();
    set = addCanvas(set);
    set = addCanvas(set);
    const middle = set.canvases[1];

    const removed = removeCanvas(set, middle.id);
    const restored = insertCanvas(removed.set, removed.removed!.canvas, removed.removed!.index);

    expect(restored.canvases.map((canvas) => canvas.id)).toEqual(
      set.canvases.map((canvas) => canvas.id),
    );
    expect(restored.activeId).toBe(middle.id);
  });

  it("restores deleted canvases around their surviving neighbours", () => {
    let set = createCanvasSet();
    set = addCanvas(set);
    set = addCanvas(set);
    const [, second, third] = set.canvases;

    const removedSecond = removeCanvas(set, second.id);
    const removedThird = removeCanvas(removedSecond.set, third.id);

    expect(removedSecond.removed).toMatchObject({
      previousId: set.canvases[0].id,
      nextId: third.id,
    });
    expect(removedThird.removed).toMatchObject({ previousId: set.canvases[0].id, nextId: null });

    const secondBack = restoreCanvas(removedThird.set, removedSecond.removed!);
    const thirdBack = restoreCanvas(secondBack, removedThird.removed!);

    expect(thirdBack.canvases.map((canvas) => canvas.name)).toEqual([
      "Canvas 1",
      "Canvas 2",
      "Canvas 3",
    ]);
    expect(thirdBack.activeId).toBe(third.id);
  });

  it("duplicates a canvas after its source with fresh widget ids", () => {
    let set = createCanvasSet();
    set = addCanvas(set);
    const [first, second] = set.canvases;

    const duplicated = duplicateCanvas(set, first.id);
    const copy = duplicated.canvases[1];

    expect(duplicated.canvases.map((canvas) => canvas.name)).toEqual([
      "Canvas 1",
      "Canvas 1 copy",
      "Canvas 2",
    ]);
    expect(copy.id).not.toBe(first.id);
    expect(copy.root.id).not.toBe(first.root.id);
    expect(copy.root.children[0].id).not.toBe(first.root.children[0].id);
    expect(copy.root.children[0].children.map((child) => child.props)).toEqual(
      first.root.children[0].children.map((child) => child.props),
    );
    expect(duplicated.activeId).toBe(copy.id);
    expect(duplicated.canvases[2]).toBe(second);
  });

  it("names canvas copies uniquely and within the length limit", () => {
    const set = createCanvasSet();
    const copies = [
      ...set.canvases,
      { ...createDesignCanvas("Canvas 1 copy"), id: "copy-a" },
      { ...createDesignCanvas("Canvas 1 copy 2"), id: "copy-b" },
    ];

    expect(nextCanvasCopyName(copies, "Canvas 1")).toBe("Canvas 1 copy 3");
    expect(nextCanvasCopyName(copies, "x".repeat(60))).toHaveLength(60);
  });

  it("refuses to duplicate when the canvas limit is reached", () => {
    let set = createCanvasSet();

    while (set.canvases.length < MAX_CANVASES) {
      set = addCanvas(set);
    }

    expect(duplicateCanvas(set, set.canvases[0].id)).toBe(set);
    expect(duplicateCanvas(set, "missing")).toBe(set);
  });

  it("reorders canvases without changing the active canvas", () => {
    let set = createCanvasSet();
    set = addCanvas(set);
    set = addCanvas(set);
    const [first, second, third] = set.canvases;

    const moved = reorderCanvas(set, third.id, first.id, "before");
    expect(moved.canvases.map((canvas) => canvas.id)).toEqual([third.id, first.id, second.id]);
    expect(moved.activeId).toBe(set.activeId);

    const back = reorderCanvas(moved, third.id, second.id, "after");
    expect(back.canvases.map((canvas) => canvas.id)).toEqual([first.id, second.id, third.id]);
    expect(reorderCanvas(set, first.id, first.id, "before")).toBe(set);
    expect(reorderCanvas(set, "missing", first.id, "before")).toBe(set);
    expect(reorderCanvas(set, first.id, "missing", "before")).toBe(set);
  });

  it("rejects duplicate and excess canvas inserts", () => {
    const set = createCanvasSet();

    expect(insertCanvas(set, set.canvases[0], 0)).toBe(set);

    let full = set;
    while (full.canvases.length < MAX_CANVASES) {
      full = addCanvas(full);
    }

    expect(insertCanvas(full, createDesignCanvas("Extra"), 0)).toBe(full);
  });

  it("replaces a canvas root only when it changed", () => {
    const set = createCanvasSet();
    const canvas = set.canvases[0];
    const root = createWidget("screen");

    const replaced = replaceCanvasRoot(set, canvas.id, root);
    expect(findCanvas(replaced, canvas.id)?.root).toBe(root);
    expect(replaceCanvasRoot(replaced, canvas.id, root)).toBe(replaced);
    expect(replaceCanvasRoot(set, "missing", root)).toBe(set);
  });

  it("renames a canvas with trimmed input and rejects invalid names", () => {
    const set = addCanvas(createCanvasSet());
    const first = set.canvases[0];

    expect(canvasNameError(set.canvases, first.id, "  ")).toBe("empty");
    expect(canvasNameError(set.canvases, first.id, "x".repeat(61))).toBe("too-long");
    expect(canvasNameError(set.canvases, first.id, "canvas 2")).toBe("duplicate");
    expect(canvasNameError(set.canvases, first.id, "Home")).toBeNull();

    const renamed = renameCanvas(set, first.id, "  Home  ");
    expect(findCanvas(renamed, first.id)?.name).toBe("Home");
    expect(renamed.activeId).toBe(set.activeId);
    expect(renameCanvas(set, first.id, "Canvas 1")).toBe(set);
    expect(renameCanvas(set, first.id, "Home ")).not.toBe(set);
    expect(findCanvas(renameCanvas(set, first.id, "Home "), first.id)?.name).toBe("Home");
    expect(renameCanvas(set, "missing", "Home")).toBe(set);
    expect(renameCanvas(set, first.id, "Canvas 2")).toBe(set);
    expect(renameCanvas(set, first.id, "x".repeat(61))).toBe(set);
  });

  it("advances generated canvas IDs past adopted ones", () => {
    const adopted = { id: "canvas-9000", name: "Imported", root: createWidget("screen") };
    adoptCanvasIds({ canvases: [adopted], activeId: adopted.id });

    const next = createDesignCanvas("Canvas next");
    expect(Number(next.id.replace("canvas-", ""))).toBeGreaterThan(9000);
  });

  it("validates canvas ids and names", () => {
    expect(isValidCanvasId("canvas-1")).toBe(true);
    expect(isValidCanvasId("")).toBe(false);
    expect(isValidCanvasId("x".repeat(81))).toBe(false);
    expect(isValidCanvasId(42)).toBe(false);

    expect(isValidCanvasName("Main")).toBe(true);
    expect(isValidCanvasName(" Main")).toBe(false);
    expect(isValidCanvasName("")).toBe(false);
    expect(isValidCanvasName("x".repeat(61))).toBe(false);
    expect(isValidCanvasName(null)).toBe(false);
  });
});
