use brainwave_core::{
    Draft, DraftStore, Entry, Error, Note, Workspace,
    sync::{CredentialStore, Credentials},
};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::State;

pub struct MobileState {
    pub workspace: Arc<Mutex<Workspace>>,
    pub runtime: PathBuf,
    pub credentials: Mutex<Credentials>,
}
type Result<T> = std::result::Result<T, Error>;
fn error(code: &str) -> Error {
    Error { code: code.into() }
}
async fn with_workspace<T: Send + 'static>(
    state: State<'_, MobileState>,
    work: impl FnOnce(&Workspace) -> Result<T> + Send + 'static,
) -> Result<T> {
    let workspace = state.workspace.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let guard = workspace.lock().map_err(|_| error("io"))?;
        work(&guard)
    })
    .await
    .map_err(|_| error("io"))?
}
#[tauri::command]
pub async fn scan_notes(state: State<'_, MobileState>) -> Result<Vec<Entry>> {
    with_workspace(state, |w| w.scan()).await
}
#[tauri::command]
pub async fn read_note(state: State<'_, MobileState>, path: String) -> Result<Note> {
    with_workspace(state, move |w| w.read_note(&path)).await
}
#[tauri::command]
pub async fn create_note(
    state: State<'_, MobileState>,
    folder: String,
    name: String,
) -> Result<Note> {
    with_workspace(state, move |w| w.create_note(&folder, &name)).await
}
#[tauri::command]
pub async fn save_note(
    state: State<'_, MobileState>,
    path: String,
    body: String,
    expected_revision: String,
) -> Result<Note> {
    with_workspace(state, move |w| {
        w.save_note(&path, &body, &expected_revision)
    })
    .await
}
#[tauri::command]
pub async fn create_folder(
    state: State<'_, MobileState>,
    folder: String,
    name: String,
) -> Result<()> {
    with_workspace(state, move |w| w.create_folder(&folder, &name)).await
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub locale: Option<String>,
    pub theme: Option<String>,
}
#[tauri::command]
pub fn load_preferences(state: State<'_, MobileState>) -> Preferences {
    std::fs::read(state.runtime.join("preferences.json"))
        .ok()
        .and_then(|v| serde_json::from_slice(&v).ok())
        .unwrap_or_default()
}
#[tauri::command]
pub fn save_preferences(state: State<'_, MobileState>, value: Preferences) -> Result<()> {
    write_json(&state.runtime, "preferences.json", &value)
}
fn write_json(runtime: &std::path::Path, name: &str, value: &impl Serialize) -> Result<()> {
    use std::io::Write;
    std::fs::create_dir_all(runtime)?;
    let mut file = tempfile::NamedTempFile::new_in(runtime)?;
    file.write_all(&serde_json::to_vec(value).map_err(|_| error("io"))?)?;
    file.as_file().sync_all()?;
    file.persist(runtime.join(name))
        .map_err(|e| Error::from(e.error))?;
    Ok(())
}
/// Disposable device UI state (recent notes, expanded folders); never written to the workspace.
#[tauri::command]
pub fn load_ui_state(state: State<'_, MobileState>) -> serde_json::Value {
    std::fs::read(state.runtime.join("ui-state.json"))
        .ok()
        .and_then(|v| serde_json::from_slice(&v).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}
#[tauri::command]
pub fn save_ui_state(state: State<'_, MobileState>, value: serde_json::Value) -> Result<()> {
    write_json(&state.runtime, "ui-state.json", &value)
}

#[tauri::command]
pub fn read_draft(state: State<'_, MobileState>, path: String) -> Result<Option<Draft>> {
    DraftStore::new(&state.runtime.join("drafts")).read(&path)
}
#[tauri::command]
pub fn write_draft(state: State<'_, MobileState>, value: Draft) -> Result<()> {
    DraftStore::new(&state.runtime.join("drafts")).write(&value)
}
#[tauri::command]
pub fn clear_draft(state: State<'_, MobileState>, path: String) -> Result<()> {
    DraftStore::new(&state.runtime.join("drafts")).clear(&path)
}

#[tauri::command]
pub async fn move_entry(
    state: State<'_, MobileState>,
    path: String,
    folder: String,
    name: String,
    expected_revision: Option<String>,
) -> Result<String> {
    let runtime = state.runtime.clone();
    with_workspace(state, move |w| {
        w.move_entry(
            &runtime,
            &path,
            &folder,
            &name,
            expected_revision.as_deref(),
        )
    })
    .await
}
#[tauri::command]
pub async fn delete_entry(
    state: State<'_, MobileState>,
    path: String,
    expected_revision: Option<String>,
) -> Result<()> {
    let runtime = state.runtime.clone();
    with_workspace(state, move |w| {
        w.delete_entry(&runtime, &path, expected_revision.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn import_attachment(
    state: State<'_, MobileState>,
    note: String,
    name: String,
    bytes: Vec<u8>,
) -> Result<brainwave_core::Attachment> {
    with_workspace(state, move |w| w.import_attachment(&note, &name, &bytes)).await
}
#[tauri::command]
pub async fn read_attachment(
    state: State<'_, MobileState>,
    note: String,
    url: String,
) -> Result<brainwave_core::AttachmentData> {
    with_workspace(state, move |w| w.read_attachment(&note, &url)).await
}
#[tauri::command]
pub async fn note_history(
    state: State<'_, MobileState>,
    path: Option<String>,
) -> Result<Vec<brainwave_core::HistoryEntry>> {
    with_workspace(state, move |w| w.history(path.as_deref())).await
}
#[tauri::command]
pub async fn read_version(
    state: State<'_, MobileState>,
    commit: String,
    path: String,
) -> Result<String> {
    with_workspace(state, move |w| w.version(&commit, &path)).await
}
#[tauri::command]
pub async fn checkpoint(state: State<'_, MobileState>) -> Result<Option<String>> {
    let runtime = state.runtime.clone();
    with_workspace(state, move |w| {
        let c = brainwave_core::sync::SyncEngine::new(w, &runtime)
            .status()?
            .configuration;
        w.checkpoint(&brainwave_core::Identity {
            name: c.name,
            email: c.email,
        })
    })
    .await
}
#[tauri::command]
pub async fn sync_status(
    state: State<'_, MobileState>,
) -> Result<brainwave_core::sync::SyncStatus> {
    let runtime = state.runtime.clone();
    with_workspace(state, move |w| {
        brainwave_core::sync::SyncEngine::new(w, &runtime).status()
    })
    .await
}
/// An empty token keeps the stored token so the UI never needs to read it back.
fn merged_credentials(state: &MobileState, username: String, token: String) -> Result<Credentials> {
    let stored = state.credentials.lock().map_err(|_| error("io"))?;
    Ok(Credentials {
        username: username.trim().into(),
        token: if token.is_empty() {
            stored.token.clone()
        } else {
            token
        },
    })
}
#[tauri::command]
pub async fn configure_sync(
    state: State<'_, MobileState>,
    remote: String,
    name: String,
    email: String,
    username: String,
    token: String,
) -> Result<()> {
    let credentials = merged_credentials(&state, username, token)?;
    let runtime = state.runtime.clone();
    let stored = credentials.clone();
    with_workspace(state.clone(), move |w| {
        brainwave_core::sync::SyncEngine::new(w, &runtime)
            .configure(&remote, &brainwave_core::Identity { name, email })?;
        let store = CredentialStore::new(&runtime);
        if stored.username.is_empty() && stored.token.is_empty() {
            store.clear()
        } else {
            store.save(&stored)
        }
    })
    .await?;
    *state.credentials.lock().map_err(|_| error("io"))? = credentials;
    Ok(())
}
#[tauri::command]
pub async fn test_sync_remote(
    state: State<'_, MobileState>,
    remote: String,
    username: String,
    token: String,
) -> Result<brainwave_core::sync::RemoteProbe> {
    let credentials = merged_credentials(&state, username, token)?;
    tauri::async_runtime::spawn_blocking(move || {
        brainwave_core::sync::probe_remote(&remote, &credentials)
    })
    .await
    .map_err(|_| error("io"))?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredCredentials {
    username: String,
    has_token: bool,
}
#[tauri::command]
pub fn sync_credentials(state: State<'_, MobileState>) -> Result<StoredCredentials> {
    let stored = state.credentials.lock().map_err(|_| error("io"))?;
    Ok(StoredCredentials {
        username: stored.username.clone(),
        has_token: !stored.token.is_empty(),
    })
}
#[tauri::command]
pub fn clear_sync_credentials(state: State<'_, MobileState>) -> Result<()> {
    CredentialStore::new(&state.runtime).clear()?;
    *state.credentials.lock().map_err(|_| error("io"))? = Credentials::default();
    Ok(())
}
#[tauri::command]
pub async fn sync_now(state: State<'_, MobileState>) -> Result<brainwave_core::sync::SyncStatus> {
    let credentials = state.credentials.lock().map_err(|_| error("io"))?.clone();
    let runtime = state.runtime.clone();
    with_workspace(state, move |w| {
        brainwave_core::sync::SyncEngine::new(w, &runtime).sync(&credentials)
    })
    .await
}
#[tauri::command]
pub async fn resolve_conflict(
    state: State<'_, MobileState>,
    key: String,
    choice: String,
) -> Result<brainwave_core::sync::SyncStatus> {
    let runtime = state.runtime.clone();
    with_workspace(state, move |w| {
        brainwave_core::sync::SyncEngine::new(w, &runtime).resolve(&key, &choice)
    })
    .await
}
