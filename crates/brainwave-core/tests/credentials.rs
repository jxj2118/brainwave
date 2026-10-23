use brainwave_core::sync::{CredentialStore, Credentials};
fn sample() -> Credentials {
    Credentials {
        username: "writer".into(),
        token: "secret-token".into(),
    }
}
#[test]
fn round_trip_persists_across_instances_and_never_stores_plaintext() {
    let dir = tempfile::tempdir().unwrap();
    CredentialStore::new(dir.path()).save(&sample()).unwrap();
    assert_eq!(CredentialStore::new(dir.path()).load(), Some(sample()));
    let raw = std::fs::read(dir.path().join("credentials.bin")).unwrap();
    assert!(!raw.windows(12).any(|w| w == b"secret-token"));
    assert!(!format!("{:?}", sample()).contains("secret-token"));
}
#[test]
fn tampered_or_missing_files_load_as_none() {
    let dir = tempfile::tempdir().unwrap();
    let store = CredentialStore::new(dir.path());
    assert_eq!(store.load(), None);
    store.save(&sample()).unwrap();
    let path = dir.path().join("credentials.bin");
    let mut raw = std::fs::read(&path).unwrap();
    let last = raw.len() - 1;
    raw[last] ^= 1;
    std::fs::write(&path, raw).unwrap();
    assert_eq!(store.load(), None);
    store.save(&sample()).unwrap();
    std::fs::write(dir.path().join("credentials.key"), b"short").unwrap();
    assert_eq!(store.load(), None);
    std::fs::write(&path, b"tiny").unwrap();
    assert_eq!(store.load(), None);
}
#[test]
fn replacing_a_lost_key_makes_old_ciphertext_unreadable_but_new_saves_work() {
    let dir = tempfile::tempdir().unwrap();
    let store = CredentialStore::new(dir.path());
    store.save(&sample()).unwrap();
    std::fs::remove_file(dir.path().join("credentials.key")).unwrap();
    assert_eq!(store.load(), None);
    store.save(&sample()).unwrap();
    assert_eq!(store.load(), Some(sample()));
}
#[test]
fn clear_removes_credentials() {
    let dir = tempfile::tempdir().unwrap();
    let store = CredentialStore::new(dir.path());
    store.save(&sample()).unwrap();
    store.clear().unwrap();
    assert_eq!(store.load(), None);
    store.clear().unwrap();
}
#[cfg(unix)]
#[test]
fn files_are_private() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    CredentialStore::new(dir.path()).save(&sample()).unwrap();
    for name in ["credentials.key", "credentials.bin"] {
        let mode = std::fs::metadata(dir.path().join(name))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600, "{name}");
    }
}
