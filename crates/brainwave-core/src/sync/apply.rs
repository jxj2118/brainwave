use crate::{
    Error, Result, Workspace,
    history::{File, Files, commit_files, git, head, oid, valid_path},
};
use git2::{Oid, Repository};
use std::{fs, io::Write, path::Path};
const SOURCE: &str = "refs/brainwave/apply-source";
const TARGET: &str = "refs/brainwave/apply-target";
fn check_path(root: &Path, relative: &str) -> Result<()> {
    valid_path(relative)?;
    let mut p = root.to_owned();
    for part in Path::new(relative).components() {
        p.push(part);
        match fs::symlink_metadata(&p) {
            Ok(meta) if meta.file_type().is_symlink() => return Err(Error::new("unsafePath")),
            Ok(_) => (),
            Err(e)
                if e.kind() == std::io::ErrorKind::NotFound
                    || e.kind() == std::io::ErrorKind::NotADirectory => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(())
}
fn current(repo: &Repository, root: &Path, path: &str) -> Result<Option<File>> {
    check_path(root, path)?;
    let p = root.join(path);
    match fs::metadata(&p) {
        Ok(meta) if meta.is_file() => {
            #[cfg(unix)]
            let mode = {
                use std::os::unix::fs::PermissionsExt;
                if meta.permissions().mode() & 0o111 != 0 {
                    0o100755
                } else {
                    0o100644
                }
            };
            #[cfg(not(unix))]
            let mode = 0o100644;
            Ok(Some(File {
                oid: git(repo.blob_path(&p))?.to_string(),
                mode,
            }))
        }
        Ok(_) => Ok(None),
        Err(e)
            if e.kind() == std::io::ErrorKind::NotFound
                || e.kind() == std::io::ErrorKind::NotADirectory =>
        {
            Ok(None)
        }
        Err(e) => Err(e.into()),
    }
}
fn install(repo: &Repository, w: &Workspace, before: &Files, after: &Files) -> Result<()> {
    let paths: std::collections::BTreeSet<_> = before.keys().chain(after.keys()).cloned().collect();
    // Preflight the entire operation. Every current byte must be an expected old or already-installed new byte.
    for path in &paths {
        let current = current(repo, &w.root, path)?;
        let old = before.get(path).cloned();
        let new = after.get(path).cloned();
        if current != old && current != new {
            return Err(Error::new("externalChange"));
        }
    }
    let mut deletes: Vec<_> = before.keys().filter(|p| !after.contains_key(*p)).collect();
    deletes.sort_by_key(|p| std::cmp::Reverse(p.len()));
    for path in deletes {
        let full = w.root.join(path);
        if full.is_file() {
            if current(repo, &w.root, path)? != before.get(path).cloned() {
                return Err(Error::new("externalChange"));
            }
            fs::remove_file(&full)?;
        }
        let mut parent = full.parent();
        while let Some(dir) = parent {
            if dir == w.root {
                break;
            }
            if fs::remove_dir(dir).is_err() {
                break;
            }
            parent = dir.parent();
        }
    }
    for (path, file) in after {
        let p = w.root.join(path);
        let current = current(repo, &w.root, path)?;
        if current.as_ref() == Some(file) {
            continue;
        }
        if current != before.get(path).cloned() {
            return Err(Error::new("externalChange"));
        }
        if p.is_dir() {
            fs::remove_dir(&p).map_err(|_| Error::new("externalChange"))?;
        }
        fs::create_dir_all(p.parent().unwrap())?;
        check_path(&w.root, path)?;
        let blob = git(repo.find_blob(oid(&file.oid)?))?;
        // Stage outside the user's working copy, on the same volume as the destination.
        let mut temp = tempfile::NamedTempFile::new_in(w.root.parent().unwrap())?;
        temp.write_all(blob.content())?;
        temp.as_file().sync_all()?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            temp.as_file().set_permissions(fs::Permissions::from_mode(
                if file.mode == 0o100755 { 0o755 } else { 0o644 },
            ))?;
        }
        if current != self::current(repo, &w.root, path)? {
            return Err(Error::new("externalChange"));
        }
        temp.persist(&p).map_err(|e| Error::from(e.error))?;
    }
    Ok(())
}
pub(crate) fn apply(repo: &Repository, w: &Workspace, target: Oid) -> Result<()> {
    let source = head(repo);
    if source == Some(target) {
        return Ok(());
    }
    // Standard Git refs protect all before/after content, even if disposable runtime data is removed.
    git(repo.reference(
        SOURCE,
        source.unwrap_or(target),
        true,
        "brainwave: preserve install source",
    ))?;
    git(repo.reference(TARGET, target, true, "brainwave: preserve install target"))?;
    recover(repo, w)
}
pub(crate) fn recover(repo: &Repository, w: &Workspace) -> Result<()> {
    let Ok(target_ref) = repo.find_reference(TARGET) else {
        return Ok(());
    };
    let target = target_ref
        .target()
        .ok_or_else(|| Error::new("recoveryRequired"))?;
    let source = git(repo.find_reference(SOURCE))?
        .target()
        .ok_or_else(|| Error::new("recoveryRequired"))?;
    let current_head = head(repo);
    if current_head != Some(source) && current_head != Some(target) && current_head.is_some() {
        return Err(Error::new("externalChange"));
    }
    let before = if source == target {
        Files::new()
    } else {
        commit_files(repo, source)?
    };
    let after = commit_files(repo, target)?;
    install(repo, w, &before, &after)?;
    let name = repo
        .head()
        .ok()
        .and_then(|h| h.name().ok().map(str::to_owned))
        .unwrap_or_else(|| {
            repo.find_reference("HEAD")
                .ok()
                .and_then(|r| r.symbolic_target().ok().flatten().map(str::to_owned))
                .unwrap_or_else(|| "refs/heads/main".into())
        });
    if !name.starts_with("refs/heads/") {
        return Err(Error::new("branchMismatch"));
    }
    git(repo.reference(&name, target, true, "brainwave: integrate changes"))?;
    git(repo.find_reference(TARGET))?
        .delete()
        .map_err(|_| Error::new("repository"))?;
    git(repo.find_reference(SOURCE))?
        .delete()
        .map_err(|_| Error::new("repository"))?;
    Ok(())
}
