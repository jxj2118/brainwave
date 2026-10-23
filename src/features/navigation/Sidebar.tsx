import { useMemo } from "react";
import type { Entry } from "../../platform/contracts";
import type { Screen } from "../../platform/navigation";
import type { Dictionary } from "../../shared/i18n/en";
import { Icon, type IconName } from "../../shared/Icon";
import { BrandMark } from "../../shared/ui/BrandMark";
import { IconButton } from "../../shared/ui/Button";
import { FileTree } from "./FileTree";
import { buildTree, visibleNodes } from "./treeModel";
import "./navigation.css";

export type SyncTone = "neutral" | "positive" | "danger";

function NavItem({
  icon,
  label,
  current,
  disabled,
  alert,
  onClick,
}: {
  icon: IconName;
  label: string;
  current: boolean;
  disabled: boolean;
  alert?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className="bw-nav-item bw-pressable"
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={20} variant={current ? "bold" : "linear"} />
      <span>{label}</span>
      {alert && <span className="bw-nav-alert" aria-hidden="true" />}
    </button>
  );
}

export function Sidebar({
  t,
  screen,
  locale,
  entries,
  showFiles,
  activePath,
  expanded,
  syncTone,
  syncLabel,
  syncBusy,
  disabled,
  actionsDisabled,
  onNavigate,
  onOpen,
  onToggle,
  onCreate,
  onActions,
  onClose,
  onCollapse,
}: {
  t: Dictionary;
  screen: Screen;
  locale: string;
  entries: Entry[];
  showFiles: boolean;
  activePath: string | null;
  expanded: ReadonlySet<string>;
  syncTone: SyncTone;
  syncLabel: string;
  syncBusy: boolean;
  disabled: boolean;
  actionsDisabled: boolean;
  onNavigate(screen: Screen): void;
  onOpen(path: string): void;
  onToggle(path: string): void;
  onCreate(trigger: HTMLElement): void;
  onActions?: (entry: Entry, trigger: HTMLElement) => void;
  onClose?: () => void;
  onCollapse?: () => void;
}) {
  const tree = useMemo(() => buildTree(entries, locale), [entries, locale]);
  const rows = useMemo(() => visibleNodes(tree, expanded), [tree, expanded]);
  return (
    <nav className="bw-sidebar" aria-label={t.navigation}>
      <div className="bw-sidebar-header">
        <BrandMark size={28} />
        <span className="bw-sidebar-wordmark">Brainwave</span>
        {onClose && (
          <IconButton
            label={t.closeNavigation}
            icon="close"
            onClick={onClose}
          />
        )}
        {onCollapse && (
          <IconButton
            label={t.collapseSidebar}
            icon="panelClose"
            onClick={onCollapse}
          />
        )}
      </div>
      <div className="bw-sidebar-links">
        <NavItem
          icon="home"
          label={t.home}
          current={screen === "home"}
          disabled={disabled}
          onClick={() => onNavigate("home")}
        />
        <NavItem
          icon="search"
          label={t.search}
          current={screen === "search"}
          disabled={disabled}
          onClick={() => onNavigate("search")}
        />
        <NavItem
          icon="cloud"
          label={t.sync}
          current={screen === "sync"}
          disabled={disabled}
          alert={syncTone === "danger"}
          onClick={() => onNavigate("sync")}
        />
      </div>
      {showFiles && (
        <section
          className="bw-sidebar-files"
          aria-labelledby="bw-files-heading"
        >
          <div className="bw-sidebar-section-head">
            <h2 id="bw-files-heading">{t.filesHeading}</h2>
            <IconButton
              label={t.newItem}
              icon="plus"
              disabled={actionsDisabled}
              onClick={(event) => onCreate(event.currentTarget)}
            />
          </div>
          <div className="bw-sidebar-tree">
            <FileTree
              rows={rows}
              activePath={activePath}
              expanded={expanded}
              disabled={disabled}
              actionsDisabled={actionsDisabled}
              t={t}
              onOpen={onOpen}
              onToggle={onToggle}
              onActions={onActions}
            />
          </div>
        </section>
      )}
      <div className="bw-sidebar-footer">
        <NavItem
          icon="settings"
          label={t.settings}
          current={screen === "settings"}
          disabled={disabled}
          onClick={() => onNavigate("settings")}
        />
        <button
          type="button"
          className={`bw-sidebar-sync bw-pressable is-${syncTone}`}
          disabled={disabled}
          onClick={() => onNavigate("sync")}
        >
          <span
            className={`bw-sync-dot ${syncBusy ? "is-busy" : ""}`}
            aria-hidden="true"
          />
          <span>{syncLabel}</span>
        </button>
      </div>
    </nav>
  );
}
