import type { ReactNode } from 'react';

import { useNav } from '@/lib/nav';

export function Screen({ title, children }: { title: ReactNode; children: ReactNode }) {
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

/** A pushed page with a back button (see useNav). */
export function Page({ title, children }: { title: string; children: ReactNode }) {
  const nav = useNav();
  return (
    <main className="screen page">
      <header className="page-head">
        <button type="button" className="back" aria-label="Back" onClick={() => nav.pop()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1>{title}</h1>
      </header>
      {children}
    </main>
  );
}

export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {action && (
        <button type="button" className="link" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export function ListRow({ title, subtitle, onClick }: { title: string; subtitle?: string; onClick: () => void }) {
  return (
    <button type="button" className="list-row" onClick={onClick}>
      <span>
        <span className="list-title">{title}</span>
        {subtitle && <span className="small muted">{subtitle}</span>}
      </span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

export function TextInput({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}) {
  return (
    <span className="input">
      <input aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

/** A progress bar that glides between values (a native <progress> can't animate). */
export function Meter({ value, max, label, className = 'meter' }: { value: number; max: number; label: string; className?: string }) {
  const f = Math.min(1, max > 0 ? Math.max(0, value / max) : 0);
  return (
    <div className={className} role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemax={Math.round(max)}>
      <div style={{ transform: `scaleX(${f})` }} />
    </div>
  );
}
