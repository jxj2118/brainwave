import { Icon } from "../../shared/Icon";
import { Button } from "../../shared/ui/Button";
import type { SyncStatus } from "../../platform/contracts";
import type { Dictionary } from "../../shared/i18n/en";
export function SyncConflicts({
  status,
  disabled,
  t,
  onResolve,
}: {
  status: SyncStatus | null;
  disabled: boolean;
  t: Dictionary;
  onResolve(key: string, choice: "local" | "remote" | "both"): void;
}) {
  return (
    <>
      {status?.phase === "conflict" && (
        <div className="conflict-list">
          <p>
            {status.conflicts.length ? t.conflictHint : t.conflictsResolved}
          </p>
          {status.conflicts.map((item) => (
            <article className="conflict-item" key={item.key}>
              <h3>
                {item.local?.path ?? item.remote?.path ?? t.unrelatedHistories}
              </h3>
              <p className="muted">
                {item.kind === "path"
                  ? t.pathConflict
                  : item.kind === "rename"
                    ? t.renameConflict
                    : item.kind === "deleteModify"
                      ? t.deleteConflict
                      : item.kind === "binary"
                        ? t.binaryConflict
                        : item.kind === "unrelated"
                          ? t.unrelatedHint
                          : t.contentConflict}
              </p>
              {(["local", "remote", "base"] as const).map((side) => {
                const versions =
                  item[`${side}Files`] ?? (item[side] ? [item[side]] : []);
                return (
                  <details key={side}>
                    <summary>
                      <span className="bw-disclosure">
                        {side === "local"
                          ? t.localVersion
                          : side === "remote"
                            ? t.remoteVersion
                            : t.baseVersion}
                        <Icon name="chevronDown" size={16} />
                      </span>
                    </summary>
                    {versions.length ? (
                      versions.map((version) => (
                        <div key={version.path}>
                          <p className="muted path-label">
                            {version.path} · {version.size} B
                          </p>
                          <pre className="conflict-content">
                            {version.text?.slice(0, 120_000) ?? t.binaryFile}
                          </pre>
                        </div>
                      ))
                    ) : (
                      <p>{t.deletedVersion}</p>
                    )}
                  </details>
                );
              })}
              <div className="conflict-actions">
                {item.kind !== "unrelated" && (
                  <>
                    <Button
                      disabled={disabled}
                      onClick={() => void onResolve(item.key, "local")}
                    >
                      {item.local ? t.keepLocal : t.confirmDelete}
                    </Button>
                    <Button
                      disabled={disabled}
                      onClick={() => void onResolve(item.key, "remote")}
                    >
                      {item.remote ? t.keepRemote : t.confirmDelete}
                    </Button>
                  </>
                )}
                {((item.local && item.remote) || item.kind === "unrelated") && (
                  <Button
                    disabled={disabled}
                    onClick={() => void onResolve(item.key, "both")}
                  >
                    {item.kind === "unrelated" ? t.mergeHistories : t.keepBoth}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
