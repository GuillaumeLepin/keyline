'use client';

import type { Handoff } from '@keyline/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Address } from 'viem';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { copy, copyJourney } from '@/src/copy';
import { api } from '@/src/lib/api';
import { readCode, readUsdcBalance } from '@/src/lib/reads';
import { formatUSDC, type HandoffState, HandoffTile, Skeleton } from '@/src/ui';

/**
 * A2 · the Keyline tile. `POST /handoff` → QR + code, polls `GET /handoff/:code` until the phone claims it. Once a
 * wallet exists, "protected" is read from chain (Safe deployed), never from the bank; the balance too.
 */
export function KeylineTile({ walletAddress }: { walletAddress: Address | null }) {
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [expiredLocally, setExpiredLocally] = useState(false);
  const create = useMutation({
    mutationFn: api.handoff.create,
    onSuccess: (h) => {
      setExpiredLocally(false);
      setHandoff(h);
    },
  });
  const code = handoff?.code;
  const status = useQuery({
    queryKey: ['sq', 'handoff', code],
    queryFn: () => api.handoff.get(code as string),
    enabled: Boolean(code),
    refetchInterval: (q) => (q.state.data?.status === 'open' || !q.state.data ? 2_000 : 5_000),
    retry: false,
  });
  const live = status.data ?? handoff;
  const wallet = (live?.walletAddress as Address | undefined) ?? walletAddress ?? undefined;

  const onChain = useQuery({
    queryKey: ['sq', 'tile-wallet', wallet],
    queryFn: async () => {
      const w = wallet as Address;
      const [bytecode, usdc] = await Promise.all([readCode(w), readUsdcBalance(w)]);
      return { deployed: Boolean(bytecode && bytecode !== '0x'), usdc };
    },
    enabled: Boolean(wallet),
    refetchInterval: 5_000,
  });
  const deployed = onChain.data?.deployed === true;

  const state: HandoffState = deployed
    ? 'protected'
    : create.isPending
      ? 'starting'
      : live?.status === 'claimed' || (wallet && !live)
        ? 'claimed'
        : live && (live.status === 'expired' || expiredLocally)
          ? 'expired'
          : live
            ? 'waiting'
            : 'idle';

  const host = live ? new URL(live.qrUrl).host : '';
  const tileCopy = {
    ...copyJourney.tile,
    scan: copyJourney.tile.scan.replace('keyline.app', host || 'keyline.app'),
  };

  return (
    <div className="grid gap-4" data-testid="keyline-tile" data-state={state}>
      <HandoffTile
        state={state}
        copy={tileCopy}
        code={live?.code}
        qrValue={live?.qrUrl}
        expiresAt={live ? new Date(live.expiresAt).getTime() : undefined}
        onStart={() => create.mutate()}
        onRenew={() => create.mutate()}
        onExpire={() => setExpiredLocally(true)}
        registered={deployed ? 3 : 0}
      >
        {onChain.isPending ? (
          <Skeleton kind="line" />
        ) : onChain.data ? (
          <p className="m-0 text-14 text-ink-2" data-testid="tile-balance">
            {formatUSDC(onChain.data.usdc)}
          </p>
        ) : null}
      </HandoffTile>
      {create.isError ? (
        <ApiErrorState error={create.error} body={copy.common.errorBody} onRetry={() => create.mutate()} />
      ) : null}
      {status.isError ? (
        <ApiErrorState error={status.error} body={copy.common.errorBody} onRetry={() => status.refetch()} />
      ) : null}
    </div>
  );
}
