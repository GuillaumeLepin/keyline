'use client';

import type { Event } from '@keyline/shared';
import {
  Address,
  Button,
  EmptyState,
  formatCHF,
  formatShortDateTime,
  formatUSDC,
  KeyCard,
  Note,
  Panel,
  Sheet,
  SimulatedBadge,
  Skeleton,
  StatementRow,
  TestnetStrip,
} from '@keyline/ui';
import { Bank, DeviceMobile, IdentificationCard, Key, ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy, copyGaps } from '@/src/copy';
import { api, isApiError } from '@/src/lib/api';
import { addressUrl } from '@/src/lib/chain';
import { useLocalTransfers, useLocalWallet, useMe, useWalletEvents } from '@/src/lib/hooks';
import type { LocalWallet } from '@/src/lib/storage';

/** Security centre, first cut: keys, limits, sponsored counter, recovery mode, proof, event log (export/exit: Wave 3). */
export default function SecurityPage() {
  const { wallet } = useLocalWallet();
  return (
    <>
      <ScreenHeader title={copy.security.title} backHref="/" />
      {wallet === undefined ? (
        <Skeleton kind="row" count={4} />
      ) : wallet === null ? (
        <EmptyState
          title={copy.home.noWalletTitle}
          body={copy.home.noWalletBody}
          action={
            <Button variant="secondary" href="/onboarding">
              {copy.home.createWallet}
            </Button>
          }
        />
      ) : (
        <SecurityCentre wallet={wallet} />
      )}
    </>
  );
}

function SecurityCentre({ wallet }: { wallet: LocalWallet }) {
  const s = copy.security;
  const me = useMe();
  const events = useWalletEvents(wallet.address);
  const { transfers } = useLocalTransfers();
  const [proving, setProving] = useState(false);
  const guardians = useQuery({
    queryKey: ['guardians', wallet.address],
    queryFn: () => api.wallets.guardians(wallet.address),
    retry: false,
  });
  const has = (kind: string) => guardians.data?.some((g) => g.kind === kind) ?? false;
  const addressOf = (kind: string) => guardians.data?.find((g) => g.kind === kind)?.address;
  const today = new Date().toDateString();
  const usedToday = transfers
    .filter((t) => t.status !== 'failed' && new Date(t.at).toDateString() === today)
    .reduce((sum, t) => sum + t.amountChf, 0);
  const deployed = wallet.status === 'deployed';

  return (
    <>
      <p className="flex items-center gap-2 text-14 text-ok">
        <ShieldCheck size={18} aria-hidden="true" />
        {deployed ? copyGaps.security.protectedLine : copyGaps.security.pendingWallet}
      </p>

      <section className="kl-stack">
        <div className="kl-section">
          <h2 className="kl-section__title">{s.keys}</h2>
        </div>
        <div className="kl-stack">
          <KeyCard
            name={s.phoneKey.name}
            where={s.phoneKey.where}
            can={s.phoneKey.can}
            icon={<DeviceMobile size={20} aria-hidden="true" />}
            status="active"
          />
          <KeyCard
            name={s.safetyKey.name}
            where={s.safetyKey.where}
            can={s.safetyKey.can}
            cannot={copy.pair.keyCannot}
            icon={<Key size={20} aria-hidden="true" />}
            status={has('safety-key') ? 'active' : 'pending'}
            action={
              addressOf('safety-key') ? (
                <GuardianAddress value={addressOf('safety-key') as string} />
              ) : undefined
            }
          />
          <KeyCard
            name={s.emergencyCard.name}
            where={s.emergencyCard.where}
            can={s.emergencyCard.can}
            cannot={s.emergencyCard.cannot}
            icon={<IdentificationCard size={20} aria-hidden="true" />}
            status={has('emergency-card') ? 'active' : 'pending'}
            action={
              addressOf('emergency-card') ? (
                <GuardianAddress value={addressOf('emergency-card') as string} />
              ) : undefined
            }
          />
          <KeyCard
            name={s.swissquote.name}
            where={s.swissquote.where}
            can={s.swissquote.can}
            cannot={s.swissquote.cannot}
            icon={<Bank size={20} aria-hidden="true" />}
            status={has('swissquote') ? 'active' : 'pending'}
            action={
              addressOf('swissquote') ? (
                <GuardianAddress value={addressOf('swissquote') as string} />
              ) : undefined
            }
          />
        </div>
        {guardians.isError ? (
          <ApiErrorState
            error={guardians.error}
            body={copy.common.errorBody}
            onRetry={() => guardians.refetch()}
          />
        ) : null}
      </section>

      <section className="kl-stack">
        <div className="kl-section">
          <h2 className="kl-section__title">{s.limits}</h2>
        </div>
        <Panel
          rows={[
            { label: s.dailyLimit, value: s.dailyUsed(formatCHF(usedToday)) },
            { label: s.waitingPeriod, value: s.waitingTrigger },
            {
              label: s.sponsored,
              value: me.data ? (
                s.sponsoredCount(me.data.account.sponsoredToday, me.data.account.sponsoredDailyCap)
              ) : me.isError ? (
                '—'
              ) : (
                <Skeleton kind="line" width={48} />
              ),
            },
            { label: s.recoveryMode, value: s.recoveryModeValue },
          ]}
          footnote={s.laptopAbove}
        />
      </section>

      <section className="kl-stack">
        <div className="kl-section">
          <h2 className="kl-section__title">{s.devices}</h2>
        </div>
        <Panel
          rows={[
            {
              label: copy.device['lea-phone'],
              value: wallet.deviceLabel === copy.device['lea-phone'] ? s.thisDevice : '',
            },
            {
              label: copy.device['lea-laptop'],
              value: has('safety-key') ? copy.pair.pairedHere : copy.common.pending,
            },
          ]}
        />
      </section>

      <ul className="kl-list">
        <StatementRow
          label={s.prove}
          onClick={() => setProving(true)}
          icon={<ShieldCheck size={20} aria-hidden="true" />}
        />
        <StatementRow
          label={s.exportKey}
          meta={`${s.exportOnLaptop} · ${copyGaps.security.exportLater}`}
          chevron={false}
        />
      </ul>

      <section className="kl-stack">
        <div className="kl-section">
          <h2 className="kl-section__title">{s.eventLog}</h2>
        </div>
        {events.isPending ? (
          <Skeleton kind="row" count={3} />
        ) : events.isError ? (
          <ApiErrorState error={events.error} body={copy.common.errorBody} onRetry={() => events.refetch()} />
        ) : events.data.length === 0 ? (
          <EmptyState title={s.noEvents} />
        ) : (
          <ul className="kl-list">
            {events.data.slice(0, 20).map((e) => (
              <StatementRow
                key={e.id}
                label={eventLabel(e)}
                meta={formatShortDateTime(new Date(e.at))}
                chevron={false}
              />
            ))}
          </ul>
        )}
      </section>

      <TestnetStrip explorerUrl={addressUrl(wallet.address)} />

      <ProveSheet wallet={wallet} open={proving} onClose={() => setProving(false)} />
    </>
  );
}

function GuardianAddress({ value }: { value: string }) {
  return <Address value={value} explorerUrl={addressUrl(value)} />;
}

function eventLabel(e: Event): string {
  const ev = copy.security.events;
  switch (e.type) {
    case 'wallet.created':
    case 'wallet.deployed':
      return ev.created;
    case 'guardian.added':
      return e.payload.kind === 'safety-key'
        ? ev.safetyAdded
        : e.payload.kind === 'emergency-card'
          ? ev.cardAdded
          : copy.security.swissquote.name;
    case 'attestation.verified':
      return ev.proven;
    case 'recovery.identity-refused':
      return ev.refused;
    case 'userop.confirmed':
    case 'transfer.confirmed': {
      const amount = e.payload.amountUsdc;
      return typeof amount === 'number'
        ? ev.transfer(formatUSDC(amount))
        : copyGaps.security.eventFallback(e.type);
    }
    default:
      return copyGaps.security.eventFallback(e.type);
  }
}

/** "Prove this wallet is yours": shows the ERC-1271 attestation the bank verified in onboarding step 6. */
function ProveSheet({ wallet, open, onClose }: { wallet: LocalWallet; open: boolean; onClose: () => void }) {
  const s = copy.security;
  const [copied, setCopied] = useState(false);
  const attestation = useQuery({
    queryKey: ['attestation', wallet.address],
    queryFn: () => api.attestations.get(wallet.address),
    enabled: open,
    retry: false,
  });
  const missing = attestation.isError && isApiError(attestation.error) && attestation.error.status === 404;
  return (
    <Sheet open={open} title={s.prove} onClose={onClose}>
      <div className="kl-stack">
        <p className="kl-lead">{s.proveBody}</p>
        <Panel
          rows={[
            {
              label: s.proveField,
              value: (
                <>
                  {copy.security.swissquote.name} <SimulatedBadge />
                </>
              ),
            },
          ]}
        />
        {attestation.isPending ? (
          <Skeleton kind="block" height={80} />
        ) : missing ? (
          <Note tone="info">{copyGaps.security.attestationNone}</Note>
        ) : attestation.isError ? (
          <ApiErrorState
            error={attestation.error}
            body={copy.common.errorBody}
            onRetry={() => attestation.refetch()}
          />
        ) : (
          <>
            <pre className="kl-code">{attestation.data.signature}</pre>
            <Panel
              rows={[
                {
                  label: copyGaps.security.verifiedAt,
                  value: formatShortDateTime(new Date(attestation.data.verifiedAt)),
                },
                { label: copyGaps.security.method, value: attestation.data.method.toUpperCase() },
                {
                  label: copy.onboarding.s6.rows.client,
                  value: (
                    <>
                      {attestation.data.clientId} <SimulatedBadge />
                    </>
                  ),
                },
              ]}
            />
            <p className="text-12 text-ink-3">{s.proveMeta}</p>
            <Button
              variant="secondary"
              full
              onClick={() => {
                navigator.clipboard
                  .writeText(JSON.stringify(attestation.data))
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {copied ? copyGaps.security.proofCopied : s.proveCopy}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
