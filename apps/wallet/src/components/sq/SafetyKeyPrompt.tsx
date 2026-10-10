'use client';

import type { SafetyKeyRequest } from '@keyline/shared';
import { ConfirmPrompt, type ConfirmPromptState } from '@keyline/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { copyJourney } from '@/src/copy';
import { api, errorDetail } from '@/src/lib/api';
import { safetyKeyStore } from '@/src/lib/storage';

/**
 * A5 · "Make this computer your Safety key?" while `GET /sq/safety-key-request` says `waiting`. Confirm → viem key in
 * this profile's IndexedDB (the same store /approve signs with) → `POST /sq/safety-key { address }`. The private key
 * never leaves this browser profile; the bank only learns the address.
 */
export function SafetyKeyPrompt({ request }: { request: SafetyKeyRequest }) {
  const queryClient = useQueryClient();
  const [declined, setDeclined] = useState(false);
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
