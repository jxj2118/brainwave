import type { Platform, Preferences } from "../platform/contracts";
import { useAppController } from "./useAppController";
import { AppShell } from "./AppShell";
import { NoteEditor } from "../features/notes/NoteEditor";
import { WorkspaceHome } from "../features/workspace/WorkspaceHome";
import { SettingsPage } from "../features/settings/SettingsPage";
import { EntryActions } from "../features/files/EntryActions";
import { HistoryPanel } from "../features/history/HistoryPanel";
import { SyncPage } from "../features/sync/SyncPage";
import { SearchPage } from "../features/workspace/SearchPage";
import { Sidebar, type SyncTone } from "../features/navigation/Sidebar";
import type { Entry } from "../platform/contracts";
import { observeMedia } from "../platform/environment";
import { ActionMenu, type ActionMenuItem } from "../shared/ui/ActionMenu";
import { Toast } from "../shared/ui/Toast";
import { Icon } from "../shared/Icon";
import { Button, IconButton } from "../shared/ui/Button";
import { Dialog } from "../shared/ui/Dialog";
import { TextField } from "../shared/ui/Fields";
import { EmptyState, Notice, StatusPill } from "../shared/ui/Feedback";
import { installRipple } from "../shared/ui/ripple";
import { useCallback, useEffect, useState } from "react";
import "../shared/styles/tokens.css";
import "../shared/styles/base.css";
import "../shared/ui/ui.css";
import "./app-shell.css";
import "../features/data-panels.css";

export default function App({
  platform,
  initialPreferences,
}: {
  platform: Platform;
  initialPreferences: Preferences;
}) {
  const c = useAppController({ platform, initialPreferences });
  const { t } = c;
  useEffect(() => installRipple(document), []);
  const [wide, setWide] = useState(false);
  useEffect(() => observeMedia("(min-width: 1024px)", setWide), []);
  const layout = wide
    ? c.ui.sidebarCollapsed
      ? "collapsed"
      : "docked"
    : "drawer";
  const [menu, setMenu] = useState<{
    folder: string;
    entry?: Entry;
    trigger: HTMLElement;
  } | null>(null);
  const dismissToast = useCallback(() => c.setToast(null), [c.setToast]);
  const actionsDisabled = c.busy || c.workspaceSync.running;
  const editorFolder =
    c.editor.note?.path.slice(
      0,
      Math.max(0, c.editor.note.path.lastIndexOf("/")),
    ) || t.personal;
  const openEditorActions = (opener: HTMLElement) => {
    if (c.editor.note)
      void c.showActions(
        { path: c.editor.note.path, name: c.title, kind: "note" },
        true,
        opener,
      );
  };
  const syncTone: SyncTone =
    c.workspaceSync.error || c.workspaceSync.status?.phase === "conflict"
      ? "danger"
      : c.workspaceSync.status?.phase === "synced"
        ? "positive"
        : "neutral";
  const menuItems: ActionMenuItem[] = menu
    ? [
        { id: "note", label: t.newNote, icon: "noteAdd" },
        {
          id: "folder",
          label: menu.entry ? t.newSubfolder : t.newFolder,
          icon: "folderAdd",
        },
        ...(menu.entry && platform.files
          ? [{ id: "manage", label: t.fileActions, icon: "edit" as const }]
          : []),
      ]
    : [];
  const syncLabel = c.workspaceSync.running
    ? t.syncRunning
    : c.workspaceSync.error
      ? t.syncFailed
      : c.workspaceSync.status?.phase === "synced"
        ? t.syncComplete
        : c.workspaceSync.status?.phase === "localChanges"
          ? t.localChanges
          : c.workspaceSync.status?.phase === "conflict"
            ? t.syncConflict
            : t.localOnly;
  const sidebar = (
    <Sidebar
      t={t}
      screen={c.screen}
      locale={c.preferences.locale}
      entries={c.entries}
      showFiles={!!platform.notes}
      activePath={c.screen === "editor" ? (c.editor.note?.path ?? null) : null}
      expanded={c.ui.expanded}
      syncTone={syncTone}
      syncBusy={c.workspaceSync.running}
      syncLabel={syncLabel}
      disabled={c.busy}
      actionsDisabled={actionsDisabled}
      onNavigate={(screen) => void c.navigate(screen)}
      onOpen={(path) => void c.openNote(path)}
      onToggle={c.ui.toggle}
      onCreate={(trigger) => setMenu({ folder: "", trigger })}
      onActions={(entry, trigger) =>
        entry.kind === "folder"
          ? setMenu({ folder: entry.path, entry, trigger })
          : platform.files
            ? void c.showActions(entry, false, trigger)
            : undefined
      }
      onClose={layout === "drawer" ? () => c.setSidebarOpen(false) : undefined}
      onCollapse={
        layout === "docked" ? () => c.ui.setSidebarCollapsed(true) : undefined
      }
    />
  );
  return (
    <>
      <AppShell
        screen={c.screen}
        pageKey={`${c.screen}:${c.screen === "editor" ? c.editor.note?.path : ""}:${c.historyOpen}`}
        sidebar={sidebar}
        layout={layout}
        sidebarOpen={c.sidebarOpen}
        onSidebarOpen={() => c.setSidebarOpen(true)}
        onSidebarClose={() => c.setSidebarOpen(false)}
        onSidebarExpand={() => c.ui.setSidebarCollapsed(false)}
        title={c.title}
        subtitle={
          c.screen === "editor" ? (
            platform.files && !c.historyOpen ? (
              <button
                type="button"
                className="bw-workspace-context bw-pressable"
                title={`${t.moveTo}: ${editorFolder}`}
                disabled={actionsDisabled}
                onClick={(event) => openEditorActions(event.currentTarget)}
              >
                <Icon name="folder" size={17} variant="bold" />
                <span>{editorFolder}</span>
                <Icon name="chevronDown" size={14} />
              </button>
            ) : (
              <span className="bw-workspace-context">
                <Icon name="folder" size={17} variant="bold" />
                <span>{editorFolder}</span>
              </span>
            )
          ) : c.screen === "settings" ? (
            t.settingsSubtitle
          ) : c.screen === "sync" ? (
            t.syncSubtitle
          ) : c.screen === "home" ? (
            t.homeSubtitle
          ) : undefined
        }
        status={
          c.screen === "editor" ? (
            <StatusPill
              tone={
                c.editor.status === "error"
                  ? "danger"
                  : c.editor.status === "saved"
                    ? "positive"
                    : "neutral"
              }
              busy={c.editor.status === "saving"}
            >
              {t[c.editor.status === "error" ? "saveError" : c.editor.status]}
            </StatusPill>
          ) : c.screen === "home" ? (
            <StatusPill
              tone={
                c.workspaceSync.error
                  ? "danger"
                  : c.workspaceSync.status?.phase === "synced"
                    ? "positive"
                    : "neutral"
              }
              busy={c.workspaceSync.running}
              icon={
                c.workspaceSync.error
                  ? undefined
                  : c.workspaceSync.status?.phase === "synced"
                    ? "cloudCheck"
                    : c.workspaceSync.status?.phase === "localChanges"
                      ? "cloudUpload"
                      : c.workspaceSync.status?.phase === "conflict"
                        ? "alert"
                        : "note"
              }
            >{`${c.noteCount} ${t.notes} · ${syncLabel}`}</StatusPill>
          ) : undefined
        }
        t={t}
        busy={c.busy}
        onBack={
          !c.historyOpen && c.screen === "editor"
            ? () => void c.goBack()
            : undefined
        }
        actions={
          <>
            {c.screen === "home" && platform.notes && (
              <IconButton
                label={t.refresh}
                icon="refresh"
                disabled={c.busy || c.loading}
                onClick={() => void c.refresh()}
              />
            )}
            {c.screen === "editor" && !c.historyOpen && (
              <>
                <IconButton
                  label={t.save}
                  icon="save"
                  className={c.dirty ? "bw-save-pending" : ""}
                  disabled={c.busy || !c.dirty}
                  onClick={() => void c.session?.flush().catch(() => {})}
                />
                {platform.files && (
                  <IconButton
                    label={t.fileActions}
                    icon="more"
                    disabled={actionsDisabled}
                    onClick={(event) => openEditorActions(event.currentTarget)}
                  />
                )}
              </>
            )}
          </>
        }
        notices={
          <>
            {c.error !== null && (
              <Notice
                tone="danger"
                onClose={() => c.setError(null)}
                closeLabel={t.dismiss}
              >
                {c.message(c.error)}
              </Notice>
            )}
            {c.entries.some((e) => e.identityCollision) &&
              c.screen !== "editor" && <Notice>{t.collisionBody}</Notice>}
          </>
        }
      >
        {c.screen === "settings" ? (
          <SettingsPage
            value={c.preferences}
            onChange={c.changePreferences}
            t={t}
            platform={platform}
            onOpenSync={
              platform.sync ? () => void c.navigate("sync") : undefined
            }
          />
        ) : c.screen === "sync" ? (
          platform.sync ? (
            <SyncPage
              status={c.workspaceSync.status}
              error={c.workspaceSync.error}
              running={c.workspaceSync.running}
              credentials={c.workspaceSync.credentials}
              t={t}
              message={c.message}
              onRun={() => c.workspaceSync.run()}
              onTest={c.workspaceSync.test}
              onConfigure={c.workspaceSync.configure}
              onResolve={c.workspaceSync.resolve}
              onClearCredentials={c.workspaceSync.clearCredentials}
            />
          ) : (
            <EmptyState icon="cloud" title={t.sync} description={t.syncBody} />
          )
        ) : !platform.notes ? (
          <EmptyState icon="leaf" title={t.webTitle} description={t.webBody} />
        ) : c.screen === "editor" &&
          c.historyOpen &&
          platform.history &&
          c.editor.note ? (
          <HistoryPanel
            storage={platform.history}
            path={c.editor.note.path}
            t={t}
            message={c.message}
            onClose={() => c.setHistoryOpen(false)}
            beforeCheckpoint={async () => {
              await c.session?.flush();
            }}
            onRestore={c.restoreHistory}
          />
        ) : c.screen === "editor" ? (
          <NoteEditor
            key={c.editor.note?.path}
            editor={c.editor}
            session={c.session!}
            busy={c.busy}
            t={t}
            message={c.message}
            onSaveCopy={() => c.showCreate("copy")}
            attachments={platform.attachments}
            actionsDisabled={actionsDisabled}
            onAttach={platform.attachments ? () => void c.attach() : undefined}
            onHistory={
              platform.history ? () => void c.openHistory() : undefined
            }
          />
        ) : c.screen === "search" ? (
          <SearchPage
            results={c.results}
            storage={platform.notes}
            t={t}
            query={c.query}
            busy={c.busy}
            searching={c.searching}
            actionsDisabled={actionsDisabled}
            onQuery={c.search}
            onOpen={(entry) => void c.openNote(entry.path)}
            onActions={
              platform.files
                ? (entry, trigger) => void c.showActions(entry, false, trigger)
                : undefined
            }
          />
        ) : (
          <WorkspaceHome
            entries={c.entries}
            recent={c.ui.recent}
            storage={platform.notes}
            t={t}
            locale={c.preferences.locale}
            busy={c.busy}
            loading={c.loading}
            actionsDisabled={actionsDisabled}
            onCreate={() => c.showCreate("note")}
            onOpen={(entry) => void c.openNote(entry.path)}
            onQuickNote={c.saveQuickNote}
            onActions={
              platform.files
                ? (entry, trigger) => void c.showActions(entry, false, trigger)
                : undefined
            }
          />
        )}
      </AppShell>
      {menu && (
        <ActionMenu
          title={menu.entry?.name ?? t.newItem}
          items={menuItems}
          cancelLabel={t.cancel}
          returnFocusTo={menu.trigger}
          onClose={() => setMenu(null)}
          onSelect={(id) => {
            const current = menu;
            setMenu(null);
            if (id === "manage" && current.entry)
              void c.showActions(current.entry, false, current.trigger);
            else c.showCreate(id as "note" | "folder", current.folder);
          }}
        />
      )}
      {c.toast && (
        <Toast
          message={c.toast.message}
          actionLabel={c.toast.path ? t.open : undefined}
          onAction={() => {
            const path = c.toast?.path;
            c.setToast(null);
            if (path) void c.openNote(path);
          }}
          onDismiss={dismissToast}
          closeLabel={t.dismiss}
        />
      )}
      {c.action && (
        <EntryActions
          entry={c.action.entry}
          entries={c.entries}
          busy={c.busy}
          t={t}
          onClose={() => c.setAction(null)}
          onMove={c.moveEntry}
          onDelete={c.deleteEntry}
          error={c.actionError !== null ? c.message(c.actionError) : null}
          returnFocusTo={c.action.opener}
        />
      )}
      {c.dialog && (
        <Dialog
          open
          title={
            c.dialog === "folder"
              ? t.newFolder
              : c.dialog === "copy"
                ? t.saveCopy
                : t.newNote
          }
          icon={c.dialog === "folder" ? "folderAdd" : "note"}
          busy={c.busy}
          onClose={() => c.setDialog(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void c.create();
            }}
          >
            <p className="panel-muted">
              {t.folderLocation}: {c.createIn || t.personal}
            </p>
            <TextField
              label={c.dialog === "folder" ? t.folderName : t.noteName}
              autoFocus
              value={c.name}
              maxLength={120}
              disabled={c.busy}
              onChange={(event) => c.setName(event.currentTarget.value)}
            />
            {c.dialogError !== null && (
              <p className="form-error" role="alert">
                {c.message(c.dialogError)}
              </p>
            )}
            <div className="bw-dialog-actions">
              <Button disabled={c.busy} onClick={() => c.setDialog(null)}>
                {t.cancel}
              </Button>
              <Button
                type="submit"
                variant="primary"
                busy={c.busy}
                disabled={!c.name.trim()}
              >
                {c.busy ? t.loading : t.create}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
