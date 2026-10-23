use brainwave_core::{
    Identity, Workspace,
    sync::{Credentials, SyncEngine, probe_remote},
};
use std::{fs, path::Path};
use tempfile::{TempDir, tempdir};
struct Pair {
    _dir: TempDir,
    remote: std::path::PathBuf,
    a: Workspace,
    b: Workspace,
    ra: std::path::PathBuf,
    rb: std::path::PathBuf,
}
fn identity() -> Identity {
    Identity {
        name: "Writer".into(),
        email: "writer@example.test".into(),
    }
}
impl Pair {
    fn new(files: &[(&str, &[u8])]) -> Self {
        let d = tempdir().unwrap();
        let remote = d.path().join("remote.git");
        let mut options = git2::RepositoryInitOptions::new();
        options.bare(true).initial_head("main");
        git2::Repository::init_opts(&remote, &options).unwrap();
        let a = Workspace::init(&d.path().join("a")).unwrap();
        for (p, bytes) in files {
            write(&d.path().join("a"), p, bytes);
        }
        let ra = d.path().join("runtime-a");
        let e = SyncEngine::new(&a, &ra);
        e.configure(remote.to_str().unwrap(), &identity()).unwrap();
        e.sync(&Credentials::default()).unwrap();
        git2::Repository::clone(remote.to_str().unwrap(), d.path().join("b")).unwrap();
        let b = Workspace::open(&d.path().join("b")).unwrap();
        let rb = d.path().join("runtime-b");
        SyncEngine::new(&b, &rb)
            .configure(remote.to_str().unwrap(), &identity())
            .unwrap();
        Self {
            _dir: d,
            remote,
            a,
            b,
            ra,
            rb,
        }
    }
    fn root(&self, side: &str) -> std::path::PathBuf {
        self._dir.path().join(side)
    }
    fn ea(&self) -> SyncEngine {
        SyncEngine::new(&self.a, &self.ra)
    }
    fn eb(&self) -> SyncEngine {
        SyncEngine::new(&self.b, &self.rb)
    }
    fn sync_b(&self) {
        assert_eq!(
            self.eb().sync(&Credentials::default()).unwrap().phase,
            "synced"
        );
    }
    fn read(&self, path: &str) -> String {
        fs::read_to_string(self.root("a").join(path)).unwrap()
    }
}
fn write(root: &Path, path: &str, bytes: &[u8]) {
    let p = root.join(path);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, bytes).unwrap();
}
const BASE: &str = "---\nid: stable\ncreated_at: 2026-10-21T00:00:00+00:00\ntags: [base]\n---\none\n\ntwo\n\nthree\n";
#[test]
fn local_and_remote_edit_different_files() {
    let p = Pair::new(&[("A.md", b"a"), ("B.md", b"b")]);
    write(&p.root("a"), "A.md", b"local");
    write(&p.root("b"), "B.md", b"remote");
    p.sync_b();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "synced"
    );
    assert_eq!(p.read("A.md"), "local");
    assert_eq!(p.read("B.md"), "remote");
    let repo = git2::Repository::open(p.root("a")).unwrap();
    assert_eq!(
        repo.head()
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .parent_count(),
        2
    );
}
#[test]
fn non_overlapping_markdown_merges_without_rewriting_metadata() {
    let p = Pair::new(&[("N.md", BASE.as_bytes())]);
    write(
        &p.root("a"),
        "N.md",
        BASE.replace("one\n", "LOCAL\n").as_bytes(),
    );
    write(
        &p.root("b"),
        "N.md",
        BASE.replace("three\n", "REMOTE\n").as_bytes(),
    );
    p.sync_b();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "synced"
    );
    assert!(p.read("N.md").contains("LOCAL"));
    assert!(p.read("N.md").contains("REMOTE"));
}
#[test]
fn overlapping_edits_persist_conflicts_across_restart_and_runtime_deletion() {
    let p = Pair::new(&[("N.md", BASE.as_bytes())]);
    write(
        &p.root("a"),
        "N.md",
        BASE.replace("one", "LOCAL").as_bytes(),
    );
    write(
        &p.root("b"),
        "N.md",
        BASE.replace("one", "REMOTE").as_bytes(),
    );
    p.sync_b();
    let s = p.ea().sync(&Credentials::default()).unwrap();
    assert_eq!(s.phase, "conflict");
    assert_eq!(s.conflicts.len(), 1);
    assert!(p.read("N.md").contains("LOCAL"));
    fs::remove_dir_all(&p.ra).unwrap();
    let s = p.ea().status().unwrap();
    assert_eq!(s.phase, "conflict");
    let c = &s.conflicts[0];
    assert!(
        c.local
            .as_ref()
            .unwrap()
            .text
            .as_ref()
            .unwrap()
            .contains("LOCAL")
    );
    assert!(
        c.remote
            .as_ref()
            .unwrap()
            .text
            .as_ref()
            .unwrap()
            .contains("REMOTE")
    );
    p.ea()
        .configure(p.remote.to_str().unwrap(), &identity())
        .unwrap();
    p.ea().resolve(&c.key, "remote").unwrap();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "synced"
    );
    assert!(p.read("N.md").contains("REMOTE"));
}
#[test]
fn independent_tag_additions_merge_as_exact_sets() {
    let p = Pair::new(&[("N.md", BASE.as_bytes())]);
    write(
        &p.root("a"),
        "N.md",
        BASE.replace("[base]", "[base, Local]").as_bytes(),
    );
    write(
        &p.root("b"),
        "N.md",
        BASE.replace("[base]", "[base, remote]").as_bytes(),
    );
    p.sync_b();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "synced"
    );
    let n = p.read("N.md");
    assert!(n.contains("Local"));
    assert!(n.contains("remote"));
}
#[test]
fn tag_deletion_beats_unchanged_and_preserves_other_addition() {
    let p = Pair::new(&[("N.md", BASE.as_bytes())]);
    write(
        &p.root("a"),
        "N.md",
        BASE.replace("[base]", "[]").as_bytes(),
    );
    write(
        &p.root("b"),
        "N.md",
        BASE.replace("[base]", "[base, remote]").as_bytes(),
    );
    p.sync_b();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "synced"
    );
    let text = p.read("N.md");
    let yaml = text.split("---").nth(1).unwrap();
    let v: serde_yaml::Value = serde_yaml::from_str(yaml).unwrap();
    assert_eq!(v["tags"].as_sequence().unwrap().len(), 1);
    assert_eq!(v["tags"][0].as_str(), Some("remote"));
}
#[test]
fn one_sided_move_merges_remote_edit_and_owned_assets() {
    let p = Pair::new(&[("N.md", BASE.as_bytes()), ("N.assets/x.bin", b"asset")]);
    let n = p.a.read_note("N.md").unwrap();
    p.a.move_entry(&p.ra, "N.md", "", "Moved", Some(&n.revision))
        .unwrap();
    write(
        &p.root("b"),
        "N.md",
        BASE.replace("one", "remote").as_bytes(),
    );
    p.sync_b();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "synced"
    );
    assert!(p.read("Moved.md").contains("remote"));
    assert!(!p.root("a").join("N.md").exists());
    assert!(p.root("a").join("Moved.assets/x.bin").exists());
}
#[test]
fn competing_renames_require_explicit_choice() {
    let p = Pair::new(&[("N.md", BASE.as_bytes())]);
    let n = p.a.read_note("N.md").unwrap();
    p.a.move_entry(&p.ra, "N.md", "", "Local", Some(&n.revision))
        .unwrap();
    let n = p.b.read_note("N.md").unwrap();
    p.b.move_entry(&p.rb, "N.md", "", "Remote", Some(&n.revision))
        .unwrap();
    p.sync_b();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().conflicts[0].kind,
        "rename"
    );
}
#[test]
fn delete_modify_keeps_both_versions_recoverable() {
    let p = Pair::new(&[("N.md", BASE.as_bytes())]);
    fs::remove_file(p.root("a").join("N.md")).unwrap();
    write(
        &p.root("b"),
        "N.md",
        BASE.replace("one", "changed").as_bytes(),
    );
    p.sync_b();
    let s = p.ea().sync(&Credentials::default()).unwrap();
    assert_eq!(s.conflicts[0].kind, "deleteModify");
    assert!(s.conflicts[0].local.is_none());
    assert!(s.conflicts[0].remote.is_some());
}
#[test]
fn binary_conflict_keep_both_creates_noncolliding_files() {
    let p = Pair::new(&[("N.md", BASE.as_bytes()), ("N.assets/a.bin", b"\0base")]);
    write(&p.root("a"), "N.assets/a.bin", b"\0LOCAL");
    write(&p.root("b"), "N.assets/a.bin", b"\0REMOTE");
    p.sync_b();
    let s = p.ea().sync(&Credentials::default()).unwrap();
    assert_eq!(s.conflicts[0].kind, "binary");
    p.ea().resolve(&s.conflicts[0].key, "both").unwrap();
    p.ea().sync(&Credentials::default()).unwrap();
    let bytes: Vec<_> = fs::read_dir(p.root("a").join("N.assets"))
        .unwrap()
        .map(|e| fs::read(e.unwrap().path()).unwrap())
        .collect();
    assert!(bytes.contains(&b"\0LOCAL".to_vec()));
    assert!(bytes.contains(&b"\0REMOTE".to_vec()));
}
#[test]
fn different_notes_added_at_same_path_conflict() {
    let p = Pair::new(&[("Base.md", b"base")]);
    write(&p.root("a"), "New.md", b"---\nid: local\n---\nL");
    write(&p.root("b"), "New.md", b"---\nid: remote\n---\nR");
    p.sync_b();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "conflict"
    );
}
#[test]
fn local_ahead_pushes_without_merge_commit() {
    let p = Pair::new(&[("N.md", b"base")]);
    write(&p.root("a"), "N.md", b"local");
    p.ea().sync(&Credentials::default()).unwrap();
    let repo = git2::Repository::open(p.root("a")).unwrap();
    assert_eq!(
        repo.head()
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .parent_count(),
        1
    );
}
#[test]
fn remote_ahead_fast_forwards_without_merge_commit() {
    let p = Pair::new(&[("N.md", b"base")]);
    write(&p.root("b"), "N.md", b"remote");
    p.sync_b();
    p.ea().sync(&Credentials::default()).unwrap();
    let a = git2::Repository::open(p.root("a")).unwrap();
    let b = git2::Repository::open(p.root("b")).unwrap();
    assert_eq!(a.head().unwrap().target(), b.head().unwrap().target());
}
#[test]
fn offline_snapshot_survives_and_reconnects() {
    let p = Pair::new(&[("N.md", b"base")]);
    write(&p.root("a"), "N.md", b"offline");
    let parked = p.remote.with_extension("parked");
    fs::rename(&p.remote, &parked).unwrap();
    assert!(p.ea().sync(&Credentials::default()).is_err());
    assert_eq!(p.read("N.md"), "offline");
    assert!(p.a.history(Some("N.md")).unwrap().len() >= 2);
    fs::rename(parked, &p.remote).unwrap();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "synced"
    );
}
#[test]
fn external_markdown_without_frontmatter_syncs_byte_for_byte() {
    let p = Pair::new(&[("N.md", b"plain\r\n")]);
    write(&p.root("b"), "N.md", b"external\r\n");
    p.sync_b();
    p.ea().sync(&Credentials::default()).unwrap();
    assert_eq!(p.read("N.md"), "external\r\n");
}
#[test]
fn unknown_yaml_competing_edits_remain_unresolved() {
    let raw = b"---\nid: stable\ncustom: original # comment\n---\nbody\n";
    let p = Pair::new(&[("N.md", raw)]);
    write(
        &p.root("a"),
        "N.md",
        b"---\nid: stable\ncustom: Local # comment\n---\nbody\n",
    );
    write(
        &p.root("b"),
        "N.md",
        b"---\nid: stable\ncustom: Remote # comment\n---\nbody\n",
    );
    p.sync_b();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "conflict"
    );
}
#[test]
fn duplicate_ids_block_identity_dependent_integration_without_mutation() {
    let p = Pair::new(&[("N.md", BASE.as_bytes())]);
    write(&p.root("a"), "Copy.md", BASE.as_bytes());
    write(
        &p.root("b"),
        "N.md",
        BASE.replace("one", "remote").as_bytes(),
    );
    p.sync_b();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap_err().code,
        "identityCollision"
    );
    assert_eq!(p.read("Copy.md"), BASE);
}
#[test]
fn concurrent_push_reenters_fetch_and_merge_without_force() {
    let p = Pair::new(&[("A.md", b"a"), ("B.md", b"b")]);
    write(&p.root("a"), "A.md", b"local");
    let mut pushed = false;
    let status = p
        .ea()
        .sync_with_hook(&Credentials::default(), || {
            if !pushed {
                pushed = true;
                write(&p.root("b"), "B.md", b"racing remote");
                p.sync_b();
            }
        })
        .unwrap();
    assert_eq!(status.phase, "synced");
    assert_eq!(p.read("A.md"), "local");
    assert_eq!(p.read("B.md"), "racing remote");
}
#[test]
fn external_edit_between_fetch_and_push_is_retained_and_reported() {
    let p = Pair::new(&[("N.md", b"original")]);
    let error = p
        .ea()
        .sync_with_hook(&Credentials::default(), || {
            write(&p.root("a"), "N.md", b"external edit during sync");
        })
        .unwrap_err();
    assert_eq!(error.code, "externalChange");
    assert_eq!(p.read("N.md"), "external edit during sync");
}
#[test]
fn expired_credentials_are_not_content_conflicts() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        let mut buffer = [0; 4096];
        assert!(socket.read(&mut buffer).unwrap() > 0);
        socket
            .write_all(
                b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            )
            .unwrap();
    });
    let d = tempdir().unwrap();
    let r = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    fs::write(d.path().join("N.md"), b"safe local").unwrap();
    let e = SyncEngine::new(&w, r.path());
    e.configure(
        &format!("http://127.0.0.1:{}/notes.git", address.port()),
        &identity(),
    )
    .unwrap();
    assert_eq!(
        e.sync(&Credentials {
            username: "writer".into(),
            token: "expired".into()
        })
        .unwrap_err()
        .code,
        "authenticationRequired"
    );
    server.join().unwrap();
    assert_ne!(e.status().unwrap().phase, "conflict");
    assert_eq!(fs::read(d.path().join("N.md")).unwrap(), b"safe local");
    assert!(
        !fs::read_to_string(r.path().join("sync.json"))
            .unwrap()
            .contains("expired")
    );
}
#[test]
fn default_branch_of_existing_remote_is_followed() {
    let p = Pair::new(&[("N.md", b"remote")]);
    let remote = git2::Repository::open_bare(&p.remote).unwrap();
    let head = remote
        .find_reference("refs/heads/main")
        .unwrap()
        .target()
        .unwrap();
    remote
        .reference("refs/heads/notes", head, false, "test")
        .unwrap();
    remote.set_head("refs/heads/notes").unwrap();
    let d = tempdir().unwrap();
    let r = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    let e = SyncEngine::new(&w, r.path());
    e.configure(p.remote.to_str().unwrap(), &identity())
        .unwrap();
    let status = e.sync(&Credentials::default()).unwrap();
    assert_eq!(status.branch.as_deref(), Some("notes"));
    assert_eq!(fs::read(d.path().join("N.md")).unwrap(), b"remote");
}
#[test]
fn retry_limit_preserves_all_local_work() {
    let p = Pair::new(&[("A.md", b"a"), ("B.md", b"b")]);
    write(&p.root("a"), "A.md", b"local");
    let mut pushes = 0;
    let error = p
        .ea()
        .sync_with_hook(&Credentials::default(), || {
            pushes += 1;
            write(&p.root("b"), "B.md", format!("remote {pushes}").as_bytes());
            p.sync_b();
        })
        .unwrap_err();
    assert_eq!(error.code, "remoteBusy");
    assert_eq!(pushes, 3);
    assert_eq!(p.read("A.md"), "local");
}
#[test]
fn ignored_directory_does_not_remove_previously_tracked_content() {
    let p = Pair::new(&[("Secret/Tracked.md", b"tracked")]);
    write(&p.root("a"), ".gitignore", b"Secret/\n");
    write(&p.root("a"), "Secret/Private.md", b"private");
    p.ea().sync(&Credentials::default()).unwrap();
    let repo = git2::Repository::open(p.root("a")).unwrap();
    let tree = repo.head().unwrap().peel_to_tree().unwrap();
    assert!(tree.get_path(Path::new("Secret/Tracked.md")).is_ok());
    assert!(tree.get_path(Path::new("Secret/Private.md")).is_err());
}
#[path = "support/http.rs"]
mod http;
#[test]
fn smart_http_push_fetch_and_merge_use_real_git_protocol() {
    let p = Pair::new(&[("N.md", BASE.as_bytes())]);
    let remote = git2::Repository::open_bare(&p.remote).unwrap();
    remote
        .config()
        .unwrap()
        .set_bool("http.receivepack", true)
        .unwrap();
    let server = http::Server::start(p._dir.path());
    p.ea().configure(&server.url, &identity()).unwrap();
    p.eb().configure(&server.url, &identity()).unwrap();
    write(
        &p.root("b"),
        "N.md",
        BASE.replace("three", "HTTP remote").as_bytes(),
    );
    p.sync_b();
    write(
        &p.root("a"),
        "N.md",
        BASE.replace("one", "HTTP local").as_bytes(),
    );
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "synced"
    );
    assert!(p.read("N.md").contains("HTTP local"));
    assert!(p.read("N.md").contains("HTTP remote"));
}
#[test]
fn editing_during_conflict_creates_recoverable_snapshot_before_resolution() {
    let p = Pair::new(&[("N.md", BASE.as_bytes())]);
    write(
        &p.root("a"),
        "N.md",
        BASE.replace("one", "LOCAL").as_bytes(),
    );
    write(
        &p.root("b"),
        "N.md",
        BASE.replace("one", "REMOTE").as_bytes(),
    );
    p.sync_b();
    p.ea().sync(&Credentials::default()).unwrap();
    write(
        &p.root("a"),
        "N.md",
        BASE.replace("one", "LATEST LOCAL").as_bytes(),
    );
    let s = p.ea().sync(&Credentials::default()).unwrap();
    assert!(
        s.conflicts[0]
            .local
            .as_ref()
            .unwrap()
            .text
            .as_ref()
            .unwrap()
            .contains("LATEST LOCAL")
    );
    p.ea().resolve(&s.conflicts[0].key, "local").unwrap();
    p.ea().sync(&Credentials::default()).unwrap();
    assert!(p.read("N.md").contains("LATEST LOCAL"));
}
#[test]
fn keep_both_notes_assigns_new_identity_and_copies_owned_assets() {
    let raw = format!("{BASE}\n![x](./N.assets/x.bin)\n");
    let p = Pair::new(&[("N.md", raw.as_bytes()), ("N.assets/x.bin", b"asset")]);
    write(&p.root("a"), "N.md", raw.replace("one", "LOCAL").as_bytes());
    write(
        &p.root("b"),
        "N.md",
        raw.replace("one", "REMOTE").as_bytes(),
    );
    p.sync_b();
    let s = p.ea().sync(&Credentials::default()).unwrap();
    p.ea().resolve(&s.conflicts[0].key, "both").unwrap();
    p.ea().sync(&Credentials::default()).unwrap();
    let notes: Vec<_> =
        p.a.scan()
            .unwrap()
            .into_iter()
            .filter(|e| e.kind == "note")
            .collect();
    assert_eq!(notes.len(), 2);
    assert_ne!(notes[0].id, notes[1].id);
    for n in notes {
        let body = p.a.read_note(&n.path).unwrap().body;
        let url = body.split("](").nth(1).unwrap().split(')').next().unwrap();
        assert_eq!(p.a.read_attachment(&n.path, url).unwrap().bytes, b"asset");
    }
}
#[test]
fn known_immutable_metadata_is_retained_when_one_side_loses_it() {
    let p = Pair::new(&[("N.md", BASE.as_bytes())]);
    write(
        &p.root("a"),
        "N.md",
        BASE.replace("created_at: 2026-10-21T00:00:00+00:00\n", "")
            .as_bytes(),
    );
    write(&p.root("b"), "Other.md", b"remote change");
    p.sync_b();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "synced"
    );
    let text = p.read("N.md");
    assert!(text.contains("created_at:"));
    assert!(text.contains("2026-10-21T00:00:00+00:00"));
}
#[test]
fn deleted_remote_branch_is_not_silently_recreated() {
    let p = Pair::new(&[("N.md", b"safe")]);
    p.ea().sync(&Credentials::default()).unwrap();
    let remote = git2::Repository::open_bare(&p.remote).unwrap();
    remote
        .find_reference("refs/heads/main")
        .unwrap()
        .delete()
        .unwrap();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap_err().code,
        "branchMissing"
    );
    assert!(remote.find_reference("refs/heads/main").is_err());
    assert_eq!(p.read("N.md"), "safe");
}
#[test]
fn opposing_renames_and_independent_additions_preserve_all_four_notes() {
    let p = Pair::new(&[("A.md", BASE.as_bytes())]);
    let a = p.a.read_note("A.md").unwrap();
    p.a.move_entry(&p.ra, "A.md", "", "L", Some(&a.revision))
        .unwrap();
    write(&p.root("a"), "R.md", b"---\nid: new-local\n---\nnew local");
    let b = p.b.read_note("A.md").unwrap();
    p.b.move_entry(&p.rb, "A.md", "", "R", Some(&b.revision))
        .unwrap();
    write(
        &p.root("b"),
        "L.md",
        b"---\nid: new-remote\n---\nnew remote",
    );
    p.sync_b();
    loop {
        let s = p.ea().sync(&Credentials::default()).unwrap();
        if s.phase == "synced" {
            break;
        }
        assert!(!s.conflicts.is_empty());
        for c in s.conflicts {
            p.ea().resolve(&c.key, "both").unwrap();
        }
    }
    let notes: Vec<_> =
        p.a.scan()
            .unwrap()
            .into_iter()
            .filter(|e| e.kind == "note")
            .collect();
    assert_eq!(notes.len(), 4);
    let bodies: Vec<_> = notes
        .iter()
        .map(|n| p.a.read_note(&n.path).unwrap().body)
        .collect();
    assert!(bodies.iter().any(|b| b == "new local"));
    assert!(bodies.iter().any(|b| b == "new remote"));
    assert!(notes.iter().any(|n| n.id.as_deref() == Some("new-remote")));
    assert!(notes.iter().any(|n| n.id.as_deref() == Some("new-local")));
}
#[test]
fn file_directory_collision_never_silently_drops_either_side() {
    let p = Pair::new(&[("N.md", b"base")]);
    write(&p.root("a"), "shared", b"valuable local file");
    write(&p.root("b"), "shared/note.md", b"valuable remote note");
    p.sync_b();
    let result = p.ea().sync(&Credentials::default());
    assert!(result.is_err() || result.as_ref().unwrap().phase == "conflict");
    assert_eq!(
        fs::read(p.root("a").join("shared")).unwrap(),
        b"valuable local file"
    );
}
#[test]
fn external_unfinished_git_merge_cannot_snapshot_or_push_markers() {
    let p = Pair::new(&[("N.md", b"base\n")]);
    let repo = git2::Repository::open(p.root("a")).unwrap();
    let base = repo.head().unwrap().peel_to_commit().unwrap();
    let mut index = git2::Index::new().unwrap();
    index.read_tree(&base.tree().unwrap()).unwrap();
    let mut entry = index.get_path(Path::new("N.md"), 0).unwrap();
    entry.id = repo.blob(b"remote topic\n").unwrap();
    index.add(&entry).unwrap();
    let tree = index.write_tree_to(&repo).unwrap();
    let sig = git2::Signature::now("Writer", "writer@example.test").unwrap();
    let topic = repo
        .commit(
            Some("refs/heads/topic"),
            &sig,
            &sig,
            "topic",
            &repo.find_tree(tree).unwrap(),
            &[&base],
        )
        .unwrap();
    write(&p.root("a"), "N.md", b"local main\n");
    p.a.checkpoint(&identity()).unwrap();
    let mut actual = repo.index().unwrap();
    actual
        .read_tree(&repo.head().unwrap().peel_to_tree().unwrap())
        .unwrap();
    actual.write().unwrap();
    repo.merge(&[&repo.find_annotated_commit(topic).unwrap()], None, None)
        .unwrap();
    assert_ne!(repo.state(), git2::RepositoryState::Clean);
    let markers = p.read("N.md");
    assert!(markers.contains("<<<<<<<"));
    let remote_before = git2::Repository::open_bare(&p.remote)
        .unwrap()
        .head()
        .unwrap()
        .target();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap_err().code,
        "externalGitOperation"
    );
    assert_eq!(p.read("N.md"), markers);
    assert_eq!(
        git2::Repository::open_bare(&p.remote)
            .unwrap()
            .head()
            .unwrap()
            .target(),
        remote_before
    );
}
#[cfg(unix)]
#[test]
fn interrupted_resolution_cleanup_cannot_reuse_choices_for_a_new_conflict() {
    use std::os::unix::fs::PermissionsExt;
    let p = Pair::new(&[("N.md", BASE.as_bytes())]);
    write(
        &p.root("a"),
        "N.md",
        BASE.replace("one", "LOCAL").as_bytes(),
    );
    write(
        &p.root("b"),
        "N.md",
        BASE.replace("one", "REMOTE").as_bytes(),
    );
    p.sync_b();
    let s = p.ea().sync(&Credentials::default()).unwrap();
    p.ea().resolve(&s.conflicts[0].key, "remote").unwrap();
    fs::set_permissions(&p.ra, fs::Permissions::from_mode(0o500)).unwrap();
    let result = p.ea().sync(&Credentials::default());
    fs::set_permissions(&p.ra, fs::Permissions::from_mode(0o700)).unwrap();
    assert!(result.is_err());
    p.ea().sync(&Credentials::default()).unwrap();
    p.sync_b();
    write(
        &p.root("a"),
        "N.md",
        p.read("N.md").replace("REMOTE", "FRESH LOCAL").as_bytes(),
    );
    write(
        &p.root("b"),
        "N.md",
        fs::read_to_string(p.root("b").join("N.md"))
            .unwrap()
            .replace("REMOTE", "FRESH REMOTE")
            .as_bytes(),
    );
    p.sync_b();
    let s = p.ea().sync(&Credentials::default()).unwrap();
    assert_eq!(s.phase, "conflict");
    assert!(p.read("N.md").contains("FRESH LOCAL"));
}
#[test]
fn file_directory_keep_both_has_a_resolvable_mobile_choice() {
    let p = Pair::new(&[("N.md", b"base")]);
    write(&p.root("a"), "shared", b"local file");
    write(&p.root("b"), "shared/note.md", b"remote note");
    p.sync_b();
    let status = p.ea().sync(&Credentials::default()).unwrap();
    assert_eq!(status.conflicts[0].kind, "path");
    p.ea().resolve(&status.conflicts[0].key, "both").unwrap();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "synced"
    );
    assert_eq!(fs::read(p.root("a").join("shared")).unwrap(), b"local file");
    assert!(
        p.a.scan()
            .unwrap()
            .iter()
            .any(|e| e.path == "shared (remote 1)/note.md")
    );
}
#[cfg(unix)]
#[test]
fn remote_permission_only_change_is_installed_without_reverting_it() {
    use std::os::unix::fs::PermissionsExt;
    let p = Pair::new(&[("N.md", b"base"), ("N.assets/run.sh", b"echo hello\n")]);
    fs::set_permissions(
        p.root("b").join("N.assets/run.sh"),
        fs::Permissions::from_mode(0o755),
    )
    .unwrap();
    p.sync_b();
    assert_eq!(
        p.ea().sync(&Credentials::default()).unwrap().phase,
        "synced"
    );
    assert_eq!(
        fs::metadata(p.root("a").join("N.assets/run.sh"))
            .unwrap()
            .permissions()
            .mode()
            & 0o111,
        0o111
    );
}
#[test]
fn probe_reports_default_branch_for_populated_remote() {
    let p = Pair::new(&[("N.md", BASE.as_bytes())]);
    git2::Repository::open_bare(&p.remote)
        .unwrap()
        .config()
        .unwrap()
        .set_bool("http.receivepack", true)
        .unwrap();
    let server = http::Server::start(p._dir.path());
    let probe = probe_remote(&server.url, &Credentials::default()).unwrap();
    assert!(!probe.empty);
    assert_eq!(probe.default_branch.as_deref(), Some("main"));
    let local = probe_remote(p.remote.to_str().unwrap(), &Credentials::default()).unwrap();
    assert_eq!(local.default_branch.as_deref(), Some("main"));
}
#[test]
fn probe_reports_empty_remote() {
    let dir = tempdir().unwrap();
    git2::Repository::init_bare(dir.path().join("remote.git"))
        .unwrap()
        .config()
        .unwrap()
        .set_bool("http.receivepack", true)
        .unwrap();
    let server = http::Server::start(dir.path());
    let probe = probe_remote(&server.url, &Credentials::default()).unwrap();
    assert!(probe.empty);
    assert_eq!(probe.default_branch, None);
}
#[test]
fn probe_distinguishes_push_denied_missing_and_unsupported_remotes() {
    let dir = tempdir().unwrap();
    git2::Repository::init_bare(dir.path().join("remote.git"))
        .unwrap()
        .config()
        .unwrap()
        .set_bool("http.receivepack", false)
        .unwrap();
    let server = http::Server::start(dir.path());
    let code = |url: &str| probe_remote(url, &Credentials::default()).unwrap_err().code;
    assert_eq!(code(&server.url), "pushDenied");
    assert_eq!(
        code(&server.url.replace("remote.git", "absent.git")),
        "remoteMissing"
    );
    assert_eq!(
        code("https://user:pw@example.com/r.git"),
        "unsupportedRemote"
    );
    assert_eq!(code("http://example.com/r.git"), "unsupportedRemote");
    assert_eq!(code(""), "unsupportedRemote");
    assert_eq!(code("http://127.0.0.1:9/r.git"), "offline");
}
