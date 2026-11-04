# Phase 9 - Canvas Editing Depth: Implementation Plan

Status: **approved**

## Goal

Phase 9 turns the click-only canvas into a complete editing surface. Users can reorganise the
widget tree with the pointer or the keyboard, work with more than one widget at a time, move
subtrees between canvases through a shared clipboard, keep undo/redo history per canvas across
switches and restarts, and duplicate or reorder canvases from the explorer.

The phase stays inside the existing tree model. It deliberately does not add layout constraints,
responsive breakpoints, or free-form positioning.

## Scope

Delivered:

- Drag and drop to reorder widgets and move subtrees between containers.
- Duplicate a widget or subtree, copy/paste within and across canvases, and group delete.
- Multi-select with `Shift` and `Ctrl`/`Cmd`, group delete, and shared property edits when the
  selected widgets have the same kind.
- A full ARIA tree keyboard model: arrow navigation, `Home`/`End`, expand/collapse, `Enter`/`Space`
  selection, `Shift` range selection, `Ctrl+Arrow` reorder, and roving tabindex.
- Undo/redo history persisted per canvas through canvas switches and application restarts.
- Per-canvas duplicate and drag reorder in the canvas explorer.

Excluded:

- Arbitrary layout constraints, responsive breakpoints, free-form canvas positioning.
- Multi-drag across unrelated parents with automatic reparenting rules beyond top-level selected
  subtrees.
- Syncing the internal canvas clipboard with the operating-system clipboard.

## State Model

`CanvasState` moves from one selection to a selection set plus a primary anchor:

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

Rules:

- `selectedIds` is unique, ordered by selection time, and never contains a stale node id.
- `anchorId` is the primary widget used for inspector insertion, paste placement, breadcrumbs, and
  keyboard reorder. It is always present in `selectedIds`, or `null` when the selection is empty.
- A plain click replaces the selection. `Shift+click` extends from the anchor over the visible
  depth-first order. `Ctrl`/`Cmd+click` toggles one node.
- The screen root can be selected alone but never joins a multi-selection. It cannot be deleted,
  duplicated, copied, or moved.
- Selection changes do not create history entries. Edit actions snapshot both the tree and the
  selection.

New reducer actions:

| Action           | Behaviour                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `select`         | Replace with one node, or clear.                                                                                               |
| `select-many`    | Replace with a validated, de-duplicated set and an explicit anchor.                                                            |
| `toggle`         | Add or remove one node; toggling the root falls back to a single root selection.                                               |
| `duplicate`      | Clone each top-level selected subtree with fresh ids, insert it directly after its original, and select the clones.            |
| `paste`          | Clone clipboard nodes with fresh ids after the anchor, or append to the root when nothing is selected, and select the clones.  |
| `move`           | Move top-level selected subtrees to a target node and position (`before`, `inside`, `after`), rejecting self/descendant drops. |
| `move-selection` | Reorder the anchor one position among its siblings in the given direction.                                                     |
| `delete`         | Remove all top-level selected subtrees, then select the anchor's parent.                                                       |
| `update`         | Apply a patch to every selected node and coalesce consecutive edits into one history entry.                                    |

Pure helpers added to `model.ts`:

- `cloneSubtree(node)` with fresh widget ids.
- `topLevelSelection(root, ids)` to drop ids whose ancestor is also selected.
- `flattenTree(root)` for visible-order keyboard and range selection.
- `findNodeIndex`, `moveNodes`, `duplicateNodes`, `removeNodes`, and `insertChildren`.
- `createCanvasState(root, history?)` and snapshot validation helpers.

`findNode`, `findNodePath`, `findParent`, `insertChild`, `removeNode`, `updateNodeProps`, and
`resolveInsertionParent` keep working. `resolveInsertionParent` accepts the anchor id.

## Clipboard

The clipboard lives in `DesignWorkspaceProvider`, not in a single canvas view, so switching canvases
keeps it available.

- `copySelection(canvasId, ids)` stores the selected top-level subtrees as immutable `CanvasNode`
  values.
- The provider exposes `clipboard` and `copySelection` through `DesignWorkspaceContext`.
- The reducer performs the id rewrite at paste time, so copying the same subtree twice produces
  distinct widget ids.
- Clipboard contents are capped at the same 1000-node safety limit used by design storage.

## Undo/Redo Persistence

New module `src/features/canvas/canvasHistoryStorage.ts`.

Storage key:

```text
flutter-ui-studio:history:v1:<encoded project path>
```

Payload:

```ts
type PersistedHistory = {
  version: 1;
  entries: Record<
    string,
    {
      rootFingerprint: string;
      past: CanvasSnapshot[];
      future: CanvasSnapshot[];
    }
  >;
};
```

Behaviour:

- The provider loads history once per project, validates it, and keeps it in a ref-backed map so
  canvas switches do not lose in-memory history.
- `rootFingerprint` is a stable hash of the current root. A mismatched fingerprint means the design
  was reset or restored out of sync, so the entry is discarded instead of offering invalid undos.
- Snapshots are validated with the same node rules as design storage. Selection ids that no longer
  exist in the root are filtered out on restore.
- Limits: 40 past and 20 future snapshots per canvas, and a 512 KiB serialized ceiling for the
  whole history payload. Oldest snapshots are dropped first; if the ceiling still cannot be met,
  the history entry is not persisted.
- Writes are debounced. History is flushed on `pagehide`, `beforeunload`, canvas switch, and
  provider unmount. Canvas deletion removes that canvas's entry.
- A duplicated canvas starts with empty history.

## Tree Interaction

### Keyboard model

`CanvasWorkspace` owns expansion state (`collapsedIds`) and the roving focus id. The reducer owns
selection.

- `ArrowDown` / `ArrowUp`: move focus through visible depth-first order.
- `Home` / `End`: first or last visible node.
- `ArrowRight`: expand a collapsed container, otherwise move to its first child.
- `ArrowLeft`: collapse an expanded container, otherwise move to the parent.
- `Enter` / `Space`: select the focused node.
- `Shift+ArrowUp` / `Shift+ArrowDown`: extend the selection from the anchor over visible order.
- `Ctrl+ArrowUp` / `Ctrl+ArrowDown` (`Cmd` on macOS): reorder the anchor among its siblings.
- `Ctrl+Space`: toggle the focused node in the selection.
- `Delete` / `Backspace`: delete the selection when focus is not in a text field.
- Roving tabindex: only the focused treeitem has `tabIndex=0`; all others use `-1`.
- Every treeitem keeps `aria-level`, `aria-posinset`, and `aria-setsize`. Containers add
  `aria-expanded`; children render inside a `role="group"` wrapper.

Selection follows focus for plain arrow navigation. If focus disappears after undo/delete, it falls
back to the anchor, then the first visible node, then the root.

### Drag and drop

- Every non-root treeitem is draggable. The screen root is a valid drop target but cannot be moved.
- Drop position is derived from the pointer: the top edge of a node means `before`, the bottom edge
  means `after`, and the middle of a container means `inside`.
- Dropping inside a container appends as its last child. Dropping before/after a node inserts into
  that node's parent at the matching index.
- Dragging a selected node moves all top-level selected subtrees, preserving their document order.
  Dragging an unselected node first makes it the only selection.
- Invalid drops (onto self, into a descendant, or onto a leaf's `inside` area) are rejected by the
  reducer and produce no history entry.
- Visual feedback: inside targets receive an accent ring; before/after targets receive an insertion
  line. The drag source receives a muted state while dragging.

## Canvas Workspace UI

- Header status reports one selected widget or `N widgets selected`.
- Toolbar gains **Copy**, **Duplicate**, and **Paste** actions:
  - Copy and duplicate are disabled unless the selection contains a non-root node.
  - Paste is disabled while the internal clipboard is empty.
  - Existing **Delete widget** and palette behaviour stays, with the palette targeting the anchor.
- The stage background still selects the root when clicked.
- Container nodes gain a chevron toggle for expand/collapse, with an accessible label that includes
  the widget type.

## Inspector

- Single selection keeps the current breadcrumb, summary, and per-kind fields.
- Multi-selection shows the count and the kinds involved. It offers shared fields only when every
  selected widget has the same kind:
  - Text: content.
  - Button: label.
  - Row/Column: gap.
  - Container: padding and background.
  - Screen: background.
- Mixed kinds show a short note that shared properties require matching widget kinds.
- When values differ, the field is empty with a `Mixed values` placeholder. Editing writes the new
  value to every selected widget.
- Group notes explain how many widgets and descendants a delete will remove.

## Canvas Explorer

- Each canvas row gains a **Duplicate** action. The copy is inserted directly after its source,
  receives a unique `"<name> copy"` name (with a numeric suffix when needed), deep-clones the root
  with fresh widget ids, and becomes active.
- Rows are draggable. Dropping on the top or bottom half of another row moves the source before or
  after that row. The active canvas is unchanged by reordering.
- Reordering and duplication respect `MAX_CANVASES` and the existing name length limit.
- New `copy`, `clipboard`, and `grip` icons are added to the shared icon set.

## Global Shortcuts

`DesignSurface` extends its existing global handler, still ignoring dialogs and text inputs:

| Shortcut                  | Action                 |
| ------------------------- | ---------------------- |
| `Ctrl+C` / `Cmd+C`        | Copy canvas selection  |
| `Ctrl+V` / `Cmd+V`        | Paste into the canvas  |
| `Ctrl+D` / `Cmd+D`        | Duplicate selection    |
| `Delete` / `Backspace`    | Delete selection       |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo (existing) |
| `Ctrl+Y`                  | Redo (existing)        |

## Files

New:

- `docs/phase-9-plan.md`
- `src/features/canvas/canvasHistoryStorage.ts`
- `src/features/canvas/canvasHistoryStorage.test.ts`
- `docs/phase-9-implementation-report.md`

Changed:

- `src/features/canvas/model.ts`, `model.test.ts`
- `src/features/canvas/designSet.ts`, `designSet.test.ts`
- `src/features/canvas/designStorage.ts` (export node validation for history)
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

## Commit Sequence

1. `docs: add the Phase 9 implementation plan`
2. `feat(canvas): add multi-selection, clipboard, move, and duplicate model actions`
3. `feat(canvas): add tree keyboard navigation, drag and drop, and multi-edit inspector`
4. `feat(canvas): persist undo and redo history per canvas`
5. `feat(explorer): duplicate and drag-reorder canvases`
6. `test(canvas): cover editing depth, history, and explorer interactions`
7. `docs: update the README and add the Phase 9 implementation report`

Each commit leaves the frontend checks green. Rust and Tauri builds are run once at the end because
Phase 9 does not change the Rust commands.

## Verification

Focused tests during development, then from the repository root:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Rust and desktop:

```text
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

Runtime smoke on the release executable with CDP:

- Multi-select with `Ctrl`/`Shift`, group delete, and undo.
- Drag a widget between containers and reorder siblings.
- Copy in one canvas, switch canvases, paste, and undo.
- Reload the app and undo an edit made before the restart.
- Duplicate and drag-reorder a canvas in the explorer.
- Zero console errors.

## Risks and Mitigations

- **Selection migration:** every `selectedId` consumer is updated in the same commit as the reducer
  change; `model.test.ts` is migrated first to lock the new contract.
- **History payload size:** aggressive per-canvas and whole-payload limits plus fingerprint checks
  prevent stale or oversized storage from affecting startup.
- **Nested drag targets:** HTML5 drag events bubble, so drop handling calls `stopPropagation` and
  resolves the target from the event's current target, not the deepest child.
- **Roving focus after mutation:** focus is reconciled against the current visible tree after every
  render, with root as the final fallback.
