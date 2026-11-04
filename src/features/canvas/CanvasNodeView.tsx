import type {
  CSSProperties,
  DragEvent,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";
import { Icon } from "../../shared/components/Icon";
import { describeWidget, WIDGET_LABELS, type CanvasDropTarget, type CanvasNode } from "./model";

export type CanvasTreeContext = {
  selectedIds: ReadonlySet<string>;
  tabbableId: string | null;
  collapsedIds: ReadonlySet<string>;
  dragId: string | null;
  dropTarget: CanvasDropTarget | null;
  onSelect: (node: CanvasNode, event: MouseEvent<HTMLDivElement>) => void;
  onKeyDown: (node: CanvasNode, event: KeyboardEvent<HTMLDivElement>) => void;
  onFocusNode: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onDragStart: (node: CanvasNode, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOver: (node: CanvasNode, event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (node: CanvasNode, event: DragEvent<HTMLDivElement>) => void;
  onDrop: (node: CanvasNode, event: DragEvent<HTMLDivElement>) => void;
};

type CanvasNodeViewProps = {
  node: CanvasNode;
  context: CanvasTreeContext;
  depth?: number;
  index?: number;
  siblingCount?: number;
};

export function CanvasNodeView({
  node,
  context,
  depth = 0,
  index = 0,
  siblingCount = 1,
}: CanvasNodeViewProps) {
  const selected = context.selectedIds.has(node.id);
  const collapsed = context.collapsedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const drop = context.dropTarget?.id === node.id ? context.dropTarget.position : null;
  const classes = [
    "canvas-node",
    `canvas-node--${node.kind}`,
    selected ? "canvas-node--selected" : "",
    context.dragId === node.id ? "canvas-node--dragging" : "",
    drop ? `canvas-node--drop-${drop}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const commonProps = {
    role: "treeitem" as const,
    tabIndex: context.tabbableId === node.id ? 0 : -1,
    "aria-label": describeWidget(node),
    "aria-selected": selected,
    "aria-level": depth + 1,
    "aria-posinset": index + 1,
    "aria-setsize": siblingCount,
    "aria-expanded": hasChildren ? !collapsed : undefined,
    "data-kind": WIDGET_LABELS[node.kind],
    "data-node-id": node.id,
    className: classes,
    draggable: node.kind !== "screen",
    onClick: (event: MouseEvent<HTMLDivElement>) => context.onSelect(node, event),
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => context.onKeyDown(node, event),
    onFocus: (event: FocusEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        context.onFocusNode(node.id);
      }
    },
    onDragStart: (event: DragEvent<HTMLDivElement>) => context.onDragStart(node, event),
    onDragEnd: context.onDragEnd,
    onDragOver: (event: DragEvent<HTMLDivElement>) => context.onDragOver(node, event),
    onDragLeave: (event: DragEvent<HTMLDivElement>) => context.onDragLeave(node, event),
    onDrop: (event: DragEvent<HTMLDivElement>) => context.onDrop(node, event),
  };

  if (node.kind === "text") {
    return <div {...commonProps}>{node.props.content}</div>;
  }

  if (node.kind === "button") {
    return <div {...commonProps}>{node.props.label}</div>;
  }

  const style = layoutStyle(node);
  const children: ReactNode =
    hasChildren && !collapsed ? (
      <div role="group" className="canvas-node__children">
        {node.children.map((child, childIndex) => (
          <CanvasNodeView
            key={child.id}
            node={child}
            context={context}
            depth={depth + 1}
            index={childIndex}
            siblingCount={node.children.length}
          />
        ))}
      </div>
    ) : null;

  return (
    <div {...commonProps} style={style}>
      {hasChildren ? (
        <button
          type="button"
          className={
            collapsed ? "canvas-node__toggle canvas-node__toggle--collapsed" : "canvas-node__toggle"
          }
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${WIDGET_LABELS[node.kind]}`}
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            context.onToggleCollapse(node.id);
          }}
        >
          <Icon name="chevron" size={11} />
        </button>
      ) : null}
      {node.children.length === 0 ? (
        <span className="canvas-empty">{emptyMessage(node.kind)}</span>
      ) : null}
      {children}
    </div>
  );
}

function layoutStyle(node: CanvasNode): CSSProperties {
  switch (node.kind) {
    case "screen":
      return { background: node.props.background };
    case "column":
    case "row":
      return { gap: `${node.props.gap}px` };
    case "container":
      return {
        gap: `${node.props.gap}px`,
        padding: `${node.props.padding}px`,
        background: node.props.background,
      };
    default:
      return {};
  }
}

function emptyMessage(kind: CanvasNode["kind"]): string {
  switch (kind) {
    case "screen":
      return "Add a widget from the palette to start.";
    case "column":
      return "Empty Column";
    case "row":
      return "Empty Row";
    case "container":
      return "Empty Container";
    default:
      return "";
  }
}
