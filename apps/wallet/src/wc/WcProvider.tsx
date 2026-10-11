'use client';

// SPEC §11 — WalletConnect for the client route group: one WalletKit per profile, its listeners, the sessions, the
// connection request and the request inbox. Sign / refusal requests open a sheet (RequestHost); transactions open
// /send/review with the request attached (the same review, sponsor and passkey flow as an in-app transfer).
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Address, getAddress } from 'viem';
import { api, isApiError } from '../lib/api';
import { PENDING_SEND_EVENT, pendingSendStore, walletStore } from '../lib/storage';
import {
  type DappInfo,
  type ProposalView,
  type RequestView,
  WcContext,
  type WcContextValue,
  type WcProposalEvent,
  type WcSession,
} from './context';
import {
  classify,
  hostOf,
  RPC_ERRORS,
  summaryOf,
  verificationOf,
  WC_CHAIN,
  WC_EVENTS,
  WC_METHODS,
} from './requests';
import { callsStatus, logRequest, respondError, respondResult } from './respond';
import { getWalletKit, reownProjectId, type WalletKit, type WalletKitTypes } from './walletkit';

type Verified = { validation?: string; isScam?: boolean | null; origin?: string; verifyUrl?: string };

function dappFromMetadata(
  meta: { name?: string; url?: string; icons?: string[] } | undefined,
  verified: Verified | undefined,
): DappInfo {
  const url = meta?.url ?? verified?.origin ?? '';
  return {
    name: meta?.name?.trim() || hostOf(url) || 'App',
    url,
    icon: meta?.icons?.[0],
    verification: verificationOf(verified, url),
    origin: verified?.origin,
  };
}

function verifyBody(v: Verified | undefined, url: string) {
  return {
    validation: (v?.validation === 'VALID' || v?.validation === 'INVALID' ? v.validation : 'UNKNOWN') as
      | 'VALID'
      | 'INVALID'
      | 'UNKNOWN',
    isScam: Boolean(v?.isScam),
    origin: v?.origin || url || 'unknown',
    ...(v?.verifyUrl ? { verifyUrl: v.verifyUrl } : {}),
  };
}

function deployedSafe(): Address | null {
  const w = walletStore.get();
  return w && w.status === 'deployed' ? getAddress(w.address) : null;
}

export function WcProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<WcContextValue['status']>('off');
  const [error, setError] = useState<unknown>();
  const [sessions, setSessions] = useState<WcSession[]>([]);
  const [proposal, setProposal] = useState<ProposalView | null>(null);
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const kitRef = useRef<WalletKit | null>(null);
  const requestsRef = useRef<RequestView[]>([]);
  requestsRef.current = requests;
  const activeRef = useRef<number | null>(null);
  activeRef.current = activeId;

  const refreshSessions = useCallback(() => {
    const kit = kitRef.current;
    if (kit) setSessions(Object.values(kit.getActiveSessions()));
  }, []);

  const upsert = useCallback((view: RequestView) => {
    setRequests((list) => [...list.filter((r) => r.ref.id !== view.ref.id), view]);
  }, []);

  /** Open a request: a transaction goes to /send/review with the request attached; anything else opens its sheet. */
  const open = useCallback(
    (id: number) => {
      const r = requestsRef.current.find((x) => x.ref.id === id);
      if (!r) return;
      const c = r.classified;
      if ((c.kind === 'transaction' || c.kind === 'batch') && !r.expired) {
        const first = c.calls[0];
        if (!first) return;
        pendingSendStore.set({
          to: first.to,
          toLabel: r.app.name,
          knownContact: false,
          amountChf: 0,
          amountUsdc: 0,
          dapp: {
            id: r.ref.topic,
            name: r.app.name,
            description: summaryOf(c, r.app.name),
            calls: c.calls.map((x) => ({ to: x.to, value: x.value, data: x.data })),
            wc: {
              topic: r.ref.topic,
              requestId: r.ref.id,
              method: c.kind === 'batch' ? 'wallet_sendCalls' : 'eth_sendTransaction',
              url: r.app.url,
              icon: r.app.icon,
              verification: r.app.verification,
              origin: r.app.origin,
            },
          },
        });
        setActiveId(null);
        // Already on /send/review (another request): the page re-reads the draft on this event and remounts.
        window.dispatchEvent(new Event(PENDING_SEND_EVENT));
        router.push(`/send/review?wc=${id}`);
        return;
      }
      setActiveId(id);
    },
    [router],
  );

  const onRequest = useCallback(
    async (ev: WalletKitTypes.SessionRequest) => {
      const kit = kitRef.current;
      if (!kit) return;
      const { topic, id, params, verifyContext } = ev;
      const { request } = params;
      const ref = { topic, id, method: request.method };
      const session = kit.getActiveSessions()[topic];
      const app = dappFromMetadata(session?.peer.metadata, verifyContext?.verified);
      const safe = deployedSafe();
      if (!safe) {
        await respondError(ref, {
          code: RPC_ERRORS.blocked,
          message: 'Keyline: the wallet is not protected yet.',
        });
        logRequest(ref, `${request.method}: wallet not protected yet`, 'failed');
        return;
      }
      const classified = classify(request.method, request.params, safe);
      // Read-only queries are answered at once, without a sheet.
      if (classified.kind === 'instant') {
        await respondResult(ref, classified.result);
        return;
      }
      if (classified.kind === 'calls-status') {
        try {
          await respondResult(ref, await callsStatus(classified.id));
        } catch (e) {
          await respondError(ref, {
            code: RPC_ERRORS.internal,
            message: e instanceof Error ? e.message : 'status',
          });
        }
        return;
      }
      const expiry = (request as { expiryTimestamp?: number }).expiryTimestamp;
      let answered = false;
      // Refusals are answered immediately (the app must not hang); the sheet only explains what happened.
      if (classified.kind === 'switch-chain') {
        await respondError(ref, {
          code: RPC_ERRORS.unsupportedChain,
          message: `Keyline works on Base Sepolia (${WC_CHAIN}) only; chain ${classified.chainId} is not supported.`,
        });
        logRequest(ref, summaryOf(classified, app.name), 'declined');
        answered = true;
      } else if (classified.kind === 'unsupported' || classified.kind === 'invalid') {
        const { getSdkError } = await import('@walletconnect/utils');
        const sdk = getSdkError('UNSUPPORTED_METHODS');
        await respondError(ref, {
          code: classified.kind === 'invalid' ? RPC_ERRORS.invalidParams : sdk.code,
          message:
            classified.kind === 'invalid'
              ? `Keyline could not read ${classified.method}: ${classified.reason}`
              : `Keyline does not support ${classified.method}.`,
        });
        logRequest(ref, summaryOf(classified, app.name), 'declined');
        answered = true;
      }
      const view: RequestView = {
        ref,
        app,
        classified,
        params: request.params,
        receivedAt: Date.now(),
        expiresAt: expiry ? expiry * 1000 : undefined,
        expired: false,
        answered,
      };
      upsert(view);
      // Open it unless another request is still waiting for an answer in its sheet; a sheet that only shows a
      // finished result (signed, refused, expired) gives way to the new request.
      const current = requestsRef.current.find((r) => r.ref.id === activeRef.current);
      const busy = current !== undefined && !current.settled && !current.answered && !current.expired;
      if (!busy) {
        // Let state settle before opening (open() reads the ref).
        requestsRef.current = [
          ...requestsRef.current.filter((r) => r.ref.id !== id && r.ref.id !== activeRef.current),
          view,
        ];
        if (current) setRequests((list) => list.filter((r) => r.ref.id !== current.ref.id));
        open(id);
      }
    },
    [open, upsert],
  );

  const onProposal = useCallback(async (p: WcProposalEvent) => {
    const meta = p.params.proposer.metadata;
    const verified = p.verifyContext?.verified as Verified | undefined;
    const app = dappFromMetadata(meta, verified);
    const safe = deployedSafe();
    let verdict: 'allow' | 'block' = app.verification === 'flagged' ? 'block' : 'allow';
    let reasons: string[] = verdict === 'block' ? ["This app's identity could not be verified"] : [];
    let allowlisted = false;
    if (safe) {
      try {
        const res = await api.dappSessions.propose({
          topic: p.params.pairingTopic,
          walletAddress: safe,
          name: app.name.slice(0, 200),
          url: (meta.url || app.url || 'unknown').slice(0, 500),
          icons: (meta.icons ?? []).slice(0, 10),
          ...(meta.description ? { description: meta.description.slice(0, 1000) } : {}),
          verify: verifyBody(verified, meta.url),
        });
        verdict = res.verdict;
        reasons = res.reasons;
        allowlisted = res.session.allowlisted;
      } catch (e) {
        // Bank unreachable: keep the local Verify verdict (flagged stays blocked), never upgrade to allowed-verified.
        if (!isApiError(e)) throw e;
      }
    }
    setProposal({ raw: p, app, verdict, reasons, allowlisted, state: 'review' });
    if (verdict === 'block') {
      // SPEC §11.3: a flagged proposal shows no Connect button and is refused with the reason.
      const kit = kitRef.current;
      await kit
        ?.rejectSession({ id: p.id, reason: { code: 5000, message: reasons[0] ?? 'Identity not verified' } })
        .catch(() => undefined);
      api.dappSessions.refuse(p.params.pairingTopic).catch(() => undefined);
      setProposal((cur) => (cur && cur.raw.id === p.id ? { ...cur, state: 'refused' } : cur));
    }
  }, []);

  const start = useCallback(() => {
    if (kitRef.current || status === 'starting' || !reownProjectId()) return;
    setStatus('starting');
    getWalletKit()
      .then((kit) => {
        if (kitRef.current) return;
        kitRef.current = kit;
        kit.on('session_proposal', (p) => {
          onProposal(p).catch((e) => setError(e));
        });
        kit.on('session_request', (ev) => {
          onRequest(ev).catch((e) => setError(e));
        });
        kit.on('session_delete', ({ topic }) => {
          api.dappSessions.disconnect(topic).catch(() => undefined);
          setRequests((list) => list.filter((r) => r.ref.topic !== topic));
          refreshSessions();
        });
        kit.on('proposal_expire', ({ id }) => {
          setProposal((cur) =>
            cur && cur.raw.id === id && cur.state === 'review' ? { ...cur, state: 'expired' } : cur,
          );
        });
        kit.on('session_request_expire', ({ id }) => {
          setRequests((list) =>
            list.map((r) => {
              if (r.ref.id !== id || r.expired) return r;
              logRequest(r.ref, summaryOf(r.classified, r.app.name), 'expired');
              return { ...r, expired: true };
            }),
          );
        });
        // Requests that arrived while this page was closed: back into the inbox (opening one resumes it).
        const safe = deployedSafe();
        const pending = kit.getPendingSessionRequests();
        const restored: RequestView[] = [];
        for (const ev of pending) {
          const session = kit.getActiveSessions()[ev.topic];
          if (!session || !safe) continue;
          const c = classify(ev.params.request.method, ev.params.request.params, safe);
          if (c.kind === 'instant' || c.kind === 'calls-status') {
            onRequest(ev as WalletKitTypes.SessionRequest).catch(() => undefined);
            continue;
          }
          const expiry = (ev.params.request as { expiryTimestamp?: number }).expiryTimestamp;
          restored.push({
            ref: { topic: ev.topic, id: ev.id, method: ev.params.request.method },
            app: dappFromMetadata(session.peer.metadata, ev.verifyContext?.verified as Verified | undefined),
            classified: c,
            params: ev.params.request.params,
            receivedAt: Date.now(),
            expiresAt: expiry ? expiry * 1000 : undefined,
            expired: expiry ? expiry * 1000 < Date.now() : false,
            answered: false,
          });
        }
        setRequests(restored);
        refreshSessions();
        setStatus('ready');
      })
      .catch((e) => {
        setError(e);
        setStatus('error');
      });
  }, [status, onProposal, onRequest, refreshSessions]);

  // Start the relay client once this profile has a wallet (sessions persist, so a reload reconnects them).
  useEffect(() => {
    if (walletStore.get()) start();
  }, [start]);

  // Expiry by clock as well as by event (the event needs the relay; the clock doesn't).
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setRequests((list) =>
        list.some((r) => !r.expired && r.expiresAt !== undefined && r.expiresAt < now)
          ? list.map((r) =>
              !r.expired && r.expiresAt !== undefined && r.expiresAt < now ? { ...r, expired: true } : r,
            )
          : list,
      );
    }, 1_000);
    return () => clearInterval(t);
  }, []);

  const pair = useCallback(
    async (uri: string) => {
      const kit = kitRef.current ?? (await getWalletKit());
      if (!kitRef.current) start();
      await kit.pair({ uri: uri.trim() });
    },
    [start],
  );

  const approveProposal = useCallback(async () => {
    const kit = kitRef.current;
    const p = proposal;
    const safe = deployedSafe();
    if (!kit || !p || !safe || p.verdict === 'block') return;
    setProposal({ ...p, state: 'connecting' });
    try {
      const { buildApprovedNamespaces } = await import('@walletconnect/utils');
      const namespaces = buildApprovedNamespaces({
        proposal: p.raw.params,
        supportedNamespaces: {
          eip155: {
            chains: [WC_CHAIN],
            methods: [...WC_METHODS],
            events: [...WC_EVENTS],
            accounts: [`${WC_CHAIN}:${safe}`],
          },
        },
      });
      const session = await kit.approveSession({ id: p.raw.id, namespaces });
      const meta = p.raw.params.proposer.metadata;
      // The session topic is what requests and the policy refer to: record it, then mark it approved.
      await api.dappSessions
        .propose({
          topic: session.topic,
          walletAddress: safe,
          name: p.app.name.slice(0, 200),
          url: (meta.url || p.app.url || 'unknown').slice(0, 500),
          icons: (meta.icons ?? []).slice(0, 10),
          ...(meta.description ? { description: meta.description.slice(0, 1000) } : {}),
          verify: verifyBody(p.raw.verifyContext?.verified as Verified | undefined, meta.url),
        })
        .then(() => api.dappSessions.approve(session.topic))
        .catch(() => undefined);
      setProposal({ ...p, state: 'connected' });
      refreshSessions();
    } catch (e) {
      // e.g. the app requires a chain other than Base Sepolia: tell it no, show why.
      const { getSdkError } = await import('@walletconnect/utils');
      await kit
        .rejectSession({ id: p.raw.id, reason: getSdkError('UNSUPPORTED_CHAINS') })
        .catch(() => undefined);
      setProposal({ ...p, state: 'error', error: e });
    }
  }, [proposal, refreshSessions]);

  const rejectProposal = useCallback(async () => {
    const kit = kitRef.current;
    const p = proposal;
    if (!kit || !p) return;
    const { getSdkError } = await import('@walletconnect/utils');
    await kit.rejectSession({ id: p.raw.id, reason: getSdkError('USER_REJECTED') }).catch(() => undefined);
    api.dappSessions.refuse(p.raw.params.pairingTopic).catch(() => undefined);
    setProposal(null);
  }, [proposal]);

  const disconnect = useCallback(
    async (topic: string) => {
      const kit = kitRef.current;
      if (!kit) return;
      const { getSdkError } = await import('@walletconnect/utils');
      await kit.disconnectSession({ topic, reason: getSdkError('USER_DISCONNECTED') });
      await api.dappSessions.disconnect(topic).catch(() => undefined);
      setRequests((list) => list.filter((r) => r.ref.topic !== topic));
      refreshSessions();
    },
    [refreshSessions],
  );

  const resolve = useCallback((id: number) => {
    setRequests((list) => list.filter((r) => r.ref.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  const value = useMemo<WcContextValue>(
    () => ({
      status,
      error,
      sessions,
      proposal,
      requests,
      activeId,
      // W13: the inbox lists what still needs an answer — not the request whose sheet is open, not answered ones.
      waiting: requests.filter((r) => !r.answered && !r.settled && r.ref.id !== activeId),
      start,
      pair,
      approveProposal,
      rejectProposal,
      dismissProposal: () => setProposal(null),
      disconnect,
      open,
      close: () => setActiveId(null),
      resolve,
      settle: (id: number) =>
        setRequests((list) => list.map((r) => (r.ref.id === id ? { ...r, settled: true } : r))),
      find: (id: number) => requests.find((r) => r.ref.id === id),
    }),
    [
      status,
      error,
      sessions,
      proposal,
      requests,
      activeId,
      start,
      pair,
      approveProposal,
      rejectProposal,
      disconnect,
      open,
      resolve,
    ],
  );

  return <WcContext.Provider value={value}>{children}</WcContext.Provider>;
}
