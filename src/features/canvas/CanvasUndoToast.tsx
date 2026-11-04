import { useEffect } from "react";
import { Button } from "../../shared/components/Button";
import { IconButton } from "../../shared/components/IconButton";
import type { RemovedCanvas } from "./designSet";
import { useDesignWorkspace } from "./designWorkspaceContext";

const UNDO_WINDOW = 10_000;

export function CanvasUndoToast() {
  const { deletedCanvases, undoDelete, dismissDelete } = useDesignWorkspace();

  if (deletedCanvases.length === 0) {
    return null;
  }

  return (
    <div className="canvas-toasts">
      {deletedCanvases.map((deletion) => (
        <CanvasToast
          key={deletion.canvas.id}
          deletion={deletion}
          onUndo={undoDelete}
          onDismiss={dismissDelete}
        />
      ))}
    </div>
  );
}

type CanvasToastProps = {
  deletion: RemovedCanvas;
  onUndo: (id: string) => void;
  onDismiss: (id: string) => void;
};

function CanvasToast({ deletion, onUndo, onDismiss }: CanvasToastProps) {
  const { id, name } = deletion.canvas;

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(id), UNDO_WINDOW);
    return () => window.clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div className="canvas-toast" role="status" aria-live="polite">
      <span className="canvas-toast__message">“{name}” deleted.</span>
      <Button
        className="canvas-toast__undo"
        ariaLabel={`Undo deleting ${name}`}
        onClick={() => onUndo(id)}
      >
        Undo
      </Button>
      <IconButton
        className="canvas-toast__dismiss"
        label={`Dismiss notification for ${name}`}
        icon="x"
        onClick={() => onDismiss(id)}
      />
    </div>
  );
}
