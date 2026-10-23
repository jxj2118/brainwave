import type { IconName } from "../Icon";
import { Icon } from "../Icon";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface ActionMenuItem {
  id: string;
  label: string;
  icon: IconName;
  danger?: boolean;
}

export function ActionMenu({
  title,
  items,
  cancelLabel,
  onSelect,
  onClose,
  returnFocusTo,
}: {
  title: string;
  items: ActionMenuItem[];
  cancelLabel: string;
  onSelect(id: string): void;
  onClose(): void;
  returnFocusTo?: HTMLElement;
}) {
  return (
    <Dialog
      open
      variant="sheet"
      title={title}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      <div className="bw-action-menu" role="group" aria-label={title}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bw-action-menu-item bw-pressable ${item.danger ? "is-danger" : ""}`}
            onClick={() => onSelect(item.id)}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <Button onClick={onClose}>{cancelLabel}</Button>
    </Dialog>
  );
}
