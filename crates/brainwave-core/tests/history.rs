use brainwave_core::{Identity, Workspace};
use std::fs;
use tempfile::tempdir;
#[test]
fn snapshots_preserve_user_index_and_history_follows_stable_identity() {
    let d = tempdir().unwrap();
    let r = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    let identity = Identity {
        name: "Test".into(),
        email: "test@example.com".into(),
    };
    let n = w.create_note("", "A").unwrap();
    let n = w.save_note(&n.path, "one", &n.revision).unwrap();
    fs::write(d.path().join(".gitignore"), "ignored.md\n").unwrap();
    fs::write(d.path().join("ignored.md"), "private").unwrap();
    let repo = git2::Repository::open(d.path()).unwrap();
    let mut index = repo.index().unwrap();
    index.add_path(std::path::Path::new("A.md")).unwrap();
    index.write().unwrap();
    let staged = fs::read(d.path().join(".git/index")).unwrap();
    let first = w.checkpoint(&identity).unwrap().unwrap();
    assert_eq!(fs::read(d.path().join(".git/index")).unwrap(), staged);
    assert!(
        repo.head()
            .unwrap()
            .peel_to_tree()
            .unwrap()
            .get_name("ignored.md")
            .is_none()
    );
    assert!(w.checkpoint(&identity).unwrap().is_none());
    w.move_entry(r.path(), &n.path, "", "B", Some(&n.revision))
        .unwrap();
    w.checkpoint(&identity).unwrap();
    let h = w.history(Some("B.md")).unwrap();
    assert_eq!(h.len(), 2);
    assert_eq!(h[1].path.as_deref(), Some("A.md"));
    assert!(w.version(&first, "A.md").unwrap().ends_with("one"));
}
#[test]
fn imported_note_history_before_id_introduction_remains_visible() {
    let d = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    let i = Identity {
        name: "Writer".into(),
        email: "writer@example.test".into(),
    };
    fs::write(d.path().join("N.md"), "original import").unwrap();
    let first = w.checkpoint(&i).unwrap().unwrap();
    let n = w.read_note("N.md").unwrap();
    w.save_note("N.md", "first Brainwave edit", &n.revision)
        .unwrap();
    w.checkpoint(&i).unwrap();
    let h = w.history(Some("N.md")).unwrap();
    assert_eq!(h.len(), 2);
    assert!(h.iter().any(|v| v.oid == first));
}
#[test]
fn history_does_not_cross_deleted_paths_or_unrelated_identities() {
    let d = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    let i = Identity {
        name: "Writer".into(),
        email: "writer@example.test".into(),
    };
    fs::write(d.path().join("N.md"), "older unrelated import").unwrap();
    w.checkpoint(&i).unwrap();
    fs::remove_file(d.path().join("N.md")).unwrap();
    w.checkpoint(&i).unwrap();
    let n = w.create_note("", "N").unwrap();
    w.save_note(&n.path, "new identity", &n.revision).unwrap();
    w.checkpoint(&i).unwrap();
    assert_eq!(w.history(Some("N.md")).unwrap().len(), 1);
}
