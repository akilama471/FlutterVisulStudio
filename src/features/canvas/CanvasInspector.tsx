import type { Dispatch } from "react";
import { EmptyState } from "../../shared/components/EmptyState";
import {
  findNode,
  findNodePath,
  topLevelSelection,
  WIDGET_LABELS,
  type CanvasAction,
  type CanvasNode,
  type CanvasState,
  type WidgetKind,
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
  const selected = canvas.selectedIds
    .map((id) => findNode(canvas.root, id))
    .filter((node): node is CanvasNode => node !== null);

  if (selected.length === 0) {
    return (
      <EmptyState
        icon="sliders"
        title="Nothing selected"
        description="Select a widget on the canvas to edit its properties."
      />
    );
  }

  if (selected.length === 1) {
    return <SingleSelection canvas={canvas} dispatch={dispatch} selected={selected[0]} />;
  }

  return <MultiSelection canvas={canvas} dispatch={dispatch} selected={selected} />;
}

type SelectionProps = {
  canvas: CanvasState;
  dispatch: Dispatch<CanvasAction>;
};

function SingleSelection({
  canvas,
  dispatch,
  selected,
}: SelectionProps & { selected: CanvasNode }) {
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

      <div className="inspector-fields">{renderFields(selected.kind, selected.props, update)}</div>

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

function MultiSelection({
  canvas,
  dispatch,
  selected,
}: SelectionProps & { selected: CanvasNode[] }) {
  const kinds = [...new Set(selected.map((node) => node.kind))];
  const sharedKind = kinds.length === 1 ? kinds[0] : null;
  const removed = topLevelSelection(
    canvas.root,
    selected.map((node) => node.id),
  );
  const descendantCount = removed.reduce((count, id) => {
    const node = findNode(canvas.root, id);
    return count + (node ? countDescendants(node) : 0);
  }, 0);

  function update(patch: Partial<WidgetProps>) {
    dispatch({ type: "update", patch });
  }

  return (
    <div className="inspector-content">
      <div className="inspector-summary">
        <span className="inspector-summary__type">{selected.length} widgets selected</span>
        <code className="inspector-summary__id">
          {kinds.map((kind) => WIDGET_LABELS[kind]).join(", ")}
        </code>
      </div>

      {sharedKind ? (
        <div className="inspector-fields">{renderMultiFields(sharedKind, selected, update)}</div>
      ) : (
        <p className="inspector-note">Select widgets of the same type to edit shared properties.</p>
      )}

      <p className="inspector-note">
        Group changes apply to every selected widget.
        {descendantCount > 0
          ? ` Deleting the selection also removes ${descendantCount} nested ${
              descendantCount === 1 ? "widget" : "widgets"
            }.`
          : ""}
      </p>
    </div>
  );
}

function renderFields(
  kind: WidgetKind,
  props: WidgetProps,
  update: (patch: Partial<WidgetProps>) => void,
) {
  switch (kind) {
    case "text":
      return (
        <label className="inspector-field" htmlFor="inspector-text-content">
          <span className="inspector-field__label">Content</span>
          <input
            id="inspector-text-content"
            className="inspector-input"
            type="text"
            value={props.content}
            onChange={(event) => update({ content: event.target.value })}
          />
        </label>
      );
    case "button":
      return (
        <label className="inspector-field" htmlFor="inspector-button-label">
          <span className="inspector-field__label">Label</span>
          <input
            id="inspector-button-label"
            className="inspector-input"
            type="text"
            value={props.label}
            onChange={(event) => update({ label: event.target.value })}
          />
        </label>
      );
    case "row":
    case "column":
      return (
        <label className="inspector-field" htmlFor="inspector-gap">
          <span className="inspector-field__label">Gap</span>
          <input
            id="inspector-gap"
            className="inspector-input inspector-input--number"
            type="number"
            min={0}
            max={64}
            value={props.gap}
            onChange={(event) => update({ gap: clampNumber(event.target.value, 0, 64) })}
          />
        </label>
      );
    case "container":
      return (
        <>
          <label className="inspector-field" htmlFor="inspector-padding">
            <span className="inspector-field__label">Padding</span>
            <input
              id="inspector-padding"
              className="inspector-input inspector-input--number"
              type="number"
              min={0}
              max={96}
              value={props.padding}
              onChange={(event) => update({ padding: clampNumber(event.target.value, 0, 96) })}
            />
          </label>
          <ColorField
            id="inspector-container-background"
            label="Background"
            value={props.background}
            onChange={(background) => update({ background })}
          />
        </>
      );
    case "screen":
      return (
        <ColorField
          id="inspector-screen-background"
          label="Background"
          value={props.background}
          onChange={(background) => update({ background })}
        />
      );
  }
}

function renderMultiFields(
  kind: WidgetKind,
  selected: CanvasNode[],
  update: (patch: Partial<WidgetProps>) => void,
) {
  switch (kind) {
    case "text": {
      const field = sharedValue(selected, "content");
      return (
        <label className="inspector-field" htmlFor="inspector-text-content">
          <span className="inspector-field__label">Content</span>
          <input
            id="inspector-text-content"
            className="inspector-input"
            type="text"
            value={field.mixed ? "" : field.value}
            placeholder={field.mixed ? "Mixed values" : undefined}
            onChange={(event) => update({ content: event.target.value })}
          />
        </label>
      );
    }
    case "button": {
      const field = sharedValue(selected, "label");
      return (
        <label className="inspector-field" htmlFor="inspector-button-label">
          <span className="inspector-field__label">Label</span>
          <input
            id="inspector-button-label"
            className="inspector-input"
            type="text"
            value={field.mixed ? "" : field.value}
            placeholder={field.mixed ? "Mixed values" : undefined}
            onChange={(event) => update({ label: event.target.value })}
          />
        </label>
      );
    }
    case "row":
    case "column": {
      const field = sharedValue(selected, "gap");
      return (
        <label className="inspector-field" htmlFor="inspector-gap">
          <span className="inspector-field__label">Gap</span>
          <input
            id="inspector-gap"
            className="inspector-input inspector-input--number"
            type="number"
            min={0}
            max={64}
            value={field.mixed ? "" : field.value}
            placeholder={field.mixed ? "Mixed" : undefined}
            onChange={(event) => update({ gap: clampNumber(event.target.value, 0, 64) })}
          />
        </label>
      );
    }
    case "container": {
      const padding = sharedValue(selected, "padding");
      const background = sharedValue(selected, "background");
      return (
        <>
          <label className="inspector-field" htmlFor="inspector-padding">
            <span className="inspector-field__label">Padding</span>
            <input
              id="inspector-padding"
              className="inspector-input inspector-input--number"
              type="number"
              min={0}
              max={96}
              value={padding.mixed ? "" : padding.value}
              placeholder={padding.mixed ? "Mixed" : undefined}
              onChange={(event) => update({ padding: clampNumber(event.target.value, 0, 96) })}
            />
          </label>
          <ColorField
            id="inspector-container-background"
            label="Background"
            value={background.mixed ? "" : background.value}
            placeholder={background.mixed ? "Mixed values" : undefined}
            onChange={(next) => update({ background: next })}
          />
        </>
      );
    }
    case "screen": {
      const background = sharedValue(selected, "background");
      return (
        <ColorField
          id="inspector-screen-background"
          label="Background"
          value={background.mixed ? "" : background.value}
          placeholder={background.mixed ? "Mixed values" : undefined}
          onChange={(next) => update({ background: next })}
        />
      );
    }
  }
}

function sharedValue<K extends keyof WidgetProps>(
  selected: CanvasNode[],
  prop: K,
): { value: WidgetProps[K]; mixed: boolean } {
  const value = selected[0].props[prop];
  return {
    value,
    mixed: selected.some((node) => node.props[prop] !== value),
  };
}

function countDescendants(node: CanvasNode): number {
  return node.children.reduce((count, child) => count + 1 + countDescendants(child), 0);
}

type ColorFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

function ColorField({ id, label, value, placeholder, onChange }: ColorFieldProps) {
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
          placeholder={placeholder}
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
