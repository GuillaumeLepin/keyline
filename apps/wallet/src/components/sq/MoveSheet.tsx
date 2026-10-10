'use client';

import type { Move, SqAsset, SqPosition } from '@keyline/shared';
import { ActionButton, Chip, formatCHF, Note, SheetV2, TextField, TravelRuleLine } from '@keyline/ui';
import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { copy, copyV2 } from '@/src/copy';
import { api, isApiError } from '@/src/lib/api';
import { txUrl } from '@/src/lib/chain';
import { decimalsFor, formatQty } from '@/src/lib/format';

/** The bank's funder ran dry (409/422/503 with a funder/balance code): an honest, specific sentence. */
function isFunderEmpty(error: unknown): boolean {
  if (!isApiError(error)) return false;
  const text = `${error.code} ${error.message}`.toLowerCase();
  return /fund|balance|insufficient|empty/.test(text) && error.status >= 400 && error.status < 600;
}

/** A4 · Move ETH / USDC / EURC to Keyline — a real transfer from the bank funder to Lea's attested Safe. */
export function MoveSheet({ position, onClose }: { position: SqPosition | null; onClose: () => void }) {
  const s = copyV2.sqWeb.move;
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const requestId = useRef<string>('');
  const open = position !== null;
  useEffect(() => {
    if (open) {
      setAmount('');
      setFieldError(undefined);
      requestId.current = crypto.randomUUID();
    }
  }, [open]);

  const move = useMutation({
    mutationFn: (body: { asset: SqAsset; amount: string }) =>
      api.sq.move({ ...body, requestId: requestId.current }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sq', 'moves'] });
      queryClient.invalidateQueries({ queryKey: ['sq-positions'] });
    },
  });
  // Reset the mutation when another row's sheet opens.
  const reset = move.reset;
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  if (!position)
    return (
      <SheetV2 open={false} title="" onClose={onClose}>
        {null}
      </SheetV2>
    );

  const asset = position.symbol as SqAsset;
  const available = Number(position.quantity);
  const price = Number(position.priceChf);
  const value = Number.parseFloat(amount);
  const chf = Number.isFinite(value) ? value * price : 0;
  const decimals = asset === 'ETH' ? 18 : 6;

  function submit() {
    const valid =
      /^\d+(\.\d+)?$/.test(amount) &&
      value > 0 &&
      value <= available &&
      (amount.split('.')[1]?.length ?? 0) <= decimals;
    if (!valid) {
      setFieldError(s.errAmount);
      return;
    }
    setFieldError(undefined);
    move.mutate({ asset, amount });
  }

  const result: Move | undefined = move.data;
  const failed = result?.status === 'failed';

  return (
    <SheetV2 open={open} title={s.title(asset)} onClose={onClose}>
      <div className="grid gap-4" data-testid="move-sheet">
        <TextField
          label={s.amount}
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          suffix={asset}
          hint={s.available(formatQty(available, decimalsFor(asset), asset))}
          error={fieldError}
          onChange={(e) => setAmount(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
          disabled={move.isPending || move.isSuccess}
          data-testid="move-amount"
        />
        <p className="flex items-center gap-1 text-14 text-ink-2">
          {s.value(formatCHF(chf))}
          <Chip />
        </p>
        <p className="text-14 text-ink-2">
          {s.from} · {s.fromValue}
          <br />
          {s.to} · {s.toValue}
        </p>
        <TravelRuleLine text={s.travelRule} />
        <p className="text-14 text-ink-2">
          {s.fee} · {s.feeValue}
        </p>

        {result && !failed ? (
          <div className="grid gap-2" data-testid="move-result">
            <Note tone="ok">{s.done}</Note>
            {result.txHash ? (
              <a
                className="kl2-link inline-flex items-center gap-1"
                href={result.explorerUrl ?? txUrl(result.txHash)}
                target="_blank"
                rel="noreferrer"
              >
                {s.viewTx}
                <ArrowSquareOut size={16} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        ) : null}
        {failed ? (
          <Note tone="danger" title={copy.common.errorTitle}>
            {result?.error && /fund|balance|insufficient/i.test(result.error)
              ? s.funderEmpty
              : copy.common.errorBody}
          </Note>
        ) : null}
        {move.isError ? (
          isFunderEmpty(move.error) ? (
            <div data-testid="move-funder-empty">
              <ApiErrorState
                error={move.error}
                title={s.errorTitle}
                body={s.funderEmpty}
                onRetry={() => move.mutate({ asset, amount })}
              />
            </div>
          ) : (
            <ApiErrorState
              error={move.error}
              body={s.errorBody}
              onRetry={() => move.mutate({ asset, amount })}
            />
          )
        ) : null}

        <ActionButton
          full
          label={s.primary}
          successLabel={s.done}
          status={move.isPending ? 'loading' : result && !failed ? 'success' : 'idle'}
          onClick={result && !failed ? undefined : submit}
          data-testid="move-submit"
        />
        {result ? <ActionButton variant="secondary" full label={copy.common.done} onClick={onClose} /> : null}
      </div>
    </SheetV2>
  );
}
