# Phase 5 — Safe Dart Apply: Implementation Plan

Project: **Flutter UI Studio**
Status: Approved scope; implementation plan for Phase 5
Prerequisite: Phase 4 complete at `269a791`

## 1. Context

Phase 3 generated readable Dart in a read-only preview. Phase 4 made the canvas durable, but the
generated code still never reaches the Flutter project. The studio can design an interface, yet the
user must copy the code out by hand.

The repository has no `AGENTS.md` or product roadmap, so the Phase 5 scope was selected explicitly by
the user:

> Apply generated Dart to the project safely. Write to the project entry point with a diff preview,
> explicit confirmation, and a backup of the existing file.

Phase 5 closes the loop from canvas to a real project file while keeping the user in control.

## 2. Goals

- Add an explicit **Apply to project** action to the Dart preview.
- Read the current entry point and show a unified diff before writing.
- Require an explicit confirmation; never write silently.
- Back up an existing entry point before overwriting it.
- Create `lib/main.dart` when the project has no entry point yet.
- Validate the target on the Rust side: inside the active project, under `lib/`, `.dart`, size-capped.
- Report the write result, including the backup path.
- Keep the canvas, inspector, persistence, and clipboard behaviour unchanged.
- Keep the design tree untouched; only the generated file is written.

## 3. Non-goals

- Writing design JSON or any file other than the selected Dart entry point.
- Editing generated code in the application before writing.
- Running `flutter analyze`, `flutter pub get`, `flutter run`, or hot reload after writing.
- Watching the project for external changes, or reloading the preview from disk.
- Writable project-file tabs, multi-file generation, or a general file editor.
- Undoing a write from inside the application beyond restoring the backup manually.
- Cloud sync, export/import, or sharing designs/files.
- Overwriting random project files: this phase targets the entry point only.

## 4. Target and backup policy

- Target: `project.entryPoint` when present, otherwise `lib/main.dart`.
- The UI displays the exact relative target before writing.
- If the file already exists, it is copied to the next free sibling backup name:
  `lib/main.dart.bak`, then `lib/main.dart.bak.1`, `lib/main.dart.bak.2`, and so on.
- The backup is created before the write and its relative path is returned to the UI.
- A failed backup aborts the write. A failed write leaves the backup in place and reports the error.
- There is no option to skip the backup.
- New files are created without a backup.

## 5. Rust command contract

Both commands use the active project root stored in `ProjectState`; the frontend cannot pass an
arbitrary root.

```rust
#[tauri::command]
pub fn read_project_file(
    state: State<'_, ProjectState>,
    relative_path: String,
) -> Result<Option<String>, String>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWriteResult {
    pub relative_path: String,
    pub backup_path: Option<String>,
    pub bytes: usize,
}

#[tauri::command]
pub fn write_project_file(
    state: State<'_, ProjectState>,
    relative_path: String,
    contents: String,
) -> Result<ProjectWriteResult, String>;
```

Validation shared by both commands:

- Reject an empty path, absolute paths, parent/root/prefix components, and backslash traversal.
- Normalise to `/`-separated components and require the path to start with `lib/`.
- Require a `.dart` extension.
- Canonicalise the parent directory and require it to be inside the canonical project root.
- Reject a target that is a directory; reject an existing symlink that escapes the root.
- Cap file contents at 1 MiB on read and write.
- Return friendly errors for no project, missing file, unavailable folder, and outside-root paths.

## 6. Frontend diff and review dialog

New modules:

- `src/features/dart/diff.ts` — pure line diff used by the dialog and unit tests.
- `src/features/dart/ApplyDartDialog.tsx` — review, confirm, and error UI.

Diff behaviour:

- Split on `\n`, compare line by line with a bounded LCS.
- Emit `same`, `added`, and `removed` rows with line numbers.
- Cap inputs (2,000 lines each). Larger inputs fall back to a coarse removed-then-added view.
- The dialog summarises existing versus generated line counts and added/removed counts.

Dialog behaviour:

- Opened from **Apply to project** in the Dart preview.
- Shows the relative target path, whether it is new or overwritten, the backup naming rule, and the
  scrollable diff.
- **Cancel** closes without writing. **Write to project** performs the write.
- While opening, show `Reading lib/main.dart…`; while writing, disable both actions and show
  `Writing…`.
- On success, close the dialog and show `Written to lib/main.dart` with the backup path when one was
  created.
- On failure, keep the dialog open and show the returned error.
- Uses `role="dialog"`, `aria-modal="true"`, a labelled title, Escape to cancel, and initial focus on
  the cancel action.

## 7. UI changes

| File                                      | Change                                                     |
| ----------------------------------------- | ---------------------------------------------------------- |
| `src/features/dart/DartPreview.tsx`       | Apply action, review state, write result feedback          |
| `src/features/dart/ApplyDartDialog.tsx`   | New confirmation and diff dialog                           |
| `src/features/dart/diff.ts`               | New pure diff helper                                       |
| `src/app/DesignSurface.tsx`               | Pass `project` to `DartPreview`                            |
| `src/shared/lib/project.ts`               | `readProjectFile`, `writeProjectFile`, response validation |
| `src/shared/styles/global.css`            | Dialog, diff, and action styles                            |
| `src/features/editor/WorkbenchHeader.tsx` | Phase 5 badge                                              |
| `src/features/editor/EditorWelcome.tsx`   | Phase 5 capability and note                                |

Dart preview copy changes from "Nothing is written to the project" to a clear review-before-write
message. The existing **Copy code** action remains.

## 8. Automated tests

Rust (`cargo test`):

- Reads a file under `lib/`.
- Returns `None` for a missing file.
- Writes a new file and reports bytes.
- Backs up an existing file and preserves its contents.
- Uses numbered backups when `.bak` already exists.
- Rejects absolute paths, traversal, non-`lib` paths, non-`.dart` paths, and directories.
- Rejects oversized contents.
- Rejects operations when no project is open.

Frontend (`vitest`):

- Diff marks identical, added, removed, and changed lines with line numbers.
- Diff falls back safely for oversized input.
- Dialog shows the target, new/existing state, backup rule, and diff.
- Cancel writes nothing; confirm calls the write command.
- A write failure keeps the dialog open and shows the error.
- Dart preview opens the dialog, reads the existing file, and reports success with the backup path.
- Missing entry point is reported as a new file.
- Existing Phase 3–4 tests continue to pass.

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

1. Use a temporary Flutter fixture with a known `lib/main.dart`.
2. Launch the release executable and open the fixture.
3. Edit the canvas, switch to Dart, and review the diff.
4. Confirm the write and verify `lib/main.dart` contains the generated code.
5. Verify `lib/main.dart.bak` still contains the original fixture source.
6. Confirm zero console errors and capture the review dialog or result screenshot.
7. Relaunch and confirm the Phase 4 design still restores.

## 10. Commit sequence

1. `docs(plan): add Phase 5 implementation plan`
2. `feat(tauri): add safe project file read and write commands`
3. `feat(dart): add diff preview and apply dialog`
4. `feat(dart): apply generated Dart to the project entry point`
5. `test: cover project writes and Dart apply flow`
6. `chore(ui): update shell copy for Phase 5`
7. `docs: update Phase 5 README and implementation report`

## 11. Risks and limitations

- Writing to `lib/main.dart` replaces the user's application source; the backup is the only in-app
  recovery path.
- Generated code is a fixed standalone Material app, not an edit of the user's existing app.
- A write races with external edits made between the read/diff and the write; the backup captures
  the state at write time.
- Backups accumulate beside the file and are visible to the project's tooling and version control.
- The project must be writable on disk; read-only folders report `Write failed`.
- Paths are validated against the active project root, but no virus scanning, encoding detection, or
  line-ending preservation is performed.
- The studio still does not run or analyse the project after writing.
