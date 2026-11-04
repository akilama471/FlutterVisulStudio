# Phase 10 - Design Portability: Implementation Plan

Status: **approved**

## Goal

Phase 10 makes designs leave and re-enter the studio safely. A project or a single canvas can be
exported to a versioned JSON file, imported only after a validated preview, protected by rotating
local snapshots, mirrored into an explicit project-folder file, and inspected or cleared from one
storage-management surface.

The phase keeps localStorage as the source of truth. Files are explicit copies, not a sync target,
and no cloud service, account, or multi-user behaviour is introduced.

## Scope

Delivered:

- Export the whole project or the active canvas to a versioned JSON file chosen through a native
  save dialog.
- Import a design file with schema validation, size limits, and a preview before anything changes.
- Project imports replace the canvas set; canvas imports add one canvas with a fresh id and a
  unique name.
- Automatic rotating snapshots in localStorage with a restore browser.
- An explicit project-folder design file at `.flutter-ui-studio/design.json`, written and read only
  when the user asks, backed up before overwrite, and ignored by Git and the explorer.
- A design-data dialog with storage sizes, per-canvas deletion, snapshot restore, and a confirmed
  reset-project-design action.

Excluded:

- Cloud sync, accounts, collaboration, and background filesystem watching.
- Automatic reads or writes of the project-folder design file.
- Importing files into arbitrary canvases or merging two projects widget-by-widget.
- Storing file tabs, undo history, or snapshots in the exported design file.
- New runtime dependencies.

## Portable File Format

New module `src/features/canvas/designTransfer.ts`.

```ts
type DesignFile = {
  format: "flutter-ui-studio-design";
  version: 1;
  scope: "project" | "canvas";
  exportedAt: string; // ISO timestamp
  projectName: string;
  design: {
    version: 2;
    activeId: string;
    canvases: Array<{ id: string; name: string; root: CanvasNode }>;
  };
};
```

Rules:

- The envelope is checked before the design. Unknown fields are ignored, as they already are in
  `parseDesignSet`.
- `design` is validated by the existing `parseDesignSet`, so node limits, depth, ids, names, and
  props keep exactly one implementation.
- A `canvas` file must contain exactly one canvas. A `project` file may contain 1-20 canvases.
- `projectName` and `exportedAt` are bounded metadata only; they never affect the open project.
- Maximum file size is 2 MiB in both the frontend and Rust (the storage design cap is 1 MiB, leaving
  room for the envelope).
- Parsing returns a discriminated result with a user-facing error instead of throwing for ordinary
  bad files.
- Exported names are sanitised: `<project>-project.json` and `<canvas>-canvas.json`, with unsafe
  characters replaced and a `design.json` fallback.
- Re-imported and restored designs are re-identified with fresh canvas and widget ids before they
  enter the workspace. This prevents id reuse against the current design, the internal clipboard,
  and the creation sequence.
- A canvas import uses the imported name when it is unique, otherwise `<name> (imported)` with a
  numeric suffix. It respects `MAX_CANVASES` and the 60-character name limit.

## Export and Import Behaviour

### Export

- The design-data dialog offers **Export project** and **Export active canvas**.
- The native save dialog supplies the destination. Rust writes the file only after rechecking the
  `.json` extension, absolute path, parent directory, UTF-8, NUL bytes, and the 2 MiB ceiling.
- An existing target is copied to `name.json.bak`, then `.bak.1`, and so on before overwrite.
- Success reports the destination, canvas count, and byte size. Failure keeps the dialog open with a
  recoverable message.

### Import

- The native open dialog selects a `.json` file. Rust reads it with the same size and encoding
  bounds, then the frontend parses the envelope.
- A preview shows: source scope, project label, export time, canvas names, canvas count, total node
  count, and byte size.
- Project scope previews **Replace the current design with N canvases**. Canvas scope previews
  **Add "name" to the current project**.
- Nothing changes until the confirm button is pressed. Cancel discards the parsed file.
- Confirming takes a `before-import` snapshot first, clears the old per-canvas undo history, applies
  the design, and bumps a workspace revision so the canvas editor remounts instead of showing stale
  reducer state.
- Import failures leave the current design untouched.

## Automatic Snapshots

New module `src/features/canvas/designSnapshots.ts`.

Storage key:

```text
flutter-ui-studio:snapshots:v1:<encoded project path>
```

Payload:

```ts
type SnapshotPayload = {
  version: 1;
  entries: Array<{
    id: string;
    createdAt: number;
    reason: "auto" | "before-import" | "before-restore" | "before-reset";
    design: DesignSet; // same version 2 shape as design storage
  }>;
};
```

Behaviour:

- Limits: 8 snapshots, 256 KiB per snapshot, and 1 MiB for the whole payload.
- Newest first. Adding beyond the entry or byte limit drops the oldest snapshots.
- An automatic snapshot is recorded after a successful design save when at least 60 seconds have
  passed since the newest snapshot and the serialized design differs from it. This captures long
  editing sessions without writing on every keystroke.
- A destructive action (`before-import`, `before-restore`, `before-reset`) always attempts a
  snapshot before changing the design, subject to the same size limits.
- Every snapshot is validated with `parseDesignSet` when loaded; corrupt entries are skipped rather
  than discarding the whole payload.
- Snapshots stay when the project design is reset, so a reset is recoverable.

## Project-Folder Design File

- Fixed location: `<project>/.flutter-ui-studio/design.json`.
- The directory is added to the Rust ignored-directory list, so it never appears in the project
  explorer and ordinary project-text commands cannot read or write it.
- On first write the app creates `.flutter-ui-studio/.gitignore` containing:

  ```text
  *
  !.gitignore
  ```

  so the design file is ignored by Git while the folder can still be tracked deliberately.

- **Write to project** serializes the current project exactly like an export and writes it through a
  dedicated Rust command. Existing files are backed up first.
- **Read from project** parses and previews the file with the same import flow, but the source label
  is the project design file.
- Missing, oversized, invalid, or unavailable files produce a clear message; nothing is written or
  replaced automatically.

## Storage Management UI

The canvas explorer header gains one **Design data** action (`database` icon). It opens
`DesignDataDialog`, which contains:

1. **Export** - project and active-canvas buttons, plus the last export result.
2. **Import** - file picker, validated preview, and an explicit confirm.
3. **Project file** - write/read buttons, the fixed relative path, and the last result.
4. **Snapshots** - count, newest time, and a **Browse snapshots** view. Each row shows time, reason,
   canvas count, and size; **Restore** asks for confirmation, snapshots the current design first,
   then applies the snapshot with fresh ids.
5. **Storage** - design, history, snapshot, legacy, and total sizes; a per-canvas row with name,
   node count, serialized size, and **Delete** (the existing undo toast remains the recovery path).
6. **Reset project design** - a danger confirmation that clears the design, legacy design, and
   history keys and starts from one starter canvas. Snapshots are intentionally kept.

All async actions disable their controls while running. Errors are rendered in the dialog, not as
uncaught rejections. Escape and the focus trap behave like the existing dialogs.

## Workspace State and Context

`DesignWorkspaceProvider` gains:

- `revision` - incremented after import, snapshot restore, or reset.
- `projectName`, `snapshots`, `storageUsage`, and `refreshStorageUsage`.
- `applyImportedDesign(set)` and `addImportedCanvas(canvas)`.
- `restoreSnapshot(id)`.
- `resetProjectDesign()`.
- A snapshot ref and a debounced/refreshed storage-usage calculation.

`DesignSurface` keys the canvas editor with `${activeCanvas.id}:${revision}` so a replacement with
the same active canvas id remounts the reducer and history.

On import, restore, and reset:

1. Attempt the pre-change snapshot.
2. Replace the set and mark it dirty for autosave.
3. Clear every persisted and in-memory undo/redo entry.
4. Clear pending delete toasts and the clipboard is left untouched.
5. Bump the revision and refresh storage usage.

`designStorageUsage.ts` computes byte sizes from the actual localStorage keys:

```ts
type DesignStorageUsage = {
  designBytes: number;
  legacyBytes: number;
  historyBytes: number;
  snapshotBytes: number;
  totalBytes: number;
};
```

## Rust Commands

New module `src-tauri/src/commands/design.rs`.

| Command                     | Purpose                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `write_design_export_file`  | Write a chosen export path with extension/size/encoding checks + backup. |
| `read_design_import_file`   | Read a chosen import path with the same bounds.                          |
| `write_project_design_file` | Write the fixed ignored project design file + `.gitignore`.              |
| `read_project_design_file`  | Read the fixed ignored project design file.                              |

Shared rules:

- Absolute paths only for export/import; `.json` extension required.
- Parent directory must exist; the target must not be a directory.
- Maximum 2 MiB, valid UTF-8, no NUL bytes.
- Existing files are backed up with the numbered `.bak` pattern.
- An optional expected modified time rejects a stale overwrite.
- Project design commands derive the path from `ProjectState`, never from a caller-supplied relative
  path. The design directory and `.gitignore` are created only during an explicit write.

`ProjectState` exposes a crate-only accessor for the canonical project root. `lib.rs` and
`commands/mod.rs` register the four commands. The dialog capability adds `dialog:allow-save` beside
the existing `dialog:allow-open`.

## Files

New:

- `docs/phase-10-plan.md`
- `src/features/canvas/designTransfer.ts`, `designTransfer.test.ts`
- `src/features/canvas/designSnapshots.ts`, `designSnapshots.test.ts`
- `src/features/canvas/designStorageUsage.ts`, `designStorageUsage.test.ts`
- `src/features/canvas/DesignDataDialog.tsx`, `DesignDataDialog.test.tsx`
- `src/shared/lib/designFiles.ts`, `designFiles.test.ts`
- `src-tauri/src/commands/design.rs`
- `docs/phase-10-implementation-report.md`

Changed:

- `src/features/canvas/designStorage.ts` (canvas byte helper; keep parse/serialize as the single
  validator)
- `src/features/canvas/designSet.ts` (only if a small insertion helper is needed)
- `src/features/canvas/designWorkspaceContext.ts`
- `src/features/canvas/DesignWorkspaceProvider.tsx`
- `src/features/canvas/CanvasList.tsx`, `CanvasList.test.tsx`
- `src/features/canvas/CanvasList.tsx` header CSS usage through `global.css`
- `src/app/DesignSurface.tsx`
- `src/shared/components/Icon.tsx`
- `src/shared/styles/global.css`
- `src-tauri/src/commands/project.rs` (ignored directory + root accessor + listing test)
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/capabilities/default.json`
- `README.md`
- `src/features/editor/WorkbenchHeader.tsx`
- `src/features/editor/EditorWelcome.tsx`

## Commit Sequence

1. `docs: add the Phase 10 implementation plan`
2. `feat(design): add the portable design file format and Rust file commands`
3. `feat(design): add rotating snapshots, storage usage, and workspace actions`
4. `feat(ui): add the design data dialog, snapshot restore, and storage management`
5. `test(design): cover transfer validation, snapshots, storage, and file services`
6. `docs: update the README and add the Phase 10 implementation report`

Each commit keeps the frontend checks green. Rust checks run with the file-command commit if any
Rust is changed, then again at the end.

## Verification

From the repository root:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Rust and desktop:

```text
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

Runtime smoke on the release executable with CDP:

- Export the project and a single canvas, confirm the files exist, and read them back through the
  import preview.
- Import a project file, verify replacement and canvas remount, then restore the pre-import snapshot.
- Import a canvas file and verify the added canvas has a unique name and fresh ids.
- Write and read `.flutter-ui-studio/design.json`; confirm the folder is hidden from the explorer and
  the inner `.gitignore` exists.
- Let an automatic snapshot appear, edit again, and restore the older one.
- Use storage management to delete a canvas and reset the project design; confirm sizes update.
- Zero console errors.

## Risks and Mitigations

- **Same-id replacement:** imported and restored designs are re-identified and the editor is keyed by
  a revision, so stale reducer state and id collisions cannot survive.
- **Storage quota:** snapshots have per-entry and whole-payload caps and are trimmed oldest-first;
  a failed snapshot write never blocks the design save.
- **File writes outside the project:** only a path returned by the native save dialog is accepted,
  with extension, size, encoding, and backup checks repeated in Rust.
- **Accidental project-file creation:** the `.flutter-ui-studio` directory is only created by the
  explicit write action and is hidden from the explorer.
- **Reset is destructive:** a `before-reset` snapshot is taken first and snapshots are retained, so
  the previous design remains recoverable.
- **Large clipboard or history payloads:** export/import do not touch them; import and restore clear
  stale history instead of carrying fingerprints across designs.
