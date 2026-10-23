use crate::{
    Error, HistoryEntry, Result, Workspace,
    history::{File, Files, commit_files, git, head, oid},
    markdown::Document,
};
use git2::{Commit, Oid, Repository};
use std::collections::{BTreeMap, BTreeSet};
fn identity(repo: &Repository, file: &File) -> Option<String> {
    let blob = repo.find_blob(oid(&file.oid).ok()?).ok()?;
    Document::parse(std::str::from_utf8(blob.content()).ok()?).id()
}
fn matching_id(repo: &Repository, files: &Files, id: &str) -> Result<Option<String>> {
    let mut matches = files
        .iter()
        .filter(|(path, _)| path.to_ascii_lowercase().ends_with(".md"))
        .filter(|&(_path, file)| identity(repo, file).as_deref() == Some(id))
        .map(|(path, _file)| path.clone());
    let first = matches.next();
    if matches.next().is_some() {
        return Err(Error::new("identityCollision"));
    }
    Ok(first)
}
fn parent_path(
    repo: &Repository,
    parent: &Commit<'_>,
    child: &Commit<'_>,
    files: &Files,
    path: &str,
    id: Option<&str>,
) -> Result<Option<String>> {
    if let Some(id) = id
        && let Some(path) = matching_id(repo, files, id)?
    {
        return Ok(Some(path));
    }
    let compatible = |file: &File| {
        let previous = identity(repo, file);
        id.is_none() || previous.is_none() || previous.as_deref() == id
    };
    if let Some(file) = files.get(path) {
        return Ok(compatible(file).then(|| path.into()));
    }
    // Ordinary imported notes can move before acquiring an ID. Follow Git's unambiguous rename delta.
    let mut diff =
        git(repo.diff_tree_to_tree(Some(&git(parent.tree())?), Some(&git(child.tree())?), None))?;
    let mut options = git2::DiffFindOptions::new();
    options.renames(true);
    git(diff.find_similar(Some(&mut options)))?;
    let candidates: Vec<_> = diff
        .deltas()
        .filter(|d| {
            d.status() == git2::Delta::Renamed
                && d.new_file().path().and_then(|p| p.to_str()) == Some(path)
        })
        .filter_map(|d| {
            d.old_file()
                .path()
                .and_then(|p| p.to_str())
                .map(str::to_owned)
        })
        .filter(|p| files.get(p).is_some_and(compatible))
        .collect();
    Ok(if candidates.len() == 1 {
        candidates.into_iter().next()
    } else {
        None
    })
}
pub(crate) fn list(
    repo: &Repository,
    workspace: &Workspace,
    path: &str,
) -> Result<Vec<HistoryEntry>> {
    let current = workspace.read_note(path)?;
    let Some(head) = head(repo) else {
        return Ok(vec![]);
    };
    if current.id.is_some()
        && workspace
            .scan()?
            .iter()
            .any(|e| e.identity_collision && e.id == current.id)
    {
        return Err(Error::new("identityCollision"));
    }
    let mut lineage = BTreeMap::<Oid, BTreeSet<(String, Option<String>)>>::new();
    lineage
        .entry(head)
        .or_default()
        .insert((path.into(), current.id));
    let mut walk = git(repo.revwalk())?;
    git(walk.push(head))?;
    git(walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME))?;
    let mut result = vec![];
    for id in walk.take(5000) {
        let id = git(id)?;
        let Some(states) = lineage.remove(&id) else {
            continue;
        };
        let commit = git(repo.find_commit(id))?;
        let files = commit_files(repo, id)?;
        let mut version = None;
        for (path, known_id) in states {
            let Some(file) = files.get(&path) else {
                continue;
            };
            let actual_id = identity(repo, file);
            if known_id
                .as_ref()
                .zip(actual_id.as_ref())
                .is_some_and(|(a, b)| a != b)
            {
                continue;
            }
            let known_id = known_id.or(actual_id);
            let mut unchanged = false;
            for parent in commit.parents() {
                let previous = commit_files(repo, parent.id())?;
                if let Some(old_path) = parent_path(
                    repo,
                    &parent,
                    &commit,
                    &previous,
                    &path,
                    known_id.as_deref(),
                )? {
                    unchanged |= old_path == path && previous.get(&old_path) == Some(file);
                    let old_identity = previous.get(&old_path).and_then(|f| identity(repo, f));
                    lineage
                        .entry(parent.id())
                        .or_default()
                        .insert((old_path, known_id.clone().or(old_identity)));
                }
            }
            if !unchanged {
                version = Some(path);
            }
        }
        if let Some(path) = version {
            result.push(HistoryEntry {
                oid: id.to_string(),
                message: commit.summary().ok().flatten().unwrap_or("").into(),
                author: commit.author().name().unwrap_or("").into(),
                timestamp: commit.time().seconds(),
                path: Some(path),
            });
            if result.len() == 100 {
                break;
            }
        }
    }
    Ok(result)
}
