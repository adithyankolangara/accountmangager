import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { formatMoney } from '@smartfin/shared';
import { describeError } from '../api/client';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  headingLevel: Heading = 'h2',
  className,
}: {
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  headingLevel?: 'h2' | 'h3';
  className?: string;
}) {
  return (
    <section className={['card', className].filter(Boolean).join(' ')} aria-label={title}>
      {title || actions ? (
        <div className="card-header">
          <div>
            {title ? <Heading className="card-title">{title}</Heading> : null}
            {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot ? <span className="badge-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function Skeleton({ width = '100%' }: { width?: string }) {
  return <span className="skeleton" style={{ display: 'block', width }} aria-hidden="true" />;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {children ? <p className="muted">{children}</p> : null}
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <p>{describeError(error)}</p>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="loading-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} width={`${90 - i * 12}%`} />
      ))}
    </div>
  );
}

/**
 * An amount with its direction. Money in is green with "+", money out is plain with "−";
 * the sign (and screen-reader text) carries the meaning, not colour alone.
 */
export function Amount({
  value,
  direction = 'none',
  currency,
  className,
}: {
  value: string;
  direction?: 'in' | 'out' | 'none';
  currency?: string;
  className?: string;
}) {
  const formatted = formatMoney(value.replace(/^-/, ''), currency);
  const negative = value.startsWith('-');
  const sign = direction === 'in' ? '+' : direction === 'out' || negative ? '−' : '';
  const label =
    direction === 'in'
      ? 'money in'
      : direction === 'out'
        ? 'money out'
        : negative
          ? 'negative'
          : '';
  return (
    <span className={['amount', `amount-${direction}`, className].filter(Boolean).join(' ')}>
      {sign}
      {formatted}
      {label ? <span className="visually-hidden"> ({label})</span> : null}
    </span>
  );
}

/** Stat tile: label, headline value (proportional figures) and a note on how it's derived. */
export function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-note">{note}</span>
    </div>
  );
}

/** Two-step delete: avoids browser confirm dialogs and accidental taps. */
export function ConfirmButton({
  children,
  confirmLabel = 'Yes, delete',
  onConfirm,
  disabled,
}: {
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        variant="ghost"
        className="btn-danger-text"
        onClick={() => setAsking(true)}
        disabled={disabled}
      >
        {children}
      </Button>
    );
  }
  return (
    <span className="confirm-inline" role="group" aria-label="Confirm">
      <span className="muted">Are you sure?</span>
      <Button
        variant="danger"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        disabled={disabled}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}

/** Radio-group styled as a segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="segmented">
      <legend className="visually-hidden">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="segmented-option">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
