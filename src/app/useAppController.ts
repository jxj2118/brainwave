import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Entry, Platform, Preferences } from "../platform/contracts";
import { errorCode } from "../platform/contracts";
import {
  applyAppearance,
  observeViewport,
  onBackground,
  protectUnsavedChanges,
} from "../platform/environment";
import { dictionary } from "../shared/i18n";
import { EditorSession, type EditorSnapshot } from "../features/notes/session";
import { useWorkspaceSync } from "../features/sync/useWorkspaceSync";
import { ancestors } from "../features/navigation/treeModel";
import {
  QUICK_NOTE_ATTEMPTS,
  QUICK_NOTE_FOLDER,
  quickNoteName,
  withSuffix,
} from "../features/workspace/quickNoteName";
import { useUiState } from "./useUiState";
import {
  initializeNavigation,
  pushRoute,
  replaceRoute,
  backRoute,
  subscribeNavigation,
  type Screen,
} from "../platform/navigation";
export function useAppController({
  platform,
  initialPreferences,
}: {
  platform: Platform;
  initialPreferences: Preferences;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const preferenceQueue = useRef(Promise.resolve());
  const t = dictionary(preferences.locale);
  const [screen, setScreen] = useState<Screen>("home");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [createIn, setCreateIn] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; path?: string } | null>(
    null,
  );
  const ui = useUiState(platform.localState);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [editor, setEditor] = useState<EditorSnapshot>({
    note: null,
    body: "",
    status: "saved",
    error: null,
  });
  const session = useMemo(
    () =>
      platform.notes
        ? new EditorSession(platform.notes, setEditor, platform.drafts)
        : null,
    [platform],
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [searching, setSearching] = useState(false);
  const [dialog, setDialog] = useState<"note" | "folder" | "copy" | null>(null);
  const [action, setAction] = useState<{
    entry: Pick<Entry, "path" | "name" | "kind">;
    revision?: string;
    fromEditor: boolean;
    opener?: HTMLElement;
  } | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [name, setName] = useState("");
  const [dialogError, setDialogError] = useState<unknown>(null);
  const message = (value: unknown) =>
    t.errors[errorCode(value) as keyof typeof t.errors] ?? t.errors.io;
  const refresh = useCallback(async () => {
    if (!platform.notes) return;
    setLoading(true);
    try {
      setEntries(await platform.notes.scan());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [platform]);
  const workspaceSync = useWorkspaceSync(
    platform.sync,
    async () => {
      await session?.flush();
    },
    async () => {
      await refresh();
      const note = session?.snapshot.note;
      if (note) {
        try {
          await session?.open(note.path);
        } catch (e) {
          if (
            errorCode(e) !== "notFound" ||
            session?.snapshot.body !== note.body
          )
            throw e;
          await session?.close();
          if (screen === "editor") {
            setScreen("home");
            replaceRoute({ screen: "home" });
          }
        }
      }
    },
    busy || !!dialog || !!action || historyOpen,
  );
  useEffect(() => {
    if (editor.status === "dirty") workspaceSync.changed();
  }, [editor.body, editor.status, workspaceSync.changed]);
  const previousStatus = useRef(editor.status);
  useEffect(() => {
    if (
      editor.status === "saved" &&
      previousStatus.current === "saving" &&
      editor.note
    )
      ui.recordOpen(editor.note.path);
    previousStatus.current = editor.status;
  }, [editor.status, editor.note, ui.recordOpen]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => observeViewport(), []);
  useEffect(
    () => applyAppearance(preferences.locale, preferences.theme),
    [preferences],
  );
  useEffect(
    () =>
      onBackground(() => {
        void session?.flush().catch(() => {});
      }),
    [session],
  );
  useEffect(
    () =>
      protectUnsavedChanges(
        () =>
          !!session?.snapshot.note &&
          session.snapshot.body !== session.snapshot.note.body,
      ),
    [session],
  );
  useEffect(() => {
    if (editor.status !== "dirty") return;
    const timer = setTimeout(() => {
      void session?.flush().catch(() => {});
    }, 450);
    return () => clearTimeout(timer);
  }, [editor.body, editor.status, session]);
  useEffect(() => {
    let cancelled = false;
    if (screen !== "search" || !query.trim() || !platform.notes) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const found: Entry[] = [];
      const term = query.toLocaleLowerCase(preferences.locale).trim();
      try {
        for (const entry of entries) {
          if (cancelled) return;
          if (entry.kind !== "note" || entry.issue) continue;
          let note;
          try {
            note = await platform.notes!.readNote(entry.path);
          } catch (e) {
            if (!cancelled) setError(e);
            continue;
          }
          if (
            (entry.path + "\n" + note.body)
              .toLocaleLowerCase(preferences.locale)
              .includes(term)
          )
            found.push(entry);
        }
        if (!cancelled) setResults(found);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [screen, query, entries, platform, preferences.locale]);

  function commitPage(target: Screen, notePath?: string) {
    pushRoute({ screen: target, notePath });
    setScreen(target);
    setSidebarOpen(false);
  }
  useEffect(() => initializeNavigation(), []);
  useEffect(
    () =>
      subscribeNavigation((route) => {
        void (async () => {
          setBusy(true);
          try {
            await session?.flush();
            if (route.screen === "editor" && route.notePath)
              await session?.open(route.notePath);
            setScreen(route.screen);
            setSidebarOpen(false);
            setError(null);
            if (route.screen !== "editor") await refresh();
          } catch (e) {
            pushRoute({
              screen,
              notePath: session?.snapshot.note?.path,
            });
            setError(e);
          } finally {
            setBusy(false);
          }
        })();
      }),
    [session, screen, refresh],
  );
  async function goBack() {
    setBusy(true);
    try {
      await session?.flush();
      if (!backRoute()) commitPage("home");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function navigate(target: Screen) {
    if (target === screen && target !== "editor") {
      setSidebarOpen(false);
      return;
    }
    setBusy(true);
    try {
      await session?.flush();
      commitPage(target);
      setError(null);
      if (target !== "editor") await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function openNote(path: string) {
    setBusy(true);
    try {
      await session?.open(path);
      if (screen === "editor") {
        replaceRoute({ screen: "editor", notePath: path });
        setSidebarOpen(false);
      } else commitPage("editor", path);
      ui.recordOpen(path);
      ui.expand(ancestors(path));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function changePreferences(next: Preferences) {
    setPreferences(next);
    preferenceQueue.current = preferenceQueue.current
      .catch(() => {})
      .then(() => platform.savePreferences(next))
      .catch(() => {
        setError({ code: "preferencesUnavailable" });
      });
  }
  async function create() {
    if (!platform.notes || busy) return;
    setBusy(true);
    setDialogError(null);
    try {
      if (dialog === "copy") {
        const path = editor.note?.path ?? "";
        await session?.recoverCopy(
          path.slice(0, Math.max(0, path.lastIndexOf("/"))),
          name,
        );
        replaceRoute({
          screen: "editor",
          notePath: session?.snapshot.note?.path,
        });
        setDialog(null);
        await refresh();
        return;
      }
      await session?.flush();
      if (dialog === "folder") {
        await platform.notes.createFolder(createIn, name);
        setDialog(null);
        if (createIn) ui.expand([...ancestors(createIn), createIn]);
        await refresh();
        workspaceSync.changed();
      } else {
        const note = await platform.notes.createNote(createIn, name);
        await session?.open(note.path);
        setDialog(null);
        if (screen === "editor")
          replaceRoute({ screen: "editor", notePath: note.path });
        else commitPage("editor", note.path);
        setSidebarOpen(false);
        ui.recordOpen(note.path);
        ui.expand(ancestors(note.path));
        await refresh();
        workspaceSync.changed();
      }
    } catch (e) {
      setDialogError(e);
    } finally {
      setBusy(false);
    }
  }
  function showCreate(kind: "note" | "folder" | "copy", folder = "") {
    setCreateIn(folder);
    setName("");
    setDialogError(null);
    setDialog(kind);
  }
  async function showActions(
    entry: Pick<Entry, "path" | "name" | "kind">,
    fromEditor = false,
    opener?: HTMLElement,
  ) {
    if (!platform.files || workspaceSync.running) return;
    setBusy(true);
    setActionError(null);
    try {
      await session?.flush();
      const note =
        entry.kind === "note"
          ? await platform.notes!.readNote(entry.path)
          : null;
      setAction({ entry, revision: note?.revision, fromEditor, opener });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function moveEntry(destination: string, nextName: string) {
    if (!action || !platform.files) return;
    setBusy(true);
    setActionError(null);
    try {
      await session?.flush();
      const path = await platform.files.move(
        action.entry.path,
        destination,
        nextName,
        action.revision,
      );
      const current = session?.snapshot.note?.path;
      if (current && within(current, action.entry.path)) {
        const moved = path + current.slice(action.entry.path.length);
        if (screen === "editor") {
          await session?.open(moved);
          replaceRoute({ screen: "editor", notePath: moved });
        } else await session?.close();
      }
      ui.recordMove(action.entry.path, path);
      ui.expand(ancestors(path));
      setAction(null);
      await refresh();
      workspaceSync.changed();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }
  async function deleteEntry() {
    if (!action || !platform.files) return;
    setBusy(true);
    setActionError(null);
    try {
      await session?.flush();
      await platform.files.delete(action.entry.path, action.revision);
      const current = session?.snapshot.note?.path;
      if (current && within(current, action.entry.path)) {
        await session?.close();
        if (screen === "editor") {
          setScreen("home");
          replaceRoute({ screen: "home" });
        }
      }
      ui.recordDelete(action.entry.path);
      setAction(null);
      await refresh();
      workspaceSync.changed();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }
  async function attach() {
    if (!platform.attachments || !session || workspaceSync.running) return;
    setBusy(true);
    try {
      // Start the native chooser in the original user gesture, before awaiting saves.
      const input = await platform.attachments.pick();
      if (!input) return;
      await session.flush();
      const note = session.snapshot.note;
      if (!note) return;
      const attachment = await platform.attachments.import(note.path, input);
      const label = attachment.name.replace(/[\\[\]]/g, "\\$&");
      const image = /\.(png|jpe?g|gif|webp)$/i.test(attachment.name) ? "!" : "";
      session.edit(
        `${session.snapshot.body}${session.snapshot.body.endsWith("\n") ? "\n" : "\n\n"}${image}[${label}](${attachment.url})\n`,
      );
      await session.flush();
      workspaceSync.changed();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const noteCount = entries.filter((e) => e.kind === "note").length;
  const title =
    screen === "editor"
      ? (editor.note?.path.split("/").pop()?.replace(/\.md$/i, "") ?? "")
      : screen === "settings"
        ? t.settings
        : screen === "search"
          ? t.search
          : screen === "sync"
            ? t.sync
            : t.home;
  async function saveQuickNote(text: string): Promise<boolean> {
    if (!platform.notes || busy || !text.trim()) return false;
    setBusy(true);
    try {
      try {
        await platform.notes.createFolder("", QUICK_NOTE_FOLDER);
      } catch (e) {
        if (errorCode(e) !== "alreadyExists") throw e;
      }
      const base = quickNoteName(text, new Date(), t.quickNoteFallback);
      let note = null;
      for (let attempt = 1; !note; attempt++) {
        try {
          note = await platform.notes.createNote(
            QUICK_NOTE_FOLDER,
            withSuffix(base, attempt),
          );
        } catch (e) {
          if (
            errorCode(e) !== "alreadyExists" ||
            attempt >= QUICK_NOTE_ATTEMPTS
          )
            throw e;
        }
      }
      await platform.notes.saveNote(note.path, text, note.revision);
      ui.recordOpen(note.path);
      setToast({ message: t.quickNoteSaved, path: note.path });
      await refresh();
      workspaceSync.changed();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const dirty = editor.note && editor.body !== editor.note.body;
  async function openHistory() {
    setBusy(true);
    try {
      await session?.flush();
      setHistoryOpen(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function restoreHistory(body: string) {
    await session?.flush();
    session?.edit(body);
    await session?.flush();
    workspaceSync.changed();
  }
  function search(value: string) {
    setQuery(value);
  }
  return {
    preferences,
    t,
    screen,
    entries,
    createIn,
    sidebarOpen,
    setSidebarOpen,
    toast,
    setToast,
    ui,
    saveQuickNote,
    loading,
    busy,
    error,
    editor,
    session,
    query,
    searching,
    dialog,
    name,
    dialogError,
    action,
    actionError,
    historyOpen,
    workspaceSync,
    noteCount,
    results,
    title,
    dirty,
    message,
    refresh,
    navigate,
    goBack,
    openNote,
    changePreferences,
    showCreate,
    showActions,
    moveEntry,
    deleteEntry,
    attach,
    create,
    commitPage,
    setName,
    setDialog,
    setError,
    setAction,
    setHistoryOpen,
    openHistory,
    restoreHistory,
    search,
  };
}
export type AppController = ReturnType<typeof useAppController>;
const within = (path: string, target: string) =>
  path === target || path.startsWith(`${target}/`);
