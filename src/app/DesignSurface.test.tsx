import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvasSet, replaceCanvasRoot } from "../features/canvas/designSet";
import {
  designSetStorageKey,
  loadDesignSet,
  saveDesignSet,
} from "../features/canvas/designStorage";
import { createWidget, type CanvasNode } from "../features/canvas/model";
import { DesignWorkspaceProvider } from "../features/canvas/DesignWorkspaceProvider";
import { DesignSurface } from "./DesignSurface";

const PROJECT = {
  name: "demo_app",
  path: "C:\\Projects\\demo_app",
  entryPoint: "lib/main.dart",
};

function renderSurface() {
  return render(
    <DesignWorkspaceProvider project={PROJECT}>
      <DesignSurface project={PROJECT} showInspector />
    </DesignWorkspaceProvider>,
  );
}

function designWithText(content: string): CanvasNode {
  const screen = createWidget("screen");
  const column = createWidget("column");
  column.children = [createWidget("text", { content })];
  screen.children = [column];
  return screen;
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

  it("shows a save failure when local storage rejects the write", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    renderSurface();

    expect(await screen.findByText("Save failed")).toBeInTheDocument();
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
    expect(screen.getByRole("treeitem", { name: "Column" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toBeInTheDocument();
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
});
