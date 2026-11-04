# Phase 6 — Implementation Report

Status: **complete**

Phase 6 makes the workspace safer to experiment in. Every mounted canvas now has undo and redo, and a
project can hold several canvases that are created, switched, and deleted from the explorer. All of it
autosaves through the Phase 4 storage path; the project folder is still never touched.

The scope was selected explicitly by the user and captured in `docs/phase-6-plan.md`:

> Add undo/redo with autosave safety, plus create and delete canvases ("files") inside the existing
> local-storage workspace.

## Scope delivered

- Per-canvas undo/redo with a bounded in-memory history of 100 steps.
- Header **Undo** / **Redo** buttons and `Ctrl+Z`, `Ctrl+Y`, `Ctrl+Shift+Z` shortcuts.
- Consecutive inspector edits to the same widget coalesce into one history step.
- Undo and redo use the same debounced autosave as normal edits.
- Multiple canvases per project, listed under **Canvases** in the explorer.
- **New canvas** action with generated names (`Canvas N`) and a 20-canvas cap.
- Independent widget trees per canvas, with the active canvas persisted.
- Confirm-before-delete and a 10-second undo notification for deleted canvases.
- Version 2 local storage for canvas sets, migrating Phase 4 designs into a **Main** canvas.
- Phase 6 badge, updated welcome capabilities, and welcome note.
- Unit tests for history, canvas sets, storage/migration, the canvas list, and undo/redo in the
  design surface.
- All Phase 0–5 behaviour is retained; Rust is unchanged.

## Non-goals

- Persisting undo/redo history across canvas switches or restarts.
- Renaming, reordering, or duplicating canvases.
- Writing design JSON or any file other than the Dart entry point.
- A general writable file editor, toolchain execution, or file watching.
- Drag and drop, multi-select, or copy/paste of widgets.
- Multi-file generation, cloud sync, export/import, or design sharing.

## Environment

No toolchain changes were required in Phase 6.

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

### History

`src/features/canvas/model.ts` extends `CanvasState` with `past`, `future`, and `coalesceKey`.
Snapshots contain the root and selection, so undoing a delete also restores the previous selection.

- `MAX_HISTORY = 100`; older snapshots are trimmed from the front.
- Every mutating action commits through `commit`, which appends the previous state and clears redo.
- Inspector updates use `coalesceKey = "update:<widget id>"`. Consecutive updates to the same widget
  reuse the existing history entry, so typing a word is one undo step.
- Changing selection resets the coalesce key, so the next edit starts a new step.
- `undo` moves the current snapshot into `future`; `redo` moves it back into `past`. Both clear the
  coalesce key.
- No-op edits return the same state and do not create history.

### Canvases and storage

| File                                              | Responsibility                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `src/features/canvas/designSet.ts`                | Canvas set types, ID/name generation, cap, add/select/remove/insert |
| `src/features/canvas/designStorage.ts`            | v2 parse/serialize/load/save and v1 migration                       |
| `src/features/canvas/DesignWorkspaceProvider.tsx` | Autosave, migration, create/select/delete/undo workspace state      |
| `src/features/canvas/designWorkspaceContext.ts`   | Workspace context type and hook                                     |
| `src/features/canvas/CanvasList.tsx`              | Explorer canvas list, new-canvas action, delete dialog              |
| `src/features/canvas/CanvasUndoToast.tsx`         | Delete notification with Undo and Dismiss                           |
| `src/app/DesignSurface.tsx`                       | Keyed canvas editor, root reporting, keyboard shortcuts             |
| `src/app/App.tsx`                                 | Per-project provider, explorer placement, toast                     |

Storage:

- One payload per project at `flutter-ui-studio:designs:v2:<encoded path>`.
- Payload: `{ version: 2, activeId, canvases: [{ id, name, root }] }`.
- 1–20 canvases, unique IDs, unique case-insensitive names, and an active ID that exists.
- Names are 1–60 characters, trimmed, and cannot be empty.
- Each canvas root is validated with the Phase 4 node rules (1,000 nodes, depth 50, known kinds,
  value ranges).
- `saveDesignSet` re-parses the serialized payload before writing, so an unrestorable set is never
  persisted.
- Phase 4 key `flutter-ui-studio:design:v1:<encoded path>` migrates into a canvas named **Main**.
- The legacy key is removed only after a successful v2 save. A v2 payload is always preferred; a
  corrupt v2 payload can still fall back to the legacy design.

Workspace:

- The provider saves the whole set 250 ms after the last change and flushes dirty state on unmount.
- It is keyed by `project.path` in `App.tsx`, so switching projects remounts the workspace.
- Create, select, delete, and undo-delete all mark the set dirty and autosave.
- Delete is refused for the last canvas and returns the removed canvas plus its index.
- Undo reinserts the canvas at its original index and makes it active.
- The toast auto-dismisses after 10 seconds.

Editing:

- `DesignSurface` renders `CanvasEditorSurface` with `key={activeCanvas.id}`. Switching canvases
  remounts the reducer, so history, selection, and the active tab reset per canvas.
- The editor reports root changes to the provider through `updateCanvasRoot`, which replaces only the
  active canvas.
- Shortcuts are ignored while focus is in an input, textarea, select, or contenteditable element.
- The canvas header shows the canvas name and reports `Saving…`, `Saved locally`, or `Save failed`.

Accessibility:

- Canvas rows are buttons with `aria-current` on the active canvas.
- Delete opens `role="dialog"` with `aria-modal`, a title/description, initial focus on **Cancel**, and
  Escape to close.
- The toast uses `role="status"` and `aria-live="polite"`.
- History buttons have explicit `aria-label` values.

## Verification

All commands were run from the repository root on Windows. `cargo` was added to the process `PATH`
with `$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"`.

| Command                                                                          | Result                                             |
| -------------------------------------------------------------------------------- | -------------------------------------------------- |
| `pnpm format:check`                                                              | Passed, all files formatted                        |
| `pnpm lint`                                                                      | Passed, no warnings or errors                      |
| `pnpm typecheck`                                                                 | Passed, no diagnostics                             |
| `pnpm test`                                                                      | 149 tests passed across 11 files                   |
| `pnpm build`                                                                     | Passed; 52 modules, CSS 26.59 kB, JS 270.17 kB     |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                         | Passed                                             |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Passed, no warnings                                |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | 16 tests passed                                    |
| `pnpm tauri build`                                                               | Passed; release compile 2m 25s, MSI and NSIS built |

Automated tests added or expanded in Phase 6:

History (7 tests in `model.test.ts`):

- Undo/redo of an added widget.
- Undo/redo of a deleted subtree, including selection.
- Coalescing consecutive edits to the same widget.
- Starting a new entry after the selection changes.
- Clearing redo history after a new edit.
- Ignoring undo/redo at the ends of the history.
- Capping history at 100 steps.

Canvas sets (11 tests in `designSet.test.ts`):

- Starter set shape and active canvas.
- Unique generated names and activation of new canvases.
- Gap filling, the 20-canvas cap, and selection rules.
- Removing a canvas, choosing a neighbour, and keeping the last canvas.
- Reinserting at the original index and rejecting duplicate/excess inserts.
- Root replacement, ID adoption, and ID/name validation.

Storage (17 tests in `designStorage.test.ts`):

- Round-trip, per-project keys, saved active canvas.
- Phase 4 migration into **Main**, legacy cleanup only after a saved v2 payload.
- v2 preference and legacy fallback.
- Rejection of malformed payloads, duplicate IDs/names, invalid roots, oversized values, deep
  nesting, and excess nodes.
- Refusing to save an unrestorable set.
- Storage read/write failures and legacy cleanup failures.

Canvas list (6 tests in `CanvasList.test.tsx`):

- Starter canvas plus creation and activation of a second canvas.
- Switching canvases.
- Delete confirmation and cancel.
- Delete plus notification undo, including the saved set.
- Dismissing the notification without restoring.
- Delete disabled for the last canvas.

Design surface (6 new tests, 26 total in `DesignSurface.test.tsx`):

- Header undo/redo buttons.
- Keyboard undo/redo, including `Ctrl+Shift+Z` and `Ctrl+Y`.
- Autosaving an undone edit.
- Separate designs per canvas and switching.
- Editing one canvas without changing the other.

The app shell test now asserts the Phase 6 badge.

## Build artifacts

```text
src-tauri/target/release/flutter-ui-studio.exe
src-tauri/target/release/bundle/msi/Flutter UI Studio_0.1.0_x64_en-US.msi          (2.95 MiB)
src-tauri/target/release/bundle/nsis/Flutter UI Studio_0.1.0_x64-setup.exe         (1.97 MiB)
```

## Launch smoke test

A clean temporary Flutter fixture was created at
`C:\Users\Akila\AppData\Local\Temp\opencode\flutter-ui-studio-phase6-fixture`. The release executable
was started with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9334` and driven over
the WebView2 DevTools protocol.

Procedure:

1. Seed the fixture as the remembered project, clear v1/v2 design keys, and reload.
2. Confirm one canvas (**Canvas 1**) is listed and active.
3. Create **Canvas 2**, edit its Text to `Second canvas`, and wait for `Saved locally`.
4. Switch to **Canvas 1**, edit its Text to `First canvas`, and confirm the other canvas is unchanged.
5. Undo and redo the text edit with the header buttons, verifying the autosaved result.
6. Delete the Text widget, then undo the deletion.
7. Switch to **Canvas 2**, delete it, inspect the notification, and choose **Undo**.
8. Restart the application and verify both canvases, the active canvas, and both widget trees.
9. Collect console errors.

Observed results:

- Canvas list showed `Canvas 1` and `Canvas 2`; active canvas switched correctly.
- Each canvas kept its own text (`First canvas` / `Second canvas`).
- Undo restored `Text "Hello, Flutter!"`; redo restored `Text "First canvas"`.
- Widget delete removed the text; undo restored it and the design autosaved.
- Delete notification read `“Canvas 2” deleted.`; **Undo** restored the canvas in the second position
  and made it active.
- After restart, both canvases were present with `Canvas 2` active; switching to **Canvas 1** showed
  `Text "First canvas"` and `Saved locally`.
- Zero console errors or uncaught exceptions were recorded.

Screenshots (not committed):

- `C:\Users\Akila\AppData\Local\Temp\opencode\phase-6-canvases.png`
- `C:\Users\Akila\AppData\Local\Temp\opencode\phase-6-delete-toast.png`
- `C:\Users\Akila\AppData\Local\Temp\opencode\phase-6-restored.png`

## Commits

| Commit    | Summary                                                                 |
| --------- | ----------------------------------------------------------------------- |
| `fe99051` | `docs(plan): add Phase 6 implementation plan`                           |
| `63605ba` | `feat(canvas): add undo and redo history to the canvas model`           |
| `965f722` | `feat(canvas): persist multiple canvases per project`                   |
| `dba5155` | `feat(canvas): add canvas create, switch, and delete to the explorer`   |
| `9014687` | `test(canvas): cover undo, multi-canvas storage, and canvas management` |
| `adff255` | `chore(ui): update shell copy for Phase 6`                              |

The README and this report are committed separately as Phase 6 documentation.

## Limitations and follow-ups

- Designs remain in localStorage: they are not portable, not shared between machines, and are lost
  when the WebView2 profile is cleared or the project path changes.
- The whole canvas set is validated and rewritten on every save; there is no per-canvas delta.
- Undo/redo history is in memory only. Switching canvases or restarting resets it.
- A deleted canvas can only be recovered during the 10-second notification. After it is dismissed or
  times out, the deletion is final.
- Canvas names are generated and cannot be renamed; deletion does not renumber existing canvases.
- The 20-canvas cap is a fixed limit with no project-level configuration.
- Undo/redo covers canvas edits only, not file writes, canvas creation/deletion, or switching.
- Shortcuts are global while a project is open; they are ignored only inside form fields.
- The toast is not a full undo stack; multiple quick deletes replace the previous notification and the
  earlier canvas is no longer recoverable.
- The bundle identifier `com.flutteruistudio.app` still ends in `.app`, which triggers a non-blocking
  Tauri warning and should be renamed before shipping macOS bundles.
- Installers are unsigned, so Windows SmartScreen may warn on other machines.
- Release artifacts are not committed to git; rebuild with `pnpm tauri build`.
