import { useState } from "react";
import type { Entry } from "../../platform/contracts";
import type { Dictionary } from "../../shared/i18n/en";
import { Dialog } from "../../shared/ui/Dialog";
import { Button } from "../../shared/ui/Button";
import { Icon } from "../../shared/Icon";
import { TextField, SelectField } from "../../shared/ui/Fields";
export function EntryActions({
  entry,
  entries,
  busy,
  t,
  onClose,
  onMove,
  onDelete,
  error,
  returnFocusTo,
}: {
  entry: Pick<Entry, "path" | "name" | "kind">;
  entries: Entry[];
  busy: boolean;
  t: Dictionary;
  onClose(): void;
  onMove(folder: string, name: string): Promise<void>;
  onDelete(): Promise<void>;
  error: string | null;
  returnFocusTo?: HTMLElement;
}) {
  const [name, setName] = useState(entry.name);
  const [folder, setFolder] = useState(
    entry.path.slice(0, Math.max(0, entry.path.lastIndexOf("/"))),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Dialog
      open
      title={confirmDelete ? t.deleteEntry : t.fileActions}
      variant="sheet"
      icon={
        confirmDelete ? "trash" : entry.kind === "folder" ? "folder" : "edit"
      }
      danger={confirmDelete}
      busy={busy}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirmDelete) void onMove(folder, name);
        }}
      >
        <p className="muted path-label">{entry.path}</p>
        {confirmDelete ? (
          <p className="delete-description">
            {entry.kind === "folder" ? t.deleteFolderBody : t.deleteNoteBody}
          </p>
        ) : (
          <>
            <TextField
              label={t.name}
              autoFocus
              value={name}
              maxLength={120}
              disabled={busy}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            <SelectField
              label={t.moveTo}
              value={folder}
              disabled={busy}
              onChange={(event) => setFolder(event.currentTarget.value)}
            >
              <option value="">{t.personal}</option>
              {entries
                .filter(
                  (e) =>
                    e.kind === "folder" &&
                    (entry.kind !== "folder" ||
                      (e.path !== entry.path &&
                        !e.path.startsWith(entry.path + "/"))),
                )
                .map((e) => (
                  <option key={e.path} value={e.path}>
                    {e.path}
                  </option>
                ))}
            </SelectField>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="bw-dialog-actions">
          <Button disabled={busy} onClick={onClose}>
            {t.cancel}
          </Button>
          {confirmDelete ? (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => void onDelete()}
            >
              <Icon name="trash" size={18} />
              {busy ? t.loading : t.confirmDelete}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                <Icon name="trash" size={18} />
                {t.deleteEntry}
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={busy || !name.trim()}
              >
                {busy ? t.loading : t.applyChanges}
              </Button>
            </>
          )}
        </div>
      </form>
    </Dialog>
  );
}
