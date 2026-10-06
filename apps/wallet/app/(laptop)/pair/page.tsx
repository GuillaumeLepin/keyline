'use client';

import { Address, Button, KeyCard, Note, Skeleton, TextField } from '@keyline/ui';
import { Key } from '@phosphor-icons/react/dist/ssr';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { copy } from '@/src/copy';
import { api, isApiError } from '@/src/lib/api';
import { addressUrl } from '@/src/lib/chain';
import { type SafetyKeyRecord, safetyKeyStore } from '@/src/lib/storage';

/**
 * Laptop persona. The Safety key is a secp256k1 key generated with viem on first pairing and kept in this
 * profile's IndexedDB (prototype: software key). The phone never sees it; the bank only learns its address.
 */
export default function PairPage() {
  const [code, setCode] = useState('');
  const [existing, setExisting] = useState<SafetyKeyRecord | null | undefined>(undefined);
  useEffect(() => {
    safetyKeyStore
      .get()
      .then(setExisting)
      .catch(() => setExisting(null));
  }, []);

  const pair = useMutation({
    mutationFn: async (pairingCode: string) => {
      const pairing = await api.pairings.get(pairingCode);
      const walletAddress = getAddress(pairing.walletAddress);
      // Reuse this laptop's key if it already protects this wallet; otherwise generate one (viem, no custom crypto).
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
      await api.pairings.claim(pairingCode, { kind: 'safety-key', address: record.address });
      return record;
    },
    onSuccess: setExisting,
  });

  const wrongCode =
    pair.isError &&
    isApiError(pair.error) &&
    (pair.error.status === 404 || pair.error.status === 409 || pair.error.status === 410);
  const valid = /^\d{6}$/.test(code);

  return (
    <>
      <div className="kl-stack">
        <h1 className="kl-title">{copy.pair.title}</h1>
        <p className="kl-lead">{copy.pair.body}</p>
      </div>

      {pair.isSuccess ? (
        <>
          <Note tone="ok">{copy.pair.success}</Note>
          <Button variant="primary" href="/approve">
            {copy.common.done}
          </Button>
        </>
      ) : (
        <>
          <TextField
            label={copy.pair.field}
            mono
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            error={wrongCode ? copy.pair.wrongCode : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) pair.mutate(code);
            }}
          />
          {pair.isError && !wrongCode ? (
            <ApiErrorState
              error={pair.error}
              body={copy.common.errorBody}
              onRetry={() => pair.mutate(code)}
            />
          ) : null}
          <div>
            <Button
              variant="primary"
              disabled={!valid}
              loading={pair.isPending}
              onClick={() => pair.mutate(code)}
            >
              {copy.pair.primary}
            </Button>
          </div>
        </>
      )}

      {existing === undefined ? (
        <Skeleton kind="block" height={96} />
      ) : (
        <KeyCard
          name={copy.onboarding.s2.keyName}
          where={copy.pair.keyWhere}
          can={copy.pair.keyCan}
          cannot={copy.pair.keyCannot}
          icon={<Key size={20} aria-hidden="true" />}
          status={existing ? 'active' : 'pending'}
          statusWord={existing ? copy.pair.pairedHere : undefined}
          action={
            existing ? (
              <Address value={existing.address} explorerUrl={addressUrl(existing.address)} />
            ) : undefined
          }
        />
      )}
      <Note tone="info">{copy.pair.note}</Note>
    </>
  );
}
