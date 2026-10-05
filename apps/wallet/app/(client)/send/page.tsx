'use client';

import type { Contact } from '@keyline/shared';
import {
  AmountField,
  Button,
  formatCHF,
  formatUSDC,
  Note,
  SimulatedBadge,
  Skeleton,
  StatementRow,
  shortAddress,
  TextField,
} from '@keyline/ui';
import { CheckCircle } from '@phosphor-icons/react/dist/ssr';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { getAddress, isAddress } from 'viem';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy, copyGaps } from '@/src/copy';
import { env } from '@/src/env';
import { useContacts, useLocalWallet, useUsdcBalance } from '@/src/lib/hooks';
import { pendingSendStore } from '@/src/lib/storage';

export default function SendPage() {
  const router = useRouter();
  const { wallet } = useLocalWallet();
  const contacts = useContacts();
  const balance = useUsdcBalance(wallet?.address);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Contact | null>(null);
  const [chf, setChf] = useState('');
  const [errors, setErrors] = useState<{ to?: string; amount?: string }>({});

  const pastedAddress = isAddress(query.trim()) ? getAddress(query.trim()) : null;
  const recipient =
    picked ??
    (pastedAddress ? { address: pastedAddress, label: shortAddress(pastedAddress), known: false } : null);
  const isNew = recipient !== null && !(picked?.verifiedOwnership ?? false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = contacts.data ?? [];
    if (!q) return list;
    return list.filter((c) => c.label.toLowerCase().includes(q) || c.address.toLowerCase().includes(q));
  }, [contacts.data, query]);

  if (wallet === undefined) return <Skeleton kind="row" count={4} />;
  if (wallet === null) {
    router.replace('/');
    return null;
  }

  function review() {
    const next: { to?: string; amount?: string } = {};
    if (!recipient) next.to = copy.send.errAddress;
    const value = Number.parseFloat(chf);
    if (!Number.isFinite(value) || value <= 0) next.amount = copy.send.errAmount;
    const usdc = Number((value / env.chfPerUsdc).toFixed(2));
    if (!next.amount && balance.data !== undefined && usdc > balance.data) {
      next.amount = copy.send.errFunds(formatUSDC(balance.data));
    }
    setErrors(next);
    const target = recipient;
    if (next.to || next.amount || target === null) return;
    pendingSendStore.set({
      to: target.address,
      toLabel: target.label,
      knownContact: picked?.verifiedOwnership ?? false,
      amountChf: value,
      amountUsdc: usdc,
    });
    router.push('/send/review');
  }

  return (
    <>
      <ScreenHeader title={copy.send.title} backHref="/" />
      <section className="kl-stack" aria-label={copy.send.to}>
        <TextField
          label={copy.send.to}
          placeholder={copy.send.search}
          mono={Boolean(pastedAddress)}
          value={picked ? picked.label : query}
          onChange={(e) => {
            setPicked(null);
            setQuery(e.target.value);
          }}
          error={errors.to}
          autoComplete="off"
          suffix={picked ? <CheckCircle size={20} aria-hidden="true" /> : undefined}
        />
        {picked ? (
          <p className="text-12 text-ink-3">
            {copyGaps.recipientLabel}: {shortAddress(picked.address)}
          </p>
        ) : null}
        {!picked ? (
          <>
            <div className="kl-section">
              <h2 className="kl-section__title">{copy.send.contacts}</h2>
            </div>
            {contacts.isPending ? (
              <Skeleton kind="row" count={3} />
            ) : contacts.isError ? (
              <ApiErrorState
                error={contacts.error}
                body={copy.common.offlineBody}
                onRetry={() => contacts.refetch()}
              />
            ) : (
              <div>
                {filtered.map((c) => (
                  <StatementRow
                    key={c.address}
                    label={
                      <>
                        {c.label} {c.simulated ? <SimulatedBadge /> : null}
                      </>
                    }
                    meta={shortAddress(c.address)}
                    amount={c.verifiedOwnership ? copy.send.known : copy.send.newContact}
                    status={c.verifiedOwnership ? 'ok' : undefined}
                    onClick={() => {
                      setPicked(c);
                      setQuery('');
                    }}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}
        {isNew ? <Note tone="warn">{copy.send.newAddressNotice}</Note> : null}
      </section>

      <section className="kl-stack" aria-label={copy.send.amount}>
        <AmountField
          value={chf}
          onChange={setChf}
          rate={env.chfPerUsdc}
          label={copy.send.amount}
          error={errors.amount}
        />
        <p className="text-12 text-ink-3">
          {copy.send.rate(formatCHF(env.chfPerUsdc))} <SimulatedBadge />
        </p>
      </section>

      <div className="kl-actions">
        <Button variant="primary" full onClick={review}>
          {copy.send.review}
        </Button>
      </div>
    </>
  );
}
