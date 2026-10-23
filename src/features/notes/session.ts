import type { Note, NoteStorage, DraftStorage } from "../../platform/contracts";

export interface EditorSnapshot {
  note: Note | null;
  body: string;
  status: "saved" | "dirty" | "saving" | "error";
  error: unknown;
}
export class EditorSession {
  private state: EditorSnapshot = {
    note: null,
    body: "",
    status: "saved",
    error: null,
  };
  private saving: Promise<void> | null = null;
  private backups: Promise<void> = Promise.resolve();
  private navigation: Promise<void> = Promise.resolve();
  constructor(
    private storage: NoteStorage,
    private changed: (value: EditorSnapshot) => void = () => {},
    private drafts?: DraftStorage,
  ) {}
  get snapshot() {
    return this.state;
  }
  private publish(patch: Partial<EditorSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  open(path: string): Promise<void> {
    const next = this.navigation.then(async () => {
      await this.flush();
      const note = await this.storage.readNote(path);
      // An edit may arrive while the next file is being read.
      await this.flush();
      await this.backups;
      const draft = await this.drafts?.read(path);
      const restored = draft && draft.body !== note.body;
      const conflict = restored && draft.revision !== note.revision;
      this.publish({
        note: conflict ? { ...note, revision: draft.revision } : note,
        body: restored ? draft.body : note.body,
        status: conflict ? "error" : restored ? "dirty" : "saved",
        error: conflict ? { code: "externalChange" } : null,
      });
    });
    this.navigation = next.catch(() => {});
    return next;
  }
  async close(): Promise<void> {
    await this.flush();
    await this.backups;
    this.publish({ note: null, body: "", status: "saved", error: null });
  }
  edit(body: string): void {
    if (!this.state.note) return;
    const draft = {
      path: this.state.note.path,
      body,
      revision: this.state.note.revision,
    };
    this.backup(() => this.drafts?.write(draft));
    this.publish({
      body,
      status: body === this.state.note.body ? "saved" : "dirty",
      error: null,
    });
  }
  private backup(work: () => Promise<void> | undefined) {
    this.backups = this.backups
      .catch(() => {})
      .then(async () => {
        await work();
      })
      .catch(() => {});
  }
  async recoverCopy(folder: string, name: string): Promise<void> {
    await this.saving?.catch(() => {});
    const originalPath = this.state.note?.path;
    const body = this.state.body;
    const created = await this.storage.createNote(folder, name);
    const saved = await this.storage.saveNote(
      created.path,
      body,
      created.revision,
    );
    if (originalPath) this.backup(() => this.drafts?.clear(originalPath));
    this.publish({
      note: saved,
      status: this.state.body === saved.body ? "saved" : "dirty",
      error: null,
    });
  }
  flush(): Promise<void> {
    if (this.saving) return this.saving;
    this.saving = this.saveLoop().finally(() => {
      this.saving = null;
    });
    return this.saving;
  }
  private async saveLoop(): Promise<void> {
    while (this.state.note && this.state.body !== this.state.note.body) {
      const { note, body } = this.state;
      this.publish({ status: "saving", error: null });
      try {
        const saved = await this.storage.saveNote(
          note.path,
          body,
          note.revision,
        );
        if (saved.path !== note.path || saved.body !== body)
          throw { code: "externalChange" };
        if (this.state.body === saved.body)
          this.backup(() => this.drafts?.clear(saved.path));
        this.publish({
          note: saved,
          status: this.state.body === saved.body ? "saved" : "dirty",
        });
      } catch (error) {
        await this.backups;
        this.publish({ status: "error", error });
        throw error;
      }
    }
  }
}
