import type { ReactNode } from 'react';

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="screen">
      <h1>{title}</h1>
      {children}
    </main>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="empty muted">{text}</p>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  vertical,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  vertical?: boolean;
}) {
  return (
    <div className={vertical ? 'segmented vertical' : 'segmented'} role="group">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <span className="input">
      <input
        aria-label={label}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix && <span className="muted">{suffix}</span>}
    </span>
  );
}

export function Button({
  title,
  onClick,
  disabled,
  busy,
  variant = 'primary',
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button type="button" className={`button ${variant}`} disabled={disabled || busy} onClick={onClick}>
      {busy ? '…' : title}
    </button>
  );
}

/** Parses "72,5" or "72.5"; NaN when empty or invalid. */
export const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
