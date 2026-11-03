import type { Dispatch } from "react";
import { Button } from "../../shared/components/Button";
import { Icon, type IconName } from "../../shared/components/Icon";
import { CanvasNodeView } from "./CanvasNodeView";
import type { DesignSaveStatus } from "./designStorage";
import {
  findNode,
  resolveInsertionParent,
  WIDGET_LABELS,
  type AddableWidgetKind,
  type CanvasAction,
  type CanvasState,
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

type CanvasWorkspaceProps = {
  canvas: CanvasState;
  dispatch: Dispatch<CanvasAction>;
  projectName: string;
  saveStatus: DesignSaveStatus;
};

export function CanvasWorkspace({
  canvas,
  dispatch,
  projectName,
  saveStatus,
}: CanvasWorkspaceProps) {
  const selected = findNode(canvas.root, canvas.selectedId);
  const insertionParent = resolveInsertionParent(canvas.root, canvas.selectedId);
  const canDelete = selected !== null && selected.kind !== "screen";

  return (
    <section className="canvas-workspace" aria-label="Visual canvas">
      <header className="canvas-header">
        <div>
          <h1 className="canvas-title">Canvas</h1>
          <p className="canvas-subtitle">
            {projectName} · Select a widget, then add into the highlighted container.
          </p>
        </div>
        <div className="canvas-header__meta">
          <span
            className={`canvas-save canvas-save--${saveStatus}`}
            role="status"
            aria-live="polite"
            title="Designs are stored in this application's local storage."
          >
            <span className="canvas-save__dot" aria-hidden="true" />
            {SAVE_LABELS[saveStatus]}
          </span>
          <span className="canvas-header__selection">
            {selected ? `${WIDGET_LABELS[selected.kind]} selected` : "Nothing selected"}
          </span>
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
        <Button
          className="canvas-delete"
          icon="trash"
          disabled={!canDelete}
          title="Delete selected widget"
          onClick={() => dispatch({ type: "delete" })}
        >
          Delete widget
        </Button>
      </div>

      <div
        className="canvas-stage"
        onClick={() => dispatch({ type: "select", id: canvas.root.id })}
      >
        <div className="canvas-device">
          <div className="canvas-device__bar" aria-hidden="true">
            <span className="canvas-device__dot" />
            <span className="canvas-device__dot" />
            <span className="canvas-device__dot" />
            <span className="canvas-device__title">Flutter preview</span>
          </div>
          <div className="canvas-tree" role="tree" aria-label="Canvas widget tree">
            <CanvasNodeView
              node={canvas.root}
              selectedId={canvas.selectedId}
              onSelect={(id) => dispatch({ type: "select", id })}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
