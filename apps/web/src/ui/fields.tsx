import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { formatMoney, MONEY_PATTERN } from '@smartfin/shared';

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
}

/** Label, control, hint and error wired together for screen readers. */
function Field({
  label,
  error,
  hint,
  optional,
  className,
  children,
}: FieldProps & { children: (ids: { id: string; describedBy?: string }) => ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={['field', error ? 'field-invalid' : '', className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className="field-label">
        {label}
        {optional ? <span className="field-optional"> (optional)</span> : null}
      </label>
      {children({ id, describedBy })}
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  error,
  hint,
  optional,
  className,
  ...input
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} error={error} hint={hint} optional={optional} className={className}>
      {({ id, describedBy }) => (
        <input
          id={id}
          className="input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  error,
  hint,
  optional,
  className,
  children,
  ...select
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} error={error} hint={hint} optional={optional} className={className}>
      {({ id, describedBy }) => (
        <select
          id={id}
          className="input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...select}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  optional,
  className,
  ...textarea
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} error={error} hint={hint} optional={optional} className={className}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          className="input"
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...textarea}
        />
      )}
    </Field>
  );
}

/** Text input for rupee amounts; shows the Indian-formatted value as a hint while typing. */
export function AmountField({
  label,
  value,
  onChange,
  error,
  allowNegative = false,
  hint,
  ...rest
}: Omit<FieldProps, 'hint'> & {
  value: string;
  onChange: (value: string) => void;
  allowNegative?: boolean;
  hint?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const cleaned = value.replace(/[,\s₹]/g, '');
  const preview = cleaned && MONEY_PATTERN.test(cleaned) ? formatMoney(cleaned) : null;
  return (
    <TextField
      label={label}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => {
        const next = e.target.value.replace(/[^\d.,\s₹-]/g, '');
        onChange(allowNegative ? next : next.replace(/-/g, ''));
      }}
      error={error}
      hint={preview ?? hint}
      {...rest}
    />
  );
}

export function CheckboxField({
  label,
  hint,
  ...input
}: { label: ReactNode; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="checkbox-field">
      <input
        id={id}
        type="checkbox"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
      />
      <div>
        <label htmlFor={id}>{label}</label>
        {hint ? (
          <p id={`${id}-hint`} className="field-hint">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
