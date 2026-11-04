import { describe, expect, it } from "vitest";
import {
  createCanvasSet,
  createDesignCanvas,
  MAX_CANVASES,
  MAX_CANVAS_NAME_LENGTH,
  type DesignSet,
} from "./designSet";
import {
  addImportedCanvas,
  countCanvasNodes,
  defaultDesignFileName,
  importedCanvasName,
  MAX_DESIGN_FILE_BYTES,
  parseDesignFile,
  reidentifyDesignSet,
  serializeDesignFile,
} from "./designTransfer";
import { serializeDesignSet } from "./designStorage";
import { createWidget } from "./model";

function twoCanvasSet(): DesignSet {
  const first = createCanvasSet();
  const second = createDesignCanvas("Settings", createWidget("screen"));

  return { canvases: [first.canvases[0], second], activeId: second.id };
}

function rawFile(overrides: Record<string, unknown> = {}, design: unknown = null): string {
  const set = createCanvasSet();

  return JSON.stringify({
    format: "flutter-ui-studio-design",
    version: 1,
    scope: "project",
    exportedAt: "2026-11-04T12:00:00.000Z",
    projectName: "demo_app",
    design: design ?? JSON.parse(serializeDesignSet(set)),
    ...overrides,
  });
}

describe("design transfer", () => {
  it("round-trips a project export", () => {
    const set = twoCanvasSet();
    const raw = serializeDesignFile(set, "project", "demo_app", new Date("2026-11-04T12:00:00Z"));
    const result = parseDesignFile(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.file.scope).toBe("project");
    expect(result.file.projectName).toBe("demo_app");
    expect(result.file.exportedAt).toBe("2026-11-04T12:00:00.000Z");
    expect(result.file.set).toEqual(set);
    expect(result.file.canvasCount).toBe(2);
    expect(result.file.nodeCount).toBe(
      countCanvasNodes(set.canvases[0]) + countCanvasNodes(set.canvases[1]),
    );
  });

  it("round-trips a single-canvas export", () => {
    const set = createCanvasSet();
    const result = parseDesignFile(serializeDesignFile(set, "canvas", "demo_app"));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.file.scope).toBe("canvas");
    expect(result.file.canvasCount).toBe(1);
  });

  it.each([
    ["malformed JSON", "{"],
    ["a foreign format", rawFile({ format: "other" })],
    ["a future version", rawFile({ version: 2 })],
    ["an unknown scope", rawFile({ scope: "workspace" })],
    ["missing export metadata", rawFile({ exportedAt: 42 })],
    ["an invalid design", rawFile({}, { version: 2, activeId: "canvas-1", canvases: [] })],
  ])("rejects %s", (_label, raw) => {
    const result = parseDesignFile(raw);

    expect(result.ok).toBe(false);
  });

  it("rejects a canvas file with more than one canvas", () => {
    const result = parseDesignFile(
      rawFile({ scope: "canvas" }, JSON.parse(serializeDesignSet(twoCanvasSet()))),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/exactly one canvas/);
    }
  });

  it("rejects files above the byte limit", () => {
    const result = parseDesignFile("x".repeat(MAX_DESIGN_FILE_BYTES + 1));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/2 MB/);
    }
  });

  it("sanitises export file names", () => {
    expect(defaultDesignFileName("demo app", "Home", "project")).toBe("demo-app-project.json");
    expect(defaultDesignFileName("demo", "Home/Settings", "canvas")).toBe(
      "Home-Settings-canvas.json",
    );
    expect(defaultDesignFileName("", "", "project")).toBe("design-project.json");
  });

  it("re-identifies imported designs and preserves the active index", () => {
    const set = twoCanvasSet();
    const reidentified = reidentifyDesignSet(set);

    expect(reidentified.canvases.map((canvas) => canvas.name)).toEqual(["Canvas 1", "Settings"]);
    expect(reidentified.activeId).toBe(reidentified.canvases[1].id);
    expect(reidentified.canvases[0].id).not.toBe(set.canvases[0].id);
    expect(reidentified.canvases[0].root.id).not.toBe(set.canvases[0].root.id);
  });

  it("adds an imported canvas after the active canvas with fresh ids", () => {
    const set = twoCanvasSet();
    const imported = createDesignCanvas("Home", createWidget("screen"));
    const next = addImportedCanvas(set, imported);

    expect(next).not.toBeNull();
    if (!next) {
      return;
    }

    expect(next.canvases).toHaveLength(3);
    expect(next.canvases[2].name).toBe("Home");
    expect(next.activeId).toBe(next.canvases[2].id);
    expect(next.canvases[2].root.id).not.toBe(imported.root.id);
  });

  it("names conflicting canvas imports uniquely", () => {
    const set = createCanvasSet();
    const imported = createDesignCanvas("Canvas 1", createWidget("screen"));
    const first = addImportedCanvas(set, imported);

    expect(first).not.toBeNull();
    if (!first) {
      return;
    }

    const second = addImportedCanvas(first, createDesignCanvas("Canvas 1", createWidget("screen")));
    expect(second?.canvases.map((canvas) => canvas.name)).toEqual([
      "Canvas 1",
      "Canvas 1 (imported)",
      "Canvas 1 (imported 2)",
    ]);
  });

  it("keeps imported names within the name limit", () => {
    const longName = "x".repeat(MAX_CANVAS_NAME_LENGTH);
    const set = {
      ...createCanvasSet(),
      canvases: [createDesignCanvas(longName, createWidget("screen"))],
    };
    set.activeId = set.canvases[0].id;

    const name = importedCanvasName(set.canvases, longName);

    expect(name.length).toBeLessThanOrEqual(MAX_CANVAS_NAME_LENGTH);
    expect(name).toMatch(/ \(imported\)$/);
  });

  it("refuses canvas imports at the canvas limit", () => {
    const canvas = createDesignCanvas("Canvas 1", createWidget("screen"));
    const set: DesignSet = {
      canvases: Array.from({ length: MAX_CANVASES }, (_, index) => ({
        ...canvas,
        id: `canvas-${index + 1}`,
        name: `Canvas ${index + 1}`,
      })),
      activeId: "canvas-1",
    };

    expect(addImportedCanvas(set, canvas)).toBeNull();
  });

  it("counts nodes without recursion overflow", () => {
    const canvas = createDesignCanvas("Deep", createWidget("screen"));
    let parent = canvas.root;

    for (let index = 0; index < 40; index += 1) {
      const child = createWidget("column");
      parent.children = [child];
      parent = child;
    }

    expect(countCanvasNodes(canvas)).toBe(41);
  });
});
