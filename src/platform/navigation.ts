export type Screen = "home" | "search" | "sync" | "settings" | "editor";
const screens: readonly Screen[] = [
  "home",
  "search",
  "sync",
  "settings",
  "editor",
];
export interface Route {
  screen: Screen;
  notePath?: string;
}
interface NavigationState {
  brainwaveNavigation: true;
  index: number;
  route: Route;
}
const root: Route = { screen: "home" };
function read(value: unknown): NavigationState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<NavigationState>;
  const route = state.route;
  if (
    state.brainwaveNavigation !== true ||
    typeof state.index !== "number" ||
    !route ||
    !screens.includes(route.screen) ||
    (route.screen === "editor" && typeof route.notePath !== "string")
  )
    return null;
  return state as NavigationState;
}
export function initializeNavigation(): void {
  history.replaceState(
    { brainwaveNavigation: true, index: 0, route: root },
    "",
  );
}
export function pushRoute(route: Route): void {
  history.pushState(
    {
      brainwaveNavigation: true,
      index: (read(history.state)?.index ?? 0) + 1,
      route,
    },
    "",
  );
}
export function replaceRoute(route: Route): void {
  history.replaceState(
    {
      brainwaveNavigation: true,
      index: read(history.state)?.index ?? 0,
      route,
    },
    "",
  );
}
export function backRoute(): boolean {
  if ((read(history.state)?.index ?? 0) === 0) return false;
  history.back();
  return true;
}
export function subscribeNavigation(
  listener: (route: Route) => void,
): () => void {
  const handle = (event: PopStateEvent) => {
    const state = read(event.state);
    if (state) listener(state.route);
  };
  window.addEventListener("popstate", handle);
  return () => window.removeEventListener("popstate", handle);
}
