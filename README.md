# Flutter UI Studio

A visual desktop studio for building Flutter user interfaces. This repository is currently at
**Phase 10 - Design Portability**: it builds on the Phase 9 editing model by letting a design leave
and re-enter the studio safely. Whole projects or single canvases export to versioned JSON and import
only after a validated preview, rotating local snapshots protect long editing sessions, and an
explicit project-folder copy can be written on request. Designs still live in local storage, file
tabs are not persisted, and Flutter toolchain execution is not implemented yet.

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
3. Browse the project tree; folders load lazily when expanded, and clicking a file opens it in an
   editor tab.
4. Use the refresh button in the explorer header to re-list the project and every expanded folder.
5. The last successfully opened project is remembered and restored on the next launch.

The tree ignores `.git`, `.dart_tool`, `.flutter-ui-studio`, and `build`. Backup files created by saves
appear as ordinary project files.

### Project files

**Canvas** and **Dart** are fixed tabs. Files you open are appended as closable tabs with a dirty
dot and an inspector that shows the path, size, encoding, modified time, and last backup.

1. Click a file in the explorer. It must be UTF-8 text without NUL bytes and at most 1 MiB
   (`pubspec.yaml`, Markdown, Dart, Gradle, and JSON all work; images and binaries are rejected with
   a **Retry** action).
2. Edit in the plain monospace editor. There is no autosave for project files.
3. Save with the **Save** button or `Ctrl+S`. Saving a file that changed on disk is rejected rather
   than silently overwriting it.
4. Every successful save copies the previous contents beside the file as `name.bak`, then
   `.bak.1`, `.bak.2`, and so on, before writing.
5. Closing a tab with unsaved changes asks for confirmation; **Keep editing** cancels. Closing the
   window with unsaved file tabs also asks the WebView to confirm.

The studio checks open files when the window regains focus and when a tab is activated. A clean file
reloads from disk automatically. A dirty file shows an **External change** banner with **Reload**
(discard local edits and read the file) and **Overwrite** (write the local text, keeping a backup).
A save conflict shows the same banner.

File tabs stay inside the open project. This phase cannot create, rename, delete, or move files, and
it does not watch the filesystem: refresh, focus, tab activation, and save are the detection points.
File tabs are intentionally not restored across restarts or project switches.

### Visual canvas

Opening a project replaces the welcome surface with the visual canvas.

1. Pick a widget from the toolbar palette: **Text**, **Button**, **Container**, **Row**, or
   **Column**.
2. The widget is appended to the selected container. If a leaf widget is selected, the new widget
   goes into its parent; with nothing selected, it goes into the Screen. The toolbar shows the
   current target.
3. Click any widget on the canvas to select it. The inspector shows its hierarchy, type, and ID.
   `Ctrl`/`Cmd`+click adds or removes one widget; `Shift`+click extends the selection from the anchor
   over the visible tree order.
4. Edit properties in the inspector and the canvas updates immediately:
   - **Text** content and **Button** label.
   - **Row** and **Column** gap.
   - **Container** padding and background.
   - **Screen** background.
     A multi-selection edits a shared property when every selected widget has the same kind; fields
     with different values show a **Mixed values** placeholder.
5. Drag a widget onto another to move it. Dropping near the top or bottom edge inserts before or
   after the target; dropping in the middle of a Row, Column, Container, or Screen moves the widget
   inside it. Dragging one selected widget moves the whole selection.
6. Use **Copy selection**, **Duplicate selection**, and **Paste** in the toolbar, or `Ctrl+C`,
   `Ctrl+D`, and `Ctrl+V`. Copied widgets can be pasted into a different canvas. The paste is cloned
   with fresh widget ids and selected.
7. Use **Delete widget**, `Delete`, or `Backspace` to remove the selection and its descendants. The
   Screen cannot be deleted; deleting the rest selects the parent.
8. Use the header **Undo** / **Redo** buttons, or `Ctrl+Z`, `Ctrl+Y`, and `Ctrl+Shift+Z`, to move
   through edit history. The last 100 steps are kept per canvas and survive canvas switches and
   application restarts.

The widget tree follows the ARIA tree keyboard model. Only the focused tree item is in the tab order;
`ArrowUp`/`ArrowDown` walk the visible order, `Home`/`End` jump to the ends, `ArrowRight` expands or
enters a container, `ArrowLeft` collapses or leaves it, `Shift+Arrow` extends the selection,
`Ctrl+Arrow` reorders the anchor among its siblings, and `Ctrl+Space` toggles the focused widget.

The design is saved automatically after each edit and restored per project. The canvas header reports
`Saving…`, `Saved locally`, or `Save failed`. Designs live in this application's local storage, keyed
by the project path; switching projects keeps each project's design separate. Design data is never
mixed with project files: only an explicit action writes into the project folder.

### Canvases

Each project holds one or more canvases, listed under **Canvases** in the explorer.

1. Use **New canvas** (the plus button) to add a canvas. It is named `Canvas N` and becomes active.
   A project can hold up to 20 canvases.
2. Click a canvas name to switch to it. Each canvas keeps its own widget tree, and the active canvas
   is remembered across restarts.
3. Use the pencil button on a canvas row to rename it. Names are trimmed, must be 1–60 characters,
   and must be unique within the project regardless of case. The dialog validates as you type and
   saves with Enter or **Save name**; Escape cancels.
4. Use the copy button on a canvas row to duplicate it. The copy is inserted directly after its
   source, named `<name> copy` (with a numeric suffix if needed), receives fresh widget ids, and
   becomes active. A duplicated canvas starts with empty undo/redo history.
5. Drag a canvas row onto another to reorder it. Dropping on the top half inserts before the target;
   the bottom half inserts after it. Reordering does not change the active canvas.
6. Use the trash button on a canvas row to delete it. A confirmation dialog appears first, and the
   last remaining canvas cannot be deleted.
7. After deleting, a notification offers **Undo** for 10 seconds (or **Dismiss**). Undoing restores
   the canvas at its previous position with its widgets intact. Deleting several canvases quickly
   stacks one notification per canvas, each with its own timer, so every deletion stays recoverable
   independently.

Undo/redo history is stored per canvas and survives canvas switches and application restarts. A
history entry is discarded when it no longer matches the saved widget tree. Designs from earlier
versions migrate into a single canvas named **Main**.

All dialogs keep keyboard focus inside themselves while open: Tab and Shift+Tab cycle through their
controls, Escape closes them, and focus returns to the button that opened the dialog. The canvas
undo/redo shortcuts are ignored while a dialog is open.

### Design persistence

- Edits are written 250 ms after the last change. There is no manual save button.
- A pending edit is flushed synchronously when the window is hidden or closed, so a quick close does
  not lose the last change.
- The saved canvas set is validated before it is written and before it is restored. Invalid or
  unreadable data falls back to a single starter canvas.
- Widget trees, the active canvas, and per-canvas undo/redo history are stored. Selection, active
  tab, and panel visibility reset on restore.
- Large designs are measured in UTF-8 bytes. Above 1 MiB, the explorer shows an advisory warning with
  the current size and suggests deleting unused canvases. The real limit is set by WebView2, so the
  warning does not block editing.
- Clearing the application's WebView2 profile, changing the project path, or uninstalling the
  application removes or orphans saved designs.
- Designs are not shared between machines. Project files you edit are written only when you save.

### Design portability and storage

The **Design data** button in the canvas explorer header opens one dialog for moving, protecting, and
cleaning up a design.

1. **Export** writes the whole project or only the active canvas to a versioned JSON file. The native
   save dialog chooses the destination, the file is validated as UTF-8 JSON and capped at 2 MiB, and
   an existing target is copied to `name.json.bak` (then `.bak.1`, `.bak.2`, and so on) before it is
   replaced.
2. **Import** reads a `.json` design file, validates the format and design, and shows a preview with
   the source, project label, export time, canvas names, canvas and widget counts, and byte size.
   Nothing changes until **Import and replace** or **Add canvas** is pressed; a pre-import snapshot is
   taken first.
   - A project file replaces the current design.
   - A canvas file adds one canvas with fresh widget ids and a unique name, directly after the active
     canvas.
3. **Project file** writes or reads the optional copy at `.flutter-ui-studio/design.json`. The folder
   is created only when you write it, contains a `.gitignore` that ignores everything except itself,
   and never appears in the project explorer. Reads use the same preview and confirmation flow.
4. **Snapshots** are taken automatically after a save when at least a minute has passed since the
   newest snapshot and the design changed. A snapshot is also taken before an import, restore, or
   reset. Up to eight snapshots are kept (256 KiB each, 1 MiB total), newest first. **Browse
   snapshots** shows the time, reason, canvas count, and size, with a confirmed **Restore** that saves
   the current design as a new snapshot first.
5. **Storage** reports the UTF-8 size of the design, undo history, snapshots, any legacy design, and
   the total. Every canvas lists its widget count and size with a **Delete** action; deleting from here
   uses the normal canvas delete and keeps the 10-second undo notification. **Reset project design**
   clears the design, legacy design, and undo history and starts from one starter canvas; snapshots
   are kept so the reset stays recoverable.

Imported and restored designs are re-identified with fresh canvas and widget ids, and the canvas
editor remounts so no stale selection or undo state survives. Export and import never include undo
history, snapshots, or open file tabs, and there is no cloud sync or multi-user behaviour.

### Dart preview

The editor has fixed **Canvas** and **Dart** tabs while a project is open, followed by any project
file tabs you open.

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

Only the project entry point is written by the apply flow, and only after an explicit confirmation. The
target is validated again in Rust: it must be a `.dart` file under the project's `lib/` folder, it
cannot escape the active project, and contents are capped at 1 MiB. General text writes use the
separate file editor and its own validation. The studio does not run, analyse, or format the project
after writing.

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
    files/              File workspace, text editor, file inspector, discard dialog
    inspector/          Inspector panel shell
    project/            Project picker, workspace hook, storage, lazy file tree
  shared/
    components/         Reusable presentational components
    lib/                Tauri IPC wrappers and helpers
    styles/             Design tokens and global styles
  test/                 Test setup
src-tauri/
  src/commands/         Rust commands (`app_info`, project workspace, safe file and design read/write)
  capabilities/         Least-privilege Tauri capability file
  icons/                Generated application icons
assets/                 Source artwork for generated icons
docs/                   Engineering plans and reports
```

Features may depend on `shared`, never the reverse. Cross-feature composition lives in `app/`.

## Phase 10 scope

Included:

- Versioned project and single-canvas JSON export through a native save dialog, with numbered backups.
- Validated import with an explicit preview before replacing a design or adding a canvas.
- Fresh canvas and widget ids on every imported or restored design, plus an editor remount.
- Rotating automatic snapshots with a restore browser and pre-change safety snapshots.
- An explicit, Git-ignored project design file at `.flutter-ui-studio/design.json`, hidden from the
  explorer and written only on request.
- A design-data dialog with storage sizes, per-canvas deletion, snapshot restore, and a confirmed
  reset that keeps snapshots.
- Rust-side revalidation of every design file: absolute `.json` paths, size, UTF-8, no NUL bytes,
  backups, and an optional modified-time conflict check.
- Tests for transfer validation, snapshots, storage usage, file services, Rust design commands, and
  the dialog flows.
- All Phase 0–9 project, canvas, inspector, persistence, Dart, clipboard, safe apply, multi-canvas,
  file-editing, drag/drop, multi-select, and history behaviour is retained.

Not included (future phases):

- Cloud sync, accounts, collaboration, and background filesystem watching.
- Automatic reads or writes of the project-folder design file.
- Merging two projects widget-by-widget or importing into an arbitrary canvas.
- Storing file tabs, undo history, or snapshots in exported design files.
- Arbitrary layout constraints, responsive breakpoints, and free-form canvas positioning.
- Copying to or pasting from the operating-system clipboard for canvas widgets.
- Creating, renaming, deleting, moving, or drag-and-dropping project files.
- Syntax highlighting, code folding, search/replace, or diagnostics in the file editor.
- Editing generated code before writing, or running, analysing, or formatting the project with the
  Flutter toolchain.
- Responsive breakpoints, constraints, alignment, theming, assets, animations, gestures, and full
  Flutter widget coverage.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
