import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import type { Entry } from "../../platform/contracts";
import type { Dictionary } from "../../shared/i18n/en";
import { Icon } from "../../shared/Icon";
import type { TreeRow } from "./treeModel";

export function FileTree({
  rows,
  activePath,
  expanded,
  disabled,
  actionsDisabled,
  t,
  onOpen,
  onToggle,
  onActions,
}: {
  rows: TreeRow[];
  activePath: string | null;
  expanded: ReadonlySet<string>;
  disabled: boolean;
  actionsDisabled: boolean;
  t: Dictionary;
  onOpen(path: string): void;
  onToggle(path: string): void;
  onActions?: (entry: Entry, trigger: HTMLElement) => void;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLDivElement>());
  const moved = useRef(false);
  const current =
    rows.find((row) => row.node.entry.path === focused)?.node.entry.path ??
    rows.find((row) => row.node.entry.path === activePath)?.node.entry.path ??
    rows[0]?.node.entry.path ??
    null;
  useEffect(() => {
    if (!moved.current || !current) return;
    moved.current = false;
    items.current.get(current)?.focus();
  }, [current]);
  const focus = (path: string | undefined) => {
    if (!path) return;
    moved.current = true;
    setFocused(path);
  };
  const activate = (entry: Entry) => {
    if (disabled) return;
    if (entry.kind === "folder") onToggle(entry.path);
    else onOpen(entry.path);
  };
  function keyDown(event: KeyboardEvent<HTMLDivElement>, index: number) {
    const row = rows[index];
    const { entry } = row.node;
    const isFolder = entry.kind === "folder";
    const open = isFolder && expanded.has(entry.path);
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    switch (event.key) {
      case "ArrowDown":
        handled();
        focus(rows[index + 1]?.node.entry.path);
        break;
      case "ArrowUp":
        handled();
        focus(rows[index - 1]?.node.entry.path);
        break;
      case "Home":
        handled();
        focus(rows[0]?.node.entry.path);
        break;
      case "End":
        handled();
        focus(rows.at(-1)?.node.entry.path);
        break;
      case "ArrowRight":
        handled();
        if (isFolder && !open) onToggle(entry.path);
        else if (open && rows[index + 1]?.parent === entry.path)
          focus(rows[index + 1].node.entry.path);
        break;
      case "ArrowLeft":
        handled();
        if (open) onToggle(entry.path);
        else if (row.parent) focus(row.parent);
        break;
      case "Enter":
      case " ":
        handled();
        activate(entry);
        break;
      case "ContextMenu":
        handled();
        if (onActions && !actionsDisabled)
          onActions(entry, event.currentTarget);
        break;
      case "F10":
        if (event.shiftKey && onActions && !actionsDisabled) {
          handled();
          onActions(entry, event.currentTarget);
        }
        break;
    }
  }
  if (!rows.length) return <p className="bw-tree-empty">{t.emptyTree}</p>;
  const groups = new Map<string | null, TreeRow[]>();
  for (const row of rows) {
    const list = groups.get(row.parent);
    if (list) list.push(row);
    else groups.set(row.parent, [row]);
  }
  return (
    <div className="bw-tree" role="tree" aria-label={t.fileTree}>
      {rows.map((row, index) => {
        const { entry } = row.node;
        const isFolder = entry.kind === "folder";
        const open = isFolder && expanded.has(entry.path);
        const problem = !!entry.issue || entry.identityCollision;
        const siblings = groups.get(row.parent)!;
        const detail = entry.issue
          ? (t.errors[entry.issue as keyof typeof t.errors] ?? t.errors.io)
          : t.collision;
        return (
          <div
            key={entry.path}
            ref={(node) => {
              if (node) items.current.set(entry.path, node);
              else items.current.delete(entry.path);
            }}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-setsize={siblings.length}
            aria-posinset={siblings.indexOf(row) + 1}
            aria-expanded={isFolder ? open : undefined}
            aria-selected={entry.path === activePath}
            aria-disabled={disabled || undefined}
            aria-label={problem ? `${entry.name} · ${detail}` : entry.name}
            tabIndex={entry.path === current ? 0 : -1}
            className={`bw-tree-row bw-pressable ${problem ? "has-problem" : ""}`}
            style={{ "--bw-tree-depth": row.depth } as CSSProperties}
            onFocus={() => setFocused(entry.path)}
            onClick={() => activate(entry)}
            onKeyDown={(event) => keyDown(event, index)}
          >
            <span className="bw-tree-chevron" aria-hidden="true">
              {isFolder && <Icon name="chevron" size={14} />}
            </span>
            <Icon
              name={
                problem
                  ? "alert"
                  : isFolder
                    ? open
                      ? "folderOpen"
                      : "folder"
                    : "note"
              }
              size={18}
              variant={isFolder ? "bold" : "linear"}
              className="bw-tree-icon"
            />
            <span className="bw-tree-label">{entry.name}</span>
            {onActions && (
              <button
                type="button"
                tabIndex={-1}
                className="bw-tree-more bw-pressable"
                aria-label={`${t.fileActions}: ${entry.name}`}
                disabled={actionsDisabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onActions(entry, event.currentTarget);
                }}
              >
                <Icon name="more" size={18} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
