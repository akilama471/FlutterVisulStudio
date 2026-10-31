# Phase 1 — Implementation Report

Status: **complete**

Phase 1 adds a working project workspace to Flutter UI Studio. The application can choose a Flutter
project folder through the native Windows picker, validate it in Rust, browse its files in a lazy
read-only explorer, and restore the last project on the next launch. File contents, the widget
engine, the canvas, and Dart generation remain out of scope.

The repository has no `AGENTS.md` or product roadmap, so the scope was selected explicitly by the
user and captured in `docs/phase-1-plan.md`:

> Native folder picker, validate a Flutter project, load its file tree, recent-project state.

## Scope delivered

- Official Tauri dialog plugin, limited to the `dialog:allow-open` capability.
- Rust project commands with a single active project root held in managed state.
- `pubspec.yaml` validation and project-name extraction, with the folder name as fallback.
- Canonical-path containment checks so project-relative requests cannot escape the active root.
- Read-only directory listing sorted directories first, then files, case-insensitively.
- `.git`, `.dart_tool`, and `build` omitted from the tree.
- Lazy folder expansion; file rows select visually only.
- Last-project persistence in `localStorage` with validation on startup and silent cleanup when stale.
- Project context in the header, editor welcome surface, status bar, and window tab label.
- Inline error alerts for invalid projects and unreadable directories.
- Phase 1 copy replacing the Phase 0 placeholders.

## Environment

| Tool          | Version               |
| ------------- | --------------------- |
| Windows       | Windows 11 (win32)    |
| Node.js       | 24.22.1               |
| pnpm          | 12.16.1               |
| Rust          | 1.99.1 (stable, MSVC) |
| MSVC tools    | 14.51.36231           |
| Windows SDK   | 10.0.26100.0          |
| WebView2      | 156.0.4314.50         |
| Tauri (crate) | 2.12.5                |
| Tauri CLI     | 2.12.4                |
| Dialog plugin | 2.8.4                 |

No toolchain changes were required in Phase 1.

## Architecture

Filesystem access stays in Rust. The frontend never reads the disk directly and only sends
project-relative paths after a project has been opened.

### Rust

`src-tauri/src/commands/project.rs` owns all project state:

```rust
struct ProjectState {
    root: Mutex<Option<PathBuf>>,
}
```

| Command                  | Input                        | Output                                   |
| ------------------------ | ---------------------------- | ---------------------------------------- |
| `open_project`           | absolute folder path         | `ProjectInfo { name, path, entryPoint }` |
| `list_project_directory` | project-relative folder path | `Vec<ProjectEntry>`                      |
| `close_project`          | none                         | none                                     |

`ProjectEntry` carries `name`, `relativePath`, `kind` (`directory` / `file`), and `hasChildren`.

Validation and safety rules:

- The requested path must canonicalize to an existing directory.
- `pubspec.yaml` must exist at the root; otherwise the folder is rejected as not a Flutter project.
- The project name is parsed from the top-level `name:` field, supporting quoted values and trailing
  comments; the canonical folder name is the fallback.
- The canonical root becomes the only active root, and only after all checks pass.
- Every later request is project-relative: absolute paths, `..`, root prefixes, and symlink escapes
  are rejected by canonicalizing the joined path and checking it stays inside the active root.
- The entry point is `lib/main.dart` when present, otherwise `null`.
- `.git`, `.dart_tool`, and `build` directories are omitted, including from `hasChildren` checks.
- Non-UTF-8 file names are skipped rather than failing the listing.
- Windows `\\?\` and `\\?\UNC\` verbatim prefixes are stripped from the display path returned to the
  UI while the canonical root remains in Rust.

The pure helpers (`inspect_project`, `parse_project_name`, `list_directory`, `resolve_directory`,
`display_path`) are unit tested without starting a Tauri runtime.

### Frontend

| File                                          | Responsibility                                          |
| --------------------------------------------- | ------------------------------------------------------- |
| `src/shared/lib/project.ts`                   | Typed IPC wrappers, picker call, response validation    |
| `src/features/project/useProjectWorkspace.ts` | Restore, open, busy status, and error state             |
| `src/features/project/projectStorage.ts`      | Last-project `localStorage` helpers                     |
| `src/features/project/ProjectExplorer.tsx`    | Explorer shell, summary, empty/busy states, open action |
| `src/features/project/ProjectFiles.tsx`       | Root directory loading for the active project           |
| `src/features/project/ProjectTree.tsx`        | Lazy expandable tree with selection                     |
| `src/app/App.tsx`                             | Wires workspace state into every shell region           |

Supporting shared changes:

- `Button` added for primary/ghost actions.
- `EmptyState` accepts an optional action.
- `Icon` gained a chevron.
- `IconButton` gained `disabled`.
- `IconButton` now exposes `aria-pressed` only when a toggle state is provided, so action buttons are
  no longer announced as toggles.

Behaviour:

- Cancelling the picker is silent and leaves the current project untouched.
- Opening another project replaces the active one.
- A stale remembered project is removed from storage without an error banner.
- Invalid IPC payloads never enter React state.
- Busy states disable project actions and mark the status dot accordingly.

## Verification

All commands were run from the repository root on Windows. `cargo` was added to the process `PATH`
with `$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"`.

| Command                                                                          | Result                                                         |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm format:check`                                                              | Passed, all files formatted                                    |
| `pnpm lint`                                                                      | Passed, no warnings or errors                                  |
| `pnpm typecheck`                                                                 | Passed, no diagnostics                                         |
| `pnpm test`                                                                      | 16 tests passed across 2 files                                 |
| `pnpm build`                                                                     | Passed; 37 modules, CSS 13.25 kB, JS 236.10 kB                 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                         | Passed                                                         |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Passed, no warnings                                            |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | 9 tests passed                                                 |
| `pnpm tauri build`                                                               | Passed; incremental release compile 1m 29s, MSI and NSIS built |

Automated tests cover:

Frontend:

- Existing shell, panel-toggle, metadata, and fallback behaviour.
- Opening a project through the picker updates the header, welcome surface, status bar, and storage.
- Cancelling the picker changes nothing.
- An invalid project renders an alert without replacing the active project.
- Remembered project restoration on mount.
- Stale remembered project cleanup.
- Lazy folder expansion and child loading.
- Project service command arguments, malformed responses, and Rust error propagation.

Rust:

- Plain, quoted, and commented `pubspec.yaml` names; nested keys are ignored.
- Valid project inspection, canonical root, and entry point.
- Missing `pubspec.yaml` and missing folders are rejected.
- Directory listing order, relative paths, and ignored folders.
- Nested directory listing.
- Parent-directory traversal and missing directories are rejected.
- Windows verbatim path prefixes are stripped for display.

## Build artifacts

```text
src-tauri/target/release/flutter-ui-studio.exe
src-tauri/target/release/bundle/msi/Flutter UI Studio_0.1.0_x64_en-US.msi          (2.93 MiB)
src-tauri/target/release/bundle/nsis/Flutter UI Studio_0.1.0_x64-setup.exe         (1.95 MiB)
```

## Launch smoke test

The release executable was started on Windows with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` and driven over the WebView2
DevTools protocol against a temporary fixture project containing `android`, `lib`, `test`,
`pubspec.yaml`, `README.md`, plus `.git` and `build` folders.

- A remembered fixture path set in `localStorage` restored on reload.
- The rendered path was the native form
  `C:\Users\Akila\AppData\Local\Temp\opencode\flutter-ui-studio-fixture`, with no `\\?\` prefix.
- Root rows were `android`, `lib`, `test`, `pubspec.yaml`, `README.md`; `.git` and `build` were absent.
- Expanding `lib` loaded `src` and `main.dart` and set `aria-expanded="true"`.
- The status bar showed `Ready`, `demo_app`, `Tauri 2.12.5`, and `v0.1.0`.
- Zero console errors or uncaught exceptions were recorded.
- A direct `plugin:dialog|open` invocation reached the pending state, confirming the native dialog
  opened through the granted capability. The dialog was dismissed by closing the application.

Screenshot: `C:\Users\Akila\AppData\Local\Temp\opencode\phase-1-window.png` (not committed).

## Commits

| Commit    | Summary                                                        |
| --------- | -------------------------------------------------------------- |
| `ade9af0` | `docs(plan): add Phase 1 implementation plan`                  |
| `4a2d30b` | `chore(deps): add Tauri dialog plugin`                         |
| `e680eca` | `feat(project): add Rust project workspace commands`           |
| `08e9ffe` | `feat(project): wire native project opening and explorer tree` |
| `0f26bf2` | `test(project): cover workspace validation and explorer flows` |
| `9de3006` | `fix(ui): only expose pressed state on toggle buttons`         |
| `41a4e35` | `fix(project): display native project paths in the UI`         |

The README and this report are committed separately as Phase 1 documentation.

## Limitations and follow-ups

- One project can be active at a time; multi-root workspaces are a later concern.
- There is no filesystem watcher, so external changes require reopening the project or re-expanding a
  folder.
- File rows only select; contents, previews, editing, and tab management are not implemented.
- `open_project` replaces the active root but the frontend has no visible close action; closing is
  reserved for a later workspace UI.
- Very large directories are listed in full. Ignored build folders cover the usual Flutter case, but
  no artificial entry cap is applied.
- The native picker cannot be automated by the test suite; the plugin, capability, command layer, and
  runtime invocation were verified separately.
- The bundle identifier `com.flutteruistudio.app` still ends in `.app`, which triggers a non-blocking
  Tauri warning and should be renamed before shipping macOS bundles.
- Installers are unsigned, so Windows SmartScreen may warn on other machines.
- Release artifacts are not committed to git; rebuild with `pnpm tauri build`.
