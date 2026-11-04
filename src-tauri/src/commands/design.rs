use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::State;

use super::project::ProjectState;

const MAX_DESIGN_FILE_BYTES: usize = 2 * 1024 * 1024;
const DESIGN_DIRECTORY: &str = ".flutter-ui-studio";
const DESIGN_FILE_NAME: &str = "design.json";
const GITIGNORE_NAME: &str = ".gitignore";
const GITIGNORE_CONTENTS: &str = "*\n!.gitignore\n";
const PROJECT_DESIGN_RELATIVE_PATH: &str = ".flutter-ui-studio/design.json";

const INVALID_EXPORT_PATH: &str = "Only absolute .json design files can be used.";
const INVALID_PROJECT_PATH: &str = "The project design folder is not available.";
const NOT_TEXT_FILE: &str = "Only UTF-8 text design files can be used.";
const EMPTY_FILE: &str = "The design file is empty.";
const FILE_TOO_LARGE: &str = "The design file is larger than the 2 MB limit.";
const READ_ERROR: &str = "The design file could not be read.";
const WRITE_ERROR: &str = "The design file could not be written.";
const FILE_CHANGED: &str = "The design file changed on disk. Choose the file again before saving.";
const FILE_MISSING: &str = "The design file no longer exists.";
const PROJECT_DESIGN_MISSING: &str =
    "The project design file has not been written yet. Use \"Write to project\" first.";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignFileReadResult {
    pub path: String,
    pub contents: String,
    pub bytes: usize,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignFileWriteResult {
    pub path: String,
    pub backup_path: Option<String>,
    pub bytes: usize,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDesignReadResult {
    pub relative_path: String,
    pub contents: String,
    pub bytes: usize,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDesignWriteResult {
    pub relative_path: String,
    pub backup_path: Option<String>,
    pub bytes: usize,
    pub modified_ms: u64,
}

#[tauri::command]
pub fn write_design_export_file(
    path: String,
    contents: String,
    expected_modified_ms: Option<u64>,
) -> Result<DesignFileWriteResult, String> {
    write_export_file_to(&path, &contents, expected_modified_ms)
}

#[tauri::command]
pub fn read_design_import_file(path: String) -> Result<DesignFileReadResult, String> {
    read_export_file_from(&path)
}

#[tauri::command]
pub fn write_project_design_file(
    state: State<'_, ProjectState>,
    contents: String,
) -> Result<ProjectDesignWriteResult, String> {
    let root = state.active_root()?;

    write_project_design_to(&root, &contents)
}

#[tauri::command]
pub fn read_project_design_file(
    state: State<'_, ProjectState>,
) -> Result<ProjectDesignReadResult, String> {
    let root = state.active_root()?;

    read_project_design_from(&root)
}

fn write_export_file_to(
    path: &str,
    contents: &str,
    expected_modified_ms: Option<u64>,
) -> Result<DesignFileWriteResult, String> {
    validate_contents(contents)?;
    let (target, exists) = resolve_export_target(path)?;
    let (backup, modified_ms) = write_with_backup(&target, exists, contents, expected_modified_ms)?;

    Ok(DesignFileWriteResult {
        path: display_path(&target),
        backup_path: backup.as_deref().map(display_path),
        bytes: contents.len(),
        modified_ms,
    })
}

fn read_export_file_from(path: &str) -> Result<DesignFileReadResult, String> {
    let target = resolve_existing_json_file(path)?;
    let (contents, bytes, modified_ms) = read_bounded_file(&target)?;

    Ok(DesignFileReadResult {
        path: display_path(&target),
        contents,
        bytes,
        modified_ms,
    })
}

fn write_project_design_to(
    root: &Path,
    contents: &str,
) -> Result<ProjectDesignWriteResult, String> {
    validate_contents(contents)?;

    let directory = root.join(DESIGN_DIRECTORY);
    fs::create_dir_all(&directory).map_err(|error| {
        eprintln!("failed to create the project design directory: {error}");
        INVALID_PROJECT_PATH.to_owned()
    })?;

    let directory = directory.canonicalize().map_err(|error| {
        eprintln!("failed to inspect the project design directory: {error}");
        INVALID_PROJECT_PATH.to_owned()
    })?;

    if !directory.starts_with(root) || !directory.is_dir() {
        return Err(INVALID_PROJECT_PATH.to_owned());
    }

    let gitignore = directory.join(GITIGNORE_NAME);
    if !gitignore.exists() {
        fs::write(&gitignore, GITIGNORE_CONTENTS).map_err(|error| {
            eprintln!("failed to write the project design ignore file: {error}");
            WRITE_ERROR.to_owned()
        })?;
    }

    let target = directory.join(DESIGN_FILE_NAME);
    let exists = target.is_file();

    if target.exists() && !exists {
        return Err(INVALID_PROJECT_PATH.to_owned());
    }

    let (backup, modified_ms) = write_with_backup(&target, exists, contents, None)?;

    Ok(ProjectDesignWriteResult {
        relative_path: PROJECT_DESIGN_RELATIVE_PATH.to_owned(),
        backup_path: backup
            .as_deref()
            .and_then(|path| path.file_name())
            .and_then(|name| name.to_str())
            .map(|name| format!("{DESIGN_DIRECTORY}/{name}")),
        bytes: contents.len(),
        modified_ms,
    })
}

fn read_project_design_from(root: &Path) -> Result<ProjectDesignReadResult, String> {
    let directory = root.join(DESIGN_DIRECTORY);
    let target = directory.join(DESIGN_FILE_NAME);

    if !target.is_file() {
        return Err(PROJECT_DESIGN_MISSING.to_owned());
    }

    let target = target.canonicalize().map_err(|error| {
        eprintln!("failed to inspect the project design file: {error}");
        INVALID_PROJECT_PATH.to_owned()
    })?;

    if !target.starts_with(root) {
        return Err(INVALID_PROJECT_PATH.to_owned());
    }

    let (contents, bytes, modified_ms) = read_bounded_file(&target)?;

    Ok(ProjectDesignReadResult {
        relative_path: PROJECT_DESIGN_RELATIVE_PATH.to_owned(),
        contents,
        bytes,
        modified_ms,
    })
}

fn validate_contents(contents: &str) -> Result<(), String> {
    if contents.is_empty() {
        return Err(EMPTY_FILE.to_owned());
    }
    if contents.len() > MAX_DESIGN_FILE_BYTES {
        return Err(FILE_TOO_LARGE.to_owned());
    }
    if contents.contains('\0') {
        return Err(NOT_TEXT_FILE.to_owned());
    }

    Ok(())
}

fn resolve_export_target(path: &str) -> Result<(PathBuf, bool), String> {
    let raw = Path::new(path);

    if !raw.is_absolute() || !has_json_extension(raw) {
        return Err(INVALID_EXPORT_PATH.to_owned());
    }

    let file_name = raw
        .file_name()
        .ok_or_else(|| INVALID_EXPORT_PATH.to_owned())?;
    let parent = raw
        .parent()
        .ok_or_else(|| INVALID_EXPORT_PATH.to_owned())?
        .canonicalize()
        .map_err(|_| INVALID_EXPORT_PATH.to_owned())?;

    if !parent.is_dir() {
        return Err(INVALID_EXPORT_PATH.to_owned());
    }

    let target = parent.join(file_name);

    if !target.exists() {
        return Ok((target, false));
    }

    let canonical = target
        .canonicalize()
        .map_err(|_| INVALID_EXPORT_PATH.to_owned())?;

    if !canonical.starts_with(&parent) || !canonical.is_file() {
        return Err(INVALID_EXPORT_PATH.to_owned());
    }

    Ok((canonical, true))
}

fn resolve_existing_json_file(path: &str) -> Result<PathBuf, String> {
    let raw = Path::new(path);

    if !raw.is_absolute() || !has_json_extension(raw) {
        return Err(INVALID_EXPORT_PATH.to_owned());
    }

    let target = raw.canonicalize().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            FILE_MISSING.to_owned()
        } else {
            READ_ERROR.to_owned()
        }
    })?;

    if !target.is_file() {
        return Err(INVALID_EXPORT_PATH.to_owned());
    }

    Ok(target)
}

fn has_json_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("json"))
        .unwrap_or(false)
}

fn read_bounded_file(path: &Path) -> Result<(String, usize, u64), String> {
    let metadata = fs::metadata(path).map_err(|error| {
        eprintln!("failed to inspect the design file: {error}");
        READ_ERROR.to_owned()
    })?;

    if metadata.len() > MAX_DESIGN_FILE_BYTES as u64 {
        return Err(FILE_TOO_LARGE.to_owned());
    }

    let bytes = fs::read(path).map_err(|error| {
        eprintln!("failed to read the design file: {error}");
        READ_ERROR.to_owned()
    })?;

    if bytes.len() > MAX_DESIGN_FILE_BYTES {
        return Err(FILE_TOO_LARGE.to_owned());
    }

    let contents = String::from_utf8(bytes).map_err(|_| NOT_TEXT_FILE.to_owned())?;

    if contents.is_empty() {
        return Err(EMPTY_FILE.to_owned());
    }
    if contents.contains('\0') {
        return Err(NOT_TEXT_FILE.to_owned());
    }

    let bytes = contents.len();

    Ok((contents, bytes, modified_ms(&metadata)))
}

fn write_with_backup(
    target: &Path,
    exists: bool,
    contents: &str,
    expected_modified_ms: Option<u64>,
) -> Result<(Option<PathBuf>, u64), String> {
    let mut backup = None;

    if exists {
        let metadata = fs::metadata(target).map_err(|error| {
            eprintln!("failed to inspect the design file before writing: {error}");
            WRITE_ERROR.to_owned()
        })?;

        if let Some(expected) = expected_modified_ms {
            if modified_ms(&metadata) != expected {
                return Err(FILE_CHANGED.to_owned());
            }
        }

        let backup_path = next_backup_path(target)?;
        fs::copy(target, &backup_path).map_err(|error| {
            eprintln!("failed to back up the design file: {error}");
            WRITE_ERROR.to_owned()
        })?;
        backup = Some(backup_path);
    }

    fs::write(target, contents.as_bytes()).map_err(|error| {
        eprintln!("failed to write the design file: {error}");
        WRITE_ERROR.to_owned()
    })?;

    let metadata = fs::metadata(target).map_err(|error| {
        eprintln!("failed to inspect the written design file: {error}");
        WRITE_ERROR.to_owned()
    })?;

    Ok((backup, modified_ms(&metadata)))
}

fn next_backup_path(path: &Path) -> Result<PathBuf, String> {
    let parent = path.parent().ok_or_else(|| WRITE_ERROR.to_owned())?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| WRITE_ERROR.to_owned())?;

    for index in 0..1000 {
        let candidate = if index == 0 {
            parent.join(format!("{file_name}.bak"))
        } else {
            parent.join(format!("{file_name}.bak.{index}"))
        };

        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(WRITE_ERROR.to_owned())
}

fn modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn display_path(path: &Path) -> String {
    let path = path.to_string_lossy();

    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        rest.to_owned()
    } else {
        path.into_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::SystemTime;

    static NEXT_FIXTURE_ID: AtomicU64 = AtomicU64::new(0);

    const DESIGN: &str = concat!(
        "{\"format\":\"flutter-ui-studio-design\",\"version\":1,\"scope\":\"project\",",
        "\"exportedAt\":\"2026-11-04T00:00:00.000Z\",\"projectName\":\"demo\",",
        "\"design\":{\"version\":2,\"activeId\":\"canvas-1\",\"canvases\":[",
        "{\"id\":\"canvas-1\",\"name\":\"Canvas 1\",\"root\":{",
        "\"id\":\"screen-1\",\"kind\":\"screen\",\"props\":{",
        "\"content\":\"\",\"label\":\"\",\"padding\":0,\"gap\":0,\"background\":\"\"",
        "},\"children\":[]}}]}}"
    );

    struct TempProject {
        path: PathBuf,
    }

    impl TempProject {
        fn new(name: &str) -> Self {
            let unique = NEXT_FIXTURE_ID.fetch_add(1, Ordering::Relaxed);
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after the Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "flutter-ui-studio-design-{name}-{}-{timestamp}-{unique}",
                std::process::id()
            ));

            fs::create_dir_all(&path).expect("fixture directory should be created");
            Self { path }
        }

        fn canonical_root(&self) -> PathBuf {
            self.path
                .canonicalize()
                .expect("fixture should be canonicalizable")
        }
    }

    impl Drop for TempProject {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn writes_design_exports_and_numbers_backups() {
        let project = TempProject::new("export");
        let path = project.path.join("project.json");
        let path_text = path.to_string_lossy().into_owned();

        let first = write_export_file_to(&path_text, DESIGN, None).expect("export should write");
        assert_eq!(first.backup_path, None);
        assert_eq!(first.bytes, DESIGN.len());
        assert_eq!(
            fs::read_to_string(&path).expect("export should exist"),
            DESIGN
        );

        let second =
            write_export_file_to(&path_text, "{\"updated\":true}", None).expect("overwrite");
        assert_eq!(
            second.backup_path.as_deref(),
            Some(format!("{}.bak", path.to_string_lossy()).as_str())
        );
        assert_eq!(
            fs::read_to_string(project.path.join("project.json.bak")).expect("backup should exist"),
            DESIGN
        );
    }

    #[test]
    fn rejects_invalid_export_paths() {
        let project = TempProject::new("invalid-export");
        let root = project.canonical_root();
        let missing = root.join("missing").join("design.json");
        let wrong_extension = root.join("design.txt");

        for path in [
            "design.json".to_owned(),
            wrong_extension.to_string_lossy().into_owned(),
            missing.to_string_lossy().into_owned(),
        ] {
            assert_eq!(
                write_export_file_to(&path, DESIGN, None).expect_err("path should be rejected"),
                INVALID_EXPORT_PATH
            );
        }
    }

    #[test]
    fn rejects_oversized_and_binary_exports() {
        let project = TempProject::new("invalid-export-contents");
        let path = project.path.join("design.json");
        let path_text = path.to_string_lossy().into_owned();

        assert_eq!(
            write_export_file_to(&path_text, &"x".repeat(MAX_DESIGN_FILE_BYTES + 1), None)
                .expect_err("oversized export should be rejected"),
            FILE_TOO_LARGE
        );
        assert_eq!(
            write_export_file_to(&path_text, "hello\0world", None)
                .expect_err("NUL should be rejected"),
            NOT_TEXT_FILE
        );
        assert_eq!(
            write_export_file_to(&path_text, "", None)
                .expect_err("empty export should be rejected"),
            EMPTY_FILE
        );
    }

    #[test]
    fn rejects_stale_export_overwrites() {
        let project = TempProject::new("export-conflict");
        let path = project.path.join("design.json");
        let path_text = path.to_string_lossy().into_owned();

        let first = write_export_file_to(&path_text, DESIGN, None).expect("initial write");

        assert_eq!(
            write_export_file_to(&path_text, DESIGN, Some(first.modified_ms + 1))
                .expect_err("stale write should conflict"),
            FILE_CHANGED
        );
        assert!(write_export_file_to(&path_text, DESIGN, Some(first.modified_ms)).is_ok());
    }

    #[test]
    fn writes_and_reads_the_project_design_file() {
        let project = TempProject::new("project-design");
        let root = project.canonical_root();

        let first = write_project_design_to(&root, DESIGN).expect("design should write");
        assert_eq!(first.relative_path, PROJECT_DESIGN_RELATIVE_PATH);
        assert_eq!(first.backup_path, None);
        assert_eq!(
            fs::read_to_string(root.join(DESIGN_DIRECTORY).join(GITIGNORE_NAME))
                .expect("ignore file should exist"),
            GITIGNORE_CONTENTS
        );

        let read = read_project_design_from(&root).expect("design should read");
        assert_eq!(read.relative_path, PROJECT_DESIGN_RELATIVE_PATH);
        assert_eq!(read.contents, DESIGN);
        assert_eq!(read.bytes, DESIGN.len());

        let second = write_project_design_to(&root, "{\"updated\":true}").expect("overwrite");
        assert_eq!(
            second.backup_path.as_deref(),
            Some(".flutter-ui-studio/design.json.bak")
        );
        assert_eq!(
            fs::read_to_string(root.join(DESIGN_DIRECTORY).join("design.json.bak"))
                .expect("backup should exist"),
            DESIGN
        );
    }

    #[test]
    fn reports_a_missing_project_design_file() {
        let project = TempProject::new("missing-project-design");
        let root = project.canonical_root();

        assert_eq!(
            read_project_design_from(&root).expect_err("missing design should fail"),
            PROJECT_DESIGN_MISSING
        );
    }

    #[test]
    fn rejects_oversized_project_design_files() {
        let project = TempProject::new("oversized-project-design");
        let root = project.canonical_root();

        assert_eq!(
            write_project_design_to(&root, &"x".repeat(MAX_DESIGN_FILE_BYTES + 1))
                .expect_err("oversized design should be rejected"),
            FILE_TOO_LARGE
        );
    }

    #[test]
    fn reads_and_validates_export_contents() {
        let project = TempProject::new("read-export");
        let path = project.path.join("design.json");

        fs::write(&path, DESIGN).expect("fixture should be written");
        let read = read_export_file_from(&path.to_string_lossy()).expect("export should read");
        assert_eq!(read.contents, DESIGN);

        fs::write(&path, [0xff, 0xfe, 0x00]).expect("binary fixture should be written");
        assert_eq!(
            read_export_file_from(&path.to_string_lossy())
                .expect_err("binary export should be rejected"),
            NOT_TEXT_FILE
        );
    }
}
