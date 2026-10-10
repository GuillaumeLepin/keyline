'use client';

import { useCallback, useEffect, useId, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'keyline.theme';

/** Reads/writes the preference (localStorage, guarded) and mirrors it on `target`'s data-theme. */
export function useThemePreference(
  target?: () => HTMLElement | null,
): [ThemePreference, (t: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>('system');
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
    } catch {
      // Private mode or blocked storage: stay on "system".
    }
  }, []);
  useEffect(() => {
    const el = target ? target() : document.documentElement;
    if (el) el.dataset.theme = pref;
  }, [pref, target]);
  const set = useCallback((t: ThemePreference) => {
    setPref(t);
    try {
      window.localStorage.setItem(KEY, t);
    } catch {
      // ignore
    }
  }, []);
  return [pref, set];
}

export type ThemeSwitchProps = {
  value: ThemePreference;
  onChange: (t: ThemePreference) => void;
  labels?: Record<ThemePreference, string>;
  legend?: string;
  /** Fill the container width with equal segments (Settings). */
  full?: boolean;
};

const DEFAULT_LABELS: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/** Three-way segmented control (radio group), 44 px targets. */
export function ThemeSwitch({
  value,
  onChange,
  labels = DEFAULT_LABELS,
  legend = 'Appearance',
  full = false,
}: ThemeSwitchProps) {
  const name = useId();
  return (
    <fieldset className={full ? 'kl2-seg kl2-seg--full' : 'kl2-seg'}>
      <legend className="kl2-sr">{legend}</legend>
      {(['system', 'light', 'dark'] as const).map((t) => (
        <label key={t} className="kl2-seg__opt" data-checked={value === t || undefined}>
          <input
            type="radio"
            name={name}
            value={t}
            checked={value === t}
            onChange={() => onChange(t)}
            className="kl2-seg__input"
          />
          {labels[t]}
        </label>
      ))}
    </fieldset>
  );
}
