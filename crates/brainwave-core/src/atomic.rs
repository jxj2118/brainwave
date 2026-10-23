use crate::{Error, Result};
use std::{fs, io::Write, path::Path};
pub(crate) fn write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or_else(|| Error::new("unsafePath"))?;
    fs::create_dir_all(parent)?;
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    file.write_all(bytes)?;
    file.as_file().sync_all()?;
    file.persist(path).map_err(|e| Error::from(e.error))?;
    Ok(())
}
pub(crate) fn json(path: &Path, value: &impl serde::Serialize) -> Result<()> {
    write(
        path,
        &serde_json::to_vec(value).map_err(|_| Error::new("io"))?,
    )
}

pub(crate) fn replace_outside(path: &Path, bytes: &[u8], staging: &Path) -> Result<()> {
    let mut file = tempfile::NamedTempFile::new_in(staging)?;
    file.write_all(bytes)?;
    if let Ok(meta) = fs::metadata(path) {
        file.as_file().set_permissions(meta.permissions())?;
    }
    file.as_file().sync_all()?;
    file.persist(path).map_err(|e| Error::from(e.error))?;
    Ok(())
}
