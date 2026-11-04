# Flutter UI Studio — Remaining Roadmap (Phases 8–11)

Status: **approved direction**

Phases 0–7 delivered the desktop shell, project workspace, visual canvas, inspector, local design
persistence, Dart preview, safe Dart apply, multi-canvas workspace, undo/redo, and the Phase 7
hardening pass.

This roadmap closes the remaining gaps between the current studio and a complete visual Flutter
workflow. Each phase stays reviewable on its own: implementation, automated tests, a runtime smoke
test, documentation, and a separate commit list.

| Phase | Theme                       | Outcome                                                                   |
| ----- | --------------------------- | ------------------------------------------------------------------------- |
| 8     | Project explorer completion | Open, edit, save, refresh, and safely reload real project files           |
| 9     | Canvas editing depth        | Reorder, duplicate, copy/paste, multi-select, full keyboard tree, history |
| 10    | Design portability          | Export/import designs, snapshots, restore, and storage recovery           |
| 11    | Flutter toolchain           | Run `pub get` / `analyze` / `format` and report results inside the app    |

## Phase 8 — Project Explorer Completion

The explorer currently lists files but cannot open them. Phase 8 turns it into a small, safe file
workspace:

- Open any UTF-8 text file under the project in a tab, alongside **Canvas** and **Dart**.
- Edit with a plain monospace editor, line numbers, dirty state, and explicit save.
- Save with a sibling backup, conflict detection, and reload/overwrite choices.
- Refresh the tree manually and after saves; detect external changes when the window regains focus.
- Show file details in the inspector and block accidental loss with a discard confirmation.

Deliberately excluded: syntax highlighting, file creation/deletion/rename, binary or asset editing,
and file watching.

## Phase 9 — Canvas Editing Depth

The canvas is usable but still click-only. Phase 9 completes the editing model:

- Drag and drop to reorder widgets and move them between containers.
- Duplicate a widget or subtree, copy/paste within and across canvases, and delete selections.
- Multi-select with Shift/Ctrl, group delete, and multi-item property edits where meaningful.
- Full ARIA tree keyboard model: arrows, Home/End, expand/collapse, and roving tabindex.
- Persist undo/redo history per canvas across canvas switches and application restarts.
- Per-canvas duplicate and drag reorder in the explorer.

Deliberately excluded: arbitrary layout constraints, responsive breakpoints, and free-form canvas
positioning.

## Phase 10 — Design Portability

Designs currently live only in WebView2 local storage. Phase 10 makes them portable and recoverable:

- Export one canvas or the whole project to a versioned JSON file.
- Import and validate a design file with a preview before replacing anything.
- Automatic rotating snapshots in local storage with a restore browser.
- Optional project-folder design file with explicit write/read and an ignore-safe location.
- Clear storage management: sizes, per-canvas deletion, and a "reset project design" action.

Deliberately excluded: cloud sync, accounts, and multi-user collaboration.

## Phase 11 — Flutter Toolchain Round-Trip

Generated code can be written but not checked. Phase 11 closes the loop:

- Detect the Flutter SDK and report its version.
- Run `flutter pub get`, `dart format`, and `flutter analyze` with streamed output.
- Show diagnostics with file/line references and jump to the matching project file tab.
- Re-run after edits and cache the last result per project.
- Optional `flutter run` / hot reload only after the analysis loop is stable.

Deliberately excluded: bundling the Flutter SDK, installing dependencies, device management, and CI.

## Cross-phase rules

- No phase overwrites an earlier phase's behaviour.
- No new dependency without an explicit decision in that phase's plan.
- Every write outside local storage is explicit, bounded, backed up, and validated again in Rust.
- Every phase ends with formatting, lint, type-check, the full frontend suite, Rust checks, a Tauri
  build, a runtime smoke test on the release executable, and a report in `docs/`.
