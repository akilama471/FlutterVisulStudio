import { useEffect, useRef } from "react";
import { Button } from "../../shared/components/Button";
import { useDialogFocusTrap } from "../../shared/lib/useDialogFocusTrap";
import { fileName } from "./fileWorkspaceContext";

type DiscardFileDialogProps = {
  relativePath: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DiscardFileDialog({ relativePath, onCancel, onConfirm }: DiscardFileDialogProps) {
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
        aria-labelledby="discard-file-title"
        aria-describedby="discard-file-description"
      >
        <header className="dialog__header">
          <h2 id="discard-file-title" className="dialog__title">
            Discard unsaved changes?
          </h2>
          <p id="discard-file-description" className="dialog__description">
            {fileName(relativePath)} has changes that have not been saved. Closing this tab discards
            them.
          </p>
        </header>

        <footer className="dialog__actions">
          <Button className="dialog__cancel" onClick={onCancel}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Discard changes
          </Button>
        </footer>
      </div>
    </div>
  );
}
