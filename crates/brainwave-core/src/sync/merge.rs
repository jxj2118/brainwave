use crate::{
    Error, Result,
    history::{File, Files, git, oid},
    links,
    markdown::Document,
};
use git2::{MergeFileInput, Repository};
use serde::{Deserialize, Serialize};
use serde_yaml::Value;
use std::collections::{BTreeMap, BTreeSet};
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub path: String,
    pub text: Option<String>,
    pub size: usize,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    pub key: String,
    pub kind: String,
    pub base: Option<Version>,
    pub local: Option<Version>,
    pub remote: Option<Version>,
    pub base_files: Vec<Version>,
    pub local_files: Vec<Version>,
    pub remote_files: Vec<Version>,
}
#[derive(Clone)]
pub(crate) struct Record {
    pub item: Conflict,
    pub local: Files,
    pub remote: Files,
}
pub(crate) struct Plan {
    pub files: Files,
    pub conflicts: Vec<Record>,
}
#[derive(Default, Serialize, Deserialize)]
pub(crate) struct Resolutions(pub BTreeMap<String, String>);
fn data(repo: &Repository, file: &File) -> Result<Vec<u8>> {
    Ok(git(repo.find_blob(oid(&file.oid)?))?.content().to_vec())
}
fn version(repo: &Repository, files: &Files, note: Option<&str>) -> Result<Option<Version>> {
    let Some((path, file)) = note
        .and_then(|p| files.get_key_value(p))
        .or_else(|| files.iter().next())
    else {
        return Ok(None);
    };
    let bytes = data(repo, file)?;
    Ok(Some(Version {
        path: path.clone(),
        size: bytes.len(),
        text: if bytes.len() <= 8 * 1024 * 1024 && !bytes.contains(&0) {
            String::from_utf8(bytes).ok()
        } else {
            None
        },
    }))
}
fn versions(repo: &Repository, files: &Files) -> Result<Vec<Version>> {
    files
        .keys()
        .map(|p| version(repo, files, Some(p)).map(Option::unwrap))
        .collect()
}
fn record(
    repo: &Repository,
    key: &str,
    kind: &str,
    b: Files,
    l: Files,
    r: Files,
) -> Result<Record> {
    let primary = |f: &Files| {
        f.keys()
            .find(|p| p.to_ascii_lowercase().ends_with(".md"))
            .cloned()
    };
    let item = Conflict {
        key: key.into(),
        kind: kind.into(),
        base: version(repo, &b, primary(&b).as_deref())?,
        local: version(repo, &l, primary(&l).as_deref())?,
        remote: version(repo, &r, primary(&r).as_deref())?,
        base_files: versions(repo, &b)?,
        local_files: versions(repo, &l)?,
        remote_files: versions(repo, &r)?,
    };
    Ok(Record {
        item,
        local: l,
        remote: r,
    })
}
fn ids(repo: &Repository, files: &Files) -> Result<BTreeMap<String, String>> {
    let mut ids = BTreeMap::new();
    for (path, file) in files {
        if !path.to_ascii_lowercase().ends_with(".md") {
            continue;
        }
        if let Ok(text) = String::from_utf8(data(repo, file)?)
            && let Some(id) = Document::parse(&text).id()
            && ids.insert(id, path.clone()).is_some()
        {
            return Err(Error::new("identityCollision"));
        }
    }
    Ok(ids)
}
fn group(files: &Files, path: &str) -> Files {
    let assets = format!("{}/", crate::attachments::asset_path(path));
    files
        .iter()
        .filter(|(p, _)| p.as_str() == path || p.starts_with(&assets))
        .map(|(p, f)| (p.clone(), f.clone()))
        .collect()
}
fn relocate(repo: &Repository, files: &mut Files, from: &str, to: &str) -> Result<()> {
    if from == to {
        return Ok(());
    }
    let old_assets = crate::attachments::asset_path(from);
    let new_assets = crate::attachments::asset_path(to);
    let subset = group(files, from);
    for (path, mut file) in subset {
        files.remove(&path);
        let destination = if path == from {
            if let Ok(text) = String::from_utf8(data(repo, &file)?) {
                file.oid = git(repo.blob(links::rewrite(&text, from, to).as_bytes()))?.to_string();
            }
            to.to_owned()
        } else {
            format!("{new_assets}{}", &path[old_assets.len()..])
        };
        if files.insert(destination, file).is_some() {
            return Err(Error::new("pathCollision"));
        }
    }
    Ok(())
}
fn yaml(text: &str) -> Option<Value> {
    let d = Document::parse(text);
    match d.yaml {
        Some(v) => serde_yaml::from_str::<Value>(v)
            .ok()
            .filter(|v| v.is_null() || v.is_mapping()),
        None => Some(Value::Null),
    }
}
fn immutable_conflict(l: &str, r: &str) -> bool {
    let (Some(l), Some(r)) = (yaml(l), yaml(r)) else {
        return false;
    };
    ["id", "created_at"]
        .iter()
        .any(|k| match (l.get(*k), r.get(*k)) {
            (Some(a), Some(b)) => !a.is_null() && !b.is_null() && a != b,
            _ => false,
        })
}
fn preserve_known(text: &str, local: &str, remote: &str) -> Option<String> {
    let lv = yaml(local).unwrap_or(Value::Null);
    let rv = yaml(remote).unwrap_or(Value::Null);
    let values: Vec<_> = ["id", "created_at"]
        .into_iter()
        .filter_map(|k| {
            lv.get(k)
                .filter(|v| !v.is_null())
                .or_else(|| rv.get(k).filter(|v| !v.is_null()))
                .map(|v| (k, v))
        })
        .collect();
    if values.is_empty() {
        return Some(text.into());
    }
    let selected = yaml(text)?;
    let mut extra = String::new();
    let doc = Document::parse(text);
    let eol = if text.starts_with("---\r\n") || text.starts_with("\u{feff}---\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    for (key, value) in values {
        if selected.get(key).is_none_or(Value::is_null) {
            extra.push_str(&format!(
                "{key}: {}{eol}",
                serde_json::to_string(value.as_str()?).ok()?
            ));
        }
    }
    if extra.is_empty() {
        return Some(text.into());
    }
    if let Some(header) = doc.yaml {
        if header.trim_start().starts_with(['{', '!', '&', '*', '%']) {
            return None;
        }
        let before = text.len() - doc.body.len();
        let closing = if text[..before].ends_with("...\r\n") || text[..before].ends_with("---\r\n")
        {
            5
        } else if text[..before].ends_with("...\n") || text[..before].ends_with("---\n") {
            4
        } else {
            3
        };
        let at = before - closing;
        let result = format!("{}{}{}", &text[..at], extra, &text[at..]);
        yaml(&result)?;
        Some(result)
    } else {
        Some(format!(
            "{}---{eol}{extra}---{eol}{}",
            if text.starts_with('\u{feff}') {
                "\u{feff}"
            } else {
                ""
            },
            doc.body
        ))
    }
}
fn text_merge(b: &str, l: &str, r: &str) -> Option<String> {
    let mut bi = MergeFileInput::new();
    bi.content(b.as_bytes());
    let mut li = MergeFileInput::new();
    li.content(l.as_bytes());
    let mut ri = MergeFileInput::new();
    ri.content(r.as_bytes());
    let result = git2::merge_file(&bi, &li, &ri, None).ok()?;
    result
        .is_automergeable()
        .then(|| String::from_utf8(result.content().to_vec()).ok())
        .flatten()
}
fn tags(v: &Value) -> Option<BTreeSet<String>> {
    match v.get("tags") {
        None | Some(Value::Null) => Some(BTreeSet::new()),
        Some(Value::Sequence(a)) => a.iter().map(|v| v.as_str().map(str::to_owned)).collect(),
        _ => None,
    }
}
// Only the three Brainwave-owned top-level fields are rewritten. Unknown fields and comments keep their bytes/order.
fn normalized(text: &str, fields: &str) -> Option<String> {
    let doc = Document::parse(text);
    let Some(header) = doc.yaml else {
        return Some(if fields.is_empty() {
            text.into()
        } else {
            format!(
                "{}---\n{fields}---\n{}",
                if text.starts_with('\u{feff}') {
                    "\u{feff}"
                } else {
                    ""
                },
                doc.body
            )
        });
    };
    if header.trim_start().starts_with(['{', '!', '&', '*', '%']) {
        return None;
    }
    let mut rest = String::new();
    let mut removing = false;
    for line in header.split_inclusive('\n') {
        let trimmed = line.trim_start();
        let top = !line.starts_with([' ', '\t'])
            && !trimmed.starts_with('#')
            && !trimmed.trim().is_empty();
        if top {
            removing = ["id:", "created_at:", "tags:"]
                .iter()
                .any(|k| line.starts_with(k));
        }
        // Standalone comments are not owned by the field being removed.
        if !removing || trimmed.starts_with('#') {
            rest.push_str(line);
        }
    }
    // Refuse unusual YAML where textual spans cannot be identified safely.
    let parsed: Value = serde_yaml::from_str(&rest).ok()?;
    if ["id", "created_at", "tags"]
        .iter()
        .any(|k| parsed.get(*k).is_some())
    {
        return None;
    }
    let prefix = &text[..text.len() - doc.body.len()];
    let opening = if prefix.starts_with('\u{feff}') {
        "\u{feff}---\n"
    } else {
        "---\n"
    };
    Some(format!("{opening}{rest}{fields}---\n{}", doc.body))
}
fn semantic_merge(b: &str, l: &str, r: &str) -> Option<String> {
    if immutable_conflict(l, r) {
        return None;
    }
    if let Some(result) = text_merge(b, l, r) {
        return preserve_known(&result, l, r);
    }
    let (bv, lv, rv) = (yaml(b)?, yaml(l)?, yaml(r)?);
    let mut fields = String::new();
    for k in ["id", "created_at"] {
        let values = [lv.get(k), rv.get(k), bv.get(k)];
        let value = values.into_iter().flatten().find(|v| !v.is_null());
        if let Some(value) = value {
            let text = value.as_str()?;
            fields.push_str(&format!("{k}: {}\n", serde_json::to_string(text).ok()?));
        }
    }
    let (bt, lt, rt) = (tags(&bv)?, tags(&lv)?, tags(&rv)?);
    let result: BTreeSet<_> = bt
        .intersection(&lt)
        .filter(|v| rt.contains(*v))
        .chain(lt.difference(&bt))
        .chain(rt.difference(&bt))
        .cloned()
        .collect();
    if !result.is_empty() || lv.get("tags").is_some() || rv.get("tags").is_some() {
        fields.push_str(&format!("tags: {}\n", serde_json::to_string(&result).ok()?));
    }
    text_merge(
        &normalized(b, &fields)?,
        &normalized(l, &fields)?,
        &normalized(r, &fields)?,
    )
}
fn one(path: &str, file: Option<&File>) -> Files {
    file.map(|f| [(path.to_owned(), f.clone())].into())
        .unwrap_or_default()
}
pub(crate) fn merge(
    repo: &Repository,
    base: &Files,
    local: &Files,
    remote: &Files,
    choices: &Resolutions,
    unrelated: bool,
) -> Result<Plan> {
    let (bi, li, ri) = (ids(repo, base)?, ids(repo, local)?, ids(repo, remote)?);
    let (mut b, mut l, mut r) = (base.clone(), local.clone(), remote.clone());
    let mut conflicts = vec![];
    for (id, bpath) in &bi {
        let (Some(lp), Some(rp)) = (li.get(id), ri.get(id)) else {
            continue;
        };
        if lp != bpath && rp != bpath && lp != rp {
            // Include unrelated notes occupying either destination in the explicit conflict.
            let destinations = [bpath.as_str(), lp.as_str(), rp.as_str()];
            let collect = |side: &Files| -> Files {
                destinations.iter().flat_map(|p| group(side, p)).collect()
            };
            let bg = collect(&b);
            let lg = collect(&l);
            let rg = collect(&r);
            let mut conflict = record(
                repo,
                &format!("rename:{id}"),
                "rename",
                bg.clone(),
                lg.clone(),
                rg.clone(),
            )?;
            conflict.item.base = version(repo, &bg, Some(bpath))?;
            conflict.item.local = version(repo, &lg, Some(lp))?;
            conflict.item.remote = version(repo, &rg, Some(rp))?;
            for p in bg.keys() {
                b.remove(p);
            }
            for p in lg.keys() {
                l.remove(p);
            }
            for p in rg.keys() {
                r.remove(p);
            }
            conflicts.push(conflict);
        } else if lp != bpath || rp != bpath {
            let to = if lp != bpath { lp } else { rp };
            relocate(repo, &mut b, bpath, to)?;
            relocate(repo, &mut l, lp, to)?;
            relocate(repo, &mut r, rp, to)?;
        }
    }
    let mut files = Files::new();
    let paths: BTreeSet<_> = b.keys().chain(l.keys()).chain(r.keys()).cloned().collect();
    for path in paths {
        let (bf, lf, rf) = (b.get(&path), l.get(&path), r.get(&path));
        let is_note = path.to_ascii_lowercase().ends_with(".md");
        let immutable = is_note
            && lf.zip(rf).is_some_and(|(lf, rf)| {
                match (
                    data(repo, lf).ok().and_then(|b| String::from_utf8(b).ok()),
                    data(repo, rf).ok().and_then(|b| String::from_utf8(b).ok()),
                ) {
                    (Some(l), Some(r)) => immutable_conflict(&l, &r),
                    _ => false,
                }
            });
        let clean = if immutable {
            None
        } else if lf == rf {
            Some(lf)
        } else if lf == bf {
            Some(rf)
        } else if rf == bf {
            Some(lf)
        } else {
            None
        };
        if let Some(selected) = clean {
            if let Some(file) = selected {
                let mut chosen = file.clone();
                if is_note
                    && let Some((lf, rf)) = lf.zip(rf)
                    && let (Ok(text), Ok(local), Ok(remote)) = (
                        String::from_utf8(data(repo, file)?),
                        String::from_utf8(data(repo, lf)?),
                        String::from_utf8(data(repo, rf)?),
                    )
                {
                    if let Some(text) = preserve_known(&text, &local, &remote) {
                        chosen.oid = git(repo.blob(text.as_bytes()))?.to_string();
                    } else {
                        conflicts.push(record(
                            repo,
                            &path,
                            "metadata",
                            one(&path, bf),
                            one(&path, Some(lf)),
                            one(&path, Some(rf)),
                        )?);
                        continue;
                    }
                }
                files.insert(path, chosen);
            }
            continue;
        }
        if let (Some(bf), Some(lf), Some(rf)) = (bf, lf, rf) {
            let bytes = (data(repo, bf)?, data(repo, lf)?, data(repo, rf)?);
            if !immutable
                && lf.mode == rf.mode
                && !bytes.0.contains(&0)
                && !bytes.1.contains(&0)
                && !bytes.2.contains(&0)
                && let (Ok(bs), Ok(ls), Ok(rs)) = (
                    std::str::from_utf8(&bytes.0),
                    std::str::from_utf8(&bytes.1),
                    std::str::from_utf8(&bytes.2),
                )
            {
                let result = if is_note {
                    semantic_merge(bs, ls, rs)
                } else {
                    text_merge(bs, ls, rs)
                };
                if let Some(text) = result {
                    files.insert(
                        path,
                        File {
                            oid: git(repo.blob(text.as_bytes()))?.to_string(),
                            mode: lf.mode,
                        },
                    );
                    continue;
                }
            }
        }
        let kind = if immutable {
            "metadata"
        } else if lf.is_none() || rf.is_none() {
            "deleteModify"
        } else if bf.is_none() {
            "addAdd"
        } else if lf.into_iter().chain(rf).any(|f| {
            data(repo, f).is_ok_and(|b| b.contains(&0) || std::str::from_utf8(&b).is_err())
        }) {
            "binary"
        } else {
            "content"
        };
        conflicts.push(record(
            repo,
            &path,
            kind,
            one(&path, bf),
            one(&path, lf),
            one(&path, rf),
        )?);
    }
    if unrelated {
        conflicts.push(record(
            repo,
            "unrelated",
            "unrelated",
            Files::new(),
            Files::new(),
            Files::new(),
        )?);
    }
    let mut pending = vec![];
    for conflict in conflicts {
        if let Some(choice) = choices.0.get(&conflict.item.key) {
            let selected = match choice.as_str() {
                "local" => &conflict.local,
                "remote" => &conflict.remote,
                "both" => {
                    keep_both(repo, &mut files, &conflict, &r, remote)?;
                    continue;
                }
                _ => return Err(Error::new("invalidResolution")),
            };
            for (path, file) in selected {
                insert(&mut files, path, file)?;
            }
        } else {
            pending.push(conflict);
        }
    }
    path_conflicts(repo, &mut files, &mut pending, base, local, remote, choices)?;
    if pending.is_empty() {
        ids(repo, &files)?;
    }
    Ok(Plan {
        files,
        conflicts: pending,
    })
}
fn collision(files: &Files) -> Option<String> {
    let mut prefixes = BTreeMap::<String, (String, bool)>::new();
    for path in files.keys() {
        let parts: Vec<_> = path.split('/').collect();
        for n in 1..=parts.len() {
            let prefix = parts[..n].join("/");
            let directory = n < parts.len();
            if let Some((old, was_dir)) = prefixes.get(&prefix.to_lowercase()) {
                if old != &prefix || *was_dir != directory || !directory {
                    return Some(old.clone());
                }
            } else {
                prefixes.insert(prefix.to_lowercase(), (prefix, directory));
            }
        }
    }
    None
}
fn within(path: &str, root: &str) -> bool {
    let p = path.to_lowercase();
    let root = root.to_lowercase();
    p == root || p.starts_with(&format!("{root}/"))
}
fn subtree(files: &Files, root: &str) -> Files {
    files
        .iter()
        .filter(|(p, _)| within(p, root))
        .map(|(p, f)| (p.clone(), f.clone()))
        .collect()
}
fn renamed_root(root: &str, file: bool, n: usize) -> String {
    if file {
        let p = std::path::Path::new(root);
        if let (Some(stem), Some(ext)) = (p.file_stem(), p.extension()) {
            let parent = p.parent().unwrap().to_string_lossy();
            let name = format!(
                "{} (remote {n}).{}",
                stem.to_string_lossy(),
                ext.to_string_lossy()
            );
            return if parent.is_empty() {
                name
            } else {
                format!("{parent}/{name}")
            };
        }
    }
    format!("{root} (remote {n})")
}
fn root_available(files: &Files, root: &str) -> bool {
    !files
        .keys()
        .any(|path| within(path, root) || within(root, path))
}
fn path_conflicts(
    repo: &Repository,
    files: &mut Files,
    pending: &mut Vec<Record>,
    base: &Files,
    local: &Files,
    remote: &Files,
    choices: &Resolutions,
) -> Result<()> {
    // Includes file/descendant and case-insensitive directory collisions before Index::add can evict anything.
    for _ in 0..10000 {
        let Some(root) = collision(files) else {
            return Ok(());
        };
        let key = format!("path:{root}");
        let conflict = record(
            repo,
            &key,
            "path",
            subtree(base, &root),
            subtree(local, &root),
            subtree(remote, &root),
        )?;
        files.retain(|path, _| !within(path, &root));
        match choices.0.get(&key).map(String::as_str) {
            Some("local") => {
                for (path, file) in &conflict.local {
                    insert(files, path, file)?;
                }
            }
            Some("remote") => {
                for (path, file) in &conflict.remote {
                    insert(files, path, file)?;
                }
            }
            Some("both") => {
                for (path, file) in &conflict.local {
                    insert(files, path, file)?;
                }
                let remote_is_file = conflict
                    .remote
                    .keys()
                    .any(|path| path.eq_ignore_ascii_case(&root));
                let target = (1..10000)
                    .map(|n| renamed_root(&root, remote_is_file, n))
                    .find(|p| root_available(files, p))
                    .ok_or_else(|| Error::new("pathCollision"))?;
                let depth = root.split('/').count();
                for (path, original) in &conflict.remote {
                    let suffix = path.split('/').skip(depth).collect::<Vec<_>>().join("/");
                    let destination = if suffix.is_empty() {
                        target.clone()
                    } else {
                        format!("{target}/{suffix}")
                    };
                    let mut file = original.clone();
                    if path.to_ascii_lowercase().ends_with(".md") {
                        let text = String::from_utf8(data(repo, &file)?)
                            .map_err(|_| Error::new("invalidEncoding"))?;
                        let from = path.split('/').take(depth).collect::<Vec<_>>().join("/");
                        let moved =
                            links::rewrite_folder(&text, path, &destination, &from, &target);
                        let identity = Document::parse(&moved).id();
                        let existing = ids(repo, files)?;
                        let copied = if identity.as_ref().is_none_or(|id| existing.contains_key(id))
                        {
                            duplicate(&moved)?
                        } else {
                            moved
                        };
                        file.oid = git(repo.blob(copied.as_bytes()))?.to_string();
                    }
                    insert(files, &destination, &file)?;
                }
            }
            Some(_) => return Err(Error::new("invalidResolution")),
            None => pending.push(conflict),
        }
    }
    Err(Error::new("workspaceTooLarge"))
}
fn keep_both(
    repo: &Repository,
    files: &mut Files,
    conflict: &Record,
    transformed_remote: &Files,
    original_remote: &Files,
) -> Result<()> {
    for (path, file) in &conflict.local {
        insert(files, path, file)?;
    }
    let mut handled = BTreeSet::new();
    for (path, original) in conflict
        .remote
        .iter()
        .filter(|(p, _)| p.to_ascii_lowercase().ends_with(".md"))
    {
        let destination = unique(files, path);
        let mut file = original.clone();
        let text =
            String::from_utf8(data(repo, &file)?).map_err(|_| Error::new("invalidEncoding"))?;
        let moved = links::rewrite(&text, path, &destination);
        let identity = Document::parse(&moved).id();
        let existing = ids(repo, files)?;
        let copied = if identity.as_ref().is_none_or(|id| existing.contains_key(id)) {
            duplicate(&moved)?
        } else {
            moved
        };
        file.oid = git(repo.blob(copied.as_bytes()))?.to_string();
        let old_assets = crate::attachments::asset_path(path);
        let new_assets = crate::attachments::asset_path(&destination);
        for (asset, content) in original_remote
            .iter()
            .chain(transformed_remote.iter())
            .chain(conflict.remote.iter())
        {
            if asset.starts_with(&format!("{old_assets}/")) {
                handled.insert(asset.clone());
                let copied_path = format!("{new_assets}{}", &asset[old_assets.len()..]);
                match files.get(&copied_path) {
                    Some(existing) if existing == content => (),
                    Some(_) => return Err(Error::new("pathCollision")),
                    None => {
                        files.insert(copied_path, content.clone());
                    }
                }
            }
        }
        insert(files, &destination, &file)?;
        handled.insert(path.clone());
    }
    for (path, file) in &conflict.remote {
        if !handled.contains(path) {
            let destination = unique(files, path);
            insert(files, &destination, file)?;
        }
    }
    Ok(())
}
fn insert(files: &mut Files, path: &str, file: &File) -> Result<()> {
    if files.insert(path.into(), file.clone()).is_some() {
        return Err(Error::new("pathCollision"));
    }
    Ok(())
}
fn unique(files: &Files, path: &str) -> String {
    if !files.keys().any(|p| p.eq_ignore_ascii_case(path)) {
        return path.into();
    }
    let p = std::path::Path::new(path);
    let parent = p.parent().unwrap().to_string_lossy();
    let stem = p.file_stem().unwrap().to_string_lossy();
    let ext = p
        .extension()
        .map(|v| format!(".{}", v.to_string_lossy()))
        .unwrap_or_default();
    for n in 1..10000 {
        let name = format!("{stem} (remote {n}){ext}");
        let candidate = if parent.is_empty() {
            name
        } else {
            format!("{parent}/{name}")
        };
        if !files.keys().any(|p| p.eq_ignore_ascii_case(&candidate)) {
            return candidate;
        }
    }
    format!("{path}-{}", uuid::Uuid::now_v7())
}
fn duplicate(text: &str) -> Result<String> {
    let doc = Document::parse(text);
    let mut result = String::new();
    let mut replaced = false;
    if let Some(header) = doc.yaml {
        for line in header.split_inclusive('\n') {
            if line.starts_with("id:") {
                result.push_str(&format!("id: {}\n", uuid::Uuid::now_v7()));
                replaced = true;
            } else {
                result.push_str(line);
            }
        }
        if !replaced {
            result.push_str(&format!("id: {}\n", uuid::Uuid::now_v7()));
        }
        let _: Value =
            serde_yaml::from_str(&result).map_err(|_| Error::new("invalidFrontmatter"))?;
        Ok(format!("---\n{result}---\n{}", doc.body))
    } else {
        doc.with_body(doc.body)
    }
}
