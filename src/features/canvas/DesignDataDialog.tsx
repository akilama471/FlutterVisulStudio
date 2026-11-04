import { useEffect, useRef, useState } from "react";
import { Button } from "../../shared/components/Button";
import { IconButton } from "../../shared/components/IconButton";
import { useDialogFocusTrap } from "../../shared/lib/useDialogFocusTrap";
import {
  chooseDesignExportPath,
  chooseDesignImportPath,
  designFileErrorMessage,
  readDesignImportFile,
  readProjectDesignFile,
  writeDesignExportFile,
  writeProjectDesignFile,
} from "../../shared/lib/designFiles";
import { canvasDesignBytes } from "./designStorage";
import {
  defaultDesignFileName,
  parseDesignFile,
  serializeDesignFile,
  type DesignFilePreview,
} from "./designTransfer";
import type { DesignSnapshot, SnapshotReason } from "./designSnapshots";
import { formatStorageBytes } from "./designStorageUsage";
import { useDesignWorkspace } from "./designWorkspaceContext";
import type { CanvasNode } from "./model";

const REASON_LABELS: Record<SnapshotReason, string> = {
  auto: "Automatic",
  "before-import": "Before import",
  "before-restore": "Before restore",
  "before-reset": "Before reset",
};

type PendingImport = {
  source: "file" | "project";
  file: DesignFilePreview;
};

type DesignDataDialogProps = {
  onClose: () => void;
};

export function DesignDataDialog({ onClose }: DesignDataDialogProps) {
  const {
    canvases,
    activeCanvas,
    activeId,
    projectName,
    canDeleteCanvas,
    atCanvasLimit,
    storageUsage,
    snapshots,
    deleteCanvas,
    applyImportedDesign,
    addImportedCanvas,
    restoreSnapshot,
    resetProjectDesign,
  } = useDesignWorkspace();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"main" | "snapshots">("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  useDialogFocusTrap(dialogRef);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>(".design-data__close")?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();

      if (pendingImport) {
        setPendingImport(null);
      } else if (confirmReset) {
        setConfirmReset(false);
      } else if (confirmRestore) {
        setConfirmRestore(null);
      } else if (view === "snapshots") {
        setView("main");
      } else {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmReset, confirmRestore, onClose, pendingImport, view]);

  function currentSet(scope: "project" | "canvas") {
    return scope === "project"
      ? { canvases, activeId }
      : { canvases: [activeCanvas], activeId: activeCanvas.id };
  }

  async function exportDesign(scope: "project" | "canvas") {
    setError(null);
    setStatus(null);
    const raw = serializeDesignFile(currentSet(scope), scope, projectName);
    const parsed = parseDesignFile(raw);

    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setBusy(true);

    try {
      const path = await chooseDesignExportPath(
        defaultDesignFileName(projectName, activeCanvas.name, scope),
      );

      if (!path) {
        return;
      }

      const result = await writeDesignExportFile(path, raw, null);
      setStatus(
        `Exported ${parsed.file.canvasCount} canvas${parsed.file.canvasCount === 1 ? "" : "es"} (${formatStorageBytes(result.bytes)}) to ${result.path}.`,
      );
    } catch (exportError) {
      setError(designFileErrorMessage(exportError));
    } finally {
      setBusy(false);
    }
  }

  async function importDesign(source: "file" | "project") {
    setError(null);
    setStatus(null);
    setBusy(true);

    try {
      let contents: string;
      let bytes: number;

      if (source === "project") {
        const file = await readProjectDesignFile();
        contents = file.contents;
        bytes = file.bytes;
      } else {
        const path = await chooseDesignImportPath();

        if (!path) {
          return;
        }

        const file = await readDesignImportFile(path);
        contents = file.contents;
        bytes = file.bytes;
      }

      const parsed = parseDesignFile(contents);

      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }

      setPendingImport({
        source,
        file: { ...parsed.file, bytes },
      });
    } catch (importError) {
      setError(designFileErrorMessage(importError));
    } finally {
      setBusy(false);
    }
  }

  function confirmImport() {
    if (!pendingImport) {
      return;
    }

    if (pendingImport.file.scope === "project") {
      if (!applyImportedDesign(pendingImport.file.set)) {
        setError("The imported design could not be applied.");
        return;
      }

      const count = pendingImport.file.canvasCount;
      setStatus(`Imported ${count} canvas${count === 1 ? "" : "es"} and replaced this design.`);
    } else {
      const canvas = pendingImport.file.set.canvases[0];

      if (!canvas || !addImportedCanvas(canvas)) {
        setError("The imported canvas could not be added. The canvas limit may be reached.");
        return;
      }

      setStatus(`Added “${canvas.name}” to this project.`);
    }

    setPendingImport(null);
  }

  async function writeProjectFile() {
    setError(null);
    setStatus(null);
    const raw = serializeDesignFile(currentSet("project"), "project", projectName);
    const parsed = parseDesignFile(raw);

    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setBusy(true);

    try {
      const result = await writeProjectDesignFile(raw);
      const backup = result.backupPath ? ` Previous file backed up to ${result.backupPath}.` : "";
      setStatus(`Wrote ${result.relativePath}.${backup}`);
    } catch (writeError) {
      setError(designFileErrorMessage(writeError));
    } finally {
      setBusy(false);
    }
  }

  function confirmSnapshotRestore() {
    if (!confirmRestore) {
      return;
    }

    const restored = restoreSnapshot(confirmRestore);

    if (!restored) {
      setError("That snapshot is no longer available.");
    } else {
      setStatus("Snapshot restored. The previous design was saved as a new snapshot.");
    }

    setConfirmRestore(null);
    setView("main");
  }

  function confirmProjectReset() {
    resetProjectDesign();
    setConfirmReset(false);
    setStatus("Project design reset to a starter canvas. Snapshots were kept.");
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="dialog dialog--data"
        role="dialog"
        aria-modal="true"
        aria-labelledby="design-data-title"
      >
        <header className="dialog__header">
          <div className="design-data__heading">
            <div>
              <h2 id="design-data-title" className="dialog__title">
                {view === "snapshots" ? "Snapshots" : "Design data"}
              </h2>
              <p className="dialog__description">
                {view === "snapshots"
                  ? "Automatic and pre-change copies of this project design."
                  : "Move designs between projects, protect them with snapshots, and manage storage."}
              </p>
            </div>
            <IconButton
              className="dialog__close design-data__close"
              label="Close design data"
              icon="x"
              onClick={onClose}
            />
          </div>
        </header>

        <div className="design-data__body">
          {error ? (
            <p className="data-alert data-alert--error" role="alert">
              {error}
            </p>
          ) : null}
          {status ? (
            <p className="data-alert data-alert--success" role="status">
              {status}
            </p>
          ) : null}

          {view === "snapshots" ? (
            <SnapshotsView
              snapshots={snapshots}
              confirmId={confirmRestore}
              onAskRestore={setConfirmRestore}
              onCancelRestore={() => setConfirmRestore(null)}
              onConfirmRestore={confirmSnapshotRestore}
              onBack={() => setView("main")}
            />
          ) : (
            <>
              <section className="design-data__section" aria-labelledby="data-export-title">
                <h3 id="data-export-title" className="design-data__section-title">
                  Export
                </h3>
                <p className="design-data__note">
                  Save a versioned JSON copy. Widgets and canvases are included; undo history and
                  snapshots are not.
                </p>
                <div className="design-data__actions">
                  <Button
                    icon="download"
                    disabled={busy}
                    onClick={() => void exportDesign("project")}
                  >
                    Export project
                  </Button>
                  <Button
                    icon="download"
                    disabled={busy}
                    onClick={() => void exportDesign("canvas")}
                  >
                    Export active canvas
                  </Button>
                </div>
              </section>

              <section className="design-data__section" aria-labelledby="data-import-title">
                <h3 id="data-import-title" className="design-data__section-title">
                  Import
                </h3>
                <p className="design-data__note">
                  Choose a design file, review the preview, then confirm. Nothing changes before
                  confirmation.
                </p>
                <div className="design-data__actions">
                  <Button icon="upload" disabled={busy} onClick={() => void importDesign("file")}>
                    Choose design file…
                  </Button>
                </div>

                {pendingImport ? (
                  <ImportPreview
                    pending={pendingImport}
                    atCanvasLimit={atCanvasLimit}
                    onCancel={() => setPendingImport(null)}
                    onConfirm={confirmImport}
                  />
                ) : null}
              </section>

              <section className="design-data__section" aria-labelledby="data-project-title">
                <h3 id="data-project-title" className="design-data__section-title">
                  Project file
                </h3>
                <p className="design-data__note">
                  Optional copy at <code>.flutter-ui-studio/design.json</code>. It is created only
                  when you write it, is ignored by Git, and is hidden from the explorer.
                </p>
                <div className="design-data__actions">
                  <Button icon="file" disabled={busy} onClick={() => void writeProjectFile()}>
                    Write to project
                  </Button>
                  <Button
                    icon="refresh"
                    disabled={busy}
                    onClick={() => void importDesign("project")}
                  >
                    Read from project
                  </Button>
                </div>
              </section>

              <section className="design-data__section" aria-labelledby="data-snapshots-title">
                <h3 id="data-snapshots-title" className="design-data__section-title">
                  Snapshots
                </h3>
                <p className="design-data__note">
                  {snapshots.length === 0
                    ? "No snapshots yet. One is taken about a minute into editing and before destructive changes."
                    : `${snapshots.length} snapshot${snapshots.length === 1 ? "" : "s"} · newest ${formatTime(snapshots[0].createdAt)}.`}
                </p>
                <div className="design-data__actions">
                  <Button icon="undo" onClick={() => setView("snapshots")}>
                    Browse snapshots
                  </Button>
                </div>
              </section>

              <section className="design-data__section" aria-labelledby="data-storage-title">
                <h3 id="data-storage-title" className="design-data__section-title">
                  Storage
                </h3>
                <dl className="design-data__usage">
                  <UsageRow label="Design" bytes={storageUsage.designBytes} />
                  <UsageRow label="Undo history" bytes={storageUsage.historyBytes} />
                  <UsageRow label="Snapshots" bytes={storageUsage.snapshotBytes} />
                  {storageUsage.legacyBytes > 0 ? (
                    <UsageRow label="Legacy design" bytes={storageUsage.legacyBytes} />
                  ) : null}
                  <UsageRow label="Total" bytes={storageUsage.totalBytes} strong />
                </dl>

                <ul className="design-data__canvases">
                  {canvases.map((canvas) => (
                    <li key={canvas.id} className="design-data__canvas">
                      <div className="design-data__canvas-info">
                        <span className="design-data__canvas-name">{canvas.name}</span>
                        <span className="design-data__canvas-meta">
                          {widgetLabel(countNodes(canvas.root))} ·{" "}
                          {formatStorageBytes(canvasDesignBytes(canvas))}
                        </span>
                      </div>
                      <Button
                        variant="danger"
                        icon="trash"
                        disabled={!canDeleteCanvas || busy}
                        ariaLabel={`Delete ${canvas.name} from storage`}
                        onClick={() => {
                          deleteCanvas(canvas.id);
                          setStatus(`Deleted “${canvas.name}”. Use the notification to undo.`);
                        }}
                      >
                        Delete
                      </Button>
                    </li>
                  ))}
                </ul>

                {confirmReset ? (
                  <div className="design-data__confirm" role="alert">
                    <p>
                      Reset this project to one starter canvas? Unsaved edits are lost, but a
                      pre-reset snapshot is kept so you can restore this design.
                    </p>
                    <div className="design-data__actions">
                      <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
                      <Button variant="danger" onClick={confirmProjectReset}>
                        Reset project design
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="design-data__actions">
                    <Button
                      variant="danger"
                      icon="trash"
                      disabled={busy}
                      onClick={() => setConfirmReset(true)}
                    >
                      Reset project design
                    </Button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="dialog__actions">
          {view === "snapshots" ? <Button onClick={() => setView("main")}>Back</Button> : null}
          <Button onClick={onClose}>Close</Button>
        </footer>
      </div>
    </div>
  );
}

type ImportPreviewProps = {
  pending: PendingImport;
  atCanvasLimit: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function ImportPreview({ pending, atCanvasLimit, onCancel, onConfirm }: ImportPreviewProps) {
  const { file } = pending;
  const addBlocked = file.scope === "canvas" && atCanvasLimit;

  return (
    <div className="design-data__preview">
      <p className="design-data__preview-title">
        {file.scope === "project"
          ? `Replace this design with ${file.canvasCount} canvas${file.canvasCount === 1 ? "" : "es"}?`
          : `Add “${file.set.canvases[0]?.name ?? "Imported canvas"}” to this project?`}
      </p>
      <dl className="design-data__usage">
        <UsageRow
          label="Source"
          text={pending.source === "project" ? "Project file" : "Design file"}
        />
        <UsageRow label="Project" text={file.projectName} />
        <UsageRow label="Exported" text={file.exportedAt} />
        <UsageRow label="Canvases" text={String(file.canvasCount)} />
        <UsageRow label="Widgets" text={String(file.nodeCount)} />
        <UsageRow label="Size" text={formatStorageBytes(file.bytes)} />
      </dl>
      <ul className="design-data__preview-canvases">
        {file.set.canvases.map((canvas) => (
          <li key={canvas.id}>
            <span>{canvas.name}</span>
            <span>{widgetLabel(countNodes(canvas.root))}</span>
          </li>
        ))}
      </ul>
      <p className="design-data__note">
        {file.scope === "project"
          ? "The current design stays untouched until you confirm. A snapshot is taken first."
          : addBlocked
            ? "The canvas limit is reached. Delete a canvas before importing this one."
            : "The canvas is added with fresh widget ids. A snapshot is taken first."}
      </p>
      <div className="design-data__actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={addBlocked} onClick={onConfirm}>
          {file.scope === "project" ? "Import and replace" : "Add canvas"}
        </Button>
      </div>
    </div>
  );
}

type SnapshotsViewProps = {
  snapshots: readonly DesignSnapshot[];
  confirmId: string | null;
  onAskRestore: (id: string) => void;
  onCancelRestore: () => void;
  onConfirmRestore: () => void;
  onBack: () => void;
};

function SnapshotsView({
  snapshots,
  confirmId,
  onAskRestore,
  onCancelRestore,
  onConfirmRestore,
  onBack,
}: SnapshotsViewProps) {
  if (snapshots.length === 0) {
    return (
      <section className="design-data__section">
        <p className="design-data__empty">
          No snapshots yet. Keep editing and an automatic snapshot will appear after about a minute.
        </p>
        <div className="design-data__actions">
          <Button onClick={onBack}>Back</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="design-data__section" aria-label="Saved snapshots">
      <ul className="design-data__snapshots">
        {snapshots.map((snapshot) => (
          <li key={snapshot.id} className="design-data__snapshot">
            <div className="design-data__snapshot-info">
              <span className="design-data__snapshot-time">{formatTime(snapshot.createdAt)}</span>
              <span className="design-data__snapshot-meta">
                {REASON_LABELS[snapshot.reason]} · {snapshot.set.canvases.length} canvas
                {snapshot.set.canvases.length === 1 ? "" : "es"} ·{" "}
                {formatStorageBytes(snapshot.bytes)}
              </span>
              <span className="design-data__snapshot-canvases">
                {snapshot.set.canvases.map((canvas) => canvas.name).join(", ")}
              </span>
            </div>

            {confirmId === snapshot.id ? (
              <div className="design-data__snapshot-confirm">
                <p>Restore this snapshot? The current design is saved as a new snapshot first.</p>
                <div className="design-data__actions">
                  <Button onClick={onCancelRestore}>Cancel</Button>
                  <Button variant="primary" onClick={onConfirmRestore}>
                    Restore snapshot
                  </Button>
                </div>
              </div>
            ) : (
              <Button icon="undo" onClick={() => onAskRestore(snapshot.id)}>
                Restore
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

type UsageRowProps = {
  label: string;
  bytes?: number;
  text?: string;
  strong?: boolean;
};

function UsageRow({ label, bytes, text, strong }: UsageRowProps) {
  return (
    <div
      className={
        strong ? "design-data__usage-row design-data__usage-row--strong" : "design-data__usage-row"
      }
    >
      <dt>{label}</dt>
      <dd>{text ?? formatStorageBytes(bytes ?? 0)}</dd>
    </div>
  );
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString();
}

function widgetLabel(count: number): string {
  return `${count} widget${count === 1 ? "" : "s"}`;
}

function countNodes(root: CanvasNode): number {
  let count = 0;
  const stack = [root];

  while (stack.length > 0) {
    const node = stack.pop();

    if (!node) {
      continue;
    }

    count += 1;
    stack.push(...node.children);
  }

  return count;
}
