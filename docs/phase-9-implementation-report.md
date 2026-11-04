# Phase 9 - Canvas Editing Depth: Implementation Report

Status: **complete**

## Summary

Phase 9 turns the click-only canvas into a full editing surface. Widgets can be reordered and moved
between containers by drag and drop, selected in groups, duplicated, copied and pasted across
canvases, and edited through shared inspector fields. The widget tree now implements the ARIA tree
keyboard model, and undo/redo history is persisted per canvas so it survives canvas switches and
application restarts. The canvas explorer gained per-canvas duplication and drag reordering.

Everything from Phases 0-8 still works: project opening and restoration, the lazy file tree, file
tabs and safe saves, the canvas and Dart tabs, the inspector, local design persistence, canvas
management, undo/redo, the Dart preview, and the diff-reviewed apply flow.

## Delivered

### Selection model

`CanvasState` moved from a single `selectedId` to `selectedIds` plus an `anchorId`:

```ts
type CanvasSnapshot = {
  root: CanvasNode;
  selectedIds: string[];
  anchorId: string | null;
};

type CanvasState = {
  root: CanvasNode;
  selectedIds: string[];
  anchorId: string | null;
  past: CanvasSnapshot[];
  future: CanvasSnapshot[];
  coalesceKey: string | null;
};
```

- A plain click replaces the selection; `Ctrl`/`Cmd`+click toggles one widget; `Shift`+click extends
  from the anchor over the visible depth-first order.
- The Screen can be selected alone but never joins a multi-selection and cannot be deleted,
  duplicated, copied, or moved.
- Selection-only changes never create history entries. Edit actions snapshot both the tree and the
  selection.
- New reducer actions: `select-many`, `toggle`, `duplicate`, `paste`, `move`, and `move-selection`.
- New helpers in `model.ts`: `cloneSubtree`, `topLevelSelection`, `flattenTree`, `findNodeIndex`,
  `moveNodes`, `duplicateNodes`, `pasteNodes`, `reorderNode`, `normalizeSelection`, and
  `createCanvasState(root, history)`.

### Drag and drop

- Every non-root widget is draggable; the Screen is a valid drop target but cannot be moved.
- The pointer position chooses the drop rule: top edge inserts `before`, bottom edge inserts `after`,
  and the middle of a Row, Column, Container, or Screen drops `inside`.
- Dragging a selected widget moves the whole top-level selection; dragging an unselected widget first
  makes it the only selection.
- Self-drops, drops into a descendant, and `inside` drops on leaves are rejected by the reducer with
  no history entry.
- Visual feedback: an insertion line for `before`/`after`, an accent ring for `inside`, and a muted
  drag source.

### Clipboard, duplicate, and delete

- The clipboard lives in `DesignWorkspaceProvider`, so it survives canvas switches and can paste
  between canvases.
- Copy stores the top-level selected subtrees; paste clones them with fresh widget ids after the
  anchor (or appends to the Screen when nothing is selected) and selects the clones.
- Duplicate inserts cloned subtrees directly after their originals and selects the copies.
- Group delete removes every top-level selected subtree and selects the anchor's parent.
- New `copy`, `clipboard`, and `grip` icons were added to the shared icon set.

### Keyboard model

`CanvasWorkspace` owns expansion state, roving focus, and drag state; the reducer owns selection.

| Key                                | Action                                      |
| ---------------------------------- | ------------------------------------------- |
| `ArrowDown` / `ArrowUp`            | Move focus through visible order            |
| `Home` / `End`                     | First or last visible widget                |
| `ArrowRight`                       | Expand a container or enter its first child |
| `ArrowLeft`                        | Collapse a container or move to its parent  |
| `Enter` / `Space`                  | Select the focused widget                   |
| `Shift+Arrow`                      | Extend the selection from the anchor        |
| `Ctrl+Arrow` (`Cmd`)               | Reorder the anchor among its siblings       |
| `Ctrl+Space`                       | Toggle the focused widget in the selection  |
| `Delete` / `Backspace`             | Delete the selection                        |
| `Ctrl+C` / `Ctrl+V`                | Copy / paste canvas widgets                 |
| `Ctrl+D`                           | Duplicate the selection                     |
| `Ctrl+Z`, `Ctrl+Y`, `Ctrl+Shift+Z` | Undo / redo                                 |

Every tree item keeps `aria-level`, `aria-posinset`, `aria-setsize`, and `aria-selected`; containers
add `aria-expanded` and render children in a `role="group"` wrapper. Only the focused tree item has
`tabIndex=0`. Focus falls back to the anchor's nearest visible ancestor, then the first visible
widget, then the Screen.

### Inspector

- Single selection keeps the breadcrumb, type, ID, and per-kind fields.
- Multi-selection shows the selection count and the kinds involved. Shared fields appear only when
  every selected widget has the same kind; mixed kinds show a note instead.
- Differing values render an empty field with a **Mixed values** placeholder, and editing writes the
  new value to every selected widget.
- Group notes report how many nested widgets a delete will remove.

### Undo/redo persistence

New module `src/features/canvas/canvasHistoryStorage.ts`.

- Storage key: `flutter-ui-studio:history:v1:<encoded project path>`.
- Each canvas entry stores a `rootFingerprint`, up to 40 past snapshots, and up to 20 future
  snapshots. The whole payload is capped at 512 KiB.
- A fingerprint mismatch discards the entry, so a reset or out-of-sync design never offers invalid
  undo steps.
- Snapshots are validated with the design-storage node rules, stale selection ids are filtered, and
  widget ids from restored snapshots are adopted to prevent id reuse.
- Writes are debounced and flushed on `pagehide`, `beforeunload`, canvas switch, and provider
  unmount. Deleting a canvas removes its entry; a duplicated canvas starts with empty history.

### Canvas explorer

- Each canvas row gains a **Duplicate** action. The copy is inserted after its source, named
  `<name> copy` with a numeric suffix when needed, deep-cloned with fresh widget ids, and activated.
- Rows are draggable. Dropping on the top or bottom half of another row moves the source before or
  after it; the active canvas does not change.
- Duplication respects the 20-canvas limit and the 60-character name limit.

### Compatibility

- Design storage still uses version 2 and the existing per-project key; Phase 8 data loads unchanged.
- No new dependencies were added.
- Rust commands are untouched by this phase.

## Files

New:

- `src/features/canvas/canvasHistoryStorage.ts`
- `src/features/canvas/canvasHistoryStorage.test.ts`
- `docs/phase-9-plan.md`
- `docs/phase-9-implementation-report.md`

Changed:

- `src/features/canvas/model.ts`, `model.test.ts`
- `src/features/canvas/designSet.ts`, `designSet.test.ts`
- `src/features/canvas/designStorage.ts` (exported node parsing for history validation)
- `src/features/canvas/designWorkspaceContext.ts`
- `src/features/canvas/DesignWorkspaceProvider.tsx`
- `src/features/canvas/CanvasWorkspace.tsx`
- `src/features/canvas/CanvasNodeView.tsx`
- `src/features/canvas/CanvasInspector.tsx`
- `src/features/canvas/CanvasList.tsx`, `CanvasList.test.tsx`
- `src/app/DesignSurface.tsx`, `DesignSurface.test.tsx`
- `src/shared/components/Icon.tsx`
- `src/shared/styles/global.css`
- `README.md`

## Verification

Frontend, from the repository root:

| Command             | Result                                    |
| ------------------- | ----------------------------------------- |
| `pnpm format:check` | pass                                      |
| `pnpm lint`         | pass                                      |
| `pnpm typecheck`    | pass                                      |
| `pnpm test`         | 224 tests in 14 files pass                |
| `pnpm build`        | pass (TypeScript + Vite production build) |

Test breakdown:

- `model.test.ts`: 42 tests for selection, clipboard, move, duplicate, keyboard reorder, and history.
- `canvasHistoryStorage.test.ts`: 9 tests for fingerprints, validation, limits, and storage failures.
- `designSet.test.ts`: 17 tests including canvas duplication and reordering.
- `DesignSurface.test.tsx`: 38 tests including multi-select, shared inspector fields, drag and drop,
  keyboard navigation, copy/paste, and history across a restart.
- `CanvasList.test.tsx`: 13 tests including canvas duplication and drag reorder.

Rust and desktop:

| Command                                                                          | Result        |
| -------------------------------------------------------------------------------- | ------------- |
| `cargo fmt --check --manifest-path src-tauri/Cargo.toml`                         | pass          |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | pass          |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | 21 tests pass |
| `pnpm tauri build`                                                               | pass          |

Runtime smoke on the release executable with WebView2 remote debugging:

- Multi-select with `Ctrl`/`Shift`, group delete, and undo.
- Drag a widget between containers and reorder siblings.
- Copy in one canvas, switch canvases, paste, and undo.
- Reload the app and undo an edit made before the restart.
- Duplicate and drag-reorder a canvas in the explorer.
- Zero console errors.

The final smoke run finished with one persisted history key, the canvas order
`Canvas 2`, `Canvas 1`, `Canvas 1 copy`, and no console errors.

## Limitations

- Drag and drop uses the internal tree clipboard only; it does not integrate with the operating-system
  clipboard.
- Multi-drag does not introduce automatic reparenting rules beyond moving top-level selected subtrees
  to the chosen target.
- Arbitrary layout constraints, responsive breakpoints, and free-form canvas positioning remain out of
  scope.
- History is capped (40 past / 20 future snapshots per canvas, 512 KiB total) and is discarded when
  the stored widget tree no longer matches its fingerprint.
- Open file tabs, unsaved file buffers, and panel visibility are still not persisted.

## Commits

| Commit    | Summary                                                      |
| --------- | ------------------------------------------------------------ |
| `80c86ba` | `docs: add the Phase 9 implementation plan`                  |
| `0f3dfdb` | `feat(canvas): complete the Phase 9 editing model`           |
| `7c71c11` | `feat(ui): surface Phase 9 in the header and welcome screen` |

The README and this report are committed separately as Phase 9 documentation.

The plan proposed seven smaller commits. The selection-state migration changes every consumer of
`selectedId` at once, so the implementation and its tests were committed together to keep the commit
buildable; documentation is committed separately.
