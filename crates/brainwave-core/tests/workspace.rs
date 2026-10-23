use brainwave_core::Workspace;
use std::fs;
use tempfile::tempdir;

#[test]
fn reading_plain_markdown_is_byte_preserving() {
    let dir = tempdir().unwrap();
    let w = Workspace::init(dir.path()).unwrap();
    fs::write(dir.path().join("Plain.md"), "# Hello\nworld\n").unwrap();
    let note = w.read_note("Plain.md").unwrap();
    assert_eq!(note.body, "# Hello\nworld\n");
    assert_eq!(note.id, None);
    assert_eq!(
        fs::read_to_string(dir.path().join("Plain.md")).unwrap(),
        "# Hello\nworld\n"
    );
    assert_eq!(w.scan().unwrap().len(), 1);
    assert!(!dir.path().join(".brainwave").exists());
}

#[test]
fn creates_real_notes_with_uuid_v7_and_offset_timestamp() {
    let dir = tempdir().unwrap();
    let w = Workspace::init(dir.path()).unwrap();
    w.create_folder("", "想法").unwrap();
    let n = w.create_note("想法", "我的笔记").unwrap();
    assert_eq!(n.path, "想法/我的笔记.md");
    let id = uuid::Uuid::parse_str(n.id.as_ref().unwrap()).unwrap();
    assert_eq!(id.get_version_num(), 7);
    let text = fs::read_to_string(dir.path().join(&n.path)).unwrap();
    assert!(text.contains("created_at:"));
    assert!(text.contains("+00:00"));
    assert!(dir.path().join(".git/HEAD").exists());
    assert!(w.create_note("想法", "我的笔记").is_err());
}

#[test]
fn first_save_preserves_unknown_yaml_comments_order_and_crlf() {
    let dir = tempdir().unwrap();
    let w = Workspace::init(dir.path()).unwrap();
    let original = "\u{feff}---\r\n# comment\r\naliases: [One, Two]\r\ncssclasses:\r\n  - wide\r\n---\r\nOld\r\n";
    fs::write(dir.path().join("External.md"), original).unwrap();
    let n = w.read_note("External.md").unwrap();
    let saved = w.save_note(&n.path, "New\r\n", &n.revision).unwrap();
    let text = fs::read_to_string(dir.path().join(&n.path)).unwrap();
    assert!(text.starts_with(
        "\u{feff}---\r\n# comment\r\naliases: [One, Two]\r\ncssclasses:\r\n  - wide\r\n"
    ));
    assert!(text.ends_with("---\r\nNew\r\n"));
    assert!(!text.contains("created_at:"));
    let second = w.save_note(&n.path, "Again", &saved.revision).unwrap();
    assert_eq!(saved.id, second.id);
}

#[test]
fn preserves_existing_id_and_refuses_overwriting_external_edits() {
    let dir = tempdir().unwrap();
    let w = Workspace::init(dir.path()).unwrap();
    fs::write(
        dir.path().join("N.md"),
        "---\nid: existing\ncustom: 'keep' # exact\n---\none",
    )
    .unwrap();
    let n = w.read_note("N.md").unwrap();
    fs::write(dir.path().join("N.md"), "changed elsewhere").unwrap();
    assert_eq!(
        w.save_note(&n.path, "stale", &n.revision).unwrap_err().code,
        "externalChange"
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("N.md")).unwrap(),
        "changed elsewhere"
    );
}

#[test]
fn rejects_paths_outside_workspace_and_reserved_or_ambiguous_names() {
    let dir = tempdir().unwrap();
    let w = Workspace::init(dir.path()).unwrap();
    for name in [
        "../escape",
        "a/b",
        "a\\b",
        ".git",
        "",
        "a.",
        " a",
        "CON",
        "NUL.md",
    ] {
        assert!(w.create_note("", name).is_err(), "accepted {name}");
    }
    assert!(w.create_note("../", "outside").is_err());
    assert!(w.read_note(".git/config").is_err());
    assert!(w.read_note("/etc/passwd").is_err());
}

#[test]
fn duplicate_id_scan_never_repairs_or_mutates_content() {
    let dir = tempdir().unwrap();
    let w = Workspace::init(dir.path()).unwrap();
    let raw = "---\nid: same\n---\nbody";
    for name in ["A.md", "B.md"] {
        fs::write(dir.path().join(name), raw).unwrap();
    }
    let entries = w.scan().unwrap();
    assert_eq!(entries.len(), 2);
    assert!(entries.iter().all(|e| e.identity_collision));
    for name in ["A.md", "B.md"] {
        assert_eq!(fs::read_to_string(dir.path().join(name)).unwrap(), raw);
    }
}

#[test]
fn malformed_or_flow_frontmatter_is_never_rewritten_on_save() {
    let dir = tempdir().unwrap();
    let w = Workspace::init(dir.path()).unwrap();
    for raw in [
        "---\naliases: [broken\n---\ntext",
        "---\n{aliases: [One]}\n---\ntext",
    ] {
        fs::write(dir.path().join("N.md"), raw).unwrap();
        let n = w.read_note("N.md").unwrap();
        assert!(w.save_note("N.md", "edit", &n.revision).is_err());
        assert_eq!(fs::read_to_string(dir.path().join("N.md")).unwrap(), raw);
    }
}

#[cfg(unix)]
#[test]
fn symlinks_cannot_escape_scan_or_write_boundaries() {
    use std::os::unix::fs::symlink;
    let dir = tempdir().unwrap();
    let other = tempdir().unwrap();
    let w = Workspace::init(dir.path()).unwrap();
    fs::write(other.path().join("secret.md"), "private").unwrap();
    symlink(other.path(), dir.path().join("linked")).unwrap();
    symlink(other.path().join("secret.md"), dir.path().join("link.md")).unwrap();
    assert!(w.read_note("linked/secret.md").is_err());
    assert!(w.create_note("linked", "overwrite").is_err());
    assert!(w.scan().unwrap().is_empty());
}

#[test]
fn one_invalid_note_does_not_hide_all_healthy_notes() {
    let dir = tempdir().unwrap();
    let w = Workspace::init(dir.path()).unwrap();
    fs::write(dir.path().join("Good.md"), "healthy").unwrap();
    fs::write(dir.path().join("Bad.md"), [0xff, 0xfe, 0xff]).unwrap();
    let entries = w.scan().unwrap();
    assert!(entries.iter().any(|e| e.path == "Good.md"));
    assert!(entries.iter().any(|e| e.path == "Bad.md"));
}

#[test]
fn size_rejection_happens_before_modifying_the_existing_file() {
    let dir = tempdir().unwrap();
    let w = Workspace::init(dir.path()).unwrap();
    let note = w.create_note("", "Size").unwrap();
    let original = fs::read(dir.path().join("Size.md")).unwrap();
    let body = "a".repeat(8 * 1024 * 1024);
    assert_eq!(
        w.save_note("Size.md", &body, &note.revision)
            .unwrap_err()
            .code,
        "noteTooLarge"
    );
    assert!(
        fs::read(dir.path().join("Size.md")).unwrap() == original,
        "rejected save modified original"
    );
}
