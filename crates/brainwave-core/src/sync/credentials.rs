//! Encrypted credential file outside the workspace. See DESIGN.md §9.1.1 for the threat model.
use super::Credentials;
use crate::{Error, Result};
use aes_gcm::{
    Aes256Gcm, Key, KeyInit, Nonce,
    aead::{Aead, AeadCore, OsRng},
};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
const NONCE: usize = 12;
pub struct CredentialStore {
    dir: PathBuf,
}
impl CredentialStore {
    pub fn new(runtime: &Path) -> Self {
        Self {
            dir: runtime.to_owned(),
        }
    }
    fn key_path(&self) -> PathBuf {
        self.dir.join("credentials.key")
    }
    fn data_path(&self) -> PathBuf {
        self.dir.join("credentials.bin")
    }
    fn existing_key(&self) -> Option<Aes256Gcm> {
        let bytes = fs::read(self.key_path()).ok()?;
        (bytes.len() == 32).then(|| Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&bytes)))
    }
    fn key(&self) -> Result<Aes256Gcm> {
        if let Some(key) = self.existing_key() {
            return Ok(key);
        }
        let key = Aes256Gcm::generate_key(OsRng);
        private_write(&self.key_path(), key.as_slice())?;
        Ok(Aes256Gcm::new(&key))
    }
    pub fn load(&self) -> Option<Credentials> {
        let raw = fs::read(self.data_path()).ok()?;
        if raw.len() <= NONCE {
            return None;
        }
        let (nonce, sealed) = raw.split_at(NONCE);
        let plain = self
            .existing_key()?
            .decrypt(Nonce::from_slice(nonce), sealed)
            .ok()?;
        serde_json::from_slice(&plain).ok()
    }
    pub fn save(&self, value: &Credentials) -> Result<()> {
        let cipher = self.key()?;
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let plain = serde_json::to_vec(value).map_err(|_| Error::new("io"))?;
        let sealed = cipher
            .encrypt(&nonce, plain.as_slice())
            .map_err(|_| Error::new("io"))?;
        let mut out = nonce.to_vec();
        out.extend_from_slice(&sealed);
        private_write(&self.data_path(), &out)
    }
    pub fn clear(&self) -> Result<()> {
        match fs::remove_file(self.data_path()) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        }
    }
}
fn private_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or_else(|| Error::new("io"))?;
    fs::create_dir_all(parent)?;
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.as_file()
            .set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    file.write_all(bytes)?;
    file.as_file().sync_all()?;
    file.persist(path).map_err(|e| Error::from(e.error))?;
    Ok(())
}
