mod commands;

use commands::{
    app_info, close_project, list_project_directory, open_project, read_project_file,
    write_project_file, ProjectState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ProjectState::default())
        .invoke_handler(tauri::generate_handler![
            app_info,
            open_project,
            list_project_directory,
            read_project_file,
            write_project_file,
            close_project
        ])
        .run(tauri::generate_context!())
        .expect("failed to launch Flutter UI Studio");
}
