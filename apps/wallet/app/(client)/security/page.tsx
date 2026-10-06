'use client';

import type { Event, Guardian } from '@keyline/shared';
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
  type PanelRow,
  Sheet,
  SimulatedBadge,
  Skeleton,
  StatementRow,
  TestnetStrip,
} from '@keyline/ui';
import {
  Bank,
  DeviceMobile,
  DownloadSimple,
  IdentificationCard,
  Key,
  ShieldCheck,
  SignOut,
} from '@phosphor-icons/react/dist/ssr';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy, copyGaps } from '@/src/copy';
import { env } from '@/src/env';
import { api, isApiError } from '@/src/lib/api';
import { addressUrl, readRecoveryStatus } from '@/src/lib/chain';
import { useLocalTransfers, useLocalWallet, useMe, useWalletEvents } from '@/src/lib/hooks';
import { type LocalWallet, type SafetyKeyRecord, safetyKeyStore } from '@/src/lib/storage';

/** Security centre (SPEC F6): keys, limits, sponsored counter, recovery mode, proof, Safety-key export, exit hatch, event log. */
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
  const [exporting, setExporting] = useState(false);
  const [exiting, setExiting] = useState(false);
  // The laptop persona holds the Safety key in IndexedDB; the phone does not — the export row adapts.
  const [safetyKey, setSafetyKey] = useState<SafetyKeyRecord | null | undefined>(undefined);
  useEffect(() => {
    safetyKeyStore
      .get()
      .then((k) =>
        setSafetyKey(k && k.walletAddress.toLowerCase() === wallet.address.toLowerCase() ? k : null),
      )
      .catch(() => setSafetyKey(null));
  }, [wallet.address]);
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
        {deployed ? copy.security.protectedLine : copy.security.pendingWallet}
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
        {safetyKey ? (
          <StatementRow
            label={s.exportKey}
            meta={copyGaps.security.exportPlainNote}
            onClick={() => setExporting(true)}
            icon={<DownloadSimple size={20} aria-hidden="true" />}
          />
        ) : (
          <StatementRow
            label={s.exportKey}
            meta={s.exportOnLaptop}
            chevron={false}
            icon={<DownloadSimple size={20} aria-hidden="true" />}
          />
        )}
        <StatementRow
          label={s.exit}
          meta={s.exitEyebrow}
          onClick={() => setExiting(true)}
          icon={<SignOut size={20} aria-hidden="true" />}
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
      {safetyKey ? (
        <ExportSheet safetyKey={safetyKey} open={exporting} onClose={() => setExporting(false)} />
      ) : null}
      <ExitSheet
        wallet={wallet}
        bankGuardians={guardians.data}
        open={exiting}
        onClose={() => setExiting(false)}
      />
    </>
  );
}

/** Exit hatch (SPEC F6): everything a client needs if Swissquote disappears, with the recoverer set read live on-chain. */
function ExitSheet({
  wallet,
  bankGuardians,
  open,
  onClose,
}: {
  wallet: LocalWallet;
  bankGuardians: Guardian[] | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const s = copy.security;
  const g = copyGaps.security;
  const [copied, setCopied] = useState(false);
  const onChain = useQuery({
    queryKey: ['recovery-status', wallet.address],
    queryFn: () => readRecoveryStatus(wallet.address as `0x${string}`),
    enabled: open,
    retry: 1,
  });
  const kindOf = (address: string): string => {
    const match = bankGuardians?.find((b) => b.address.toLowerCase() === address.toLowerCase());
    return match ? copy.desk.kinds[match.kind] : g.exitUnknownGuardian;
  };
  const cli = g.exitCli(wallet.address);
  const guardianRows: PanelRow[] = onChain.data
    ? onChain.data.guardians.map((address) => ({
        label: kindOf(address),
        value: <Address value={address} explorerUrl={addressUrl(address)} />,
      }))
    : [];
  return (
    <Sheet open={open} title={s.exit} onClose={onClose}>
      <div className="kl-stack">
        <p className="kl-lead">{s.exitEyebrow}</p>
        <Panel
          rows={[
            {
              label: s.exitWallet,
              value: <Address value={wallet.address} explorerUrl={addressUrl(wallet.address)} />,
            },
            {
              label: s.exitVerify,
              value: (
                <a className="kl-link" href={addressUrl(wallet.address)} target="_blank" rel="noreferrer">
                  {copy.common.viewOnBasescan} ↗
                </a>
              ),
            },
          ]}
        />
        <div className="kl-section">
          <h3 className="kl-section__title">{s.exitRecoverers}</h3>
        </div>
        {onChain.isPending ? (
          <div className="kl-stack kl-stack--tight">
            <Skeleton kind="row" count={3} />
            <p className="text-12 text-ink-3">{g.exitLoadingGuardians}</p>
          </div>
        ) : onChain.isError ? (
          <ApiErrorState
            error={onChain.error}
            body={g.guardiansUnavailable}
            onRetry={() => onChain.refetch()}
          />
        ) : onChain.data.guardians.length === 0 ? (
          <EmptyState title={copy.security.pendingWallet} />
        ) : (
          <Panel
            rows={guardianRows}
            footnote={g.exitThreshold(Number(onChain.data.guardianThreshold), onChain.data.guardians.length)}
          />
        )}
        <p className="text-14 text-ink-2">{g.exitSigning4337}</p>
        <p className="text-14 text-ink-2">{s.exitRestore}</p>
        <pre className="kl-code">{cli}</pre>
        <Button
          variant="secondary"
          full
          onClick={() => {
            navigator.clipboard
              .writeText(cli)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? g.exitCliCopied : copy.common.copy}
        </Button>
        <Note tone="info">{s.exitCaveat}</Note>
        <p className="text-12 text-ink-3">
          {copy.security.recoveryMode}: {env.recoveryModule}
        </p>
      </div>
    </Sheet>
  );
}

/** Laptop only: downloads the Safety key. Prototype = plain JSON; production = encrypted keystore (DESIGN.md). */
function ExportSheet({
  safetyKey,
  open,
  onClose,
}: {
  safetyKey: SafetyKeyRecord;
  open: boolean;
  onClose: () => void;
}) {
  const s = copy.security;
  const g = copyGaps.security;
  const [done, setDone] = useState(false);
  const download = () => {
    const blob = new Blob(
      [JSON.stringify({ address: safetyKey.address, privateKey: safetyKey.privateKey }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = s.exportFilename;
    a.click();
    URL.revokeObjectURL(url);
    setDone(true);
  };
  return (
    <Sheet open={open} title={s.exportKey} onClose={onClose}>
      <div className="kl-stack">
        <p className="kl-lead">{s.exportBody}</p>
        <Note tone="warn">
          {g.exportPlainNote} <SimulatedBadge />
        </Note>
        <Panel
          rows={[
            {
              label: copy.onboarding.s2.keyName,
              value: <Address value={safetyKey.address} explorerUrl={addressUrl(safetyKey.address)} />,
            },
            { label: s.exportFilename, value: 'JSON' },
          ]}
        />
        {done ? <Note tone="ok">{g.exportDone}</Note> : null}
        <Button variant="primary" full onClick={download}>
          {g.exportPlainPrimary}
        </Button>
      </div>
    </Sheet>
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
        : copy.security.eventFallback(e.type);
    }
    default:
      return copy.security.eventFallback(e.type);
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
          <Note tone="info">{copy.security.attestationNone}</Note>
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
                  label: copy.security.verifiedAt,
                  value: formatShortDateTime(new Date(attestation.data.verifiedAt)),
                },
                { label: copy.security.method, value: attestation.data.method.toUpperCase() },
                {
                  label: copy.onboarding.s6.rows.client,
                  value: (
                    <>
                      {attestation.data.clientId} <SimulatedBadge />
                    </>
                  ),
                },
                {
                  label: copyGaps.security.proveWallet,
                  value: (
                    <Address
                      value={attestation.data.walletAddress}
                      explorerUrl={addressUrl(attestation.data.walletAddress)}
                    />
                  ),
                },
                { label: copyGaps.security.proveChain, value: String(attestation.data.chainId) },
                {
                  label: copyGaps.security.proveNonce,
                  value: <span className="kl-mono text-12">{attestation.data.nonce}</span>,
                },
              ]}
            />
            <p className="text-12 text-ink-3">{s.proveMeta}</p>
            <p className="text-12 text-ink-3">{copyGaps.security.proveFinma}</p>
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
              {copied ? copy.security.proofCopied : s.proveCopy}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
