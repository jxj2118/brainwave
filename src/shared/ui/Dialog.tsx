import { useLayoutEffect, useId, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "../Icon";
export function Dialog({
  open,
  title,
  onClose,
  busy = false,
  variant = "dialog",
  icon,
  danger = false,
  returnFocusTo,
  children,
}: {
  open: boolean;
  title: string;
  onClose(): void;
  busy?: boolean;
  variant?: "dialog" | "sheet";
  icon?: IconName;
  danger?: boolean;
  returnFocusTo?: HTMLElement;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = returnFocusTo ?? document.activeElement;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [open, returnFocusTo]);
  return (
    <dialog
      ref={ref}
      className={`bw-dialog bw-dialog--${variant}`}
      aria-labelledby={id}
      aria-busy={busy || undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="bw-dialog-content">
        {icon && (
          <span className={`bw-dialog-icon ${danger ? "is-danger" : ""}`}>
            <Icon name={icon} size={28} variant="bold" />
          </span>
        )}
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
