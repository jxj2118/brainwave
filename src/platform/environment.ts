import type { Locale, Theme } from "./contracts";
export function systemLocale(): Locale {
  return navigator.languages.some((value) =>
    value.toLowerCase().startsWith("zh"),
  )
    ? "zh-CN"
    : "en";
}
export function applyAppearance(locale: Locale, theme: Theme): () => void {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    document.documentElement.dataset.theme =
      theme === "system" ? (media.matches ? "dark" : "light") : theme;
  };
  document.documentElement.lang = locale;
  apply();
  media.addEventListener("change", apply);
  return () => media.removeEventListener("change", apply);
}
export function onBackground(callback: () => void): () => void {
  const handle = () => {
    if (document.visibilityState === "hidden") callback();
  };
  document.addEventListener("visibilitychange", handle);
  return () => document.removeEventListener("visibilitychange", handle);
}
export function protectUnsavedChanges(isDirty: () => boolean): () => void {
  const handle = (event: BeforeUnloadEvent) => {
    if (isDirty()) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", handle);
  return () => window.removeEventListener("beforeunload", handle);
}

export function observeViewport(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const update = () => {
    document.documentElement.dataset.compactViewport = String(
      viewport.height <= 600,
    );
    document.documentElement.dataset.shortViewport = String(
      viewport.height <= 400,
    );
    document.documentElement.style.setProperty(
      "--app-height",
      `${viewport.height}px`,
    );
    document.documentElement.style.setProperty(
      "--viewport-top",
      `${viewport.offsetTop}px`,
    );
  };
  update();
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  return () => {
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
  };
}

export function onForeground(callback: () => void) {
  const listener = () => {
    if (document.visibilityState === "visible") callback();
  };
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}
export function isForeground() {
  return document.visibilityState === "visible";
}

export function observeMedia(
  query: string,
  callback: (matches: boolean) => void,
): () => void {
  const media = matchMedia(query);
  const handle = () => callback(media.matches);
  handle();
  media.addEventListener("change", handle);
  return () => media.removeEventListener("change", handle);
}
