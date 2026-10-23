use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Draft {
    pub path: String,
    pub body: String,
    pub revision: String,
}
pub struct DraftStore {
    root: PathBuf,
}
impl DraftStore {
    pub fn new(root: &Path) -> Self {
        Self { root: root.into() }
    }
    fn file(&self, path: &str) -> PathBuf {
        use sha2::{Digest, Sha256};
        self.root
            .join(format!("{:x}.json", Sha256::digest(path.as_bytes())))
    }
    pub fn read(&self, path: &str) -> Result<Option<Draft>> {
        let bytes = match fs::read(self.file(path)) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.into()),
        };
        let draft: Draft = serde_json::from_slice(&bytes).map_err(|_| Error::new("io"))?;
        Ok((draft.path == path).then_some(draft))
    }
    pub fn write(&self, value: &Draft) -> Result<()> {
        fs::create_dir_all(&self.root)?;
        let mut file = tempfile::NamedTempFile::new_in(&self.root)?;
        file.write_all(&serde_json::to_vec(value).map_err(|_| Error::new("io"))?)?;
        file.as_file().sync_all()?;
        file.persist(self.file(&value.path))
            .map_err(|e| Error::from(e.error))?;
        Ok(())
    }
    pub fn clear(&self, path: &str) -> Result<()> {
        match fs::remove_file(self.file(path)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}
