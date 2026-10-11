'use client';

import type { PolicyDecision } from '@keyline/shared';
// SPEC §11.4 — the connection request sheet and the sign / refusal request sheets, from packages/ui primitives
// (DESIGN.md §13, W1–W15). Transactions are not here: they open /send/review (the same review as an in-app transfer)
// with the request attached.
import { ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getAddress, type Hex, isAddress } from 'viem';
import { parseSiweMessage } from 'viem/siwe';
import { copyWc } from '../copy';
import { formatDateTime } from '../i18n/dates';
import { api } from '../lib/api';
import { getDeviceLabel } from '../lib/device';
import { addressUrl, PasskeyCancelledError } from '../lib/reads';
import { walletStore } from '../lib/storage';
import {
  Address,
  type DappIdentityRowProps,
  DappPermissionsList,
  MessageBlock,
  Note,
  Panel,
  RequestSheet,
  type RequestSheetState,
  SiweSummary,
  TypedDataRows,
  typedDataRows,
} from '../ui';
import { type DappInfo, type RequestView, useWc } from './context';
import { hostOf, summaryOf, type TypedDataPayload } from './requests';
import { logRequest, respondBlocked, respondRejected, respondResult } from './respond';
import { signatureSchemeOf, signMessageForDapp, signTypedDataForDapp } from './sign';

function identity(app: DappInfo): DappIdentityRowProps {
  return {
    name: app.name,
    url: app.url,
    iconUrl: app.icon,
    verification: app.verification,
    copy: copyWc.identity,
  };
}

const sheetCopy = () => ({
  decline: copyWc.request.decline,
  close: copyWc.request.close,
  retry: copyWc.request.retry,
  expiredTitle: copyWc.request.expiredTitle,
  expiredBody: copyWc.request.expiredBody,
});

/** Takes the pointer's focus off the result: blurs whatever button was pressed (no lingering hover/focus fill). */
function blurActive() {
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

export function WcSheets() {
  return (
    <>
      <ProposalSheet />
      <RequestHost />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Connection request (W2)
// ---------------------------------------------------------------------------------------------------------------

function ProposalSheet() {
  const wc = useWc();
  const p = wc?.proposal;
  if (!wc || !p) return null;
  const c = copyWc.proposal;
  const wallet = walletStore.get();
  const protectedWallet = wallet?.status === 'deployed';
  const blocked = p.verdict === 'block';
  const state: RequestSheetState =
    p.state === 'connected'
      ? 'success'
      : p.state === 'expired'
        ? 'expired'
        : p.state === 'refused' || blocked
          ? 'refused'
          : p.state === 'error'
            ? 'error'
            : p.state === 'connecting'
              ? 'pending'
              : 'review';
  return (
    <div data-testid="wc-proposal" data-state={state}>
      <RequestSheet
        open
        onClose={wc.dismissProposal}
        // The question goes once the answer is in (DESIGN-AUDIT WC-9).
        title={state === 'success' ? p.app.name : c.title}
        dapp={identity(p.app)}
        state={state}
        primaryLabel={blocked || !protectedWallet ? undefined : c.connect}
        onApprove={() => {
          blurActive();
          wc.approveProposal();
        }}
        onDecline={() => {
          wc.rejectProposal();
        }}
        pendingLine={copyWc.connect.pairingLine}
        successTitle={c.connectedTitle}
        successBody={c.connectedBody(p.app.name)}
        successAnnounce={c.connectedTitle}
        errorTitle={c.errorTitle}
        errorBody={c.errorBody}
        copy={{ ...sheetCopy(), decline: c.decline, close: c.close }}
      >
        <div className="kl-stack">
          {blocked ? (
            <Note tone="danger">
              <strong>{c.flaggedTitle}</strong> {c.flaggedBody}
            </Note>
          ) : !protectedWallet ? (
            <Note tone="info">{c.needsWallet}</Note>
          ) : (
            <>
              <DappPermissionsList copy={c.permissions} />
              <Panel
                rows={[
                  { label: c.network, value: c.networkValue },
                  ...(wallet
                    ? [
                        {
                          label: c.account,
                          value: <Address value={wallet.address} explorerUrl={addressUrl(wallet.address)} />,
                        },
                      ]
                    : []),
                ]}
              />
              {p.allowlisted ? (
                <span className="kl2-status kl2-status--ok">
                  <ShieldCheck size={20} weight="fill" aria-hidden="true" />
                  {c.reviewed}
                </span>
              ) : null}
              {p.app.verification === 'unverified' && !p.allowlisted ? (
                <Note tone="warn">{c.unverifiedNote}</Note>
              ) : null}
            </>
          )}
        </div>
      </RequestSheet>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Sign / refusal requests (W5–W12, W14)
// ---------------------------------------------------------------------------------------------------------------

function RequestHost() {
  const wc = useWc();
  const r = wc && wc.activeId !== null ? wc.find(wc.activeId) : undefined;
  if (!wc || !r) return null;
  return <RequestSheetFor key={r.ref.id} request={r} />;
}

type Phase = { kind: 'review' } | { kind: 'pending' } | { kind: 'done' } | { kind: 'error'; error: unknown };

function RequestSheetFor({ request: r }: { request: RequestView }) {
  const wc = useWc();
  const [phase, setPhase] = useState<Phase>({ kind: 'review' });
  const c = r.classified;
  const t = copyWc.request;
  /** Leaves the sheet; an answered request also leaves the inbox. */
  const finish = () => wc?.resolve(r.ref.id);

  // SIWE is a personal_sign whose text parses as EIP-4361.
  const siwe = c.kind === 'message' && c.text ? parseSiwe(c.text) : null;
  const scheme = useQuery({
    queryKey: ['wc-scheme', r.ref.id],
    queryFn: () => signatureSchemeOf((c as { typedData: TypedDataPayload }).typedData),
    enabled: c.kind === 'typed-data',
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  // DECISIONS #30: every signature request goes through the bank's policy first (identity, screening, SIWE domain,
  // unlimited permits → laptop). Keyline's own decode above is for display only.
  const signable = (c.kind === 'message' || c.kind === 'typed-data') && !r.answered && !r.expired;
  const policy = useQuery({
    queryKey: ['wc-sign-policy', r.ref.id],
    queryFn: () => evaluateSignature(r, siwe),
    enabled: signable,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const decision = policy.data;
  const waitingLaptop =
    decision?.verdict === 'step-up' &&
    decision.stepUp?.satisfiedBy !== 'safety-key' &&
    decision.status !== 'cancelled';
  const polled = useQuery({
    queryKey: ['policy', decision?.decisionId],
    queryFn: () => api.policy.get(decision?.decisionId as string),
    enabled: Boolean(decision) && waitingLaptop,
    refetchInterval: 2_000,
    retry: false,
  });
  const current: PolicyDecision | undefined = polled.data ?? decision;
  const laptopPending =
    current?.verdict === 'step-up' &&
    current.stepUp?.satisfiedBy !== 'safety-key' &&
    current.status !== 'cancelled';
  // SIWE for another website is a hard stop, whatever the bank says (it blocks it too).
  const siweMismatchLocal = siwe ? siwe.domain !== hostOf(r.app.url) : false;
  const blocked = current?.verdict === 'block' || siweMismatchLocal;
  const blockReason = siweMismatchLocal
    ? (current?.reasons[0] ?? t.signIn.siwe.mismatch(siwe?.domain ?? '', hostOf(r.app.url)))
    : (current?.reasons[0] ?? '');

  // A block answers the app at once: 4001 with the first reason.
  const answeredBlock = useRef(false);
  useEffect(() => {
    if (!blocked || answeredBlock.current || r.answered || r.expired) return;
    if (!current && !siweMismatchLocal) return;
    answeredBlock.current = true;
    respondBlocked(r.ref, `Blocked by Keyline: ${blockReason}`).catch(() => undefined);
    logRequest(r.ref, summaryOf(c, r.app.name), 'blocked');
    wc?.settle(r.ref.id);
  });

  const sign = useMutation({
    mutationFn: async () => {
      const wallet = walletStore.get();
      if (wallet?.status !== 'deployed') throw new Error(t.notDeployed);
      if (blocked || laptopPending || !current) throw new Error(t.errorBody);
      setPhase({ kind: 'pending' });
      let signature: Hex;
      if (c.kind === 'message') signature = await signMessageForDapp(wallet, c.hex);
      else if (c.kind === 'typed-data') signature = await signTypedDataForDapp(wallet, c.typedData);
      else throw new Error('nothing to sign');
      await respondResult(r.ref, signature);
      logRequest(r.ref, summaryOf(c, r.app.name), 'approved');
      return signature;
    },
    onSuccess: () => {
      blurActive();
      setPhase({ kind: 'done' });
      wc?.settle(r.ref.id);
    },
    onError: (error) => setPhase({ kind: 'error', error }),
  });

  const decline = async (message?: string) => {
    if (current && current.verdict === 'step-up' && current.status !== 'cancelled') {
      api.policy.cancel(current.decisionId).catch(() => undefined);
    }
    await respondRejected(r.ref, message).catch(() => undefined);
    logRequest(r.ref, summaryOf(c, r.app.name), 'declined');
    finish();
  };

  const refused = r.answered || blocked;
  const state: RequestSheetState = r.expired
    ? 'expired'
    : refused
      ? 'refused'
      : phase.kind === 'pending'
        ? 'pending'
        : phase.kind === 'done'
          ? 'success'
          : phase.kind === 'error'
            ? 'error'
            : 'review';

  const eoaOnly = c.kind === 'typed-data' && scheme.data?.kind === 'eoa-only';
  const permitFamily =
    c.kind === 'typed-data' &&
    (scheme.data?.family === 'permit2' ||
      scheme.data?.family === 'eip2612-permit' ||
      scheme.data?.family === 'dai-permit' ||
      scheme.data?.family === 'eip3009-authorization');
  const rows = c.kind === 'typed-data' ? safeRows(c.typedData) : [];
  const danger = permitFamily || rows.some((row) => row.danger);
  const cancelled = phase.kind === 'error' && phase.error instanceof PasskeyCancelledError;
  const spender =
    c.kind === 'typed-data' ? String((c.typedData.message as { spender?: unknown }).spender ?? '') : '';

  const kindCopy =
    c.kind === 'message' ? (siwe ? t.signIn : t.message) : c.kind === 'typed-data' ? t.typed : null;
  const question =
    c.kind === 'message'
      ? siwe
        ? t.signIn.title
        : t.message.title
      : c.kind === 'typed-data'
        ? permitFamily
          ? t.typed.permitTitle
          : t.typed.title
        : c.kind === 'switch-chain'
          ? t.chainSwitch.title
          : c.kind === 'invalid'
            ? t.invalid.title
            : t.unsupported.title;

  return (
    <div data-testid="wc-request" data-kind={c.kind} data-state={state}>
      <RequestSheet
        open
        onClose={() => {
          if (state === 'expired' || state === 'refused' || state === 'success') finish();
          else wc?.close();
        }}
        title={state === 'success' ? r.app.name : blocked ? t.blockedSignTitle : question}
        dapp={identity(r.app)}
        state={state}
        primaryLabel={
          refused || eoaOnly || !kindCopy
            ? undefined
            : c.kind === 'typed-data' && danger
              ? t.typed.approveDanger
              : kindCopy.approve
        }
        primaryVariant={danger ? 'danger' : 'primary'}
        primaryDisabled={(c.kind === 'typed-data' && scheme.isPending) || !current || laptopPending}
        onApprove={() => {
          blurActive();
          sign.mutate();
        }}
        onDecline={() => {
          decline();
        }}
        pendingLine={t.pendingSign}
        successTitle={kindCopy?.successTitle}
        successBody={kindCopy?.successBody}
        successAnnounce={kindCopy?.announce}
        errorTitle={t.errorTitle}
        errorBody={cancelled ? t.passkeyCancelled : errorText(phase)}
        copy={sheetCopy()}
        secondaryAction={
          eoaOnly && state === 'review' ? (
            <button
              type="button"
              className="kl-btn kl-btn--secondary kl-btn--full"
              onClick={() => {
                decline(
                  'Keyline: this token only accepts single-key (v, r, s) signatures. Ask for an approve transaction instead.',
                );
              }}
            >
              {t.eoaOnly.alternative}
            </button>
          ) : undefined
        }
      >
        {blocked ? (
          <Note tone="danger">{blockReason}</Note>
        ) : signable && policy.isPending ? (
          <p className="m-0 text-12 text-ink-3">{t.checking}</p>
        ) : laptopPending ? (
          <Note tone="warn">
            <strong>{current?.reasons[0]}</strong> {t.stepUpSign}
          </Note>
        ) : null}
        {policy.isError ? <Note tone="danger">{t.errorBody}</Note> : null}
        {c.kind === 'message' ? (
          siwe ? (
            <SiweSummary
              domain={siwe.domain ?? ''}
              address={siwe.address ?? ''}
              expiresAt={siwe.expirationTime ? formatDateTime(siwe.expirationTime) : undefined}
              issuedAt={siwe.issuedAt ? formatDateTime(siwe.issuedAt) : undefined}
              statement={siwe.statement}
              network={siwe.chainId ? t.networkName(siwe.chainId) : undefined}
              nonce={siwe.nonce}
              uri={siwe.uri}
              appHost={hostOf(r.app.url)}
              copy={t.signIn.siwe}
            />
          ) : (
            <div className="kl-stack">
              <MessageBlock text={c.text ?? undefined} hex={c.hex} copy={t.message.block} />
              <p className="m-0 text-12 text-ink-3">{t.message.noMoney}</p>
            </div>
          )
        ) : c.kind === 'typed-data' ? (
          <div className="kl-stack">
            {eoaOnly ? (
              <Note tone="warn">
                <strong>{t.eoaOnly.title}</strong> {t.eoaOnly.body} {t.eoaOnly.alternativeBody}
              </Note>
            ) : null}
            <TypedDataRows
              rows={rows}
              title={c.typedData.primaryType}
              domain={t.typed.domain(
                c.typedData.domain?.name ?? '—',
                t.networkName(Number(c.typedData.domain?.chainId ?? 84532)),
                shortAddress(c.typedData.domain?.verifyingContract),
              )}
            />
            {danger && !eoaOnly ? (
              <Note tone="danger">{t.typed.permitBody(shortAddress(spender) || r.app.name)}</Note>
            ) : null}
          </div>
        ) : c.kind === 'switch-chain' ? (
          <Note tone="info">{t.chainSwitch.body(networkOf(c.chainId))}</Note>
        ) : c.kind === 'unsupported' ? (
          <Note tone="info">{t.unsupported.body(c.method)}</Note>
        ) : c.kind === 'invalid' ? (
          <Note tone="info">{t.invalid.body(c.reason)}</Note>
        ) : null}
      </RequestSheet>
    </div>
  );
}

/** POST /policy/evaluate { kind: 'dapp-signature' } for this request (DappSignatureRequestSchema). */
function evaluateSignature(r: RequestView, siwe: ReturnType<typeof parseSiwe>): Promise<PolicyDecision> {
  const wallet = walletStore.get();
  const c = r.classified;
  if (!wallet) throw new Error(copyWc.request.notDeployed);
  const method = r.ref.method as 'personal_sign' | 'eth_signTypedData' | 'eth_signTypedData_v4';
  return api.policy.evaluate({
    kind: 'dapp-signature',
    walletAddress: wallet.address,
    topic: r.ref.topic,
    origin: r.app.origin ?? r.app.url,
    deviceLabel: getDeviceLabel(),
    calls: [],
    chfValue: 0,
    signature:
      c.kind === 'message'
        ? {
            method,
            message: c.hex,
            ...(siwe?.domain
              ? {
                  siwe: {
                    domain: siwe.domain,
                    ...(siwe.uri ? { uri: siwe.uri } : {}),
                    ...(siwe.chainId ? { chainId: siwe.chainId } : {}),
                    ...(siwe.address ? { address: siwe.address } : {}),
                  },
                }
              : {}),
          }
        : {
            method,
            typedData: (c as { typedData: TypedDataPayload }).typedData as unknown as Record<string, unknown>,
          },
  });
}

function shortAddress(value: string | undefined): string {
  if (!value || !isAddress(value)) return value ?? '';
  const a = getAddress(value);
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function networkOf(chainId: string): string {
  try {
    return copyWc.request.networkName(Number(BigInt(chainId)));
  } catch {
    return chainId || '?';
  }
}

function parseSiwe(text: string) {
  try {
    const m = parseSiweMessage(text);
    return m.domain && m.address ? m : null;
  } catch {
    return null;
  }
}

function safeRows(td: TypedDataPayload) {
  try {
    return typedDataRows(
      { types: td.types, primaryType: td.primaryType, message: td.message },
      copyWc.request.typed.rows,
    );
  } catch {
    return [];
  }
}

function errorText(phase: Phase): string {
  if (phase.kind !== 'error') return copyWc.request.errorBody;
  return phase.error instanceof Error && phase.error.message === copyWc.request.notDeployed
    ? copyWc.request.notDeployed
    : copyWc.request.errorBody;
}
