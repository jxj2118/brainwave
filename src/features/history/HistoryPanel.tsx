import { Button } from "../../shared/ui/Button";
import { Icon } from "../../shared/Icon";
import { useEffect, useState } from "react";
import type { HistoryEntry, HistoryStorage } from "../../platform/contracts";
import type { Dictionary } from "../../shared/i18n/en";
export function HistoryPanel({
  storage,
  path,
  t,
  onClose,
  onRestore,
  beforeCheckpoint,
  message,
}: {
  storage: HistoryStorage;
  path: string;
  t: Dictionary;
  onClose(): void;
  onRestore(body: string): Promise<void>;
  beforeCheckpoint(): Promise<void>;
  message(error: unknown): string;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(true);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let active = true;
    void storage
      .list(path)
      .then(
        (value) => {
          if (active) setEntries(value);
        },
        (e) => {
          if (active) setError(e);
        },
      )
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [path, storage]);
  async function checkpoint() {
    setBusy(true);
    setError(null);
    try {
      await beforeCheckpoint();
      await storage.checkpoint();
      setEntries(await storage.list(path));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function select(entry: HistoryEntry) {
    setBusy(true);
    setError(null);
    setConfirm(false);
    try {
      const text = await storage.version(entry.oid, entry.path ?? path);
      setText(text);
      setSelected(entry);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (text === null) return;
    setBusy(true);
    setError(null);
    try {
      // Restore only the body. The current note's immutable identity and unknown metadata stay intact.
      await onRestore(versionBody(text));
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="feature-panel" aria-label={t.history}>
      <div className="panel-heading">
        <h2 className="panel-title">
          <span className="bw-icon-tile">
            <Icon name="history" size={20} />
          </span>
          {t.history}
        </h2>
        <Button disabled={busy} onClick={onClose}>
          <Icon name="close" size={18} />
          {t.close}
        </Button>
      </div>
      <p className="muted path-label">{path}</p>
      {error !== null && (
        <p role="alert" className="form-error">
          {message(error)}
        </p>
      )}
      <Button disabled={busy} onClick={() => void checkpoint()}>
        <Icon name="snapshot" size={18} />
        {t.checkpoint}
      </Button>
      {!entries.length && !busy && <p className="muted">{t.noHistory}</p>}
      <ol className="history-list">
        {entries.map((entry, index) => (
          <li
            key={entry.oid}
            style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
          >
            <Button
              disabled={busy}
              onClick={() => void select(entry)}
              aria-pressed={selected?.oid === entry.oid}
            >
              <strong>
                {new Date(entry.timestamp * 1000).toLocaleString()}
              </strong>
              <span>
                {entry.author} · {entry.oid.slice(0, 7)}
              </span>
              <span>{entry.path}</span>
            </Button>
          </li>
        ))}
      </ol>
      {text !== null && (
        <>
          <h3>{t.versionContent}</h3>
          <pre className="version-content">{text}</pre>
          <p className="muted">{t.restoreBodyHint}</p>
          {confirm ? (
            <div className="dialog-actions">
              <Button onClick={() => setConfirm(false)}>{t.cancel}</Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void restore()}
              >
                {t.confirmRestore}
              </Button>
            </div>
          ) : (
            <Button disabled={busy} onClick={() => setConfirm(true)}>
              <Icon name="restore" size={18} />
              {t.restoreVersion}
            </Button>
          )}
        </>
      )}
      {busy && <p role="status">{t.loading}</p>}
    </section>
  );
}
export function versionBody(text: string): string {
  const withoutBom = text.startsWith("\ufeff") ? text.slice(1) : text;
  if (!/^---\r?\n/.test(withoutBom)) return withoutBom;
  const opening = /^---\r?\n/.exec(withoutBom)!;
  const rest = withoutBom.slice(opening[0].length);
  const match = /^(?:---|\.\.\.)(?:\r?\n|$)/m.exec(rest);
  return match ? rest.slice(match.index + match[0].length) : withoutBom;
}
