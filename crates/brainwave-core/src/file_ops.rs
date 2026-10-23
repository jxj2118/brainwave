use crate::{Error, Result, Workspace, atomic, attachments::asset_path, links};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Component, Path, PathBuf},
};
type Rewrite = (PathBuf, String, String);
#[derive(Serialize, Deserialize)]
struct Operation {
    root: PathBuf,
    moves: Vec<(PathBuf, PathBuf)>,
    // Read the original journal shape when recovering an earlier interrupted operation.
    #[serde(default)]
    rewrite: Option<Rewrite>,
    #[serde(default)]
    rewrites: Vec<Rewrite>,
}
impl Operation {
    fn patches(&self) -> impl Iterator<Item = &Rewrite> {
        self.rewrite.iter().chain(self.rewrites.iter())
    }
}
fn safe_tree(path: &Path) -> Result<()> {
    fn walk(path: &Path, depth: usize, count: &mut usize) -> Result<()> {
        *count += 1;
        if depth > 64 || *count > 50000 {
            return Err(Error::new("workspaceTooLarge"));
        }
        let meta = fs::symlink_metadata(path)?;
        if meta.file_type().is_symlink() {
            return Err(Error::new("unsafePath"));
        }
        if meta.is_dir() {
            for child in fs::read_dir(path)? {
                walk(&child?.path(), depth + 1, count)?;
            }
        } else if !meta.is_file() {
            return Err(Error::new("unsafePath"));
        }
        Ok(())
    }
    walk(path, 0, &mut 0)
}
fn rename_new(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir_all(to.parent().ok_or_else(|| Error::new("unsafePath"))?)?;
    // Refuse replacement atomically, including a destination created by another
    // editor after preflight. A check followed by std::fs::rename can overwrite it.
    #[cfg(any(target_vendor = "apple", target_os = "linux", target_os = "android"))]
    {
        use std::{ffi::CString, os::unix::ffi::OsStrExt};
        let from =
            CString::new(from.as_os_str().as_bytes()).map_err(|_| Error::new("unsafePath"))?;
        let to = CString::new(to.as_os_str().as_bytes()).map_err(|_| Error::new("unsafePath"))?;
        #[cfg(target_vendor = "apple")]
        // SAFETY: Both C strings remain alive and are terminated, and flags are valid.
        let result = unsafe { libc::renamex_np(from.as_ptr(), to.as_ptr(), libc::RENAME_EXCL) };
        #[cfg(any(target_os = "linux", target_os = "android"))]
        // SAFETY: renameat2 takes these directory descriptors, live C strings and flags.
        let result = unsafe {
            libc::syscall(
                libc::SYS_renameat2,
                libc::AT_FDCWD,
                from.as_ptr(),
                libc::AT_FDCWD,
                to.as_ptr(),
                libc::RENAME_NOREPLACE,
            )
        };
        if result != 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        Ok(())
    }
    #[cfg(windows)]
    {
        // Windows rename already fails if the destination exists.
        fs::rename(from, to)?;
        Ok(())
    }
    #[cfg(not(any(
        target_vendor = "apple",
        target_os = "linux",
        target_os = "android",
        windows
    )))]
    {
        Err(Error::new("unsafePath"))
    }
}
impl Workspace {
    fn runtime_safe(&self, runtime: &Path) -> Result<()> {
        if !runtime.is_absolute()
            || runtime
                .components()
                .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
        {
            return Err(Error::new("unsafePath"));
        }
        let ancestor = runtime
            .ancestors()
            .find(|p| p.exists())
            .ok_or_else(|| Error::new("unsafePath"))?
            .canonicalize()?;
        if ancestor.starts_with(&self.root) {
            return Err(Error::new("unsafePath"));
        }
        Ok(())
    }
    fn validate_operation(&self, runtime: &Path, op: &Operation) -> Result<()> {
        if op.root != self.root {
            return Err(Error::new("recoveryRequired"));
        }
        let inside = |path: &Path| -> Result<()> {
            let relative = path
                .strip_prefix(&self.root)
                .map_err(|_| Error::new("unsafePath"))?;
            self.resolve(
                relative.to_str().ok_or_else(|| Error::new("unsafePath"))?,
                false,
            )?;
            Ok(())
        };
        for (from, to) in &op.moves {
            inside(from)?;
            if to.starts_with(&self.root) {
                inside(to)?;
            } else {
                let suffix = to
                    .strip_prefix(runtime.join("deleted"))
                    .map_err(|_| Error::new("unsafePath"))?;
                if suffix
                    .components()
                    .any(|c| !matches!(c, Component::Normal(_)))
                {
                    return Err(Error::new("unsafePath"));
                }
                // Runtime paths must not lead through a symlink either.
                let mut path = runtime.to_owned();
                for part in Path::new("deleted").join(suffix).components() {
                    path.push(part);
                    if fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) {
                        return Err(Error::new("unsafePath"));
                    }
                }
            }
        }
        for (path, _, _) in op.patches() {
            inside(path)?;
        }
        Ok(())
    }
    pub fn recover_file_operation(&self, runtime: &Path) -> Result<()> {
        self.runtime_safe(runtime)?;
        let journal = runtime.join("file-operation.json");
        if !journal.exists() {
            return Ok(());
        }
        let op: Operation = serde_json::from_slice(&fs::read(&journal)?)
            .map_err(|_| Error::new("recoveryRequired"))?;
        self.validate_operation(runtime, &op)?;
        for (from, to) in &op.moves {
            if from.exists() && !to.exists() {
                safe_tree(from)?;
                rename_new(from, to)?;
            } else if from.exists() || !to.exists() {
                return Err(Error::new("recoveryRequired"));
            }
        }
        for (path, old, new) in op.patches() {
            let current = fs::read_to_string(path)?;
            if &current == old {
                atomic::replace_outside(path, new.as_bytes(), self.root.parent().unwrap())?;
            } else if &current != new {
                return Err(Error::new("externalChange"));
            }
        }
        fs::remove_file(journal)?;
        Ok(())
    }
    fn execute_operation(&self, runtime: &Path, op: Operation) -> Result<()> {
        self.recover_file_operation(runtime)?;
        self.validate_operation(runtime, &op)?;
        let journal = runtime.join("file-operation.json");
        atomic::json(&journal, &op)?;
        let mut moved = Vec::new();
        let mut written = Vec::new();
        let result = (|| {
            for (from, to) in &op.moves {
                rename_new(from, to)?;
                moved.push((from, to));
            }
            for (path, old, new) in op.patches() {
                if fs::read_to_string(path)? != *old {
                    return Err(Error::new("externalChange"));
                }
                atomic::replace_outside(path, new.as_bytes(), self.root.parent().unwrap())?;
                written.push((path, old, new));
            }
            Ok(())
        })();
        if result.is_err() {
            let mut complete = true;
            for (path, old, new) in written.into_iter().rev() {
                if fs::read_to_string(path).is_ok_and(|current| current == *new)
                    && atomic::replace_outside(path, old.as_bytes(), self.root.parent().unwrap())
                        .is_err()
                {
                    complete = false;
                }
            }
            for (from, to) in moved.into_iter().rev() {
                if rename_new(to, from).is_err() {
                    complete = false;
                }
            }
            if !complete {
                return Err(Error::new("recoveryRequired"));
            }
        }
        fs::remove_file(journal)?;
        result
    }
    pub fn move_entry(
        &self,
        runtime: &Path,
        path: &str,
        folder: &str,
        name: &str,
        expected_revision: Option<&str>,
    ) -> Result<String> {
        self.recover_file_operation(runtime)?;
        Self::name(name)?;
        let source = self.resolve(path, false)?;
        safe_tree(&source)?;
        let is_note = source.is_file();
        let name = if is_note && !name.to_ascii_lowercase().ends_with(".md") {
            format!("{name}.md")
        } else {
            name.into()
        };
        if !is_note && (name.ends_with(".assets") || path.ends_with(".assets")) {
            return Err(Error::new("invalidName"));
        }
        let parent = self.resolve(folder, true)?;
        if !parent.is_dir() || parent.starts_with(&source) {
            return Err(Error::new("unsafePath"));
        }
        let new = if folder.is_empty() {
            name.clone()
        } else {
            format!("{folder}/{name}")
        };
        if path == new {
            return Ok(new);
        }
        self.check_name_available(&parent, &name)?;
        let target = self.resolve(&new, false)?;
        let mut moves = vec![(source.clone(), target.clone())];
        let mut rewrites = Vec::new();
        if is_note {
            let note = self.read_note(path)?;
            if expected_revision != Some(note.revision.as_str()) {
                return Err(Error::new("externalChange"));
            }
            let old = fs::read_to_string(&source)?;
            if crate::workspace::hash(&old) != note.revision {
                return Err(Error::new("externalChange"));
            }
            let updated = links::rewrite(&old, path, &new);
            rewrites.push((target, old, updated));
            let assets = self.resolve(&asset_path(path), false)?;
            let destination = self.resolve(&asset_path(&new), false)?;
            self.check_name_available(
                destination.parent().unwrap(),
                destination.file_name().unwrap().to_str().unwrap(),
            )?;
            if assets.exists() {
                if !assets.is_dir() {
                    return Err(Error::new("unsafePath"));
                }
                safe_tree(&assets)?;
                moves.push((assets, destination));
            }
        } else {
            let mut patch_bytes = 0;
            for entry in self
                .scan()?
                .into_iter()
                .filter(|e| e.kind == "note" && e.path.starts_with(&format!("{path}/")))
            {
                let old = fs::read_to_string(self.resolve(&entry.path, false)?)?;
                let destination = format!("{new}{}", &entry.path[path.len()..]);
                let updated = links::rewrite_folder(&old, &entry.path, &destination, path, &new);
                if old != updated {
                    patch_bytes += old.len() + updated.len();
                    if patch_bytes > 64 * 1024 * 1024 {
                        return Err(Error::new("workspaceTooLarge"));
                    }
                    rewrites.push((self.resolve(&destination, false)?, old, updated));
                }
            }
        }
        self.execute_operation(
            runtime,
            Operation {
                root: self.root.clone(),
                moves,
                rewrite: None,
                rewrites,
            },
        )?;
        Ok(new)
    }
    pub fn delete_entry(
        &self,
        runtime: &Path,
        path: &str,
        expected_revision: Option<&str>,
    ) -> Result<()> {
        self.recover_file_operation(runtime)?;
        let source = self.resolve(path, false)?;
        safe_tree(&source)?;
        let trash = runtime
            .join("deleted")
            .join(uuid::Uuid::now_v7().to_string());
        let mut moves = vec![(source.clone(), trash.join("entry"))];
        if source.is_file() {
            let note = self.read_note(path)?;
            if expected_revision != Some(note.revision.as_str()) {
                return Err(Error::new("externalChange"));
            }
            let assets = self.resolve(&asset_path(path), false)?;
            if assets.exists() {
                if !assets.is_dir() {
                    return Err(Error::new("unsafePath"));
                }
                safe_tree(&assets)?;
                moves.push((assets, trash.join("assets")));
            }
        } else if path.ends_with(".assets") {
            return Err(Error::new("unsafePath"));
        }
        self.execute_operation(
            runtime,
            Operation {
                root: self.root.clone(),
                moves,
                rewrite: None,
                rewrites: vec![],
            },
        )
    }
}
