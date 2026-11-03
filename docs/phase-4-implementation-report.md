# Phase 4 — Implementation Report

Status: **complete**

Phase 4 makes the visual canvas durable. Each project's widget tree is saved to local application
storage after edits and restored when that project opens again. Generated Dart and the Flutter
project on disk remain untouched.

The repository has no `AGENTS.md` or product roadmap, so the scope was selected explicitly by the
user and captured in `docs/phase-4-plan.md`:

> Save/load canvas design. Save the design JSON for a project and restore it when the project is
> opened again. Dart file writing is still out of scope.

## Scope delivered

- Per-project design storage in `window.localStorage`.
- Storage key `flutter-ui-studio:design:v1:` plus `encodeURIComponent(projectPath)`.
- Payload `{ version: 1, root: CanvasNode }` containing only the widget tree.
- Automatic restore during `DesignSurface` reducer initialisation.
- Automatic 250 ms debounced save after each canvas change.
- Canvas header status pill: `Saving…`, `Saved locally`, or `Save failed`.
- Strict validation before saving and before restoring.
- Widget ID adoption so new widgets cannot collide with restored IDs.
- Graceful fallback to the starter document for missing, invalid, or unreadable storage.
- Storage unit tests and UI tests for restore, autosave, fallback, and failure.
- Phase 4 header badge, welcome capabilities, and welcome note.
- No Rust, Tauri capability, or Flutter project changes were required.

## Non-goals

- Writing design or Dart files into the Flutter project.
- Cloud sync, export/import, named slots, manual save dialogs, or version history.
- Schema migration from future payload versions.
- Persisting selection, active tab, panel visibility, or undo/redo history.
- Encrypting local storage contents or protecting them from the local user.
- Preserving designs after the project path changes or the WebView2 profile is cleared.
- Changing Phase 3 canvas, inspector, Dart preview, or clipboard behaviour.

## Environment

No toolchain changes were required in Phase 4.

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

### Storage module

`src/features/canvas/designStorage.ts` is a framework-free module over the canvas model:

```ts
type DesignSaveStatus = "saving" | "saved" | "error";
type DesignLoadStatus = "restored" | "missing" | "invalid" | "unavailable";

export function designStorageKey(projectPath: string): string;
export function serializeDesign(root: CanvasNode): string;
export function parseDesign(raw: string): CanvasNode | null;
export function loadDesign(projectPath: string): {
  status: DesignLoadStatus;
  root: CanvasNode | null;
};
export function saveDesign(projectPath: string, root: CanvasNode): boolean;
```

Rules:

- `serializeDesign` writes `{ version: 1, root }`.
- `parseDesign` reads untrusted JSON into a fresh normalised tree; unknown properties are discarded.
- `loadDesign` distinguishes a missing key from invalid JSON and from unavailable storage.
- `loadDesign` calls `adoptWidgetIds(root)` only after validation succeeds.
- `saveDesign` serialises, validates the serialised payload with `parseDesign`, and only then writes.
  A design that cannot round-trip returns `false` instead of storing an unrestorable payload.
- Reads and writes are wrapped so disabled or full storage never throws into React.

### Validation limits

| Rule              | Limit                                   |
| ----------------- | --------------------------------------- |
| Payload version   | `1` only                                |
| Root              | Must be a Screen                        |
| Nested Screen     | Rejected                                |
| Widget kind       | One of the six known kinds              |
| Widget IDs        | Non-empty, ≤ 120 characters, unique     |
| Props             | All five fields with the expected types |
| Text/label length | ≤ 10,000 characters                     |
| Colour length     | ≤ 64 characters                         |
| Padding           | Integer 0–96                            |
| Gap               | Integer 0–64                            |
| Nodes             | ≤ 1,000                                 |
| Depth             | ≤ 50                                    |
| Leaf children     | Text and Button must have no children   |
| Extra fields      | Ignored; only known fields are copied   |

### Widget ID continuity

`createWidget` uses a module-level sequence such as `text-1`. A restarted webview starts that
sequence again, which could collide with restored IDs. `model.ts` now exports:

```ts
export function adoptWidgetIds(root: CanvasNode): void;
```

It walks the restored tree and raises the sequence to the highest numeric suffix it finds.

### UI behaviour

| File                                      | Responsibility                                      |
| ----------------------------------------- | --------------------------------------------------- |
| `src/app/DesignSurface.tsx`               | Initial restore, debounced autosave, save status    |
| `src/features/canvas/CanvasWorkspace.tsx` | Save-status pill with `role="status"`               |
| `src/features/canvas/designStorage.ts`    | Keying, validation, serialisation, load/save        |
| `src/features/canvas/model.ts`            | `adoptWidgetIds` for ID continuity                  |
| `src/shared/styles/global.css`            | Save-status and header meta styles                  |
| `src/features/editor/WorkbenchHeader.tsx` | Phase 4 badge                                       |
| `src/features/editor/EditorWelcome.tsx`   | "Saved designs" capability and Phase 4 welcome note |

- `DesignSurface` loads the design synchronously in a lazy `useState` initialiser, then feeds the
  restored root to the reducer initialiser. The first paint already uses the saved design.
- The autosave effect debounces with a 250 ms timer and is cleaned up on every change or unmount.
- Save status is derived from the saved and failed root references rather than set synchronously in
  the effect, avoiding cascading renders and satisfying `react-hooks/set-state-in-effect`.
- The status pill is `role="status"` with `aria-live="polite"` and a local-storage tooltip.
- `DesignSurface` is keyed by `project.path` in `App.tsx`, so opening another project mounts an
  independent surface and loads that project's design.
- The inspector remains canvas properties only. The Dart tab continues to regenerate from the live
  tree.

## Verification

All commands were run from the repository root on Windows. `cargo` was added to the process `PATH`
with `$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"`.

| Command                                                                          | Result                                             |
| -------------------------------------------------------------------------------- | -------------------------------------------------- |
| `pnpm format:check`                                                              | Passed, all files formatted                        |
| `pnpm lint`                                                                      | Passed, no warnings or errors                      |
| `pnpm typecheck`                                                                 | Passed, no diagnostics                             |
| `pnpm test`                                                                      | 84 tests passed across 6 files                     |
| `pnpm build`                                                                     | Passed; 45 modules, CSS 21.77 kB, JS 254.04 kB     |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                         | Passed                                             |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Passed, no warnings                                |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | 9 tests passed                                     |
| `pnpm tauri build`                                                               | Passed; release compile 2m 04s, MSI and NSIS built |

Automated tests cover:

Storage (`src/features/canvas/designStorage.test.ts`, 18 tests):

- Serialisation round-trip and exact restore.
- Missing key, distinct per-project keys, and no design leaking between projects.
- Unknown payload fields discarded.
- Malformed JSON, future version, non-Screen root, unknown kind, nested Screen, duplicate IDs,
  negative gap, over-limit padding, leaf children, node cap, and depth cap.
- Invalid JSON from storage reported without throwing.
- Restored IDs advance the widget sequence.
- Unrestorable designs are refused instead of written.
- Storage write and read failures reported without throwing.

UI (`src/app/DesignSurface.test.tsx`, 4 new tests, 20 total):

- A saved design is restored on mount and reports `Saved locally`.
- Invalid storage falls back to the starter design.
- Editing the canvas autosaves the new value and reports `Saved locally`.
- A rejected storage write reports `Save failed`.

All Phase 0–3 tests continue to pass. The app shell test now asserts the Phase 4 badge.

## Build artifacts

```text
src-tauri/target/release/flutter-ui-studio.exe
src-tauri/target/release/bundle/msi/Flutter UI Studio_0.1.0_x64_en-US.msi          (2.93 MiB)
src-tauri/target/release/bundle/nsis/Flutter UI Studio_0.1.0_x64-setup.exe         (1.96 MiB)
```

## Launch smoke test

The release executable was started with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` and driven over the WebView2
DevTools protocol against a temporary Flutter fixture project.

Procedure:

1. Seed the fixture as the remembered project and reload the webview.
2. Select the starter Text widget and change its content.
3. Wait for `Saved locally` and inspect the persisted payload.
4. Close the application gracefully so WebView2 flushes storage.
5. Start the application again and confirm the edited design is restored.
6. Check for console errors and capture a screenshot.

Observed results:

- The first session cleared any previous design, selected the starter Text widget, and changed its
  content to `Persisted by Phase 4`.
- The canvas reported `Saved locally` and the payload was written as version `1` under a single
  key: `flutter-ui-studio:design:v1:C%3A%5CUsers%5CAkila%5CAppData%5CLocal%5CTemp%5Copencode%5Cflutter-ui-studio-phase4-fixture`.
- The application was closed with `WM_CLOSE` so WebView2 could flush storage.
- After a fresh launch the edited Text was restored as `Text "Persisted by Phase 4"`, the starter
  `Hello, Flutter!` widget was absent, and the header reported `Saved locally`.
- Zero console errors or uncaught exceptions were recorded.

Screenshot: `C:\Users\Akila\AppData\Local\Temp\opencode\phase-4-restored-design.png` (69,149 bytes,
not committed).

## Commits

| Commit    | Summary                                        |
| --------- | ---------------------------------------------- |
| `7b47637` | `docs(plan): add Phase 4 implementation plan`  |
| `f948635` | `feat(canvas): persist canvas designs locally` |
| `4fb81a4` | `feat(canvas): autosave and restore designs`   |
| `028375c` | `test(canvas): cover design persistence`       |
| `e4427b3` | `chore(ui): update shell copy for Phase 4`     |

The README and this report are committed separately as Phase 4 documentation.

## Limitations and follow-ups

- Designs are stored in the application's WebView2 profile, not in the project folder. They are not
  portable, shareable, or visible in version control.
- Clearing the profile, uninstalling the application, or changing the project path loses or orphans
  a design. Windows path case changes can also create a separate entry.
- Browser storage quotas are finite. Very large text content can cause a save failure, which is
  surfaced as `Save failed`.
- Saved designs are unencrypted on the local machine.
- Only the widget tree is persisted; selection, active tab, and panel visibility reset on restore.
- There is no schema migration. A payload with a version other than `1` is treated as invalid and
  replaced by the starter design on the next save.
- There is no manual save button, named slot, export, import, or version history.
- The application still does not write Dart or design files into the Flutter project.
- The bundle identifier `com.flutteruistudio.app` still ends in `.app`, which triggers a non-blocking
  Tauri warning and should be renamed before shipping macOS bundles.
- Installers are unsigned, so Windows SmartScreen may warn on other machines.
- Release artifacts are not committed to git; rebuild with `pnpm tauri build`.
