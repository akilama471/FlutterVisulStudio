use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::State;

const IGNORED_DIRECTORIES: &[&str] = &[".git", ".dart_tool", "build"];
const NO_PROJECT_ERROR: &str = "No project is open.";
const NOT_FLUTTER_ERROR: &str =
    "That folder is not a Flutter project (pubspec.yaml was not found).";
const OPEN_ERROR: &str = "The project folder could not be opened.";
const UNAVAILABLE_ERROR: &str = "That folder is no longer available.";
const OUTSIDE_PROJECT_ERROR: &str = "That location is outside the open project.";

#[derive(Default)]
pub struct ProjectState {
    root: Mutex<Option<PathBuf>>,
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
}
