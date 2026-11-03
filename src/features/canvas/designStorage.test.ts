import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  designStorageKey,
  loadDesign,
  parseDesign,
  saveDesign,
  serializeDesign,
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

function savedDesign(): CanvasNode {
  const screen = createWidget("screen");
  const column = createWidget("column");
  column.children = [createWidget("text", { content: "Saved heading" })];
  screen.children = [column];
  return screen;
}

function payload(root: unknown, version = 1): string {
  return JSON.stringify({ version, root });
}

function rawNode(id: string, kind: string, props: WidgetProps, children: unknown[] = []) {
  return { id, kind, props, children };
}

describe("design storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a design through serialisation", () => {
    const root = savedDesign();

    expect(parseDesign(serializeDesign(root))).toEqual(root);
  });

  it("reports a missing design", () => {
    expect(loadDesign(PROJECT)).toEqual({ status: "missing", root: null });
  });

  it("saves and restores a design for one project only", () => {
    const root = savedDesign();

    expect(saveDesign(PROJECT, root)).toBe(true);
    expect(loadDesign(PROJECT)).toEqual({ status: "restored", root });
    expect(loadDesign(OTHER_PROJECT)).toEqual({ status: "missing", root: null });
  });

  it("uses a distinct encoded key per project path", () => {
    expect(designStorageKey(PROJECT)).toContain(encodeURIComponent(PROJECT));
    expect(designStorageKey(PROJECT)).not.toBe(designStorageKey(OTHER_PROJECT));
  });

  it("discards unknown payload fields", () => {
    const root = savedDesign();
    const raw = JSON.stringify({
      version: 1,
      extra: "ignored",
      root: { ...root, extra: "ignored", props: { ...root.props, extra: "ignored" } },
    });

    const parsed = parseDesign(raw);

    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("extra");
    expect(parsed?.props).not.toHaveProperty("extra");
  });

  it.each([
    ["malformed JSON", "{"],
    ["a future version", payload(savedDesign(), 2)],
    ["a non-Screen root", payload(rawNode("col-1", "column", BASE_PROPS))],
    [
      "an unknown widget kind",
      payload(
        rawNode("screen-1", "screen", BASE_PROPS, [rawNode("mystery-1", "mystery", BASE_PROPS)]),
      ),
    ],
    [
      "a nested Screen",
      payload(
        rawNode("screen-1", "screen", BASE_PROPS, [rawNode("screen-2", "screen", BASE_PROPS)]),
      ),
    ],
    [
      "duplicate widget IDs",
      payload(
        rawNode("screen-1", "screen", BASE_PROPS, [
          rawNode("text-1", "text", BASE_PROPS),
          rawNode("text-1", "text", BASE_PROPS),
        ]),
      ),
    ],
    [
      "a negative gap",
      payload(
        rawNode("screen-1", "screen", BASE_PROPS, [
          rawNode("col-1", "column", { ...BASE_PROPS, gap: -1 }),
        ]),
      ),
    ],
    [
      "padding above the inspector limit",
      payload(
        rawNode("screen-1", "screen", BASE_PROPS, [
          rawNode("box-1", "container", { ...BASE_PROPS, padding: 97 }),
        ]),
      ),
    ],
    [
      "children on a leaf widget",
      payload(
        rawNode("screen-1", "screen", BASE_PROPS, [
          rawNode("text-1", "text", BASE_PROPS, [rawNode("text-2", "text", BASE_PROPS)]),
        ]),
      ),
    ],
    [
      "too many nodes",
      payload(
        rawNode(
          "screen-1",
          "screen",
          BASE_PROPS,
          Array.from({ length: 1000 }, (_, index) =>
            rawNode(`text-${index}`, "text", { ...BASE_PROPS, content: "Leaf" }),
          ),
        ),
      ),
    ],
    ["too much nesting", payload(rawNode("screen-1", "screen", BASE_PROPS, [nestedColumns(51)]))],
  ])("rejects %s", (_label, raw) => {
    expect(parseDesign(raw)).toBeNull();
    window.localStorage.setItem(designStorageKey(PROJECT), raw);
    expect(loadDesign(PROJECT)).toEqual({ status: "invalid", root: null });
  });

  it("reports invalid JSON from storage without throwing", () => {
    window.localStorage.setItem(designStorageKey(PROJECT), "{");

    expect(loadDesign(PROJECT)).toEqual({ status: "invalid", root: null });
  });

  it("advances the widget sequence past restored IDs", () => {
    const root = savedDesign();
    const text = root.children[0].children[0];
    text.id = "text-9000";
    expect(saveDesign(PROJECT, root)).toBe(true);

    expect(loadDesign(PROJECT).status).toBe("restored");

    const next = createWidget("text");
    expect(next.id).not.toBe("text-9000");
    expect(Number(next.id.replace("text-", ""))).toBeGreaterThan(9000);
  });

  it("refuses to save a design that cannot be restored", () => {
    const root = savedDesign();
    root.children[0].children[0].props.content = "x".repeat(10_001);

    expect(saveDesign(PROJECT, root)).toBe(false);
    expect(window.localStorage.getItem(designStorageKey(PROJECT))).toBeNull();
  });

  it("reports storage write failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(saveDesign(PROJECT, savedDesign())).toBe(false);
  });

  it("reports storage read failures", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    expect(loadDesign(PROJECT)).toEqual({ status: "unavailable", root: null });
  });
});

function nestedColumns(depth: number) {
  let node = rawNode(`column-${depth}`, "column", { ...BASE_PROPS, gap: 0 });

  for (let index = depth - 1; index >= 1; index -= 1) {
    node = rawNode(`column-${index}`, "column", { ...BASE_PROPS, gap: 0 }, [node]);
  }

  return node;
}
