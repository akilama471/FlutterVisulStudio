# Phase 7 — Implementation Report

Status: **complete**

Phase 7 hardens the Phase 6 workspace instead of adding a new product surface. Canvases can now be
renamed, several deletions can be undone independently, dialogs keep keyboard focus, large designs
warn before browser storage fills up, a pending edit is flushed when the window closes, and the canvas
tree and shortcuts carry clearer accessibility metadata.

The repository has no `AGENTS.md` or product roadmap, so the scope was selected explicitly by the
user and captured in `docs/phase-7-plan.md`:

> Polish + harden existing features: canvas rename, toast queue for multiple deletes, focus trap,
> storage size warnings, accessibility pass.

## Scope delivered

- **Rename canvases** from a pencil action on each explorer row.
  - Dialog with a text field, live validation, **Save name** / **Cancel**, Enter to save, Escape to
    cancel.
  - Trimmed names, 1–60 characters, unique case-insensitively; an unchanged name is a no-op.
  - Validation lives in the canvas-set layer as `canvasNameError` and is shared with
    `renameCanvas`.
- **Queued delete notifications.**
  - Pending deletions are an array instead of a single slot.
  - Each notification owns its own 10-second timer, Undo, and Dismiss.
  - Accessible names include the canvas name, for example `Undo deleting Canvas 2`.
  - Restores use the recorded surviving neighbours (`previousId` / `nextId`), not a stale index, so
    several restores keep the original order.
- **Dialog focus management.**
  - New `useDialogFocusTrap` hook used by the apply, delete, and rename dialogs.
  - Tab and Shift+Tab cycle inside the dialog; disabled, hidden, and `aria-hidden` controls are
    skipped.
  - Focus returns to the invoking control on close when it still exists.
- **Storage awareness and close safety.**
  - `designSetBytes` measures the serialized set with `TextEncoder`, matching the UTF-8 bytes persisted
    by `localStorage`.
  - `MAX_DESIGN_BYTES_WARNING` is 1 MiB. The explorer shows `Design data is N.N MB…` above it.
  - Pending dirty state is flushed synchronously on `pagehide`, `beforeunload`, and provider cleanup.
  - The `Save failed` state gains a storage-specific tooltip.
- **Accessibility polish.**
  - Canvas tree items expose `aria-level`, `aria-posinset`, and `aria-setsize`.
  - Undo/redo buttons expose `aria-keyshortcuts` (`Control+Z`, `Control+Y Control+Shift+Z`).
  - Canvas undo/redo shortcuts are ignored while any `[role="dialog"]` is open.
  - Rename and delete row actions stay keyboard reachable and become visible on focus.
- **Tests and docs** for all of the above, plus the README update and this report.
- All Phase 0–6 behaviour is retained. No Rust command, file write, dependency, or project-folder
  behaviour changed.

## Non-goals

- Drag and drop, canvas reordering, duplicating canvases, multi-select, or copy/paste.
- Persisting undo/redo history across canvas switches or restarts.
- Export/import, cloud sync, or design files in the project folder.
- A full ARIA tree keyboard model (arrow-key navigation).
- Toolchain execution, file watching, or general file editing.

## Environment

No toolchain changes were required in Phase 7.

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

### Canvas set and storage

| File                                              | Responsibility                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `src/features/canvas/designSet.ts`                | `canvasNameError`, `renameCanvas`, `restoreCanvas`, neighbour anchors |
| `src/features/canvas/designStorage.ts`            | `designSetBytes`, `MAX_DESIGN_BYTES_WARNING`                          |
| `src/features/canvas/designWorkspaceContext.ts`   | Rename, delete queue, storage byte/count API                          |
| `src/features/canvas/DesignWorkspaceProvider.tsx` | Queue state, autosave byte count, pagehide/beforeunload flush         |

`RemovedCanvas` now records:

```ts
type RemovedCanvas = {
  canvas: DesignCanvas;
  index: number;
  previousId: string | null;
  nextId: string | null;
};
```

`restoreCanvas` prefers the surviving next neighbour, then the previous neighbour plus one, and only
falls back to the recorded index. A deletion at the end of the list resolves to the list length. This
keeps repeated undo operations in the original visual order.

### Dialogs and accessibility

| File                                      | Responsibility                                       |
| ----------------------------------------- | ---------------------------------------------------- |
| `src/shared/lib/useDialogFocusTrap.ts`    | Tab/Shift+Tab loop and focus restoration             |
| `src/features/canvas/CanvasList.tsx`      | Rename dialog, delete dialog, rename action, warning |
| `src/features/canvas/CanvasUndoToast.tsx` | Stacked notifications with per-toast timers          |
| `src/features/canvas/CanvasNodeView.tsx`  | Tree depth and sibling position                      |
| `src/features/canvas/CanvasWorkspace.tsx` | Undo/redo shortcut metadata and save tooltip         |
| `src/app/DesignSurface.tsx`               | Suppresses canvas shortcuts while a dialog is open   |

The focus trap queries focusable controls on every Tab press, so newly disabled buttons (for example
**Save name** with an invalid name) are handled without re-registering listeners.

### Behaviour changes

- Deleting several canvases in a row keeps every deletion independently recoverable for 10 seconds.
- A rename is autosaved through the same debounced canvas-set path as create, delete, and undo.
- The storage warning is advisory and never blocks editing. It uses the last saved or loaded payload
  size.
- Closing the window with an unsaved edit now writes the pending set synchronously. The handler is
  idempotent and only runs while the state is dirty.
- Shortcuts do not fire underneath an open modal.

## Verification

All commands were run from the repository root on Windows. `cargo` was added to the process `PATH`
with `$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"`.

| Command                                                                          | Result                                             |
| -------------------------------------------------------------------------------- | -------------------------------------------------- |
| `pnpm format:check`                                                              | Passed, all files formatted                        |
| `pnpm lint`                                                                      | Passed, no warnings or errors                      |
| `pnpm typecheck`                                                                 | Passed, no diagnostics                             |
| `pnpm test`                                                                      | 160 tests passed across 11 files                   |
| `pnpm build`                                                                     | Passed; 53 modules, CSS 27.56 kB, JS 275.51 kB     |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                         | Passed                                             |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Passed, no warnings                                |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | 16 tests passed                                    |
| `pnpm tauri build`                                                               | Passed; release compile 2m 13s, MSI and NSIS built |

Focused runs during implementation:

| Area                       | Tests  |
| -------------------------- | ------ |
| Rename (`designSet`, list) | 20     |
| Delete queue               | 22     |
| Focus trap + apply dialog  | 10 + 5 |
| Storage + queue + surface  | 73     |
| Accessibility + queue      | 38     |

Automated tests cover:

- Rename validation for empty, too-long, duplicate, trimmed, unchanged, and missing canvases.
- Rename dialog focus, live errors, disabled save, Enter/Escape, and autosave.
- Independent undo of two queued deletions and their restored order.
- Tab/Shift+Tab cycling and focus restoration for the rename, delete, and apply dialogs.
- UTF-8 byte measurement, the 1 MiB threshold, the explorer warning, and the save-failure tooltip.
- Flushing a pending edit on `pagehide`.
- Tree `aria-level`/`aria-posinset`/`aria-setsize`, shortcut metadata, and ignored shortcuts while a
  dialog is open.

## Build artifacts

```text
src-tauri/target/release/flutter-ui-studio.exe
src-tauri/target/release/bundle/msi/Flutter UI Studio_0.1.0_x64_en-US.msi          (2.95 MiB)
src-tauri/target/release/bundle/nsis/Flutter UI Studio_0.1.0_x64-setup.exe         (1.98 MiB)
```

## Launch smoke test

A clean temporary Flutter fixture was created at
`C:\Users\Akila\AppData\Local\Temp\opencode\flutter-ui-studio-phase7-fixture`. The release executable
was started with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9334` and driven over
the WebView2 DevTools protocol by
`C:\Users\Akila\AppData\Local\Temp\opencode\phase-7-smoke.cjs`.

Procedure:

1. Seed the fixture as the remembered project, clear saved designs, and reload.
2. Create two more canvases, rename `Canvas 3` to `Settings`, and check Tab/Shift+Tab stays inside
   the rename dialog.
3. Delete `Canvas 2` and `Settings`, confirm two stacked notifications, and undo each one.
4. Edit the first canvas, dispatch `pagehide`, and inspect the persisted payload.
5. Close gracefully, relaunch, and confirm names, active canvas, and the flushed edit restore.
6. Relaunch with a ~1.2 MB valid v2 payload and confirm the storage warning, then clean up.

Observed results:

- Rename dialog focus: input → Tab → **Cancel** → Shift+Tab → input.
- Delete dialog focus: **Cancel** → Tab → **Delete canvas** → Shift+Tab → **Cancel**.
- Toast messages in order: `“Settings” deleted.` then `“Canvas 2” deleted.`
- After undoing both, canvas order was `Canvas 1`, `Canvas 2`, `Settings`.
- The `pagehide` payload already contained `Flushed edit`, and `Saved locally` was reported.
- After restart: active canvas `Canvas 1`, the same three names, tree label
  `Text "Flushed edit"`, and `Saved locally`.
- Storage warning:
  `Design data is 1.2 MB. Browser storage is limited; delete unused canvases to free space.`
  with a 1,214,871-byte payload.
- Zero console errors or uncaught exceptions were recorded.

Screenshots (not committed):

- `C:\Users\Akila\AppData\Local\Temp\opencode\phase-7-canvases.png`
- `C:\Users\Akila\AppData\Local\Temp\opencode\phase-7-restored.png`
- `C:\Users\Akila\AppData\Local\Temp\opencode\phase-7-storage-warning.png`

## Commits

| Commit    | Summary                                                        |
| --------- | -------------------------------------------------------------- |
| `9792ccf` | `docs(plan): add Phase 7 polish and hardening plan`            |
| `7888c4d` | `feat(canvas): rename canvases with validation`                |
| `6003935` | `feat(canvas): queue deleted canvas notifications`             |
| `bff0b98` | `feat(a11y): trap focus inside dialogs`                        |
| `88c6a9d` | `feat(storage): warn on large designs and flush before close`  |
| `1f49f26` | `chore(a11y): polish canvas tree labels and shortcut handling` |

The README and this report are committed separately as Phase 7 documentation. Tests were committed
with their feature commits rather than as a separate test commit.

## Limitations and follow-ups

- The storage warning is advisory: the real quota is browser-defined, and the measurement uses the
  last saved payload, so an unsaved burst of edits may cross the threshold before the next write.
- The close flush covers `pagehide` and `beforeunload`, but a hard crash or process kill can still
  lose the last debounce window.
- Delete notifications live only for their 10-second window and only in memory; restarting the
  application makes a deleted canvas unrecoverable.
- Rename uniqueness is case-insensitive but not Unicode-normalised, so visually identical names with
  different Unicode compositions are treated as distinct.
- Focus trapping is Tab/Shift+Tab only. There is no arrow-key tree navigation, roving tabindex, or
  screen-reader announcement of canvas reordering.
- Restored positions rely on surviving neighbour IDs. If a neighbour is also deleted and not
  restored, the canvas falls back to the recorded index or the end of the list.
- The bundle identifier `com.flutteruistudio.app` still ends in `.app`, which triggers a non-blocking
  Tauri warning and should be renamed before shipping macOS bundles.
- Installers are unsigned, so Windows SmartScreen may warn on other machines.
- Release artifacts are not committed to git; rebuild with `pnpm tauri build`.
