import {
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import { Button } from "../../shared/components/Button";
import { Icon, type IconName } from "../../shared/components/Icon";
import { IconButton } from "../../shared/components/IconButton";
import { CanvasNodeView, type CanvasTreeContext } from "./CanvasNodeView";
import type { DesignSaveStatus } from "./designStorage";
import {
  canHaveChildren,
  findNode,
  findNodePath,
  resolveInsertionParent,
  WIDGET_LABELS,
  type AddableWidgetKind,
  type CanvasAction,
  type CanvasDropTarget,
  type CanvasNode,
  type CanvasState,
  type DropPosition,
} from "./model";

const palette: Array<{ kind: AddableWidgetKind; label: string; icon: IconName }> = [
  { kind: "text", label: "Text", icon: "text" },
  { kind: "button", label: "Button", icon: "button" },
  { kind: "container", label: "Container", icon: "square" },
  { kind: "row", label: "Row", icon: "row" },
  { kind: "column", label: "Column", icon: "column" },
];

const SAVE_LABELS: Record<DesignSaveStatus, string> = {
  saving: "Saving…",
  saved: "Saved locally",
  error: "Save failed",
};

const TREE_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "Enter",
  " ",
]);

type CanvasWorkspaceProps = {
  canvas: CanvasState;
  dispatch: Dispatch<CanvasAction>;
  projectName: string;
  canvasName: string;
  saveStatus: DesignSaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  canPaste: boolean;
  onCopy: () => void;
  onDuplicate: () => void;
  onPaste: () => void;
};

export function CanvasWorkspace({
  canvas,
  dispatch,
  projectName,
  canvasName,
  saveStatus,
  canUndo,
  canRedo,
  canPaste,
  onCopy,
  onDuplicate,
  onPaste,
}: CanvasWorkspaceProps) {
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<CanvasDropTarget | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const selectedNodes = canvas.selectedIds
    .map((id) => findNode(canvas.root, id))
    .filter((node): node is CanvasNode => node !== null);
  const selectedSet = useMemo(() => new Set(canvas.selectedIds), [canvas.selectedIds]);
  const visible = useMemo(
    () => visibleNodes(canvas.root, collapsedIds),
    [canvas.root, collapsedIds],
  );
  const visibleIds = useMemo(() => new Set(visible.map((node) => node.id)), [visible]);
  const insertionParent = resolveInsertionParent(canvas.root, canvas.anchorId);
  const canModifySelection = selectedNodes.some((node) => node.id !== canvas.root.id);
  const selectionLabel =
    selectedNodes.length === 0
      ? "Nothing selected"
      : selectedNodes.length === 1
        ? `${WIDGET_LABELS[selectedNodes[0].kind]} selected`
        : `${selectedNodes.length} widgets selected`;
  const tabbableId = useMemo(() => {
    if (focusedId && visibleIds.has(focusedId)) {
      return focusedId;
    }

    const path = findNodePath(canvas.root, canvas.anchorId);
    const anchorAncestor = [...path].reverse().find((node) => visibleIds.has(node.id));

    return anchorAncestor?.id ?? visible[0]?.id ?? null;
  }, [canvas.anchorId, canvas.root, focusedId, visible, visibleIds]);

  function focusTreeItem(id: string) {
    const items = treeRef.current?.querySelectorAll<HTMLElement>("[data-node-id]");

    for (const item of items ?? []) {
      if (item.dataset.nodeId === id) {
        item.focus();
        return;
      }
    }
  }

  function moveFocus(target: CanvasNode, extend: boolean) {
    setFocusedId(target.id);
    focusTreeItem(target.id);

    if (extend && canvas.anchorId) {
      const anchorIndex = visible.findIndex((node) => node.id === canvas.anchorId);
      const targetIndex = visible.findIndex((node) => node.id === target.id);

      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        dispatch({
          type: "select-many",
          ids: visible.slice(start, end + 1).map((node) => node.id),
          anchorId: canvas.anchorId,
        });
        return;
      }
    }

    dispatch({ type: "select", id: target.id });
  }

  function handleSelect(node: CanvasNode, event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    setFocusedId(node.id);

    if (event.shiftKey && canvas.anchorId && node.id !== canvas.root.id) {
      const anchorIndex = visible.findIndex((entry) => entry.id === canvas.anchorId);
      const targetIndex = visible.findIndex((entry) => entry.id === node.id);

      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        dispatch({
          type: "select-many",
          ids: visible.slice(start, end + 1).map((entry) => entry.id),
          anchorId: canvas.anchorId,
        });
        return;
      }
    }

    if (event.ctrlKey || event.metaKey) {
      dispatch({ type: "toggle", id: node.id });
      return;
    }

    dispatch({ type: "select", id: node.id });
  }

  function handleKeyDown(node: CanvasNode, event: ReactKeyboardEvent<HTMLDivElement>) {
    const command = event.ctrlKey || event.metaKey;
    const index = visible.findIndex((entry) => entry.id === node.id);

    if (TREE_KEYS.has(event.key)) {
      event.stopPropagation();
    }

    if (command && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      dispatch({ type: "move-selection", direction: event.key === "ArrowUp" ? -1 : 1 });
      return;
    }

    if (command && event.key === " ") {
      event.preventDefault();
      dispatch({ type: "toggle", id: node.id });
      return;
    }

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const target = visible[index + 1];
        if (target) {
          moveFocus(target, event.shiftKey);
        }
        return;
      }
      case "ArrowUp": {
        event.preventDefault();
        const target = visible[index - 1];
        if (target) {
          moveFocus(target, event.shiftKey);
        }
        return;
      }
      case "Home": {
        event.preventDefault();
        if (visible[0]) {
          moveFocus(visible[0], event.shiftKey);
        }
        return;
      }
      case "End": {
        event.preventDefault();
        const last = visible[visible.length - 1];
        if (last) {
          moveFocus(last, event.shiftKey);
        }
        return;
      }
      case "ArrowRight": {
        event.preventDefault();
        if (node.children.length === 0) {
          return;
        }

        if (collapsedIds.has(node.id)) {
          setCollapsedIds((current) => {
            const next = new Set(current);
            next.delete(node.id);
            return next;
          });
          return;
        }

        moveFocus(node.children[0], event.shiftKey);
        return;
      }
      case "ArrowLeft": {
        event.preventDefault();

        if (node.children.length > 0 && !collapsedIds.has(node.id)) {
          setCollapsedIds((current) => new Set(current).add(node.id));
          return;
        }

        const parent = findNodePath(canvas.root, node.id).at(-2);
        if (parent) {
          moveFocus(parent, event.shiftKey);
        }
        return;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        moveFocus(node, event.shiftKey);
        return;
      }
      default:
        return;
    }
  }

  function toggleCollapse(id: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function dropPosition(node: CanvasNode, event: DragEvent<HTMLDivElement>): DropPosition {
    if (node.id === canvas.root.id) {
      return "inside";
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;

    if (!canHaveChildren(node.kind)) {
      return ratio < 0.5 ? "before" : "after";
    }

    if (ratio < 0.3) {
      return "before";
    }

    if (ratio > 0.7) {
      return "after";
    }

    return "inside";
  }

  function handleDragStart(node: CanvasNode, event: DragEvent<HTMLDivElement>) {
    if (node.id === canvas.root.id) {
      event.preventDefault();
      return;
    }

    event.stopPropagation();
    setDragId(node.id);
    setFocusedId(node.id);
    setDropTarget(null);

    if (!selectedSet.has(node.id)) {
      dispatch({ type: "select", id: node.id });
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
  }

  function handleDragEnd() {
    setDragId(null);
    setDropTarget(null);
  }

  function handleDragOver(node: CanvasNode, event: DragEvent<HTMLDivElement>) {
    if (!dragId || dragId === node.id) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const dragged = findNode(canvas.root, dragId);
    if (dragged && findNode(dragged, node.id)) {
      setDropTarget(null);
      return;
    }

    event.dataTransfer.dropEffect = "move";
    const position = dropPosition(node, event);

    setDropTarget((current) =>
      current?.id === node.id && current.position === position
        ? current
        : { id: node.id, position },
    );
  }

  function handleDragLeave(node: CanvasNode, event: DragEvent<HTMLDivElement>) {
    const related = event.relatedTarget;

    if (related instanceof Node && event.currentTarget.contains(related)) {
      return;
    }

    setDropTarget((current) => (current?.id === node.id ? null : current));
  }

  function handleDrop(node: CanvasNode, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    const sourceId = dragId;

    if (!sourceId) {
      return;
    }

    const position = dropTarget?.id === node.id ? dropTarget.position : dropPosition(node, event);
    const ids = selectedSet.has(sourceId) ? canvas.selectedIds : [sourceId];

    dispatch({ type: "move", ids, targetId: node.id, position });
    setFocusedId(sourceId);
    setDragId(null);
    setDropTarget(null);
  }

  const treeContext: CanvasTreeContext = {
    selectedIds: selectedSet,
    tabbableId,
    collapsedIds,
    dragId,
    dropTarget,
    onSelect: handleSelect,
    onKeyDown: handleKeyDown,
    onFocusNode: setFocusedId,
    onToggleCollapse: toggleCollapse,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  return (
    <section className="canvas-workspace" aria-label="Visual canvas">
      <header className="canvas-header">
        <div>
          <h1 className="canvas-title">Canvas</h1>
          <p className="canvas-subtitle">
            {projectName} · {canvasName} · Select a widget, then add into the highlighted container.
          </p>
        </div>
        <div className="canvas-header__meta">
          <div className="canvas-history" role="group" aria-label="Canvas history">
            <IconButton
              className="canvas-history__button"
              label="Undo"
              icon="undo"
              ariaKeyshortcuts="Control+Z"
              disabled={!canUndo}
              onClick={() => dispatch({ type: "undo" })}
            />
            <IconButton
              className="canvas-history__button"
              label="Redo"
              icon="redo"
              ariaKeyshortcuts="Control+Y Control+Shift+Z"
              disabled={!canRedo}
              onClick={() => dispatch({ type: "redo" })}
            />
          </div>
          <span
            className={`canvas-save canvas-save--${saveStatus}`}
            role="status"
            aria-live="polite"
            title={
              saveStatus === "error"
                ? "The design could not be saved. Browser storage may be full or unavailable."
                : "Designs are stored in this application's local storage."
            }
          >
            <span className="canvas-save__dot" aria-hidden="true" />
            {SAVE_LABELS[saveStatus]}
          </span>
          <span className="canvas-header__selection">{selectionLabel}</span>
        </div>
      </header>

      <div className="canvas-toolbar">
        <span className="canvas-toolbar__label">Add widget</span>
        <div className="canvas-palette" role="group" aria-label="Widget palette">
          {palette.map((entry) => (
            <button
              key={entry.kind}
              type="button"
              className="palette-button"
              aria-label={`Add ${entry.label}`}
              title={`Add ${entry.label}`}
              onClick={() => dispatch({ type: "add", kind: entry.kind })}
            >
              <Icon name={entry.icon} size={14} />
              <span>{entry.label}</span>
            </button>
          ))}
        </div>
        <span className="canvas-toolbar__target" aria-live="polite">
          Adding to: <strong>{WIDGET_LABELS[insertionParent.kind]}</strong>
        </span>
        <div className="canvas-toolbar__actions" role="group" aria-label="Selection actions">
          <IconButton
            className="canvas-toolbar__action"
            label="Copy selection"
            icon="copy"
            ariaKeyshortcuts="Control+C"
            disabled={!canModifySelection}
            onClick={onCopy}
          />
          <IconButton
            className="canvas-toolbar__action"
            label="Duplicate selection"
            icon="layers"
            ariaKeyshortcuts="Control+D"
            disabled={!canModifySelection}
            onClick={onDuplicate}
          />
          <IconButton
            className="canvas-toolbar__action"
            label="Paste"
            icon="clipboard"
            ariaKeyshortcuts="Control+V"
            disabled={!canPaste}
            onClick={onPaste}
          />
          <Button
            className="canvas-delete"
            icon="trash"
            disabled={!canModifySelection}
            title="Delete selected widgets"
            onClick={() => dispatch({ type: "delete" })}
          >
            Delete widget
          </Button>
        </div>
      </div>

      <div
        className="canvas-stage"
        onClick={() => {
          setFocusedId(canvas.root.id);
          dispatch({ type: "select", id: canvas.root.id });
        }}
      >
        <div className="canvas-device">
          <div className="canvas-device__bar" aria-hidden="true">
            <span className="canvas-device__dot" />
            <span className="canvas-device__dot" />
            <span className="canvas-device__dot" />
            <span className="canvas-device__title">Flutter preview</span>
          </div>
          <div
            ref={treeRef}
            className="canvas-tree"
            role="tree"
            aria-label="Canvas widget tree"
            aria-multiselectable="true"
          >
            <CanvasNodeView node={canvas.root} context={treeContext} />
          </div>
        </div>
      </div>
    </section>
  );
}

function visibleNodes(root: CanvasNode, collapsedIds: ReadonlySet<string>): CanvasNode[] {
  const nodes: CanvasNode[] = [];

  function walk(node: CanvasNode) {
    nodes.push(node);

    if (collapsedIds.has(node.id)) {
      return;
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  walk(root);
  return nodes;
}
