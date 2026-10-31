# Phase 1 — Project Workspace & File Explorer: Implementation Plan

Project: **Flutter UI Studio**
Status: Approved scope; implementation plan for Phase 1
Prerequisite: Phase 0 complete at `8baa786`

## 1. Context

`paln.md` only defines Phase 0 and the repository has no `AGENTS.md`, roadmap, or Phase 1
specification. The user selected the next scope explicitly:

> Native folder picker, validate a Flutter project, load its file tree, recent-project state.

Phase 1 therefore opens a real Flutter project and makes the explorer functional. It does not
introduce the widget engine, visual canvas, Dart generation, or a code editor.

## 2. Goals

- Choose a project folder with the native Windows folder picker.
- Validate that the chosen folder is a Flutter project.
- Display a read-only, lazily loaded project file tree in the explorer.
- Show the active project in the header, editor welcome surface, and status bar.
- Remember the last successfully opened project and restore it on the next launch.
- Handle invalid, moved, or deleted projects gracefully.
- Keep filesystem access behind typed Rust commands; the frontend never reads files directly.

## 3. Non-goals

- Opening, editing, or previewing file contents.
- File watching or live refresh when files change on disk.
- Multiple simultaneous projects or workspace files.
- Project creation, deletion, rename, or drag-and-drop.
- Recent-projects list, command palette, settings UI, or custom title bar.
- Widget model, canvas, inspector properties, and Dart generation.

## 4. Dependencies

One new official Tauri plugin:

- Rust: `tauri-plugin-dialog`
- Frontend: `@tauri-apps/plugin-dialog`
- Capability: `dialog:allow-open` only.

No filesystem plugin is added. Project paths and reads stay inside the Rust `project` command
module, which keeps a single validated active root instead of exposing broad filesystem permissions.

## 5. Rust design

New module: `src-tauri/src/commands/project.rs`.

Managed state:

```rust
struct ProjectState {
    root: Mutex<Option<PathBuf>>,
}
```

Commands:

| Command                  | Input                        | Output                                   |
| ------------------------ | ---------------------------- | ---------------------------------------- |
| `open_project`           | absolute folder path         | `ProjectInfo { name, path, entryPoint }` |
| `list_project_directory` | project-relative folder path | `Vec<ProjectEntry>`                      |
| `close_project`          | none                         | none                                     |

`ProjectEntry` contains `name`, `relativePath`, `kind` (`directory` / `file`), and `hasChildren`.
Entries are sorted directories first, then files, case-insensitively.

Validation rules:

- Path must canonicalize to an existing directory.
- `pubspec.yaml` must exist at the root.
- The project name is parsed from the top-level `name:` field; the folder name is the fallback.
- The validated canonical root is stored in managed state only after all checks pass.
- Every later path is project-relative. The joined path is canonicalized and must remain inside the
  stored root, which blocks `..` traversal and symlink escapes.
- The entry point is `lib/main.dart` when present, otherwise `null`.
- `.git`, `.dart_tool`, and `build` directories are omitted from the tree to avoid noise.
- Entries whose file names are not valid UTF-8 are skipped.
- File contents are never read by Phase 1 commands.

`open_project` and `list_project_directory` call small pure helpers that can be unit tested without
starting a Tauri runtime.

## 6. Frontend design

New shared project service: `src/shared/lib/project.ts`.

- Typed wrappers for `open_project`, `list_project_directory`, and `close_project`.
- Runtime validation for every value returned across IPC, matching the Phase 0 `appInfo` pattern.
- Typed `ProjectError` handling with a readable fallback message.

New feature module: `src/features/project/`.

- `ProjectExplorer.tsx` owns project state, the open action, error banner, and tree.
- `ProjectTree.tsx` renders lazy folder nodes and tracks expansion and loaded children.
- `ProjectTreeNode.tsx` renders one folder or file row with indentation and accessible controls.
- `projectStorage.ts` stores only the last project path under a namespaced `localStorage` key.

Behaviour:

- On startup, restore the remembered path by calling `open_project`; clear the stored path if it is
  no longer valid. No error is shown for an automatically restored project that has moved.
- The explorer header gains an **Open Project** action and displays the active project name.
- Clicking a folder expands or collapses it and loads children on first expansion.
- Clicking a file selects it visually only. File contents remain out of scope.
- While opening, the action is disabled and marked busy; failures render an inline `role="alert"`.
- The header shows the project name, or `No project open`.
- The status bar shows the project name and `Ready` / `Opening…` states.
- The editor welcome surface shows the active project name, canonical path, and entry point, while
  retaining the note that visual editing arrives in a later phase. The empty state gains an
  **Open Flutter project** action.
- When a project is open the app keeps a single active project; opening another replaces it.
- The header phase badge and welcome copy are updated from Phase 0 to Phase 1.

All new styling uses the existing CSS custom properties and the existing component primitives.

## 7. Error handling

- Cancelling the native dialog is silent.
- A folder without `pubspec.yaml` produces: "That folder is not a Flutter project (pubspec.yaml was
  not found)."
- Unreadable folders or filesystem errors produce a short message; raw OS error text is logged to the
  developer console but not trusted as UI copy.
- A stale remembered project is removed from storage.
- Invalid IPC payloads fall back to a safe error and never enter React state.

## 8. Automated tests

Rust (`cargo test`):

- Project name extraction handles plain, quoted, and commented `pubspec.yaml` values.
- Valid project opens and reports its canonical root and entry point.
- Missing `pubspec.yaml` is rejected.
- Directory listing sorts folders before files and omits ignored directories.
- Traversal outside the active root is rejected.
- A missing or stale root is rejected.

Frontend (Vitest + Testing Library):

- Existing Phase 0 shell, panel, metadata, and fallback tests continue to pass.
- Cancelling the folder picker leaves state unchanged.
- Opening a valid project updates header, welcome surface, and status bar.
- Invalid project errors render an alert and do not replace the active project.
- Folder rows expand lazily and render children.
- Remembered project is restored on mount; stale storage is cleared.
- Project service rejects malformed IPC responses.

## 9. Verification commands

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

Launch smoke test:

1. Start the release executable and confirm the shell still renders with no project.
2. Invoke `open_project` and `list_project_directory` over WebView2 remote debugging against a
   temporary fixture project to confirm the plugin/command wiring at runtime.
3. Confirm the process stays responsive and close it.

## 10. Commit sequence

1. `docs(plan): add Phase 1 implementation plan`
2. `chore(deps): add Tauri dialog plugin`
3. `feat(project): add Rust project workspace commands`
4. `feat(project): wire native project opening and explorer tree`
5. `test(project): cover workspace validation and explorer flows`
6. `docs: update Phase 1 README and implementation report`

## 11. Risks and limitations

- Only one project can be active at a time; multi-root workspaces are a later concern.
- No filesystem watcher, so external changes require reopening or re-expanding a folder.
- Symlinks that resolve outside the project are rejected by the canonical-root check.
- Very large directories are listed in full; ignored build directories cover the common Flutter
  case, but no artificial cap is applied in Phase 1.
- The native dialog cannot be driven by automated tests; the plugin and command layer are covered
  separately, and the release smoke test verifies runtime command access.
- Remembered paths live in local storage and are revalidated on every launch.
