mod apply;
mod credentials;
mod merge;
mod transport;
use crate::{
    Error, Identity, Result, Workspace, atomic,
    history::{commit_files, disk_files, git, head, signature, write_tree},
};
pub use credentials::CredentialStore;
use git2::{Direction, Oid, Repository};
use merge::Resolutions;
pub use merge::{Conflict, Version};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
pub(crate) use transport::initialize as initialize_transport;
#[derive(Default, Clone, PartialEq, Serialize, Deserialize)]
pub struct Credentials {
    pub username: String,
    pub token: String,
}
impl std::fmt::Debug for Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Credentials")
            .field("username", &self.username)
            .field("token", &if self.token.is_empty() { "" } else { "***" })
            .finish()
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Configuration {
    pub remote: String,
    pub name: String,
    pub email: String,
    pub branch: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub phase: String,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub conflicts: Vec<Conflict>,
    pub configuration: Configuration,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteProbe {
    pub default_branch: Option<String>,
    pub empty: bool,
}
fn validate_remote(remote: &str) -> Result<()> {
    if !(remote.starts_with("https://")
        || Path::new(remote).is_absolute()
        || remote.starts_with("http://127.0.0.1:"))
    {
        return Err(Error::new("unsupportedRemote"));
    }
    // Do not accept embedded credentials, fragments or query secrets in remote URLs.
    if remote.contains('@') || remote.contains(['?', '#', '\n', '\r']) {
        return Err(Error::new("unsupportedRemote"));
    }
    Ok(())
}
/// Read-only connection test: reachability, authentication and push permission. See DESIGN.md §9.1.1.
pub fn probe_remote(remote: &str, credentials: &Credentials) -> Result<RemoteProbe> {
    let remote = remote.trim();
    validate_remote(remote)?;
    let (default_branch, empty) = if Path::new(remote).is_absolute() {
        let repo = Repository::open(remote).map_err(|_| Error::new("remoteMissing"))?;
        let empty = repo.is_empty().map_err(|_| Error::new("remoteError"))?;
        let branch = repo
            .find_reference("HEAD")
            .ok()
            .and_then(|r| r.symbolic_target().ok().flatten().map(str::to_owned))
            .and_then(|t| t.strip_prefix("refs/heads/").map(str::to_owned));
        (branch.filter(|_| !empty), empty)
    } else {
        transport::probe(remote, credentials)?
    };
    Ok(RemoteProbe {
        default_branch,
        empty,
    })
}
#[derive(Serialize, Deserialize)]
struct ResolutionCache {
    local: String,
    remote: String,
    choices: Resolutions,
}
pub struct SyncEngine {
    root: PathBuf,
    runtime: PathBuf,
}
const LOCAL: &str = "refs/brainwave/pending-local";
const REMOTE: &str = "refs/brainwave/pending-remote";
impl SyncEngine {
    pub fn new(workspace: &Workspace, runtime: &Path) -> Self {
        Self {
            root: workspace.root.clone(),
            runtime: runtime.to_owned(),
        }
    }
    fn repo(&self) -> Result<Repository> {
        git(Repository::open(&self.root))
    }
    fn workspace(&self) -> Result<Workspace> {
        Workspace::open(&self.root)
    }
    fn config(&self) -> Result<Configuration> {
        match fs::read(self.runtime.join("sync.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| Error::new("configuration")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let repo = self.repo()?;
                let cfg = git(repo.config())?;
                Ok(Configuration {
                    remote: repo
                        .find_remote("brainwave")
                        .or_else(|_| repo.find_remote("origin"))
                        .ok()
                        .and_then(|r| r.url().ok().map(str::to_owned))
                        .unwrap_or_default(),
                    name: cfg.get_string("user.name").unwrap_or_default(),
                    email: cfg.get_string("user.email").unwrap_or_default(),
                    branch: None,
                })
            }
            Err(e) => Err(e.into()),
        }
    }
    pub fn configure(&self, remote: &str, identity: &Identity) -> Result<()> {
        let remote = remote.trim();
        if !remote.is_empty() {
            validate_remote(remote)?;
        }
        let old = self.config()?;
        if old.remote != remote && self.repo()?.find_reference(REMOTE).is_ok() {
            return Err(Error::new("conflictsPending"));
        }
        let c = Configuration {
            remote: remote.trim().into(),
            name: identity.name.trim().into(),
            email: identity.email.trim().into(),
            branch: if old.remote == remote {
                old.branch
            } else {
                None
            },
        };
        let repo = self.repo()?;
        if old.remote != remote {
            let names: Vec<_> = git(repo.references_glob("refs/remotes/brainwave/*"))?
                .filter_map(|r| r.ok().and_then(|r| r.name().ok().map(str::to_owned)))
                .collect();
            for name in names {
                git(repo.find_reference(&name))?
                    .delete()
                    .map_err(|_| Error::new("repository"))?;
            }
        }
        if !remote.is_empty() {
            if repo.find_remote("brainwave").is_ok() {
                git(repo.remote_set_url("brainwave", remote))?;
            } else {
                git(repo.remote("brainwave", remote))?;
            }
        } else if repo.find_remote("brainwave").is_ok() {
            git(repo.remote_delete("brainwave"))?;
        }
        let mut git_config = git(repo.config())?;
        if !c.name.is_empty() && !c.email.is_empty() {
            git(git_config.set_str("user.name", &c.name))?;
            git(git_config.set_str("user.email", &c.email))?;
        }
        atomic::json(&self.runtime.join("sync.json"), &c)
    }
    fn choices(&self, local: Oid, remote: Oid) -> Result<Resolutions> {
        match fs::read(self.runtime.join("resolutions.json")) {
            Ok(bytes) => {
                let cache = serde_json::from_slice::<ResolutionCache>(&bytes).ok();
                Ok(cache
                    .filter(|c| c.local == local.to_string() && c.remote == remote.to_string())
                    .map(|c| c.choices)
                    .unwrap_or_default())
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Resolutions::default()),
            Err(e) => Err(e.into()),
        }
    }
    fn pending(&self, repo: &Repository) -> Result<Option<(Oid, Oid)>> {
        match repo.find_reference(REMOTE) {
            Ok(r) => Ok(Some((
                git(repo.find_reference(LOCAL))?
                    .target()
                    .ok_or_else(|| Error::new("recoveryRequired"))?,
                r.target().ok_or_else(|| Error::new("recoveryRequired"))?,
            ))),
            Err(e) if e.code() == git2::ErrorCode::NotFound => Ok(None),
            Err(_) => Err(Error::new("repository")),
        }
    }
    fn plan(&self, repo: &Repository, l: Oid, r: Oid) -> Result<merge::Plan> {
        self.plan_with(repo, l, r, &self.choices(l, r)?)
    }
    fn plan_with(
        &self,
        repo: &Repository,
        l: Oid,
        r: Oid,
        choices: &Resolutions,
    ) -> Result<merge::Plan> {
        let base = repo.merge_base(l, r).ok();
        merge::merge(
            repo,
            &base
                .map(|b| commit_files(repo, b))
                .transpose()?
                .unwrap_or_default(),
            &commit_files(repo, l)?,
            &commit_files(repo, r)?,
            choices,
            base.is_none(),
        )
    }
    pub fn status(&self) -> Result<SyncStatus> {
        let repo = self.repo()?;
        let config = self.config()?;
        let conflicts = if let Some((l, r)) = self.pending(&repo)? {
            self.plan(&repo, l, r)?
                .conflicts
                .into_iter()
                .map(|r| r.item)
                .collect()
        } else {
            vec![]
        };
        Ok(SyncStatus {
            phase: if self.pending(&repo)?.is_some() {
                "conflict"
            } else if config.remote.is_empty() {
                "local"
            } else if head(&repo)
                .map(|h| commit_files(&repo, h))
                .transpose()?
                .unwrap_or_default()
                != disk_files(&repo, &self.root)?
            {
                "localChanges"
            } else if let Some(local) = head(&repo) {
                match config
                    .branch
                    .as_ref()
                    .and_then(|branch| {
                        repo.find_reference(&format!("refs/remotes/brainwave/{branch}"))
                            .ok()
                    })
                    .and_then(|r| r.target())
                {
                    Some(remote) if remote == local => "synced",
                    Some(remote) if repo.graph_descendant_of(local, remote).unwrap_or(false) => {
                        "localChanges"
                    }
                    None => "localChanges",
                    _ => "idle",
                }
            } else {
                "idle"
            }
            .into(),
            head: head(&repo).map(|h| h.to_string()),
            branch: config.branch.clone(),
            conflicts,
            configuration: config,
        })
    }
    pub fn resolve(&self, key: &str, choice: &str) -> Result<SyncStatus> {
        let repo = self.repo()?;
        if let Some((local, _)) = self.pending(&repo)?
            && disk_files(&repo, &self.root)? != commit_files(&repo, local)?
        {
            return Err(Error::new("conflictChanged"));
        }
        let status = self.status()?;
        let item = status
            .conflicts
            .iter()
            .find(|i| i.key == key)
            .ok_or_else(|| Error::new("notFound"))?;
        if !["local", "remote", "both"].contains(&choice)
            || (item.kind == "unrelated" && choice != "both")
        {
            return Err(Error::new("invalidResolution"));
        }
        let (local, remote) = self.pending(&repo)?.ok_or_else(|| Error::new("notFound"))?;
        let mut choices = self.choices(local, remote)?;
        choices.0.insert(key.into(), choice.into());
        self.plan_with(&repo, local, remote, &choices)?;
        atomic::json(
            &self.runtime.join("resolutions.json"),
            &ResolutionCache {
                local: local.to_string(),
                remote: remote.to_string(),
                choices,
            },
        )?;
        self.status()
    }
    fn finish_pending(
        &self,
        repo: &Repository,
        w: &Workspace,
        identity: &Identity,
    ) -> Result<bool> {
        let Some((mut l, r)) = self.pending(repo)? else {
            return Ok(true);
        };
        // A completed install may have survived termination before conflict refs were cleared.
        if let Some(h) = head(repo)
            && h != l
            && git(repo.graph_descendant_of(h, l))?
            && git(repo.graph_descendant_of(h, r))?
        {
            self.clear_pending(repo)?;
            return Ok(true);
        }
        if head(repo) != Some(l) {
            return Err(Error::new("externalChange"));
        }
        if disk_files(repo, &self.root)? != commit_files(repo, l)? {
            w.checkpoint_inner(identity, true)?;
            l = head(repo).ok_or_else(|| Error::new("repository"))?;
            git(repo.reference(LOCAL, l, true, "brainwave: preserve edits during conflict"))?;
            let resolutions = self.runtime.join("resolutions.json");
            if resolutions.exists() {
                fs::remove_file(resolutions)?;
            }
        }
        let plan = self.plan(repo, l, r)?;
        if !plan.conflicts.is_empty() {
            return Ok(false);
        }
        let tree = write_tree(repo, &plan.files)?;
        let sig = signature(repo, identity)?;
        let l = git(repo.find_commit(l))?;
        let r = git(repo.find_commit(r))?;
        let merged = git(repo.commit(
            None,
            &sig,
            &sig,
            "brainwave: merge remote changes",
            &git(repo.find_tree(tree))?,
            &[&l, &r],
        ))?;
        apply::apply(repo, w, merged)?;
        self.clear_pending(repo)?;
        Ok(true)
    }
    fn clear_pending(&self, repo: &Repository) -> Result<()> {
        match fs::remove_file(self.runtime.join("resolutions.json")) {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(e.into()),
        };
        for name in [REMOTE, LOCAL] {
            if let Ok(mut reference) = repo.find_reference(name) {
                git(reference.delete())?;
            }
        }
        Ok(())
    }
    pub fn recover(&self) -> Result<()> {
        let repo = self.repo()?;
        apply::recover(&repo, &self.workspace()?)?;
        Ok(())
    }
    pub fn sync(&self, credentials: &Credentials) -> Result<SyncStatus> {
        self.sync_with_hook(credentials, || {})
    }
    /// Hook is useful to test a concurrent peer push precisely between integration and push.
    pub fn sync_with_hook(
        &self,
        credentials: &Credentials,
        mut before_push: impl FnMut(),
    ) -> Result<SyncStatus> {
        let _session = transport::Session::new(credentials);
        let repo = self.repo()?;
        crate::history::ensure_clean(&repo)?;
        let w = self.workspace()?;
        w.recover_file_operation(&self.runtime)?;
        apply::recover(&repo, &w)?;
        let mut config = self.config()?;
        let identity = Identity {
            name: config.name.clone(),
            email: config.email.clone(),
        };
        if !self.finish_pending(&repo, &w, &identity)? {
            return self.status();
        }
        w.checkpoint(&identity)?;
        if config.remote.is_empty() {
            return self.status();
        }
        let mut remote = git(repo.remote_anonymous(&config.remote))?;
        remote.connect(Direction::Fetch).map_err(network_error)?;
        let heads = git(remote.list())?;
        let empty = !heads.iter().any(|h| h.name().starts_with("refs/heads/"));
        let branch = if let Some(branch) = &config.branch {
            branch.clone()
        } else if empty {
            "main".into()
        } else {
            remote
                .default_branch()
                .ok()
                .and_then(|v| v.as_str().ok().map(str::to_owned))
                .and_then(|v| v.strip_prefix("refs/heads/").map(str::to_owned))
                .ok_or_else(|| Error::new("branchMissing"))?
        };
        if !git2::Reference::is_valid_name(&format!("refs/heads/{branch}")) {
            return Err(Error::new("branchMissing"));
        }
        let local_ref = format!("refs/heads/{branch}");
        let current = repo
            .head()
            .ok()
            .and_then(|h| h.name().ok().map(str::to_owned));
        if current.as_deref() != Some(&local_ref) {
            if config.branch.is_some() && current.is_some() {
                return Err(Error::new("branchMismatch"));
            }
            if repo.find_reference(&local_ref).is_ok()
                && head(&repo)
                    != repo
                        .find_reference(&local_ref)
                        .ok()
                        .and_then(|r| r.target())
            {
                return Err(Error::new("branchMismatch"));
            }
            if let Some(h) = head(&repo) {
                git(repo.reference(
                    &local_ref,
                    h,
                    false,
                    "brainwave: follow remote default branch",
                ))?;
            }
            git(repo.set_head(&local_ref))?;
        }
        if config.branch.is_none() {
            config.branch = Some(branch.clone());
            atomic::json(&self.runtime.join("sync.json"), &config)?;
        }
        remote.disconnect().map_err(network_error)?;
        let tracking = format!("refs/remotes/brainwave/{branch}");
        for _attempt in 0..3 {
            remote.connect(Direction::Fetch).map_err(network_error)?;
            let advertised = git(remote.list())?
                .iter()
                .find(|h| h.name() == local_ref)
                .map(|h| h.oid());
            let any_branch = git(remote.list())?
                .iter()
                .any(|h| h.name().starts_with("refs/heads/"));
            remote.disconnect().map_err(network_error)?;
            if advertised.is_none() && (any_branch || repo.find_reference(&tracking).is_ok()) {
                return Err(Error::new("branchMissing"));
            }
            let remote_head = if advertised.is_some() {
                remote
                    .fetch(&[format!("+{local_ref}:{tracking}")], None, None)
                    .map_err(network_error)?;
                git(repo.find_reference(&tracking))?.target()
            } else {
                None
            };
            let local = head(&repo);
            match (local, remote_head) {
                (None, Some(r)) => apply::apply(&repo, &w, r)?,
                (Some(l), Some(r)) if l == r => (),
                (Some(l), Some(r)) if git(repo.graph_descendant_of(r, l))? => {
                    if disk_files(&repo, &self.root)? != commit_files(&repo, l)? {
                        return Err(Error::new("externalChange"));
                    }
                    apply::apply(&repo, &w, r)?;
                }
                (Some(l), Some(r)) if !git(repo.graph_descendant_of(l, r))? => {
                    // Protect both histories before trying identity-aware merge or presenting conflicts.
                    git(repo.reference(
                        LOCAL,
                        l,
                        true,
                        "brainwave: preserve local conflict version",
                    ))?;
                    git(repo.reference(
                        REMOTE,
                        r,
                        true,
                        "brainwave: preserve remote conflict version",
                    ))?;
                    if !self.finish_pending(&repo, &w, &identity)? {
                        return self.status();
                    }
                }
                _ => (),
            }
            let intended = head(&repo);
            before_push();
            if intended.is_some() && intended != remote_head {
                let mut rejection = false;
                let mut callbacks = git2::RemoteCallbacks::new();
                callbacks.push_update_reference(|_, status| {
                    if status.is_some() {
                        rejection = true;
                    }
                    Ok(())
                });
                let mut options = git2::PushOptions::new();
                options.remote_callbacks(callbacks);
                let result = remote.push(&[format!("{local_ref}:{local_ref}")], Some(&mut options));
                drop(options);
                if rejection
                    || result.as_ref().is_err_and(|e| {
                        [git2::ErrorCode::NotFastForward, git2::ErrorCode::Modified]
                            .contains(&e.code())
                    })
                {
                    continue;
                }
                result.map_err(network_error)?;
            }
            remote.connect(Direction::Fetch).map_err(network_error)?;
            let confirmed = git(remote.list())?
                .iter()
                .find(|h| h.name() == local_ref)
                .map(|h| h.oid());
            remote.disconnect().map_err(network_error)?;
            if confirmed != intended {
                continue;
            }
            if head(&repo) != intended
                || intended
                    .map(|h| commit_files(&repo, h))
                    .transpose()?
                    .unwrap_or_default()
                    != disk_files(&repo, &self.root)?
            {
                return Err(Error::new("externalChange"));
            }
            if let Some(confirmed) = confirmed {
                git(repo.reference(
                    &tracking,
                    confirmed,
                    true,
                    "brainwave: verified remote head",
                ))?;
            }
            let mut status = self.status()?;
            status.phase = "synced".into();
            return Ok(status);
        }
        Err(Error::new("remoteBusy"))
    }
}
fn network_error(e: git2::Error) -> Error {
    if let Some(code) = transport::failure() {
        return Error::new(code);
    }
    Error::new(match e.code() {
        git2::ErrorCode::Auth => "authenticationRequired",
        git2::ErrorCode::NotFound => "remoteMissing",
        _ => "offline",
    })
}
