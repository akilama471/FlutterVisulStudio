# Flutter UI Studio

A visual desktop studio for building Flutter user interfaces. This repository is currently at
**Phase 6 - Workspace Safety**: it builds on the Phase 5 safe Dart apply flow by adding undo and
redo, plus multiple named canvases per project that can be created, switched, and deleted from the
explorer. Designs still live in local storage, only the Dart entry point is ever written to the
project, and drag and drop plus toolchain execution are not implemented yet.

## Stack

| Layer    | Technology                                          |
| -------- | --------------------------------------------------- |
| Shell    | Tauri 2                                             |
| Frontend | React 19, TypeScript 5.9 (strict), Vite 8           |
| Styling  | Plain CSS with design tokens                        |
| Backend  | Rust 2021 edition, MSVC toolchain                   |
| Dialog   | `@tauri-apps/plugin-dialog` / `tauri-plugin-dialog` |
| Tooling  | pnpm, ESLint 10 flat config, Prettier               |
| Tests    | Vitest, Testing Library, `cargo test`               |

## Prerequisites

- **Windows 10/11** with the WebView2 runtime (preinstalled on Windows 11).
- **Node.js 22.12+** and **pnpm 12** (`corepack enable` or `npm install -g pnpm@12`).
- **Rust stable MSVC** via [rustup](https://rustup.rs).
- **Visual Studio Build Tools** with the _Desktop development with C++_ workload and a Windows SDK.

## Getting started

```powershell
pnpm install
pnpm tauri dev
```

The first Rust build downloads and compiles the Tauri dependency graph, so it can take several
minutes.

## Using the studio

### Project workspace

1. Select **Open project folder** in the explorer header, or **Open Flutter project** in the empty
   state.
2. Choose a folder containing a `pubspec.yaml`.
3. Browse the project tree; folders load lazily when expanded.
4. The last successfully opened project is remembered and restored on the next launch.

The tree ignores `.git`, `.dart_tool`, and `build`. File contents are not opened yet.

### Visual canvas

Opening a project replaces the welcome surface with the visual canvas.

1. Pick a widget from the toolbar palette: **Text**, **Button**, **Container**, **Row**, or
   **Column**.
2. The widget is appended to the selected container. If a leaf widget is selected, the new widget
   goes into its parent; with nothing selected, it goes into the Screen. The toolbar shows the
   current target.
3. Click any widget on the canvas to select it. The inspector shows its hierarchy, type, and ID.
4. Edit properties in the inspector and the canvas updates immediately:
   - **Text** content and **Button** label.
   - **Row** and **Column** gap.
   - **Container** padding and background.
   - **Screen** background.
5. Use **Delete widget** to remove the selected widget and its subtree. The Screen cannot be
   deleted.
6. Use the header **Undo** / **Redo** buttons, or `Ctrl+Z`, `Ctrl+Y`, and `Ctrl+Shift+Z`, to move
   through edit history. The last 100 steps are kept for the mounted canvas.

The design is saved automatically after each edit and restored per project. The canvas header reports
`Saving…`, `Saved locally`, or `Save failed`. Designs live in this application's local storage, keyed
by the project path; switching projects keeps each project's design separate.

### Canvases

Each project holds one or more canvases, listed under **Canvases** in the explorer.

1. Use **New canvas** (the plus button) to add a canvas. It is named `Canvas N` and becomes active.
   A project can hold up to 20 canvases.
2. Click a canvas name to switch to it. Each canvas keeps its own widget tree, and the active canvas
   is remembered across restarts.
3. Use the trash button on a canvas row to delete it. A confirmation dialog appears first, and the
   last remaining canvas cannot be deleted.
4. After deleting, a notification offers **Undo** for 10 seconds (or **Dismiss**). Undoing restores
   the canvas at its previous position with its widgets intact.

Undo/redo history is per mounted canvas: switching canvases or restarting the application starts a
fresh history. Designs from earlier versions migrate into a single canvas named **Main**.

### Design persistence

- Edits are written 250 ms after the last change. There is no manual save button.
- The saved canvas set is validated before it is written and before it is restored. Invalid or
  unreadable data falls back to a single starter canvas.
- Widget trees and the active canvas are stored. Selection, undo/redo history, active tab, and panel
  visibility reset on restore.
- Clearing the application's WebView2 profile, changing the project path, or uninstalling the
  application removes or orphans saved designs.
- Nothing is written into the Flutter project folder, and designs are not shared between machines.

### Dart preview

The editor has **Canvas** and **Dart** tabs while a project is open.

1. Select the **Dart** tab to see readable Dart generated from the current widget tree.
2. The preview is read-only and always regenerated from the latest canvas state. Edit a property on
   the Canvas tab, then return to Dart to see the change.
3. Use **Copy code** to put the generated source on the clipboard. The header reports
   `Copied to clipboard` or `Copy failed`.
4. Switching back to **Canvas** preserves the design and inspector selection.

Generated code is a self-contained `lib/main.dart`-style file with a Material app shell and a
`StudioScreen` scaffold. The preview itself is read-only; use the apply flow below to write it.

### Applying generated Dart

1. Select the **Dart** tab and choose **Apply to project**.
2. The studio reads the project entry point (`lib/main.dart`, or a new file when missing) and opens
   a review dialog with the exact target path and a line-by-line diff.
3. Choose **Write to project** to apply the generated code, or **Cancel** to leave the project
   untouched. Escape also cancels.
4. An existing entry point is backed up first as `lib/main.dart.bak`, then `.bak.1`, `.bak.2`, and so
   on. The header reports `Written to lib/main.dart` and the backup path.
5. A missing entry point is created without a backup.

Only the project entry point is written, and only after an explicit confirmation. The target is
validated again in Rust: it must be a `.dart` file under the project's `lib/` folder, it cannot
escape the active project, and contents are capped at 1 MiB. The studio does not run, analyse, or
format the project after writing.

## Scripts

| Command             | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `pnpm dev`          | Start the Vite dev server on port 1420       |
| `pnpm build`        | Type-check and build the frontend            |
| `pnpm tauri dev`    | Run the desktop application in development   |
| `pnpm tauri build`  | Build the desktop application and installers |
| `pnpm lint`         | Lint TypeScript and React sources            |
| `pnpm format:check` | Verify formatting with Prettier              |
| `pnpm test`         | Run the Vitest suite                         |
| `pnpm typecheck`    | Type-check without emitting output           |

Rust checks from the repository root:

```powershell
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Project layout

```text
src/
  app/                  Application composition, design surface, shell state
  features/
    canvas/             Widget model, reducer, history, canvases, inspector, local storage
    dart/               Dart generator, line diff, apply dialog, read-only preview
    editor/             Header, activity bar, editor tabs, status bar
    inspector/          Inspector panel shell
    project/            Project picker, workspace hook, storage, lazy file tree
  shared/
    components/         Reusable presentational components
    lib/                Tauri IPC wrappers and helpers
    styles/             Design tokens and global styles
  test/                 Test setup
src-tauri/
  src/commands/         Rust commands (`app_info`, project workspace, safe file read/write)
  capabilities/         Least-privilege Tauri capability file
  icons/                Generated application icons
assets/                 Source artwork for generated icons
docs/                   Engineering plans and reports
```

Features may depend on `shared`, never the reverse. Cross-feature composition lives in `app/`.

## Phase 6 scope

Included:

- Per-canvas undo/redo with header buttons and `Ctrl+Z`, `Ctrl+Y`, `Ctrl+Shift+Z` shortcuts.
- Bounded in-memory history (100 steps) with inspector edits coalesced into one step.
- Undo and redo results are autosaved through the existing debounced write path.
- Multiple canvases per project, listed in the explorer with an active canvas.
- **New canvas** action with generated names, capped at 20 canvases.
- Switch canvases; each keeps an independent widget tree and its own mounted history.
- Confirm-before-delete with a 10-second notification that can undo the deletion.
- Version 2 local storage for canvas sets, migrating Phase 4 designs into a **Main** canvas.
- Unit tests for history, canvas set operations, storage/migration, the canvas list, and undo/redo
  in the design surface.
- All Phase 0–5 project, canvas, inspector, persistence, Dart, clipboard, and safe apply behaviour is
  retained.

Not included (future phases):

- Persisting undo/redo history across canvas switches or application restarts.
- Renaming canvases, reordering canvases by drag and drop, or duplicating a canvas.
- Writing design JSON or any file other than the Dart entry point.
- Editing generated code before writing, or a general writable file editor.
- Running, analysing, or formatting the project with the Flutter toolchain after writing.
- File watching, external-change detection, or reloading the preview from disk.
- Multi-file generation, cloud sync, export/import, or design sharing.
- Drag and drop, reordering, multi-select, or copy/paste.
- Responsive breakpoints, constraints, alignment, theming, assets, animations, gestures, and full
  Flutter widget coverage.
- Opening or editing arbitrary project file contents, multi-root workspaces.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
