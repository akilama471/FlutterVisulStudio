import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvasSet, createDesignCanvas, MAX_CANVASES, type DesignSet } from "./designSet";
import {
  clearLegacyDesign,
  designSetStorageKey,
  legacyDesignStorageKey,
  loadDesignSet,
  parseDesignSet,
  saveDesignSet,
  serializeDesignSet,
} from "./designStorage";
import { createWidget, type CanvasNode, type WidgetProps } from "./model";

const PROJECT = "C:\\Projects\\demo_app";
const OTHER_PROJECT = "C:\\Projects\\other_app";

const BASE_PROPS: WidgetProps = {
  content: "",
  label: "",
  padding: 0,
  gap: 0,
  background: "",
};

function savedDesign(content = "Saved heading"): CanvasNode {
  const screen = createWidget("screen");
  const column = createWidget("column");
  column.children = [createWidget("text", { content })];
  screen.children = [column];
  return screen;
}

function twoCanvasSet(): DesignSet {
  const first = createCanvasSet();
  const second = createDesignCanvas("Canvas 2", savedDesign("Second heading"));

  return {
    canvases: [first.canvases[0], second],
    activeId: second.id,
  };
}

function legacyPayload(root: unknown): string {
  return JSON.stringify({ version: 1, root });
}

function rawNode(id: string, kind: string, props: WidgetProps, children: unknown[] = []) {
  return { id, kind, props, children };
}

function setPayload(canvases: unknown[], activeId: unknown = "canvas-1", version = 2): string {
  return JSON.stringify({ version, activeId, canvases });
}

function canvasPayload(id: string, name: string, root: unknown) {
  return { id, name, root };
}

function rawCanvas(root: unknown, id = "canvas-1", name = "Canvas 1") {
  return canvasPayload(id, name, root);
}

function starterSet(): DesignSet {
  return createCanvasSet();
}

describe("design set storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("round-trips a set with several canvases", () => {
    const set = twoCanvasSet();

    expect(parseDesignSet(serializeDesignSet(set))).toEqual(set);
  });

  it("reports a missing set with a starter canvas", () => {
    const result = loadDesignSet(PROJECT);

    expect(result.status).toBe("missing");
    expect(result.set.canvases).toHaveLength(1);
    expect(result.set.activeId).toBe(result.set.canvases[0].id);
  });

  it("saves and restores a set for one project only", () => {
    const set = twoCanvasSet();

    expect(saveDesignSet(PROJECT, set)).toBe(true);
    expect(loadDesignSet(PROJECT)).toEqual({ status: "restored", set });
    expect(loadDesignSet(OTHER_PROJECT).status).toBe("missing");
  });

  it("restores the saved active canvas", () => {
    const set = twoCanvasSet();
    expect(saveDesignSet(PROJECT, set)).toBe(true);

    const loaded = loadDesignSet(PROJECT);
    expect(loaded.status).toBe("restored");
    expect(loaded.set.activeId).toBe(set.canvases[1].id);
  });

  it("uses distinct encoded keys per project path", () => {
    expect(designSetStorageKey(PROJECT)).toContain(encodeURIComponent(PROJECT));
    expect(designSetStorageKey(PROJECT)).not.toBe(designSetStorageKey(OTHER_PROJECT));
    expect(designSetStorageKey(PROJECT)).not.toBe(legacyDesignStorageKey(PROJECT));
  });

  it("migrates the Phase 4 design into a Main canvas", () => {
    const root = savedDesign("Legacy heading");
    window.localStorage.setItem(legacyDesignStorageKey(PROJECT), legacyPayload(root));

    const result = loadDesignSet(PROJECT);

    expect(result.status).toBe("migrated");
    expect(result.set.canvases).toHaveLength(1);
    expect(result.set.canvases[0].name).toBe("Main");
    expect(result.set.canvases[0].root).toEqual(root);
    expect(result.set.activeId).toBe(result.set.canvases[0].id);
  });

  it("removes the legacy design only after the migrated set is saved", () => {
    const root = savedDesign("Legacy heading");
    window.localStorage.setItem(legacyDesignStorageKey(PROJECT), legacyPayload(root));

    const migrated = loadDesignSet(PROJECT);
    expect(saveDesignSet(PROJECT, migrated.set)).toBe(true);
    clearLegacyDesign(PROJECT);

    expect(window.localStorage.getItem(legacyDesignStorageKey(PROJECT))).toBeNull();
    expect(loadDesignSet(PROJECT)).toEqual({ status: "restored", set: migrated.set });
  });

  it("prefers the v2 set over a legacy design", () => {
    const set = twoCanvasSet();
    expect(saveDesignSet(PROJECT, set)).toBe(true);
    window.localStorage.setItem(legacyDesignStorageKey(PROJECT), legacyPayload(savedDesign()));

    expect(loadDesignSet(PROJECT)).toEqual({ status: "restored", set });
  });

  it("falls back to the legacy design when the v2 set is invalid", () => {
    const root = savedDesign("Recovered heading");
    window.localStorage.setItem(designSetStorageKey(PROJECT), "{");
    window.localStorage.setItem(legacyDesignStorageKey(PROJECT), legacyPayload(root));

    const result = loadDesignSet(PROJECT);

    expect(result.status).toBe("migrated");
    expect(result.set.canvases[0].root).toEqual(root);
  });

  it("falls back to a starter canvas when both payloads are invalid", () => {
    window.localStorage.setItem(designSetStorageKey(PROJECT), "{");
    window.localStorage.setItem(legacyDesignStorageKey(PROJECT), "{");

    const result = loadDesignSet(PROJECT);

    expect(result.status).toBe("invalid");
    expect(result.set.canvases).toHaveLength(1);
    expect(result.set.canvases[0].root.kind).toBe("screen");
  });

  it("discards unknown payload and canvas fields", () => {
    const set = starterSet();
    const raw = JSON.stringify({
      version: 2,
      activeId: set.activeId,
      extra: "ignored",
      canvases: [
        {
          id: set.canvases[0].id,
          name: set.canvases[0].name,
          extra: "ignored",
          root: { ...set.canvases[0].root, extra: "ignored" },
        },
      ],
    });

    const parsed = parseDesignSet(raw);

    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("extra");
    expect(parsed?.canvases[0]).not.toHaveProperty("extra");
    expect(parsed?.canvases[0].root).not.toHaveProperty("extra");
  });

  it.each([
    ["malformed JSON", "{"],
    [
      "a legacy version",
      setPayload([rawCanvas(savedDesign(), "canvas-1", "Canvas 1")], "canvas-1", 1),
    ],
    ["an empty canvas list", setPayload([])],
    [
      "too many canvases",
      setPayload(
        Array.from({ length: MAX_CANVASES + 1 }, (_, index) =>
          rawCanvas(savedDesign(), `canvas-${index}`, `Canvas ${index}`),
        ),
      ),
    ],
    [
      "duplicate canvas IDs",
      setPayload([
        rawCanvas(savedDesign(), "canvas-1", "Canvas 1"),
        rawCanvas(savedDesign(), "canvas-1", "Canvas 2"),
      ]),
    ],
    [
      "duplicate canvas names",
      setPayload([
        rawCanvas(savedDesign(), "canvas-1", "Canvas 1"),
        rawCanvas(savedDesign(), "canvas-2", "canvas 1"),
      ]),
    ],
    ["an empty canvas name", setPayload([rawCanvas(savedDesign(), "canvas-1", "")])],
    ["an untrimmed canvas name", setPayload([rawCanvas(savedDesign(), "canvas-1", " Main")])],
    [
      "an oversized canvas name",
      setPayload([rawCanvas(savedDesign(), "canvas-1", "x".repeat(61))]),
    ],
    ["a missing active canvas", setPayload([rawCanvas(savedDesign())], "canvas-9")],
    ["a non-Screen root", setPayload([rawCanvas(rawNode("col-1", "column", BASE_PROPS))])],
    [
      "an unknown widget kind",
      setPayload([
        rawCanvas(
          rawNode("screen-1", "screen", BASE_PROPS, [rawNode("mystery-1", "mystery", BASE_PROPS)]),
        ),
      ]),
    ],
    [
      "a nested Screen",
      setPayload([
        rawCanvas(
          rawNode("screen-1", "screen", BASE_PROPS, [rawNode("screen-2", "screen", BASE_PROPS)]),
        ),
      ]),
    ],
    [
      "duplicate widget IDs",
      setPayload([
        rawCanvas(
          rawNode("screen-1", "screen", BASE_PROPS, [
            rawNode("text-1", "text", BASE_PROPS),
            rawNode("text-1", "text", BASE_PROPS),
          ]),
        ),
      ]),
    ],
    [
      "a negative gap",
      setPayload([
        rawCanvas(
          rawNode("screen-1", "screen", BASE_PROPS, [
            rawNode("col-1", "column", { ...BASE_PROPS, gap: -1 }),
          ]),
        ),
      ]),
    ],
    [
      "padding above the inspector limit",
      setPayload([
        rawCanvas(
          rawNode("screen-1", "screen", BASE_PROPS, [
            rawNode("box-1", "container", { ...BASE_PROPS, padding: 97 }),
          ]),
        ),
      ]),
    ],
    [
      "children on a leaf widget",
      setPayload([
        rawCanvas(
          rawNode("screen-1", "screen", BASE_PROPS, [
            rawNode("text-1", "text", BASE_PROPS, [rawNode("text-2", "text", BASE_PROPS)]),
          ]),
        ),
      ]),
    ],
    [
      "too many nodes",
      setPayload([
        rawCanvas(
          rawNode(
            "screen-1",
            "screen",
            BASE_PROPS,
            Array.from({ length: 1000 }, (_, index) =>
              rawNode(`text-${index}`, "text", { ...BASE_PROPS, content: "Leaf" }),
            ),
          ),
        ),
      ]),
    ],
    [
      "too much nesting",
      setPayload([rawCanvas(rawNode("screen-1", "screen", BASE_PROPS, [nestedColumns(51)]))]),
    ],
  ])("rejects %s", (_label, raw) => {
    expect(parseDesignSet(raw)).toBeNull();
    window.localStorage.setItem(designSetStorageKey(PROJECT), raw);
    expect(loadDesignSet(PROJECT).status).toBe("invalid");
  });

  it("advances the widget sequence past restored IDs", () => {
    const set = starterSet();
    const root = set.canvases[0].root;
    root.children[0].children[0].id = "text-9000";
    expect(saveDesignSet(PROJECT, set)).toBe(true);

    expect(loadDesignSet(PROJECT).status).toBe("restored");

    const next = createWidget("text");
    expect(next.id).not.toBe("text-9000");
    expect(Number(next.id.replace("text-", ""))).toBeGreaterThan(9000);
  });

  it("refuses to save a set that cannot be restored", () => {
    const set = starterSet();
    set.canvases[0].root.children[0].children[0].props.content = "x".repeat(10_001);

    expect(saveDesignSet(PROJECT, set)).toBe(false);
    expect(window.localStorage.getItem(designSetStorageKey(PROJECT))).toBeNull();
  });

  it("reports storage write failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(saveDesignSet(PROJECT, starterSet())).toBe(false);
  });

  it("reports storage read failures", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    const result = loadDesignSet(PROJECT);

    expect(result.status).toBe("unavailable");
    expect(result.set.canvases).toHaveLength(1);
  });

  it("ignores legacy cleanup failures", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    expect(() => clearLegacyDesign(PROJECT)).not.toThrow();
  });
});

function nestedColumns(depth: number) {
  let node = rawNode(`column-${depth}`, "column", { ...BASE_PROPS, gap: 0 });

  for (let index = depth - 1; index >= 1; index -= 1) {
    node = rawNode(`column-${index}`, "column", { ...BASE_PROPS, gap: 0 }, [node]);
  }

  return node;
}
