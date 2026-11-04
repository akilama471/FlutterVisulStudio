import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasList } from "./CanvasList";
import { CanvasUndoToast } from "./CanvasUndoToast";
import { createCanvasSet } from "./designSet";
import { loadDesignSet, saveDesignSet } from "./designStorage";
import { DesignWorkspaceProvider } from "./DesignWorkspaceProvider";
import { useDesignWorkspace } from "./designWorkspaceContext";
import { createWidget } from "./model";

const PROJECT = {
  name: "demo_app",
  path: "C:\\Projects\\demo_app",
  entryPoint: "lib/main.dart",
};

function fakeDataTransfer(): DataTransfer {
  const data = new Map<string, string>();

  return {
    dropEffect: "none",
    effectAllowed: "uninitialized",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: () => undefined,
    getData: (format: string) => data.get(format) ?? "",
    setData: (format: string, value: string) => {
      data.set(format, value);
    },
    setDragImage: () => undefined,
  } as DataTransfer;
}

function mockRowRect(row: Element): void {
  vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 300,
    bottom: 28,
    width: 300,
    height: 28,
    toJSON: () => ({}),
  });
}

function fireDrag(
  type: "dragover" | "drop",
  element: Element,
  clientY: number,
  dataTransfer: DataTransfer,
): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  fireEvent(element, event);
}

function rowFor(name: string): HTMLLIElement {
  const row = screen.getByRole("button", { name }).closest("li");
  if (!row) {
    throw new Error(`Missing canvas row for ${name}`);
  }
  return row as HTMLLIElement;
}

function ActiveCanvasProbe() {
  const { activeCanvas, canvases } = useDesignWorkspace();

  return (
    <div>
      <span data-testid="active-canvas">{activeCanvas.name}</span>
      <span data-testid="canvas-count">{canvases.length}</span>
    </div>
  );
}

function renderList() {
  return render(
    <DesignWorkspaceProvider project={PROJECT}>
      <CanvasList />
      <ActiveCanvasProbe />
      <CanvasUndoToast />
    </DesignWorkspaceProvider>,
  );
}

describe("CanvasList", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("lists the starter canvas and creates a new active canvas", async () => {
    const user = userEvent.setup();
    renderList();

    expect(screen.getByTestId("canvas-count")).toHaveTextContent("1");
    expect(screen.getByTestId("active-canvas")).toHaveTextContent("Canvas 1");
    expect(screen.getByRole("button", { name: "Canvas 1" })).toHaveAttribute(
      "aria-current",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "New canvas" }));

    expect(screen.getByTestId("canvas-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-canvas")).toHaveTextContent("Canvas 2");
    expect(screen.getByRole("button", { name: "Canvas 2" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("renames a canvas and validates the new name", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "New canvas" }));
    await user.click(screen.getByRole("button", { name: "Rename Canvas 2" }));

    const dialog = screen.getByRole("dialog", { name: "Rename canvas" });
    const input = within(dialog).getByLabelText("Canvas name");
    expect(input).toHaveValue("Canvas 2");
    expect(input).toHaveFocus();

    await user.clear(input);
    expect(within(dialog).getByText("Name is required.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save name" })).toBeDisabled();

    await user.type(input, "Canvas 1");
    expect(within(dialog).getByText("A canvas with this name already exists.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save name" })).toBeDisabled();

    await user.clear(input);
    await user.type(input, "  Settings  ");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await waitFor(() => {
      expect(loadDesignSet(PROJECT.path).set.canvases[1].name).toBe("Settings");
    });
  });

  it("cancels a rename with Escape", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "New canvas" }));
    await user.click(screen.getByRole("button", { name: "Rename Canvas 2" }));
    await user.type(screen.getByLabelText("Canvas name"), "Ignored");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Canvas 2" })).toBeInTheDocument();
  });

  it("traps Tab inside dialogs and restores the trigger focus", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "New canvas" }));
    await user.click(screen.getByRole("button", { name: "Rename Canvas 2" }));

    const input = screen.getByLabelText("Canvas name");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const save = screen.getByRole("button", { name: "Save name" });
    expect(input).toHaveFocus();

    await user.clear(input);
    await user.type(input, "Renamed");
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(save).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(save).toHaveFocus();
    await user.keyboard("{Escape}");

    const renameTrigger = screen.getByRole("button", { name: "Rename Canvas 2" });
    expect(renameTrigger).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Delete Canvas 2" }));
    const deleteCancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Delete canvas" });
    expect(deleteCancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(deleteCancel).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Delete Canvas 2" })).toHaveFocus();
  });

  it("switches the active canvas", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "New canvas" }));
    await user.click(screen.getByRole("button", { name: "Canvas 1" }));

    expect(screen.getByTestId("active-canvas")).toHaveTextContent("Canvas 1");
    expect(screen.getByRole("button", { name: "Canvas 1" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("asks for confirmation and keeps the canvas when cancelled", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "New canvas" }));
    await user.click(screen.getByRole("button", { name: "Delete Canvas 2" }));

    expect(screen.getByRole("dialog", { name: "Delete canvas?" })).toHaveTextContent("Canvas 2");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas-count")).toHaveTextContent("2");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("deletes a canvas and restores it from the notification", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "New canvas" }));
    await user.click(screen.getByRole("button", { name: "Delete Canvas 2" }));
    await user.click(screen.getByRole("button", { name: "Delete canvas" }));

    expect(screen.getByTestId("canvas-count")).toHaveTextContent("1");
    expect(screen.getByTestId("active-canvas")).toHaveTextContent("Canvas 1");
    expect(screen.getByRole("status")).toHaveTextContent("“Canvas 2” deleted.");

    await waitFor(() => {
      expect(loadDesignSet(PROJECT.path).set.canvases).toHaveLength(1);
    });

    await user.click(screen.getByRole("button", { name: "Undo deleting Canvas 2" }));

    expect(screen.getByTestId("canvas-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-canvas")).toHaveTextContent("Canvas 2");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(loadDesignSet(PROJECT.path).set.canvases).toHaveLength(2);
    });
  });

  it("dismisses the notification without restoring the canvas", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "New canvas" }));
    await user.click(screen.getByRole("button", { name: "Delete Canvas 2" }));
    await user.click(screen.getByRole("button", { name: "Delete canvas" }));
    await user.click(screen.getByRole("button", { name: "Dismiss notification for Canvas 2" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas-count")).toHaveTextContent("1");
  });

  it("keeps several deleted canvases recoverable independently", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "New canvas" }));
    await user.click(screen.getByRole("button", { name: "New canvas" }));
    await user.click(screen.getByRole("button", { name: "Delete Canvas 2" }));
    await user.click(screen.getByRole("button", { name: "Delete canvas" }));
    await user.click(screen.getByRole("button", { name: "Delete Canvas 3" }));
    await user.click(screen.getByRole("button", { name: "Delete canvas" }));

    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getByTestId("canvas-count")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "Undo deleting Canvas 2" }));

    expect(screen.getByTestId("canvas-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-canvas")).toHaveTextContent("Canvas 2");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("“Canvas 3” deleted.");

    await user.click(screen.getByRole("button", { name: "Undo deleting Canvas 3" }));

    expect(screen.getByTestId("canvas-count")).toHaveTextContent("3");
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    await waitFor(() => {
      const names = loadDesignSet(PROJECT.path).set.canvases.map((canvas) => canvas.name);
      expect(names).toEqual(["Canvas 1", "Canvas 2", "Canvas 3"]);
    });
  });

  it("warns when the saved design approaches the storage limit", () => {
    const set = createCanvasSet();
    set.canvases[0].root.children[0].children = Array.from({ length: 120 }, () =>
      createWidget("text", { content: "x".repeat(10_000) }),
    );
    expect(saveDesignSet(PROJECT.path, set)).toBe(true);

    renderList();

    expect(screen.getByText(/Design data is 1\.\d MB/)).toBeInTheDocument();
  });

  it("disables deleting the last canvas", () => {
    renderList();

    expect(screen.getByRole("button", { name: "Delete Canvas 1" })).toBeDisabled();
  });

  it("duplicates a canvas with a copy name and fresh widget ids", async () => {
    const user = userEvent.setup();
    const seeded = createCanvasSet();
    expect(saveDesignSet(PROJECT.path, seeded)).toBe(true);

    renderList();
    await user.click(screen.getByRole("button", { name: "Duplicate Canvas 1" }));

    expect(screen.getByTestId("canvas-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-canvas")).toHaveTextContent("Canvas 1 copy");
    expect(screen.getByRole("button", { name: "Canvas 1 copy" })).toHaveAttribute(
      "aria-current",
      "true",
    );

    await waitFor(() => {
      const canvases = loadDesignSet(PROJECT.path).set.canvases;
      expect(canvases.map((canvas) => canvas.name)).toEqual(["Canvas 1", "Canvas 1 copy"]);
      expect(canvases[1].root.id).not.toBe(canvases[0].root.id);
      expect(canvases[1].root.children[0].id).not.toBe(canvases[0].root.children[0].id);
    });
  });

  it("reorders canvases by dragging a row before another", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "New canvas" }));

    const first = rowFor("Canvas 1");
    const second = rowFor("Canvas 2");
    const dataTransfer = fakeDataTransfer();

    mockRowRect(first);
    fireEvent.dragStart(second, { dataTransfer });
    fireDrag("dragover", first, 5, dataTransfer);
    fireDrag("drop", first, 5, dataTransfer);

    await waitFor(() => {
      const names = loadDesignSet(PROJECT.path).set.canvases.map((canvas) => canvas.name);
      expect(names).toEqual(["Canvas 2", "Canvas 1"]);
    });
    expect(screen.getByTestId("active-canvas")).toHaveTextContent("Canvas 2");
  });
});
