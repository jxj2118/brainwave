import type { Platform, Preferences, UiState } from "../contracts";
const UI_STATE = "brainwave.ui";
export const webPlatform: Platform = {
  kind: "web",
  notes: null,
  async loadPreferences() {
    try {
      const parsed: unknown = JSON.parse(
        localStorage.getItem("brainwave.preferences") ?? "{}",
      );
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  },
  async savePreferences(value: Preferences) {
    try {
      localStorage.setItem("brainwave.preferences", JSON.stringify(value));
    } catch {
      throw { code: "preferencesUnavailable" };
    }
  },
  localState: {
    async load() {
      try {
        const parsed: unknown = JSON.parse(
          localStorage.getItem(UI_STATE) ?? "{}",
        );
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {};
      } catch {
        return {};
      }
    },
    async save(value: UiState) {
      try {
        localStorage.setItem(UI_STATE, JSON.stringify(value));
      } catch {
        // UI state is disposable; storage quota or privacy mode must not block the app.
      }
    },
  },
};
