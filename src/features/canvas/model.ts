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

export type CanvasSnapshot = {
  root: CanvasNode;
  selectedId: string | null;
};

export type CanvasState = {
  root: CanvasNode;
  selectedId: string | null;
  past: CanvasSnapshot[];
  future: CanvasSnapshot[];
  coalesceKey: string | null;
};

export type CanvasAction =
  | { type: "add"; kind: AddableWidgetKind }
  | { type: "select"; id: string | null }
  | { type: "delete" }
  | { type: "update"; patch: Partial<WidgetProps> }
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

export function createInitialCanvasState(): CanvasState {
  return {
    root: createStarterRoot(),
    selectedId: null,
    past: [],
    future: [],
    coalesceKey: null,
  };
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

export function insertChild(root: CanvasNode, parentId: string, child: CanvasNode): CanvasNode {
  if (root.id === parentId) {
    return { ...root, children: [...root.children, child] };
  }

  let changed = false;
  const children = root.children.map((entry) => {
    const next = insertChild(entry, parentId, child);
    if (next !== entry) {
      changed = true;
    }
    return next;
  });

  return changed ? { ...root, children } : root;
}

export function removeNode(root: CanvasNode, id: string): CanvasNode {
  if (root.id === id) {
    return root;
  }

  let changed = false;
  const children: CanvasNode[] = [];

  for (const child of root.children) {
    if (child.id === id) {
      changed = true;
      continue;
    }

    const next = removeNode(child, id);
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

export function resolveInsertionParent(root: CanvasNode, selectedId: string | null): CanvasNode {
  const selected = findNode(root, selectedId);

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

function snapshot(state: CanvasState): CanvasSnapshot {
  return { root: state.root, selectedId: state.selectedId };
}

function commit(
  state: CanvasState,
  root: CanvasNode,
  selectedId: string | null,
  coalesceKey: string | null,
): CanvasState {
  if (root === state.root && selectedId === state.selectedId) {
    return state;
  }

  const coalesce =
    coalesceKey !== null && coalesceKey === state.coalesceKey && state.past.length > 0;
  const past = coalesce ? state.past : [...state.past, snapshot(state)].slice(-MAX_HISTORY);

  return { root, selectedId, past, future: [], coalesceKey };
}

export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "add": {
      const parent = resolveInsertionParent(state.root, state.selectedId);
      const child = createWidget(action.kind);

      return commit(state, insertChild(state.root, parent.id, child), child.id, null);
    }
    case "select": {
      if (action.id !== null && !findNode(state.root, action.id)) {
        return state;
      }

      if (action.id === state.selectedId) {
        return state;
      }

      return { ...state, selectedId: action.id, coalesceKey: null };
    }
    case "delete": {
      const selected = findNode(state.root, state.selectedId);
      if (!selected || selected.id === state.root.id) {
        return state;
      }

      const parent = findParent(state.root, selected.id) ?? state.root;

      return commit(state, removeNode(state.root, selected.id), parent.id, null);
    }
    case "update": {
      if (!state.selectedId || !findNode(state.root, state.selectedId)) {
        return state;
      }

      return commit(
        state,
        updateNodeProps(state.root, state.selectedId, action.patch),
        state.selectedId,
        `update:${state.selectedId}`,
      );
    }
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) {
        return state;
      }

      return {
        root: previous.root,
        selectedId: previous.selectedId,
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

      return {
        root: next.root,
        selectedId: next.selectedId,
        past: [...state.past, snapshot(state)].slice(-MAX_HISTORY),
        future: state.future.slice(1),
        coalesceKey: null,
      };
    }
  }
}
