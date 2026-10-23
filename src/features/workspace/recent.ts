import type { RecentEntry } from "../../platform/contracts";

export const RECENT_LIMIT = 8;

const within = (path: string, target: string) =>
  path === target || path.startsWith(`${target}/`);

export function touchRecent(
  list: RecentEntry[],
  path: string,
  at: number,
  limit = RECENT_LIMIT,
): RecentEntry[] {
  return [{ path, at }, ...list.filter((item) => item.path !== path)].slice(
    0,
    limit,
  );
}

/** Rewrites a moved note, or every note under a moved folder. */
export function moveRecent(
  list: RecentEntry[],
  from: string,
  to: string,
): RecentEntry[] {
  return list.map((item) =>
    within(item.path, from)
      ? { ...item, path: to + item.path.slice(from.length) }
      : item,
  );
}

export function removeRecent(list: RecentEntry[], path: string): RecentEntry[] {
  return list.filter((item) => !within(item.path, path));
}
