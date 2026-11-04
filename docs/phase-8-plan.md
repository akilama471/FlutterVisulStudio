# Phase 8 — Project Explorer Completion Plan

Status: **approved for implementation** (scope selected by the user)

## Objective

Finish the project explorer so a Flutter project can be browsed, opened, edited, saved, and reloaded
inside the studio. Phase 8 is the file-workspace phase: it turns the existing lazy tree into a real
editor surface without adding syntax highlighting, file management, or file watching.

The visual canvas, Dart preview, design persistence, and safe Dart apply flow must keep working.

## Scope

1. **Open project files**
   - Clicking a file in the explorer opens it in an editor tab.
   - **Canvas** and **Dart** remain fixed tabs; file tabs are appended and closable.
   - Re-opening an already open file activates its tab instead of duplicating it.
   - A failed read keeps a tab with the error and a **Retry** action.
2. **Edit and save text files**
   - Plain monospace editor with line numbers, no wrapping, and a modified indicator.
   - **Save** button and `Ctrl+S`; no autosave for project files.
   - Saving an existing file creates a sibling backup (`name.bak`, then `.bak.1`, `.bak.2`, …).
   - UTF-8 text only, NUL-free, capped at 1 MiB.
   - Any file inside the project root can be edited except paths under `.git`, `.dart_tool`, and
     `build`. Writing a missing file is rejected.
3. **Safe reload and conflict handling**
   - Reads and stats return `modifiedMs`; writes send the expected `modifiedMs`.
   - A changed file is detected on window focus, tab activation, and before saving.
   - A clean file reloads from disk automatically; a dirty file shows an **External change** banner
     with **Reload** and **Overwrite** actions.
   - A save conflict shows the same banner and keeps the local text.
   - Backups still happen on overwrite, so the external version is recoverable.
4. **Explorer refresh**
   - A refresh button reloads the tree and expanded folders.
   - The tree refreshes after a successful save.
   - Expansion state is preserved; stale child entries are refetched.
5. **Tab lifecycle**
   - Dirty tabs show a dot and expose an accessible close label.
   - Closing a dirty tab asks for confirmation before discarding.
   - Unsaved file tabs are not persisted across project switches or restarts; closing the window
     with dirty file tabs asks the WebView to confirm.
6. **Inspector**
   - When a file tab is active, the inspector shows its path, size, last-known modified time, and
     save status instead of the canvas widget inspector.
7. **Docs**
   - README usage for opening, editing, saving, refreshing, and conflicts.
   - `docs/phase-8-implementation-report.md` with results and limitations.

## Decisions

- **Two command families.** The existing `read_project_file` / `write_project_file` commands stay
  restricted to `lib/**.dart` because the Dart apply flow depends on that guarantee. Phase 8 adds
  separate general text commands with their own validation.
- **Text detection.** A file is editable when it is at most 1 MiB, decodes as UTF-8, and contains no
  NUL byte. No extension allowlist, so `pubspec.yaml`, `README.md`, Gradle files, and JSON are all
  openable while binaries and assets are rejected.
- **Existing files only.** Phase 8 edits files that already exist. Creation, rename, and deletion are
  later phases; this keeps write scope small and avoids creating stray files.
- **Backups always.** Every successful save copies the previous contents to the next free `.bak`
  name before writing, matching the Phase 5 apply rule.
- **Modified-time conflicts.** `modified_ms` comes from the filesystem's modified timestamp. A save
  with a mismatched baseline is rejected before any write. The UI then offers reload or an explicit
  overwrite that passes no baseline and still creates a backup.
- **Tabs live in a provider.** A new `FileWorkspaceProvider` owns open files and the active tab, so
  the explorer, editor, and inspector can cooperate without cross-feature imports. Composition stays
  in `app/`.
- **Plain editor.** A `<textarea>` with a synced line-number gutter. No syntax highlighting, code
  folding, search, or diagnostics in this phase. This keeps the editor accessible and dependency-free.
- **Refresh, not watching.** No filesystem watcher. Detection happens on manual refresh, window
  focus, tab activation, and save. This avoids background handles and platform differences.
- **Dirty guard.** Closing a dirty tab uses an in-app confirmation dialog with the existing focus
  trap. A `beforeunload` listener asks for confirmation when dirty file tabs exist.
- **No new dependency.** All UI and state use existing React and shared components.

## Data and API changes

### Rust (`src-tauri/src/commands/project.rs`)

```rust
pub struct ProjectTextFile {
    pub relative_path: String,
    pub contents: String,
    pub bytes: usize,
    pub modified_ms: u64,
}

pub struct ProjectTextFileStat {
    pub relative_path: String,
    pub bytes: usize,
    pub modified_ms: u64,
}

pub struct ProjectTextWriteResult {
    pub relative_path: String,
    pub backup_path: Option<String>,
    pub bytes: usize,
    pub modified_ms: u64,
}
```

New commands registered in `lib.rs`:

- `read_project_text_file(relative_path)`.
- `stat_project_text_file(relative_path)`.
- `write_project_text_file(relative_path, contents, expected_modified_ms)`.

Validation:

- Normal path components only; no absolute paths, prefixes, or `..`.
- Target must resolve under the canonical project root and be an existing file.
- Reject any path component matching `.git`, `.dart_tool`, or `build`.
- Reads and writes capped at 1 MiB.
- Reads reject invalid UTF-8, NUL bytes, and non-files.
- Writes require a matching `expected_modified_ms` unless the caller explicitly omits it.
- A backup failure aborts the write.

### Frontend service (`src/shared/lib/project.ts`)

- `ProjectTextFile`, `ProjectTextFileStat`, `ProjectTextWriteResult` types with validation.
- `readProjectTextFile`, `statProjectTextFile`, `writeProjectTextFile`.
- Existing project file functions are untouched.

### File workspace (`src/features/files/`)

| File                        | Responsibility                                                     |
| --------------------------- | ------------------------------------------------------------------ |
| `fileWorkspaceContext.ts`   | Context shape and `useFileWorkspace`                               |
| `FileWorkspaceProvider.tsx` | Open tabs, active tab, load/save/reload, focus checks, close guard |
| `FileEditor.tsx`            | Header, line gutter, textarea, status, banner, save/reload actions |
| `FileInspector.tsx`         | File details in the inspector                                      |
| `DiscardFileDialog.tsx`     | In-app discard confirmation                                        |

Context shape:

```ts
type OpenFile = {
  relativePath: string;
  contents: string;
  savedContents: string;
  modifiedMs: number;
  status: "loading" | "ready" | "error";
  error: string | null;
  saving: boolean;
  saveError: string | null;
  externalChange: boolean;
  backupPath: string | null;
};

type FileWorkspace = {
  files: OpenFile[];
  activeTabId: string; // "canvas" | "dart" | "file:<path>"
  activeFile: OpenFile | null;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  setActiveTab: (id: string) => void;
  updateFile: (path: string, contents: string) => void;
  saveFile: (path: string, options?: { force?: boolean }) => void;
  reloadFile: (path: string) => void;
  refreshFromDisk: (path: string) => Promise<void>;
  requestRefresh: () => void;
  refreshToken: number;
};
```

### Editor shell

- `EditorArea` gains optional `closable`, `dirty`, and `onClose` on each tab, and renders a separate
  close button beside the tab button (never nested inside it).
- `DesignSurface` stops owning the Canvas/Dart switch locally and reads `activeTabId` from the file
  workspace. Tabs = **Canvas**, **Dart**, then open files.
- `App` wraps the project surface in `FileWorkspaceProvider` and passes `openFile` down to the
  explorer.

### Explorer

- `ProjectExplorer` gets an `onOpenFile` prop and a refresh button.
- `ProjectFiles` takes a `refreshToken` and re-lists the root.
- `ProjectTree` takes `refreshToken`, clears cached children, and refetches expanded directories.
- File rows use `aria-selected` instead of only a CSS class, and remain single-click accessible.

## UI changes

- New file tab styling: fixed tabs, dirty dot, close button, focus styles, horizontal overflow.
- New editor surface: path header, save/reload actions, external-change banner, line gutter, textarea,
  footer with line/byte counts and save status.
- New inspector panel state for files.
- Existing toast, dialog, and canvas styles are reused.

## Commit sequence

| #   | Commit                                                           |
| --- | ---------------------------------------------------------------- |
| 1   | `docs(plan): add remaining roadmap and Phase 8 plan`             |
| 2   | `feat(tauri): add safe text file read, stat, and write commands` |
| 3   | `feat(files): add the file workspace, tabs, and editor`          |
| 4   | `feat(explorer): open project files and refresh the tree`        |
| 5   | `feat(files): detect external changes and guard saves`           |
| 6   | `test(files): cover the explorer and file workspace`             |
| 7   | `docs: update Phase 8 README and implementation report`          |

Tests are committed with their feature commits where practical; the dedicated test commit covers
integration and regression cases.

## Verification plan

- Focused Vitest runs while implementing: `project`, `ProjectTree`, `ProjectFiles`, `FileWorkspace`,
  `FileEditor`, `EditorArea`, `DesignSurface`, `App`.
- Full frontend: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Rust: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`.
- `pnpm tauri build`.
- Runtime smoke on the release executable:
  1. Open a fixture project and confirm the explorer tree.
  2. Open `lib/main.dart` and `pubspec.yaml` in tabs, switch between them, and edit one.
  3. Save with the button and `Ctrl+S`, confirm the backup and the dirty state clearing.
  4. Modify the file on disk while the app is focused elsewhere, return, and confirm reload.
  5. Dirty the editor, modify on disk, and confirm the external-change banner and both actions.
  6. Refresh after creating a file on disk and confirm it appears.
  7. Restart and confirm project files open cleanly (tabs intentionally do not persist).
  8. Confirm zero console errors.

## Risks

- General text writes widen the write surface. Mitigations: existing files only, project-root
  canonicalisation, ignored folders, UTF-8/NUL checks, 1 MiB cap, modified-time guard, and backups.
- `modified_ms` resolution differs by filesystem. A same-millisecond external edit can pass the
  guard; the backup still preserves the overwritten content. This is documented as a limitation.
- A large text file in a textarea can be slow. The 1 MiB cap bounds it; no syntax highlighting keeps
  rendering linear.
- `beforeunload` confirmation behaviour differs in WebView2. The in-app dirty-tab dialog is the
  primary guard; the window-close prompt is best effort.
- The provider remounts on project switch, so unsaved file tabs are discarded with the project. The
  dirty guard covers tab closes, not project switches; a project-switch prompt is listed as a
  follow-up.

## Out of scope

- File creation, rename, deletion, or drag-and-drop moves.
- Binary, image, or asset previews.
- Syntax highlighting, code folding, search/replace, or diagnostics.
- File watching or automatic polling in the background.
- Multi-root workspaces or editing files outside the open project.
- Design export/import, canvas editing depth, and Flutter toolchain execution (Phases 9–11).
