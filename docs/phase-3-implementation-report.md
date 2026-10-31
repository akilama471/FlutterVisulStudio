# Phase 3 — Implementation Report

Status: **complete**

Phase 3 turns the Phase 2 visual canvas into readable Dart. The current widget tree is converted by a
pure generator and shown in a read-only **Dart** tab next to the **Canvas** tab. Generated source can
be copied to the clipboard, but it is never written to the project on disk.

The repository has no `AGENTS.md` or product roadmap, so the scope was selected explicitly by the
user and captured in `docs/phase-3-plan.md`:

> Dart generation + code preview. Generate readable Dart from the canvas and show it in a read-only
> code preview. Do not write to project files.

## Scope delivered

- Pure `generateDart(root: CanvasNode): string` generator with no React dependency.
- Self-contained Dart output: `import`, `main()`, `StudioApp` with `MaterialApp`, and `StudioScreen`
  with a `Scaffold`.
- Screen body as `SafeArea` → `Padding(EdgeInsets.all(24))` → `Column`.
- Column and Row emit `crossAxisAlignment: CrossAxisAlignment.start`, gap spacers, and empty
  `children: const []` lists.
- Container emits padding, colour, and a nested `Column` when it has children.
- Text emits a styled `Text`; Button emits an `ElevatedButton` with a no-op callback.
- Two-space indentation and deterministic trailing newline.
- Dart string escaping for backslashes, quotes, `$`, CR, LF, and tab.
- `#RGB` and `#RRGGBB` colour parsing with safe fallbacks (white for the Screen, black otherwise).
- Canvas and Dart editor tabs with roving arrow-key navigation.
- Read-only monospaced code surface that regenerates from the latest canvas state.
- Copy action with `Copied to clipboard` and `Copy failed` feedback.
- Welcome surface now uses the same generic tab shell with a single Welcome tab.
- Phase 3 copy in the header badge and welcome note.

## Non-goals

- Writing, creating, or overwriting files in the Flutter project.
- Editing generated code in the application.
- Design or code persistence between launches.
- `flutter analyze`, `flutter run`, hot reload, formatting integration, or toolchain execution.
- Syntax highlighting, diagnostics, code folding, or an editable code editor.
- Drag and drop, reordering, multi-select, copy/paste of widgets, or undo/redo.
- Themes, fonts, assets, animations, gestures, breakpoints, and full Flutter widget coverage.

## Environment

No toolchain changes were required in Phase 3.

| Tool          | Version               |
| ------------- | --------------------- |
| Windows       | Windows 11 (win32)    |
| Node.js       | 24.22.1               |
| pnpm          | 12.16.1               |
| Rust          | 1.99.1 (stable, MSVC) |
| Tauri (crate) | 2.12.5                |
| Tauri CLI     | 2.12.4                |
| WebView2      | 156.0.4314.50         |

## Architecture

### Generator

`src/features/dart/generateDart.ts` is a pure function over the canvas model:

```ts
export function generateDart(root: CanvasNode): string;
```

The root is normally the Screen. Output is assembled line by line with a two-space indent helper.
The generator handles:

| Canvas widget | Dart output                                                               |
| ------------- | ------------------------------------------------------------------------- |
| Screen        | `Scaffold` background plus `SafeArea` / `Padding` / `Column` body         |
| Column        | `Column(crossAxisAlignment: CrossAxisAlignment.start, children: [...])`   |
| Row           | `Row(crossAxisAlignment: CrossAxisAlignment.start, children: [...])`      |
| Container     | `Container(padding, color, child: Column(...))` when it has children      |
| Text          | `Text('content', style: const TextStyle(fontSize: 16, fontWeight: w600))` |
| Button        | `ElevatedButton(onPressed: () {}, child: const Text('label'))`            |

Rules:

- Row and Column gaps become `const SizedBox(width: n)` or `const SizedBox(height: n)` between
  children. A gap of zero emits no spacer.
- Empty children lists emit `children: const []`.
- Container padding becomes `const EdgeInsets.all(n)`.
- Colours support `#RGB` and `#RRGGBB` and emit `const Color(0xFFRRGGBB)`.
- Invalid colours fall back to opaque white for the Screen and opaque black for other widgets.
- Text content and Button labels escape backslashes, single quotes, `$`, newlines, carriage returns,
  and tabs.
- Output is deterministic, indented two spaces per level, and ends with a single newline.

### UI

| File                                      | Responsibility                                        |
| ----------------------------------------- | ----------------------------------------------------- |
| `src/features/dart/DartPreview.tsx`       | Read-only code view, copy action, and status feedback |
| `src/features/editor/EditorArea.tsx`      | Generic tab shell with tab list and shared panel      |
| `src/app/DesignSurface.tsx`               | Canvas/Dart view state and memoized generation        |
| `src/app/App.tsx`                         | Welcome surface now uses the tab shell                |
| `src/features/editor/WorkbenchHeader.tsx` | Phase 3 badge                                         |

Behaviour:

- `DesignSurface` owns `view: "canvas" | "dart"` and memoizes `generateDart(canvas.root)` from the
  current reducer state.
- The reducer stays mounted across view switches, so returning to Canvas preserves the design and
  inspector selection.
- The inspector continues to show canvas properties in both views.
- `EditorArea` accepts `tabs`, `activeTabId`, an optional `onSelectTab`, and panel content. It exposes
  `role="tablist"`, `role="tab"`, `aria-selected`, and a single `role="tabpanel"` region. Left and
  Right arrow keys move selection between tabs.
- The no-project state keeps a single Welcome tab and does not show Dart.
- Copy uses `navigator.clipboard.writeText`; a missing or rejected clipboard API is caught and shown
  as `Copy failed`. No Tauri clipboard plugin was added.
- Dart preview and tab styles were added to `global.css`, including responsive header stacking.

## Verification

All commands were run from the repository root on Windows. `cargo` was added to the process `PATH`
with `$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"`.

| Command                                                                          | Result                                             |
| -------------------------------------------------------------------------------- | -------------------------------------------------- |
| `pnpm format:check`                                                              | Passed, all files formatted                        |
| `pnpm lint`                                                                      | Passed, no warnings or errors                      |
| `pnpm typecheck`                                                                 | Passed, no diagnostics                             |
| `pnpm test`                                                                      | 59 tests passed across 5 files                     |
| `pnpm build`                                                                     | Passed; 44 modules, CSS 21.25 kB, JS 251.45 kB     |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                         | Passed                                             |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Passed, no warnings                                |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | 9 tests passed                                     |
| `pnpm tauri build`                                                               | Passed; release compile 1m 17s, MSI and NSIS built |

Automated tests cover:

Generator (10 tests):

- Exact output for the starter document.
- Screen background, padding, and empty `children`.
- Text and Button output.
- Escaping quotes, backslashes, `$`, newlines, tabs, and carriage returns.
- Vertical and horizontal gap spacers and zero-gap omission.
- Container padding, colour, nested children, and short hex colours.
- Invalid colour fallbacks.
- Deterministic output with one trailing newline.

Canvas/Dart UI (6 new tests, 16 total in `DesignSurface.test.tsx`):

- Canvas is the default tab and Dart starts unselected.
- Switching to Dart renders the generated starter code.
- Editing Text on the Canvas regenerates the Dart content.
- Switching back to Canvas preserves the widget tree.
- Copy writes the generated source and shows success.
- Clipboard rejection shows `Copy failed`.

The app shell test now also asserts the single Welcome tab with no Dart tab and asserts the Phase 3
badge. All Phase 0–2 tests continue to pass.

## Build artifacts

```text
src-tauri/target/release/flutter-ui-studio.exe
src-tauri/target/release/bundle/msi/Flutter UI Studio_0.1.0_x64_en-US.msi          (2.93 MiB)
src-tauri/target/release/bundle/nsis/Flutter UI Studio_0.1.0_x64-setup.exe         (1.96 MiB)
```

## Launch smoke test

The release executable was started with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` and driven over the WebView2
DevTools protocol against the existing temporary fixture project. The remembered project was seeded
in `localStorage` and the page was reloaded.

Observed results:

- The Canvas tab mounted as the default with Screen, Column, `Text "Hello, Flutter!"`, and
  `Button "Get started"`; the Dart tab was present and unselected.
- Switching to Dart rendered a 1,335-character self-contained file with the starter widgets.
- Switching back to Canvas, selecting the Text, and changing its content to `Hello from Phase 3`
  updated the canvas label.
- Returning to Dart showed the regenerated source containing `'Hello from Phase 3'`.
- **Copy code** reported `Copied to clipboard`; the clipboard payload was 1,335 characters and
  matched the preview exactly.
- Zero console errors, log errors, or uncaught exceptions were recorded.

Screenshot: `C:\Users\Akila\AppData\Local\Temp\opencode\phase-3-dart-preview.png` (81,725 bytes, not
committed).

## Commits

| Commit    | Summary                                         |
| --------- | ----------------------------------------------- |
| `e455fb2` | `docs(plan): add Phase 3 implementation plan`   |
| `4823a04` | `feat(dart): add Dart generator`                |
| `95d4b2e` | `feat(dart): add tabbed Dart code preview`      |
| `d00e177` | `test(dart): cover Dart generation and preview` |
| `8e4e751` | `chore(ui): update shell copy for Phase 3`      |

The README and this report are committed separately as Phase 3 documentation.

## Limitations and follow-ups

- Generated Dart is display-only; nothing is written, created, or overwritten in the project.
- The generated app uses fixed class names, a Material shell, and a fixed text style rather than the
  project's real theme, entry point, or configuration.
- Layout fidelity is approximate. Flutter constraints, alignment, sizing, wrapping, and responsive
  behaviour are not modelled.
- Only the six Phase 2 widget kinds and their current property subset are generated.
- The preview cannot be edited, formatted, analysed, or compiled from within the studio.
- Copy depends on the WebView2 clipboard API. Failures are surfaced but there is no fallback dialog
  or manual selection helper.
- The design still resets when the project changes or the application restarts.
- The bundle identifier `com.flutteruistudio.app` still ends in `.app`, which triggers a non-blocking
  Tauri warning and should be renamed before shipping macOS bundles.
- Installers are unsigned, so Windows SmartScreen may warn on other machines.
- Release artifacts are not committed to git; rebuild with `pnpm tauri build`.
