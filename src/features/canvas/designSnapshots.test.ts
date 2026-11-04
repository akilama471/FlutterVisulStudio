import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvasSet, type DesignSet } from "./designSet";
import {
  addDesignSnapshot,
  clearDesignSnapshots,
  createDesignSnapshot,
  loadDesignSnapshots,
  MAX_SNAPSHOTS,
  MAX_SNAPSHOT_BYTES,
  MAX_SNAPSHOT_TOTAL_BYTES,
  parseDesignSnapshots,
  recordDesignSnapshot,
  saveDesignSnapshots,
  shouldCaptureAutoSnapshot,
  snapshotStorageKey,
  summarizeSnapshots,
  type DesignSnapshot,
} from "./designSnapshots";
import { serializeDesignSet } from "./designStorage";
import { createWidget } from "./model";

const PROJECT = "C:\\Projects\\demo_app";
const OTHER_PROJECT = "C:\\Projects\\other_app";

function withContent(content: string): DesignSet {
  const set = createCanvasSet();
  set.canvases[0].root.children[0].children = [createWidget("text", { content })];

  return set;
}

function fakeSnapshot(overrides: Partial<DesignSnapshot> = {}): DesignSnapshot {
  return {
    id: "snap-1",
    createdAt: 1_000,
    reason: "auto",
    bytes: 100,
    set: createCanvasSet(),
    ...overrides,
  };
}

function payload(entries: unknown[], version = 1): string {
  return JSON.stringify({ version, entries });
}

function entry(overrides: Record<string, unknown> = {}, design: unknown = null) {
  return {
    id: "snap-1",
    createdAt: 1_000,
    reason: "auto",
    bytes: 100,
    design: design ?? JSON.parse(serializeDesignSet(createCanvasSet())),
    ...overrides,
  };
}

describe("design snapshots", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("creates a snapshot with a stable id and a byte count", () => {
    const set = createCanvasSet();
    const snapshot = createDesignSnapshot(set, "auto", 5_000);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.id).toBe("snap-5000");
    expect(snapshot?.bytes).toBe(new TextEncoder().encode(serializeDesignSet(set)).length);
    expect(snapshot?.set).toEqual(set);
  });

  it("avoids duplicate ids created at the same instant", () => {
    const first = createDesignSnapshot(createCanvasSet(), "auto", 5_000);
    const second = createDesignSnapshot(createCanvasSet(), "auto", 5_000, [first?.id ?? ""]);

    expect(second?.id).toBe("snap-5000-1");
  });

  it("refuses snapshots above the per-entry limit", () => {
    const small = createCanvasSet();
    const big = createCanvasSet();
    big.canvases[0].root.children[0].children = Array.from({ length: 30 }, () =>
      createWidget("text", { content: "x".repeat(10_000) }),
    );

    expect(createDesignSnapshot(big, "auto", 1_000)).toBeNull();
    expect(createDesignSnapshot(small, "auto", 1_000)?.bytes).toBeLessThan(MAX_SNAPSHOT_BYTES);
  });

  it("rotates snapshots to the entry limit", () => {
    let snapshots: DesignSnapshot[] = [];

    for (let index = 0; index < MAX_SNAPSHOTS + 3; index += 1) {
      snapshots = addDesignSnapshot(
        snapshots,
        fakeSnapshot({ id: `snap-${index}`, createdAt: index }),
      );
    }

    expect(snapshots).toHaveLength(MAX_SNAPSHOTS);
    expect(snapshots[0].id).toBe(`snap-${MAX_SNAPSHOTS + 2}`);
    expect(snapshots.at(-1)?.id).toBe("snap-3");
  });

  it("drops the oldest snapshots when the total byte limit is reached", () => {
    const snapshots = addDesignSnapshot(
      [fakeSnapshot({ id: "older", bytes: 700_000 })],
      fakeSnapshot({ id: "newer", bytes: 700_000 }),
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].id).toBe("newer");
    expect(snapshots[0].bytes).toBeLessThan(MAX_SNAPSHOT_TOTAL_BYTES);
  });

  it("captures the first snapshot and then waits for changes and the interval", () => {
    const set = createCanvasSet();

    expect(shouldCaptureAutoSnapshot([], set, 1_000)).toBe(true);

    const recent = [fakeSnapshot({ createdAt: 1_000, set })];
    expect(shouldCaptureAutoSnapshot(recent, set, 1_100)).toBe(false);
    expect(shouldCaptureAutoSnapshot(recent, withContent("changed"), 1_100)).toBe(false);
    expect(shouldCaptureAutoSnapshot(recent, withContent("changed"), 70_000)).toBe(true);
    expect(shouldCaptureAutoSnapshot(recent, set, 70_000)).toBe(false);
  });

  it("skips automatic snapshots for an unchanged design inside the interval", () => {
    const set = createCanvasSet();
    const first = recordDesignSnapshot(PROJECT, [], set, "auto", 1_000);

    expect(first).toHaveLength(1);
    expect(recordDesignSnapshot(PROJECT, first ?? [], set, "auto", 1_100)).toBeNull();
  });

  it("always captures before a destructive action", () => {
    const set = createCanvasSet();
    const first = recordDesignSnapshot(PROJECT, [], set, "auto", 1_000);
    const second = recordDesignSnapshot(PROJECT, first ?? [], set, "before-import", 1_100);

    expect(second).toHaveLength(2);
    expect(second?.[0].reason).toBe("before-import");
  });

  it("round-trips snapshots through localStorage", () => {
    const set = withContent("Saved");
    const snapshots = recordDesignSnapshot(PROJECT, [], set, "auto", 1_000) ?? [];

    expect(saveDesignSnapshots(PROJECT, snapshots)).toBe(true);
    expect(loadDesignSnapshots(PROJECT)).toEqual(snapshots);
    expect(loadDesignSnapshots(OTHER_PROJECT)).toEqual([]);
    expect(snapshotStorageKey(PROJECT)).toContain(encodeURIComponent(PROJECT));
  });

  it("skips corrupt entries but keeps valid ones", () => {
    const raw = payload([
      entry(),
      entry({ id: "snap-bad-design" }, { version: 2, activeId: "missing", canvases: [] }),
      entry({ id: "snap-bad-reason", reason: "manual" }),
      entry({ id: "snap-2", createdAt: 2_000 }),
    ]);

    const snapshots = parseDesignSnapshots(raw);
    const ids = snapshots.map((snapshot) => snapshot.id);

    expect(ids).toEqual(["snap-2", "snap-1"]);
  });

  it("ignores a wrong payload version or malformed JSON", () => {
    expect(parseDesignSnapshots(payload([entry()], 2))).toEqual([]);
    expect(parseDesignSnapshots("{")).toEqual([]);
  });

  it("recomputes byte counts while loading", () => {
    const snapshots = parseDesignSnapshots(payload([entry({ bytes: 1 })]));

    expect(snapshots[0].bytes).toBeGreaterThan(1);
  });

  it("summarises snapshots for the restore browser", () => {
    const snapshot = fakeSnapshot({ set: withContent("Summary") });

    expect(summarizeSnapshots([snapshot])).toEqual([
      {
        id: snapshot.id,
        createdAt: snapshot.createdAt,
        reason: snapshot.reason,
        bytes: snapshot.bytes,
        canvasCount: 1,
      },
    ]);
  });

  it("clears snapshots and tolerates storage failures", () => {
    const snapshots = recordDesignSnapshot(PROJECT, [], createCanvasSet(), "auto", 1_000) ?? [];
    expect(loadDesignSnapshots(PROJECT)).toHaveLength(1);

    clearDesignSnapshots(PROJECT);
    expect(loadDesignSnapshots(PROJECT)).toEqual([]);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    expect(loadDesignSnapshots(PROJECT)).toEqual([]);
    expect(saveDesignSnapshots(PROJECT, snapshots)).toBe(false);
    expect(() => clearDesignSnapshots(PROJECT)).not.toThrow();
  });
});
