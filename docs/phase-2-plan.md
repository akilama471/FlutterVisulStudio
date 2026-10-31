# Phase 2 — Widget Model & Visual Canvas: Implementation Plan

Project: **Flutter UI Studio**
Status: Approved scope; implementation plan for Phase 2
Prerequisite: Phase 1 complete at `ed907f7`

## 1. Context

Phase 1 opened a Flutter project and browsed its files. The repository still has no `AGENTS.md` or
product roadmap, so the Phase 2 scope was selected explicitly by the user:

> Widget model + canvas + inspector, with a toolbar and click-to-add interaction.

Phase 2 introduces the first visual editing surface. It is deliberately an in-memory design
scratchpad: nothing is written to the project yet, and no Dart is generated.

## 2. Goals

- Define a typed, immutable widget tree with a root Screen and container/leaf widgets.
- Render that tree as a Flutter-style preview inside the editor area.
- Add widgets from a palette into the selected container.
- Select any widget on the canvas and show its hierarchy in the inspector.
- Edit basic properties in the inspector and see the canvas update immediately.
- Delete a selected widget and its subtree.
- Reset the design when the active project changes.
- Keep all canvas logic in pure functions that are unit tested without React.

## 3. Non-goals

- Drag and drop, reordering, undo/redo, copy/paste, or multi-select.
- Saving the design to disk, project files, or `localStorage`.
- Dart generation, preview hot reload, or Flutter toolchain integration.
- Responsive breakpoints, constraints, alignment, or full Flutter widget coverage.
- Image, asset, theme, font, animation, or gesture modelling.
- Custom code editing for generated widgets.

## 4. Widget model

```ts
type WidgetKind = "screen" | "column" | "row" | "container" | "text" | "button";

type WidgetProps = {
  content: string; // text
  label: string; // button
  padding: number; // container
  gap: number; // row / column
  background: string; // screen / container
};

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

Rules:

- `screen` is the only root and cannot be deleted.
- `screen`, `column`, `row`, and `container` accept children.
- `text` and `button` are leaves.
- The initial document is a Screen containing a Column with a heading Text and a Button, so the
  canvas has a visible starting point.
- Node IDs are generated locally and are not persisted.

Pure helpers live in `src/features/canvas/model.ts`:

| Helper                               | Purpose                                   |
| ------------------------------------ | ----------------------------------------- |
| `createInitialCanvasState()`         | Starter document and empty selection      |
| `createWidget(kind)`                 | Node with default props                   |
| `findNode(root, id)`                 | Lookup by ID                              |
| `findNodePath(root, id)`             | Root-to-node path for breadcrumbs         |
| `findParent(root, id)`               | Parent lookup                             |
| `insertChild(root, parentId, child)` | Immutable append                          |
| `removeNode(root, id)`               | Immutable subtree removal                 |
| `updateNodeProps(root, id, patch)`   | Immutable property update                 |
| `resolveInsertionParent(root, id)`   | Container that receives the next widget   |
| `canvasReducer(state, action)`       | Add, select, delete, and property actions |

Selection behaviour:

- Selecting a container and adding a widget appends into that container.
- Selecting a leaf and adding a widget appends into its parent container.
- With nothing selected, widgets append to the root Screen.
- The newly added widget becomes selected.
- Deleting a widget selects its parent.

## 5. Canvas UI

New feature module: `src/features/canvas/`.

- `CanvasWorkspace.tsx` renders the canvas header, palette toolbar, device frame, and widget tree.
- `CanvasNodeView.tsx` renders one widget recursively and handles pointer/keyboard selection.
- `CanvasInspector.tsx` renders the hierarchy breadcrumb and property fields.
- `model.ts` owns the tree, reducer, and helpers.

Canvas layout:

- The editor area becomes a generic shell (`EditorArea` receives a tab label, icon, and children).
- When a project is open, `src/app/DesignSurface.tsx` composes the canvas into the editor and the
  canvas inspector into the right panel.
- With no project open, the Phase 1 welcome surface remains.
- The canvas shows a light Flutter-style preview inside a dark device frame.
- The screen fills the frame; the stage scrolls when the frame is taller than the window.

Interaction:

- Palette buttons: Text, Button, Container, Row, Column.
- Clicking a widget selects it; selection is exposed with `aria-pressed` and a visible outline.
- The toolbar shows which container receives the next widget ("Adding to: Column").
- The toolbar delete action is disabled when nothing is selected or the Screen is selected.
- The device frame starts with a Screen, a Column, a Text, and a Button.

## 6. Inspector UI

The inspector keeps its existing outer shell (`InspectorPanel`) and receives canvas content from the
composition layer.

- No project: "Open a Flutter project to inspect canvas widgets."
- Project open, nothing selected: "Select a widget on the canvas…"
- Selected widget:
  - Breadcrumb from Screen to the selected node; each crumb selects that ancestor.
  - Type summary and node ID.
  - Text: content field.
  - Button: label field.
  - Row / Column: gap field (0–64).
  - Container: padding field (0–96) and background colour.
  - Screen: background colour and a note that it is the root.
  - A note explaining that deleting a container removes its subtree.

All property edits dispatch immutable updates, so the canvas re-renders immediately.

## 7. State and lifecycle

- `DesignSurface` owns the canvas reducer.
- `App` renders `DesignSurface` with a `key` derived from the active project path.
- Opening a different project remounts the surface and resets the design.
- Cancelling the picker does not reset anything.
- The design is not persisted, so restarting the application starts from the starter document.

## 8. Automated tests

Canvas model (`vitest`):

- Starter document shape and selection.
- Add into a selected container, selected leaf's parent, and the root.
- Newly added widget becomes selected.
- Delete removes a subtree, selects the parent, and refuses to delete the root.
- Property updates affect only the target node.
- Path lookup returns the root-to-node chain.
- Insertion target resolution for containers, leaves, and empty selection.

UI (`vitest` + Testing Library):

- Opening/restoring a project shows the canvas instead of the welcome surface.
- Starter Text and Button render on the canvas.
- Palette adds a widget and selects it.
- Adding with a leaf selected inserts into its parent container.
- Clicking a canvas widget updates the inspector.
- Editing text, label, gap, padding, and background updates the canvas.
- Breadcrumb selects an ancestor.
- Delete removes the selected widget and selects its parent.
- The inspector shows the no-project and nothing-selected empty states.

Existing Phase 0 and Phase 1 tests continue to pass, with assertions updated where the project-open
editor surface changed from the project welcome to the canvas.

## 9. Verification commands

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
2. Restore a fixture project and confirm the canvas, palette, and inspector render.
3. Add a widget, select a nested widget, edit a property, and delete a widget over CDP.
4. Confirm zero console errors and capture a screenshot.

## 10. Commit sequence

1. `docs(plan): add Phase 2 implementation plan`
2. `feat(canvas): add widget model and reducer`
3. `feat(canvas): add visual canvas and property inspector`
4. `test(canvas): cover widget model and canvas interactions`
5. `docs: update Phase 2 README and implementation report`

## 11. Risks and limitations

- The canvas is a scratchpad; closing the app or switching projects discards the design.
- Only six widget kinds and a small property set are supported.
- Containers stack children vertically; real Flutter semantics and constraints arrive later.
- There is no drag-and-drop, reordering, undo, or keyboard delete shortcut.
- The light preview does not use the project's actual Flutter theme.
- The device frame uses fixed dimensions rather than a responsive breakpoint model.
- Rendering is DOM-based, not a Flutter engine, so fidelity is intentionally approximate.
