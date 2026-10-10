'use client';

import { useId } from 'react';

/** Same segmented control as ThemeSwitch (`kl2-seg`, 44 px), for any small set of options. */
export function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
  testId,
}: {
  legend: string;
  value: T;
  options: readonly { value: T; label: string; lang?: string }[];
  onChange: (v: T) => void;
  testId?: string;
}) {
  const name = useId();
  return (
    <div>
      <fieldset className="kl2-seg kl2-seg--full" data-testid={testId}>
        <legend className="kl2-sr">{legend}</legend>
        {options.map((o) => (
          <label
            key={o.value}
            className="kl2-seg__opt"
            data-checked={value === o.value || undefined}
            lang={o.lang}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="kl2-seg__input"
            />
            {o.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
