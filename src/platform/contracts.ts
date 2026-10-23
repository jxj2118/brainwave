export interface Note {
  path: string;
  body: string;
  revision: string;
  id: string | null;
}
export interface Entry {
  path: string;
  name: string;
  kind: "folder" | "note";
  id: string | null;
  identityCollision: boolean;
  issue?: string | null;
}
export type Locale = "zh-CN" | "en";
export type Theme = "system" | "light" | "dark";
export interface Preferences {
  locale: Locale;
  theme: Theme;
}
export interface NoteStorage {
  scan(): Promise<Entry[]>;
  readNote(path: string): Promise<Note>;
  createNote(folder: string, name: string): Promise<Note>;
  saveNote(path: string, body: string, expectedRevision: string): Promise<Note>;
  createFolder(folder: string, name: string): Promise<void>;
}
export interface Platform {
  kind: "native" | "web";
  notes: NoteStorage | null;
  drafts?: DraftStorage;
  files?: FileOperations;
  attachments?: AttachmentStorage;
  history?: HistoryStorage;
  sync?: SyncStorage;
  loadPreferences(): Promise<Partial<Preferences>>;
  savePreferences(value: Preferences): Promise<void>;
  localState: LocalStateStorage;
}
export interface RecentEntry {
  path: string;
  at: number;
}
/** Disposable per-device UI state. Never stored in the workspace. */
export interface UiState {
  recent: RecentEntry[];
  expanded: string[];
  sidebarCollapsed: boolean;
}
export interface LocalStateStorage {
  load(): Promise<Partial<UiState>>;
  save(value: UiState): Promise<void>;
}
export function errorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  )
    return error.code;
  return "io";
}
export interface Draft {
  path: string;
  body: string;
  revision: string;
}
export interface DraftStorage {
  read(path: string): Promise<Draft | null>;
  write(value: Draft): Promise<void>;
  clear(path: string): Promise<void>;
}

export interface FileOperations {
  move(
    path: string,
    folder: string,
    name: string,
    revision?: string,
  ): Promise<string>;
  delete(path: string, revision?: string): Promise<void>;
}
export interface AttachmentInput {
  name: string;
  bytes: Uint8Array;
}
export interface Attachment {
  name: string;
  url: string;
  size: number;
}
export interface AttachmentContent {
  url: string;
  mime: string;
  release(): void;
}
export interface AttachmentStorage {
  pick(): Promise<AttachmentInput | null>;
  import(note: string, input: AttachmentInput): Promise<Attachment>;
  read(note: string, url: string): Promise<AttachmentContent>;
  open(note: string, url: string): Promise<void>;
}
export interface HistoryEntry {
  oid: string;
  message: string;
  author: string;
  timestamp: number;
  path: string | null;
}
export interface HistoryStorage {
  list(path?: string): Promise<HistoryEntry[]>;
  version(commit: string, path: string): Promise<string>;
  checkpoint(): Promise<string | null>;
}
export interface SyncConfiguration {
  remote: string;
  name: string;
  email: string;
  branch: string | null;
}
export interface ConflictVersion {
  path: string;
  text: string | null;
  size: number;
}
export interface SyncConflict {
  key: string;
  kind: string;
  base: ConflictVersion | null;
  local: ConflictVersion | null;
  remote: ConflictVersion | null;
  baseFiles?: ConflictVersion[];
  localFiles?: ConflictVersion[];
  remoteFiles?: ConflictVersion[];
}
export interface SyncStatus {
  phase: "local" | "localChanges" | "idle" | "synced" | "conflict";
  head: string | null;
  branch: string | null;
  conflicts: SyncConflict[];
  configuration: SyncConfiguration;
}
export interface SyncStorage {
  status(): Promise<SyncStatus>;
  configure(
    value: SyncConfiguration,
    username: string,
    token: string,
  ): Promise<void>;
  run(): Promise<SyncStatus>;
  resolve(
    key: string,
    choice: "local" | "remote" | "both",
  ): Promise<SyncStatus>;
  /** An empty token means "use the stored token". */
  test(remote: string, username: string, token: string): Promise<RemoteProbe>;
  credentials(): Promise<StoredCredentials>;
  clearCredentials(): Promise<void>;
}
export interface RemoteProbe {
  defaultBranch: string | null;
  empty: boolean;
}
export interface StoredCredentials {
  username: string;
  hasToken: boolean;
}
