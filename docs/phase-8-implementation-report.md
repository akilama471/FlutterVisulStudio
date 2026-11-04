# Phase 8 — Project Explorer Completion: Implementation Report

Status: **complete**

## Summary

Phase 8 turns the explorer from a read-only tree into a small, safe file workspace. Existing project
text files can be opened in tabs beside **Canvas** and **Dart**, edited in a plain monospace editor,
saved with the toolbar or `Ctrl+S`, and reloaded when they change on disk. Saves are explicit, always
backed up, and protected by a modified-time conflict check.

Everything from Phases 0–7 still works: project opening and restoration, the lazy tree, the visual
canvas, widget inspector, local design persistence, canvas renaming and undo/redo, the Dart preview,
clipboard copy, and the diff-reviewed Dart apply flow.

## Delivered

### Backend (Rust)

New commands in `src-tauri/src/commands/project.rs`, registered in `lib.rs`:

| Command                   | Result                                              |
| ------------------------- | --------------------------------------------------- |
| `read_project_text_file`  | `relativePath`, `contents`, `bytes`, `modifiedMs`   |
| `stat_project_text_file`  | `relativePath`, `bytes`, `modifiedMs`               |
| `write_project_text_file` | `relativePath`, `backupPath`, `bytes`, `modifiedMs` |

Validation:

- Relative normal components only; absolute paths, prefixes, and `..` are rejected.
- The canonical target must stay under the canonical project root and must be an existing file.
- Any path component equal to `.git`, `.dart_tool`, or `build` (case-insensitive) is rejected.
- Reads reject non-files, invalid UTF-8, NUL bytes, and files over 1 MiB.
- Writes reject NUL bytes, contents over 1 MiB, and missing files.
- A write with an `expected_modified_ms` that does not match the current filesystem time is rejected
  with `The file changed on disk. Reload it before saving.`
- Every successful write copies the previous contents to the next free `name.bak`, `name.bak.1`,
  `name.bak.2`, … name before writing. A backup failure aborts the write.
- The existing Dart-only `read_project_file` / `write_project_file` commands are unchanged, so the
  apply flow keeps its `lib/**.dart` guarantee.

### Frontend service

`src/shared/lib/project.ts` adds runtime-validated wrappers:

- `readProjectTextFile`
- `statProjectTextFile`
- `writeProjectTextFile` (accepts `number | null` for an explicit overwrite)

Malformed payloads are rejected locally with `ProjectError` rather than entering React state.

### File workspace

New `src/features/files/`:

| File                        | Responsibility                                                     |
| --------------------------- | ------------------------------------------------------------------ |
| `fileWorkspaceContext.ts`   | Context contract, `useFileWorkspace`, tab-ID and file-name helpers |
| `FileWorkspaceProvider.tsx` | Open tabs, load/save/reload, focus checks, dirty-close guard       |
| `FileEditor.tsx`            | Path header, status, save/reload, banner, line gutter, textarea    |
| `FileInspector.tsx`         | File details in the inspector                                      |
| `DiscardFileDialog.tsx`     | Focus-trapped confirmation before discarding local edits           |

Behaviour:

- Re-opening an open file activates its tab; failures keep a tab with **Retry** and **Close tab**.
- The editor tracks `contents` against `savedContents` for dirty state and line/byte counts.
- `Ctrl+S` saves the active file and is suppressed while a dialog is open.
- Clean files reload automatically when `modifiedMs` changes; dirty files get an **External change**
  banner with **Reload** and **Overwrite**.
- Save conflicts reuse the same banner and keep the local text. **Overwrite** passes no baseline and
  still creates a backup.
- Closing a dirty tab opens `DiscardFileDialog`; `Escape` cancels. A `beforeunload` listener warns
  while any file tab is dirty.
- The provider is keyed by project path, so file tabs reset on project switch and restart.

### Editor shell and explorer

- `EditorArea` supports closable tabs, a dirty dot, a separate close button (never nested inside the
  select button), and a horizontally scrollable tab bar.
- `DesignSurface` now reads the active tab from `FileWorkspaceProvider` and renders
  **Canvas**, **Dart**, then file tabs. Canvas and Dart stay fixed.
- `App` wraps the project surface in `FileWorkspaceProvider` and passes the open-file callback down.
- `ProjectExplorer` gained a refresh button and open-file plumbing.
- `ProjectFiles` re-lists the root on refresh tokens.
- `ProjectTree` clears cached children and refetches every expanded folder on refresh, preserves
  expansion state, and sets `aria-selected` on file rows.
- The inspector shows file details whenever a file tab is active.
- A `refresh` icon and the file editor/inspector styles were added to the shared layer.

### Shell copy

The header badge is **Phase 8**, the welcome capabilities list **Project file editing**, and the
welcome note describes explicit saves, backups, and external-change protection.

## Tests

New and expanded tests:

- `src/shared/lib/project.test.ts`: text read/stat/write, malformed payloads, forced overwrite.
- `src/features/files/FileWorkspace.test.tsx`: open, edit/save, `Ctrl+S`, dirty close, Escape,
  clean auto-reload, dirty external-change banner, save conflict, read retry.
- `src/features/project/ProjectFiles.test.tsx`: root listing, file opening, lazy folder loading,
  refresh-token re-listing, root error.
- `src/app/App.test.tsx`: end-to-end open → edit → save through the explorer, plus the Phase 8 badge.
- `src/app/DesignSurface.test.tsx`: wrapped in `FileWorkspaceProvider`.

## Verification

All commands were run from the repository root on Windows.

| Check                      | Result                          |
| -------------------------- | ------------------------------- |
| `pnpm format:check`        | Pass                            |
| `pnpm lint`                | Pass                            |
| `pnpm typecheck`           | Pass                            |
| `pnpm test`                | **180 tests / 13 files passed** |
| `pnpm build`               | Pass                            |
| `cargo fmt --check`        | Pass                            |
| `cargo clippy -D warnings` | Pass                            |
| `cargo test`               | **21 tests passed**             |
| `pnpm tauri build`         | Pass                            |

Build artifacts:

```text
src-tauri/target/release/flutter-ui-studio.exe
src-tauri/target/release/bundle/msi/Flutter UI Studio_0.1.0_x64_en-US.msi      (2.98 MiB)
src-tauri/target/release/bundle/nsis/Flutter UI Studio_0.1.0_x64-setup.exe    (2.00 MiB)
```

## Launch smoke test

A clean fixture was created at
`C:\Users\Akila\AppData\Local\Temp\opencode\flutter-ui-studio-phase8-fixture` with `pubspec.yaml`,
`lib/main.dart`, and no backups. The release executable was started with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9335` and driven over the WebView2
DevTools protocol by `C:\Users\Akila\AppData\Local\Temp\opencode\phase-8-smoke.cjs`.

Procedure and observed results:

1. Seed and restore the fixture; the explorer listed `pubspec.yaml` and both fixed tabs were present
   (`Canvas`, `Dart`).
2. Open `pubspec.yaml`; the tab became active and the editor showed the exact file text.
3. Edit and click **Save**; the status moved to `Saved`, the file on disk matched, and
   `pubspec.yaml.bak` contained the original text.
4. Edit again and press `Ctrl+S`; the file matched and `pubspec.yaml.bak.1` held the previous
   contents.
5. Rewrite the file on disk while clean and dispatch focus; the editor reloaded automatically and no
   banner appeared.
6. Edit locally, rewrite the file on disk, and dispatch focus; the **File changed on disk** banner
   appeared with **Reload** and **Overwrite**. **Overwrite** wrote the local text, cleared the banner,
   and created `pubspec.yaml.bak.2`.
7. Create `notes.md` on disk and click refresh; the file appeared in the tree only after refresh, then
   opened correctly in a third tab.
8. Zero console errors or uncaught exceptions were recorded.

Screenshot (not committed): `C:\Users\Akila\AppData\Local\Temp\opencode\phase-8-editor.png`.

## Limitations

- `modifiedMs` uses filesystem millisecond resolution. An external edit that lands in the same
  millisecond as the last save can pass the conflict guard; the pre-write backup still preserves the
  overwritten contents.
- There is no filesystem watcher. Detection happens on refresh, window focus, tab activation, and
  save, so an external change can stay unnoticed while the window keeps focus.
- File creation, rename, deletion, and moves are out of scope, so a missing file can only be retried
  or closed.
- Only UTF-8 text up to 1 MiB is supported; binary files, assets, and images are rejected.
- Plain `<textarea>` editing means no syntax highlighting, folding, search, or diagnostics.
- Backup files (`*.bak`, `*.bak.N`) are ordinary files, so they appear in the explorer and can be
  opened.
- Opening file tabs and unsaved buffers are not persisted. A project switch drops them without a
  prompt; only individual tab closes and `beforeunload` are guarded.
- The project-switch prompt, file watching, and file management are listed for later phases in
  `docs/roadmap.md`.

## Commits

| Commit    | Summary                                                          |
| --------- | ---------------------------------------------------------------- |
| `73d1dc1` | `docs(plan): add remaining roadmap and Phase 8 plan`             |
| `c8abced` | `feat(tauri): add safe text file read, stat, and write commands` |
| `1257935` | `feat(files): add the file workspace, tabs, and editor`          |
| `7c92f88` | `feat(explorer): open project files and refresh the tree`        |
| `e832732` | `test(files): cover the explorer and file workspace`             |

The README and this report are committed separately as Phase 8 documentation.
