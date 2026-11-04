import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { describeWidget, WIDGET_LABELS, type CanvasNode } from "./model";

type CanvasNodeViewProps = {
  node: CanvasNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
  index?: number;
  siblingCount?: number;
};

export function CanvasNodeView({
  node,
  selectedId,
  onSelect,
  depth = 0,
  index = 0,
  siblingCount = 1,
}: CanvasNodeViewProps) {
  const selected = node.id === selectedId;
  const classes = [
    "canvas-node",
    `canvas-node--${node.kind}`,
    selected ? "canvas-node--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    onSelect(node.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onSelect(node.id);
    }
  }

  const commonProps = {
    role: "treeitem" as const,
    tabIndex: 0,
    "aria-label": describeWidget(node),
    "aria-selected": selected,
    "aria-level": depth + 1,
    "aria-posinset": index + 1,
    "aria-setsize": siblingCount,
    "data-kind": WIDGET_LABELS[node.kind],
    className: classes,
    onClick: handleClick,
    onKeyDown: handleKeyDown,
  };

  if (node.kind === "text") {
    return <div {...commonProps}>{node.props.content}</div>;
  }

  if (node.kind === "button") {
    return <div {...commonProps}>{node.props.label}</div>;
  }

  const style = layoutStyle(node);
  const children = node.children.map((child, childIndex) => (
    <CanvasNodeView
      key={child.id}
      node={child}
      selectedId={selectedId}
      onSelect={onSelect}
      depth={depth + 1}
      index={childIndex}
      siblingCount={node.children.length}
    />
  ));

  return (
    <div {...commonProps} style={style}>
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
