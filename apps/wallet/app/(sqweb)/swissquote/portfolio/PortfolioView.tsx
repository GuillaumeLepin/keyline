'use client';

import type { Move, SqPosition, SqPositionsResponse } from '@keyline/shared';
import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { KeylineTile } from '@/src/components/sq/KeylineTile';
import { MoveSheet } from '@/src/components/sq/MoveSheet';
import { copy, copyC, copyJourney, copyV2 } from '@/src/copy';
import { formatValuation } from '@/src/i18n/dates';
import { api, isApiError } from '@/src/lib/api';
import { decimalsFor, formatQty } from '@/src/lib/format';
import { txUrl } from '@/src/lib/reads';
import {
  BitcoinPolicyDiagram,
  Button,
  Chip,
  CrossFade,
  formatCHF,
  formatShortDateTime,
  type Position,
  PositionsTable,
  RowAction,
  SheetV2,
  Skeleton,
} from '@/src/ui';

// The Safety-key prompt only appears while the phone asks this laptop to confirm; it carries viem's key
// generation, so it loads on demand and stays out of the portfolio's first load (Lighthouse, DESIGN.md §8).
const SafetyKeyPrompt = dynamic(
  () => import('@/src/components/sq/SafetyKeyPrompt').then((m) => m.SafetyKeyPrompt),
  { ssr: false },
);

const GROUPS = ['cash', 'security', 'crypto'] as const;

/**
 * A2 · Portfolio (SIMULATED account and prices; moves are real on-chain transfers). `initial` is the server's
 * prefetch (page.tsx) so the figures and positions are in the first paint — no skeleton → content jump (LCP/CLS).
 */
export function PortfolioView({ initial }: { initial?: SqPositionsResponse }) {
  const router = useRouter();
  const s = copyV2.sqWeb.portfolio;
  const positions = useQuery({
    queryKey: ['sq-positions'],
    queryFn: api.sq.positions,
    retry: false,
    initialData: initial,
  });
  const signedOut = positions.isError && isApiError(positions.error) && positions.error.status === 401;
  useEffect(() => {
    if (signedOut) router.replace('/swissquote');
  }, [signedOut, router]);

  const skr = useQuery({
    queryKey: ['sq', 'safety-key-request'],
    queryFn: api.sq.safetyKeyRequest,
    refetchInterval: 2_000,
    retry: false,
    enabled: positions.isSuccess,
  });
  const moves = useQuery({
    queryKey: ['sq', 'moves'],
    queryFn: api.sq.moves,
    enabled: positions.isSuccess,
    refetchInterval: (q) =>
      q.state.data?.some((m) => m.status === 'pending' || m.status === 'sent') ? 3_000 : false,
    retry: false,
  });
  const [moving, setMoving] = useState<SqPosition | null>(null);
  const [why, setWhy] = useState(false);
  const walletAddress = (skr.data?.walletAddress as Address | null | undefined) ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="grid min-w-0 content-start gap-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="grid gap-1">
            <h1 className="kl-title">{s.title}</h1>
            {/* Same boxes while loading (a no-break space holds each line), so nothing below moves (CLS). */}
            <p className="flex min-h-5 items-center gap-1 text-12 text-ink-3">
              {positions.data ? (
                <>
                  {s.valuation(formatValuation(positions.data.valuedAt))}
                  <Chip />
                </>
              ) : (
                '\u00a0'
              )}
            </p>
          </div>
          <dl className="flex flex-wrap gap-8" aria-busy={positions.isPending || undefined}>
            <Figure
              label={s.cash}
              value={positions.data ? formatCHF(Number(positions.data.cashChf)) : '\u00a0'}
            />
            <Figure
              label={s.invested}
              value={positions.data ? formatCHF(Number(positions.data.investedChf)) : '\u00a0'}
            />
            <Figure
              label={s.total}
              value={positions.data ? formatCHF(Number(positions.data.totalChf)) : '\u00a0'}
              large
            />
          </dl>
        </div>

        {positions.isError ? (
          signedOut ? null : (
            <ApiErrorState
              error={positions.error}
              body={copy.common.errorBody}
              onRetry={() => positions.refetch()}
              actions={
                <Button variant="ghost" href="/swissquote">
                  {copyC.states.signIn}
                </Button>
              }
            />
          )
        ) : (
          <div data-testid="positions">
            <PositionsTable
              loading={positions.isPending}
              copy={copyJourney.positions}
              total={positions.data ? formatCHF(Number(positions.data.totalChf)) : undefined}
              groups={GROUPS.map((group) => ({
                id: group === 'security' ? 'securities' : group,
                label: s.groups[group === 'security' ? 'securities' : group],
                rows: (positions.data?.positions ?? [])
                  .filter((p) => p.kind === group)
                  .map((p) =>
                    toRow(
                      p,
                      () => setMoving(p),
                      () => setWhy(true),
                    ),
                  ),
              })).filter((g) => g.rows.length > 0 || positions.isPending)}
            />
          </div>
        )}

        {positions.isSuccess ? (
          <MovesHistory
            moves={moves.data}
            pending={positions.isPending || (positions.isSuccess && moves.isPending)}
            error={moves.error}
            onRetry={() => moves.refetch()}
          />
        ) : null}
      </div>

      <aside className="grid content-start gap-6">
        {skr.data && (skr.data.status === 'waiting' || skr.data.status === 'done') ? (
          <SafetyKeyPrompt request={skr.data} />
        ) : null}
        {positions.isSuccess ? <KeylineTile walletAddress={walletAddress} /> : null}
        {skr.isError && !(isApiError(skr.error) && skr.error.status === 401) ? (
          <ApiErrorState error={skr.error} body={copy.common.errorBody} onRetry={() => skr.refetch()} />
        ) : null}
      </aside>

      <MoveSheet position={moving} onClose={() => setMoving(null)} />
      <SheetV2 open={why} title={copyV2.btcWhy.title} onClose={() => setWhy(false)}>
        <div className="grid gap-4" data-testid="why-sheet">
          {copyV2.btcWhy.body.map((p) => (
            <p key={p} className="max-w-[65ch] text-16">
              {p}
            </p>
          ))}
          <BitcoinPolicyDiagram copy={copyJourney.btcPolicy} />
          <Link className="kl2-link" href="/swissquote/bitcoin">
            {copyV2.btcWhy.link}
          </Link>
        </div>
      </SheetV2>
    </div>
  );
}

function Figure({ label, value, large = false }: { label: string; value: string; large?: boolean }) {
  return (
    <div className="grid gap-1">
      <dt className="kl-eyebrow">{label}</dt>
      <dd className={large ? 'm-0 text-28 font-semibold tracking-[-0.015em]' : 'm-0 text-20 font-semibold'}>
        {value}
      </dd>
    </div>
  );
}

function toRow(p: SqPosition, onMove: () => void, onWhy: () => void): Position {
  const s = copyV2.sqWeb.portfolio;
  return {
    id: p.id,
    name: (copyC.positions as Record<string, string>)[p.id] ?? p.name,
    code: p.symbol,
    quantity: formatQty(Number(p.quantity), decimalsFor(p.symbol)),
    price: p.kind === 'cash' ? undefined : formatCHF(Number(p.priceChf)),
    value: formatCHF(Number(p.valueChf)),
    action: p.movable ? (
      <RowAction label={s.move} ariaLabel={s.moveAria(p.symbol)} onClick={onMove} />
    ) : p.notMovableReason ? (
      <RowAction
        label={s.move}
        disabledReason={copyV2.sqWeb.portfolio.btcReason}
        onWhy={onWhy}
        whyLabel={s.why}
      />
    ) : undefined,
  };
}

function MovesHistory({
  moves,
  pending,
  error,
  onRetry,
}: {
  moves: Move[] | undefined;
  pending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const g = copyV2.sqWeb.moves;
  return (
    <section className="grid gap-2" aria-labelledby="moves-h" data-testid="moves">
      <h2 id="moves-h" className="text-20 font-semibold">
        {g.title}
      </h2>
      <CrossFade
        stateKey={pending ? 'loading' : error ? 'error' : !moves || moves.length === 0 ? 'empty' : 'list'}
      >
        {pending ? (
          <Skeleton kind="row" count={2} />
        ) : error ? (
          <ApiErrorState error={error} body={copy.common.errorBody} onRetry={onRetry} />
        ) : !moves || moves.length === 0 ? (
          <p className="text-14 text-ink-3">{g.empty}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {moves.map((m) => (
              <li
                key={m.id}
                className="flex min-h-14 items-center justify-between gap-4 border-b border-line py-2"
              >
                <span className="grid">
                  <span className="text-16">
                    {formatQty(Number(m.amount), decimalsFor(m.asset), m.asset)}
                  </span>
                  <span className="text-12 text-ink-3">
                    {formatShortDateTime(new Date(m.at))} · {g.status[m.status]}
                  </span>
                </span>
                <span className="flex items-center gap-4">
                  <span className="text-14">{formatCHF(Number(m.valueChf))}</span>
                  {m.txHash ? (
                    <a
                      className="kl2-link inline-flex items-center gap-1 text-14"
                      href={m.explorerUrl ?? txUrl(m.txHash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.common.viewOnBasescan}
                      <ArrowSquareOut size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CrossFade>
    </section>
  );
}
