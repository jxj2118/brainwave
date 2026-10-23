import type { ReactNode } from "react";
import { Icon, type IconName } from "../Icon";
import { IconButton } from "./Button";
export function StatusPill({
  children,
  tone = "neutral",
  busy = false,
  icon,
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "danger";
  busy?: boolean;
  icon?: IconName;
}) {
  return (
    <span
      className={`bw-status bw-status--${tone} ${busy ? "is-busy" : ""}`}
      role="status"
    >
      {busy ? (
        <span className="bw-spinner" aria-hidden="true" />
      ) : (
        <span className="bw-status-icon" key={`${tone}-${icon ?? ""}`}>
          <Icon
            name={
              icon ??
              (tone === "danger"
                ? "alert"
                : tone === "positive"
                  ? "checkCircle"
                  : "info")
            }
            variant={tone === "positive" ? "bold" : "linear"}
            size={15}
          />
        </span>
      )}
      <span>{children}</span>
    </span>
  );
}
export function Notice({
  children,
  tone = "neutral",
  onClose,
  closeLabel,
}: {
  children: ReactNode;
  tone?: "neutral" | "danger";
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div
      className={`bw-notice bw-notice--${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon
        name={tone === "danger" ? "alert" : "info"}
        variant="bold"
        size={21}
      />
      <div>{children}</div>
      {onClose && (
        <IconButton
          label={closeLabel ?? "Close"}
          icon="close"
          onClick={onClose}
        />
      )}
    </div>
  );
}
export function EmptyState({
  icon = "note",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="bw-empty">
      <span className="bw-empty-icon">
        <Icon name={icon} size={30} variant="bold" />
      </span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Skeleton({ label }: { label: string }) {
  return (
    <div className="bw-skeleton-list" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <div className="bw-skeleton-row" key={i} aria-hidden="true">
          <span />
          <div>
            <i />
            <i />
          </div>
        </div>
      ))}
    </div>
  );
}
