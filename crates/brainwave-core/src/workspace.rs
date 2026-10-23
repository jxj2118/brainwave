use crate::{Entry, Error, Note, Result, markdown::Document};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
};

const MAX_NOTE_BYTES: u64 = 8 * 1024 * 1024;
pub struct Workspace {
    pub(crate) root: PathBuf,
}
impl Workspace {
    pub fn init(root: &Path) -> Result<Self> {
        crate::sync::initialize_transport()?;
        if root.join(".git").exists() {
            return Self::open(root);
        }
        fs::create_dir_all(root)?;
        let mut options = git2::RepositoryInitOptions::new();
        options.initial_head("main");
        git2::Repository::init_opts(root, &options).map_err(|_| Error::new("repository"))?;
        Self::open(root)
    }
    pub fn open(root: &Path) -> Result<Self> {
        crate::sync::initialize_transport()?;
        let root = root.canonicalize()?;
        if fs::symlink_metadata(root.join(".git"))?
            .file_type()
            .is_symlink()
        {
            return Err(Error::new("unsafePath"));
        }
        let repo = git2::Repository::open(&root).map_err(|_| Error::new("repository"))?;
        if repo.is_bare()
            || repo.workdir().and_then(|p| p.canonicalize().ok()).as_ref() != Some(&root)
        {
            return Err(Error::new("repository"));
        }
        Ok(Self { root })
    }
    pub(crate) fn resolve(&self, relative: &str, allow_root: bool) -> Result<PathBuf> {
        if relative.is_empty() {
            return if allow_root {
                Ok(self.root.clone())
            } else {
                Err(Error::new("unsafePath"))
            };
        }
        if relative.contains('\\') || relative.contains('\0') {
            return Err(Error::new("unsafePath"));
        }
        let mut path = self.root.clone();
        for component in Path::new(relative).components() {
            let Component::Normal(part) = component else {
                return Err(Error::new("unsafePath"));
            };
            if part.to_string_lossy().starts_with('.') {
                return Err(Error::new("unsafePath"));
            }
            path.push(part);
            match fs::symlink_metadata(&path) {
                Ok(meta) if meta.file_type().is_symlink() => return Err(Error::new("unsafePath")),
                Ok(_) => (),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                Err(e) => return Err(e.into()),
            }
        }
        Ok(path)
    }
    pub(crate) fn name(name: &str) -> Result<()> {
        let stem = name.split('.').next().unwrap_or("").to_uppercase();
        if name.is_empty()
            || name != name.trim()
            || name.len() > 180
            || name.starts_with('.')
            || name.ends_with('.')
            || name
                .chars()
                .any(|c| c.is_control() || "/\\:*?\"<>|".contains(c))
            || [
                "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
                "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
                "LPT9",
            ]
            .contains(&stem.as_str())
        {
            return Err(Error::new("invalidName"));
        }
        Ok(())
    }
    pub fn scan(&self) -> Result<Vec<Entry>> {
        let mut entries = vec![];
        self.scan_directory(&self.root, &mut entries, 0)?;
        let mut counts = HashMap::<String, usize>::new();
        for entry in &entries {
            if let Some(id) = &entry.id {
                *counts.entry(id.clone()).or_default() += 1;
            }
        }
        for entry in &mut entries {
            entry.identity_collision = entry
                .id
                .as_ref()
                .is_some_and(|id| counts.get(id).is_some_and(|n| *n > 1));
        }
        entries.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(entries)
    }
    fn scan_directory(
        &self,
        directory: &Path,
        entries: &mut Vec<Entry>,
        depth: usize,
    ) -> Result<()> {
        if depth > 64 || entries.len() > 50_000 {
            return Err(Error::new("workspaceTooLarge"));
        }
        for item in fs::read_dir(directory)? {
            let item = item?;
            let name = item.file_name().to_string_lossy().into_owned();
            let kind = item.file_type()?;
            if name.starts_with('.') || kind.is_symlink() {
                continue;
            }
            let path = item
                .path()
                .strip_prefix(&self.root)
                .map_err(|_| Error::new("unsafePath"))?
                .to_string_lossy()
                .replace('\\', "/");
            if kind.is_dir() {
                if name.ends_with(".assets") {
                    continue;
                }
                entries.push(Entry {
                    path,
                    name,
                    kind: "folder".into(),
                    id: None,
                    identity_collision: false,
                    issue: None,
                });
                self.scan_directory(&item.path(), entries, depth + 1)?;
            } else if kind.is_file() && name.to_ascii_lowercase().ends_with(".md") {
                let (id, issue) = match self.read_note(&path) {
                    Ok(note) => (note.id, None),
                    Err(error) => (None, Some(error.code)),
                };
                entries.push(Entry {
                    path,
                    name: name[..name.len() - 3].into(),
                    kind: "note".into(),
                    id,
                    identity_collision: false,
                    issue,
                });
            }
        }
        Ok(())
    }
    pub fn read_note(&self, relative: &str) -> Result<Note> {
        if !relative.to_ascii_lowercase().ends_with(".md") {
            return Err(Error::new("unsafePath"));
        }
        let path = self.resolve(relative, false)?;
        if fs::metadata(&path)?.len() > MAX_NOTE_BYTES {
            return Err(Error::new("noteTooLarge"));
        }
        let text = fs::read_to_string(path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::InvalidData {
                Error::new("invalidEncoding")
            } else {
                e.into()
            }
        })?;
        let doc = Document::parse(&text);
        Ok(Note {
            path: relative.into(),
            body: doc.body.into(),
            revision: hash(&text),
            id: doc.id(),
        })
    }
    pub fn create_note(&self, folder: &str, name: &str) -> Result<Note> {
        Self::name(name)?;
        let parent = self.resolve(folder, true)?;
        if !parent.is_dir() {
            return Err(Error::new("notFound"));
        }
        let filename = if name.to_ascii_lowercase().ends_with(".md") {
            name.to_owned()
        } else {
            format!("{name}.md")
        };
        self.check_name_available(&parent, &filename)?;
        let relative = if folder.is_empty() {
            filename.clone()
        } else {
            format!("{folder}/{filename}")
        };
        let text = format!(
            "---\nid: {}\ncreated_at: {}\n---\n",
            uuid::Uuid::now_v7(),
            chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
        );
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(parent.join(filename))?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        self.read_note(&relative)
    }
    pub fn create_folder(&self, folder: &str, name: &str) -> Result<()> {
        Self::name(name)?;
        if name.ends_with(".assets") {
            return Err(Error::new("invalidName"));
        }
        let parent = self.resolve(folder, true)?;
        self.check_name_available(&parent, name)?;
        fs::create_dir(parent.join(name))?;
        Ok(())
    }
    pub(crate) fn check_name_available(&self, parent: &Path, name: &str) -> Result<()> {
        if fs::read_dir(parent)?.any(|e| {
            e.is_ok_and(|e| e.file_name().to_string_lossy().to_lowercase() == name.to_lowercase())
        }) {
            return Err(Error::new("alreadyExists"));
        }
        Ok(())
    }
    pub fn save_note(&self, relative: &str, body: &str, expected_revision: &str) -> Result<Note> {
        if body.len() as u64 > MAX_NOTE_BYTES {
            return Err(Error::new("noteTooLarge"));
        }
        let current = self.read_note(relative)?;
        if current.revision != expected_revision {
            return Err(Error::new("externalChange"));
        }
        let path = self.resolve(relative, false)?;
        let original = fs::read_to_string(&path)?;
        if hash(&original) != expected_revision {
            return Err(Error::new("externalChange"));
        }
        if current.body == body {
            return Ok(current);
        }
        let updated = Document::parse(&original).with_body(body)?;
        if updated.len() as u64 > MAX_NOTE_BYTES {
            return Err(Error::new("noteTooLarge"));
        }
        // Stage outside the user's repository on the same filesystem; no runtime files in the workspace.
        let mut temp = tempfile::NamedTempFile::new_in(
            self.root.parent().ok_or_else(|| Error::new("unsafePath"))?,
        )?;
        temp.write_all(updated.as_bytes())?;
        temp.as_file()
            .set_permissions(fs::metadata(&path)?.permissions())?;
        temp.as_file().sync_all()?;
        if hash(&fs::read_to_string(&path)?) != expected_revision {
            return Err(Error::new("externalChange"));
        }
        temp.persist(&path).map_err(|e| Error::from(e.error))?;
        let doc = Document::parse(&updated);
        Ok(Note {
            path: relative.into(),
            body: doc.body.into(),
            revision: hash(&updated),
            id: doc.id(),
        })
    }
}
pub(crate) fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
