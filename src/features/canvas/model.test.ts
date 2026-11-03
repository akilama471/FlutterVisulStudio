import { describe, expect, it } from "vitest";
import {
  canvasReducer,
  createInitialCanvasState,
  createWidget,
  describeWidget,
  findNode,
  findNodePath,
  findParent,
  insertChild,
  MAX_HISTORY,
  removeNode,
  resolveInsertionParent,
  updateNodeProps,
} from "./model";

function starter() {
  const state = createInitialCanvasState();
  const column = state.root.children[0];
  const text = column.children[0];
  const button = column.children[1];

  return { state, column, text, button };
}

describe("canvas model", () => {
  it("creates a starter screen with a column, text, and button", () => {
    const { state, column, text, button } = starter();

    expect(state.selectedId).toBeNull();
    expect(state.root.kind).toBe("screen");
    expect(column.kind).toBe("column");
    expect(column.children.map((child) => child.kind)).toEqual(["text", "button"]);
    expect(text.props.content).toBe("Hello, Flutter!");
    expect(button.props.label).toBe("Get started");
  });

  it("applies sensible defaults for every widget kind", () => {
    expect(createWidget("screen").props.background).toBe("#ffffff");
    expect(createWidget("column").props.gap).toBe(14);
    expect(createWidget("row").props.gap).toBe(12);
    expect(createWidget("container").props).toMatchObject({
      padding: 16,
      background: "#eef2f7",
    });
    expect(createWidget("text").props.content).toBe("Text");
    expect(createWidget("button").props.label).toBe("Button");
  });

  it("adds a widget into the selected container and selects it", () => {
    const { state, column } = starter();
    const next = canvasReducer({ ...state, selectedId: column.id }, { type: "add", kind: "text" });

    const nextColumn = findNode(next.root, column.id);
    expect(nextColumn?.children).toHaveLength(3);
    expect(nextColumn?.children[2].kind).toBe("text");
    expect(next.selectedId).toBe(nextColumn?.children[2].id);
  });

  it("adds into the parent when a leaf is selected", () => {
    const { state, column, text } = starter();
    const next = canvasReducer({ ...state, selectedId: text.id }, { type: "add", kind: "row" });

    expect(findNode(next.root, text.id)?.children).toHaveLength(0);
    expect(findNode(next.root, column.id)?.children.map((child) => child.kind)).toEqual([
      "text",
      "button",
      "row",
    ]);
    expect(next.selectedId).toBe(findNode(next.root, column.id)?.children[2].id);
  });

  it("adds to the root when nothing is selected", () => {
    const { state } = starter();
    const next = canvasReducer(state, { type: "add", kind: "container" });

    expect(next.root.children).toHaveLength(2);
    expect(next.root.children[1].kind).toBe("container");
    expect(next.selectedId).toBe(next.root.children[1].id);
  });

  it("adds to the root when the selection is stale", () => {
    const { state } = starter();
    const next = canvasReducer({ ...state, selectedId: "missing" }, { type: "add", kind: "text" });

    expect(next.root.children).toHaveLength(2);
  });

  it("deletes a subtree and selects the parent", () => {
    const { state, column, button } = starter();
    const next = canvasReducer({ ...state, selectedId: button.id }, { type: "delete" });

    expect(findNode(next.root, button.id)).toBeNull();
    expect(findNode(next.root, column.id)?.children).toHaveLength(1);
    expect(next.selectedId).toBe(column.id);
  });

  it("deletes a container with all of its children", () => {
    const { state, column } = starter();
    const next = canvasReducer({ ...state, selectedId: column.id }, { type: "delete" });

    expect(next.root.children).toHaveLength(0);
    expect(findNode(next.root, column.id)).toBeNull();
    expect(next.selectedId).toBe(state.root.id);
  });

  it("never deletes the screen root", () => {
    const { state } = starter();
    const selectedState = { ...state, selectedId: state.root.id };
    const next = canvasReducer(selectedState, { type: "delete" });

    expect(next).toBe(selectedState);
    expect(next.root).toBe(state.root);
  });

  it("updates only the selected node", () => {
    const { state, text, button } = starter();
    const next = canvasReducer(
      { ...state, selectedId: text.id },
      { type: "update", patch: { content: "Updated heading" } },
    );

    expect(findNode(next.root, text.id)?.props.content).toBe("Updated heading");
    expect(findNode(next.root, button.id)?.props.content).toBe("");
    expect(findNode(next.root, button.id)?.props.label).toBe("Get started");
  });

  it("ignores updates when nothing is selected", () => {
    const { state } = starter();
    const next = canvasReducer(state, { type: "update", patch: { content: "Nope" } });

    expect(next).toBe(state);
  });

  it("selects valid nodes, clears selection, and ignores invalid ids", () => {
    const { state, text } = starter();

    expect(canvasReducer(state, { type: "select", id: text.id }).selectedId).toBe(text.id);
    expect(
      canvasReducer({ ...state, selectedId: text.id }, { type: "select", id: null }).selectedId,
    ).toBeNull();
    expect(canvasReducer(state, { type: "select", id: "missing" })).toBe(state);
  });

  it("returns the root-to-node path", () => {
    const { state, column, text } = starter();
    const path = findNodePath(state.root, text.id);

    expect(path.map((node) => node.id)).toEqual([state.root.id, column.id, text.id]);
    expect(findNodePath(state.root, "missing")).toEqual([]);
  });

  it("finds parents and nodes", () => {
    const { state, column, text } = starter();

    expect(findNode(state.root, text.id)).toBe(text);
    expect(findNode(state.root, "missing")).toBeNull();
    expect(findParent(state.root, text.id)?.id).toBe(column.id);
    expect(findParent(state.root, state.root.id)).toBeNull();
  });

  it("resolves the container that receives the next widget", () => {
    const { state, column, text } = starter();

    expect(resolveInsertionParent(state.root, column.id).id).toBe(column.id);
    expect(resolveInsertionParent(state.root, text.id).id).toBe(column.id);
    expect(resolveInsertionParent(state.root, null).id).toBe(state.root.id);
    expect(resolveInsertionParent(state.root, "missing").id).toBe(state.root.id);
  });

  it("inserts, removes, and updates immutably", () => {
    const { state, column, text } = starter();
    const added = createWidget("text", { content: "Added" });

    const inserted = insertChild(state.root, column.id, added);
    expect(findNode(inserted, added.id)).not.toBeNull();
    expect(state.root).not.toBe(inserted);

    const removed = removeNode(inserted, added.id);
    expect(findNode(removed, added.id)).toBeNull();

    const updated = updateNodeProps(inserted, text.id, { content: "Changed" });
    expect(findNode(updated, text.id)?.props.content).toBe("Changed");
    expect(findNode(updated, added.id)?.props.content).toBe("Added");
  });

  it("describes widgets for selection labels", () => {
    const { text, button, column } = starter();

    expect(describeWidget(column)).toBe("Column");
    expect(describeWidget(text)).toBe('Text "Hello, Flutter!"');
    expect(describeWidget(button)).toBe('Button "Get started"');
    expect(describeWidget(createWidget("text", { content: "x".repeat(40) }))).toBe(
      'Text "xxxxxxxxxxxxxxxxxxxxxxxxxxx…"',
    );
  });
});

describe("canvas history", () => {
  it("undoes and redoes an added widget", () => {
    const state = createInitialCanvasState();
    const added = canvasReducer(state, { type: "add", kind: "container" });
    const container = findNode(added.root, added.selectedId);

    expect(container).not.toBeNull();
    expect(added.past).toHaveLength(1);

    const undone = canvasReducer(added, { type: "undo" });
    expect(findNode(undone.root, added.selectedId)).toBeNull();
    expect(undone.past).toHaveLength(0);
    expect(undone.future).toHaveLength(1);

    const redone = canvasReducer(undone, { type: "redo" });
    expect(findNode(redone.root, added.selectedId)).not.toBeNull();
    expect(redone.selectedId).toBe(added.selectedId);
    expect(redone.future).toHaveLength(0);
  });

  it("undoes and redoes a deleted subtree with its selection", () => {
    const { state, button } = starter();
    const selected = { ...state, selectedId: button.id };
    const deleted = canvasReducer(selected, { type: "delete" });

    expect(findNode(deleted.root, button.id)).toBeNull();

    const undone = canvasReducer(deleted, { type: "undo" });
    expect(findNode(undone.root, button.id)).not.toBeNull();
    expect(undone.selectedId).toBe(button.id);
  });

  it("coalesces consecutive edits to the same widget", () => {
    const { state, text } = starter();
    const selected = { ...state, selectedId: text.id };

    const first = canvasReducer(selected, { type: "update", patch: { content: "A" } });
    const second = canvasReducer(first, { type: "update", patch: { content: "AB" } });

    expect(second.past).toHaveLength(1);
    expect(findNode(second.root, text.id)?.props.content).toBe("AB");

    const undone = canvasReducer(second, { type: "undo" });
    expect(findNode(undone.root, text.id)?.props.content).toBe("Hello, Flutter!");

    const redone = canvasReducer(undone, { type: "redo" });
    expect(findNode(redone.root, text.id)?.props.content).toBe("AB");
  });

  it("starts a new history entry after the selection changes", () => {
    const { state, text, button } = starter();
    const textSelected = { ...state, selectedId: text.id };
    const editedText = canvasReducer(textSelected, { type: "update", patch: { content: "New" } });
    const buttonSelected = canvasReducer(editedText, { type: "select", id: button.id });
    const editedButton = canvasReducer(buttonSelected, {
      type: "update",
      patch: { label: "Start" },
    });

    expect(editedButton.past).toHaveLength(2);

    const undone = canvasReducer(editedButton, { type: "undo" });
    expect(findNode(undone.root, button.id)?.props.label).toBe("Get started");
    expect(findNode(undone.root, text.id)?.props.content).toBe("New");

    const undoneAgain = canvasReducer(undone, { type: "undo" });
    expect(findNode(undoneAgain.root, text.id)?.props.content).toBe("Hello, Flutter!");
  });

  it("clears redo history after a new edit", () => {
    const state = createInitialCanvasState();
    const added = canvasReducer(state, { type: "add", kind: "text" });
    const undone = canvasReducer(added, { type: "undo" });

    expect(undone.future).toHaveLength(1);

    const replacement = canvasReducer(undone, { type: "add", kind: "row" });
    expect(replacement.future).toHaveLength(0);
    expect(canvasReducer(replacement, { type: "redo" })).toBe(replacement);
  });

  it("ignores undo and redo at the ends of the history", () => {
    const state = createInitialCanvasState();

    expect(canvasReducer(state, { type: "undo" })).toBe(state);
    expect(canvasReducer(state, { type: "redo" })).toBe(state);
  });

  it("caps history and keeps only the most recent steps", () => {
    let state = createInitialCanvasState();

    for (let index = 0; index < MAX_HISTORY + 20; index += 1) {
      state = canvasReducer(state, { type: "add", kind: "text" });
    }

    expect(state.past).toHaveLength(MAX_HISTORY);

    for (let index = 0; index < MAX_HISTORY; index += 1) {
      state = canvasReducer(state, { type: "undo" });
    }

    expect(state.past).toHaveLength(0);
    expect(state.root.children).toHaveLength(21);
  });
});
