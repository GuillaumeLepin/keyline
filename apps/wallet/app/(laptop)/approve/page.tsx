'use client';

import type { RecoveryRequest } from '@keyline/shared';
import { Address, Button, Disclosure, EmptyState, formatRelative, Note, Panel, Skeleton } from '@keyline/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getAddress } from 'viem';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { copy, copyGaps } from '@/src/copy';
import { api } from '@/src/lib/api';
import { addressUrl, signRecoveryConfirmation } from '@/src/lib/chain';
import { useNow } from '@/src/lib/hooks';
import { type SafetyKeyRecord, safetyKeyStore } from '@/src/lib/storage';

/**
 * Laptop persona. Tier-2 transfer co-approval is Wave 3; today this queue shows a recovery waiting for a second
 * recoverer (SPEC F3.3). The Safety key signs the SocialRecoveryModule's ExecuteRecovery hash — nothing else.
 */
export default function ApprovePage() {
  const [key, setKey] = useState<SafetyKeyRecord | null | undefined>(undefined);
  const [confirmedHere, setConfirmedHere] = useState<string | null>(null);
  useEffect(() => {
    safetyKeyStore
      .get()
      .then(setKey)
      .catch(() => setKey(null));
  }, []);

  // The bank has no "recoveries by wallet" route; the wallet's event feed names the request id.
  const events = useQuery({
    queryKey: ['wallet-events', key?.walletAddress],
    queryFn: () => api.wallets.events(key?.walletAddress as string),
    enabled: Boolean(key),
    refetchInterval: 3_000,
    retry: false,
  });
  const recoveryId = latestRecoveryId(events.data);
  const recovery = useQuery({
    queryKey: ['recovery', recoveryId],
    queryFn: () => api.recoveries.get(recoveryId as string),
    enabled: Boolean(recoveryId),
    refetchInterval: 3_000,
    retry: false,
  });

  if (key === undefined || (key && events.isPending)) return <Skeleton kind="block" height={160} />;
  if (key === null) {
    return (
      <EmptyState
        title={copy.approve.emptyTitle}
        body={copyGaps.approve.noSafetyKey}
        action={
          <Button variant="secondary" href="/pair">
            {copyGaps.approve.pairLink}
          </Button>
        }
      />
    );
  }
  if (events.isError) {
    return (
      <ApiErrorState error={events.error} body={copy.common.errorBody} onRetry={() => events.refetch()} />
    );
  }
  const r = recovery.data;
  // Once this laptop confirmed, keep showing the result even after the bank relays and the status moves on.
  if (r && (r.status === 'awaiting-guardians' || confirmedHere === r.id)) {
    return <RecoveryPrompt recovery={r} safetyKey={key} onConfirmed={() => setConfirmedHere(r.id)} />;
  }
  return <EmptyState title={copy.approve.emptyTitle} body={copy.approve.emptyBody} />;
}

function latestRecoveryId(
  events: { type: string; payload: Record<string, unknown>; at: string }[] | undefined,
) {
  if (!events) return undefined;
  const candidates = events
    .filter((e) => e.type.startsWith('recovery.') && typeof e.payload.recoveryRequestId === 'string')
    .sort((a, b) => b.at.localeCompare(a.at));
  return candidates[0]?.payload.recoveryRequestId as string | undefined;
}

function RecoveryPrompt({
  recovery,
  safetyKey,
  onConfirmed,
}: {
  recovery: RecoveryRequest;
  safetyKey: SafetyKeyRecord;
  onConfirmed: () => void;
}) {
  const s = copy.recover;
  const queryClient = useQueryClient();
  const now = useNow();
  const [refused, setRefused] = useState(false);
  const confirm = useMutation({
    mutationFn: async () => {
      const signed = await signRecoveryConfirmation({
        privateKey: safetyKey.privateKey,
        recoveryId: recovery.id,
        wallet: getAddress(recovery.walletAddress),
        newOwnerProxy: getAddress(recovery.newOwner.signerProxyAddress),
      });
      return api.recoveries.confirm(recovery.id, {
        kind: 'safety-key',
        guardianAddress: signed.guardianAddress,
        signature: signed.signature,
        nonce: signed.nonce,
      });
    },
    onSuccess: (next) => {
      onConfirmed();
      queryClient.setQueryData(['recovery', recovery.id], next);
    },
  });

  if (refused) {
    return <Note tone="info">{copyGaps.approve.recoveryRefused}</Note>;
  }
  if (confirm.isSuccess) {
    return (
      <>
        <Note tone="ok">{copyGaps.approve.recoveryConfirmed}</Note>
        <Panel
          rows={[
            { label: copyGaps.desk.status, value: copy.desk.status[recovery.status] },
            {
              label: copyGaps.approve.newKey,
              value: (
                <Address
                  value={recovery.newOwner.signerProxyAddress}
                  explorerUrl={addressUrl(recovery.newOwner.signerProxyAddress)}
                />
              ),
            },
          ]}
        />
      </>
    );
  }

  return (
    <>
      <div className="kl-stack">
        <h1 className="kl-title">{s.laptopPrompt(formatRelative(new Date(recovery.createdAt), now))}</h1>
        <p className="kl-lead">{copyGaps.approve.recoveryBody}</p>
      </div>
      <Panel
        title={copyGaps.approve.signingTitle}
        rows={[
          {
            label: copyGaps.recover.walletLabel,
            value: (
              <Address value={recovery.walletAddress} explorerUrl={addressUrl(recovery.walletAddress)} />
            ),
          },
          { label: copyGaps.desk.device, value: recovery.requestedFrom.deviceLabel },
          {
            label: copyGaps.approve.newKey,
            value: (
              <Address
                value={recovery.newOwner.signerProxyAddress}
                explorerUrl={addressUrl(recovery.newOwner.signerProxyAddress)}
              />
            ),
          },
          {
            label: copy.security.swissquote.name,
            value: recovery.guardianConfirmations.some((c) => c.kind === 'swissquote' && !c.void)
              ? copy.desk.conf.confirmed('')
              : copy.desk.conf.pending,
          },
        ]}
      />
      {confirm.isError ? (
        <ApiErrorState error={confirm.error} body={copy.common.errorBody} onRetry={() => confirm.mutate()} />
      ) : null}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setRefused(true)} disabled={confirm.isPending}>
          {s.laptopRefuse}
        </Button>
        <Button variant="primary" loading={confirm.isPending} onClick={() => confirm.mutate()}>
          {s.laptopConfirm}
        </Button>
      </div>
      <Disclosure summary={copy.common.technicalDetails}>
        <div className="kl-stack kl-stack--tight">
          <p className="text-12 text-ink-3">{copy.onboarding.s2.keyName}</p>
          <Address value={safetyKey.address} explorerUrl={addressUrl(safetyKey.address)} />
        </div>
      </Disclosure>
    </>
  );
}
