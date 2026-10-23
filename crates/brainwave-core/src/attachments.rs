use crate::{Error, Result, Workspace, links};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
};
pub const MAX_ATTACHMENT_BYTES: usize = 20 * 1024 * 1024;
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub name: String,
    pub url: String,
    pub size: usize,
}
#[derive(Serialize, Debug)]
pub struct AttachmentData {
    pub bytes: Vec<u8>,
    pub mime: String,
}
pub(crate) fn asset_path(note: &str) -> String {
    format!("{}.assets", &note[..note.len() - 3])
}
impl Workspace {
    pub fn import_attachment(&self, note: &str, name: &str, bytes: &[u8]) -> Result<Attachment> {
        self.read_note(note)?;
        Self::name(name)?;
        if bytes.len() > MAX_ATTACHMENT_BYTES {
            return Err(Error::new("attachmentTooLarge"));
        }
        let dir = self.resolve(&asset_path(note), false)?;
        fs::create_dir_all(&dir)?;
        for n in 0..10000 {
            let candidate = if n == 0 {
                name.to_owned()
            } else {
                let p = std::path::Path::new(name);
                match (p.file_stem(), p.extension()) {
                    (Some(stem), Some(ext)) => {
                        format!("{} ({n}).{}", stem.to_string_lossy(), ext.to_string_lossy())
                    }
                    _ => format!("{name} ({n})"),
                }
            };
            if self.check_name_available(&dir, &candidate).is_err() {
                continue;
            }
            let path = dir.join(&candidate);
            let mut file = match OpenOptions::new().create_new(true).write(true).open(&path) {
                Ok(v) => v,
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(e.into()),
            };
            if let Err(e) = file.write_all(bytes).and_then(|_| file.sync_all()) {
                let _ = fs::remove_file(path);
                return Err(e.into());
            }
            let asset_name = dir.file_name().unwrap().to_string_lossy();
            return Ok(Attachment {
                name: candidate.clone(),
                url: format!(
                    "./{}/{}",
                    links::encode(&asset_name),
                    links::encode(&candidate)
                ),
                size: bytes.len(),
            });
        }
        Err(Error::new("alreadyExists"))
    }
    pub fn read_attachment(&self, note: &str, url: &str) -> Result<AttachmentData> {
        self.read_note(note)?;
        let relative = links::local_target(note, url).ok_or_else(|| Error::new("unsafePath"))?;
        let owned = format!("{}/", asset_path(note));
        if !relative.starts_with(&owned) {
            return Err(Error::new("unsafePath"));
        }
        let path = self.resolve(&relative, false)?;
        if fs::metadata(&path)?.len() > MAX_ATTACHMENT_BYTES as u64 {
            return Err(Error::new("attachmentTooLarge"));
        }
        let bytes = fs::read(path)?;
        // Never render active SVG/HTML. A raster format must match its magic, not just its extension.
        let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            "image/png"
        } else if bytes.starts_with(b"\xff\xd8\xff") {
            "image/jpeg"
        } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            "image/gif"
        } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
            "image/webp"
        } else {
            "application/octet-stream"
        };
        Ok(AttachmentData {
            bytes,
            mime: mime.into(),
        })
    }
}
impl Workspace {
    pub fn export_attachment(
        &self,
        note: &str,
        url: &str,
        cache: &std::path::Path,
    ) -> Result<std::path::PathBuf> {
        let attachment = self.read_attachment(note, url)?;
        let relative = links::local_target(note, url).ok_or_else(|| Error::new("unsafePath"))?;
        let name = std::path::Path::new(&relative)
            .file_name()
            .ok_or_else(|| Error::new("unsafePath"))?;
        let directory = cache.join(uuid::Uuid::now_v7().to_string());
        fs::create_dir_all(&directory)?;
        let path = directory.join(name);
        crate::atomic::write(&path, &attachment.bytes)?;
        Ok(path)
    }
}
