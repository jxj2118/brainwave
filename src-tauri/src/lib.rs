mod attachment_opener;
mod commands;
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder.plugin(attachment_opener::plugin());
    builder
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            #[cfg(target_os = "ios")]
            let root = app.path().document_dir()?.join("Brainwave");
            #[cfg(not(target_os = "ios"))]
            let root = data.join("workspaces").join("personal");
            let workspace = if root.join(".git").exists() {
                brainwave_core::Workspace::open(&root)
            } else {
                brainwave_core::Workspace::init(&root)
            }
            .map_err(|error| std::io::Error::other(error.code))?;
            let runtime = data.join("runtime");
            let _ = workspace.recover_file_operation(&runtime);
            let _ = brainwave_core::sync::SyncEngine::new(&workspace, &runtime).recover();
            let credentials = brainwave_core::sync::CredentialStore::new(&runtime)
                .load()
                .unwrap_or_default();
            app.manage(commands::MobileState {
                workspace: Arc::new(Mutex::new(workspace)),
                runtime,
                credentials: Mutex::new(credentials),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_notes,
            commands::read_note,
            commands::create_note,
            commands::save_note,
            commands::create_folder,
            commands::load_preferences,
            commands::save_preferences,
            commands::read_draft,
            commands::write_draft,
            attachment_opener::open_attachment,
            commands::move_entry,
            commands::delete_entry,
            commands::import_attachment,
            commands::read_attachment,
            commands::note_history,
            commands::read_version,
            commands::checkpoint,
            commands::sync_status,
            commands::configure_sync,
            commands::test_sync_remote,
            commands::sync_credentials,
            commands::clear_sync_credentials,
            commands::load_ui_state,
            commands::save_ui_state,
            commands::sync_now,
            commands::resolve_conflict,
            commands::clear_draft
        ])
        .run(tauri::generate_context!())
        .expect("error while running Brainwave");
}
