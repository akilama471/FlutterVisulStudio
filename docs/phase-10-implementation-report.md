# Phase 10 - Design Portability: Implementation Report

Status: **complete**

## Summary

Phase 10 makes designs portable. A whole project or the active canvas can be exported to a versioned
JSON file, and a file can be imported only after schema validation and an explicit preview. Rotating
snapshots in local storage protect long editing sessions and every destructive action. An optional
copy of the design can be written to `.flutter-ui-studio/design.json` on request, and one design-data
dialog now handles export, import, project files, snapshot restore, storage sizes, per-canvas
deletion, and a confirmed project reset.

Local storage remains the source of truth. Files are explicit copies rather than a sync target, and
no cloud service, account, or multi-user behaviour was introduced.

Everything from Phases 0-9 still works: project opening and restoration, the lazy file tree, file
tabs and safe saves, the canvas and Dart tabs, the inspector, multi-select and drag/drop editing,
per-canvas undo history, canvas management, the Dart preview, and the diff-reviewed apply flow.

## Delivered

### Portable file format

New module `src/features/canvas/designTransfer.ts`.

```ts
type DesignFile = {
  format: "flutter-ui-studio-design";
  version: 1;
  scope: "project" | "canvas";
  exportedAt: string;
  projectName: string;
  design: DesignSet; // version 2, validated by parseDesignSet
};
```

- The envelope is checked before the design; unknown fields are ignored.
- The inner design is validated by the existing `parseDesignSet`, so node limits, depth, ids, names,
  and props have exactly one implementation.
- A `canvas` file must contain one canvas; a `project` file may contain 1-20.
- Files are capped at 2 MiB in both the frontend and Rust.
- Parsing returns a discriminated result with a user-facing error rather than throwing for ordinary
  bad files.
- Export names are sanitised to `<project>-project.json` and `<canvas>-canvas.json`, with a
  `design-project.json` fallback.
- Imported and restored designs are re-identified with fresh canvas and widget ids. A canvas import
  is inserted after the active canvas with a unique name (`<name> (imported)`, then
  `<name> (imported 2)`), respecting the 60-character and 20-canvas limits.

### Export and import

- **Export project** and **Export active canvas** use the native save dialog. The path must be
  absolute and end in `.json`; Rust rechecks the extension, parent directory, UTF-8, NUL bytes, and
  the 2 MiB ceiling.
- An existing export target is copied to `name.json.bak`, then `.bak.1`, `.bak.2`, and so on before
  it is replaced.
- **Import** reads a chosen `.json` file and shows the source, project label, export time, canvas
  names, canvas and widget counts, and byte size. Nothing changes before **Import and replace** or
  **Add canvas** is pressed.
- A project import replaces the set; a canvas import adds one canvas. Both take a `before-import`
  snapshot, clear per-canvas history, mark the design dirty, and bump a workspace revision so the
  canvas editor remounts with fresh reducer state.
- Import failures leave the current design untouched.

### Rotating snapshots

New module `src/features/canvas/designSnapshots.ts`.

- Storage key: `flutter-ui-studio:snapshots:v1:<encoded project path>`.
- Up to 8 snapshots, 256 KiB each, 1 MiB total, newest first; older entries are dropped first.
- An automatic snapshot is recorded after a successful save when at least 60 seconds have passed
  since the newest snapshot and the design differs from it.
- `before-import`, `before-restore`, and `before-reset` always attempt a snapshot before changing the
  design.
- Every entry is validated with `parseDesignSet` while loading; corrupt entries are skipped rather
  than discarding the whole payload.
- The snapshot browser shows time, reason, canvas count, names, and size, and requires confirmation
  before restoring. Restoring snapshots the current design first, then applies the snapshot with
  fresh ids.
- Snapshots are kept when the project design is reset.

### Project-folder design file

- Fixed location: `<project>/.flutter-ui-studio/design.json`.
- The directory is in the Rust ignored-directory list, so it never appears in the explorer and
  ordinary project-text commands reject it.
- The first explicit write also creates `.flutter-ui-studio/.gitignore` containing:

  ```text
  *
  !.gitignore
  ```

- **Write to project** serialises the current project exactly like an export and writes it through a
  dedicated command. **Read from project** parses the file and reuses the import preview and
  confirmation flow.
- The file is never read or written automatically. Missing, oversized, invalid, or unavailable files
  produce a clear message and leave the design untouched.

### Storage management

`DesignDataDialog` is opened from the **Design data** button in the canvas explorer header. It
contains export, import, project-file, snapshot, storage, and reset sections.

- Storage sizes are measured from the actual local-storage keys: design, undo history, snapshots,
  legacy design, and total, in UTF-8 bytes.
- Every canvas row shows its name, widget count, serialised size, and **Delete**. Deletion uses the
  existing canvas delete path, so the 10-second undo notification remains the recovery route.
- **Reset project design** asks for confirmation, takes a `before-reset` snapshot, clears the design,
  legacy design, and history keys, and starts from one starter canvas. Snapshots are kept.
- All asynchronous actions disable their controls while running; errors appear in the dialog.
- Escape, the backdrop, and the focus trap behave like the existing dialogs.

### Workspace and editor integration

`DesignWorkspaceProvider` gained `projectName`, `revision`, `snapshots`, `storageUsage`,
`refreshStorageUsage`, `captureSnapshot`, `applyImportedDesign`, `addImportedCanvas`,
`restoreSnapshot`, and `resetProjectDesign`. `DesignSurface` keys the editor with
`${activeCanvas.id}:${revision}` so a replacement with the same active canvas id remounts the
reducer and history.

### Rust commands

New module `src-tauri/src/commands/design.rs`.

| Command                     | Purpose                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| `write_design_export_file`  | Write a chosen export path with extension, size, and backup rules |
| `read_design_import_file`   | Read a chosen import path with the same bounds                    |
| `write_project_design_file` | Write the fixed ignored project design file and `.gitignore`      |
| `read_project_design_file`  | Read the fixed ignored project design file                        |

Shared rules: absolute `.json` paths for export/import, an existing parent directory, a 2 MiB cap,
valid UTF-8, no NUL bytes, numbered backups, and an optional expected modified time that rejects a
stale overwrite. Project-file commands derive the path from `ProjectState` rather than a caller path.
`ProjectState` exposes a crate-only `active_root` accessor, and the dialog capability adds
`dialog:allow-save`.

## Files

New:

- `docs/phase-10-plan.md`
- `docs/phase-10-implementation-report.md`
- `src/features/canvas/designTransfer.ts`, `designTransfer.test.ts`
- `src/features/canvas/designSnapshots.ts`, `designSnapshots.test.ts`
- `src/features/canvas/designStorageUsage.ts`, `designStorageUsage.test.ts`
- `src/features/canvas/DesignDataDialog.tsx`, `DesignDataDialog.test.tsx`
- `src/shared/lib/designFiles.ts`, `designFiles.test.ts`
- `src-tauri/src/commands/design.rs`

Changed:

- `src/features/canvas/designStorage.ts` (canvas byte helper)
- `src/features/canvas/designWorkspaceContext.ts`
- `src/features/canvas/DesignWorkspaceProvider.tsx`
- `src/features/canvas/CanvasList.tsx`
- `src/app/DesignSurface.tsx`
- `src/shared/components/Icon.tsx`
- `src/shared/styles/global.css`
- `src-tauri/src/commands/project.rs` (ignored directory, root accessor, listing test)
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/capabilities/default.json`
- `README.md`
- `src/features/editor/WorkbenchHeader.tsx`
- `src/features/editor/EditorWelcome.tsx`
- `src/app/App.test.tsx`

## Verification

Frontend, from the repository root:

| Command             | Result                                    |
| ------------------- | ----------------------------------------- |
| `pnpm format:check` | pass                                      |
| `pnpm lint`         | pass                                      |
| `pnpm typecheck`    | pass                                      |
| `pnpm test`         | 281 tests in 19 files pass                |
| `pnpm build`        | pass (TypeScript + Vite production build) |

Test breakdown for the new surface:

- `designTransfer.test.ts`: 17 tests for envelope parsing, size limits, file names, ids, canvas
  imports, names, and node counting.
- `designSnapshots.test.ts`: 14 tests for creation, rotation, byte limits, auto-capture rules,
  serialisation, corrupt entries, summaries, and storage failures.
- `designStorageUsage.test.ts`: 5 tests for byte measurement, clearing, snapshot retention, and
  formatting.
- `designFiles.test.ts`: 10 tests for dialogs, Tauri command wrappers, malformed responses, and error
  normalisation.
- `DesignDataDialog.test.tsx`: 11 tests for dialog sections, export, import preview and confirmation,
  project files, snapshot restore, storage deletion, reset, and Escape.

Rust and desktop:

| Command                                                                          | Result        |
| -------------------------------------------------------------------------------- | ------------- |
| `cargo fmt --check --manifest-path src-tauri/Cargo.toml`                         | pass          |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | pass          |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | 29 tests pass |
| `pnpm tauri build`                                                               | pass          |

Runtime smoke on the release executable with WebView2 remote debugging:

- Opened the design-data dialog and verified all five sections and measured canvas sizes.
- Wrote `.flutter-ui-studio/design.json`; confirmed the file, the inner `.gitignore`, and that the
  folder is hidden from the project listing and rejected by the ordinary text reader.
- Read the project file through the preview, confirmed the import, and verified the before-import
  snapshot and remounted canvas.
- Restored an older snapshot after confirmation.
- Added a canvas, deleted a canvas from storage management, and undid it from the notification.
- Reset the project design and confirmed snapshots were retained.
- Round-tripped a design through the Rust export/import commands and verified a numbered backup on
  overwrite.
- Zero console errors.

The final smoke run kept 3 snapshots before reset and 4 after, ended with one `Canvas 1`, wrote a
744-byte export, and reported no console errors.

## Limitations

- Export and import use the native dialogs; the smoke test drives the Rust commands and the in-app
  import preview, not the operating-system file pickers.
- Snapshots and undo history are intentionally not included in exported files.
- The project design file is never read or written automatically; there is no filesystem watcher.
- Imports replace a project or add one canvas. There is no widget-level merge between projects.
- Automatic snapshots are rate-limited to one per minute and capped at 8 entries / 1 MiB, so very
  long sessions keep only recent restore points.
- Open file tabs, unsaved file buffers, and panel visibility are still not persisted.

## Commits

| Commit        | Summary                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `b8f3f0d`     | `docs: add the Phase 10 implementation plan`                                     |
| `e2619eb`     | `feat(design): add portable design files and Rust file commands`                 |
| `7e2206e`     | `feat(design): add rotating snapshots and storage usage helpers`                 |
| `a8779c6`     | `feat(ui): add the design data dialog, snapshot restore, and storage management` |
| `this commit` | `docs: update the README and add the Phase 10 implementation report`             |

The plan proposed separate test commits. Transfer and file-service tests landed with their modules
so each commit stayed buildable; the UI tests land with the dialog. The README and this report are
committed together at the end of the phase.
