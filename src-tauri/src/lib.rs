mod citations_cmd;
mod commands;
mod latex_cmd;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::ProjectRoot::default())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::write_binary_file,
            commands::read_binary_file,
            commands::read_dir,
            commands::read_dir_tree,
            commands::set_project_root,
            commands::create_file,
            commands::create_dir,
            commands::rename_path,
            commands::copy_asset_to_project,
            commands::open_path_external,
            commands::list_backups,
            commands::read_backup,
            commands::git_get_status,
            commands::git_changed_files,
            commands::git_sync,
            latex_cmd::detect_tex_toolchain,
            latex_cmd::compile_latex,
            citations_cmd::zotero_ping,
            citations_cmd::zotero_search,
            citations_cmd::zotero_get_collections,
            citations_cmd::zotero_collection_bibtex,
            citations_cmd::fetch_reference_by_id,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building MirTex desktop application");
}
