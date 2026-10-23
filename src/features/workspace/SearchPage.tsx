import type { Entry, NoteStorage } from "../../platform/contracts";
import type { Dictionary } from "../../shared/i18n/en";
import { SearchField } from "../../shared/ui/Fields";
import { SectionHeading } from "../../shared/ui/Card";
import { EmptyState, Skeleton } from "../../shared/ui/Feedback";
import { EntryCard } from "./EntryCard";
import { useNoteSummaries } from "./useNoteSummaries";
import { folderLabel } from "./WorkspaceHome";
import "./workspace.css";

export function SearchPage({
  results,
  storage,
  t,
  query,
  busy,
  searching,
  actionsDisabled,
  onQuery,
  onOpen,
  onActions,
}: {
  results: Entry[];
  storage: NoteStorage;
  t: Dictionary;
  query: string;
  busy: boolean;
  searching: boolean;
  actionsDisabled: boolean;
  onQuery(value: string): void;
  onOpen(entry: Entry): void;
  onActions?: (entry: Entry, trigger: HTMLButtonElement) => void;
}) {
  const summaries = useNoteSummaries(storage, results);
  return (
    <div className="workspace-home">
      <SearchField
        label={t.search}
        placeholder={t.searchPlaceholder}
        value={query}
        onChange={onQuery}
        clearLabel={t.clearSearch}
        disabled={busy}
        autoFocus
        shortcutKey="k"
      />
      <section className="workspace-notes" aria-label={t.results}>
        {query.trim() && <SectionHeading title={t.results} />}
        {searching ? (
          <Skeleton label={t.loading} />
        ) : results.length ? (
          <div className="workspace-note-grid">
            {results.map((entry, index) => (
              <EntryCard
                key={entry.path}
                index={index}
                entry={entry}
                description={summaries[entry.path]}
                location={folderLabel(entry.path, t.personal)}
                t={t}
                disabled={busy}
                actionsDisabled={actionsDisabled}
                search
                onOpen={() => onOpen(entry)}
                onActions={
                  onActions ? (trigger) => onActions(entry, trigger) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="search"
            title={query.trim() ? t.noResults : t.searchHint}
          />
        )}
      </section>
    </div>
  );
}
