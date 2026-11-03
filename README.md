# Flutter UI Studio

A visual desktop studio for building Flutter user interfaces. This repository is currently at
**Phase 4 — Design Persistence**: it builds on the Phase 3 visual canvas and Dart preview by saving
each project's design to local application storage and restoring it the next time the project opens.
Generated code is still never written to the Flutter project, and file writing, drag and drop, and
undo/redo are not implemented yet.

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

The design is saved automatically after each edit and restored per project. The canvas header reports
`Saving…`, `Saved locally`, or `Save failed`. Designs live in this application's local storage, keyed
by the project path; switching projects keeps each project's design separate.

### Design persistence

- Edits are written 250 ms after the last change. There is no manual save button.
- The saved tree is validated before it is written and before it is restored. Invalid or unreadable
  data falls back to the starter document.
- Only the widget tree is stored. Selection, active tab, and panel visibility reset on restore.
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
`StudioScreen` scaffold. It is displayed only; nothing is written to the Flutter project on disk.

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
    canvas/             Widget model, reducer, canvas, inspector, local design storage
    dart/               Dart generator and read-only code preview
    editor/             Header, activity bar, editor tabs, status bar
    inspector/          Inspector panel shell
    project/            Project picker, workspace hook, storage, lazy file tree
  shared/
    components/         Reusable presentational components
    lib/                Tauri IPC wrappers and helpers
    styles/             Design tokens and global styles
  test/                 Test setup
src-tauri/
  src/commands/         Rust commands (`app_info`, project workspace)
  capabilities/         Least-privilege Tauri capability file
  icons/                Generated application icons
assets/                 Source artwork for generated icons
docs/                   Engineering plans and reports
```

Features may depend on `shared`, never the reverse. Cross-feature composition lives in `app/`.

## Phase 4 scope

Included:

- Per-project design persistence in `window.localStorage`, keyed by the project path.
- Automatic 250 ms debounced save after canvas edits, with `Saving…`, `Saved locally`, and
  `Save failed` status in the canvas header.
- Automatic restore when a project opens, including after an application restart.
- Defensive validation of saved payloads: Screen root, known widget kinds, unique IDs, valid props,
  inspector limits, node/depth caps, and rejection of nested Screens or leaf children.
- Widget ID adoption so newly added widgets cannot collide with restored IDs.
- Storage unit tests and UI tests for restore, autosave, fallback, and save failure.
- All Phase 3 canvas, inspector, Dart, and clipboard behaviour is retained.

Not included (future phases):

- Writing or overwriting design or Dart files in the Flutter project.
- Cloud sync, export/import, named design slots, manual save dialogs, or version history.
- Schema migration from future payload versions.
- Editing, analysing, or formatting generated code with the Flutter toolchain.
- Drag and drop, reordering, multi-select, copy/paste, undo/redo.
- Responsive breakpoints, constraints, alignment, theming, assets, animations, gestures, and full
  Flutter widget coverage.
- Opening or editing project file contents, file watching, multi-root workspaces.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
