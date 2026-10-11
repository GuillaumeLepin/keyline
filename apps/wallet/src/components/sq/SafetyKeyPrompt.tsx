'use client';

import type { SafetyKeyRequest } from '@keyline/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { copyJourney } from '@/src/copy';
import { api, errorDetail } from '@/src/lib/api';
import { safetyKeyStore } from '@/src/lib/storage';
import { ConfirmPrompt, type ConfirmPromptState } from '@/src/ui';

/**
 * A5 · "Make this computer your Safety key?" while `GET /sq/safety-key-request` says `waiting`. Confirm → viem key in
 * this profile's IndexedDB (the same store /approve signs with) → `POST /sq/safety-key { address }`. The private key
 * never leaves this browser profile; the bank only learns the address. When the bank says `done`, the prompt says
 * "already your Safety key" only if THIS profile's IndexedDB holds the key the bank registered
 * (`safetyKeyAddress`); another computer's key (or a fresh profile) shows nothing — never claim a key we don't hold.
 */
export function SafetyKeyPrompt({ request }: { request: SafetyKeyRequest }) {
  const queryClient = useQueryClient();
  const [declined, setDeclined] = useState(false);
  const local = useQuery({
    queryKey: ['sq', 'local-safety-key', request.safetyKeyAddress ?? null],
    queryFn: async () => (await safetyKeyStore.get())?.address ?? null,
    enabled: request.status === 'done',
    retry: false,
  });
  const holdsKey =
    Boolean(local.data && request.safetyKeyAddress) &&
    local.data?.toLowerCase() === request.safetyKeyAddress?.toLowerCase();
  const confirm = useMutation({
    mutationFn: async () => {
      if (!request.walletAddress) throw new Error('no wallet waiting');
      const walletAddress = getAddress(request.walletAddress);
      let record = await safetyKeyStore.get();
      if (!record || record.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        const privateKey = generatePrivateKey();
        record = await safetyKeyStore.set({
          privateKey,
          address: privateKeyToAccount(privateKey).address,
          walletAddress,
          createdAt: new Date().toISOString(),
        });
      }
      await api.sq.registerSafetyKey({ address: record.address });
      return record;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sq', 'safety-key-request'] }),
  });
  if (declined && !confirm.isSuccess) return null;
  // `done` for a key this browser doesn't hold (or still reading IndexedDB): nothing to say here.
  if (request.status === 'done' && !holdsKey && !confirm.isPending && !confirm.isSuccess) return null;

  const state: ConfirmPromptState = confirm.isPending
    ? 'confirming'
    : confirm.isSuccess
      ? 'done'
      : confirm.isError
        ? 'error'
        : request.status === 'done'
          ? 'already'
          : 'ask';

  return (
    <div
      data-testid="safety-key-prompt"
      data-state={state}
      title={confirm.isError ? errorDetail(confirm.error) : undefined}
    >
      <ConfirmPrompt
        state={state}
        copy={copyJourney.safetyKey}
        onConfirm={() => confirm.mutate()}
        onDecline={() => setDeclined(true)}
      />
    </div>
  );
}
