import { useEffect, useRef, useState } from "react";
import { Button } from "../../shared/components/Button";
import { Icon } from "../../shared/components/Icon";
import { IconButton } from "../../shared/components/IconButton";
import { MAX_CANVASES, type DesignCanvas } from "./designSet";
import { useDesignWorkspace } from "./designWorkspaceContext";

export function CanvasList() {
  const {
    canvases,
    activeId,
    canDeleteCanvas,
    atCanvasLimit,
    createCanvas,
    selectCanvas,
    deleteCanvas,
  } = useDesignWorkspace();
  const [pendingDelete, setPendingDelete] = useState<DesignCanvas | null>(null);

  return (
    <section className="canvas-list" aria-labelledby="canvas-list-title">
      <header className="canvas-list__header">
        <h2 id="canvas-list-title" className="canvas-list__title">
          Canvases
        </h2>
        <span className="canvas-list__count">{canvases.length}</span>
        <IconButton
          className="canvas-list__add"
          label="New canvas"
          icon="plus"
          disabled={atCanvasLimit}
          onClick={createCanvas}
        />
      </header>

      <ul className="canvas-list__items">
        {canvases.map((canvas) => {
          const active = canvas.id === activeId;

          return (
            <li
              key={canvas.id}
              className={
                active ? "canvas-list__item canvas-list__item--active" : "canvas-list__item"
              }
            >
              <button
                type="button"
                className="canvas-list__select"
                aria-current={active ? "true" : undefined}
                title={canvas.name}
                onClick={() => selectCanvas(canvas.id)}
              >
                <Icon name="file" size={13} />
                <span className="canvas-list__name">{canvas.name}</span>
              </button>
              <IconButton
                className="canvas-list__delete"
                label={`Delete ${canvas.name}`}
                icon="trash"
                disabled={!canDeleteCanvas}
                onClick={() => setPendingDelete(canvas)}
              />
            </li>
          );
        })}
      </ul>

      {atCanvasLimit ? (
        <p className="canvas-list__note">Limit of {MAX_CANVASES} canvases reached.</p>
      ) : null}

      {pendingDelete ? (
        <DeleteCanvasDialog
          canvas={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            deleteCanvas(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      ) : null}
    </section>
  );
}

type DeleteCanvasDialogProps = {
  canvas: DesignCanvas;
  onCancel: () => void;
  onConfirm: () => void;
};

function DeleteCanvasDialog({ canvas, onCancel, onConfirm }: DeleteCanvasDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>(".dialog__cancel")?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="dialog dialog--compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-canvas-title"
        aria-describedby="delete-canvas-description"
      >
        <header className="dialog__header">
          <h2 id="delete-canvas-title" className="dialog__title">
            Delete canvas?
          </h2>
          <p id="delete-canvas-description" className="dialog__description">
            <strong>{canvas.name}</strong> and its widgets will be removed. You can undo this from
            the notification.
          </p>
        </header>

        <footer className="dialog__actions">
          <Button className="dialog__cancel" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete canvas
          </Button>
        </footer>
      </div>
    </div>
  );
}
