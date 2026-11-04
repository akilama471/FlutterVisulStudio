import { useEffect, useMemo, useRef } from "react";
import { Button } from "../../shared/components/Button";
import { Icon } from "../../shared/components/Icon";
import { IconButton } from "../../shared/components/IconButton";
import { fileName, useFileWorkspace, type OpenFile } from "./fileWorkspaceContext";

type FileEditorProps = {
  file: OpenFile;
};

export function FileEditor({ file }: FileEditorProps) {
  const { updateFileContents, saveFile, reloadFile, requestCloseFile } = useFileWorkspace();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const dirty = file.contents !== file.savedContents;
  const lines = useMemo(() => file.contents.split("\n"), [file.contents]);
  const byteCount = useMemo(() => new TextEncoder().encode(file.contents).length, [file.contents]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "s") {
        return;
      }

      if (document.querySelector('[role="dialog"]')) {
        return;
      }

      event.preventDefault();
      saveFile(file.relativePath);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [file.relativePath, saveFile]);

  return (
    <section className="file-editor" aria-label={`Editor for ${file.relativePath}`}>
      <header className="file-editor__header">
        <div className="file-editor__identity">
          <Icon name="file" size={14} />
          <span className="file-editor__path" title={file.relativePath}>
            {file.relativePath}
          </span>
          <span
            className={dirty ? "file-editor__status is-dirty" : "file-editor__status"}
            role="status"
            aria-live="polite"
          >
            {file.saving ? "Saving…" : dirty ? "Modified" : "Saved"}
          </span>
        </div>
        <div className="file-editor__actions">
          <Button
            className="file-editor__reload"
            disabled={file.saving || file.status !== "ready" || dirty}
            onClick={() => reloadFile(file.relativePath)}
          >
            Reload
          </Button>
          <Button
            variant="primary"
            className="file-editor__save"
            disabled={!dirty || file.saving || file.status !== "ready"}
            onClick={() => saveFile(file.relativePath)}
          >
            Save
          </Button>
          <IconButton
            label={`Close file ${fileName(file.relativePath)}`}
            icon="x"
            onClick={() => requestCloseFile(file.relativePath)}
          />
        </div>
      </header>

      {file.externalChange ? (
        <div className="file-editor__banner" role="alert">
          <div>
            <strong>File changed on disk.</strong>{" "}
            <span>Reload the file or overwrite it with your local text.</span>
          </div>
          <div className="file-editor__banner-actions">
            <Button onClick={() => reloadFile(file.relativePath)}>Reload</Button>
            <Button variant="danger" onClick={() => saveFile(file.relativePath, { force: true })}>
              Overwrite
            </Button>
          </div>
        </div>
      ) : null}

      {file.saveError && !file.externalChange ? (
        <p className="file-editor__error" role="alert">
          {file.saveError}
        </p>
      ) : null}

      {file.status === "loading" ? (
        <p className="file-editor__note">Opening file…</p>
      ) : file.status === "error" ? (
        <div className="file-editor__error-state">
          <p className="file-editor__error" role="alert">
            {file.error ?? "The file could not be read."}
          </p>
          <div className="file-editor__error-actions">
            <Button onClick={() => reloadFile(file.relativePath)}>Retry</Button>
            <Button onClick={() => requestCloseFile(file.relativePath)}>Close tab</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="file-editor__body">
            <div ref={gutterRef} className="file-editor__gutter" aria-hidden="true">
              {lines.map((_, index) => (
                <span key={index}>{index + 1}</span>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="file-editor__textarea"
              aria-label={`Edit ${file.relativePath}`}
              value={file.contents}
              spellCheck={false}
              wrap="off"
              onChange={(event) => updateFileContents(file.relativePath, event.target.value)}
              onScroll={(event) => {
                if (gutterRef.current) {
                  gutterRef.current.scrollTop = event.currentTarget.scrollTop;
                }
              }}
            />
          </div>
          <footer className="file-editor__footer">
            <span>
              {lines.length} {lines.length === 1 ? "line" : "lines"}
            </span>
            <span>{byteCount.toLocaleString()} bytes</span>
            <span>UTF-8</span>
            {file.backupPath ? <span>Backup {file.backupPath}</span> : null}
          </footer>
        </>
      )}
    </section>
  );
}
