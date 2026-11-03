# Phase 6 — Canvas Management and Undo/Redo: Implementation Plan

Project: **Flutter UI Studio**
Status: Approved scope; implementation plan for Phase 6
Prerequisite: Phase 5 complete at `ebd43d8`

## 1. Context

Phases 0–5 built a project workspace, a visual canvas, an inspector, local design persistence,
Dart generation, and a safe apply flow for the project entry point. The studio now has one design per
project, stored in `window.localStorage` under a project-specific key.

Two gaps remain:

- An accidental delete or inspector edit is saved immediately by autosave with no undo.
- A project can hold only one design, so there is no way to create or remove canvases.

The user selected Phase 6 scope explicitly:

> 1. Undo/redo, with safety for destructive edits under autosave.
> 2. File create (new canvas).
> 3. File delete (canvas delete).

Storage, UI placement, and delete behaviour were also chosen explicitly:

- **Storage:** multiple canvases per project in `localStorage`; no project-folder writes.
- **UI:** a **Canvases** section in the Explorer panel.
- **Delete:** confirmation dialog plus an undo notification.

## 2. Goals

- Add per-canvas undo and redo with `Ctrl+Z`, `Ctrl+Y`, and `Ctrl+Shift+Z`.
- Add **Undo** / **Redo** buttons with correct disabled states.
- Coalesce consecutive inspector edits to the same widget into one undo step.
- Keep autosave working after edits, undo, redo, and canvas operations.
- Store several named canvases per project and restore them on restart.
- Create a new starter canvas from the Explorer and activate it.
- Delete a canvas only after confirmation, with an undo notification.
- Keep at least one canvas per project and cap the number of canvases.
- Migrate the existing single design into a **Main** canvas without losing it.
- Keep Phase 0–5 project, canvas, inspector, persistence, Dart, clipboard, and apply behaviour.

## 3. Non-goals

- Writing design JSON or any file into the Flutter project.
- Renaming, duplicating, reordering, importing, or exporting canvases.
- Persisting undo history across restarts or canvas switches.
- Undoing or redoing canvas creation/deletion through `Ctrl+Z`; deletion uses its own undo
  notification.
- Multi-select, drag and drop, copy/paste, or moving widgets between canvases.
- Cloud sync, sharing, or version history.
- Changes to the Dart generator, Dart preview, or safe apply flow.
- Schema migration beyond the single Phase 4 design payload.

## 4. Storage model

New key, one per project:

```text
flutter-ui-studio:designs:v2:<encoded project path>
```

Payload:

```json
{
  "version": 2,
  "activeId": "canvas-2",
  "canvases": [{ "id": "canvas-1", "name": "Canvas 1", "root": { "...": "CanvasNode" } }]
}
```

Rules:

- 1–20 canvases per project.
- Unique canvas IDs, unique case-insensitive names, names 1–60 characters after trimming.
- `activeId` must reference an existing canvas.
- Every root is validated with the existing Phase 4 node rules: Screen root, known kinds, unique
  IDs per canvas, node and depth caps, property bounds, no nested Screens, no children on leaves.
- Unknown fields are discarded on load.
- Invalid payloads fall back to a starter canvas and are replaced on the next save.
- Read/write failures still surface as `Save failed`; the canvas stays editable in memory.

Migration:

1. If the v2 key exists and parses, use it.
2. Otherwise read the Phase 4 key `flutter-ui-studio:design:v1:<encoded path>`.
3. A valid legacy design becomes one canvas named **Main** with status `migrated`.
4. The v2 payload is saved on mount; only after a successful save is the legacy key removed.
5. A failed migration save keeps the legacy key and shows `Save failed`.
6. If both payloads are invalid, start from the starter canvas.

Canvas IDs and names are generated without timestamps or randomness so tests stay deterministic:
`canvas-1`, `canvas-2`, … and the first unused `Canvas N`.

## 5. Undo/redo model

`CanvasState` gains three fields:

```ts
type CanvasSnapshot = { root: CanvasNode; selectedId: string | null };

type CanvasState = {
  root: CanvasNode;
  selectedId: string | null;
  past: CanvasSnapshot[];
  future: CanvasSnapshot[];
  coalesceKey: string | null;
};
```

Reducer rules:

- `add`, `delete`, and `update` push the previous snapshot onto `past`, cap it at 100 entries, and
  clear `future`.
- Consecutive `update` actions on the same selected widget reuse `update:<widgetId>` as the
  coalescing key and do not push another snapshot. Changing the selection or running any other
  action breaks the group.
- `select` never creates history but clears the coalescing key.
- `undo` restores the last snapshot, pushes the current one onto `future`, and clears the coalescing
  key.
- `redo` consumes the first `future` snapshot and pushes the current one onto `past`.
- Undo/redo are no-ops at the ends of the history.
- Selection is part of a snapshot, so undoing a delete restores and selects the deleted subtree.
- History is per mounted canvas, in memory only; switching canvases starts a fresh history.

Every root change flows through the existing autosave effect, so undo and redo are saved like any
other edit. Autosave continues to debounce for 250 ms, and the workspace also flushes pending
changes on unmount.

## 6. Workspace state

A `DesignWorkspaceProvider` is mounted per active project (keyed by project path) and owns:

- The loaded canvas set, active canvas, and dirty/save state.
- Debounced whole-set saves, legacy migration cleanup, and unmount flush.
- Create, select, delete, undo-delete, and root-update operations.
- The last deleted canvas and a 10-second undo window.

The Explorer and the design surface read the same context, so creating, switching, or deleting a
canvas updates both immediately.

`DesignSurface` renders the active canvas through a keyed editor component. The key resets reducer
history, selection, and the active tab when the canvas changes. The Dart preview uses the active
canvas's generated code and the existing Phase 5 apply flow.

Deleting:

1. Delete is disabled when only one canvas remains.
2. Otherwise a confirmation dialog opens with the canvas name.
3. Confirming removes the canvas, activates its nearest neighbour, saves, and shows
   `"<name>" deleted.` with **Undo**.
4. Undo reinserts the canvas at its previous index, activates it, and saves.
5. The notification auto-dismisses after 10 seconds and can be dismissed manually.

## 7. UI changes

| File                                              | Change                                                    |
| ------------------------------------------------- | --------------------------------------------------------- |
| `src/features/canvas/designSet.ts`                | Canvas set types, ID/name generation, set operations      |
| `src/features/canvas/designStorage.ts`            | v2 parse/serialize/load/save, legacy migration            |
| `src/features/canvas/designWorkspaceContext.ts`   | Context and `useDesignWorkspace` hook                     |
| `src/features/canvas/DesignWorkspaceProvider.tsx` | Provider with autosave, migration, delete, and undo state |
| `src/features/canvas/CanvasUndoToast.tsx`         | Delete notification with Undo and Dismiss                 |
| `src/features/canvas/CanvasList.tsx`              | Explorer canvas list, new-canvas action, delete dialog    |
| `src/features/canvas/model.ts`                    | History fields and undo/redo actions                      |
| `src/features/canvas/CanvasWorkspace.tsx`         | Undo/redo buttons, active canvas name                     |
| `src/app/DesignSurface.tsx`                       | Context integration, keyed canvas editor                  |
| `src/app/App.tsx`                                 | Provider per project, undo toast                          |
| `src/features/project/ProjectExplorer.tsx`        | Renders the canvas list above project files               |
| `src/shared/components/Icon.tsx`                  | `plus`, `undo`, `redo`, `x` icons                         |
| `src/shared/components/Button.tsx`                | Optional destructive `danger` variant                     |
| `src/shared/styles/global.css`                    | Canvas list, history buttons, compact dialog, toast       |
| `src/features/editor/WorkbenchHeader.tsx`         | Phase 6 badge                                             |
| `src/features/editor/EditorWelcome.tsx`           | Phase 6 capability and note                               |

The canvas header keeps the **Canvas** heading and adds the active canvas name to the subtitle, so
the Explorer remains the primary canvas switcher.

## 8. Automated tests

Canvas model (`vitest`):

- Undo/redo add, delete, and property edits.
- Coalescing consecutive edits to one widget.
- A new history entry after switching selection.
- Redo cleared by a new edit.
- No-op undo/redo at the ends.
- History capped at 100 entries.

Canvas set and storage:

- Set round-trip, multiple canvases, and active canvas persistence.
- Unique names and IDs; canvas limit; at least one canvas retained.
- Remove/insert restores position and activation.
- Legacy v1 migration, legacy cleanup after save, and migration fallback.
- Invalid JSON, version, empty/oversized sets, duplicate IDs/names, bad active ID, and invalid roots.
- Read/write failure reporting.
- Refusal to save an unserialisable set.
- Widget ID sequence adoption after load.

Explorer and surface:

- New canvas creates and activates a starter canvas.
- Switching canvases shows independent designs.
- Delete requires confirmation; cancel keeps the canvas.
- Delete and undo restore the canvas and its design.
- Delete is disabled for the last canvas.
- Undo/redo buttons and keyboard shortcuts update the canvas and autosave.
- Existing Phase 3–5 canvas, inspector, Dart, persistence, clipboard, and apply tests pass.

App shell:

- Phase 6 badge.
- The canvas list is rendered for an open project.
- Create, switch, delete, and undo work through the shell.

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

Rust code is unchanged in Phase 6; Cargo checks confirm Phase 5 is unaffected.

Runtime smoke test:

1. Use a temporary Flutter project fixture.
2. Launch the release executable and open the fixture.
3. Create a second canvas, edit it, switch back, and verify the first canvas is unchanged.
4. Undo and redo an inspector edit and a widget deletion.
5. Delete a canvas, then undo from the notification.
6. Restart and verify both canvases and the active canvas restore.
7. Confirm zero console errors and capture screenshots.

## 10. Commit sequence

1. `docs(plan): add Phase 6 implementation plan`
2. `feat(canvas): add undo and redo history to the canvas model`
3. `feat(canvas): persist multiple canvases per project`
4. `feat(canvas): add canvas create, switch, and delete to the explorer`
5. `test(canvas): cover undo, multi-canvas storage, and canvas management`
6. `chore(ui): update shell copy for Phase 6`
7. `docs: update Phase 6 README and implementation report`

## 11. Risks and limitations

- Canvas data remains only in this application's local storage; clearing WebView data removes every
  canvas, and the data is not portable between machines.
- Whole-set saves rewrite all canvases for a project on each autosave.
- History is in memory and resets when the canvas changes or the application restarts.
- A deleted canvas is recoverable only while the notification is open.
- Consecutive inspector edits to one widget collapse into one undo step.
- The project folder is still never modified, so canvases are not visible to Flutter or git.
- Canvas names are generated; there is no rename UI yet.
- The set is capped at 20 canvases to keep local storage writes bounded.
