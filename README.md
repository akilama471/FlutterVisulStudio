# Flutter UI Studio

A visual desktop studio for building Flutter user interfaces. This repository is currently at
**Phase 3 — Dart Generation & Code Preview**: it builds on the Phase 2 visual canvas by generating
readable Dart from the current widget tree and showing it in a read-only preview tab. The design
still lives in memory only; generated code is never written to the project, and file writing,
drag and drop, and undo/redo are not implemented yet.

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

The design is an in-memory scratchpad. Switching projects or restarting the application resets it
to the starter document: a Screen containing a Column with a heading Text and a Button.

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
    canvas/             Widget model, reducer, canvas, palette, inspector content
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

## Phase 3 scope

Included:

- Pure Dart generator for the six Phase 2 widget kinds.
- Self-contained Material app shell with `StudioApp` and a `StudioScreen` scaffold.
- Two-space indentation, escaped string literals, colour parsing, and layout spacers.
- Canvas and Dart editor tabs; Canvas remains the default.
- Read-only monospaced Dart preview regenerated from the latest canvas state.
- Copy-to-clipboard action with success and failure feedback.
- Generator unit tests and UI tests for tab switching, regeneration, and clipboard states.

Not included (future phases):

- Writing or overwriting files in the Flutter project.
- Editing, analysing, or formatting generated code with the Flutter toolchain.
- Design persistence between launches or across projects.
- Drag and drop, reordering, multi-select, copy/paste, undo/redo.
- Responsive breakpoints, constraints, alignment, theming, assets, animations, gestures, and full
  Flutter widget coverage.
- Opening or editing project file contents, file watching, multi-root workspaces.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
