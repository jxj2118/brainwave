import { useState } from "react";
import type {
  RemoteProbe,
  StoredCredentials,
  SyncConfiguration,
  SyncStatus,
} from "../../platform/contracts";
import type { Dictionary } from "../../shared/i18n/en";
import { Icon } from "../../shared/Icon";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { StatusPill } from "../../shared/ui/Feedback";
import { SyncConfigForm } from "./SyncConfigForm";
import { SyncConflicts } from "./SyncConflicts";

export function SyncPage({
  status,
  error,
  running,
  credentials,
  t,
  message,
  onRun,
  onTest,
  onConfigure,
  onResolve,
  onClearCredentials,
}: {
  status: SyncStatus | null;
  error: unknown;
  running: boolean;
  credentials: StoredCredentials | null;
  t: Dictionary;
  message(error: unknown): string;
  onRun(): Promise<unknown>;
  onTest(remote: string, username: string, token: string): Promise<RemoteProbe>;
  onConfigure(
    value: SyncConfiguration,
    username: string,
    token: string,
  ): Promise<void>;
  onResolve(key: string, choice: "local" | "remote" | "both"): Promise<void>;
  onClearCredentials(): Promise<void>;
}) {
  const [resolving, setResolving] = useState(false);
  const [localError, setLocalError] = useState<unknown>(null);
  const disabled = running || resolving;
  async function resolve(key: string, choice: "local" | "remote" | "both") {
    setResolving(true);
    setLocalError(null);
    try {
      await onResolve(key, choice);
    } catch (e) {
      setLocalError(e);
    } finally {
      setResolving(false);
    }
  }
  const phase = running
    ? t.syncRunning
    : error
      ? t.syncFailed
      : status?.phase === "synced"
        ? t.syncComplete
        : status?.phase === "localChanges"
          ? t.localChanges
          : status?.phase === "conflict"
            ? t.syncConflict
            : status?.configuration.remote
              ? t.syncReady
              : t.localOnly;
  const problem = localError ?? error;
  return (
    <div className="sync-page">
      <Card className="sync-panel" aria-label={t.syncStatus}>
        <div className="sync-panel-heading">
          <h2 className="panel-title">
            <span className="bw-icon-tile">
              <Icon name="cloud" size={20} />
            </span>
            {t.syncStatus}
          </h2>
          <StatusPill
            tone={
              error || status?.phase === "conflict"
                ? "danger"
                : status?.phase === "synced"
                  ? "positive"
                  : "neutral"
            }
            busy={running}
            icon={
              error || status?.phase === "conflict"
                ? undefined
                : status?.phase === "synced"
                  ? "cloudCheck"
                  : status?.phase === "localChanges"
                    ? "cloudUpload"
                    : "cloud"
            }
          >
            {phase}
            {status?.branch ? ` · ${status.branch}` : ""}
          </StatusPill>
        </div>
        {status?.configuration.remote && (
          <p className="panel-muted path-label">
            {status.configuration.remote}
          </p>
        )}
        {problem != null && (
          <p className="form-error" role="alert">
            {message(problem)}
          </p>
        )}
        <Button
          variant="primary"
          className="sync-run"
          disabled={disabled || !status?.configuration.remote}
          onClick={() => void onRun()}
        >
          <Icon
            name="refresh"
            size={18}
            className={running ? "is-spinning" : undefined}
          />
          {running ? t.syncRunning : t.syncNow}
        </Button>
        <SyncConflicts
          status={status}
          disabled={disabled}
          t={t}
          onResolve={(key, choice) => void resolve(key, choice)}
        />
      </Card>
      <SyncConfigForm
        configuration={status?.configuration ?? null}
        credentials={credentials}
        locked={disabled}
        remoteLocked={status?.phase === "conflict"}
        t={t}
        message={message}
        onTest={onTest}
        onSave={onConfigure}
        onClearCredentials={onClearCredentials}
      />
    </div>
  );
}
