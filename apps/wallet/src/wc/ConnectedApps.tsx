'use client';

// SPEC §11.4 / DESIGN.md W3, W4, W13 — connected apps (list + detail with Disconnect and the app's activity) and the
// request inbox (`{app} is waiting for you` · kind · time · Review).
import { Clock } from '@phosphor-icons/react/dist/ssr';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { copyWc } from '../copy';
import { formatClock, formatRelative } from '../i18n/dates';
import { api } from '../lib/api';
import { addressUrl } from '../lib/reads';
import { walletStore } from '../lib/storage';
import {
  Address,
  Button,
  DappIdentityRow,
  DappPermissionsList,
  EmptyState,
  Note,
  Panel,
  SheetV2,
  Skeleton,
  StatementRow,
} from '../ui';
import { type RequestView, useWc, type WcSession } from './context';
import { verificationOf } from './requests';

function sessionAccount(s: WcSession): string | undefined {
  return s.namespaces.eip155?.accounts[0]?.split(':')[2];
}

export function ConnectedApps() {
  const wc = useWc();
  const [selected, setSelected] = useState<string | null>(null);
  // WC-22: the disconnect confirmation is its own sheet (danger confirm + Keep), opened from the detail sheet.
  const [confirming, setConfirming] = useState<string | null>(null);
  const wallet = typeof window === 'undefined' ? null : walletStore.get();
  // The bank's record carries each session's Verify context (verification chip); the relay doesn't keep it.
  const recorded = useQuery({
    queryKey: ['dapp-sessions', wallet?.address, wc?.sessions.length],
    queryFn: () => api.dappSessions.list(wallet?.address as string),
    enabled: Boolean(wallet && wc && wc.sessions.length > 0),
    retry: false,
  });
  if (!wc) return null;
  const c = copyWc.apps;
  const session = wc.sessions.find((s) => s.topic === selected) ?? null;
  const toDisconnect = wc.sessions.find((s) => s.topic === confirming) ?? null;
  return (
    <section className="kl-stack" data-testid="wc-sessions">
      <div className="kl-section">
        <h2 className="kl-section__title">{c.title}</h2>
      </div>
      {wc.status === 'starting' ? (
        <Skeleton kind="row" count={1} />
      ) : wc.sessions.length === 0 ? (
        <div className="kl-stack kl-stack--tight">
          <p className="m-0 text-14 text-ink-2">{c.empty}</p>
          <p className="m-0 text-12 text-ink-3">{c.emptyBody}</p>
        </div>
      ) : (
        <ul className="kl-list">
          {wc.sessions.map((s) => {
            const meta = s.peer.metadata;
            const rec = recorded.data?.find((r) => r.topic === s.topic);
            return (
              <li key={s.topic} className="contents">
                <button
                  type="button"
                  className="w-full text-left"
                  data-testid="wc-session"
                  onClick={() => setSelected(s.topic)}
                >
                  <DappIdentityRow
                    name={meta.name}
                    url={meta.url}
                    iconUrl={meta.icons?.[0]}
                    verification={rec ? verificationOf(rec.verify, rec.url) : 'unverified'}
                    copy={copyWc.identity}
                    compact
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <SheetV2
        contained
        open={session !== null}
        title={session?.peer.metadata.name ?? ''}
        onClose={() => setSelected(null)}
        closeLabel={copyWc.request.close}
      >
        {session ? (
          <SessionDetail
            session={session}
            onDisconnect={() => {
              setConfirming(session.topic);
              setSelected(null);
            }}
          />
        ) : null}
      </SheetV2>
      <SheetV2
        contained
        open={toDisconnect !== null}
        title={toDisconnect ? c.disconnectTitle(toDisconnect.peer.metadata.name) : ''}
        onClose={() => setConfirming(null)}
        closeLabel={copyWc.request.close}
      >
        {toDisconnect ? (
          <DisconnectConfirm
            session={toDisconnect}
            onKeep={() => {
              setSelected(toDisconnect.topic);
              setConfirming(null);
            }}
            onDone={() => setConfirming(null)}
          />
        ) : null}
      </SheetV2>
    </section>
  );
}

/** WC-22: "Approval · 100 USDC", "Transfer · 1 USDC", "Sign-in" — never the bank's long sentence. */
function shortActivity(method: string, summary: string): string {
  const k = copyWc.apps.kinds;
  const amount = /(?:up to|send|Send)\s+([\d.,]+\s*[A-Z]{3,5}|an unlimited amount of [A-Z]{3,5})/.exec(
    summary,
  )?.[1];
  const value = amount?.startsWith('an unlimited') ? copyWc.request.typed.rows.unlimited : amount;
  if (/spend|approv/i.test(summary)) return value ? `${k.approval} · ${value}` : k.approval;
  if (/^send|transfer/i.test(summary)) return value ? `${k.transfer} · ${value}` : k.transfer;
  if (method === 'wallet_sendCalls') return k.batch;
  if (/sign in|sign-in/i.test(summary)) return k.signIn;
  if (method === 'personal_sign' || method.startsWith('eth_signTypedData')) return k.signature;
  return k.other;
}

function SessionDetail({ session, onDisconnect }: { session: WcSession; onDisconnect: () => void }) {
  const c = copyWc.apps;
  const meta = session.peer.metadata;
  const detail = useQuery({
    queryKey: ['dapp-session', session.topic],
    queryFn: () => api.dappSessions.get(session.topic),
    retry: false,
  });
  const account = sessionAccount(session);
  const recorded = detail.data?.session;
  return (
    <div className="kl-stack" data-testid="wc-session-detail">
      <DappIdentityRow
        name={meta.name}
        url={meta.url}
        iconUrl={meta.icons?.[0]}
        verification={recorded ? verificationOf(recorded.verify, recorded.url) : 'unverified'}
        copy={copyWc.identity}
      />
      <DappPermissionsList copy={copyWc.proposal.permissions} />
      <Panel
        rows={[
          { label: c.network, value: copyWc.proposal.networkValue },
          ...(account
            ? [{ label: c.account, value: <Address value={account} explorerUrl={addressUrl(account)} /> }]
            : []),
          ...(recorded ? [{ label: c.connectedSince(''), value: formatRelative(recorded.createdAt) }] : []),
          ...(recorded?.lastRequestAt
            ? [{ label: c.lastRequest, value: formatRelative(recorded.lastRequestAt) }]
            : []),
        ]}
      />
      <Button variant="secondary" full onClick={onDisconnect} data-testid="wc-disconnect">
        {c.disconnect}
      </Button>
      <div className="kl-section">
        <h3 className="kl-section__title">{c.activity}</h3>
      </div>
      {detail.isPending ? (
        <Skeleton kind="row" count={2} />
      ) : !detail.data || detail.data.requests.length === 0 ? (
        <p className="m-0 text-14 text-ink-3">{c.activityEmpty}</p>
      ) : (
        <ul className="kl-list">
          {detail.data.requests.slice(0, 20).map((r) => (
            <StatementRow
              key={r.id}
              label={shortActivity(r.method, r.summary)}
              // WC-22: colour on the status word only, never on the row.
              meta={
                <>
                  {formatRelative(r.at)} ·{' '}
                  <span
                    className={
                      r.outcome === 'approved'
                        ? 'text-ok'
                        : r.outcome === 'expired'
                          ? 'text-pending'
                          : 'text-danger'
                    }
                  >
                    {c.outcome[r.outcome]}
                  </span>
                </>
              }
              chevron={false}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DisconnectConfirm({
  session,
  onKeep,
  onDone,
}: {
  session: WcSession;
  onKeep: () => void;
  onDone: () => void;
}) {
  const wc = useWc();
  const c = copyWc.apps;
  const name = session.peer.metadata.name;
  const disconnect = useMutation({
    mutationFn: () => wc?.disconnect(session.topic) ?? Promise.resolve(),
    onSuccess: () => setTimeout(onDone, 1_200),
  });
  return (
    <div className="kl-stack" data-testid="wc-disconnect-confirm">
      <p className="m-0 text-14 text-ink-2">{c.disconnectBody}</p>
      {disconnect.isSuccess ? (
        <Note tone="ok">{c.disconnected(name)}</Note>
      ) : (
        <>
          <Button
            variant="danger"
            full
            loading={disconnect.isPending}
            onClick={() => disconnect.mutate()}
            data-testid="wc-disconnect-yes"
          >
            {c.disconnectYes}
          </Button>
          <Button variant="ghost" full onClick={onKeep} disabled={disconnect.isPending}>
            {c.keep}
          </Button>
        </>
      )}
    </div>
  );
}

/** W13 — requests waiting for an answer (arrived while the person was elsewhere, or set aside). */
export function RequestInbox() {
  const wc = useWc();
  if (!wc || wc.waiting.length === 0) return null;
  return (
    <section className="kl-stack" data-testid="wc-inbox">
      <div className="kl-section">
        <h2 className="kl-section__title">{copyWc.inbox.title}</h2>
      </div>
      <ul className="kl-list">
        {wc.waiting.map((r) => (
          <InboxRow key={r.ref.id} request={r} onOpen={() => wc.open(r.ref.id)} />
        ))}
      </ul>
    </section>
  );
}

function kindWord(r: RequestView): string {
  const k = copyWc.inbox.kinds;
  switch (r.classified.kind) {
    case 'transaction':
      return k.tx;
    case 'batch':
      return k.batch;
    case 'typed-data':
      return k.typed;
    case 'message':
      return r.classified.text && /wants you to sign in with your Ethereum account/.test(r.classified.text)
        ? k.signIn
        : k.message;
    default:
      return k.message;
  }
}

function InboxRow({ request: r, onOpen }: { request: RequestView; onOpen: () => void }) {
  const i = copyWc.inbox;
  return (
    <li
      className="kl2-inbox-row flex items-center gap-3 border-b border-line py-3"
      data-testid="wc-inbox-item"
    >
      <div className="min-w-0 flex-1">
        <DappIdentityRow
          name={r.app.name}
          url={r.app.url}
          iconUrl={r.app.icon}
          verification={r.app.verification}
          copy={copyWc.identity}
          compact
        />
        <p className="m-0 mt-1 text-14 font-semibold">{i.alertTitle(r.app.name)}</p>
        <p className="m-0 flex items-center gap-1 text-12 text-ink-3">
          {r.expired ? (
            <>
              <Clock size={14} aria-hidden="true" />
              {i.expired}
            </>
          ) : (
            `${kindWord(r)} · ${formatClock(r.receivedAt)}`
          )}
        </p>
      </div>
      <button type="button" className="kl2-textbtn" onClick={onOpen}>
        {i.open}
      </button>
    </li>
  );
}

/** Empty state used by /dapps when the profile has no wallet yet. */
export function NoWalletForApps() {
  return <EmptyState title={copyWc.proposal.needsWallet} />;
}
