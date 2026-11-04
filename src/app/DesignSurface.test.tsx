import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canvasHistoryStorageKey } from "../features/canvas/canvasHistoryStorage";
import { CanvasList } from "../features/canvas/CanvasList";
import {
  createCanvasSet,
  createDesignCanvas,
  replaceCanvasRoot,
} from "../features/canvas/designSet";
import {
  designSetStorageKey,
  loadDesignSet,
  saveDesignSet,
} from "../features/canvas/designStorage";
import { createWidget, type CanvasNode } from "../features/canvas/model";
import { DesignWorkspaceProvider } from "../features/canvas/DesignWorkspaceProvider";
import { FileWorkspaceProvider } from "../features/files/FileWorkspaceProvider";
import { DesignSurface } from "./DesignSurface";

const PROJECT = {
  name: "demo_app",
  path: "C:\\Projects\\demo_app",
  entryPoint: "lib/main.dart",
};

function renderSurface() {
  return render(
    <DesignWorkspaceProvider project={PROJECT}>
      <FileWorkspaceProvider>
        <DesignSurface project={PROJECT} showInspector />
      </FileWorkspaceProvider>
    </DesignWorkspaceProvider>,
  );
}

function renderWorkspace() {
  return render(
    <DesignWorkspaceProvider project={PROJECT}>
      <FileWorkspaceProvider>
        <CanvasList />
        <DesignSurface project={PROJECT} showInspector />
      </FileWorkspaceProvider>
    </DesignWorkspaceProvider>,
  );
}

function seedTwoCanvases() {
  const set = createCanvasSet();
  const first = {
    ...set.canvases[0],
    root: designWithText("First canvas"),
  };
  const second = createDesignCanvas("Canvas 2", designWithText("Second canvas"));

  expect(saveDesignSet(PROJECT.path, { canvases: [first, second], activeId: second.id })).toBe(
    true,
  );
}

function loadedCanvasText(name: string): string | null {
  const { set } = loadDesignSet(PROJECT.path);
  const canvas = set.canvases.find((entry) => entry.name === name);

  return canvas ? findFirstText(canvas.root) : null;
}

function designWithText(content: string): CanvasNode {
  const screen = createWidget("screen");
  const column = createWidget("column");
  column.children = [createWidget("text", { content })];
  screen.children = [column];
  return screen;
}

function designWithTexts(...contents: string[]): CanvasNode {
  const screen = createWidget("screen");
  const column = createWidget("column");
  column.children = contents.map((content) => createWidget("text", { content }));
  screen.children = [column];
  return screen;
}

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

function mockRect(element: Element): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 320,
    bottom: 100,
    width: 320,
    height: 100,
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

function seedDesign(root: CanvasNode) {
  const set = createCanvasSet();
  expect(saveDesignSet(PROJECT.path, replaceCanvasRoot(set, set.activeId, root))).toBe(true);
}

function firstTextContent(projectPath: string): string | null {
  const { set } = loadDesignSet(projectPath);
  const canvas = set.canvases.find((entry) => entry.id === set.activeId) ?? set.canvases[0];

  return canvas ? findFirstText(canvas.root) : null;
}

function findFirstText(root: CanvasNode): string | null {
  if (root.kind === "text") {
    return root.props.content;
  }

  for (const child of root.children) {
    const content = findFirstText(child);
    if (content !== null) {
      return content;
    }
  }

  return null;
}

describe("DesignSurface", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  it("shows Canvas and Dart tabs with the canvas active by default", () => {
    renderSurface();

    expect(screen.getByRole("tab", { name: "Canvas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Dart" })).toHaveAttribute("aria-selected", "false");
    expect(
      screen.queryByRole("heading", { level: 1, name: "Dart preview" }),
    ).not.toBeInTheDocument();
  });

  it("restores a saved design when the surface mounts", async () => {
    seedDesign(designWithText("Restored heading"));
    renderSurface();

    expect(screen.getByRole("treeitem", { name: 'Text "Restored heading"' })).toBeInTheDocument();
    expect(
      screen.queryByRole("treeitem", { name: 'Text "Hello, Flutter!"' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Saved locally")).toBeInTheDocument();
  });

  it("falls back to the starter design when the saved payload is invalid", () => {
    window.localStorage.setItem(designSetStorageKey(PROJECT.path), "{");

    renderSurface();

    expect(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toBeInTheDocument();
  });

  it("autosaves canvas edits to local storage", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' }));
    const content = screen.getByLabelText("Content");
    await user.clear(content);
    await user.type(content, "Persisted heading");

    await waitFor(() => {
      expect(firstTextContent(PROJECT.path)).toBe("Persisted heading");
    });
    expect(await screen.findByText("Saved locally")).toBeInTheDocument();
  });

  it("flushes a pending edit when the page hides", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' }));
    const content = screen.getByLabelText("Content");
    await user.clear(content);
    await user.type(content, "Hidden save");

    window.dispatchEvent(new Event("pagehide"));

    expect(firstTextContent(PROJECT.path)).toBe("Hidden save");
  });

  it("shows a save failure when local storage rejects the write", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    renderSurface();

    const failure = await screen.findByText("Save failed");
    expect(failure).toHaveAttribute("title", expect.stringMatching(/storage/i));
  });

  it("renders generated Dart for the current canvas", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("tab", { name: "Dart" }));

    expect(screen.getByRole("tab", { name: "Dart" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Dart preview" })).toBeInTheDocument();

    const code = screen.getByLabelText("Generated Dart code");
    expect(code).toHaveTextContent("import 'package:flutter/material.dart';");
    expect(code).toHaveTextContent("'Hello, Flutter!'");
    expect(code).toHaveTextContent("child: const Text('Get started'),");
  });

  it("regenerates Dart after the canvas is edited", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' }));
    const content = screen.getByLabelText("Content");
    await user.clear(content);
    await user.type(content, "Studio");

    await user.click(screen.getByRole("tab", { name: "Dart" }));

    expect(screen.getByLabelText("Generated Dart code")).toHaveTextContent("'Studio',");
    expect(screen.getByLabelText("Generated Dart code")).not.toHaveTextContent("'Hello, Flutter!'");
  });

  it("keeps the canvas state when switching back from Dart", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("tab", { name: "Dart" }));
    await user.click(screen.getByRole("tab", { name: "Canvas" }));

    expect(screen.getByRole("region", { name: "Visual canvas" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "Screen" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toBeInTheDocument();
  });

  it("copies the generated Dart to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    renderSurface();

    await user.click(screen.getByRole("tab", { name: "Dart" }));
    await user.click(screen.getByRole("button", { name: "Copy code" }));

    expect(await screen.findByText("Copied to clipboard")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("import 'package:flutter/material.dart';"),
    );
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("'Hello, Flutter!'"));
  });

  it("reports a clipboard failure", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Clipboard denied"));
    renderSurface();

    await user.click(screen.getByRole("tab", { name: "Dart" }));
    await user.click(screen.getByRole("button", { name: "Copy code" }));

    expect(await screen.findByText("Copy failed")).toBeInTheDocument();
    expect(screen.queryByText("Copied to clipboard")).not.toBeInTheDocument();
  });

  it("renders the starter document and the nothing-selected inspector state", () => {
    renderSurface();

    expect(screen.getByRole("heading", { level: 1, name: "Canvas" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "Screen" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "Screen" })).toHaveAttribute("aria-level", "1");
    expect(screen.getByRole("treeitem", { name: "Column" })).toHaveAttribute("aria-level", "2");
    expect(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toHaveAttribute(
      "aria-level",
      "3",
    );
    expect(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toHaveAttribute(
      "aria-posinset",
      "1",
    );
    expect(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toHaveAttribute(
      "aria-setsize",
      "2",
    );
    expect(screen.getByRole("treeitem", { name: 'Button "Get started"' })).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Inspector" })).getByText(
        "Nothing selected",
      ),
    ).toBeInTheDocument();
  });

  it("adds a widget into the root when nothing is selected and selects it", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("button", { name: "Add Container" }));

    const container = screen.getByRole("treeitem", { name: "Container" });
    expect(container).toHaveAttribute("aria-selected", "true");

    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    expect(
      within(inspector).getByText("Container", { selector: ".inspector-summary__type" }),
    ).toBeInTheDocument();
    expect(within(inspector).getByText("Padding")).toBeInTheDocument();
  });

  it("adds into the selected leaf's parent container", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' }));
    await user.click(screen.getByRole("button", { name: "Add Row" }));

    const column = screen.getByRole("treeitem", { name: "Column" });
    const row = within(column).getByRole("treeitem", { name: "Row" });
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(
      within(screen.getByRole("complementary", { name: "Inspector" })).getByText("Row", {
        selector: ".inspector-summary__type",
      }),
    ).toBeInTheDocument();
  });

  it("updates the inspector when a canvas widget is selected", async () => {
    const user = userEvent.setup();
    renderSurface();

    const button = screen.getByRole("treeitem", { name: 'Button "Get started"' });
    await user.click(button);

    expect(button).toHaveAttribute("aria-selected", "true");

    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    expect(
      within(inspector).getByText("Button", { selector: ".inspector-summary__type" }),
    ).toBeInTheDocument();
    expect(within(inspector).getByLabelText("Label")).toHaveValue("Get started");

    const hierarchy = within(inspector).getByRole("navigation", { name: "Widget hierarchy" });
    expect(within(hierarchy).getByRole("button", { name: "Button" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("edits text and button content on the canvas", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' }));
    const content = screen.getByLabelText("Content");
    await user.clear(content);
    await user.type(content, "Welcome");

    expect(screen.getByRole("treeitem", { name: 'Text "Welcome"' })).toBeInTheDocument();

    await user.click(screen.getByRole("treeitem", { name: 'Button "Get started"' }));
    const label = screen.getByLabelText("Label");
    await user.clear(label);
    await user.type(label, "Start now");

    expect(screen.getByRole("treeitem", { name: 'Button "Start now"' })).toBeInTheDocument();
  });

  it("edits layout gaps, container padding, and backgrounds", async () => {
    const user = userEvent.setup();
    renderSurface();

    const column = screen.getByRole("treeitem", { name: "Column" });
    await user.click(column);
    const gap = screen.getByLabelText("Gap");
    await user.clear(gap);
    await user.type(gap, "24");
    expect(column).toHaveStyle({ gap: "24px" });

    await user.click(screen.getByRole("button", { name: "Add Container" }));
    const container = screen.getByRole("treeitem", { name: "Container" });

    const padding = screen.getByLabelText("Padding");
    await user.clear(padding);
    await user.type(padding, "32");
    expect(container).toHaveStyle({ padding: "32px" });

    const background = screen.getByLabelText("Background");
    await user.clear(background);
    await user.type(background, "#ff0000");
    expect(container).toHaveStyle({ backgroundColor: "#ff0000" });
  });

  it("edits the screen background", async () => {
    const user = userEvent.setup();
    renderSurface();

    const root = screen.getByRole("treeitem", { name: "Screen" });
    await user.click(root);
    const background = screen.getByLabelText("Background");
    await user.clear(background);
    await user.type(background, "#102030");

    expect(root).toHaveStyle({ backgroundColor: "#102030" });
    expect(screen.getByText(/cannot be deleted/)).toBeInTheDocument();
  });

  it("selects an ancestor from the breadcrumb", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' }));
    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    const hierarchy = within(inspector).getByRole("navigation", { name: "Widget hierarchy" });

    await user.click(within(hierarchy).getByRole("button", { name: "Column" }));

    expect(screen.getByRole("treeitem", { name: "Column" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(inspector).getByLabelText("Gap")).toBeInTheDocument();
  });

  it("deletes the selected widget and selects its parent", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("treeitem", { name: 'Button "Get started"' }));
    await user.click(screen.getByRole("button", { name: "Delete widget" }));

    expect(
      screen.queryByRole("treeitem", { name: 'Button "Get started"' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "Column" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("disables deletion for the screen root", async () => {
    const user = userEvent.setup();
    renderSurface();

    const remove = screen.getByRole("button", { name: "Delete widget" });
    expect(remove).toBeDisabled();

    await user.click(screen.getByRole("treeitem", { name: "Screen" }));
    expect(remove).toBeDisabled();
  });

  it("undoes and redoes widget changes with the header buttons", async () => {
    const user = userEvent.setup();
    renderSurface();

    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(undo).toHaveAttribute("aria-keyshortcuts", "Control+Z");
    expect(redo).toHaveAttribute("aria-keyshortcuts", "Control+Y Control+Shift+Z");
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Add Container" }));
    expect(screen.getByRole("treeitem", { name: "Container" })).toBeInTheDocument();
    expect(undo).toBeEnabled();
    expect(redo).toBeDisabled();

    await user.click(undo);
    expect(screen.queryByRole("treeitem", { name: "Container" })).not.toBeInTheDocument();
    expect(redo).toBeEnabled();

    await user.click(redo);
    expect(screen.getByRole("treeitem", { name: "Container" })).toBeInTheDocument();
    expect(redo).toBeDisabled();
  });

  it("undoes and redoes with keyboard shortcuts", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("button", { name: "Add Text" }));
    expect(screen.getByRole("treeitem", { name: 'Text "Text"' })).toBeInTheDocument();

    await user.keyboard("{Control>}z{/Control}");
    expect(screen.queryByRole("treeitem", { name: 'Text "Text"' })).not.toBeInTheDocument();

    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(screen.getByRole("treeitem", { name: 'Text "Text"' })).toBeInTheDocument();

    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Control>}y{/Control}");
    expect(screen.getByRole("treeitem", { name: 'Text "Text"' })).toBeInTheDocument();
  });

  it("ignores undo shortcuts while a dialog is open", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Add Text" }));
    expect(screen.getByRole("treeitem", { name: 'Text "Text"' })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rename Canvas 1" }));
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByRole("treeitem", { name: 'Text "Text"' })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("autosaves an undone edit", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' }));
    const content = screen.getByLabelText("Content");
    await user.clear(content);
    await user.type(content, "Undo me");

    await waitFor(() => expect(firstTextContent(PROJECT.path)).toBe("Undo me"));
    expect(await screen.findByText("Saved locally")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toBeInTheDocument();
    await waitFor(() => expect(firstTextContent(PROJECT.path)).toBe("Hello, Flutter!"));
  });

  it("keeps separate designs per canvas", async () => {
    const user = userEvent.setup();
    seedTwoCanvases();
    renderWorkspace();

    expect(screen.getByRole("treeitem", { name: 'Text "Second canvas"' })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Canvas 1" }));
    expect(screen.getByRole("treeitem", { name: 'Text "First canvas"' })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Canvas 2" }));
    expect(screen.getByRole("treeitem", { name: 'Text "Second canvas"' })).toBeInTheDocument();
  });

  it("edits one canvas without changing the other", async () => {
    const user = userEvent.setup();
    seedTwoCanvases();
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Canvas 1" }));
    await user.click(screen.getByRole("treeitem", { name: 'Text "First canvas"' }));
    const content = screen.getByLabelText("Content");
    await user.clear(content);
    await user.type(content, "Edited first");

    await user.click(screen.getByRole("button", { name: "Canvas 2" }));
    expect(screen.getByRole("treeitem", { name: 'Text "Second canvas"' })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Canvas 1" }));
    expect(screen.getByRole("treeitem", { name: 'Text "Edited first"' })).toBeInTheDocument();

    await waitFor(() => expect(loadedCanvasText("Canvas 1")).toBe("Edited first"));
    expect(loadedCanvasText("Canvas 2")).toBe("Second canvas");
  });

  it("selects multiple widgets with Ctrl and Shift and deletes the group", async () => {
    const user = userEvent.setup();
    renderSurface();

    const text = screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' });
    const button = screen.getByRole("treeitem", { name: 'Button "Get started"' });

    await user.click(text);
    await user.keyboard("{Control>}");
    await user.click(button);
    await user.keyboard("{/Control}");

    expect(text).toHaveAttribute("aria-selected", "true");
    expect(button).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText("2 widgets selected", { selector: ".canvas-header__selection" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete widget" }));

    expect(
      screen.queryByRole("treeitem", { name: 'Text "Hello, Flutter!"' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("treeitem", { name: 'Button "Get started"' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "Column" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("treeitem", { name: 'Button "Get started"' })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("extends the selection with Shift+click over visible order", async () => {
    const user = userEvent.setup();
    renderSurface();

    const text = screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' });
    const button = screen.getByRole("treeitem", { name: 'Button "Get started"' });

    await user.click(text);
    await user.keyboard("{Shift>}");
    await user.click(button);
    await user.keyboard("{/Shift}");

    expect(text).toHaveAttribute("aria-selected", "true");
    expect(button).toHaveAttribute("aria-selected", "true");
  });

  it("shows shared fields for same-kind selections and a note for mixed kinds", async () => {
    const user = userEvent.setup();
    seedDesign(designWithTexts("Alpha", "Beta"));
    renderSurface();

    await user.click(screen.getByRole("treeitem", { name: 'Text "Alpha"' }));
    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("treeitem", { name: 'Text "Beta"' }));
    await user.keyboard("{/Control}");

    const content = screen.getByLabelText("Content");
    expect(content).toHaveValue("");
    expect(content).toHaveAttribute("placeholder", "Mixed values");

    await user.type(content, "Shared");
    expect(screen.getAllByRole("treeitem", { name: 'Text "Shared"' })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Add Button" }));
    await user.keyboard("{Control>}");
    await user.click(screen.getAllByRole("treeitem", { name: 'Text "Shared"' })[0]);
    await user.keyboard("{/Control}");

    expect(
      screen.getByText("Select widgets of the same type to edit shared properties."),
    ).toBeInTheDocument();
  });

  it("duplicates the selected subtree", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("button", { name: "Add Text" }));
    await user.click(screen.getByRole("button", { name: "Duplicate selection" }));

    expect(screen.getAllByRole("treeitem", { name: 'Text "Text"' })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getAllByRole("treeitem", { name: 'Text "Text"' })).toHaveLength(1);
  });

  it("copies and pastes between canvases", async () => {
    const user = userEvent.setup();
    seedTwoCanvases();
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Canvas 1" }));
    await user.click(screen.getByRole("treeitem", { name: 'Text "First canvas"' }));
    await user.click(screen.getByRole("button", { name: "Copy selection" }));

    await user.click(screen.getByRole("button", { name: "Canvas 2" }));
    expect(screen.getByRole("button", { name: "Paste" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Paste" }));

    expect(screen.getByRole("treeitem", { name: 'Text "First canvas"' })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: 'Text "Second canvas"' })).toBeInTheDocument();
  });

  it("copies and pastes with keyboard shortcuts", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' }));
    await user.keyboard("{Control>}c{/Control}");
    await user.keyboard("{Control>}v{/Control}");

    expect(screen.getAllByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toHaveLength(2);

    await user.keyboard("{Control>}d{/Control}");
    expect(screen.getAllByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toHaveLength(3);
  });

  it("navigates, selects, expands, and reorders with the tree keyboard model", async () => {
    const user = userEvent.setup();
    renderSurface();

    const root = screen.getByRole("treeitem", { name: "Screen" });
    const column = screen.getByRole("treeitem", { name: "Column" });
    const text = screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' });
    const button = screen.getByRole("treeitem", { name: 'Button "Get started"' });

    root.focus();
    expect(root).toHaveAttribute("tabindex", "0");

    await user.keyboard("{ArrowDown}");
    expect(column).toHaveFocus();
    expect(column).toHaveAttribute("aria-selected", "true");
    expect(column).toHaveAttribute("tabindex", "0");
    expect(root).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowRight}");
    expect(text).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(button).toHaveFocus();

    await user.keyboard("{Home}");
    expect(root).toHaveFocus();
    await user.keyboard("{End}");
    expect(button).toHaveFocus();

    await user.keyboard("{Control>}{ArrowUp}{/Control}");
    expect(button).toHaveAttribute("aria-posinset", "1");
    expect(text).toHaveAttribute("aria-posinset", "2");

    await user.click(column);
    await user.keyboard("{ArrowLeft}");
    expect(column).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("treeitem", { name: 'Text "Hello, Flutter!"' }),
    ).not.toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(column).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toBeInTheDocument();
  });

  it("extends a keyboard selection with Shift+Arrow", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' }));
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");

    expect(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("treeitem", { name: 'Button "Get started"' })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("reorders widgets by dragging before a target", async () => {
    const user = userEvent.setup();
    renderSurface();

    const text = screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' });
    const button = screen.getByRole("treeitem", { name: 'Button "Get started"' });
    const dataTransfer = fakeDataTransfer();

    mockRect(text);
    fireEvent.dragStart(button, { dataTransfer });
    fireDrag("dragover", text, 5, dataTransfer);
    fireDrag("drop", text, 5, dataTransfer);

    expect(button).toHaveAttribute("aria-posinset", "1");
    expect(text).toHaveAttribute("aria-posinset", "2");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(text).toHaveAttribute("aria-posinset", "1");
  });

  it("moves a widget into another container by dragging", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("button", { name: "Add Container" }));
    const container = screen.getByRole("treeitem", { name: "Container" });
    const text = screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' });
    const dataTransfer = fakeDataTransfer();

    mockRect(container);
    fireEvent.dragStart(text, { dataTransfer });
    fireDrag("dragover", container, 50, dataTransfer);
    fireDrag("drop", container, 50, dataTransfer);

    expect(
      within(container).getByRole("treeitem", { name: 'Text "Hello, Flutter!"' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("treeitem", { name: "Column" })).queryByRole("treeitem", {
        name: 'Text "Hello, Flutter!"',
      }),
    ).not.toBeInTheDocument();
  });

  it("restores per-canvas undo history after a restart", async () => {
    const user = userEvent.setup();
    const first = renderSurface();

    await user.click(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' }));
    const content = screen.getByLabelText("Content");
    await user.clear(content);
    await user.type(content, "History survives");

    await waitFor(() => expect(firstTextContent(PROJECT.path)).toBe("History survives"));
    await waitFor(() =>
      expect(window.localStorage.getItem(canvasHistoryStorageKey(PROJECT.path))).not.toBeNull(),
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();

    first.unmount();
    renderSurface();

    expect(screen.getByRole("treeitem", { name: 'Text "History survives"' })).toBeInTheDocument();
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toBeEnabled();

    await user.click(undo);
    expect(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toBeInTheDocument();
  });
});
