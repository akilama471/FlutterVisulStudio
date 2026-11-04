import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasList } from "./CanvasList";
import { CanvasUndoToast } from "./CanvasUndoToast";
import { loadDesignSet } from "./designStorage";
import { DesignWorkspaceProvider } from "./DesignWorkspaceProvider";
import { useDesignWorkspace } from "./designWorkspaceContext";

const PROJECT = {
  name: "demo_app",
  path: "C:\\Projects\\demo_app",
  entryPoint: "lib/main.dart",
};

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

    await user.click(screen.getByRole("button", { name: "Undo" }));

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
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas-count")).toHaveTextContent("1");
  });

  it("disables deleting the last canvas", () => {
    renderList();

    expect(screen.getByRole("button", { name: "Delete Canvas 1" })).toBeDisabled();
  });
});
