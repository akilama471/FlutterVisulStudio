import type { Dispatch } from "react";
import { EmptyState } from "../../shared/components/EmptyState";
import {
  findNode,
  findNodePath,
  WIDGET_LABELS,
  type CanvasAction,
  type CanvasState,
  type WidgetProps,
} from "./model";

type CanvasInspectorProps = {
  canvas: CanvasState;
  dispatch: Dispatch<CanvasAction>;
};

export function NoProjectInspector() {
  return (
    <EmptyState
      icon="sliders"
      title="No project open"
      description="Open a Flutter project to inspect canvas widgets."
    />
  );
}

export function CanvasInspector({ canvas, dispatch }: CanvasInspectorProps) {
  const selected = findNode(canvas.root, canvas.selectedId);

  if (!selected) {
    return (
      <EmptyState
        icon="sliders"
        title="Nothing selected"
        description="Select a widget on the canvas to edit its properties."
      />
    );
  }

  const path = findNodePath(canvas.root, selected.id);
  const typeLabel = WIDGET_LABELS[selected.kind];

  function update(patch: Partial<WidgetProps>) {
    dispatch({ type: "update", patch });
  }

  return (
    <div className="inspector-content">
      <nav className="inspector-breadcrumb" aria-label="Widget hierarchy">
        <ol>
          {path.map((node, index) => {
            const current = node.id === selected.id;

            return (
              <li key={node.id}>
                {index > 0 ? (
                  <span className="inspector-breadcrumb__separator" aria-hidden="true">
                    /
                  </span>
                ) : null}
                <button
                  type="button"
                  className={
                    current
                      ? "inspector-breadcrumb__crumb inspector-breadcrumb__crumb--current"
                      : "inspector-breadcrumb__crumb"
                  }
                  aria-current={current ? "true" : undefined}
                  onClick={() => dispatch({ type: "select", id: node.id })}
                >
                  {WIDGET_LABELS[node.kind]}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="inspector-summary">
        <span className="inspector-summary__type">{typeLabel}</span>
        <code className="inspector-summary__id">{selected.id}</code>
      </div>

      <div className="inspector-fields">
        {selected.kind === "text" ? (
          <label className="inspector-field" htmlFor="inspector-text-content">
            <span className="inspector-field__label">Content</span>
            <input
              id="inspector-text-content"
              className="inspector-input"
              type="text"
              value={selected.props.content}
              onChange={(event) => update({ content: event.target.value })}
            />
          </label>
        ) : null}

        {selected.kind === "button" ? (
          <label className="inspector-field" htmlFor="inspector-button-label">
            <span className="inspector-field__label">Label</span>
            <input
              id="inspector-button-label"
              className="inspector-input"
              type="text"
              value={selected.props.label}
              onChange={(event) => update({ label: event.target.value })}
            />
          </label>
        ) : null}

        {selected.kind === "row" || selected.kind === "column" ? (
          <label className="inspector-field" htmlFor="inspector-gap">
            <span className="inspector-field__label">Gap</span>
            <input
              id="inspector-gap"
              className="inspector-input inspector-input--number"
              type="number"
              min={0}
              max={64}
              value={selected.props.gap}
              onChange={(event) => update({ gap: clampNumber(event.target.value, 0, 64) })}
            />
          </label>
        ) : null}

        {selected.kind === "container" ? (
          <>
            <label className="inspector-field" htmlFor="inspector-padding">
              <span className="inspector-field__label">Padding</span>
              <input
                id="inspector-padding"
                className="inspector-input inspector-input--number"
                type="number"
                min={0}
                max={96}
                value={selected.props.padding}
                onChange={(event) => update({ padding: clampNumber(event.target.value, 0, 96) })}
              />
            </label>
            <ColorField
              id="inspector-container-background"
              label="Background"
              value={selected.props.background}
              onChange={(background) => update({ background })}
            />
          </>
        ) : null}

        {selected.kind === "screen" ? (
          <ColorField
            id="inspector-screen-background"
            label="Background"
            value={selected.props.background}
            onChange={(background) => update({ background })}
          />
        ) : null}
      </div>

      {selected.kind === "screen" ? (
        <p className="inspector-note">
          Screen is the root of the design. It stays on the canvas and cannot be deleted.
        </p>
      ) : null}

      {selected.children.length > 0 ? (
        <p className="inspector-note">
          Deleting this {typeLabel.toLowerCase()} also removes its {selected.children.length} child{" "}
          {selected.children.length === 1 ? "widget" : "widgets"}.
        </p>
      ) : null}
    </div>
  );
}

type ColorFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function ColorField({ id, label, value, onChange }: ColorFieldProps) {
  return (
    <label className="inspector-field" htmlFor={id}>
      <span className="inspector-field__label">{label}</span>
      <span className="inspector-color">
        <span
          className="inspector-color__swatch"
          style={{ background: value }}
          aria-hidden="true"
        />
        <input
          id={id}
          className="inspector-input inspector-input--color"
          type="text"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

function clampNumber(value: string, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return min;
  }

  return Math.min(Math.max(parsed, min), max);
}
