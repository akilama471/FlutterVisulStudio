# Phase 3 — Dart Generation & Code Preview: Implementation Plan

Project: **Flutter UI Studio**
Status: Approved scope; implementation plan for Phase 3
Prerequisite: Phase 2 complete at `e465f36`

## 1. Context

Phase 2 added a typed widget tree, a visual canvas, a click-to-add palette, and a property
inspector. The design is still an in-memory scratchpad and no Dart is produced.

The repository has no `AGENTS.md` or product roadmap, so the Phase 3 scope was selected explicitly
by the user:

> Dart generation + code preview. Generate readable Dart from the canvas and show it in a read-only
> code preview. Do not write to project files.

Phase 3 closes the loop between the visual design and a readable Flutter implementation without
touching the project on disk.

## 2. Goals

- Convert the current canvas widget tree into readable Dart source.
- Keep generation independent of React and unit tested against exact output.
- Add Canvas and Dart preview tabs to the editor area.
- Show the generated Dart in a read-only, monospaced code view.
- Provide a Copy action with visible success and failure feedback.
- Regenerate the preview from the latest canvas state on every visit.
- Keep the Phase 1 welcome surface and Phase 2 canvas interactions unchanged.

## 3. Non-goals

- Writing, creating, or overwriting files in the Flutter project.
- Editing generated code inside the application.
- Saving the design or generated code between launches.
- `flutter analyze`, `flutter run`, hot reload, or toolchain integration.
- Themes, fonts, assets, animations, gestures, and responsive breakpoints.
- Full Flutter widget coverage or advanced layout constraints.
- Syntax highlighting, diagnostics, formatting integration, or code folding.

## 4. Generated Dart contract

New feature module: `src/features/dart/`.

```ts
export function generateDart(root: CanvasNode): string;
```

The root is the canvas Screen. The generated file is a single self-contained Dart file with three
top-level declarations:

1. `import 'package:flutter/material.dart';`
2. `void main()`, which runs `const StudioApp()`.
3. `StudioApp`, a `StatelessWidget` returning `MaterialApp` with
   `debugShowCheckedModeBanner: false` and `home: const StudioScreen()`.
4. `StudioScreen`, a `StatelessWidget` returning `Scaffold` with the Screen background colour and a
   `SafeArea` body.

The Screen body is a `Padding(EdgeInsets.all(24))` around a `Column` of the Screen children,
matching the canvas preview spacing. The generated source always ends with a newline.

### Widget mapping

| Canvas widget | Dart output                                                               |
| ------------- | ------------------------------------------------------------------------- |
| Screen        | `Scaffold` background plus `SafeArea` / `Padding` / `Column` body         |
| Column        | `Column(crossAxisAlignment: CrossAxisAlignment.start, children: [...])`   |
| Row           | `Row(crossAxisAlignment: CrossAxisAlignment.start, children: [...])`      |
| Container     | `Container(padding, color, child: Column(...))` when it has children      |
| Text          | `Text('content', style: const TextStyle(fontSize: 16, fontWeight: w600))` |
| Button        | `ElevatedButton(onPressed: () {}, child: const Text('label'))`            |

Layout rules:

- Row and Column gaps become `const SizedBox(width: n)` or `const SizedBox(height: n)` between
  children; a gap of zero emits no spacer.
- Empty children lists emit `children: const []`.
- Container padding becomes `const EdgeInsets.all(n)`.
- Invalid colour values fall back to opaque black; the Screen falls back to opaque white.
- Colours support `#RGB` and `#RRGGBB` input and emit `const Color(0xFFRRGGBB)`.
- Text content and Button labels escape backslashes, single quotes, `$`, newlines, carriage
  returns, and tabs so generated strings are valid Dart.
- Indentation is two spaces per level.

The generator is deterministic. Tests assert full output for the starter document and focused
assertions for properties, escaping, gaps, containers, and colour fallbacks.

## 5. Code preview UI

`src/features/dart/DartPreview.tsx` renders:

- A header with the title "Dart preview", a short explanation that the code is generated from the
  canvas and read-only, a status message, and a **Copy code** action.
- A scrollable dark code surface with monospaced text, preserving whitespace.
- Clipboard access through `navigator.clipboard.writeText`; failures show "Copy failed" instead of
  throwing. No Tauri clipboard plugin is added.

The editor area gains real tabs:

- `Canvas` with the grid icon.
- `Dart` with the code icon.

`EditorArea` becomes a generic tab shell that accepts a tab list, the active tab ID, an optional
selection callback, and panel content. The Welcome surface uses a single Welcome tab.

`DesignSurface` owns the active view (`canvas` or `dart`), keeps the reducer mounted across view
switches, and regenerates the Dart preview from the current canvas state. The inspector continues to
show canvas properties in both views. Switching back to Canvas preserves the design.

## 6. Automated tests

Generator (`vitest`):

- Full starter document output.
- Screen background, padding, and SafeArea scaffold structure.
- Text and Button output.
- Text and label escaping, including quotes, backslashes, `$`, and newlines.
- Row and Column gaps, including zero gaps and empty children.
- Container padding, background, and nested children.
- Invalid colour fallback.
- Deterministic output with a trailing newline.

UI (`vitest` + Testing Library):

- Opening a project shows Canvas and Dart tabs.
- Canvas is the default view.
- Switching to Dart renders the generated starter code.
- Editing the canvas and switching to Dart reflects the new value.
- Switching back to Canvas restores the palette and widget tree.
- Copy writes the generated code to the clipboard and shows success.
- Clipboard rejection shows a failure message.
- The no-project welcome keeps its single Welcome tab and no Dart tab.

Existing Phase 0–2 tests continue to pass, with assertions added for the tab shell.

## 7. Verification commands

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

Runtime smoke test:

1. Start the release executable with WebView2 remote debugging enabled.
2. Restore a fixture project and confirm the Canvas and Dart tabs render.
3. Switch to Dart and confirm the generated starter code is visible.
4. Edit a widget on the Canvas, return to Dart, and confirm the code changed.
5. Copy the code and verify the copied payload.
6. Confirm zero console errors and capture a screenshot.

## 8. Commit sequence

1. `docs(plan): add Phase 3 implementation plan`
2. `feat(dart): add Dart generator`
3. `feat(dart): add tabbed Dart code preview`
4. `test(dart): cover Dart generation and preview`
5. `docs: update Phase 3 README and implementation report`

## 9. Risks and limitations

- The generated app uses a fixed class name, Material app shell, and theme rather than the
  project's real configuration.
- Layout fidelity is approximate; Flutter constraints, alignment, and sizing are still not
  modelled.
- Only the six Phase 2 widget kinds are generated.
- The preview is read-only and cannot be edited or written to disk.
- Copy depends on the WebView2 clipboard API; failure is surfaced but there is no fallback dialog.
- Generated code is not analysed by the Flutter toolchain, so unsupported property combinations
  would only appear when compiled in a real project.
