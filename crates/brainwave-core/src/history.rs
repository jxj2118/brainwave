use crate::{Error, Result, Workspace};
use git2::{Index, IndexEntry, IndexTime, Oid, Repository, Signature};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Component, Path},
};
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct File {
    pub oid: String,
    pub mode: u32,
}
pub(crate) type Files = BTreeMap<String, File>;
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub name: String,
    pub email: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub oid: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
    pub path: Option<String>,
}
pub(crate) fn git<T>(r: std::result::Result<T, git2::Error>) -> Result<T> {
    r.map_err(|_| Error::new("repository"))
}
pub(crate) fn oid(s: &str) -> Result<Oid> {
    git(Oid::from_str(s))
}
pub(crate) fn valid_path(path: &str) -> Result<()> {
    if path.is_empty() || path.contains(['\\', '\0']) || path.len() > 4096 {
        return Err(Error::new("unsafePath"));
    }
    for component in Path::new(path).components() {
        let Component::Normal(v) = component else {
            return Err(Error::new("unsafePath"));
        };
        let v = v.to_str().ok_or_else(|| Error::new("unsafePath"))?;
        if v.eq_ignore_ascii_case(".git")
            || v.eq_ignore_ascii_case(".brainwave")
            || v.ends_with(['.', ' '])
            || v.contains(':')
        {
            return Err(Error::new("unsafePath"));
        }
    }
    Ok(())
}
pub(crate) fn head(repo: &Repository) -> Option<Oid> {
    repo.head().ok()?.target()
}
pub(crate) fn tree_files(repo: &Repository, tree: Oid) -> Result<Files> {
    fn walk(repo: &Repository, tree: git2::Tree<'_>, prefix: &str, out: &mut Files) -> Result<()> {
        for item in tree.iter() {
            let name = item.name().map_err(|_| Error::new("unsafePath"))?;
            let path = if prefix.is_empty() {
                name.to_owned()
            } else {
                format!("{prefix}/{name}")
            };
            valid_path(&path)?;
            match item.kind() {
                Some(git2::ObjectType::Tree) => {
                    walk(repo, git(repo.find_tree(item.id()))?, &path, out)?
                }
                Some(git2::ObjectType::Blob) if [0o100644, 0o100755].contains(&item.filemode()) => {
                    out.insert(
                        path,
                        File {
                            oid: item.id().to_string(),
                            mode: item.filemode() as u32,
                        },
                    );
                }
                _ => return Err(Error::new("unsupportedFiles")),
            }
            if out.len() > 50000 {
                return Err(Error::new("workspaceTooLarge"));
            }
        }
        Ok(())
    }
    let mut result = Files::new();
    walk(repo, git(repo.find_tree(tree))?, "", &mut result)?;
    Ok(result)
}
pub(crate) fn commit_files(repo: &Repository, commit: Oid) -> Result<Files> {
    tree_files(repo, git(repo.find_commit(commit))?.tree_id())
}
pub(crate) fn disk_files(repo: &Repository, root: &Path) -> Result<Files> {
    let tracked = head(repo)
        .map(|h| commit_files(repo, h))
        .transpose()?
        .unwrap_or_default();
    fn walk(
        repo: &Repository,
        root: &Path,
        dir: &Path,
        tracked: &Files,
        out: &mut Files,
        depth: usize,
    ) -> Result<()> {
        if depth > 64 {
            return Err(Error::new("workspaceTooLarge"));
        }
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            if entry.file_name().eq_ignore_ascii_case(".git") {
                continue;
            }
            let relative = entry
                .path()
                .strip_prefix(root)
                .unwrap()
                .to_str()
                .ok_or_else(|| Error::new("unsafePath"))?
                .replace('\\', "/");
            if !tracked.contains_key(&relative)
                && !tracked
                    .keys()
                    .any(|p| p.starts_with(&format!("{relative}/")))
                && git(repo.is_path_ignored(Path::new(&relative)))?
            {
                continue;
            }
            valid_path(&relative)?;
            let meta = entry.metadata()?;
            if entry.file_type()?.is_symlink() {
                return Err(Error::new("unsupportedFiles"));
            }
            if meta.is_dir() {
                walk(repo, root, &entry.path(), tracked, out, depth + 1)?;
            } else if meta.is_file() {
                if meta.len() > 128 * 1024 * 1024 {
                    return Err(Error::new("attachmentTooLarge"));
                }
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
                let mode = tracked.get(&relative).map(|f| f.mode).unwrap_or(0o100644);
                out.insert(
                    relative,
                    File {
                        oid: git(repo.blob_path(&entry.path()))?.to_string(),
                        mode,
                    },
                );
            } else {
                return Err(Error::new("unsupportedFiles"));
            }
            if out.len() > 50000 {
                return Err(Error::new("workspaceTooLarge"));
            }
        }
        Ok(())
    }
    let mut files = Files::new();
    walk(repo, root, root, &tracked, &mut files, 0)?;
    Ok(files)
}
pub(crate) fn write_tree(repo: &Repository, files: &Files) -> Result<Oid> {
    let mut index = git(Index::new())?;
    let mut folded = BTreeSet::new();
    let mut prefixes = BTreeMap::<String, (String, bool)>::new();
    // Index::add removes conflicting ancestor entries; validate before calling it.
    for path in files.keys() {
        let parts: Vec<_> = path.split('/').collect();
        for n in 1..=parts.len() {
            let prefix = parts[..n].join("/");
            let directory = n < parts.len();
            if let Some((existing, is_dir)) = prefixes.get(&prefix.to_lowercase()) {
                if existing != &prefix || *is_dir != directory || !directory {
                    return Err(Error::new("pathCollision"));
                }
            } else {
                prefixes.insert(prefix.to_lowercase(), (prefix, directory));
            }
        }
    }
    for (path, file) in files {
        valid_path(path)?;
        if !folded.insert(path.to_lowercase()) {
            return Err(Error::new("pathCollision"));
        }
        let entry = IndexEntry {
            ctime: IndexTime::new(0, 0),
            mtime: IndexTime::new(0, 0),
            dev: 0,
            ino: 0,
            mode: file.mode,
            uid: 0,
            gid: 0,
            file_size: 0,
            id: oid(&file.oid)?,
            flags: 0,
            flags_extended: 0,
            path: path.as_bytes().to_vec(),
        };
        git(index.add(&entry))?;
    }
    git(index.write_tree_to(repo))
}
pub(crate) fn signature<'a>(repo: &Repository, identity: &'a Identity) -> Result<Signature<'a>> {
    if let Ok(sig) = repo.signature() {
        return Ok(sig);
    }
    if identity.name.trim().is_empty() || identity.email.trim().is_empty() {
        return Err(Error::new("identityRequired"));
    }
    Signature::now(identity.name.trim(), identity.email.trim())
        .map_err(|_| Error::new("identityRequired"))
}
pub(crate) fn ensure_clean(repo: &Repository) -> Result<()> {
    if repo.state() != git2::RepositoryState::Clean || git(repo.index())?.has_conflicts() {
        return Err(Error::new("externalGitOperation"));
    }
    if repo.head().is_ok_and(|head| !head.is_branch()) {
        return Err(Error::new("branchMismatch"));
    }
    Ok(())
}
impl Workspace {
    pub fn checkpoint(&self, identity: &Identity) -> Result<Option<String>> {
        self.checkpoint_inner(identity, false)
    }
    pub(crate) fn checkpoint_inner(
        &self,
        identity: &Identity,
        allow_pending: bool,
    ) -> Result<Option<String>> {
        let repo = git(Repository::open(&self.root))?;
        ensure_clean(&repo)?;
        if !allow_pending && repo.find_reference("refs/brainwave/pending-remote").is_ok() {
            return Err(Error::new("conflictsPending"));
        }
        let files = disk_files(&repo, &self.root)?;
        let tree = write_tree(&repo, &files)?;
        let parent = head(&repo).map(|h| git(repo.find_commit(h))).transpose()?;
        if parent.as_ref().is_some_and(|c| c.tree_id() == tree)
            || (parent.is_none() && files.is_empty())
        {
            return Ok(None);
        }
        let sig = signature(&repo, identity)?;
        let parents: Vec<_> = parent.iter().collect();
        Ok(Some(
            git(repo.commit(
                Some("HEAD"),
                &sig,
                &sig,
                "brainwave: snapshot",
                &git(repo.find_tree(tree))?,
                &parents,
            ))?
            .to_string(),
        ))
    }
    pub fn history(&self, path: Option<&str>) -> Result<Vec<HistoryEntry>> {
        let repo = git(Repository::open(&self.root))?;
        if let Some(path) = path {
            return crate::history_note::list(&repo, self, path);
        }
        let Some(head) = head(&repo) else {
            return Ok(vec![]);
        };
        let mut walk = git(repo.revwalk())?;
        git(walk.push(head))?;
        git(walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME))?;
        walk.take(100)
            .map(|id| {
                let commit = git(repo.find_commit(git(id)?))?;
                Ok(HistoryEntry {
                    oid: commit.id().to_string(),
                    message: commit.summary().ok().flatten().unwrap_or("").into(),
                    author: commit.author().name().unwrap_or("").into(),
                    timestamp: commit.time().seconds(),
                    path: None,
                })
            })
            .collect()
    }
    pub fn version(&self, commit: &str, path: &str) -> Result<String> {
        valid_path(path)?;
        let repo = git(Repository::open(&self.root))?;
        let files = commit_files(&repo, oid(commit)?)?;
        let file = files.get(path).ok_or_else(|| Error::new("notFound"))?;
        let blob = git(repo.find_blob(oid(&file.oid)?))?;
        if blob.size() > 8 * 1024 * 1024 {
            return Err(Error::new("noteTooLarge"));
        }
        Ok(std::str::from_utf8(blob.content())
            .map_err(|_| Error::new("invalidEncoding"))?
            .into())
    }
}
