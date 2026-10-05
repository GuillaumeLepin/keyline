import { type ReactNode, useId } from 'react';

/* ---------- Toggle ---------- */

export type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

/** Switch row: label + description on the left, 44 px switch on the right. Ink when on. */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  const id = useId();
  return (
    <div className="kl-toggle-row">
      <div className="kl-toggle-row__text">
        <label htmlFor={id} className="kl-toggle-row__label">
          {label}
        </label>
        {description ? <span className="kl-toggle-row__desc">{description}</span> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className="kl-toggle"
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

/* ---------- RadioCard ---------- */

export type RadioCardProps = {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: string;
  body: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
};

/** Recovery-mode chooser: a bordered option with a title, a body and a meta line. */
export function RadioCard({ name, value, checked, onChange, title, body, meta, disabled }: RadioCardProps) {
  return (
    <label
      className={['kl-radio', checked ? 'kl-radio--selected' : '', disabled ? 'kl-radio--disabled' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <span>
        <span className="kl-radio__name">{title}</span>
        <span className="kl-radio__body" style={{ display: 'block' }}>
          {body}
        </span>
        {meta ? <span className="kl-radio__meta">{meta}</span> : null}
      </span>
    </label>
  );
}
