import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LocalStateStorage,
  RecentEntry,
  UiState,
} from "../platform/contracts";
import {
  moveRecent,
  RECENT_LIMIT,
  removeRecent,
  touchRecent,
} from "../features/workspace/recent";

const empty: UiState = { recent: [], expanded: [], sidebarCollapsed: false };

function normalize(value: Partial<UiState>): UiState {
  const recent = Array.isArray(value.recent)
    ? value.recent.filter(
        (item): item is RecentEntry =>
          !!item &&
          typeof item.path === "string" &&
          typeof item.at === "number",
      )
    : [];
  const expanded = Array.isArray(value.expanded)
    ? value.expanded.filter((item) => typeof item === "string")
    : [];
  return {
    recent: recent.slice(0, RECENT_LIMIT),
    expanded,
    sidebarCollapsed: value.sidebarCollapsed === true,
  };
}

const within = (path: string, target: string) =>
  path === target || path.startsWith(`${target}/`);

export function useUiState(storage: LocalStateStorage) {
  const [state, setState] = useState<UiState>(empty);
  const loaded = useRef(false);
  useEffect(() => {
    let active = true;
    const finish = (value: Partial<UiState>) => {
      if (!active) return;
      const stored = normalize(value);
      // Changes made while loading win over stored values.
      setState((current) => ({
        recent: [
          ...current.recent,
          ...stored.recent.filter(
            (item) => !current.recent.some((c) => c.path === item.path),
          ),
        ].slice(0, RECENT_LIMIT),
        expanded: [...new Set([...stored.expanded, ...current.expanded])],
        sidebarCollapsed: stored.sidebarCollapsed,
      }));
      loaded.current = true;
    };
    storage.load().then(finish, () => finish({}));
    return () => {
      active = false;
    };
  }, [storage]);
  useEffect(() => {
    if (loaded.current) void storage.save(state).catch(() => {});
  }, [state, storage]);

  const recordOpen = useCallback((path: string) => {
    setState((s) => ({
      ...s,
      recent: touchRecent(s.recent, path, Date.now()),
    }));
  }, []);
  const recordMove = useCallback((from: string, to: string) => {
    setState((s) => ({
      ...s,
      recent: moveRecent(s.recent, from, to),
      expanded: s.expanded.map((path) =>
        within(path, from) ? to + path.slice(from.length) : path,
      ),
    }));
  }, []);
  const recordDelete = useCallback((path: string) => {
    setState((s) => ({
      ...s,
      recent: removeRecent(s.recent, path),
      expanded: s.expanded.filter((item) => !within(item, path)),
    }));
  }, []);
  const expand = useCallback((paths: string[]) => {
    setState((s) =>
      paths.every((p) => s.expanded.includes(p))
        ? s
        : { ...s, expanded: [...new Set([...s.expanded, ...paths])] },
    );
  }, []);
  const toggle = useCallback((path: string) => {
    setState((s) => ({
      ...s,
      expanded: s.expanded.includes(path)
        ? s.expanded.filter((item) => item !== path)
        : [...s.expanded, path],
    }));
  }, []);
  const setSidebarCollapsed = useCallback((sidebarCollapsed: boolean) => {
    setState((s) => ({ ...s, sidebarCollapsed }));
  }, []);
  const expanded = useMemo(() => new Set(state.expanded), [state.expanded]);
  return {
    recent: state.recent,
    expanded,
    sidebarCollapsed: state.sidebarCollapsed,
    recordOpen,
    recordMove,
    recordDelete,
    expand,
    toggle,
    setSidebarCollapsed,
  };
}
export type UiStateController = ReturnType<typeof useUiState>;
