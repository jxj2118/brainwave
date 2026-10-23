import {
  useEffect,
  useId,
  useRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import { Icon } from "../Icon";
import { IconButton } from "./Button";
export function TextField({
  label,
  error,
  hint,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const generated = useId();
  const field = id ?? generated;
  const description = error ?? hint;
  return (
    <div className="bw-field">
      <label htmlFor={field}>{label}</label>
      <input
        {...props}
        id={field}
        aria-invalid={!!error || undefined}
        aria-describedby={description ? `${field}-help` : undefined}
      />
      {description && (
        <span
          className={error ? "bw-field-error" : "bw-field-hint"}
          id={`${field}-help`}
        >
          {description}
        </span>
      )}
    </div>
  );
}
export function SelectField({
  label,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generated = useId();
  const field = id ?? generated;
  return (
    <label className="bw-field" htmlFor={field}>
      <span>{label}</span>
      <select {...props} id={field}>
        {children}
      </select>
    </label>
  );
}
export function SearchField({
  label,
  placeholder,
  value,
  onChange,
  clearLabel,
  disabled,
  autoFocus = false,
  shortcutKey,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange(value: string): void;
  clearLabel: string;
  disabled?: boolean;
  autoFocus?: boolean;
  shortcutKey?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const apple = /Mac|iPhone|iPad/.test(navigator.platform);
  useEffect(() => {
    if (!shortcutKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        (apple ? event.metaKey : event.ctrlKey) &&
        event.key.toLowerCase() === shortcutKey.toLowerCase()
      ) {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcutKey, apple]);
  return (
    <div className="bw-search">
      <Icon name="search" size={21} />
      <label className="bw-sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        ref={input}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      {shortcutKey && !value && (
        <kbd className="bw-search-shortcut" aria-hidden="true">
          {apple ? "⌘" : "Ctrl "}
          {shortcutKey.toUpperCase()}
        </kbd>
      )}
      {value && (
        <IconButton
          label={clearLabel}
          icon="close"
          disabled={disabled}
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        />
      )}
    </div>
  );
}
