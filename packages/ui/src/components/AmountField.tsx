import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { useId } from 'react';
import { formatUSDC } from '../format';

export type AmountFieldProps = {
  /** CHF amount as typed (string keeps "20." editable). Empty string = nothing typed. */
  value: string;
  onChange: (value: string) => void;
  /** CHF per 1 USDC, e.g. 0.8. */
  rate: number;
  label?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
};

/**
 * CHF-first, USDC secondary. 44 px tabular digits, right-aligned. The secondary line and the error
 * line always reserve their height so the layout never shifts while typing.
 */
export function AmountField({
  value,
  onChange,
  rate,
  label = 'Amount',
  error,
  disabled,
  id,
}: AmountFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const chf = Number.parseFloat(value.replace(/[’']/g, '').replace(',', '.'));
  const hasValue = value.trim() !== '' && Number.isFinite(chf);
  const usdc = hasValue && rate > 0 ? chf / rate : 0;

  return (
    <div className={['kl-amount', error ? 'kl-amount--error' : ''].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className="kl-field__label">
        {label}
      </label>
      <div className="kl-amount__row">
        <span className="kl-amount__code" aria-hidden="true">
          CHF
        </span>
        <input
          id={inputId}
          className="kl-amount__input"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${inputId}-usdc${error ? ` ${inputId}-error` : ''}`}
          onChange={(e) => {
            // Digits, one decimal separator, max two decimals. Nothing else gets through.
            const raw = e.target.value.replace(',', '.');
            if (raw === '' || /^\d{0,9}(\.\d{0,2})?$/.test(raw)) onChange(raw);
          }}
        />
      </div>
      <p id={`${inputId}-usdc`} className="kl-amount__secondary">
        {hasValue ? formatUSDC(usdc) : formatUSDC(0)}
      </p>
      <p
        id={error ? `${inputId}-error` : undefined}
        className="kl-amount__error"
        role={error ? 'alert' : undefined}
      >
        {error ? (
          <>
            <WarningCircle size={14} aria-hidden="true" />
            {error}
          </>
        ) : null}
      </p>
    </div>
  );
}
