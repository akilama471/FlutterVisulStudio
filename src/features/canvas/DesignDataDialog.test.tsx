import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasList } from "./CanvasList";
import { CanvasUndoToast } from "./CanvasUndoToast";
import { createCanvasSet, createDesignCanvas } from "./designSet";
import { loadDesignSet, saveDesignSet } from "./designStorage";
import { createDesignSnapshot, loadDesignSnapshots, saveDesignSnapshots } from "./designSnapshots";
import { DesignWorkspaceProvider } from "./DesignWorkspaceProvider";
import { useDesignWorkspace } from "./designWorkspaceContext";
import { parseDesignFile, serializeDesignFile } from "./designTransfer";
import { createWidget } from "./model";

const {
  chooseExportMock,
  chooseImportMock,
  readImportMock,
  readProjectMock,
  writeExportMock,
  writeProjectMock,
} = vi.hoisted(() => ({
  chooseExportMock: vi.fn(),
  chooseImportMock: vi.fn(),
  readImportMock: vi.fn(),
  readProjectMock: vi.fn(),
  writeExportMock: vi.fn(),
  writeProjectMock: vi.fn(),
}));

vi.mock("../../shared/lib/designFiles", () => ({
  chooseDesignExportPath: chooseExportMock,
  chooseDesignImportPath: chooseImportMock,
  readDesignImportFile: readImportMock,
  readProjectDesignFile: readProjectMock,
  writeDesignExportFile: writeExportMock,
  writeProjectDesignFile: writeProjectMock,
  designFileErrorMessage: (error: unknown, fallback = "The design file could not be used.") =>
    typeof error === "string" ? error : error instanceof Error ? error.message : fallback,
}));

const PROJECT = {
  name: "demo_app",
  path: "C:\\Projects\\demo_app",
  entryPoint: "lib/main.dart",
};

function twoCanvasSet() {
  const first = createCanvasSet();
  const second = createDesignCanvas("Imported", createWidget("screen"));

  return { canvases: [first.canvases[0], second], activeId: second.id };
}

function designFile(scope: "project" | "canvas"): string {
  const source = createCanvasSet();
  const imported = createDesignCanvas("Imported", createWidget("screen"));
  const set =
    scope === "project"
      ? { canvases: [source.canvases[0], imported], activeId: imported.id }
      : { canvases: [imported], activeId: imported.id };

  return serializeDesignFile(set, scope, "source_app");
}

function Probe() {
  const { canvases, activeCanvas } = useDesignWorkspace();

  return (
    <div>
      <span data-testid="canvas-count">{canvases.length}</span>
      <span data-testid="active-canvas">{activeCanvas.name}</span>
      <span data-testid="canvas-names">{canvases.map((canvas) => canvas.name).join("|")}</span>
    </div>
  );
}

function renderWorkspace() {
  const user = userEvent.setup();
  render(
    <DesignWorkspaceProvider project={PROJECT}>
      <CanvasList />
      <CanvasUndoToast />
      <Probe />
    </DesignWorkspaceProvider>,
  );

  return user;
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Design data" }));
  return screen.getByRole("dialog", { name: "Design data" });
}

describe("DesignDataDialog", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    chooseExportMock.mockReset();
    chooseImportMock.mockReset();
    readImportMock.mockReset();
    readProjectMock.mockReset();
    writeExportMock.mockReset();
    writeProjectMock.mockReset();
  });

  it("shows storage sections and canvas sizes", async () => {
    const user = renderWorkspace();
    const dialog = await openDialog(user);

    expect(within(dialog).getByRole("heading", { name: "Export" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Import" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Project file" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Snapshots" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Storage" })).toBeInTheDocument();
    expect(within(dialog).getByText("Canvas 1")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /Delete Canvas 1 from storage/ }),
    ).toBeDisabled();
    expect(within(dialog).getByText("4 widgets ·", { exact: false })).toBeInTheDocument();
  });

  it("exports the project through the save dialog", async () => {
    chooseExportMock.mockResolvedValue("C:\\Designs\\demo.json");
    writeExportMock.mockResolvedValue({
      path: "C:\\Designs\\demo.json",
      backupPath: null,
      bytes: 120,
      modifiedMs: 5,
    });

    const user = renderWorkspace();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Export project" }));

    await waitFor(() => {
      expect(writeExportMock).toHaveBeenCalledTimes(1);
    });

    const [path, contents] = writeExportMock.mock.calls[0] as [string, string, null];
    expect(path).toBe("C:\\Designs\\demo.json");
    const parsed = parseDesignFile(contents);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.file.scope).toBe("project");
      expect(parsed.file.projectName).toBe("demo_app");
    }
    expect(within(dialog).getByRole("status")).toHaveTextContent("Exported 1 canvas");
  });

  it("exports only the active canvas", async () => {
    chooseExportMock.mockResolvedValue("C:\\Designs\\canvas.json");
    writeExportMock.mockResolvedValue({
      path: "C:\\Designs\\canvas.json",
      backupPath: null,
      bytes: 80,
      modifiedMs: 5,
    });

    const user = renderWorkspace();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Export active canvas" }));

    await waitFor(() => {
      expect(writeExportMock).toHaveBeenCalledTimes(1);
    });

    const parsed = parseDesignFile(writeExportMock.mock.calls[0][1] as string);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.file.scope).toBe("canvas");
      expect(parsed.file.canvasCount).toBe(1);
    }
  });

  it("previews a project import before replacing the design", async () => {
    chooseImportMock.mockResolvedValue("C:\\Designs\\source.json");
    readImportMock.mockResolvedValue({
      path: "C:\\Designs\\source.json",
      contents: designFile("project"),
      bytes: 100,
      modifiedMs: 5,
    });

    const user = renderWorkspace();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Choose design file…" }));

    await waitFor(() => {
      expect(within(dialog).getByText(/Replace this design with 2 canvases/)).toBeInTheDocument();
    });
    expect(screen.getByTestId("canvas-count")).toHaveTextContent("1");

    await user.click(within(dialog).getByRole("button", { name: "Import and replace" }));

    expect(screen.getByTestId("canvas-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-canvas")).toHaveTextContent("Imported");
    expect(within(dialog).getByRole("status")).toHaveTextContent("Imported 2 canvases");
    expect(loadDesignSnapshots(PROJECT.path).length).toBeGreaterThanOrEqual(1);
  });

  it("adds an imported canvas without replacing the project", async () => {
    chooseImportMock.mockResolvedValue("C:\\Designs\\canvas.json");
    readImportMock.mockResolvedValue({
      path: "C:\\Designs\\canvas.json",
      contents: designFile("canvas"),
      bytes: 80,
      modifiedMs: 5,
    });

    const user = renderWorkspace();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Choose design file…" }));

    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Add canvas" })).toBeInTheDocument();
    });

    await user.click(within(dialog).getByRole("button", { name: "Add canvas" }));

    expect(screen.getByTestId("canvas-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-canvas")).toHaveTextContent("Imported");
    expect(within(dialog).getByRole("status")).toHaveTextContent("Added “Imported”");
  });

  it("reports invalid import files without changing the design", async () => {
    chooseImportMock.mockResolvedValue("C:\\Designs\\broken.json");
    readImportMock.mockResolvedValue({
      path: "C:\\Designs\\broken.json",
      contents: "{",
      bytes: 20,
      modifiedMs: 5,
    });

    const user = renderWorkspace();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Choose design file…" }));

    await waitFor(() => {
      expect(within(dialog).getByRole("alert")).toHaveTextContent("not valid JSON");
    });
    expect(screen.getByTestId("canvas-count")).toHaveTextContent("1");
  });

  it("writes and reads the project design file", async () => {
    writeProjectMock.mockResolvedValue({
      relativePath: ".flutter-ui-studio/design.json",
      backupPath: ".flutter-ui-studio/design.json.bak",
      bytes: 100,
      modifiedMs: 5,
    });
    readProjectMock.mockResolvedValue({
      relativePath: ".flutter-ui-studio/design.json",
      contents: designFile("project"),
      bytes: 100,
      modifiedMs: 5,
    });

    const user = renderWorkspace();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole("button", { name: "Write to project" }));
    await waitFor(() => {
      expect(within(dialog).getByRole("status")).toHaveTextContent("design.json.bak");
    });

    await user.click(within(dialog).getByRole("button", { name: "Read from project" }));
    await waitFor(() => {
      expect(within(dialog).getByText(/Replace this design with 2 canvases/)).toBeInTheDocument();
    });
    expect(within(dialog).getByRole("heading", { name: "Project file" })).toBeInTheDocument();
  });

  it("restores a snapshot after confirmation", async () => {
    const current = createCanvasSet();
    const previous = createCanvasSet();
    previous.canvases[0].name = "Earlier";
    saveDesignSet(PROJECT.path, current);
    const snapshot = createDesignSnapshot(previous, "auto", 1_000);
    expect(snapshot).not.toBeNull();
    if (snapshot) {
      saveDesignSnapshots(PROJECT.path, [snapshot]);
    }

    const user = renderWorkspace();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Browse snapshots" }));

    expect(within(dialog).getByRole("button", { name: "Restore" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Restore" }));
    await user.click(within(dialog).getByRole("button", { name: "Restore snapshot" }));

    expect(screen.getByTestId("active-canvas")).toHaveTextContent("Earlier");
    expect(within(dialog).getByRole("status")).toHaveTextContent("Snapshot restored");
    expect(loadDesignSnapshots(PROJECT.path).length).toBeGreaterThanOrEqual(2);
  });

  it("deletes one canvas from storage management", async () => {
    const set = twoCanvasSet();
    saveDesignSet(PROJECT.path, set);

    const user = renderWorkspace();
    const dialog = await openDialog(user);
    expect(screen.getByTestId("canvas-count")).toHaveTextContent("2");

    await user.click(within(dialog).getByRole("button", { name: /Delete Canvas 1 from storage/ }));

    expect(screen.getByTestId("canvas-count")).toHaveTextContent("1");
    expect(within(dialog).getByRole("status")).toHaveTextContent("Deleted “Canvas 1”");
  });

  it("resets the project design but keeps snapshots", async () => {
    const set = twoCanvasSet();
    saveDesignSet(PROJECT.path, set);
    const snapshot = createDesignSnapshot(set, "auto", 1_000);
    if (snapshot) {
      saveDesignSnapshots(PROJECT.path, [snapshot]);
    }

    const user = renderWorkspace();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Reset project design" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Reset this project");
    await user.click(within(dialog).getByRole("button", { name: "Reset project design" }));

    expect(screen.getByTestId("canvas-count")).toHaveTextContent("1");
    expect(within(dialog).getByRole("status")).toHaveTextContent("Snapshots were kept");
    expect(loadDesignSnapshots(PROJECT.path).length).toBeGreaterThanOrEqual(1);

    await waitFor(() => {
      expect(loadDesignSet(PROJECT.path).set.canvases).toHaveLength(1);
    });
  });

  it("closes with Escape and restores the trigger focus", async () => {
    const user = renderWorkspace();
    await openDialog(user);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Design data" })).toHaveFocus();
  });
});
