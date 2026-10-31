import { useState } from "react";
import { Button } from "../../shared/components/Button";

type CopyState = "idle" | "copied" | "error";

type DartPreviewProps = {
  code: string;
};

export function DartPreview({ code }: DartPreviewProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

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

  return (
    <section className="dart-preview" aria-label="Dart preview">
      <header className="dart-preview__header">
        <div>
          <h1 className="dart-preview__title">Dart preview</h1>
          <p className="dart-preview__subtitle">
            Read-only code generated from the current canvas. Nothing is written to the project.
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
          <Button icon="code" onClick={() => void copyCode()}>
            Copy code
          </Button>
        </div>
      </header>
      <div className="dart-preview__body">
        <pre className="dart-code" aria-label="Generated Dart code">
          <code>{code}</code>
        </pre>
      </div>
    </section>
  );
}
