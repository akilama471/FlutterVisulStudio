# Flutter UI Studio

A visual desktop studio for building Flutter user interfaces. This repository is currently at
**Phase 0 — Repository Foundation**: it provides the Tauri 2 + React + TypeScript application shell,
tooling, and automated tests. The widget engine, canvas, project model, and Dart generation are
deliberately not implemented yet.

## Stack

| Layer    | Technology                                |
| -------- | ----------------------------------------- |
| Shell    | Tauri 2                                   |
| Frontend | React 19, TypeScript 5.9 (strict), Vite 8 |
| Styling  | Plain CSS with design tokens              |
| Backend  | Rust 2021 edition, MSVC toolchain         |
| Tooling  | pnpm, ESLint 9 flat config, Prettier      |
| Tests    | Vitest, Testing Library, `cargo test`     |

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
    project/            Project explorer placeholder
  shared/
    components/         Reusable presentational components
    lib/                Tauri IPC wrapper and helpers
    styles/             Design tokens and global styles
  test/                 Test setup
src-tauri/
  src/commands/         Rust commands (currently `app_info`)
  capabilities/         Least-privilege Tauri capability file
  icons/                Generated application icons
assets/                 Source artwork for generated icons
docs/                   Engineering plans and reports
```

Features may depend on `shared`, never the reverse. Cross-feature composition lives in `app/`.

## Phase 0 scope

Included:

- Professional dark editor shell with explorer, editor area, inspector, and status bar.
- Real Rust ↔ React integration through the `app_info` command.
- Versioned, linted, formatted, and tested frontend and Rust configuration.

Not included (future phases):

- Project/file I/O, canvas rendering, widget engine, Dart generation, settings persistence,
  command palette, custom title bar, and plugin support.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
