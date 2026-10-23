import { useRef, type CSSProperties } from "react";
import { Icon, type IconName } from "../Icon";
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  panelId,
  id,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: IconName }[];
  onChange(value: T): void;
  panelId: string;
  id: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div
      className="bw-segmented"
      role="tablist"
      aria-label={label}
      style={
        {
          "--bw-segment-index": selected,
          "--bw-segment-count": options.length,
        } as CSSProperties
      }
    >
      <span className="bw-segmented-indicator" aria-hidden="true" />
      {options.map((option, index) => (
        <button
          ref={(node) => {
            refs.current[index] = node;
          }}
          id={`${id}-${option.value}`}
          key={option.value}
          type="button"
          role="tab"
          className="bw-pressable"
          aria-selected={value === option.value}
          aria-controls={panelId}
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            let next = index;
            if (event.key === "ArrowRight") next = (index + 1) % options.length;
            else if (event.key === "ArrowLeft")
              next = (index + options.length - 1) % options.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = options.length - 1;
            else return;
            event.preventDefault();
            onChange(options[next].value);
            refs.current[next]?.focus();
          }}
        >
          {option.icon && (
            <Icon
              name={option.icon}
              size={18}
              variant={value === option.value ? "bold" : "linear"}
            />
          )}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
