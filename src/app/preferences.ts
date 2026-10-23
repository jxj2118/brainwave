import type { Locale, Preferences } from "../platform/contracts";
export function normalizePreferences(
  value: unknown,
  fallbackLocale: Locale,
): Preferences {
  const saved =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    locale:
      saved.locale === "zh-CN" || saved.locale === "en"
        ? saved.locale
        : fallbackLocale,
    theme:
      saved.theme === "light" ||
      saved.theme === "dark" ||
      saved.theme === "system"
        ? saved.theme
        : "system",
  };
}
