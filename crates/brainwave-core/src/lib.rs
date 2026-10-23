mod history;
mod history_note;
pub use history::{HistoryEntry, Identity};
mod atomic;
mod attachments;
mod file_ops;
mod links;
pub mod sync;
pub use attachments::{Attachment, AttachmentData};
mod drafts;
pub use drafts::{Draft, DraftStore};
mod markdown;
mod workspace;
use serde::{Deserialize, Serialize};
pub use workspace::Workspace;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub path: String,
    pub body: String,
    pub revision: String,
    pub id: Option<String>,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub id: Option<String>,
    pub identity_collision: bool,
    pub issue: Option<String>,
}
#[derive(Debug, Serialize)]
pub struct Error {
    pub code: String,
}
impl Error {
    pub(crate) fn new(code: &str) -> Self {
        Self { code: code.into() }
    }
}
impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Self::new(match e.kind() {
            std::io::ErrorKind::AlreadyExists => "alreadyExists",
            std::io::ErrorKind::NotFound => "notFound",
            std::io::ErrorKind::PermissionDenied => "permissionDenied",
            _ => "io",
        })
    }
}
pub type Result<T> = std::result::Result<T, Error>;
