import { useMemo } from "react";
import type { Entry, NoteStorage, RecentEntry } from "../../platform/contracts";
import type { Dictionary } from "../../shared/i18n/en";
import { Icon } from "../../shared/Icon";
import { BotanicalAccent } from "../../shared/ui/BrandMark";
import { Button } from "../../shared/ui/Button";
import { SectionHeading } from "../../shared/ui/Card";
import { EmptyState, Skeleton } from "../../shared/ui/Feedback";
import { EntryCard } from "./EntryCard";
import { QuickNote } from "./QuickNote";
import { useNoteSummaries } from "./useNoteSummaries";
import "./workspace.css";

export function folderLabel(path: string, root: string) {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : root;
}

export function WorkspaceHome({
  entries,
  recent,
  storage,
  t,
  locale,
  busy,
  actionsDisabled,
  loading,
  onCreate,
  onOpen,
  onActions,
  onQuickNote,
}: {
  entries: Entry[];
  recent: RecentEntry[];
  storage: NoteStorage;
  t: Dictionary;
  locale: string;
  busy: boolean;
  actionsDisabled: boolean;
  loading: boolean;
  onCreate(): void;
  onOpen(entry: Entry): void;
  onActions?: (entry: Entry, trigger: HTMLButtonElement) => void;
  onQuickNote(text: string): Promise<boolean>;
}) {
  const recentNotes = useMemo(() => {
    const notes = new Map(
      entries.filter((e) => e.kind === "note").map((e) => [e.path, e]),
    );
    return recent.flatMap((item) => notes.get(item.path) ?? []);
  }, [entries, recent]);
  const allNotes = useMemo(
    () =>
      entries
        .filter((e) => e.kind === "note")
        .sort((a, b) =>
          a.name.localeCompare(b.name, locale, { numeric: true }),
        ),
    [entries, locale],
  );
  const showingRecent = recentNotes.length > 0;
  const list = showingRecent ? recentNotes : allNotes;
  const summaries = useNoteSummaries(storage, list);
  const heading = showingRecent ? t.recent : t.allNotes;
  return (
    <div className="workspace-home">
      <div className="workspace-columns">
        <section className="workspace-overview">
          <QuickNote t={t} busy={busy} onSave={onQuickNote} />
          <Button
            className="workspace-create"
            aria-label={t.createFirst}
            disabled={busy}
            onClick={onCreate}
          >
            <span className="workspace-create-icon">
              <Icon name="plus" size={26} />
            </span>
            <span>
              <strong>{t.createNoteTitle}</strong>
              <span>{t.createNoteHint}</span>
            </span>
            <BotanicalAccent />
          </Button>
        </section>
        <section className="workspace-notes" aria-label={heading}>
          <SectionHeading title={heading} />
          {loading && !list.length ? (
            <Skeleton label={t.loading} />
          ) : list.length ? (
            <div className="workspace-note-grid">
              {list.map((entry, index) => (
                <EntryCard
                  key={entry.path}
                  index={index}
                  entry={entry}
                  description={summaries[entry.path]}
                  location={folderLabel(entry.path, t.personal)}
                  t={t}
                  disabled={busy}
                  actionsDisabled={actionsDisabled}
                  search={false}
                  onOpen={() => onOpen(entry)}
                  onActions={
                    onActions
                      ? (trigger) => onActions(entry, trigger)
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="note"
              title={t.emptyTitle}
              description={t.emptyBody}
            />
          )}
        </section>
      </div>
    </div>
  );
}
