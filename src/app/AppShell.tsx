import { useEffect, useState, type ReactNode } from "react";
import type { Screen } from "../platform/navigation";
import type { Dictionary } from "../shared/i18n/en";
import { BrandMark } from "../shared/ui/BrandMark";
import { IconButton } from "../shared/ui/Button";
import { Drawer } from "../shared/ui/Drawer";

export type SidebarLayout = "docked" | "collapsed" | "drawer";

export function AppShell({
  screen,
  pageKey,
  title,
  subtitle,
  status,
  t,
  busy,
  onBack,
  actions,
  children,
  notices,
  floating,
  sidebar,
  layout,
  sidebarOpen,
  onSidebarOpen,
  onSidebarClose,
  onSidebarExpand,
}: {
  screen: Screen;
  pageKey: string;
  title: string;
  subtitle?: ReactNode;
  status?: ReactNode;
  t: Dictionary;
  busy: boolean;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  notices?: ReactNode;
  floating?: ReactNode;
  sidebar: ReactNode;
  layout: SidebarLayout;
  sidebarOpen: boolean;
  onSidebarOpen(): void;
  onSidebarClose(): void;
  onSidebarExpand(): void;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setScrolled(false), [pageKey]);
  const leading = onBack ? (
    <IconButton label={t.back} icon="back" disabled={busy} onClick={onBack} />
  ) : layout === "drawer" ? (
    <IconButton
      label={t.openNavigation}
      icon="menu"
      aria-haspopup="dialog"
      aria-expanded={sidebarOpen}
      onClick={onSidebarOpen}
    />
  ) : layout === "collapsed" ? (
    <IconButton
      label={t.expandSidebar}
      icon="panelOpen"
      onClick={onSidebarExpand}
    />
  ) : null;
  return (
    <div
      className={`bw-app-shell ${screen === "editor" ? "is-editing" : ""} ${layout === "docked" ? "has-sidebar" : ""}`}
      data-scrolled={scrolled || undefined}
    >
      {layout === "docked" && (
        <aside className="bw-sidebar-dock">{sidebar}</aside>
      )}
      <div className="bw-app-column">
        <header className="bw-app-header">
          <div className="bw-app-header-inner">
            <div className="bw-app-topline">
              <div className="bw-app-leading">
                {leading}
                {layout === "drawer" && screen !== "editor" && (
                  <span className="bw-app-brand" aria-hidden="true">
                    <BrandMark size={26} />
                    <span className="bw-wordmark">Brainwave</span>
                  </span>
                )}
              </div>
              <div className="bw-header-actions">{actions}</div>
            </div>
            <div className="bw-page-heading" key={pageKey}>
              <div>
                <h1 title={title}>{title}</h1>
                {(subtitle || status) && (
                  <div className="bw-page-meta">
                    {subtitle && (
                      <div className="bw-page-subtitle">{subtitle}</div>
                    )}
                    {status && <div className="bw-page-status">{status}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        {notices}
        <main
          key={pageKey}
          className={`bw-app-main ${screen === "editor" ? "bw-app-main--editor" : ""}`}
          onScroll={(event) => {
            const next = event.currentTarget.scrollTop > 4;
            if (next !== scrolled) setScrolled(next);
          }}
        >
          {children}
        </main>
        {floating}
      </div>
      {layout === "drawer" && (
        <Drawer
          open={sidebarOpen}
          label={t.navigation}
          onClose={onSidebarClose}
        >
          {sidebar}
        </Drawer>
      )}
    </div>
  );
}
