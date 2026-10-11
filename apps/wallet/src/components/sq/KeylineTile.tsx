'use client';

import type { Handoff, SqKeylineWallet } from '@keyline/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Address } from 'viem';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { copy, copyJourney, copyV2 } from '@/src/copy';
import { api } from '@/src/lib/api';
import { readCode, readUsdcBalance } from '@/src/lib/reads';
import { ActionButton, formatUSDC, type HandoffState, HandoffTile, Skeleton } from '@/src/ui';

/** The newest wallet the bank lists as protected (deploy userOp landed). */
function latestProtected(wallets: SqKeylineWallet[] | undefined): Address | null {
  const p = (wallets ?? [])
    .filter((w) => w.protected)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (p[0]?.address as Address | undefined) ?? null;
}

async function readWallet(w: Address) {
  const [bytecode, usdc] = await Promise.all([readCode(w), readUsdcBalance(w)]);
  return { deployed: Boolean(bytecode && bytecode !== '0x'), usdc };
}

/**
 * A2 · the Keyline tile. Two independent things:
 * - the phone setup of THIS web session: `POST /handoff` → QR + code, polled via `GET /handoff/:code` until the
 *   phone claims it (restored after a reload from `GET /sq/keyline`'s `currentSetup`);
 * - the client's existing wallets: "Protected" for the newest protected one, confirmed on chain (Safe deployed).
 * The tile always offers a setup: "Set up Keyline on my phone" with no protected wallet, else a secondary
 * "Set up Keyline on another phone" under the protected state. A wallet left pending by an abandoned phone never
 * hides the action. Until the bank ships `/sq/keyline`, the newest wallet comes from `walletAddress`
 * (`/sq/safety-key-request`) and "protected" from chain only.
 */
export function KeylineTile({ walletAddress }: { walletAddress: Address | null }) {
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [expiredLocally, setExpiredLocally] = useState(false);
  const keyline = useQuery({
    queryKey: ['sq', 'keyline'],
    queryFn: api.sq.keyline,
    refetchInterval: 3_000,
    retry: false,
  });
  const create = useMutation({
    mutationFn: api.handoff.create,
    onSuccess: (h) => {
      setExpiredLocally(false);
      setHandoff(h);
    },
  });

  // This session's setup: the code created in this tab, else the one the bank remembers (page reloaded).
  const restored = keyline.data?.currentSetup;
  const code =
    handoff?.code ?? (restored && restored.status !== 'expired' ? restored.code : undefined) ?? undefined;
  const status = useQuery({
    queryKey: ['sq', 'handoff', code],
    queryFn: () => api.handoff.get(code as string),
    enabled: Boolean(code),
    refetchInterval: (q) => (q.state.data?.status === 'open' || !q.state.data ? 2_000 : 5_000),
    retry: false,
  });
  const live = status.data?.code === code ? status.data : handoff?.code === code ? handoff : null;
  const setupWallet = (live?.walletAddress as Address | undefined) ?? null;

  // Existing wallets: the bank's list when it has the route; else the newest wallet (protected iff deployed).
  const existing = keyline.data ? latestProtected(keyline.data.wallets) : walletAddress;
  const setupChain = useQuery({
    queryKey: ['sq', 'tile-wallet', setupWallet],
    queryFn: () => readWallet(setupWallet as Address),
    enabled: Boolean(setupWallet),
    refetchInterval: 5_000,
  });
  const existingChain = useQuery({
    queryKey: ['sq', 'tile-wallet', existing],
    queryFn: () => readWallet(existing as Address),
    enabled: Boolean(existing),
    refetchInterval: 5_000,
  });
  const setupProtected = setupChain.data?.deployed === true;
  const existingProtected = existingChain.data?.deployed === true;
  // A setup that finished replaces "the latest protected wallet" with the new one.
  const shown = setupProtected ? setupChain : existingProtected ? existingChain : null;

  const inFlight = live && !setupProtected;
  const state: HandoffState = create.isPending
    ? 'starting'
    : inFlight
      ? live.status === 'claimed'
        ? 'claimed'
        : live.status === 'expired' || expiredLocally
          ? 'expired'
          : 'waiting'
      : shown
        ? 'protected'
        : 'idle';

  const host = live ? new URL(live.qrUrl).host : '';
  const tileCopy = {
    ...copyJourney.tile,
    scan: copyJourney.tile.scan.replace('keyline.app', host || 'keyline.app'),
  };
  const start = () => {
    setHandoff(null);
    create.mutate();
  };

  return (
    <div className="grid gap-4" data-testid="keyline-tile" data-state={state}>
      <HandoffTile
        state={state}
        copy={tileCopy}
        code={live?.code}
        qrValue={live?.qrUrl}
        expiresAt={live ? new Date(live.expiresAt).getTime() : undefined}
        onStart={start}
        onRenew={start}
        onExpire={() => setExpiredLocally(true)}
        registered={state === 'protected' ? 3 : 0}
      >
        {shown?.data ? (
          <p className="m-0 text-14 text-ink-2" data-testid="tile-balance">
            {formatUSDC(shown.data.usdc)}
          </p>
        ) : (
          <Skeleton kind="line" />
        )}
        <ActionButton
          label={copyV2.sqWeb.tileProtected.startAnother}
          variant="secondary"
          onClick={start}
          full
          data-testid="tile-start-another"
        />
      </HandoffTile>
      {state === 'claimed' ? (
        // A phone that claimed the code but never finished must not lock the tile: offer a fresh code.
        <ActionButton
          label={tileCopy.renew}
          variant="secondary"
          onClick={start}
          data-testid="tile-new-code"
        />
      ) : null}
      {create.isError ? (
        <ApiErrorState error={create.error} body={copy.common.errorBody} onRetry={start} />
      ) : null}
      {status.isError ? (
        <ApiErrorState error={status.error} body={copy.common.errorBody} onRetry={() => status.refetch()} />
      ) : null}
    </div>
  );
}
