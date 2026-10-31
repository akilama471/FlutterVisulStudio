# Flutter UI Studio

A visual desktop studio for building Flutter user interfaces. This repository is currently at
**Phase 1 — Project Workspace & File Explorer**: it provides the Tauri 2 + React + TypeScript
application shell, a native Flutter project picker, and a read-only project file tree. The widget
engine, canvas, code editor, and Dart generation are deliberately not implemented yet.

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

## Using the project workspace

1. Select **Open project folder** in the explorer header, or **Open Flutter project** in the empty
   state.
2. Choose a folder containing a `pubspec.yaml`.
3. Browse the project tree; folders load lazily when expanded.
4. The last successfully opened project is remembered and restored on the next launch.

The tree ignores `.git`, `.dart_tool`, and `build`. File contents are not opened in Phase 1.

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
  app/                  Application composition and shell state
  features/
    editor/             Header, activity bar, editor area, status bar
    inspector/          Properties panel placeholder
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

## Phase 1 scope

Included:

- Native folder picker for choosing a Flutter project.
- `pubspec.yaml` validation and project-name extraction in Rust.
- Safe, project-relative directory listing with lazy explorer folders.
- Last-project persistence and startup restoration.
- Project context in the header, editor welcome surface, and status bar.

Not included (future phases):

- Opening or editing file contents, file watching, multi-root workspaces.
- Canvas rendering, widget engine, Dart generation, settings UI, command palette, custom title bar,
  and plugin support.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
