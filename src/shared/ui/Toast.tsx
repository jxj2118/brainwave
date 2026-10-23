import { useEffect } from "react";
import { Icon } from "../Icon";
import { IconButton } from "./Button";

export function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  closeLabel,
  duration = 5000,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss(): void;
  closeLabel: string;
  duration?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);
  return (
    <div className="bw-toast" role="status">
      <Icon name="checkCircle" size={20} variant="bold" />
      <span className="bw-toast-message">{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          className="bw-toast-action bw-pressable"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
      <IconButton
        label={closeLabel}
        icon="close"
        className="bw-toast-close"
        onClick={onDismiss}
      />
    </div>
  );
}
