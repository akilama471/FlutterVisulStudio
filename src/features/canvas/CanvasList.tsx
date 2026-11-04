import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button } from "../../shared/components/Button";
import { Icon } from "../../shared/components/Icon";
import { IconButton } from "../../shared/components/IconButton";
import { useDialogFocusTrap } from "../../shared/lib/useDialogFocusTrap";
import {
  canvasNameError,
  MAX_CANVASES,
  MAX_CANVAS_NAME_LENGTH,
  type CanvasNameError,
  type DesignCanvas,
} from "./designSet";
import { useDesignWorkspace } from "./designWorkspaceContext";

export function CanvasList() {
  const {
    canvases,
    activeId,
    canDeleteCanvas,
    atCanvasLimit,
    storageBytes,
    storageWarning,
    createCanvas,
    duplicateCanvas,
    reorderCanvas,
    selectCanvas,
    deleteCanvas,
  } = useDesignWorkspace();
  const [pendingDelete, setPendingDelete] = useState<DesignCanvas | null>(null);
  const [pendingRename, setPendingRename] = useState<DesignCanvas | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const storageMegabytes = (storageBytes / (1024 * 1024)).toFixed(1);

  function handleDragStart(canvas: DesignCanvas, event: DragEvent<HTMLLIElement>) {
    event.stopPropagation();
    setDragId(canvas.id);
    setDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", canvas.id);
  }

  function handleDragOver(canvas: DesignCanvas, event: DragEvent<HTMLLIElement>) {
    if (!dragId || dragId === canvas.id) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
    const position = ratio < 0.5 ? "before" : "after";

    setDropTarget((current) =>
      current?.id === canvas.id && current.position === position
        ? current
        : { id: canvas.id, position },
    );
  }

  function handleDragLeave(canvas: DesignCanvas, event: DragEvent<HTMLLIElement>) {
    const related = event.relatedTarget;

    if (related instanceof Node && event.currentTarget.contains(related)) {
      return;
    }

    setDropTarget((current) => (current?.id === canvas.id ? null : current));
  }

  function handleDrop(canvas: DesignCanvas, event: DragEvent<HTMLLIElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!dragId) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const position =
      dropTarget?.id === canvas.id
        ? dropTarget.position
        : event.clientY < rect.top + rect.height / 2
          ? "before"
          : "after";

    reorderCanvas(dragId, canvas.id, position);
    setDragId(null);
    setDropTarget(null);
  }

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
              className={[
                "canvas-list__item",
                active ? "canvas-list__item--active" : "",
                dragId === canvas.id ? "canvas-list__item--dragging" : "",
                dropTarget?.id === canvas.id
                  ? `canvas-list__item--drop-${dropTarget.position}`
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              draggable={canvases.length > 1}
              onDragStart={(event) => handleDragStart(canvas, event)}
              onDragEnd={() => {
                setDragId(null);
                setDropTarget(null);
              }}
              onDragOver={(event) => handleDragOver(canvas, event)}
              onDragLeave={(event) => handleDragLeave(canvas, event)}
              onDrop={(event) => handleDrop(canvas, event)}
            >
              <span className="canvas-list__grip" aria-hidden="true">
                <Icon name="grip" size={12} />
              </span>
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
                className="canvas-list__duplicate"
                label={`Duplicate ${canvas.name}`}
                icon="copy"
                disabled={atCanvasLimit}
                onClick={() => duplicateCanvas(canvas.id)}
              />
              <IconButton
                className="canvas-list__rename"
                label={`Rename ${canvas.name}`}
                icon="pencil"
                onClick={() => setPendingRename(canvas)}
              />
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

      {storageWarning ? (
        <p className="canvas-list__warning">
          Design data is {storageMegabytes} MB. Browser storage is limited; delete unused canvases
          to free space.
        </p>
      ) : null}

      {atCanvasLimit ? (
        <p className="canvas-list__note">Limit of {MAX_CANVASES} canvases reached.</p>
      ) : null}

      {pendingRename ? (
        <RenameCanvasDialog canvas={pendingRename} onClose={() => setPendingRename(null)} />
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

type RenameCanvasDialogProps = {
  canvas: DesignCanvas;
  onClose: () => void;
};

const NAME_ERROR_LABELS: Record<CanvasNameError, string> = {
  empty: "Name is required.",
  "too-long": `Name must be ${MAX_CANVAS_NAME_LENGTH} characters or fewer.`,
  duplicate: "A canvas with this name already exists.",
};

function RenameCanvasDialog({ canvas, onClose }: RenameCanvasDialogProps) {
  const { canvases, renameCanvas } = useDesignWorkspace();
  const [name, setName] = useState(canvas.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const error = canvasNameError(canvases, canvas.id, name);
  const unchanged = name.trim() === canvas.name;
  useDialogFocusTrap(dialogRef);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function submit() {
    if (error || unchanged) {
      return;
    }

    renameCanvas(canvas.id, name);
    onClose();
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="dialog dialog--compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-canvas-title"
      >
        <header className="dialog__header">
          <h2 id="rename-canvas-title" className="dialog__title">
            Rename canvas
          </h2>
          <p className="dialog__description">
            Choose a name for this canvas. Names are unique within the project.
          </p>
        </header>

        <div className="dialog__body">
          <label className="dialog__field" htmlFor="rename-canvas-input">
            <span className="dialog__field-label">Canvas name</span>
            <input
              ref={inputRef}
              id="rename-canvas-input"
              className="dialog__input"
              type="text"
              value={name}
              aria-invalid={error !== null}
              aria-describedby={error ? "rename-canvas-error" : undefined}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </label>
          {error ? (
            <p id="rename-canvas-error" className="dialog__error" role="alert">
              {NAME_ERROR_LABELS[error]}
            </p>
          ) : null}
        </div>

        <footer className="dialog__actions">
          <Button className="dialog__cancel" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={error !== null || unchanged} onClick={submit}>
            Save name
          </Button>
        </footer>
      </div>
    </div>
  );
}

type DeleteCanvasDialogProps = {
  canvas: DesignCanvas;
  onCancel: () => void;
  onConfirm: () => void;
};

function DeleteCanvasDialog({ canvas, onCancel, onConfirm }: DeleteCanvasDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef);

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
