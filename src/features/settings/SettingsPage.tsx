import { useId } from "react";
import type { Platform, Preferences } from "../../platform/contracts";
import type { Dictionary } from "../../shared/i18n/en";
import { Icon, type IconName } from "../../shared/Icon";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import "./settings.css";
import fontLicense from "../../shared/assets/fonts/LICENSE?raw";
const locales = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
] as const;
const themes: readonly {
  value: Preferences["theme"];
  icon: IconName;
}[] = [
  { value: "system", icon: "monitor" },
  { value: "light", icon: "sun" },
  { value: "dark", icon: "moon" },
];
export function SettingsPage({
  value,
  onChange,
  t,
  platform,
  onOpenSync,
}: {
  value: Preferences;
  onChange(value: Preferences): void;
  t: Dictionary;
  platform: Platform;
  onOpenSync?: () => void;
}) {
  const languageId = useId();
  return (
    <div className="settings-page">
      <Card className="settings-appearance">
        <h2 className="settings-heading">
          <span className="bw-icon-tile">
            <Icon name="sun" size={20} />
          </span>
          {t.appearance}
        </h2>
        <div className="settings-theme-options">
          {themes.map(({ value: theme, icon }) => {
            const selected = value.theme === theme;
            return (
              <Button
                className="settings-theme-option"
                key={theme}
                aria-label={t[theme]}
                aria-pressed={selected}
                onClick={() => onChange({ ...value, theme })}
              >
                <span className="settings-theme-preview" data-preview={theme}>
                  <Icon
                    name={icon}
                    size={26}
                    variant={selected ? "bold" : "linear"}
                  />
                  {selected && (
                    <span className="settings-theme-check">
                      <Icon name="checkCircle" size={18} variant="bold" />
                    </span>
                  )}
                </span>
                <strong>{t[theme]}</strong>
                <span>
                  {theme === "system"
                    ? t.themeSystemHint
                    : theme === "light"
                      ? t.themeLightHint
                      : t.themeDarkHint}
                </span>
              </Button>
            );
          })}
        </div>
      </Card>
      <Card className="settings-row-card">
        <label className="settings-row bw-pressable" htmlFor={languageId}>
          <span className="bw-icon-tile">
            <Icon name="globe" size={20} />
          </span>
          <span className="settings-row-copy">
            <strong>{t.language}</strong>
            <span>{t.languageHint}</span>
          </span>
          <span className="settings-row-value" aria-hidden="true">
            {locales.find((locale) => locale.value === value.locale)?.label}
            <Icon name="chevron" size={16} />
          </span>
          <select
            id={languageId}
            aria-label={t.language}
            className="settings-row-select"
            value={value.locale}
            onChange={(e) =>
              onChange({
                ...value,
                locale: e.currentTarget.value as Preferences["locale"],
              })
            }
          >
            {locales.map((locale) => (
              <option key={locale.value} value={locale.value}>
                {locale.label}
              </option>
            ))}
          </select>
        </label>
      </Card>
      <Card className="settings-row-card">
        <div className="settings-row">
          <span className="bw-icon-tile">
            <Icon name="note" size={20} />
          </span>
          <span className="settings-row-copy">
            <strong>{t.storage}</strong>
            <span>{platform.notes ? t.storageBody : t.webBody}</span>
          </span>
        </div>
      </Card>
      <Card className="settings-row-card">
        {onOpenSync ? (
          <button
            type="button"
            className="settings-row bw-pressable"
            onClick={onOpenSync}
          >
            <span className="bw-icon-tile">
              <Icon name="cloud" size={20} />
            </span>
            <span className="settings-row-copy">
              <strong>{t.syncSettings}</strong>
              <span>{t.syncSettingsHint}</span>
            </span>
            <span className="settings-row-value" aria-hidden="true">
              <Icon name="chevron" size={16} />
            </span>
          </button>
        ) : (
          <div className="settings-row">
            <span className="bw-icon-tile">
              <Icon name="cloud" size={20} />
            </span>
            <span className="settings-row-copy">
              <strong>{t.sync}</strong>
              <span>{t.syncBody}</span>
            </span>
          </div>
        )}
      </Card>
      <Card className="settings-row-card settings-about">
        <div className="settings-row">
          <span className="bw-icon-tile">
            <Icon name="info" size={20} />
          </span>
          <span className="settings-row-copy">
            <strong>{t.about}</strong>
            <span>Brainwave · 0.1.0</span>
          </span>
        </div>
        <details className="settings-license">
          <summary>
            <span className="bw-disclosure">
              {t.licenses}
              <Icon name="chevronDown" size={16} />
            </span>
          </summary>
          <p>{t.iconLicense}</p>
          <pre>{fontLicense}</pre>
        </details>
      </Card>
    </div>
  );
}
