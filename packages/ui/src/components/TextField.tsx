import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { type InputHTMLAttributes, type ReactNode, useId } from 'react';

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** JetBrains Mono with slashed zero — codes, addresses, hex. */
  mono?: boolean;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
};

export function TextField({
  label,
  hint,
  error,
  prefix,
  suffix,
  mono = false,
  hideLabel = false,
  id,
  className,
  ...input
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={['kl-field', error ? 'kl-field--error' : '', className ?? ''].filter(Boolean).join(' ')}>
      <label
        htmlFor={inputId}
        className="kl-field__label"
        style={
          hideLabel
            ? { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }
            : undefined
        }
      >
        {label}
      </label>
      <div className="kl-field__control">
        {prefix ? <span className="kl-field__affix">{prefix}</span> : null}
        <input
          id={inputId}
          className={['kl-field__input', mono ? 'kl-field__input--mono' : ''].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          {...input}
        />
        {suffix ? <span className="kl-field__affix">{suffix}</span> : null}
      </div>
      {hint ? (
        <p id={hintId} className="kl-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="kl-field__error" role="alert">
          <WarningCircle size={14} aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
