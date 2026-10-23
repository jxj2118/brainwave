import { useEffect, useState } from "react";
import type {
  RemoteProbe,
  StoredCredentials,
  SyncConfiguration,
} from "../../platform/contracts";
import type { Dictionary } from "../../shared/i18n/en";
import { Icon } from "../../shared/Icon";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { Dialog } from "../../shared/ui/Dialog";
import { TextField } from "../../shared/ui/Fields";
import { fingerprint, type SyncFields } from "./syncFingerprint";

export function SyncConfigForm({
  configuration,
  credentials,
  locked,
  remoteLocked,
  t,
  message,
  onTest,
  onSave,
  onClearCredentials,
}: {
  configuration: SyncConfiguration | null;
  credentials: StoredCredentials | null;
  locked: boolean;
  remoteLocked: boolean;
  t: Dictionary;
  message(error: unknown): string;
  onTest(remote: string, username: string, token: string): Promise<RemoteProbe>;
  onSave(
    value: SyncConfiguration,
    username: string,
    token: string,
  ): Promise<void>;
  onClearCredentials(): Promise<void>;
}) {
  const [fields, setFields] = useState<SyncFields>({
    remote: "",
    username: "",
    token: "",
    name: "",
    email: "",
  });
  const [tested, setTested] = useState<{
    key: string;
    probe: RemoteProbe;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (!configuration) return;
    setFields((current) => ({
      ...current,
      remote: configuration.remote,
      name: configuration.name,
      email: configuration.email,
    }));
  }, [configuration?.remote, configuration?.name, configuration?.email]);
  useEffect(() => {
    if (credentials)
      setFields((current) => ({ ...current, username: credentials.username }));
  }, [credentials?.username]);
  const key = fingerprint(fields);
  const remote = fields.remote.trim();
  const passed = !!tested && tested.key === key;
  const busy = locked || testing || saving;
  const canSave =
    !busy &&
    !!fields.name.trim() &&
    !!fields.email.trim() &&
    (!remote || passed);
  const update = (patch: Partial<SyncFields>) => {
    setFields((current) => ({ ...current, ...patch }));
    setNotice(null);
  };
  async function test() {
    setTesting(true);
    setError(null);
    setNotice(null);
    const snapshot = key;
    try {
      const probe = await onTest(remote, fields.username.trim(), fields.token);
      setTested({ key: snapshot, probe });
    } catch (e) {
      setTested(null);
      setError(e);
    } finally {
      setTesting(false);
    }
  }
  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(
        {
          remote,
          name: fields.name.trim(),
          email: fields.email.trim(),
          branch: configuration?.branch ?? null,
        },
        fields.username.trim(),
        fields.token,
      );
      const next = { ...fields, token: "" };
      setFields(next);
      if (tested && passed) setTested({ ...tested, key: fingerprint(next) });
      setNotice(t.configurationSaved);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }
  async function clear() {
    setSaving(true);
    setError(null);
    try {
      await onClearCredentials();
      setTested(null);
      setFields((current) => ({ ...current, username: "", token: "" }));
      setConfirmClear(false);
      setNotice(t.credentialsCleared);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }
  const hint = !remote
    ? t.localIdentityOnly
    : passed
      ? null
      : tested
        ? t.retestRequired
        : t.testFirst;
  return (
    <Card className="sync-config" aria-label={t.syncConfiguration}>
      <h2 className="panel-title">
        <span className="bw-icon-tile">
          <Icon name="settings" size={20} />
        </span>
        {t.syncConfiguration}
      </h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <TextField
          label={t.remoteUrl}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          value={fields.remote}
          disabled={busy || remoteLocked}
          placeholder="https://git.example.com/you/notes.git"
          onChange={(e) => update({ remote: e.currentTarget.value })}
          hint={t.remoteHint}
        />
        <TextField
          label={t.gitUsername}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          value={fields.username}
          disabled={busy}
          onChange={(e) => update({ username: e.currentTarget.value })}
        />
        <TextField
          label={t.gitToken}
          type="password"
          autoComplete="off"
          value={fields.token}
          disabled={busy}
          placeholder={credentials?.hasToken ? t.savedToken : undefined}
          onChange={(e) => update({ token: e.currentTarget.value })}
          hint={t.tokenStoredHint}
        />
        <TextField
          label={t.authorName}
          required
          autoComplete="name"
          value={fields.name}
          disabled={busy}
          onChange={(e) => update({ name: e.currentTarget.value })}
        />
        <TextField
          label={t.authorEmail}
          required
          type="email"
          autoComplete="email"
          value={fields.email}
          disabled={busy}
          onChange={(e) => update({ email: e.currentTarget.value })}
        />
        {passed && tested && (
          <div className="sync-test-result" role="status">
            <Icon name="checkCircle" size={20} variant="bold" />
            <div>
              <strong>{t.testPassed}</strong>
              <span>
                {tested.probe.empty || !tested.probe.defaultBranch
                  ? t.remoteEmpty
                  : `${t.remoteBranch}: ${tested.probe.defaultBranch}`}
                {" · "}
                {t.pushAllowed}
              </span>
            </div>
          </div>
        )}
        {error !== null && (
          <p className="form-error" role="alert">
            {message(error)}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {hint && <p className="panel-muted sync-hint">{hint}</p>}
        <div className="sync-config-actions">
          <Button
            busy={testing}
            disabled={busy || !remote}
            onClick={() => void test()}
          >
            <Icon name="plug" size={18} />
            {testing ? t.testing : t.testConnection}
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={saving}
            disabled={!canSave}
          >
            {t.saveConfiguration}
          </Button>
        </div>
        {credentials && (credentials.hasToken || credentials.username) && (
          <Button
            variant="ghost"
            className="sync-clear"
            disabled={busy}
            onClick={() => setConfirmClear(true)}
          >
            <Icon name="key" size={18} />
            {t.clearCredentials}
          </Button>
        )}
      </form>
      {confirmClear && (
        <Dialog
          open
          title={t.clearCredentials}
          icon="key"
          danger
          busy={saving}
          onClose={() => setConfirmClear(false)}
        >
          <p className="panel-muted">{t.clearCredentialsBody}</p>
          <div className="bw-dialog-actions">
            <Button disabled={saving} onClick={() => setConfirmClear(false)}>
              {t.cancel}
            </Button>
            <Button variant="danger" busy={saving} onClick={() => void clear()}>
              {t.clearCredentials}
            </Button>
          </div>
        </Dialog>
      )}
    </Card>
  );
}
