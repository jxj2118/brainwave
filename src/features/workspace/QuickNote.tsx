import { useState } from "react";
import type { Dictionary } from "../../shared/i18n/en";
import { Icon } from "../../shared/Icon";
import { Button } from "../../shared/ui/Button";

export function QuickNote({
  t,
  busy,
  onSave,
}: {
  t: Dictionary;
  busy: boolean;
  onSave(text: string): Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      if (await onSave(text)) setText("");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="quick-note"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="quick-note-label" htmlFor="quick-note">
        <Icon name="inbox" size={18} variant="bold" />
        {t.quickNote}
      </label>
      <textarea
        id="quick-note"
        className="quick-note-input"
        rows={3}
        value={text}
        placeholder={t.quickNotePlaceholder}
        disabled={saving}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void save();
          }
        }}
      />
      <div className="quick-note-footer">
        <span className="quick-note-hint">{t.quickNoteHint}</span>
        <Button
          type="submit"
          variant="primary"
          busy={saving}
          disabled={busy || !text.trim()}
        >
          {t.quickNoteSave}
        </Button>
      </div>
    </form>
  );
}
