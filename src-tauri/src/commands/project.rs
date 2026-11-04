use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::UNIX_EPOCH,
};
use tauri::State;

const IGNORED_DIRECTORIES: &[&str] = &[".git", ".dart_tool", ".flutter-ui-studio", "build"];
const NO_PROJECT_ERROR: &str = "No project is open.";
const NOT_FLUTTER_ERROR: &str =
    "That folder is not a Flutter project (pubspec.yaml was not found).";
const OPEN_ERROR: &str = "The project folder could not be opened.";
const UNAVAILABLE_ERROR: &str = "That folder is no longer available.";
const OUTSIDE_PROJECT_ERROR: &str = "That location is outside the open project.";
const READ_ERROR: &str = "The file could not be read.";
const WRITE_ERROR: &str = "The file could not be written.";
const INVALID_FILE_PATH: &str = "Only Dart files inside the project's lib folder can be used.";
const INVALID_TEXT_PATH: &str = "That path is not an editable project file.";
const NOT_TEXT_FILE: &str = "Only UTF-8 text files can be opened.";
const FILE_CHANGED: &str = "The file changed on disk. Reload it before saving.";
const FILE_MISSING: &str = "The file no longer exists.";
const FILE_TOO_LARGE: &str = "The file is too large to read or write.";
const MAX_FILE_BYTES: usize = 1024 * 1024;

#[derive(Default)]
pub struct ProjectState {
    root: Mutex<Option<PathBuf>>,
}

impl ProjectState {
    pub(crate) fn active_root(&self) -> Result<PathBuf, String> {
        self.root
            .lock()
            .map_err(|_| "The project state is unavailable.".to_owned())?
            .clone()
            .ok_or_else(|| NO_PROJECT_ERROR.to_owned())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub entry_point: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectEntryKind {
    Directory,
    File,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub name: String,
    pub relative_path: String,
    pub kind: ProjectEntryKind,
    pub has_children: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWriteResult {
    pub relative_path: String,
    pub backup_path: Option<String>,
    pub bytes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTextFile {
    pub relative_path: String,
    pub contents: String,
    pub bytes: usize,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTextFileStat {
    pub relative_path: String,
    pub bytes: usize,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTextWriteResult {
    pub relative_path: String,
    pub backup_path: Option<String>,
    pub bytes: usize,
    pub modified_ms: u64,
}

#[tauri::command]
pub fn open_project(state: State<'_, ProjectState>, path: String) -> Result<ProjectInfo, String> {
    let requested_root = PathBuf::from(path);
    let inspected = inspect_project(&requested_root)?;

    let mut active_root = state
        .root
        .lock()
        .map_err(|_| "The project state is unavailable.".to_owned())?;
    *active_root = Some(inspected.root);

    Ok(inspected.info)
}

#[tauri::command]
pub fn list_project_directory(
    state: State<'_, ProjectState>,
    relative_path: String,
) -> Result<Vec<ProjectEntry>, String> {
    let active_root = state
        .root
        .lock()
        .map_err(|_| "The project state is unavailable.".to_owned())?;
    let root = active_root
        .as_deref()
        .ok_or_else(|| NO_PROJECT_ERROR.to_owned())?;

    list_directory(root, &relative_path)
}

#[tauri::command]
pub fn read_project_file(
    state: State<'_, ProjectState>,
    relative_path: String,
) -> Result<Option<String>, String> {
    let active_root = state
        .root
        .lock()
        .map_err(|_| "The project state is unavailable.".to_owned())?;
    let root = active_root
        .as_deref()
        .ok_or_else(|| NO_PROJECT_ERROR.to_owned())?;

    read_project_file_from(root, &relative_path)
}

#[tauri::command]
pub fn write_project_file(
    state: State<'_, ProjectState>,
    relative_path: String,
    contents: String,
) -> Result<ProjectWriteResult, String> {
    let active_root = state
        .root
        .lock()
        .map_err(|_| "The project state is unavailable.".to_owned())?;
    let root = active_root
        .as_deref()
        .ok_or_else(|| NO_PROJECT_ERROR.to_owned())?;

    write_project_file_to(root, &relative_path, &contents)
}

#[tauri::command]
pub fn read_project_text_file(
    state: State<'_, ProjectState>,
    relative_path: String,
) -> Result<ProjectTextFile, String> {
    let active_root = state
        .root
        .lock()
        .map_err(|_| "The project state is unavailable.".to_owned())?;
    let root = active_root
        .as_deref()
        .ok_or_else(|| NO_PROJECT_ERROR.to_owned())?;

    read_text_file_from(root, &relative_path)
}

#[tauri::command]
pub fn stat_project_text_file(
    state: State<'_, ProjectState>,
    relative_path: String,
) -> Result<ProjectTextFileStat, String> {
    let active_root = state
        .root
        .lock()
        .map_err(|_| "The project state is unavailable.".to_owned())?;
    let root = active_root
        .as_deref()
        .ok_or_else(|| NO_PROJECT_ERROR.to_owned())?;

    stat_text_file_from(root, &relative_path)
}

#[tauri::command]
pub fn write_project_text_file(
    state: State<'_, ProjectState>,
    relative_path: String,
    contents: String,
    expected_modified_ms: Option<u64>,
) -> Result<ProjectTextWriteResult, String> {
    let active_root = state
        .root
        .lock()
        .map_err(|_| "The project state is unavailable.".to_owned())?;
    let root = active_root
        .as_deref()
        .ok_or_else(|| NO_PROJECT_ERROR.to_owned())?;

    write_text_file_to(root, &relative_path, &contents, expected_modified_ms)
}

#[tauri::command]
pub fn close_project(state: State<'_, ProjectState>) -> Result<(), String> {
    let mut active_root = state
        .root
        .lock()
        .map_err(|_| "The project state is unavailable.".to_owned())?;
    *active_root = None;

    Ok(())
}

#[derive(Debug)]
struct InspectedProject {
    info: ProjectInfo,
    root: PathBuf,
}

fn inspect_project(path: &Path) -> Result<InspectedProject, String> {
    let root = path.canonicalize().map_err(|_| OPEN_ERROR.to_owned())?;

    if !root.is_dir() {
        return Err(OPEN_ERROR.to_owned());
    }

    let pubspec = match fs::read_to_string(root.join("pubspec.yaml")) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(NOT_FLUTTER_ERROR.to_owned());
        }
        Err(error) => {
            eprintln!("failed to read pubspec.yaml: {error}");
            return Err(NOT_FLUTTER_ERROR.to_owned());
        }
    };

    let fallback_name = root
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("Flutter project");
    let name = parse_project_name(&pubspec).unwrap_or_else(|| fallback_name.to_owned());

    let entry_point = if root.join("lib").join("main.dart").is_file() {
        Some("lib/main.dart".to_owned())
    } else {
        None
    };

    Ok(InspectedProject {
        info: ProjectInfo {
            name,
            path: display_path(&root),
            entry_point,
        },
        root,
    })
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

fn parse_project_name(contents: &str) -> Option<String> {
    for line in contents.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            continue;
        }

        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let Some(value) = trimmed.strip_prefix("name:") else {
            continue;
        };
        let value = value.trim();
        let value = value.split('#').next().unwrap_or(value).trim();
        let value = value
            .strip_prefix('"')
            .and_then(|value| value.split('"').next())
            .or_else(|| {
                value
                    .strip_prefix('\'')
                    .and_then(|value| value.split('\'').next())
            })
            .unwrap_or(value)
            .trim();

        if !value.is_empty() {
            return Some(value.to_owned());
        }
    }

    None
}

fn list_directory(root: &Path, relative_path: &str) -> Result<Vec<ProjectEntry>, String> {
    let directory = resolve_directory(root, relative_path)?;
    let read_dir = fs::read_dir(&directory).map_err(|error| {
        eprintln!("failed to read project directory: {error}");
        UNAVAILABLE_ERROR.to_owned()
    })?;

    let mut entries = Vec::new();

    for entry in read_dir.flatten() {
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_dir() && IGNORED_DIRECTORIES.contains(&name) {
            continue;
        }

        let Ok(canonical_path) = entry.path().canonicalize() else {
            continue;
        };
        if !canonical_path.starts_with(root) {
            continue;
        }

        let is_directory = canonical_path.is_dir();
        let relative_path = relative_path_string(&entry.path(), root);
        if relative_path.is_empty() {
            continue;
        }

        entries.push(ProjectEntry {
            name: name.to_owned(),
            relative_path,
            kind: if is_directory {
                ProjectEntryKind::Directory
            } else {
                ProjectEntryKind::File
            },
            has_children: is_directory && has_visible_child(&canonical_path),
        });
    }

    entries.sort_by(|left, right| {
        entry_kind_rank(left.kind)
            .cmp(&entry_kind_rank(right.kind))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok(entries)
}

fn resolve_directory(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(OUTSIDE_PROJECT_ERROR.to_owned());
    }

    let directory = root
        .join(relative)
        .canonicalize()
        .map_err(|_| UNAVAILABLE_ERROR.to_owned())?;

    if !directory.starts_with(root) {
        return Err(OUTSIDE_PROJECT_ERROR.to_owned());
    }
    if !directory.is_dir() {
        return Err(UNAVAILABLE_ERROR.to_owned());
    }

    Ok(directory)
}

struct ProjectFileTarget {
    relative_path: String,
    path: PathBuf,
    exists: bool,
}

fn read_project_file_from(root: &Path, relative_path: &str) -> Result<Option<String>, String> {
    let target = resolve_file_target(root, relative_path)?;

    if !target.exists {
        return Ok(None);
    }

    let metadata = fs::metadata(&target.path).map_err(|error| {
        eprintln!("failed to inspect project file: {error}");
        UNAVAILABLE_ERROR.to_owned()
    })?;

    if metadata.len() > MAX_FILE_BYTES as u64 {
        return Err(FILE_TOO_LARGE.to_owned());
    }

    let contents = fs::read_to_string(&target.path).map_err(|error| {
        eprintln!("failed to read project file: {error}");
        READ_ERROR.to_owned()
    })?;

    if contents.len() > MAX_FILE_BYTES {
        return Err(FILE_TOO_LARGE.to_owned());
    }

    Ok(Some(contents))
}

fn write_project_file_to(
    root: &Path,
    relative_path: &str,
    contents: &str,
) -> Result<ProjectWriteResult, String> {
    if contents.len() > MAX_FILE_BYTES {
        return Err(FILE_TOO_LARGE.to_owned());
    }

    let target = resolve_file_target(root, relative_path)?;
    let backup_path = if target.exists {
        let backup = next_backup_path(&target.path)?;
        fs::copy(&target.path, &backup).map_err(|error| {
            eprintln!("failed to back up project file: {error}");
            WRITE_ERROR.to_owned()
        })?;
        Some(relative_path_string(&backup, root))
    } else {
        None
    };

    fs::write(&target.path, contents.as_bytes()).map_err(|error| {
        eprintln!("failed to write project file: {error}");
        WRITE_ERROR.to_owned()
    })?;

    Ok(ProjectWriteResult {
        relative_path: target.relative_path,
        backup_path,
        bytes: contents.len(),
    })
}

fn resolve_file_target(root: &Path, relative_path: &str) -> Result<ProjectFileTarget, String> {
    let relative = Path::new(relative_path);

    if relative.as_os_str().is_empty() || relative.is_absolute() {
        return Err(INVALID_FILE_PATH.to_owned());
    }

    let mut components = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(value) => components.push(value.to_string_lossy().into_owned()),
            _ => return Err(INVALID_FILE_PATH.to_owned()),
        }
    }

    let file_name = components.last().cloned().unwrap_or_default();
    if components.len() < 2
        || components[0] != "lib"
        || !file_name.ends_with(".dart")
        || file_name == ".dart"
    {
        return Err(INVALID_FILE_PATH.to_owned());
    }

    let normalized = components.join("/");
    let path = root.join(&normalized);
    let parent = path.parent().ok_or_else(|| INVALID_FILE_PATH.to_owned())?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|_| UNAVAILABLE_ERROR.to_owned())?;

    if !canonical_parent.starts_with(root) {
        return Err(OUTSIDE_PROJECT_ERROR.to_owned());
    }

    let exists = path.exists();
    if exists {
        let canonical = path
            .canonicalize()
            .map_err(|_| UNAVAILABLE_ERROR.to_owned())?;
        if !canonical.starts_with(root) {
            return Err(OUTSIDE_PROJECT_ERROR.to_owned());
        }
        if !canonical.is_file() {
            return Err(INVALID_FILE_PATH.to_owned());
        }
    }

    Ok(ProjectFileTarget {
        relative_path: normalized,
        path,
        exists,
    })
}

fn next_backup_path(path: &Path) -> Result<PathBuf, String> {
    let parent = path.parent().ok_or_else(|| WRITE_ERROR.to_owned())?;
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
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

fn resolve_text_file_target(root: &Path, relative_path: &str) -> Result<ProjectFileTarget, String> {
    let relative = Path::new(relative_path);

    if relative.as_os_str().is_empty() || relative.is_absolute() {
        return Err(INVALID_TEXT_PATH.to_owned());
    }

    let mut components = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(value) => {
                let value = value.to_string_lossy();
                if IGNORED_DIRECTORIES
                    .iter()
                    .any(|ignored| value.eq_ignore_ascii_case(ignored))
                {
                    return Err(INVALID_TEXT_PATH.to_owned());
                }
                components.push(value.into_owned());
            }
            _ => return Err(INVALID_TEXT_PATH.to_owned()),
        }
    }

    if components.is_empty() {
        return Err(INVALID_TEXT_PATH.to_owned());
    }

    let normalized = components.join("/");
    let path = root.join(&normalized);
    let canonical = match path.canonicalize() {
        Ok(canonical) => canonical,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(FILE_MISSING.to_owned())
        }
        Err(_) => return Err(UNAVAILABLE_ERROR.to_owned()),
    };

    if !canonical.starts_with(root) {
        return Err(OUTSIDE_PROJECT_ERROR.to_owned());
    }
    if !canonical.is_file() {
        return Err(INVALID_TEXT_PATH.to_owned());
    }

    Ok(ProjectFileTarget {
        relative_path: normalized,
        path,
        exists: true,
    })
}

fn read_text_file_from(root: &Path, relative_path: &str) -> Result<ProjectTextFile, String> {
    let target = resolve_text_file_target(root, relative_path)?;
    let metadata = fs::metadata(&target.path).map_err(|error| {
        eprintln!("failed to inspect project text file: {error}");
        UNAVAILABLE_ERROR.to_owned()
    })?;

    if metadata.len() > MAX_FILE_BYTES as u64 {
        return Err(FILE_TOO_LARGE.to_owned());
    }

    let bytes = fs::read(&target.path).map_err(|error| {
        eprintln!("failed to read project text file: {error}");
        READ_ERROR.to_owned()
    })?;

    if bytes.len() > MAX_FILE_BYTES {
        return Err(FILE_TOO_LARGE.to_owned());
    }

    let contents = String::from_utf8(bytes).map_err(|_| NOT_TEXT_FILE.to_owned())?;

    if contents.contains('\0') {
        return Err(NOT_TEXT_FILE.to_owned());
    }

    Ok(ProjectTextFile {
        relative_path: target.relative_path,
        bytes: contents.len(),
        modified_ms: modified_ms(&metadata),
        contents,
    })
}

fn stat_text_file_from(root: &Path, relative_path: &str) -> Result<ProjectTextFileStat, String> {
    let target = resolve_text_file_target(root, relative_path)?;
    let metadata = fs::metadata(&target.path).map_err(|error| {
        eprintln!("failed to inspect project text file: {error}");
        UNAVAILABLE_ERROR.to_owned()
    })?;

    Ok(ProjectTextFileStat {
        relative_path: target.relative_path,
        bytes: metadata.len() as usize,
        modified_ms: modified_ms(&metadata),
    })
}

fn write_text_file_to(
    root: &Path,
    relative_path: &str,
    contents: &str,
    expected_modified_ms: Option<u64>,
) -> Result<ProjectTextWriteResult, String> {
    if contents.len() > MAX_FILE_BYTES {
        return Err(FILE_TOO_LARGE.to_owned());
    }
    if contents.contains('\0') {
        return Err(NOT_TEXT_FILE.to_owned());
    }

    let target = resolve_text_file_target(root, relative_path)?;
    let metadata = fs::metadata(&target.path).map_err(|error| {
        eprintln!("failed to inspect project text file: {error}");
        UNAVAILABLE_ERROR.to_owned()
    })?;

    if let Some(expected) = expected_modified_ms {
        if modified_ms(&metadata) != expected {
            return Err(FILE_CHANGED.to_owned());
        }
    }

    let backup = next_backup_path(&target.path)?;
    fs::copy(&target.path, &backup).map_err(|error| {
        eprintln!("failed to back up project text file: {error}");
        WRITE_ERROR.to_owned()
    })?;

    fs::write(&target.path, contents.as_bytes()).map_err(|error| {
        eprintln!("failed to write project text file: {error}");
        WRITE_ERROR.to_owned()
    })?;

    let updated = fs::metadata(&target.path).map_err(|error| {
        eprintln!("failed to inspect written project text file: {error}");
        WRITE_ERROR.to_owned()
    })?;

    Ok(ProjectTextWriteResult {
        relative_path: target.relative_path,
        backup_path: Some(relative_path_string(&backup, root)),
        bytes: contents.len(),
        modified_ms: modified_ms(&updated),
    })
}

fn modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn has_visible_child(directory: &Path) -> bool {
    fs::read_dir(directory)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .any(|entry| {
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                return false;
            };
            !entry
                .file_type()
                .map(|file_type| file_type.is_dir() && IGNORED_DIRECTORIES.contains(&name))
                .unwrap_or(true)
        })
}

fn relative_path_string(path: &Path, root: &Path) -> String {
    path.strip_prefix(root)
        .map(|relative| {
            relative
                .components()
                .map(|component| component.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/")
        })
        .unwrap_or_default()
}

fn entry_kind_rank(kind: ProjectEntryKind) -> u8 {
    match kind {
        ProjectEntryKind::Directory => 0,
        ProjectEntryKind::File => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    static NEXT_FIXTURE_ID: AtomicU64 = AtomicU64::new(0);

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
                "flutter-ui-studio-{name}-{}-{timestamp}-{unique}",
                std::process::id()
            ));

            fs::create_dir_all(&path).expect("fixture directory should be created");
            Self { path }
        }

        fn write(&self, relative_path: &str, contents: &str) {
            let path = self.path.join(relative_path);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("fixture parent should be created");
            }
            fs::write(path, contents).expect("fixture file should be written");
        }

        fn create_dir(&self, relative_path: &str) {
            fs::create_dir_all(self.path.join(relative_path))
                .expect("fixture directory should be created");
        }
    }

    impl Drop for TempProject {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn flutter_project(name: &str) -> TempProject {
        let project = TempProject::new(name);
        project.write("pubspec.yaml", "name: sample_app\ndescription: Fixture\n");
        project.write("lib/main.dart", "void main() {}\n");
        project
    }

    #[test]
    fn parses_project_names_from_pubspec() {
        assert_eq!(
            parse_project_name("name: plain_app\n"),
            Some("plain_app".to_owned())
        );
        assert_eq!(
            parse_project_name("name: \"quoted_app\"\n"),
            Some("quoted_app".to_owned())
        );
        assert_eq!(
            parse_project_name("# comment\nname: 'single_quoted' # note\n"),
            Some("single_quoted".to_owned())
        );
        assert_eq!(parse_project_name("description: no name here\n"), None);
        assert_eq!(parse_project_name("  name: nested\n"), None);
    }

    #[test]
    fn inspects_a_valid_flutter_project() {
        let project = flutter_project("valid");
        let inspected = inspect_project(&project.path).expect("project should be valid");
        let canonical = project.path.canonicalize().expect("fixture should exist");

        assert_eq!(inspected.info.name, "sample_app");
        assert_eq!(inspected.info.entry_point.as_deref(), Some("lib/main.dart"));
        assert_eq!(inspected.root, canonical);
        assert_eq!(inspected.info.path, display_path(&canonical));
    }

    #[cfg(windows)]
    #[test]
    fn strips_verbatim_prefixes_from_display_paths() {
        assert_eq!(
            display_path(Path::new(r"\\?\C:\Projects\demo_app")),
            r"C:\Projects\demo_app"
        );
        assert_eq!(
            display_path(Path::new(r"\\?\UNC\server\share\demo_app")),
            r"\\server\share\demo_app"
        );
    }

    #[test]
    fn rejects_folders_without_a_pubspec() {
        let project = TempProject::new("missing-pubspec");
        let error = inspect_project(&project.path).expect_err("project should be rejected");

        assert_eq!(error, NOT_FLUTTER_ERROR);
    }

    #[test]
    fn rejects_missing_project_folders() {
        let project = TempProject::new("stale");
        let missing = project.path.join("does-not-exist");
        let error = inspect_project(&missing).expect_err("project should be rejected");

        assert_eq!(error, OPEN_ERROR);
    }

    #[test]
    fn lists_directories_before_files_and_ignores_generated_folders() {
        let project = flutter_project("listing");
        project.create_dir("lib/widgets");
        project.create_dir("android");
        project.write("README.md", "# Fixture\n");
        project.create_dir(".git/objects");
        project.create_dir(".dart_tool/package_config");
        project.create_dir(".flutter-ui-studio/data");
        project.create_dir("build/output");

        let entries = list_directory(
            &project.path.canonicalize().expect("fixture should exist"),
            "",
        )
        .expect("root should be listed");
        let names = entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>();

        assert_eq!(names, vec!["android", "lib", "pubspec.yaml", "README.md"]);
        assert_eq!(entries[0].kind, ProjectEntryKind::Directory);
        assert!(!entries[0].has_children);
        assert_eq!(entries[1].kind, ProjectEntryKind::Directory);
        assert_eq!(entries[1].relative_path, "lib");
        assert!(entries[1].has_children);
        assert_eq!(entries[3].kind, ProjectEntryKind::File);
    }

    #[test]
    fn lists_nested_directories_with_relative_paths() {
        let project = flutter_project("nested");
        project.create_dir("lib/widgets");
        let root = project.path.canonicalize().expect("fixture should exist");

        let entries = list_directory(&root, "lib").expect("lib should be listed");
        let names = entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>();

        assert_eq!(names, vec!["widgets", "main.dart"]);
        assert_eq!(entries[1].relative_path, "lib/main.dart");
        assert!(!entries[0].has_children);
    }

    #[test]
    fn rejects_paths_outside_the_project_root() {
        let project = flutter_project("traversal");
        let root = project.path.canonicalize().expect("fixture should exist");

        assert_eq!(
            list_directory(&root, "../").expect_err("parent path should be rejected"),
            OUTSIDE_PROJECT_ERROR
        );
        assert_eq!(
            list_directory(&root, "lib/../../").expect_err("nested traversal should be rejected"),
            OUTSIDE_PROJECT_ERROR
        );
        assert_eq!(
            list_directory(&root, "missing").expect_err("missing directory should be rejected"),
            UNAVAILABLE_ERROR
        );
    }

    fn canonical_root(project: &TempProject) -> PathBuf {
        project
            .path
            .canonicalize()
            .expect("fixture should be canonicalizable")
    }

    #[test]
    fn reads_files_under_the_project_lib() {
        let project = flutter_project("read-file");
        let root = canonical_root(&project);

        assert_eq!(
            read_project_file_from(&root, "lib/main.dart").expect("file should be readable"),
            Some("void main() {}\n".to_owned())
        );
    }

    #[test]
    fn reports_missing_files_as_none() {
        let project = flutter_project("missing-file");
        let root = canonical_root(&project);

        assert_eq!(
            read_project_file_from(&root, "lib/missing.dart").expect("lookup should succeed"),
            None
        );
    }

    #[test]
    fn writes_new_files_and_reports_bytes() {
        let project = TempProject::new("write-new");
        project.create_dir("lib");
        let root = canonical_root(&project);

        let result = write_project_file_to(&root, "lib/main.dart", "void main() {}\n")
            .expect("file should be written");

        assert_eq!(result.relative_path, "lib/main.dart");
        assert_eq!(result.backup_path, None);
        assert_eq!(result.bytes, 15);
        assert_eq!(
            fs::read_to_string(root.join("lib/main.dart")).expect("file should exist"),
            "void main() {}\n"
        );
    }

    #[test]
    fn backs_up_existing_files_before_writing() {
        let project = flutter_project("write-backup");
        let root = canonical_root(&project);

        let result = write_project_file_to(&root, "lib/main.dart", "void studio() {}\n")
            .expect("file should be written");

        assert_eq!(result.backup_path.as_deref(), Some("lib/main.dart.bak"));
        assert_eq!(
            fs::read_to_string(root.join("lib/main.dart.bak")).expect("backup should exist"),
            "void main() {}\n"
        );
        assert_eq!(
            fs::read_to_string(root.join("lib/main.dart")).expect("file should exist"),
            "void studio() {}\n"
        );
    }

    #[test]
    fn numbers_backups_when_the_default_is_taken() {
        let project = flutter_project("write-backup-numbered");
        project.write("lib/main.dart.bak", "older backup\n");
        let root = canonical_root(&project);

        let result = write_project_file_to(&root, "lib/main.dart", "void studio() {}\n")
            .expect("file should be written");

        assert_eq!(result.backup_path.as_deref(), Some("lib/main.dart.bak.1"));
        assert_eq!(
            fs::read_to_string(root.join("lib/main.dart.bak")).expect("old backup should remain"),
            "older backup\n"
        );
        assert_eq!(
            fs::read_to_string(root.join("lib/main.dart.bak.1")).expect("new backup should exist"),
            "void main() {}\n"
        );
    }

    #[test]
    fn rejects_invalid_file_targets() {
        let project = flutter_project("invalid-file-targets");
        project.create_dir("lib/widgets");
        let root = canonical_root(&project);

        for relative_path in [
            "",
            "/etc/main.dart",
            "../main.dart",
            "lib/../../main.dart",
            "pubspec.yaml",
            "lib/main.txt",
            "lib",
            "lib/widgets",
            "lib/.dart",
        ] {
            assert_eq!(
                write_project_file_to(&root, relative_path, "void main() {}\n")
                    .expect_err("path should be rejected"),
                INVALID_FILE_PATH,
                "expected {relative_path:?} to be rejected"
            );
        }
    }

    #[test]
    fn rejects_oversized_files() {
        let project = flutter_project("oversized-file");
        let root = canonical_root(&project);
        let contents = "x".repeat(MAX_FILE_BYTES + 1);

        assert_eq!(
            write_project_file_to(&root, "lib/main.dart", &contents)
                .expect_err("oversized write should be rejected"),
            FILE_TOO_LARGE
        );
    }

    #[test]
    fn reads_and_stats_text_files_anywhere_in_the_project() {
        let project = flutter_project("text-file");
        project.write("README.md", "# Fixture\n");
        let root = canonical_root(&project);

        let file = read_text_file_from(&root, "README.md").expect("text should be readable");
        let stat = stat_text_file_from(&root, "README.md").expect("text should be statable");

        assert_eq!(file.relative_path, "README.md");
        assert_eq!(file.contents, "# Fixture\n");
        assert_eq!(file.bytes, 10);
        assert_eq!(stat.bytes, 10);
        assert_eq!(stat.modified_ms, file.modified_ms);
        assert!(file.modified_ms > 0);
    }

    #[test]
    fn rejects_binary_and_non_utf8_text_files() {
        let project = flutter_project("binary-file");
        let path = project.path.join("image.bin");
        fs::write(&path, [0xff, 0xfe, 0x00, 0x01]).expect("binary fixture should be written");
        fs::write(project.path.join("nul-byte.txt"), b"hello\0world")
            .expect("nul fixture should be written");
        let root = canonical_root(&project);

        assert_eq!(
            read_text_file_from(&root, "image.bin").expect_err("invalid UTF-8 should be rejected"),
            NOT_TEXT_FILE
        );
        assert_eq!(
            read_text_file_from(&root, "nul-byte.txt").expect_err("NUL should be rejected"),
            NOT_TEXT_FILE
        );
    }

    #[test]
    fn rejects_ignored_and_outside_text_paths() {
        let project = flutter_project("text-paths");
        project.write(".git/config", "ignored\n");
        project.write("build/output.txt", "ignored\n");
        project.write("lib/notes.txt", "notes\n");
        let root = canonical_root(&project);

        for relative_path in [
            "",
            "../README.md",
            "lib/../../README.md",
            ".git/config",
            "build/output.txt",
            "missing.txt",
        ] {
            assert!(
                read_text_file_from(&root, relative_path).is_err(),
                "expected {relative_path:?} to be rejected"
            );
        }

        assert_eq!(
            read_text_file_from(&root, "lib/notes.txt")
                .expect("ordinary text should be readable")
                .contents,
            "notes\n"
        );
    }

    #[test]
    fn writes_text_files_with_backups_and_conflict_checks() {
        let project = flutter_project("text-write");
        project.write("README.md", "old\n");
        let root = canonical_root(&project);
        let baseline = stat_text_file_from(&root, "README.md")
            .expect("fixture should be statable")
            .modified_ms;

        let result = write_text_file_to(&root, "README.md", "new\n", Some(baseline))
            .expect("matching baseline should write");
        assert_eq!(result.backup_path.as_deref(), Some("README.md.bak"));
        assert_eq!(
            fs::read_to_string(root.join("README.md")).expect("file should exist"),
            "new\n"
        );
        assert_eq!(
            fs::read_to_string(root.join("README.md.bak")).expect("backup should exist"),
            "old\n"
        );

        assert_eq!(
            write_text_file_to(&root, "README.md", "stale\n", Some(baseline))
                .expect_err("stale baseline should conflict"),
            FILE_CHANGED
        );
        assert_eq!(
            fs::read_to_string(root.join("README.md")).expect("file should remain"),
            "new\n"
        );

        let forced = write_text_file_to(&root, "README.md", "forced\n", None)
            .expect("forced write should succeed");
        assert_eq!(forced.backup_path.as_deref(), Some("README.md.bak.1"));
        assert_eq!(
            fs::read_to_string(root.join("README.md")).expect("forced file should exist"),
            "forced\n"
        );
    }

    #[test]
    fn rejects_invalid_text_writes() {
        let project = flutter_project("invalid-text-write");
        project.write("README.md", "old\n");
        let root = canonical_root(&project);

        assert_eq!(
            write_text_file_to(&root, "README.md", "hello\0world", None)
                .expect_err("NUL should be rejected"),
            NOT_TEXT_FILE
        );
        assert_eq!(
            write_text_file_to(&root, "README.md", &"x".repeat(MAX_FILE_BYTES + 1), None)
                .expect_err("oversized write should be rejected"),
            FILE_TOO_LARGE
        );
        assert_eq!(
            write_text_file_to(&root, "missing.md", "new\n", None)
                .expect_err("missing targets should be rejected"),
            FILE_MISSING
        );
    }
}
