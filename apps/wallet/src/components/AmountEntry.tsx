'use client';

import { ArrowsDownUp } from '@phosphor-icons/react/dist/ssr';
import { useState } from 'react';
import { useCopy, usePrefs } from '../copy';
import { env } from '../env';
import { toChf } from '../i18n/money';
import { useUsdcBalance } from '../lib/hooks';
import { Button, Chip, formatUSDC, NumberTicker, TextField } from '../ui';
import { ApiErrorState } from './ApiErrorState';

export type AmountValue = { amountUsdc: number; amountChf: number };

/**
 * The one amount screen body (Send and Back to Swissquote): an amount in the display currency or in USDC
 * (toggle keeps the same money), the converted value on a NumberTicker, the SIMULATED rate, the balance with
 * Max, and the insufficient-balance state. The purpose-primary is rendered here too so its disabled state
 * always matches the field.
 */
export function AmountEntry({
  walletAddress,
  primaryLabel,
  onSubmit,
  testIdPrefix,
}: {
  walletAddress: string;
  primaryLabel: string;
  onSubmit: (v: AmountValue) => void;
  testIdPrefix: string;
}) {
  const t = useCopy();
  const s = t.copyC.send;
  const money = usePrefs();
  const ccy = money.prefs.currency;
  const balance = useUsdcBalance(walletAddress);
  const [unit, setUnit] = useState<'fiat' | 'usdc'>('fiat');
  const [raw, setRaw] = useState('');
  const [touched, setTouched] = useState(false);

  const value = Number.parseFloat(raw.replace(/[’'\s]/g, '').replace(',', '.'));
  const entered = Number.isFinite(value) && value > 0 ? value : 0;
  const usdc = unit === 'usdc' ? entered : toChf(ccy, entered) / env.chfPerUsdc;
  const usdcRounded = Math.round(usdc * 100) / 100;
  const chf = Math.round(usdcRounded * env.chfPerUsdc * 100) / 100;
  const available = balance.data;
  const insufficient = available !== undefined && usdcRounded > available;
  const empty = entered <= 0;

  function toggle() {
    if (entered > 0) setRaw((unit === 'fiat' ? usdcRounded : money.toDisplay(chf)).toFixed(2));
    setUnit(unit === 'fiat' ? 'usdc' : 'fiat');
  }

  function max() {
    if (available === undefined) return;
    setRaw((unit === 'usdc' ? available : money.toDisplay(available * env.chfPerUsdc)).toFixed(2));
  }

  const error =
    insufficient && available !== undefined
      ? s.insufficient(formatUSDC(available))
      : touched && empty
        ? s.errAmount
        : undefined;

  return (
    <>
      <TextField
        label={unit === 'fiat' ? s.inFiat(ccy) : s.inUsdc}
        inputMode="decimal"
        placeholder="0.00"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setTouched(false);
        }}
        onBlur={() => {
          setTouched(true);
          if (entered > 0) setRaw(groupAmount(entered));
        }}
        onFocus={() => {
          if (entered > 0) setRaw(String(entered));
        }}
        prefix={unit === 'fiat' ? ccy : undefined}
        suffix={unit === 'usdc' ? 'USDC' : undefined}
        error={error}
        className="text-28"
        data-testid={`${testIdPrefix}-amount`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-16 text-ink-2" aria-live="polite" data-testid={`${testIdPrefix}-converted`}>
          ≈{' '}
          {unit === 'fiat' ? (
            <NumberTicker value={usdcRounded} format={formatUSDC} />
          ) : (
            <NumberTicker value={money.toDisplay(chf)} format={money.displayFormat} />
          )}
        </p>
        <button
          type="button"
          className="kl2-textbtn inline-flex items-center gap-1"
          onClick={toggle}
          data-testid={`${testIdPrefix}-toggle`}
        >
          <ArrowsDownUp size={16} aria-hidden="true" />
          {s.switchTo(unit === 'fiat' ? 'USDC' : ccy)}
        </button>
      </div>
      <p className="m-0 flex flex-wrap items-center gap-1 text-12 text-ink-3">
        {money.rate(env.chfPerUsdc)}
        <Chip />
      </p>

      <div className="flex items-center justify-between gap-2 border-line border-t pt-3 text-14">
        <span className="text-ink-2">
          {available === undefined
            ? balance.isError
              ? t.copy.common.errorTitle
              : s.balanceLoading
            : s.available(formatUSDC(available))}
        </span>
        <button type="button" className="kl2-textbtn" onClick={max} disabled={available === undefined}>
          {s.max}
        </button>
      </div>
      {balance.isError ? (
        <ApiErrorState
          error={balance.error}
          body={t.copy.common.errorBody}
          onRetry={() => balance.refetch()}
        />
      ) : null}

      <div className="kl-actions mt-auto order-last">
        <Button
          variant="primary"
          full
          disabled={empty || insufficient}
          onClick={() => {
            setTouched(true);
            if (!empty && !insufficient) onSubmit({ amountUsdc: usdcRounded, amountChf: chf });
          }}
          data-testid={`${testIdPrefix}-review`}
        >
          {primaryLabel}
        </Button>
      </div>
    </>
  );
}

/** `999999` → `999’999`, `20.5` → `20.50` (Swiss grouping, shown once the field loses focus). */
function groupAmount(n: number): string {
  const [int, dec] = n.toFixed(2).split('.');
  const grouped = (int ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '’');
  return dec === '00' ? grouped : `${grouped}.${dec}`;
}
