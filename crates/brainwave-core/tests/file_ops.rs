use brainwave_core::Workspace;
use std::fs;
use tempfile::tempdir;

#[test]
fn rename_move_and_delete_preserve_identity_and_owned_assets_only() {
    let d = tempdir().unwrap();
    let runtime = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    w.create_folder("", "Next").unwrap();
    let n = w.create_note("", "My note").unwrap();
    let a = w.import_attachment(&n.path, "a b.png", b"image").unwrap();
    assert_eq!(a.url, "./My%20note.assets/a%20b.png");
    fs::write(d.path().join("shared.png"), b"external").unwrap();
    let n = w
        .save_note(
            &n.path,
            &format!(
                "![x]({})\n[external](./shared.png)\n`![code](./My%20note.assets/a%20b.png)`",
                a.url
            ),
            &n.revision,
        )
        .unwrap();
    let moved = w
        .move_entry(
            runtime.path(),
            &n.path,
            "Next",
            "Renamed",
            Some(&n.revision),
        )
        .unwrap();
    assert_eq!(moved, "Next/Renamed.md");
    let read = w.read_note(&moved).unwrap();
    assert_eq!(read.id, n.id);
    assert!(read.body.contains("./Renamed.assets/a%20b.png"));
    assert!(read.body.contains("../shared.png"));
    assert!(
        read.body
            .contains("`![code](./My%20note.assets/a%20b.png)`")
    );
    assert_eq!(
        w.read_attachment(&moved, "./Renamed.assets/a%20b.png")
            .unwrap()
            .bytes,
        b"image"
    );
    assert!(!d.path().join("My note.assets").exists());
    w.delete_entry(runtime.path(), &moved, Some(&read.revision))
        .unwrap();
    assert!(!d.path().join(&moved).exists());
    assert!(!d.path().join("Next/Renamed.assets").exists());
    assert!(d.path().join("shared.png").exists());
}
#[test]
fn preflight_collisions_external_edits_and_unsafe_paths_leave_original_intact() {
    let d = tempdir().unwrap();
    let r = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    let n = w.create_note("", "A").unwrap();
    w.import_attachment(&n.path, "x", b"one").unwrap();
    w.create_note("", "Taken").unwrap();
    assert!(
        w.move_entry(r.path(), &n.path, "", "Taken", Some(&n.revision))
            .is_err()
    );
    fs::write(d.path().join("A.md"), "external").unwrap();
    assert_eq!(
        w.delete_entry(r.path(), &n.path, Some(&n.revision))
            .unwrap_err()
            .code,
        "externalChange"
    );
    assert!(
        w.move_entry(r.path(), &n.path, "../", "Escape", None)
            .is_err()
    );
    assert!(d.path().join("A.assets/x").exists());
    assert_eq!(
        fs::read_to_string(d.path().join("A.md")).unwrap(),
        "external"
    );
}
#[test]
fn attachment_names_are_unique_and_reads_cannot_escape_ownership() {
    let d = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    let n = w.create_note("", "A").unwrap();
    let a = w.import_attachment(&n.path, "photo.png", b"one").unwrap();
    let b = w.import_attachment(&n.path, "photo.png", b"two").unwrap();
    assert_ne!(a.url, b.url);
    assert_eq!(w.read_attachment(&n.path, &a.url).unwrap().bytes, b"one");
    assert!(w.import_attachment(&n.path, "../secret", b"x").is_err());
    assert!(w.read_attachment(&n.path, "../A.md").is_err());
    assert!(
        w.read_attachment(&n.path, "./A.assets/%2e%2e/A.md")
            .is_err()
    );
    assert!(
        w.import_attachment(&n.path, "large.bin", &vec![0; 20 * 1024 * 1024 + 1])
            .is_err()
    );
}
#[test]
fn folders_move_as_real_trees_and_cannot_move_into_themselves() {
    let d = tempdir().unwrap();
    let r = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    w.create_folder("", "Work").unwrap();
    w.create_folder("Work", "Sub").unwrap();
    let n = w.create_note("Work/Sub", "N").unwrap();
    w.import_attachment(&n.path, "x", b"x").unwrap();
    assert!(
        w.move_entry(r.path(), "Work", "Work/Sub", "Nested", None)
            .is_err()
    );
    assert_eq!(
        w.move_entry(r.path(), "Work", "", "New", None).unwrap(),
        "New"
    );
    assert!(d.path().join("New/Sub/N.assets/x").exists());
    w.delete_entry(r.path(), "New", None).unwrap();
    assert!(!d.path().join("New").exists());
}
#[cfg(unix)]
#[test]
fn asset_symlink_is_rejected_before_note_move_or_delete() {
    use std::os::unix::fs::symlink;
    let d = tempdir().unwrap();
    let r = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    let n = w.create_note("", "N").unwrap();
    symlink(outside.path(), d.path().join("N.assets")).unwrap();
    assert!(
        w.move_entry(r.path(), &n.path, "", "Moved", Some(&n.revision))
            .is_err()
    );
    assert!(
        w.delete_entry(r.path(), &n.path, Some(&n.revision))
            .is_err()
    );
    assert!(d.path().join("N.md").exists());
}
#[test]
fn interrupted_move_recovers_owned_pair_and_rewrites_links() {
    let d = tempdir().unwrap();
    let runtime = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    let n = w.create_note("", "Old").unwrap();
    let a = w.import_attachment(&n.path, "x.png", b"asset").unwrap();
    let n = w
        .save_note(&n.path, &format!("![x]({})", a.url), &n.revision)
        .unwrap();
    let old = fs::read_to_string(d.path().join(&n.path)).unwrap();
    let new = old.replace("./Old.assets/", "./New.assets/");
    let root = d.path().canonicalize().unwrap();
    let journal = serde_json::json!({"root":root,"moves":[[root.join("Old.md"),root.join("New.md")],[root.join("Old.assets"),root.join("New.assets")]],"rewrite":[root.join("New.md"),old,new]});
    fs::write(
        runtime.path().join("file-operation.json"),
        serde_json::to_vec(&journal).unwrap(),
    )
    .unwrap();
    fs::rename(root.join("Old.md"), root.join("New.md")).unwrap();
    w.recover_file_operation(runtime.path()).unwrap();
    assert!(root.join("New.assets/x.png").exists());
    assert!(
        w.read_note("New.md")
            .unwrap()
            .body
            .contains("./New.assets/x.png")
    );
    assert!(!runtime.path().join("file-operation.json").exists());
}
#[test]
fn a_regular_file_at_assets_path_is_not_silently_treated_as_owned_directory() {
    let d = tempdir().unwrap();
    let r = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    let n = w.create_note("", "N").unwrap();
    fs::write(d.path().join("N.assets"), b"external file").unwrap();
    assert!(
        w.delete_entry(r.path(), &n.path, Some(&n.revision))
            .is_err()
    );
    assert!(d.path().join("N.md").exists());
    assert_eq!(
        fs::read(d.path().join("N.assets")).unwrap(),
        b"external file"
    );
}
#[test]
fn destination_assets_cannot_be_adopted_by_an_unrelated_renamed_note() {
    let d = tempdir().unwrap();
    let r = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    let n = w.create_note("", "A").unwrap();
    fs::create_dir(d.path().join("B.assets")).unwrap();
    fs::write(d.path().join("B.assets/valuable.bin"), b"unrelated").unwrap();
    assert_eq!(
        w.move_entry(r.path(), "A.md", "", "B", Some(&n.revision))
            .unwrap_err()
            .code,
        "alreadyExists"
    );
    assert!(d.path().join("A.md").exists());
    assert_eq!(
        fs::read(d.path().join("B.assets/valuable.bin")).unwrap(),
        b"unrelated"
    );
}
#[test]
fn rename_changes_link_destination_and_preserves_identical_title_text() {
    let d = tempdir().unwrap();
    let r = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    let n = w.create_note("", "A").unwrap();
    w.import_attachment("A.md", "image.png", b"image").unwrap();
    let n = w
        .save_note(
            "A.md",
            "[image](./A.assets/image.png \"./A.assets/image.png\")",
            &n.revision,
        )
        .unwrap();
    w.move_entry(r.path(), "A.md", "", "B", Some(&n.revision))
        .unwrap();
    assert_eq!(
        w.read_note("B.md").unwrap().body,
        "[image](./B.assets/image.png \"./A.assets/image.png\")"
    );
}
#[test]
fn folder_move_preserves_external_and_internal_markdown_link_targets() {
    let d = tempdir().unwrap();
    let r = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    w.create_folder("", "Work").unwrap();
    w.create_folder("", "Projects").unwrap();
    fs::write(d.path().join("shared.txt"), b"outside").unwrap();
    let n = w.create_note("Work", "N").unwrap();
    w.create_note("Work", "Other").unwrap();
    let n = w
        .save_note(
            &n.path,
            "[external](../shared.txt)\n[internal](./Other.md)",
            &n.revision,
        )
        .unwrap();
    w.move_entry(r.path(), "Work", "Projects", "Moved", None)
        .unwrap();
    let moved = w.read_note("Projects/Moved/N.md").unwrap();
    assert_eq!(moved.id, n.id);
    assert_eq!(
        moved.body,
        "[external](../../shared.txt)\n[internal](./Other.md)"
    );
}
#[test]
fn reference_link_destination_changes_without_rewriting_its_title_or_code() {
    let d = tempdir().unwrap();
    let r = tempdir().unwrap();
    let w = Workspace::init(d.path()).unwrap();
    let n = w.create_note("", "A").unwrap();
    w.import_attachment("A.md", "x.png", b"image").unwrap();
    let n=w.save_note("A.md","![x][image]\n\n[image]: ./A.assets/x.png \"./A.assets/x.png\"\n\n`[code](./A.assets/x.png)`",&n.revision).unwrap();
    w.move_entry(r.path(), "A.md", "", "B", Some(&n.revision))
        .unwrap();
    let body = w.read_note("B.md").unwrap().body;
    assert!(body.contains("[image]: ./B.assets/x.png \"./A.assets/x.png\""));
    assert!(body.contains("`[code](./A.assets/x.png)`"));
}
