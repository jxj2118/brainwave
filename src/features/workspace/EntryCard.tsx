import type { CSSProperties } from "react";
import type { Entry } from "../../platform/contracts";
import type { Dictionary } from "../../shared/i18n/en";
import { Icon } from "../../shared/Icon";
import { IconButton } from "../../shared/ui/Button";
export function EntryCard({
  entry,
  t,
  disabled,
  actionsDisabled,
  onOpen,
  onActions,
  description,
  count,
  search,
  location,
  index = 0,
}: {
  entry: Entry;
  t: Dictionary;
  disabled: boolean;
  actionsDisabled: boolean;
  onOpen(): void;
  onActions?: (trigger: HTMLButtonElement) => void;
  description?: string;
  count?: number;
  search: boolean;
  location?: string;
  index?: number;
}) {
  const problem = !!entry.issue || !!entry.identityCollision;
  const detail = entry.issue
    ? (t.errors[entry.issue as keyof typeof t.errors] ?? t.errors.io)
    : entry.identityCollision
      ? t.collision
      : location !== undefined
        ? location
        : search
          ? entry.path
          : entry.kind === "folder"
            ? t.folder
            : "Markdown";
  return (
    <div
      className={`workspace-entry workspace-entry--${entry.kind} ${problem ? "has-problem" : ""}`}
      style={{ "--bw-entry-index": Math.min(index, 10) } as CSSProperties}
    >
      <button
        type="button"
        className="workspace-entry-open bw-pressable"
        disabled={disabled}
        aria-label={`${entry.name} ${detail}`}
        onClick={onOpen}
      >
        <span className="workspace-entry-icon">
          <Icon
            name={
              problem ? "alert" : entry.kind === "folder" ? "folder" : "note"
            }
            variant={entry.kind === "folder" ? "bold" : "linear"}
            size={entry.kind === "folder" ? 24 : 22}
          />
        </span>
        <span className="workspace-entry-copy">
          <strong>{entry.name}</strong>
          {description && entry.kind === "note" && (
            <span className="workspace-entry-summary">{description}</span>
          )}
          <span className="workspace-entry-detail">
            {entry.kind === "folder" && count !== undefined
              ? `${count} ${t.notes}`
              : detail}
          </span>
        </span>
      </button>
      {onActions && (
        <IconButton
          label={`${t.fileActions}: ${entry.name}`}
          icon={entry.kind === "folder" ? "moreVertical" : "more"}
          disabled={actionsDisabled}
          onClick={(event) => onActions(event.currentTarget)}
        />
      )}
    </div>
  );
}
