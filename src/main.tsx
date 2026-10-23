import "./shared/styles/layers.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { createPlatform } from "./platform";
import { systemLocale, applyAppearance } from "./platform/environment";
import { normalizePreferences } from "./app/preferences";

async function start() {
  const platform = await createPlatform();
  const saved = await platform.loadPreferences().catch(() => ({}));
  const preferences = normalizePreferences(saved, systemLocale());
  const cleanup = applyAppearance(preferences.locale, preferences.theme);
  cleanup();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App platform={platform} initialPreferences={preferences} />
    </React.StrictMode>,
  );
}
void start();
