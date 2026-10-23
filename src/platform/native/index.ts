import { pickAttachment, attachmentBlob } from "../file-picker";
import { invoke } from "@tauri-apps/api/core";
import type {
  Draft,
  Entry,
  Note,
  Platform,
  Preferences,
  Attachment,
  HistoryEntry,
  SyncStatus,
  RemoteProbe,
  StoredCredentials,
  UiState,
} from "../contracts";
export const nativePlatform: Platform = {
  kind: "native",
  notes: {
    scan: () => invoke<Entry[]>("scan_notes"),
    readNote: (path) => invoke<Note>("read_note", { path }),
    createNote: (folder, name) => invoke<Note>("create_note", { folder, name }),
    saveNote: (path, body, expectedRevision) =>
      invoke<Note>("save_note", { path, body, expectedRevision }),
    createFolder: (folder, name) =>
      invoke<void>("create_folder", { folder, name }),
  },
  files: {
    move: (path, folder, name, expectedRevision) =>
      invoke<string>("move_entry", { path, folder, name, expectedRevision }),
    delete: (path, expectedRevision) =>
      invoke<void>("delete_entry", { path, expectedRevision }),
  },
  attachments: {
    pick: pickAttachment,
    open: (note, url) => invoke<void>("open_attachment", { note, url }),
    import: (note, input) =>
      invoke<Attachment>("import_attachment", {
        note,
        name: input.name,
        bytes: Array.from(input.bytes),
      }),
    read: async (note, url) => {
      const value = await invoke<{ bytes: number[]; mime: string }>(
        "read_attachment",
        { note, url },
      );
      return attachmentBlob(value.bytes, value.mime);
    },
  },
  history: {
    list: (path) => invoke<HistoryEntry[]>("note_history", { path }),
    version: (commit, path) => invoke<string>("read_version", { commit, path }),
    checkpoint: () => invoke<string | null>("checkpoint"),
  },
  sync: {
    status: () => invoke<SyncStatus>("sync_status"),
    configure: (value, username, token) =>
      invoke<void>("configure_sync", {
        remote: value.remote,
        name: value.name,
        email: value.email,
        username,
        token,
      }),
    run: () => invoke<SyncStatus>("sync_now"),
    resolve: (key, choice) =>
      invoke<SyncStatus>("resolve_conflict", { key, choice }),
    test: (remote, username, token) =>
      invoke<RemoteProbe>("test_sync_remote", { remote, username, token }),
    credentials: () => invoke<StoredCredentials>("sync_credentials"),
    clearCredentials: () => invoke<void>("clear_sync_credentials"),
  },
  drafts: {
    read: (path) => invoke<Draft | null>("read_draft", { path }),
    write: (value) => invoke<void>("write_draft", { value }),
    clear: (path) => invoke<void>("clear_draft", { path }),
  },
  loadPreferences: () => invoke<Partial<Preferences>>("load_preferences"),
  savePreferences: (value) => invoke("save_preferences", { value }),
  localState: {
    load: () => invoke<Partial<UiState>>("load_ui_state"),
    save: (value) => invoke<void>("save_ui_state", { value }),
  },
};
