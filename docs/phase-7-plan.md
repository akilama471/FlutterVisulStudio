# Phase 7 — Polish and Hardening Plan

Status: **approved for implementation** (scope selected by the user)

## Objective

Harden the Phase 6 workspace without adding a new product surface. Phase 7 fixes the sharp edges left
by the canvas work: canvases cannot be renamed, a second quick deletion makes the first unrecoverable,
dialogs let Tab escape behind the modal, large designs approach the localStorage quota silently, and a
pending autosave can be lost when the window closes.

No Rust command, file write, or project-folder behaviour changes in this phase.

## Scope

1. **Rename canvases**
   - Rename action on every canvas row.
   - Modal with a text field, live validation, Save/Cancel, Enter/Escape, focus trap.
   - Trimmed names, 1–60 characters, unique case-insensitively, unchanged name is a no-op.
   - Renames autosave through the existing canvas-set path.
2. **Queue deleted-canvas notifications**
   - Multiple deletions within the undo window stay recoverable independently.
   - Each notification has its own 10-second timer, Undo, and Dismiss.
   - Undo restores that canvas at its recorded position and activates it.
3. **Dialog focus management**
   - Shared focus-trap hook for the apply, delete, and rename dialogs.
   - Tab and Shift+Tab cycle inside the dialog.
   - Focus returns to the invoking control on close when it still exists.
4. **Storage size awareness and close safety**
   - Measure the serialized canvas-set payload.
   - Warn in the explorer when the design exceeds 1 MiB.
   - Flush a dirty canvas set on `pagehide`/`beforeunload`.
   - Keep the existing `Save failed` state; add a clearer storage-specific title.
5. **Accessibility polish**
   - Canvas tree items expose `aria-level` and sibling position.
   - Undo/redo buttons expose `aria-keyshortcuts`.
   - Shortcuts are ignored while any modal dialog is open.
   - Rename/delete row actions remain keyboard reachable and visible on focus.
6. **Docs**
   - README usage for rename, queued notifications, and storage limits.
   - `docs/phase-7-implementation-report.md` with results and limitations.

## Decisions

- Rename entry point: a pencil icon button per row labelled `Rename <name>`, opening a dialog. No
  inline editing, to keep keyboard and screen-reader behaviour simple.
- Rename validation lives in the canvas-set layer and is reused by storage parsing. The dialog shows
  `Name is required`, `Name is too long`, or `A canvas with this name already exists`.
- Toast queue: an array of pending deletions in the provider, rendered as a vertical stack above the
  status bar. Each item expires after 10 seconds from its own deletion.
- Toast button labels stay `Undo` and `Dismiss` visually; accessible names include the canvas name
  (for example `Undo deleting Canvas 2`) so multiple notifications are distinguishable.
- Storage warning threshold: 1 MiB of serialized UTF-8 payload. The copy says the browser storage
  limit is being approached and suggests deleting unused canvases. No hard quota is assumed.
- Byte count uses `TextEncoder`, which matches the UTF-8 bytes persisted by `localStorage`.
- Both `pagehide` and `beforeunload` are handled; saves are synchronous and idempotent, and the
  handler only writes when the state is dirty.
- No new dependency. Focus trapping and byte measurement are small local utilities.

## Data and API changes

`src/features/canvas/designSet.ts`

- `renameCanvas(set, id, name)` returns a new set or the same set when invalid/unchanged.
- `canvasNameError(canvases, id, name)` returns `null` or a stable error code:
  `"empty" | "too-long" | "duplicate"`.
- `nextCanvasName` continues to generate gap-filling names.

`src/features/canvas/designStorage.ts`

- `designSetBytes(set)` returns the UTF-8 byte length of `serializeDesignSet(set)`.
- `MAX_DESIGN_BYTES_WARNING = 1024 * 1024` is exported for the provider and tests.
- Parsing rules are unchanged.

`src/features/canvas/designWorkspaceContext.ts`

- `renameCanvas: (id: string, name: string) => void`.
- `deletedCanvases: readonly DeletedCanvas[]` replaces `deletedCanvas`.
- `undoDelete: (id: string) => void` and `dismissDelete: (id: string) => void`.
- `storageBytes: number` and `storageWarning: boolean`.

`src/features/canvas/DesignWorkspaceProvider.tsx`

- Pending deletions live in an array; create/delete/undo update it immutably.
- Autosave records the byte count on success and on load.
- A mount-time `pagehide`/`beforeunload` listener flushes dirty state.

`src/shared/lib/useDialogFocusTrap.ts` (new)

- Traps Tab/Shift+Tab, ignores disabled/hidden controls, and restores the previous focus target.

## UI changes

- `CanvasList` adds the rename action and `RenameCanvasDialog`.
- `CanvasUndoToast` maps `deletedCanvases` into a stack; each item owns its timer.
- `ApplyDartDialog` and the delete dialog adopt the focus-trap hook.
- `CanvasNodeView` adds level/position attributes.
- `CanvasWorkspace` adds `aria-keyshortcuts` to the history buttons.
- `DesignSurface` ignores undo/redo shortcuts while a dialog is open.
- `global.css` gets the toast stack layout, rename dialog row, warning note, and focus-visible styles.

## Commit sequence

| #   | Commit                                                         |
| --- | -------------------------------------------------------------- |
| 1   | `docs(plan): add Phase 7 polish and hardening plan`            |
| 2   | `feat(canvas): rename canvases with validation`                |
| 3   | `feat(canvas): queue deleted canvas notifications`             |
| 4   | `feat(a11y): trap focus inside dialogs`                        |
| 5   | `feat(storage): warn on large designs and flush before close`  |
| 6   | `chore(a11y): polish canvas tree labels and shortcut handling` |
| 7   | `test(canvas): cover Phase 7 polish behaviour`                 |
| 8   | `docs: update Phase 7 README and implementation report`        |

Each implementation commit keeps formatting, lint, type-checking, and its focused tests green. The
full suite and Tauri build run before the documentation commit.

## Verification plan

- Focused Vitest runs while implementing: `designSet`, `designStorage`, `CanvasList`,
  `ApplyDartDialog`, `DesignSurface`, `App`.
- Full frontend checks: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Rust checks only to confirm Phase 5 remains intact: `cargo fmt --check`, `cargo clippy -D warnings`,
  `cargo test`.
- `pnpm tauri build`.
- Runtime smoke: rename two canvases (valid, duplicate, empty), delete two canvases and undo each
  from the queue, Tab through each dialog and confirm focus stays inside, verify the storage warning
  with an oversized fixture if practical, restart and confirm renames persist, and check zero console
  errors.

## Risks

- Multiple pending deletions reinserted at stale indexes can land in a slightly different position;
  `insertCanvas` already clamps, and the notification is short-lived.
- Storage warning is advisory because the real quota is browser-defined; it must not block editing.
- Focus trapping can fight `user-event` Tab tests if hidden or disabled controls are included; the
  utility filters both.
- Flushing on window close uses synchronous localStorage writes and must never throw.

## Out of scope

- Drag and drop, reordering, multi-select, copy/paste, or duplicating canvases.
- Persisting undo/redo history across restarts.
- Export/import, cloud sync, or project-folder design files.
- General file editing, toolchain execution, or file watching.
- A full ARIA tree keyboard model (arrow-key navigation); this phase only improves labels and levels.
