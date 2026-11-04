import { describe, expect, it } from "vitest";
import {
  canvasReducer,
  cloneSubtree,
  createCanvasState,
  createInitialCanvasState,
  createWidget,
  describeWidget,
  findNode,
  findNodePath,
  findParent,
  flattenTree,
  insertChild,
  MAX_HISTORY,
  normalizeSelection,
  removeNode,
  resolveInsertionParent,
  topLevelSelection,
  updateNodeProps,
  type CanvasState,
} from "./model";

function starter() {
  const state = createInitialCanvasState();
  const column = state.root.children[0];
  const text = column.children[0];
  const button = column.children[1];

  return { state, column, text, button };
}

function select(state: CanvasState, ...ids: string[]): CanvasState {
  return {
    ...state,
    selectedIds: ids,
    anchorId: ids[0] ?? null,
  };
}

describe("canvas model", () => {
  it("creates a starter screen with a column, text, and button", () => {
    const { state, column, text, button } = starter();

    expect(state.selectedIds).toEqual([]);
    expect(state.anchorId).toBeNull();
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
    const next = canvasReducer(select(state, column.id), { type: "add", kind: "text" });

    const nextColumn = findNode(next.root, column.id);
    expect(nextColumn?.children).toHaveLength(3);
    expect(nextColumn?.children[2].kind).toBe("text");
    expect(next.selectedIds).toEqual([nextColumn?.children[2].id]);
    expect(next.anchorId).toBe(nextColumn?.children[2].id);
  });

  it("adds into the parent when a leaf is selected", () => {
    const { state, column, text } = starter();
    const next = canvasReducer(select(state, text.id), { type: "add", kind: "row" });

    expect(findNode(next.root, text.id)?.children).toHaveLength(0);
    expect(findNode(next.root, column.id)?.children.map((child) => child.kind)).toEqual([
      "text",
      "button",
      "row",
    ]);
    expect(next.selectedIds).toEqual([findNode(next.root, column.id)?.children[2].id]);
  });

  it("adds to the root when nothing is selected", () => {
    const { state } = starter();
    const next = canvasReducer(state, { type: "add", kind: "container" });

    expect(next.root.children).toHaveLength(2);
    expect(next.root.children[1].kind).toBe("container");
    expect(next.selectedIds).toEqual([next.root.children[1].id]);
  });

  it("adds to the root when the selection is stale", () => {
    const { state } = starter();
    const next = canvasReducer(
      { ...state, selectedIds: ["missing"], anchorId: "missing" },
      { type: "add", kind: "text" },
    );

    expect(next.root.children).toHaveLength(2);
  });

  it("deletes a subtree and selects the parent", () => {
    const { state, column, button } = starter();
    const next = canvasReducer(select(state, button.id), { type: "delete" });

    expect(findNode(next.root, button.id)).toBeNull();
    expect(findNode(next.root, column.id)?.children).toHaveLength(1);
    expect(next.selectedIds).toEqual([column.id]);
    expect(next.anchorId).toBe(column.id);
  });

  it("deletes a container with all of its children", () => {
    const { state, column } = starter();
    const next = canvasReducer(select(state, column.id), { type: "delete" });

    expect(next.root.children).toHaveLength(0);
    expect(findNode(next.root, column.id)).toBeNull();
    expect(next.selectedIds).toEqual([state.root.id]);
  });

  it("deletes a multi-selection and selects the anchor's parent", () => {
    const { state, column, text, button } = starter();
    const next = canvasReducer(select(state, text.id, button.id), { type: "delete" });

    expect(findNode(next.root, text.id)).toBeNull();
    expect(findNode(next.root, button.id)).toBeNull();
    expect(next.selectedIds).toEqual([column.id]);
    expect(next.past).toHaveLength(1);
  });

  it("never deletes the screen root", () => {
    const { state } = starter();
    const selectedState = select(state, state.root.id);
    const next = canvasReducer(selectedState, { type: "delete" });

    expect(next).toBe(selectedState);
    expect(next.root).toBe(state.root);
  });

  it("updates only the selected node", () => {
    const { state, text, button } = starter();
    const next = canvasReducer(select(state, text.id), {
      type: "update",
      patch: { content: "Updated heading" },
    });

    expect(findNode(next.root, text.id)?.props.content).toBe("Updated heading");
    expect(findNode(next.root, button.id)?.props.content).toBe("");
    expect(findNode(next.root, button.id)?.props.label).toBe("Get started");
  });

  it("updates every widget in a multi-selection", () => {
    const { state, text, button } = starter();
    const next = canvasReducer(select(state, text.id, button.id), {
      type: "update",
      patch: { background: "#123456" },
    });

    expect(findNode(next.root, text.id)?.props.background).toBe("#123456");
    expect(findNode(next.root, button.id)?.props.background).toBe("#123456");
  });

  it("ignores updates when nothing is selected", () => {
    const { state } = starter();
    const next = canvasReducer(state, { type: "update", patch: { content: "Nope" } });

    expect(next).toBe(state);
  });

  it("selects valid nodes, clears selection, and ignores invalid ids", () => {
    const { state, text } = starter();

    expect(canvasReducer(state, { type: "select", id: text.id })).toMatchObject({
      selectedIds: [text.id],
      anchorId: text.id,
    });
    expect(canvasReducer(select(state, text.id), { type: "select", id: null })).toMatchObject({
      selectedIds: [],
      anchorId: null,
    });
    expect(canvasReducer(state, { type: "select", id: "missing" })).toBe(state);
  });

  it("normalizes ranges and de-duplicates multi-selection ids", () => {
    const { state, column, text, button } = starter();

    expect(
      canvasReducer(state, {
        type: "select-many",
        ids: [text.id, button.id, text.id, "missing"],
        anchorId: button.id,
      }),
    ).toMatchObject({
      selectedIds: [text.id, button.id],
      anchorId: button.id,
    });

    expect(
      canvasReducer(state, {
        type: "select-many",
        ids: [state.root.id, column.id, text.id],
      }),
    ).toMatchObject({
      selectedIds: [column.id, text.id],
      anchorId: column.id,
    });
  });

  it("toggles widgets in and out of the selection", () => {
    const { state, column, text, button } = starter();
    const textSelected = select(state, text.id);
    const columnSelected = select(state, column.id);

    expect(canvasReducer(textSelected, { type: "toggle", id: button.id })).toMatchObject({
      selectedIds: [text.id, button.id],
      anchorId: button.id,
    });
    expect(
      canvasReducer(select(state, text.id, button.id), { type: "toggle", id: button.id }),
    ).toMatchObject({
      selectedIds: [text.id],
      anchorId: text.id,
    });
    expect(
      canvasReducer(select(state, text.id), { type: "toggle", id: state.root.id }),
    ).toMatchObject({
      selectedIds: [state.root.id],
      anchorId: state.root.id,
    });
    expect(canvasReducer(columnSelected, { type: "toggle", id: "missing" })).toBe(columnSelected);
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

  it("flattens the tree and keeps only top-level selected ids", () => {
    const { state, column, text, button } = starter();

    expect(flattenTree(state.root).map((node) => node.id)).toEqual([
      state.root.id,
      column.id,
      text.id,
      button.id,
    ]);
    expect(topLevelSelection(state.root, [text.id, button.id, column.id])).toEqual([column.id]);
    expect(normalizeSelection(state.root, [button.id, text.id, button.id], button.id)).toEqual({
      selectedIds: [button.id, text.id],
      anchorId: button.id,
    });
  });

  it("clones and duplicates subtrees with fresh ids", () => {
    const { state, column, text, button } = starter();
    const clone = cloneSubtree(column);

    expect(clone.id).not.toBe(column.id);
    expect(clone.children.map((child) => child.kind)).toEqual(["text", "button"]);
    expect(clone.children[0].id).not.toBe(text.id);
    expect(clone.children[1].id).not.toBe(button.id);

    const duplicated = canvasReducer(select(state, text.id, button.id), { type: "duplicate" });
    const nextColumn = findNode(duplicated.root, column.id);

    expect(nextColumn?.children.map((child) => child.kind)).toEqual([
      "text",
      "text",
      "button",
      "button",
    ]);
    expect(duplicated.selectedIds).toHaveLength(2);
    expect(duplicated.selectedIds).not.toContain(text.id);
    expect(duplicated.past).toHaveLength(1);
  });

  it("does not duplicate the screen root", () => {
    const { state } = starter();
    const selected = select(state, state.root.id);

    expect(canvasReducer(selected, { type: "duplicate" })).toBe(selected);
  });

  it("pastes clipboard nodes with fresh ids after the anchor", () => {
    const { state, column, text, button } = starter();
    const next = canvasReducer(select(state, text.id), {
      type: "paste",
      nodes: [text, button],
    });
    const nextColumn = findNode(next.root, column.id);

    expect(nextColumn?.children.map((child) => child.kind)).toEqual([
      "text",
      "text",
      "button",
      "button",
    ]);
    expect(next.selectedIds).toHaveLength(2);
    expect(next.selectedIds).not.toContain(text.id);
    expect(findNode(next.root, text.id)).toBe(text);
    expect(next.past).toHaveLength(1);
  });

  it("pastes into the root when nothing is selected", () => {
    const { state, text } = starter();
    const next = canvasReducer(state, { type: "paste", nodes: [text] });

    expect(next.root.children).toHaveLength(2);
    expect(next.root.children[1].kind).toBe("text");
    expect(next.selectedIds).toEqual([next.root.children[1].id]);
  });

  it("rejects empty pastes and empty duplicates", () => {
    const { state } = starter();

    expect(canvasReducer(state, { type: "paste", nodes: [] })).toBe(state);
    expect(canvasReducer(state, { type: "duplicate" })).toBe(state);
  });

  it("moves a widget before a sibling", () => {
    const { state, column, text, button } = starter();
    const next = canvasReducer(select(state, button.id), {
      type: "move",
      ids: [button.id],
      targetId: text.id,
      position: "before",
    });

    expect(findNode(next.root, column.id)?.children.map((child) => child.id)).toEqual([
      button.id,
      text.id,
    ]);
    expect(next.selectedIds).toEqual([button.id]);
    expect(next.past).toHaveLength(1);
  });

  it("moves a subtree inside another container and after a sibling", () => {
    const screen = createWidget("screen");
    const column = createWidget("column");
    const text = createWidget("text", { content: "Move me" });
    column.children = [text];
    const container = createWidget("container");
    screen.children = [column, container];
    const state = createCanvasState(screen);

    const inside = canvasReducer(select(state, text.id), {
      type: "move",
      ids: [text.id],
      targetId: container.id,
      position: "inside",
    });

    expect(findNode(inside.root, container.id)?.children.map((child) => child.id)).toEqual([
      text.id,
    ]);
    expect(findNode(inside.root, column.id)?.children).toHaveLength(0);

    const after = canvasReducer(select(state, column.id), {
      type: "move",
      ids: [column.id],
      targetId: container.id,
      position: "after",
    });

    expect(after.root.children.map((child) => child.id)).toEqual([container.id, column.id]);
  });

  it("moves several top-level widgets together", () => {
    const { state, column, text, button } = starter();
    const next = canvasReducer(select(state, text.id, button.id), {
      type: "move",
      ids: [text.id, button.id],
      targetId: state.root.id,
      position: "inside",
    });

    expect(next.root.children.map((child) => child.id)).toEqual([column.id, text.id, button.id]);
  });

  it("rejects invalid moves", () => {
    const { state, column, text, button } = starter();
    const selectedText = select(state, text.id);
    const selectedColumn = select(state, column.id);
    const selectedRoot = select(state, state.root.id);

    expect(
      canvasReducer(selectedText, {
        type: "move",
        ids: [text.id],
        targetId: text.id,
        position: "before",
      }),
    ).toBe(selectedText);
    expect(
      canvasReducer(selectedColumn, {
        type: "move",
        ids: [column.id],
        targetId: button.id,
        position: "inside",
      }),
    ).toBe(selectedColumn);
    expect(
      canvasReducer(selectedText, {
        type: "move",
        ids: [text.id],
        targetId: button.id,
        position: "inside",
      }),
    ).toBe(selectedText);
    expect(
      canvasReducer(selectedRoot, {
        type: "move",
        ids: [state.root.id],
        targetId: column.id,
        position: "inside",
      }),
    ).toBe(selectedRoot);
  });

  it("reorders the anchor among its siblings with the keyboard action", () => {
    const { state, text, button } = starter();
    const selectedButton = select(state, button.id);
    const selectedText = select(state, text.id);
    const selectedRoot = select(state, state.root.id);
    const next = canvasReducer(selectedButton, { type: "move-selection", direction: -1 });

    expect(next.root.children[0].children.map((child) => child.id)).toEqual([button.id, text.id]);
    expect(canvasReducer(selectedText, { type: "move-selection", direction: -1 })).toBe(
      selectedText,
    );
    expect(canvasReducer(selectedRoot, { type: "move-selection", direction: 1 })).toBe(
      selectedRoot,
    );
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
  it("undoes and redoes an added widget with its selection", () => {
    const state = createInitialCanvasState();
    const added = canvasReducer(state, { type: "add", kind: "container" });
    const container = findNode(added.root, added.anchorId);

    expect(container).not.toBeNull();
    expect(added.past).toHaveLength(1);

    const undone = canvasReducer(added, { type: "undo" });
    expect(findNode(undone.root, added.anchorId)).toBeNull();
    expect(undone.selectedIds).toEqual([]);
    expect(undone.past).toHaveLength(0);
    expect(undone.future).toHaveLength(1);

    const redone = canvasReducer(undone, { type: "redo" });
    expect(findNode(redone.root, added.anchorId)).not.toBeNull();
    expect(redone.selectedIds).toEqual(added.selectedIds);
    expect(redone.anchorId).toBe(added.anchorId);
    expect(redone.future).toHaveLength(0);
  });

  it("undoes and redoes a deleted subtree with its selection", () => {
    const { state, button } = starter();
    const selected = select(state, button.id);
    const deleted = canvasReducer(selected, { type: "delete" });

    expect(findNode(deleted.root, button.id)).toBeNull();

    const undone = canvasReducer(deleted, { type: "undo" });
    expect(findNode(undone.root, button.id)).not.toBeNull();
    expect(undone.selectedIds).toEqual([button.id]);
    expect(undone.anchorId).toBe(button.id);
  });

  it("restores a multi-selection across undo and redo", () => {
    const { state, text, button } = starter();
    const selected = select(state, text.id, button.id);
    const deleted = canvasReducer(selected, { type: "delete" });
    const undone = canvasReducer(deleted, { type: "undo" });

    expect(undone.selectedIds).toEqual([text.id, button.id]);
    expect(undone.anchorId).toBe(text.id);
  });

  it("coalesces consecutive edits to the same widgets", () => {
    const { state, text } = starter();
    const selected = select(state, text.id);

    const first = canvasReducer(selected, { type: "update", patch: { content: "A" } });
    const second = canvasReducer(first, { type: "update", patch: { content: "AB" } });

    expect(second.past).toHaveLength(1);
    expect(findNode(second.root, text.id)?.props.content).toBe("AB");

    const undone = canvasReducer(second, { type: "undo" });
    expect(findNode(undone.root, text.id)?.props.content).toBe("Hello, Flutter!");

    const redone = canvasReducer(undone, { type: "redo" });
    expect(findNode(redone.root, text.id)?.props.content).toBe("AB");
  });

  it("coalesces multi-selection edits separately from single edits", () => {
    const { state, text, button } = starter();
    const single = canvasReducer(select(state, text.id), {
      type: "update",
      patch: { background: "#111111" },
    });
    const multi = canvasReducer(select(single, text.id, button.id), {
      type: "update",
      patch: { background: "#222222" },
    });

    expect(multi.past).toHaveLength(2);
  });

  it("starts a new history entry after the selection changes", () => {
    const { state, text, button } = starter();
    const textSelected = select(state, text.id);
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

  it("builds a state with restored history", () => {
    const { state, text } = starter();
    const edited = canvasReducer(select(state, text.id), {
      type: "update",
      patch: { content: "Kept" },
    });
    const restored = createCanvasState(edited.root, {
      past: edited.past,
      future: edited.future,
    });

    expect(restored.root).toBe(edited.root);
    expect(restored.past).toEqual(edited.past);
    expect(restored.selectedIds).toEqual([]);
    expect(restored.anchorId).toBeNull();
    expect(restored.coalesceKey).toBeNull();
  });
});
