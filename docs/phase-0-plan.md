# Phase 0 — Repository Foundation: Implementation Plan

Project: **Flutter UI Studio** (desktop editor shell)
Status: Approved plan for Phase 0 only

## 1. Repository & environment findings

| Item | Finding | Action |
| --- | --- | --- |
| Branch | `main`, single initial commit | Work incrementally on `main` with one commit per completed step |
| Existing files | `LICENSE` (GPL-3.0), `.gitignore`, `.gitattributes`, `paln.md` | Preserve; extend `.gitignore` only where required |
| `AGENTS.md` | **Not present** (root and recursive search) | No extra repository instructions exist; this plan governs Phase 0 |
| Architecture docs | None found; `paln.md` states "Tauri 2 + React + TypeScript" | Use the stack below as the approved baseline |
| Node.js | v24.22.1 | Use for tooling |
| npm | 12.2.1 | Bootstrap only; project uses pnpm |
| corepack | 0.36.0, pnpm 12.16.1 resolvable | Pin package manager with `packageManager` |
| Rust / Cargo | **Not installed** | Install `stable-x86_64-pc-windows-msvc` via rustup |
| Visual Studio | 2026 Community 18.11.2 installed, **no VC++ tools / Windows SDK** | Add "Desktop development with C++" workload + Windows 11 SDK |
| WebView2 | Runtime 156.0.4314.50 installed | No action |
| Git | 2.56.0.windows.3 | Configure LF-safe workflow |

## 2. Approved stack (Phase 0)

- **Shell:** Tauri 2
- **Rust:** stable MSVC toolchain, edition 2021
- **Frontend:** React 19 + TypeScript 5 (strict) + Vite 7
- **Package manager:** pnpm (Corepack, pinned)
- **Lint/format:** ESLint 9 flat config (`typescript-eslint`, React hooks), Prettier
- **Tests:** Vitest + Testing Library + jsdom; Rust built-in test harness
- **Dependencies:** only the minimum required by the above and by Tauri. No UI kit, state
  manager, router, icon package or component library in Phase 0.

## 3. Feature-based folder structure

```text
src/
  app/                  App composition, providers, shell wiring
  features/
    editor/             Workbench chrome: title bar, activity bar, status bar
    project/            Project explorer placeholder (no project model yet)
    inspector/          Properties panel placeholder (no widget engine)
  shared/
    components/         Reusable presentational primitives
    lib/                Pure helpers (IPC wrapper, formatting)
    styles/             Design tokens + global styles
    types/              Shared TypeScript types
  test/                 Vitest setup and helpers
src-tauri/
  src/                  Tauri entry point + `commands/` module
  capabilities/         Least-privilege capability file
  icons/                Generated application icons
  tauri.conf.json
  Cargo.toml
```

Rules:

- Features may import from `shared`, never the other way around.
- No cross-feature imports; composition happens in `app/`.
- No future-phase code (widget engine, canvas, Dart generation) is created.

## 4. Application shell scope

Deliver a professional, static desktop editor shell:

- Native window title bar (no custom decorations in Phase 0).
- App header: product mark, project name placeholder, window-level actions reserved
  (no fake functionality).
- Activity bar with Editor / Explorer / Inspector selection.
- Collapsible explorer sidebar with an "No project open" empty state.
- Editor area with welcome tab and a centered empty state.
- Right inspector panel with "Nothing selected" empty state.
- Status bar: readiness indicator, encoding, line/column placeholders, app version
  loaded from Rust through a real `app_info` Tauri command.
- Dark theme driven by CSS custom properties; no hard-coded colors in components.
- Responsive layout down to a 900x600 minimum window.

Explicitly **out of scope**: file I/O, project model, drag/drop, canvas rendering,
widget tree, code generation, settings persistence, custom title bar, plugin system.

## 5. Rust configuration

- `tauri` 2, `tauri-build` 2, `serde`, `serde_json`.
- One real command: `app_info` returning product name, version, and Tauri version.
- Window: 1280x800, minimum 900x600, centered, product title.
- Identifier: `com.flutteruistudio.app`.
- Capability file containing only the core permissions needed by the shell.
- CSP restricted to local assets (`default-src 'self'`, inline styles allowed for
  Vite-injected CSS, `img-src 'self' data:`).
- Icons generated locally and committed (no external brand assets).

## 6. Automated tests (Phase 0 only)

Frontend (Vitest + Testing Library):

- App renders all shell regions and the product name.
- Activity bar switches the active panel (explorer ↔ inspector).
- Explorer/inspector empty states render.
- `app_info` failure path falls back gracefully to a static version label.

Rust (`cargo test`):

- `app_info` returns the expected product metadata.

No E2E, visual regression, or canvas tests in Phase 0.

## 7. Verification commands

```powershell
pnpm install
pnpm format:check
pnpm lint
pnpm test
pnpm build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

Launch smoke test: run the built executable, confirm the process stays alive, then close it.

## 8. Commit sequence

1. `docs(plan): add Phase 0 implementation plan`
2. `chore: configure toolchain, workspace and lint/format/test tooling`
3. `feat(ui): build professional editor application shell`
4. `feat(tauri): configure Rust app and app_info command`
5. `test: add Phase 0 shell and command tests`
6. `chore: verify Windows build` (only if fixes were required)

## 9. Risks / limitations

- **Elevated install required** for the Visual Studio C++ workload and Windows SDK.
- First Rust/Tauri build downloads and compiles a large dependency graph (several minutes).
- Phase 0 delivers chrome only; every panel is an intentional empty state.
- No custom title bar or window controls yet, so the native OS frame is used.
