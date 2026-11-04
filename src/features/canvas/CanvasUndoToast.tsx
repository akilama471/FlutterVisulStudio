import { Button } from "../../shared/components/Button";
import { IconButton } from "../../shared/components/IconButton";
import { useDesignWorkspace } from "./designWorkspaceContext";

export function CanvasUndoToast() {
  const { deletedCanvas, undoDelete, dismissDeleted } = useDesignWorkspace();

  if (!deletedCanvas) {
    return null;
  }

  return (
    <div className="canvas-toast" role="status" aria-live="polite">
      <span className="canvas-toast__message">“{deletedCanvas.name}” deleted.</span>
      <Button className="canvas-toast__undo" onClick={undoDelete}>
        Undo
      </Button>
      <IconButton
        className="canvas-toast__dismiss"
        label="Dismiss notification"
        icon="x"
        onClick={dismissDeleted}
      />
    </div>
  );
}
