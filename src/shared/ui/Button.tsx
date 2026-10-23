import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "../Icon";
export function Button({
  variant = "secondary",
  busy = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      className={`bw-button bw-pressable bw-button--${variant} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy && <span className="bw-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function IconButton({
  label,
  icon,
  active = false,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon?: IconName;
  active?: boolean;
  children?: ReactNode;
}) {
  return (
    <Button
      {...props}
      variant="ghost"
      aria-label={label}
      title={label}
      className={`bw-icon-button ${active ? "is-active" : ""} ${className}`}
    >
      {icon ? (
        <Icon name={icon} variant={active ? "bold" : "linear"} />
      ) : (
        children
      )}
    </Button>
  );
}
