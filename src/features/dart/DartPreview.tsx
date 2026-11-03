import { useState } from "react";
import { Button } from "../../shared/components/Button";
import {
  projectErrorMessage,
  readProjectFile,
  writeProjectFile,
  type ProjectInfo,
  type ProjectWriteResult,
} from "../../shared/lib/project";
import { ApplyDartDialog } from "./ApplyDartDialog";

type CopyState = "idle" | "copied" | "error";

type ApplyPhase = "idle" | "reading" | "review" | "writing";

type DartPreviewProps = {
  code: string;
  project: ProjectInfo;
};

export function DartPreview({ code, project }: DartPreviewProps) {
  const target = project.entryPoint ?? "lib/main.dart";
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [applyPhase, setApplyPhase] = useState<ApplyPhase>("idle");
  const [existing, setExisting] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [writeResult, setWriteResult] = useState<ProjectWriteResult | null>(null);

  async function copyCode() {
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard is unavailable");
      }

      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  async function reviewApply() {
    setWriteResult(null);
    setApplyError(null);
    setDialogError(null);
    setApplyPhase("reading");

    try {
      const contents = await readProjectFile(target);
      setExisting(contents);
      setApplyPhase("review");
    } catch (error) {
      setApplyPhase("idle");
      setApplyError(projectErrorMessage(error, "The project file could not be read."));
    }
  }

  async function confirmApply() {
    setDialogError(null);
    setApplyPhase("writing");

    try {
      const result = await writeProjectFile(target, code);
      setWriteResult(result);
      setApplyPhase("idle");
    } catch (error) {
      setDialogError(projectErrorMessage(error, "The project file could not be written."));
      setApplyPhase("review");
    }
  }

  function cancelApply() {
    if (applyPhase === "writing") {
      return;
    }

    setApplyPhase("idle");
    setDialogError(null);
  }

  return (
    <section className="dart-preview" aria-label="Dart preview">
      <header className="dart-preview__header">
        <div>
          <h1 className="dart-preview__title">Dart preview</h1>
          <p className="dart-preview__subtitle">
            Generated from the current canvas. Review the changes before writing to {target}.
          </p>
        </div>
        <div className="dart-preview__actions">
          <span
            className={
              copyState === "error"
                ? "dart-preview__status dart-preview__status--error"
                : "dart-preview__status"
            }
            role="status"
            aria-live="polite"
          >
            {copyState === "copied"
              ? "Copied to clipboard"
              : copyState === "error"
                ? "Copy failed"
                : ""}
          </span>
          {applyError ? (
            <span
              className="dart-preview__status dart-preview__status--error"
              role="status"
              aria-live="polite"
            >
              {applyError}
            </span>
          ) : null}
          {writeResult ? (
            <span className="dart-preview__status" role="status" aria-live="polite">
              Written to {writeResult.relativePath}
              {writeResult.backupPath ? ` · Backup ${writeResult.backupPath}` : ""}
            </span>
          ) : null}
          <Button icon="code" onClick={() => void copyCode()}>
            Copy code
          </Button>
          <Button
            variant="primary"
            icon="file"
            onClick={() => void reviewApply()}
            disabled={applyPhase === "reading"}
          >
            {applyPhase === "reading" ? "Reading…" : "Apply to project"}
          </Button>
        </div>
      </header>
      <div className="dart-preview__body">
        <pre className="dart-code" aria-label="Generated Dart code">
          <code>{code}</code>
        </pre>
      </div>
      {applyPhase === "review" || applyPhase === "writing" ? (
        <ApplyDartDialog
          target={target}
          existing={existing}
          code={code}
          writing={applyPhase === "writing"}
          error={dialogError}
          onCancel={cancelApply}
          onConfirm={() => void confirmApply()}
        />
      ) : null}
    </section>
  );
}
