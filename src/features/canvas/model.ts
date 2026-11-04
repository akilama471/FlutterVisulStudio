export type WidgetKind = "screen" | "column" | "row" | "container" | "text" | "button";

export type AddableWidgetKind = Exclude<WidgetKind, "screen">;

export type WidgetProps = {
  content: string;
  label: string;
  padding: number;
  gap: number;
  background: string;
};

export type CanvasNode = {
  id: string;
  kind: WidgetKind;
  props: WidgetProps;
  children: CanvasNode[];
};

export type DropPosition = "before" | "inside" | "after";

export type CanvasDropTarget = {
  id: string;
  position: DropPosition;
};

export type CanvasSnapshot = {
  root: CanvasNode;
  selectedIds: string[];
  anchorId: string | null;
};

export type CanvasHistory = {
  past: CanvasSnapshot[];
  future: CanvasSnapshot[];
};

export type CanvasState = {
  root: CanvasNode;
  selectedIds: string[];
  anchorId: string | null;
  past: CanvasSnapshot[];
  future: CanvasSnapshot[];
  coalesceKey: string | null;
};

export type CanvasAction =
  | { type: "add"; kind: AddableWidgetKind }
  | { type: "select"; id: string | null }
  | { type: "select-many"; ids: string[]; anchorId?: string | null }
  | { type: "toggle"; id: string }
  | { type: "delete" }
  | { type: "update"; patch: Partial<WidgetProps> }
  | { type: "duplicate" }
  | { type: "paste"; nodes: readonly CanvasNode[] }
  | { type: "move"; ids: string[]; targetId: string; position: DropPosition }
  | { type: "move-selection"; direction: -1 | 1 }
  | { type: "undo" }
  | { type: "redo" };

export const MAX_HISTORY = 100;

export const WIDGET_LABELS: Record<WidgetKind, string> = {
  screen: "Screen",
  column: "Column",
  row: "Row",
  container: "Container",
  text: "Text",
  button: "Button",
};

let widgetSequence = 0;

function nextWidgetId(kind: WidgetKind): string {
  widgetSequence += 1;
  return `${kind}-${widgetSequence}`;
}

function defaultProps(kind: WidgetKind): WidgetProps {
  switch (kind) {
    case "screen":
      return { content: "", label: "", padding: 0, gap: 0, background: "#ffffff" };
    case "column":
      return { content: "", label: "", padding: 0, gap: 14, background: "" };
    case "row":
      return { content: "", label: "", padding: 0, gap: 12, background: "" };
    case "container":
      return { content: "", label: "", padding: 16, gap: 10, background: "#eef2f7" };
    case "text":
      return { content: "Text", label: "", padding: 0, gap: 0, background: "" };
    case "button":
      return { content: "", label: "Button", padding: 0, gap: 0, background: "" };
  }
}

export function createWidget(kind: WidgetKind, props: Partial<WidgetProps> = {}): CanvasNode {
  return {
    id: nextWidgetId(kind),
    kind,
    props: { ...defaultProps(kind), ...props },
    children: [],
  };
}

export function createStarterRoot(): CanvasNode {
  const column = createWidget("column");
  column.children = [
    createWidget("text", { content: "Hello, Flutter!" }),
    createWidget("button", { label: "Get started" }),
  ];

  const root = createWidget("screen");
  root.children = [column];

  return root;
}

export function createCanvasState(root: CanvasNode, history?: CanvasHistory | null): CanvasState {
  return {
    root,
    selectedIds: [],
    anchorId: null,
    past: history ? [...history.past] : [],
    future: history ? [...history.future] : [],
    coalesceKey: null,
  };
}

export function createInitialCanvasState(): CanvasState {
  return createCanvasState(createStarterRoot());
}

export function adoptWidgetIds(root: CanvasNode): void {
  const match = /-(\d+)$/.exec(root.id);
  if (match) {
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value)) {
      widgetSequence = Math.max(widgetSequence, value);
    }
  }

  for (const child of root.children) {
    adoptWidgetIds(child);
  }
}

export function canHaveChildren(kind: WidgetKind): boolean {
  return kind === "screen" || kind === "column" || kind === "row" || kind === "container";
}

export function findNode(root: CanvasNode, id: string | null): CanvasNode | null {
  if (!id) {
    return null;
  }

  if (root.id === id) {
    return root;
  }

  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) {
      return found;
    }
  }

  return null;
}

export function findNodePath(root: CanvasNode, id: string | null): CanvasNode[] {
  if (!id) {
    return [];
  }

  function walk(node: CanvasNode, path: CanvasNode[]): CanvasNode[] | null {
    const nextPath = [...path, node];

    if (node.id === id) {
      return nextPath;
    }

    for (const child of node.children) {
      const found = walk(child, nextPath);
      if (found) {
        return found;
      }
    }

    return null;
  }

  return walk(root, []) ?? [];
}

export function findParent(root: CanvasNode, id: string): CanvasNode | null {
  for (const child of root.children) {
    if (child.id === id) {
      return root;
    }

    const found = findParent(child, id);
    if (found) {
      return found;
    }
  }

  return null;
}

export function findNodeIndex(root: CanvasNode, id: string): number {
  const parent = findParent(root, id);
  return parent ? parent.children.findIndex((child) => child.id === id) : -1;
}

export function isDescendant(root: CanvasNode, ancestorId: string, id: string): boolean {
  const ancestor = findNode(root, ancestorId);
  return ancestor ? findNode(ancestor, id) !== null : false;
}

export function flattenTree(root: CanvasNode): CanvasNode[] {
  const nodes: CanvasNode[] = [];

  function walk(node: CanvasNode) {
    nodes.push(node);
    for (const child of node.children) {
      walk(child);
    }
  }

  walk(root);
  return nodes;
}

export function insertChild(root: CanvasNode, parentId: string, child: CanvasNode): CanvasNode {
  return insertChildren(root, parentId, Number.MAX_SAFE_INTEGER, [child]);
}

export function insertChildren(
  root: CanvasNode,
  parentId: string,
  index: number,
  children: readonly CanvasNode[],
): CanvasNode {
  if (children.length === 0) {
    return root;
  }

  if (root.id === parentId) {
    const at = Math.min(Math.max(index, 0), root.children.length);
    return {
      ...root,
      children: [...root.children.slice(0, at), ...children, ...root.children.slice(at)],
    };
  }

  let changed = false;
  const nextChildren = root.children.map((entry) => {
    const next = insertChildren(entry, parentId, index, children);
    if (next !== entry) {
      changed = true;
    }
    return next;
  });

  return changed ? { ...root, children: nextChildren } : root;
}

export function removeNode(root: CanvasNode, id: string): CanvasNode {
  return removeNodes(root, new Set([id]));
}

export function removeNodes(root: CanvasNode, ids: ReadonlySet<string>): CanvasNode {
  let changed = false;
  const children: CanvasNode[] = [];

  for (const child of root.children) {
    if (ids.has(child.id)) {
      changed = true;
      continue;
    }

    const next = removeNodes(child, ids);
    if (next !== child) {
      changed = true;
    }
    children.push(next);
  }

  return changed ? { ...root, children } : root;
}

export function updateNodeProps(
  root: CanvasNode,
  id: string,
  patch: Partial<WidgetProps>,
): CanvasNode {
  if (root.id === id) {
    return { ...root, props: { ...root.props, ...patch } };
  }

  let changed = false;
  const children = root.children.map((child) => {
    const next = updateNodeProps(child, id, patch);
    if (next !== child) {
      changed = true;
    }
    return next;
  });

  return changed ? { ...root, children } : root;
}

export function resolveInsertionParent(root: CanvasNode, anchorId: string | null): CanvasNode {
  const selected = findNode(root, anchorId);

  if (!selected) {
    return root;
  }

  if (canHaveChildren(selected.kind)) {
    return selected;
  }

  return findParent(root, selected.id) ?? root;
}

export function describeWidget(node: CanvasNode): string {
  const label = WIDGET_LABELS[node.kind];

  if (node.kind === "text") {
    return `${label} "${shorten(node.props.content)}"`;
  }

  if (node.kind === "button") {
    return `${label} "${shorten(node.props.label)}"`;
  }

  return label;
}

function shorten(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 28 ? `${trimmed.slice(0, 27)}…` : trimmed;
}

export function normalizeSelection(
  root: CanvasNode,
  ids: readonly string[],
  anchorId: string | null = null,
): { selectedIds: string[]; anchorId: string | null } {
  const selectedIds: string[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id) || !findNode(root, id)) {
      continue;
    }

    seen.add(id);
    selectedIds.push(id);
  }

  if (selectedIds.includes(root.id) && selectedIds.length > 1) {
    const index = selectedIds.indexOf(root.id);
    selectedIds.splice(index, 1);
  }

  const anchor = anchorId && selectedIds.includes(anchorId) ? anchorId : (selectedIds[0] ?? null);

  return { selectedIds, anchorId: anchor };
}

export function topLevelSelection(root: CanvasNode, ids: readonly string[]): string[] {
  const selected = new Set(ids);
  const result: string[] = [];

  function walk(node: CanvasNode, ancestorSelected: boolean) {
    const currentSelected = selected.has(node.id);

    if (currentSelected && !ancestorSelected) {
      result.push(node.id);
    }

    for (const child of node.children) {
      walk(child, ancestorSelected || currentSelected);
    }
  }

  walk(root, false);
  return result;
}

export function cloneSubtree(node: CanvasNode): CanvasNode {
  return {
    id: nextWidgetId(node.kind),
    kind: node.kind,
    props: { ...node.props },
    children: node.children.map(cloneSubtree),
  };
}

export function duplicateNodes(
  root: CanvasNode,
  ids: readonly string[],
): { root: CanvasNode; newIds: string[] } {
  const selected = new Set(ids);
  const newIds: string[] = [];
  let changed = false;

  function duplicateChildren(children: CanvasNode[]): CanvasNode[] {
    const result: CanvasNode[] = [];

    for (const child of children) {
      if (selected.has(child.id)) {
        const clone = cloneSubtree(child);
        newIds.push(clone.id);
        result.push(child, clone);
        changed = true;
      } else {
        const next = duplicateDescendants(child);
        if (next !== child) {
          changed = true;
        }
        result.push(next);
      }
    }

    return result;
  }

  function duplicateDescendants(node: CanvasNode): CanvasNode {
    if (node.children.length === 0) {
      return node;
    }

    const children = duplicateChildren(node.children);
    const altered =
      children.length !== node.children.length ||
      children.some((child, index) => child !== node.children[index]);
    return altered ? { ...node, children } : node;
  }

  const children = duplicateChildren(root.children);
  return {
    root: changed ? { ...root, children } : root,
    newIds,
  };
}

export function pasteNodes(
  root: CanvasNode,
  nodes: readonly CanvasNode[],
  anchorId: string | null,
): { root: CanvasNode; newIds: string[] } {
  if (nodes.length === 0) {
    return { root, newIds: [] };
  }

  const anchor = findNode(root, anchorId);
  let parentId = root.id;
  let index = root.children.length;

  if (anchor && anchor.id !== root.id) {
    const parent = findParent(root, anchor.id);
    if (parent) {
      parentId = parent.id;
      index = parent.children.findIndex((child) => child.id === anchor.id) + 1;
    }
  }

  const clones = nodes.map(cloneSubtree);
  return {
    root: insertChildren(root, parentId, index, clones),
    newIds: clones.map((clone) => clone.id),
  };
}

export function moveNodes(
  root: CanvasNode,
  ids: readonly string[],
  targetId: string,
  position: DropPosition,
): CanvasNode | null {
  const moved = topLevelSelection(root, ids).filter((id) => id !== root.id);
  const target = findNode(root, targetId);

  if (moved.length === 0 || !target || moved.includes(targetId)) {
    return null;
  }

  if (moved.some((id) => isDescendant(root, id, targetId))) {
    return null;
  }

  if (position === "inside" && !canHaveChildren(target.kind)) {
    return null;
  }

  if (position !== "inside" && targetId === root.id) {
    return null;
  }

  const subtrees = moved
    .map((id) => findNode(root, id))
    .filter((node): node is CanvasNode => !!node);
  const movedSet = new Set(moved);
  const remaining = removeNodes(root, movedSet);

  if (position === "inside") {
    const parent = findNode(remaining, targetId);
    if (!parent) {
      return null;
    }

    return insertChildren(remaining, parent.id, parent.children.length, subtrees);
  }

  const parent = findParent(remaining, targetId);
  if (!parent) {
    return null;
  }

  const index = parent.children.findIndex((child) => child.id === targetId);
  return insertChildren(remaining, parent.id, index + (position === "after" ? 1 : 0), subtrees);
}

export function reorderNode(root: CanvasNode, id: string, direction: -1 | 1): CanvasNode | null {
  const parent = findParent(root, id);

  if (!parent) {
    return null;
  }

  const index = parent.children.findIndex((child) => child.id === id);
  const targetIndex = index + direction;

  if (index < 0 || targetIndex < 0 || targetIndex >= parent.children.length) {
    return null;
  }

  return moveNodes(root, [id], parent.children[targetIndex].id, direction < 0 ? "before" : "after");
}

function snapshot(state: CanvasState): CanvasSnapshot {
  return {
    root: state.root,
    selectedIds: [...state.selectedIds],
    anchorId: state.anchorId,
  };
}

function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function commit(
  state: CanvasState,
  root: CanvasNode,
  selectedIds: string[],
  anchorId: string | null,
  coalesceKey: string | null,
): CanvasState {
  if (
    root === state.root &&
    sameSelection(selectedIds, state.selectedIds) &&
    anchorId === state.anchorId
  ) {
    return state;
  }

  const coalesce =
    coalesceKey !== null && coalesceKey === state.coalesceKey && state.past.length > 0;
  const past = coalesce ? state.past : [...state.past, snapshot(state)].slice(-MAX_HISTORY);

  return {
    root,
    selectedIds: [...selectedIds],
    anchorId,
    past,
    future: [],
    coalesceKey,
  };
}

function updateSelection(
  state: CanvasState,
  ids: readonly string[],
  anchorId: string | null,
): CanvasState {
  const normalized = normalizeSelection(state.root, ids, anchorId);

  if (
    sameSelection(normalized.selectedIds, state.selectedIds) &&
    normalized.anchorId === state.anchorId
  ) {
    return state;
  }

  return {
    ...state,
    selectedIds: normalized.selectedIds,
    anchorId: normalized.anchorId,
    coalesceKey: null,
  };
}

export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "add": {
      const parent = resolveInsertionParent(state.root, state.anchorId);
      const child = createWidget(action.kind);

      return commit(state, insertChild(state.root, parent.id, child), [child.id], child.id, null);
    }
    case "select": {
      if (action.id === null) {
        if (state.selectedIds.length === 0) {
          return state;
        }

        return { ...state, selectedIds: [], anchorId: null, coalesceKey: null };
      }

      if (!findNode(state.root, action.id)) {
        return state;
      }

      if (state.selectedIds.length === 1 && state.selectedIds[0] === action.id) {
        return state;
      }

      return {
        ...state,
        selectedIds: [action.id],
        anchorId: action.id,
        coalesceKey: null,
      };
    }
    case "select-many": {
      return updateSelection(state, action.ids, action.anchorId ?? null);
    }
    case "toggle": {
      const node = findNode(state.root, action.id);
      if (!node) {
        return state;
      }

      if (node.id === state.root.id) {
        return updateSelection(state, [state.root.id], state.root.id);
      }

      const selected = state.selectedIds.includes(node.id);

      if (selected) {
        const next = state.selectedIds.filter((id) => id !== node.id);
        return updateSelection(state, next, next[0] ?? null);
      }

      return updateSelection(state, [...state.selectedIds, node.id], node.id);
    }
    case "delete": {
      const removed = topLevelSelection(state.root, state.selectedIds).filter(
        (id) => id !== state.root.id,
      );

      if (removed.length === 0) {
        return state;
      }

      const anchorNode = findNode(state.root, state.anchorId);
      const parent =
        anchorNode && !removed.includes(anchorNode.id)
          ? findParent(state.root, anchorNode.id)
          : state.anchorId
            ? findParent(state.root, state.anchorId)
            : null;
      const root = removeNodes(state.root, new Set(removed));
      const selectedId = parent && findNode(root, parent.id) ? parent.id : root.id;

      return commit(state, root, [selectedId], selectedId, null);
    }
    case "update": {
      const ids = state.selectedIds.filter((id) => findNode(state.root, id));

      if (ids.length === 0) {
        return state;
      }

      let root = state.root;
      for (const id of ids) {
        root = updateNodeProps(root, id, action.patch);
      }

      return commit(state, root, ids, state.anchorId, `update:${ids.join("|")}`);
    }
    case "duplicate": {
      const ids = topLevelSelection(state.root, state.selectedIds).filter(
        (id) => id !== state.root.id,
      );

      if (ids.length === 0) {
        return state;
      }

      const result = duplicateNodes(state.root, ids);

      if (result.newIds.length === 0) {
        return state;
      }

      return commit(state, result.root, result.newIds, result.newIds[0], null);
    }
    case "paste": {
      const result = pasteNodes(state.root, action.nodes, state.anchorId);

      if (result.newIds.length === 0) {
        return state;
      }

      return commit(state, result.root, result.newIds, result.newIds[0], null);
    }
    case "move": {
      const root = moveNodes(state.root, action.ids, action.targetId, action.position);

      if (!root) {
        return state;
      }

      const moved = topLevelSelection(state.root, action.ids).filter((id) => id !== state.root.id);
      const anchor =
        state.anchorId && moved.includes(state.anchorId) ? state.anchorId : (moved[0] ?? null);

      return commit(state, root, moved, anchor, null);
    }
    case "move-selection": {
      if (!state.anchorId || state.anchorId === state.root.id) {
        return state;
      }

      const root = reorderNode(state.root, state.anchorId, action.direction);

      if (!root) {
        return state;
      }

      return commit(state, root, state.selectedIds, state.anchorId, null);
    }
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) {
        return state;
      }

      const selection = normalizeSelection(previous.root, previous.selectedIds, previous.anchorId);

      return {
        root: previous.root,
        selectedIds: selection.selectedIds,
        anchorId: selection.anchorId,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, MAX_HISTORY),
        coalesceKey: null,
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) {
        return state;
      }

      const selection = normalizeSelection(next.root, next.selectedIds, next.anchorId);

      return {
        root: next.root,
        selectedIds: selection.selectedIds,
        anchorId: selection.anchorId,
        past: [...state.past, snapshot(state)].slice(-MAX_HISTORY),
        future: state.future.slice(1),
        coalesceKey: null,
      };
    }
  }
}
