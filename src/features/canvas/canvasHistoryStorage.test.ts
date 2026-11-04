import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canvasHistoryStorageKey,
  createCanvasHistoryEntry,
  loadCanvasHistories,
  MAX_HISTORY_BYTES,
  MAX_PERSISTED_FUTURE,
  MAX_PERSISTED_PAST,
  parseCanvasHistories,
  rootFingerprint,
  saveCanvasHistories,
  serializeCanvasHistories,
  type CanvasHistoryMap,
} from "./canvasHistoryStorage";
import { createWidget, type CanvasNode, type CanvasSnapshot } from "./model";

const PROJECT = "C:\\Projects\\demo_app";

function rootWithText(content = "Saved"): CanvasNode {
  const screen = createWidget("screen");
  const column = createWidget("column");
  column.children = [createWidget("text", { content })];
  screen.children = [column];
  return screen;
}

function snapshot(root: CanvasNode, selectedIds: string[] = [], anchorId: string | null = null) {
  return { root, selectedIds, anchorId } satisfies CanvasSnapshot;
}

function history(entry: ReturnType<typeof createCanvasHistoryEntry>): CanvasHistoryMap {
  return new Map([["canvas-1", entry!]]);
}

describe("canvas history storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("round-trips history for a matching root", () => {
    const root = rootWithText();
    const previous = rootWithText("Previous");
    const entry = createCanvasHistoryEntry(root, {
      past: [snapshot(previous, [previous.children[0].children[0].id])],
      future: [snapshot(root)],
    });

    expect(entry).not.toBeNull();

    const raw = serializeCanvasHistories(history(entry));
    expect(raw).not.toBeNull();

    const parsed = parseCanvasHistories(raw!, [{ id: "canvas-1", root }]);
    const restored = parsed.get("canvas-1");

    expect(restored?.past).toHaveLength(1);
    expect(restored?.past[0].root.children[0].children[0].props.content).toBe("Previous");
    expect(restored?.future).toHaveLength(1);
    expect(restored?.rootFingerprint).toBe(rootFingerprint(root));
  });

  it("drops history whose root fingerprint no longer matches", () => {
    const root = rootWithText();
    const changed = rootWithText("Changed");
    const entry = createCanvasHistoryEntry(root, {
      past: [snapshot(rootWithText("Previous"))],
      future: [],
    });
    const raw = serializeCanvasHistories(history(entry));

    expect(parseCanvasHistories(raw!, [{ id: "canvas-1", root: changed }]).size).toBe(0);
  });

  it("filters stale selection ids when restoring snapshots", () => {
    const root = rootWithText();
    const previous = rootWithText("Previous");
    const textId = previous.children[0].children[0].id;
    const entry = createCanvasHistoryEntry(root, {
      past: [snapshot(previous, ["missing", textId], "missing")],
      future: [],
    });
    const raw = serializeCanvasHistories(history(entry));
    const restored = parseCanvasHistories(raw!, [{ id: "canvas-1", root }]).get("canvas-1");

    expect(restored?.past[0].selectedIds).toEqual([textId]);
    expect(restored?.past[0].anchorId).toBe(textId);
  });

  it("ignores malformed payloads and invalid snapshots", () => {
    const root = rootWithText();

    expect(parseCanvasHistories("{", [{ id: "canvas-1", root }]).size).toBe(0);
    expect(
      parseCanvasHistories(JSON.stringify({ version: 2, entries: {} }), [{ id: "canvas-1", root }])
        .size,
    ).toBe(0);

    const raw = JSON.stringify({
      version: 1,
      entries: {
        "canvas-1": {
          rootFingerprint: rootFingerprint(root),
          past: [{ root: { id: "broken" }, selectedIds: [], anchorId: null }],
          future: [],
        },
      },
    });

    expect(parseCanvasHistories(raw, [{ id: "canvas-1", root }]).size).toBe(0);
  });

  it("returns null entries for empty history and caps stored snapshots", () => {
    const root = rootWithText();
    const empty = createCanvasHistoryEntry(root, { past: [], future: [] });
    const snapshots = Array.from({ length: MAX_PERSISTED_PAST + 12 }, (_, index) =>
      snapshot(rootWithText(`Step ${index}`)),
    );
    const futures = Array.from({ length: MAX_PERSISTED_FUTURE + 8 }, () => snapshot(root));
    const entry = createCanvasHistoryEntry(root, { past: snapshots, future: futures });

    expect(empty).toBeNull();
    expect(entry?.past).toHaveLength(MAX_PERSISTED_PAST);
    expect(entry?.future).toHaveLength(MAX_PERSISTED_FUTURE);
    expect(entry?.past[0].root.children[0].children[0].props.content).toBe("Step 12");
  });

  it("trims serialized history to the size ceiling", () => {
    const root = rootWithText();
    const entries: CanvasHistoryMap = new Map();

    for (let canvasIndex = 0; canvasIndex < 3; canvasIndex += 1) {
      const past = Array.from({ length: MAX_PERSISTED_PAST }, () =>
        snapshot(rootWithText("x".repeat(10_000))),
      );
      entries.set(`canvas-${canvasIndex}`, {
        rootFingerprint: rootFingerprint(root),
        past,
        future: [],
      });
    }

    const raw = serializeCanvasHistories(entries);
    expect(raw).not.toBeNull();
    expect(new TextEncoder().encode(raw!).length).toBeLessThanOrEqual(MAX_HISTORY_BYTES);
  });

  it("saves and loads alongside the project storage key", () => {
    const root = rootWithText();
    const entry = createCanvasHistoryEntry(root, {
      past: [snapshot(rootWithText("Previous"))],
      future: [],
    });

    expect(saveCanvasHistories(PROJECT, history(entry))).toBe(true);
    expect(window.localStorage.getItem(canvasHistoryStorageKey(PROJECT))).not.toBeNull();
    expect(loadCanvasHistories(PROJECT, [{ id: "canvas-1", root }]).size).toBe(1);

    expect(saveCanvasHistories(PROJECT, new Map())).toBe(true);
    expect(window.localStorage.getItem(canvasHistoryStorageKey(PROJECT))).toBeNull();
  });

  it("treats unavailable storage as empty history", () => {
    const root = rootWithText();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadCanvasHistories(PROJECT, [{ id: "canvas-1", root }]).size).toBe(0);
    vi.restoreAllMocks();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(
      saveCanvasHistories(
        PROJECT,
        history(
          createCanvasHistoryEntry(root, {
            past: [snapshot(root)],
            future: [],
          }),
        ),
      ),
    ).toBe(false);
  });

  it("produces stable fingerprints for equal trees", () => {
    const root = rootWithText();
    const same = JSON.parse(JSON.stringify(root)) as CanvasNode;
    const other = rootWithText("Other");

    expect(rootFingerprint(root)).toBe(rootFingerprint(same));
    expect(rootFingerprint(root)).not.toBe(rootFingerprint(other));
  });
});
