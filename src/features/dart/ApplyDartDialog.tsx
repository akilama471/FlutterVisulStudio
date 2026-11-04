import { useEffect, useMemo, useRef } from "react";
import { Button } from "../../shared/components/Button";
import { useDialogFocusTrap } from "../../shared/lib/useDialogFocusTrap";
import { diffLines, type DiffLine } from "./diff";

type ApplyDartDialogProps = {
  target: string;
  existing: string | null;
  code: string;
  writing: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ApplyDartDialog({
  target,
  existing,
  code,
  writing,
  error,
  onCancel,
  onConfirm,
}: ApplyDartDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const diff = useMemo(() => diffLines(existing ?? "", code), [existing, code]);
  useDialogFocusTrap(dialogRef);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>(".dialog__cancel")?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !writing) {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [writing, onCancel]);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !writing) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-dart-title"
        aria-describedby="apply-dart-description"
      >
        <header className="dialog__header">
          <h2 id="apply-dart-title" className="dialog__title">
            Apply generated Dart
          </h2>
          <p id="apply-dart-description" className="dialog__description">
            <code className="dialog__target">{target}</code>{" "}
            {existing === null
              ? "will be created."
              : "will be overwritten. The current file is backed up first."}
          </p>
        </header>

        <div className="dialog__summary">
          <span>{existing === null ? "New file" : "Existing file"}</span>
          <span className="dialog__added">+{diff.added} added</span>
          <span className="dialog__removed">−{diff.removed} removed</span>
          {diff.truncated ? <span className="dialog__truncated">Large diff summarised</span> : null}
        </div>

        <div className="dialog__diff" role="region" aria-label="Proposed changes">
          {diff.lines.length === 0 ? (
            <p className="dialog__empty">No changes.</p>
          ) : (
            <div className="diff-view" role="table" aria-label="Line differences">
              {diff.lines.map((line, index) => (
                <DiffRow key={index} line={line} />
              ))}
            </div>
          )}
        </div>

        {error ? (
          <p className="dialog__error" role="alert">
            {error}
          </p>
        ) : null}

        <footer className="dialog__actions">
          <Button className="dialog__cancel" onClick={onCancel} disabled={writing}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={writing}>
            {writing ? "Writing…" : existing === null ? "Create file" : "Write to project"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  const sign = line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " ";

  return (
    <div className={`diff-line diff-line--${line.kind}`} role="row">
      <span className="diff-line__number" aria-hidden="true">
        {line.beforeLine ?? ""}
      </span>
      <span className="diff-line__number" aria-hidden="true">
        {line.afterLine ?? ""}
      </span>
      <span className="diff-line__sign" aria-hidden="true">
        {sign}
      </span>
      <code className="diff-line__text">{line.text.length > 0 ? line.text : " "}</code>
    </div>
  );
}
