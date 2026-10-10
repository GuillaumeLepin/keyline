'use client';

import type { Move, SqPosition } from '@keyline/shared';
import {
  BitcoinPolicyDiagram,
  Chip,
  formatCHF,
  formatShortDateTime,
  type Position,
  PositionsTable,
  RowAction,
  SheetV2,
  Skeleton,
} from '@keyline/ui';
import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { KeylineTile } from '@/src/components/sq/KeylineTile';
import { MoveSheet } from '@/src/components/sq/MoveSheet';
import { SafetyKeyPrompt } from '@/src/components/sq/SafetyKeyPrompt';
import { copy, copyJourney, copyV2 } from '@/src/copy';
import { api, isApiError } from '@/src/lib/api';
import { txUrl } from '@/src/lib/chain';
import { decimalsFor, formatQty, formatValuation } from '@/src/lib/format';

const GROUPS = ['cash', 'security', 'crypto'] as const;

/** A2 · Portfolio (SIMULATED account and prices; moves are real on-chain transfers). */
export default function PortfolioPage() {
  const router = useRouter();
  const s = copyV2.sqWeb.portfolio;
  const positions = useQuery({ queryKey: ['sq-positions'], queryFn: api.sq.positions, retry: false });
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
            {positions.data ? (
              <p className="flex items-center gap-1 text-12 text-ink-3">
                {s.valuation(formatValuation(positions.data.valuedAt))}
                <Chip />
              </p>
            ) : null}
          </div>
          {positions.data ? (
            <dl className="flex flex-wrap gap-8">
              <Figure label={s.cash} value={formatCHF(Number(positions.data.cashChf))} />
              <Figure label={s.invested} value={formatCHF(Number(positions.data.investedChf))} />
              <Figure label={s.total} value={formatCHF(Number(positions.data.totalChf))} large />
            </dl>
          ) : null}
        </div>

        {positions.isError ? (
          signedOut ? null : (
            <ApiErrorState
              error={positions.error}
              body={copy.common.errorBody}
              onRetry={() => positions.refetch()}
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
          <MovesHistory moves={moves.data} pending={moves.isPending} error={moves.error} />
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
    name: p.name,
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
}: {
  moves: Move[] | undefined;
  pending: boolean;
  error: unknown;
}) {
  const g = copyV2.sqWeb.moves;
  return (
    <section className="grid gap-2" aria-labelledby="moves-h" data-testid="moves">
      <h2 id="moves-h" className="text-20 font-semibold">
        {g.title}
      </h2>
      {pending ? (
        <Skeleton kind="row" count={2} />
      ) : error ? (
        <ApiErrorState error={error} body={copy.common.errorBody} />
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
                <span className="text-16">{formatQty(Number(m.amount), decimalsFor(m.asset), m.asset)}</span>
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
    </section>
  );
}
