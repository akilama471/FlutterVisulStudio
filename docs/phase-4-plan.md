# Phase 4 — Design Persistence: Implementation Plan

Project: **Flutter UI Studio**
Status: Approved scope; implementation plan for Phase 4
Prerequisite: Phase 3 complete at `fef3fab`

## 1. Context

Phase 3 closed the loop from the visual canvas to readable Dart in a read-only preview. The design is
still an in-memory scratchpad: switching projects, reloading the webview, or restarting the
application discards all edits and returns to the starter document.

The repository has no `AGENTS.md` or product roadmap, so the Phase 4 scope was selected explicitly by
the user:

> Save/load canvas design. Save the design JSON for a project and restore it when the project is
> opened again. Dart file writing is still out of scope.

Phase 4 makes the canvas durable without touching the Flutter project on disk.

## 2. Goals

- Persist the canvas widget tree per project.
- Restore the saved design automatically when its project opens.
- Save automatically after edits, without a manual save button.
- Validate loaded data defensively before it reaches the reducer.
- Keep unique widget IDs after restoring a saved tree.
- Show a visible save state: saving, saved, or failed.
- Keep the Phase 3 canvas, inspector, Dart preview, and clipboard behaviour unchanged.
- Keep persistence frontend-only; no Rust or project-file changes.

## 3. Non-goals

- Writing design or Dart files into the Flutter project.
- Cloud sync, export/import, or sharing designs between machines.
- Manual save/load dialogs, named design slots, or version history.
- Persisting selection, active tab, panel visibility, or undo/redo history.
- Schema migration from future versions.
- Encrypting or otherwise protecting local storage contents.
- Persisting a design after the project folder is moved or renamed.

## 4. Storage contract

New module: `src/features/canvas/designStorage.ts`.

```ts
type DesignLoadStatus = "restored" | "missing" | "invalid" | "unavailable";

type DesignLoadResult = {
  status: DesignLoadStatus;
  root: CanvasNode | null;
};

export function designStorageKey(projectPath: string): string;
export function serializeDesign(root: CanvasNode): string;
export function parseDesign(raw: string): CanvasNode | null;
export function loadDesign(projectPath: string): DesignLoadResult;
export function saveDesign(projectPath: string, root: CanvasNode): boolean;
```

Key:

- Prefix: `flutter-ui-studio:design:v1:`
- Suffix: `encodeURIComponent(projectPath)`
- Storage: `window.localStorage`
- Payload: `{ "version": 1, "root": CanvasNode }`
- Only the widget tree is stored. Selection is session state and is not persisted.

Auto-save runs 250 ms after the last canvas change. The initial restore is saved back immediately,
which also confirms that storage is writable. Storage reads and writes are wrapped so disabled or
full storage never crashes the editor.

## 5. Validation rules

`parseDesign` reads untrusted JSON and returns a normalised tree or `null`. It rejects:

- Malformed JSON, non-object payloads, or a version other than `1`.
- A root that is not a Screen.
- Unknown widget kinds or nested Screen nodes.
- Missing, empty, overlong, or duplicate widget IDs.
- Missing props or props with the wrong types.
- Negative or non-finite padding/gap values, or values above the inspector limits.
- Children on Text or Button widgets.
- More than 1,000 nodes or a depth greater than 50.

Only known fields are copied into the normalised tree, so unknown payload properties are discarded.
The parser never mutates the parsed JSON directly.

## 6. Widget ID continuity

`createWidget` uses a module-level sequence such as `text-1`. After a restart the sequence starts
again, so a restored `text-1` could collide with a newly added widget.

`model.ts` gains `adoptWidgetIds(root)`, which raises the sequence to the highest numeric suffix found
in the restored tree. `loadDesign` calls it only after validation succeeds.

## 7. UI behaviour

`DesignSurface` loads the saved tree in its reducer initialiser and auto-saves changes with a
debounced effect.

`CanvasWorkspace` gains a `saveStatus` prop and shows a small status pill in the canvas header:

| Status | Label           | Meaning                                             |
| ------ | --------------- | --------------------------------------------------- |
| saving | `Saving…`       | A debounced write is pending                        |
| saved  | `Saved locally` | The design is stored in this app's local storage    |
| error  | `Save failed`   | Storage is unavailable, full, or rejected the write |

The status is exposed with `role="status"` and `aria-live="polite"`. The inspector remains canvas
properties only. The Dart tab continues to regenerate from the live tree.

If the saved payload is missing, the starter design loads. If it is invalid or storage is
unavailable, the starter design loads and the next auto-save replaces the unusable payload.

## 8. Automated tests

Storage (`vitest`, no React):

- Round-trip serialisation and restore of the starter document.
- Missing key returns `missing`.
- Invalid JSON, wrong version, non-Screen root, unknown kind, nested Screen, duplicate IDs, bad
  props, leaf children, and excessive depth/size return `invalid`.
- Project paths map to distinct keys and do not leak designs between projects.
- Unique numeric IDs are preserved across serialisation.
- Restored IDs advance the widget sequence so the next added widget cannot collide.
- A rejected or unavailable `localStorage` write/read is reported without throwing.

UI (`vitest` + Testing Library):

- A saved design is restored when the surface mounts.
- Missing storage still shows the starter design.
- Invalid storage falls back to the starter design.
- Editing the canvas auto-saves the new value and shows `Saved locally`.
- A storage write failure shows `Save failed`.
- Existing Canvas/Dart tests continue to pass with storage cleared between tests.

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
2. Restore a fixture project and edit a canvas value.
3. Wait for `Saved locally` and inspect the persisted payload.
4. Close the application and start it again.
5. Confirm the edited value is restored instead of the starter document.
6. Confirm zero console errors and capture a screenshot.

## 10. Commit sequence

1. `docs(plan): add Phase 4 implementation plan`
2. `feat(canvas): persist canvas designs locally`
3. `feat(canvas): autosave and restore designs`
4. `test(canvas): cover design persistence`
5. `chore(ui): update shell copy for Phase 4`
6. `docs: update Phase 4 README and implementation report`

## 11. Risks and limitations

- Local storage is app-local, not portable with the project and not visible in the repository.
- Clearing the WebView2 profile, reinstalling, or moving the project path loses or orphans designs.
- The project path is used as part of the key; Windows path case changes can create a separate entry.
- Browser storage quotas are finite. Large text content is rejected by the loader and can fail saves.
- Designs are stored unencrypted on the local machine.
- Only the widget tree is saved; selection, tabs, and panel state reset on restore.
- This phase deliberately does not write design files into the Flutter project.
