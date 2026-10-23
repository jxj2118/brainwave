use brainwave_core::{Draft, DraftStore};
use tempfile::tempdir;
#[test]
fn editing_another_note_after_restart_keeps_each_unsaved_recovery_copy() {
    let dir = tempdir().unwrap();
    let store = DraftStore::new(dir.path());
    store
        .write(&Draft {
            path: "A.md".into(),
            body: "unsaved A".into(),
            revision: "a1".into(),
        })
        .unwrap();
    let restarted = DraftStore::new(dir.path());
    restarted
        .write(&Draft {
            path: "B.md".into(),
            body: "unsaved B".into(),
            revision: "b1".into(),
        })
        .unwrap();
    assert_eq!(restarted.read("A.md").unwrap().unwrap().body, "unsaved A");
    restarted.clear("B.md").unwrap();
    assert_eq!(restarted.read("A.md").unwrap().unwrap().body, "unsaved A");
    assert!(restarted.read("B.md").unwrap().is_none());
}
