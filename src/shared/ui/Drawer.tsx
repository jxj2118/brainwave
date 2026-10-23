import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Modal side panel for compact layouts. Focus returns to the opener when it closes. */
export function Drawer({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  onClose(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const opener = document.activeElement;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="bw-drawer"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && <div className="bw-drawer-panel">{children}</div>}
    </dialog>
  );
}
