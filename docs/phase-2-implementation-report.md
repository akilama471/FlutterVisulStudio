# Phase 2 — Implementation Report

Status: **complete**

Phase 2 adds the first visual editing surface to Flutter UI Studio. A typed widget tree is rendered
as a Flutter-style preview inside the editor, widgets can be added from a palette, selected on the
canvas, edited in the inspector, and deleted. The design is an in-memory scratchpad: it resets when
the active project changes and is never written to disk.

The repository has no `AGENTS.md` or product roadmap, so the scope was selected explicitly by the
user and captured in `docs/phase-2-plan.md`:

> Widget model + canvas + inspector, with a toolbar and click-to-add interaction.

## Scope delivered

- Typed widget model with a root Screen and Column, Row, Container, Text, and Button widgets.
- Immutable tree helpers for lookup, path, parent lookup, insertion, removal, and property updates.
- A pure reducer for add, select, delete, and update actions.
- Flutter-style light preview canvas inside a dark device frame.
- Click-to-add palette: Text, Button, Container, Row, Column.
- Insertion target resolution: selected container, selected leaf's parent, or the Screen.
- Newly added widgets become selected; deleting a widget selects its parent.
- Canvas selection with `role="treeitem"`, `aria-selected`, keyboard activation, and a visible outline.
- Inspector breadcrumb from Screen to the selected widget; each crumb selects that ancestor.
- Editable Text content, Button label, Row/Column gap, Container padding and background, and Screen
  background.
- Delete action with a disabled state for no selection and the Screen root.
- Per-project design reset through a project-path key on `DesignSurface`.
- Phase 2 copy in the header, welcome surface, and inspector empty states.

## Non-goals

- Drag and drop, reordering, multi-select, copy/paste, undo/redo.
- Saving the design to disk or `localStorage`, project file writing, Dart generation.
- Responsive breakpoints, constraints, alignment, theming, assets, animations, gestures.
- File content viewing or editing, file watching, multi-root workspaces.

## Environment

No toolchain changes were required in Phase 2.

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

## Architecture

The widget engine is frontend-only. Rust and the project file tree are unchanged.

### Model

`src/features/canvas/model.ts` owns the tree and all state transitions:

```ts
type WidgetKind = "screen" | "column" | "row" | "container" | "text" | "button";

type CanvasNode = {
  id: string;
  kind: WidgetKind;
  props: WidgetProps;
  children: CanvasNode[];
};

type CanvasState = {
  root: CanvasNode;
  selectedId: string | null;
};
```

| Helper                             | Purpose                                 |
| ---------------------------------- | --------------------------------------- |
| `createInitialCanvasState()`       | Starter Screen/Column/Text/Button state |
| `createWidget(kind)`               | Node with default properties            |
| `findNode` / `findParent`          | Node and parent lookup                  |
| `findNodePath`                     | Root-to-node chain for breadcrumbs      |
| `insertChild` / `removeNode`       | Immutable structural edits              |
| `updateNodeProps`                  | Immutable property patch                |
| `resolveInsertionParent`           | Container that receives the next widget |
| `canvasReducer`                    | Add, select, delete, and update         |
| `describeWidget` / `WIDGET_LABELS` | Accessible labels and display names     |

Rules:

- Screen is the only root and cannot be deleted.
- Screen, Column, Row, and Container accept children; Text and Button are leaves.
- Adding with a container selected appends into it.
- Adding with a leaf selected appends into its parent.
- Adding with nothing selected appends into the Screen.
- The new widget becomes selected.
- Deleting a subtree selects its parent.
- Stale selections and updates are ignored.

The reducer and helpers are pure and tested without React.

### UI

| File                                        | Responsibility                                      |
| ------------------------------------------- | --------------------------------------------------- |
| `src/features/canvas/CanvasWorkspace.tsx`   | Canvas header, palette, delete action, device frame |
| `src/features/canvas/CanvasNodeView.tsx`    | Recursive widget rendering and selection            |
| `src/features/canvas/CanvasInspector.tsx`   | Breadcrumb, properties, notes, empty states         |
| `src/app/DesignSurface.tsx`                 | Owns the reducer and composes editor + inspector    |
| `src/features/editor/EditorArea.tsx`        | Generic editor shell with a tab label and content   |
| `src/features/inspector/InspectorPanel.tsx` | Inspector shell that accepts content                |
| `src/app/App.tsx`                           | Chooses welcome or design surface per project       |

Supporting shared changes:

- `Icon` gained `button`, `column`, `row`, `square`, `text`, and `trash` icons.
- Light canvas colour tokens were added to `tokens.css`.
- Canvas, toolbar, device-frame, and inspector styles were added to `global.css`.

Behaviour:

- With no project open, the Phase 1 welcome surface and a no-project inspector message remain.
- Opening or restoring a project replaces the welcome surface with the canvas.
- `DesignSurface` is keyed by `project.path`, so opening another project resets the design.
- Cancelling the picker leaves the current project and design untouched.
- The right inspector can still be toggled off without losing canvas state.

## Verification

All commands were run from the repository root on Windows. `cargo` was added to the process `PATH`
with `$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"`.

| Command                                                                          | Result                                                         |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm format:check`                                                              | Passed, all files formatted                                    |
| `pnpm lint`                                                                      | Passed, no warnings or errors                                  |
| `pnpm typecheck`                                                                 | Passed, no diagnostics                                         |
| `pnpm test`                                                                      | 43 tests passed across 4 files                                 |
| `pnpm build`                                                                     | Passed; 42 modules, CSS 19.76 kB, JS 246.34 kB                 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                         | Passed                                                         |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Passed, no warnings                                            |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | 9 tests passed                                                 |
| `pnpm tauri build`                                                               | Passed; incremental release compile 1m 59s, MSI and NSIS built |

Automated tests cover:

Model (17 tests):

- Starter document shape and selection.
- Defaults for every widget kind.
- Add into a selected container, a selected leaf's parent, the root, and with a stale selection.
- Newly added widgets become selected.
- Delete removes a subtree, selects the parent, and refuses to delete the root.
- Property updates affect only the target node and are ignored without a selection.
- Valid, cleared, and invalid selection actions.
- Root-to-node path lookup, parent lookup, and insertion-target resolution.
- Immutable insert, remove, and update helpers.
- Widget description labels and truncation.

UI (10 tests):

- Starter canvas and nothing-selected inspector state.
- Palette adds into the root and selects the new widget.
- Adding with a leaf selected inserts into its parent container.
- Clicking a canvas widget updates the inspector type, label, and breadcrumb.
- Editing Text content and Button label updates the canvas.
- Editing Row/Column gap, Container padding, and backgrounds updates inline styles.
- Editing the Screen background and showing the root note.
- Breadcrumb selects an ancestor.
- Delete removes the selected widget and selects its parent.
- Delete is disabled for no selection and the Screen root.

Existing Phase 0 and Phase 1 tests were updated where the project-open editor surface changed from
the project welcome to the canvas: 16 earlier tests continue to pass.

## Build artifacts

```text
src-tauri/target/release/flutter-ui-studio.exe
src-tauri/target/release/bundle/msi/Flutter UI Studio_0.1.0_x64_en-US.msi          (2.93 MiB)
src-tauri/target/release/bundle/nsis/Flutter UI Studio_0.1.0_x64-setup.exe         (1.95 MiB)
```

## Launch smoke test

The release executable was started with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` and driven over the WebView2
DevTools protocol against a temporary fixture project containing `pubspec.yaml` and
`lib/main.dart`. The remembered project was seeded in `localStorage` and the page was reloaded.

Observed results:

- The canvas mounted with Screen, Column, `Text "Hello, Flutter!"`, and `Button "Get started"`.
- The empty inspector showed `Nothing selected`; delete was disabled.
- Adding a Container appended it to the Screen, selected it, and changed the target to
  `Adding to: Container`.
- Selecting the starter Text changed the target to `Adding to: Column` and showed Text properties.
- Editing the content input changed the canvas label to `Text "Hello from the smoke test"`.
- Deleting the Text removed it and selected the Column.
- Adding a Row inserted it into the Column, selected it, and gap editing set `gap: 20px`.
- Zero console errors, log errors, or uncaught exceptions were recorded.

Screenshot: `C:\Users\Akila\AppData\Local\Temp\opencode\phase-2-canvas.png` (86,538 bytes, not
committed).

## Commits

| Commit    | Summary                                                       |
| --------- | ------------------------------------------------------------- |
| `8281d84` | `docs(plan): add Phase 2 implementation plan`                 |
| `6fa2f13` | `feat(canvas): add widget model and reducer`                  |
| `a4c34af` | `feat(canvas): add visual canvas and property inspector`      |
| `3ac7b07` | `test(canvas): cover canvas interactions and inspector edits` |

The README and this report are committed separately as Phase 2 documentation.

## Limitations and follow-ups

- The canvas is a scratchpad; switching projects, closing the app, or reloading discards the design.
- No persistence, file writing, or Dart generation exists yet, so the project on disk is untouched.
- Only six widget kinds and a small property set are supported.
- Containers stack children vertically; Row is a simple wrapping row. Flutter constraints,
  alignment, sizing, and real layout semantics are not modelled.
- There is no drag and drop, reordering, multi-select, copy/paste, undo/redo, or keyboard delete
  shortcut.
- The light preview does not use the project's actual Flutter theme or fonts.
- The device frame uses fixed dimensions rather than a responsive breakpoint model.
- Rendering is DOM-based, not a Flutter engine, so fidelity is intentionally approximate.
- The native picker still cannot be automated by the test suite; project restoration and the canvas
  were verified separately in the release runtime.
- The bundle identifier `com.flutteruistudio.app` still ends in `.app`, which triggers a non-blocking
  Tauri warning and should be renamed before shipping macOS bundles.
- Installers are unsigned, so Windows SmartScreen may warn on other machines.
- Release artifacts are not committed to git; rebuild with `pnpm tauri build`.
