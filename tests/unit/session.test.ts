import { test, expect } from "bun:test";
import { EditorSession } from "../../src/features/notes/session";
import type { Note, NoteStorage } from "../../src/platform/contracts";

// A tiny in-memory filesystem models only the storage boundary; all session behavior is real.
function storageFixture() {
  const files = new Map<string, Note>([
    ["A.md", { path: "A.md", body: "A", revision: "a1", id: "a" }],
    ["B.md", { path: "B.md", body: "B", revision: "b1", id: "b" }],
  ]);
  let release: (() => void) | undefined;
  let fail = false;
  let delay = false;
  const storage: NoteStorage = {
    scan: async () => [],
    createNote: async () => {
      throw Error("unused");
    },
    createFolder: async () => {},
    readNote: async (path) => {
      const n = files.get(path);
      if (!n) throw { code: "notFound" };
      return { ...n };
    },
    saveNote: async (path, body, revision) => {
      if (delay) {
        delay = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      if (fail) throw { code: "io" };
      const previous = files.get(path)!;
      if (previous.revision !== revision) throw { code: "externalChange" };
      const next = { ...previous, body, revision: previous.revision + "+" };
      files.set(path, next);
      return { ...next };
    },
  };
  return {
    files,
    storage,
    blockNext: () => {
      delay = true;
    },
    unblock: () => release?.(),
    fail: (v: boolean) => {
      fail = v;
    },
  };
}

test("switching notes flushes the original path before opening the next", async () => {
  const f = storageFixture();
  const session = new EditorSession(f.storage);
  await session.open("A.md");
  session.edit("Edited A");
  await session.open("B.md");
  expect(f.files.get("A.md")!.body).toBe("Edited A");
  expect(f.files.get("B.md")!.body).toBe("B");
  expect(session.snapshot.note!.path).toBe("B.md");
});

test("edits arriving during a delayed save are flushed without loss", async () => {
  const f = storageFixture();
  const session = new EditorSession(f.storage);
  await session.open("A.md");
  session.edit("first");
  f.blockNext();
  const saving = session.flush();
  await Promise.resolve();
  session.edit("second");
  f.unblock();
  await saving;
  expect(f.files.get("A.md")!.body).toBe("second");
  expect(session.snapshot.status).toBe("saved");
});

test("failed save retains draft and prevents navigation until retry succeeds", async () => {
  const f = storageFixture();
  const session = new EditorSession(f.storage);
  await session.open("A.md");
  session.edit("recover me");
  f.fail(true);
  await expect(session.open("B.md")).rejects.toEqual({ code: "io" });
  expect(session.snapshot.note!.path).toBe("A.md");
  expect(session.snapshot.body).toBe("recover me");
  expect(session.snapshot.status).toBe("error");
  f.fail(false);
  await session.flush();
  expect(f.files.get("A.md")!.body).toBe("recover me");
});

test("external change never overwrites either version or discards the draft", async () => {
  const f = storageFixture();
  const session = new EditorSession(f.storage);
  await session.open("A.md");
  session.edit("my draft");
  f.files.set("A.md", {
    path: "A.md",
    body: "external",
    revision: "new",
    id: "a",
  });
  await expect(session.flush()).rejects.toEqual({ code: "externalChange" });
  expect(f.files.get("A.md")!.body).toBe("external");
  expect(session.snapshot.body).toBe("my draft");
});

test("a recovery copy saves the draft without replacing the external original", async () => {
  const f = storageFixture();
  f.storage.createNote = async (folder, name) => {
    const path = `${folder ? folder + "/" : ""}${name}.md`;
    const note = { path, body: "", revision: "copy1", id: "copy" };
    f.files.set(path, note);
    return { ...note };
  };
  const session = new EditorSession(f.storage);
  await session.open("A.md");
  session.edit("draft to keep");
  f.files.set("A.md", {
    path: "A.md",
    body: "external",
    revision: "changed",
    id: "a",
  });
  await expect(session.flush()).rejects.toEqual({ code: "externalChange" });
  await session.recoverCopy("", "Recovered");
  expect(f.files.get("A.md")!.body).toBe("external");
  expect(f.files.get("Recovered.md")!.body).toBe("draft to keep");
  expect(session.snapshot.note!.path).toBe("Recovered.md");
  expect(session.snapshot.status).toBe("saved");
});

test("unsaved drafts recover after session recreation, including an externally changed file", async () => {
  const f = storageFixture();
  let backup: import("../../src/platform/contracts").Draft | null = null;
  const drafts: import("../../src/platform/contracts").DraftStorage = {
    read: async (path) => (backup?.path === path ? { ...backup } : null),
    write: async (value) => {
      backup = { ...value };
    },
    clear: async () => {
      backup = null;
    },
  };
  const first = new EditorSession(f.storage, () => {}, drafts);
  await first.open("A.md");
  first.edit("recover after restart");
  f.fail(true);
  await expect(first.flush()).rejects.toEqual({ code: "io" });
  f.files.set("A.md", {
    path: "A.md",
    body: "other version",
    revision: "external",
    id: "a",
  });
  const reopened = new EditorSession(f.storage, () => {}, drafts);
  await reopened.open("A.md");
  expect(reopened.snapshot.body).toBe("recover after restart");
  expect(reopened.snapshot.status).toBe("error");
  expect(reopened.snapshot.error).toEqual({ code: "externalChange" });
});

test("a save receipt from an unexpected version cannot trigger an overwrite loop", async () => {
  const f = storageFixture();
  let calls = 0;
  f.storage.saveNote = async (path, body) => {
    calls++;
    const next = {
      path,
      body: calls === 1 ? "external after write" : body,
      revision: `r${calls}`,
      id: "a",
    };
    f.files.set(path, next);
    return next;
  };
  const session = new EditorSession(f.storage);
  await session.open("A.md");
  session.edit("my edit");
  await expect(session.flush()).rejects.toEqual({ code: "externalChange" });
  expect(calls).toBe(1);
  expect(f.files.get("A.md")!.body).toBe("external after write");
  expect(session.snapshot.body).toBe("my edit");
});
