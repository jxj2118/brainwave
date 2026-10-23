use crate::commands::MobileState;
use brainwave_core::Error;
use tauri::{Manager, State};
#[cfg(target_os = "android")]
pub struct NativeFiles<R: tauri::Runtime>(tauri::plugin::PluginHandle<R>);
#[cfg(target_os = "android")]
pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("attachments")
        .setup(|app, api| {
            let handle =
                api.register_android_plugin("com.lor4ai.brainwave", "AttachmentsPlugin")?;
            app.manage(NativeFiles(handle));
            Ok(())
        })
        .build()
}
#[tauri::command]
pub async fn open_attachment(
    app: tauri::AppHandle,
    state: State<'_, MobileState>,
    note: String,
    url: String,
) -> Result<(), Error> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|_| Error { code: "io".into() })?
        .join("attachment-preview");
    let workspace = state.workspace.clone();
    let path = tauri::async_runtime::spawn_blocking(move || {
        workspace
            .lock()
            .map_err(|_| Error { code: "io".into() })?
            .export_attachment(&note, &url, &cache)
    })
    .await
    .map_err(|_| Error { code: "io".into() })??;
    #[cfg(target_os = "android")]
    {
        app.state::<NativeFiles<tauri::Wry>>()
            .0
            .run_mobile_plugin::<serde_json::Value>("open", serde_json::json!({"path":path}))
            .map_err(|_| Error {
                code: "attachmentUnavailable".into(),
            })?;
    }
    #[cfg(target_os = "ios")]
    {
        let path =
            std::ffi::CString::new(path.to_string_lossy().as_bytes()).map_err(|_| Error {
                code: "unsafePath".into(),
            })?;
        let (sender, receiver) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            unsafe extern "C" {
                fn brainwave_open_attachment(path: *const std::ffi::c_char) -> bool;
            }
            // SAFETY: the UTF-8 CString outlives the synchronous call on the main thread.
            let opened = unsafe { brainwave_open_attachment(path.as_ptr()) };
            let _ = sender.send(opened);
        })
        .map_err(|_| Error {
            code: "attachmentUnavailable".into(),
        })?;
        let opened = tauri::async_runtime::spawn_blocking(move || {
            receiver.recv_timeout(std::time::Duration::from_secs(5))
        })
        .await
        .map_err(|_| Error {
            code: "attachmentUnavailable".into(),
        })?
        .unwrap_or(false);
        if !opened {
            return Err(Error {
                code: "attachmentUnavailable".into(),
            });
        }
    }
    #[cfg(not(mobile))]
    {
        let _ = path;
        Err(Error {
            code: "attachmentUnavailable".into(),
        })
    }
    #[cfg(mobile)]
    Ok(())
}
