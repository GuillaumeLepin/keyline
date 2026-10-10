'use client';

import type { Guardian, PolicyDecision } from '@keyline/shared';
import {
  ActionButton,
  Address,
  Button,
  DrawnCheck,
  EmergencyCard,
  ErrorState,
  formatInteger,
  haptic,
  KeyCard,
  Note,
  Panel,
  PolicyLine,
  ProtectionRing,
  RadioCard,
  Sheet,
  SimulatedBadge,
  Skeleton,
  StackView,
  Stepper,
} from '@keyline/ui';
import { ArrowSquareOut, CheckCircle, Key } from '@phosphor-icons/react/dist/ssr';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { type Address as Addr, getAddress, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { copy, copyV2 } from '@/src/copy';
import { env } from '@/src/env';
import { api, hasOnboardingToken, isApiError } from '@/src/lib/api';
import {
  addressUrl,
  buildOpFromDecision,
  PasskeyCancelledError,
  pollUserOp,
  signAttestation,
  sponsorSignAndSend,
  txUrl,
} from '@/src/lib/chain';
import { getDeviceLabel } from '@/src/lib/device';
import { forgetClaim, handoffFirstName } from '@/src/lib/handoff';
import { useLocalWallet } from '@/src/lib/hooks';
import {
  localWalletFromLogin,
  loginWithPasskey,
  PasskeyUnsupportedError,
  registerPasskey,
} from '@/src/lib/passkey';
import type { LocalWallet } from '@/src/lib/storage';

const TOTAL = 6;

/**
 * Onboarding v2 (SPEC §10 F1). Before a wallet exists: "Hi Lea" (from the Swissquote handoff) → the phone key. Then
 * the persisted steps 2–6 (Safety key confirmed on the laptop, Emergency card, recovery mode, Protect, proof) and
 * "Move your first funds". Screens change through `StackView` (one spring, header stays).
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { wallet, save, patch } = useLocalWallet();
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [greeted, setGreeted] = useState(false);
  useEffect(() => setName(handoffFirstName()), []);
  const finished = wallet !== undefined && wallet !== null && wallet.onboardingStep > TOTAL;
  useEffect(() => {
    if (finished) router.replace('/');
  }, [finished, router]);
  // Direction of the last move, for the stack transition (forward unless the step went down).
  const last = useRef(0);
  if (wallet === undefined || name === undefined || finished) {
    return (
      <>
        <Skeleton kind="line" count={2} />
        <Skeleton kind="block" />
      </>
    );
  }
  const go = (next: number, extra: Partial<LocalWallet> = {}) => patch({ ...extra, onboardingStep: next });
  const handoff = name !== null;

  let key: string;
  let body: ReactNode;
  if (!wallet) {
    if (handoff && !greeted) {
      key = 'hi';
      body = <Hi name={name} onNext={() => setGreeted(true)} />;
    } else {
      key = 'key';
      body = handoff ? <KeyStep onCreated={save} /> : <Step1 onCreated={save} />;
    }
  } else {
    const step = Math.min(wallet.onboardingStep, TOTAL);
    key = `s${step}${step === 6 && wallet.attested ? '-funds' : ''}`;
    switch (step) {
      case 2:
        body = (
          <SafetyKeyStep wallet={wallet} onNext={(g) => go(3, g ? { guardians: { safetyKey: g } } : {})} />
        );
        break;
      case 3:
        body = <Step3 wallet={wallet} onNext={(addr) => go(4, { guardians: { emergencyCard: addr } })} />;
        break;
      case 4:
        body = <Step4 wallet={wallet} onNext={() => go(5, { recoveryMode: 'default' })} />;
        break;
      case 5:
        body = (
          <ProtectStep
            wallet={wallet}
            onProtected={(tx, sq) =>
              patch({ status: 'deployed', protectTxHash: tx, guardians: sq ? { swissquote: sq } : {} })
            }
            onNext={() => go(6)}
          />
        );
        break;
      default:
        body = wallet.attested ? (
          <FirstFunds
            onHome={() => {
              forgetClaim();
              patch({ onboardingStep: TOTAL + 1 });
              router.push('/');
            }}
          />
        ) : (
          <Step6
            wallet={wallet}
            onDone={(attested) => patch(attested ? { attested } : { onboardingStep: TOTAL + 1 })}
          />
        );
    }
  }
  const order = ['hi', 'key', 's2', 's3', 's4', 's5', 's6', 's6-funds'].indexOf(key);
  const direction: 1 | -1 = order >= last.current ? 1 : -1;
  last.current = order;

  return (
    <div className="-mx-4 -mt-6 -mb-8 flex min-h-[calc(100dvh-40px)] flex-1 flex-col md:min-h-0">
      <StackView screenKey={key} direction={direction} title={copy.brand} className="flex-1">
        <div className="flex min-h-full flex-col gap-6 px-4 pt-6 pb-8">{body}</div>
      </StackView>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* C1 · Hi Lea (the client comes from the Swissquote web session through the handoff; no form)                    */
/* ------------------------------------------------------------------------------------------------------------ */

function Hi({ name, onNext }: { name: string; onNext: () => void }) {
  const s = copyV2.onboarding.hi;
  return (
    <>
      <div className="grid justify-items-start gap-6 pt-8">
        <ProtectionRing state="empty" size={64} />
        <div className="kl-stack">
          <h1 className="kl-title" data-testid="hi-title">
            {s.title(name)}
          </h1>
          <p className="kl-lead">{s.body}</p>
        </div>
      </div>
      <div className="kl-actions">
        <ActionButton full label={s.primary} onClick={onNext} data-testid="hi-continue" />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* C2 · A key that stays on this phone (passkey; the bank binds it to the client with X-Onboarding-Token)        */
/* ------------------------------------------------------------------------------------------------------------ */

function KeyStep({ onCreated }: { onCreated: (wallet: LocalWallet) => void }) {
  const s = copyV2.onboarding.key;
  const s1 = copy.onboarding.s1;
  const create = useMutation({
    mutationFn: () => createWallet(),
    onSuccess: onCreated,
  });
  const cancelled = create.error instanceof PasskeyCancelledError;
  const unsupported = create.error instanceof PasskeyUnsupportedError;
  return (
    <>
      <Stepper current={1} total={TOTAL} label={s1.step} />
      <div className="kl-stack">
        <h1 className="kl-title">{s.title}</h1>
        <p className="kl-lead">{s1.body}</p>
      </div>
      <Panel title={s1.panelTitle} rows={s1.rows.map(([label, value]) => ({ label, value }))} />
      {!hasOnboardingToken() ? <Note tone="warn">{copyV2.start.noHandoff}</Note> : null}
      {cancelled ? <Note tone="warn">{s1.cancelled}</Note> : null}
      {unsupported ? <ErrorState title={s1.unsupportedTitle} body={s1.unsupportedBody} /> : null}
      {create.error && !cancelled && !unsupported ? (
        <ApiErrorState error={create.error} body={copy.common.errorBody} onRetry={() => create.mutate()} />
      ) : null}
      <div className="kl-actions">
        <ActionButton
          full
          label={s.primary}
          status={create.isPending ? 'loading' : 'idle'}
          onClick={() => create.mutate()}
          data-testid="create-key"
        />
      </div>
    </>
  );
}

async function createWallet(): Promise<LocalWallet> {
  const passkey = await registerPasskey();
  const created = await api.wallets.create({
    pubKeyX: passkey.pubKeyX,
    pubKeyY: passkey.pubKeyY,
    credentialId: passkey.credentialId,
    deviceLabel: getDeviceLabel(),
    recoveryMode: 'default',
  });
  return {
    address: created.address,
    credentialId: passkey.credentialId,
    pubKeyX: passkey.pubKeyX,
    pubKeyY: passkey.pubKeyY,
    deviceLabel: getDeviceLabel(),
    status: 'pending',
    attested: false,
    recoveryMode: created.wallet.recoveryMode,
    guardians: {},
    onboardingStep: 2,
  };
}

/* ------------------------------------------------------------------------------------------------------------ */
/* C3 · Your laptop becomes your Safety key — the laptop confirms on Swissquote web; the phone watches it land   */
/* ------------------------------------------------------------------------------------------------------------ */

function SafetyKeyStep({ wallet, onNext }: { wallet: LocalWallet; onNext: (safetyKey?: Addr) => void }) {
  const s = copyV2.onboarding.safetyKey;
  const guardians = useQuery({
    queryKey: ['guardians', wallet.address],
    queryFn: () => api.wallets.guardians(wallet.address),
    refetchInterval: (q) => (q.state.data?.some((g) => g.kind === 'safety-key') ? false : 2_000),
    retry: false,
  });
  const found = guardians.data?.find((g) => g.kind === 'safety-key');
  const address = found ? getAddress(found.address) : (wallet.guardians.safetyKey as Addr | undefined);
  const confirmed = address !== undefined;
  return (
    <>
      <Stepper current={2} total={TOTAL} label={copy.onboarding.s2.step} />
      <div className="kl-stack">
        <h1 className="kl-title">{s.title}</h1>
        <p className="kl-lead">{s.body}</p>
      </div>
      <div data-testid={confirmed ? 'safety-key-confirmed' : 'safety-key-waiting'}>
        <KeyCard
          name={copy.onboarding.s2.keyName}
          where={copy.onboarding.s2.keyWhere}
          can={copy.onboarding.s2.keyCan}
          cannot={copy.onboarding.s2.keyCannot}
          icon={<Key size={20} aria-hidden="true" />}
          status={confirmed ? 'active' : 'pending'}
          statusWord={confirmed ? copyV2.onboarding.safetyKey.confirmed : copyV2.onboarding.safetyKey.waiting}
          action={address ? <Address value={address} explorerUrl={addressUrl(address)} /> : undefined}
        />
      </div>
      {guardians.isError ? (
        <ApiErrorState
          error={guardians.error}
          body={copy.common.errorBody}
          onRetry={() => guardians.refetch()}
        />
      ) : null}
      <div className="kl-actions">
        <ActionButton
          full
          label={copy.common.continue}
          disabled={!confirmed}
          status={confirmed ? 'idle' : 'idle'}
          onClick={() => onNext(address)}
          data-testid="safety-key-continue"
        />
        {!confirmed ? (
          <Button variant="ghost" full onClick={() => onNext()}>
            {s.skip}
          </Button>
        ) : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* C6 · Protect — one batched userOp; status line Signed → Sent → In block; the ring draws on the receipt          */
/* ------------------------------------------------------------------------------------------------------------ */

type ProtectRun =
  | { kind: 'idle' }
  | { kind: 'working'; label: 'preparing' | 'signed' | 'sent' }
  | { kind: 'included'; txHash: Hex; blockNumber?: number }
  | { kind: 'refused'; decision: PolicyDecision }
  | { kind: 'error'; error: unknown; cancelled: boolean };

function ProtectStep({
  wallet,
  onProtected,
  onNext,
}: {
  wallet: LocalWallet;
  onProtected: (txHash: Hex, swissquote?: Addr) => void;
  onNext: () => void;
}) {
  const s = copyV2.onboarding.protect;
  const already = wallet.status === 'deployed' && wallet.protectTxHash !== undefined;
  const [run, setRun] = useState<ProtectRun>(
    already ? { kind: 'included', txHash: wallet.protectTxHash as Hex } : { kind: 'idle' },
  );
  // Arcs registered so far. On the receipt they draw one after another, chained by onDrawn (never a timer).
  const [registered, setRegistered] = useState<0 | 1 | 2 | 3>(already ? 3 : 0);
  const [closed, setClosed] = useState(already);
  const [settled, setSettled] = useState(already);
  const sqRef = useRef<Addr | undefined>(wallet.guardians.swissquote as Addr | undefined);

  const start = useCallback(async () => {
    try {
      setRun({ kind: 'working', label: 'preparing' });
      try {
        const sq = await api.wallets.addGuardian(wallet.address, { kind: 'swissquote' });
        sqRef.current = getAddress(sq.address);
      } catch (error) {
        if (!(isApiError(error) && error.status === 409)) throw error;
      }
      const decision = await api.policy.evaluate({
        kind: 'protect',
        walletAddress: wallet.address,
        calls: [],
        chfValue: 0,
        recipientAddress: wallet.address,
        deviceLabel: getDeviceLabel(),
      });
      if (decision.verdict !== 'approve') {
        setRun({ kind: 'refused', decision });
        return;
      }
      const unsigned = await buildOpFromDecision(wallet, decision);
      const result = await sponsorSignAndSend({
        wallet,
        unsignedUserOp: unsigned,
        decision,
        onStage: (stage) => {
          if (stage === 'sending') setRun({ kind: 'working', label: 'signed' });
          if (stage === 'sent') setRun({ kind: 'working', label: 'sent' });
        },
      });
      setRun({ kind: 'working', label: 'sent' });
      const final = await pollUserOp(result.userOpHash, () => undefined);
      if (final.status === 'failed' || !final.txHash) {
        setRun({ kind: 'error', error: new Error(copy.activity.failedStep), cancelled: false });
        return;
      }
      onProtected(final.txHash as Hex, sqRef.current);
      setRun({ kind: 'included', txHash: final.txHash as Hex, blockNumber: final.blockNumber });
      setRegistered(1);
    } catch (error) {
      setRun({ kind: 'error', error, cancelled: error instanceof PasskeyCancelledError });
    }
  }, [wallet, onProtected]);

  const onDrawn = useCallback((i: number) => {
    if (i === 0) setRegistered(2);
    else if (i === 1) setRegistered(3);
    else if (i === 2) setClosed(true);
  }, []);
  useEffect(() => {
    if (!closed || settled) return;
    haptic('success');
    const t = setTimeout(() => setSettled(true), 1_200);
    return () => clearTimeout(t);
  }, [closed, settled]);

  const working = run.kind === 'working' || (run.kind === 'included' && !closed);
  const statusLine =
    run.kind === 'working'
      ? run.label === 'sent'
        ? s.sent
        : run.label === 'signed'
          ? s.signed
          : s.fee
      : run.kind === 'included'
        ? s.block(run.blockNumber ? formatInteger(run.blockNumber) : '…')
        : s.fee;

  return (
    <>
      <Stepper current={5} total={TOTAL} label={copy.onboarding.s5.step} />
      <div className="kl-stack">
        <h1 className="kl-title" data-testid="protect-title">
          {closed ? s.titleDone : s.title}
        </h1>
        <p className="kl-lead">{closed ? s.bodyDone : s.body}</p>
      </div>
      <div
        className="grid place-items-center py-2"
        data-testid="protect-ring"
        data-registered={registered}
        data-closed={closed}
      >
        <ProtectionRing
          state={closed ? 'protected' : registered === 0 ? 'empty' : 'registering'}
          registered={registered}
          size={200}
          onDrawn={onDrawn}
        >
          {closed ? (
            <DrawnCheck size={40} />
          ) : (
            <>
              <span className="text-28 font-semibold">{s.ringCount(registered)}</span>
              <span className="text-12 text-ink-3">{s.ringSub}</span>
            </>
          )}
        </ProtectionRing>
      </div>
      <ul className="m-0 list-none p-0">
        {s.rows.map((r, i) => {
          const state = i < registered ? 'added' : working && i === registered ? 'adding' : 'waiting';
          return (
            <li
              key={r.name}
              className="flex min-h-14 items-center justify-between gap-4 border-b border-line py-2"
            >
              <span className="grid">
                <span className="text-16">{r.name}</span>
                <span className="text-12 text-ink-3">{r.where}</span>
              </span>
              <span
                className={`flex items-center gap-2 text-14 ${state === 'added' ? 'text-ok' : state === 'adding' ? 'font-semibold text-ink' : 'text-ink-3'}`}
              >
                {state === 'added' ? (
                  <CheckCircle size={16} aria-hidden="true" />
                ) : (
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${state === 'adding' ? 'bg-accent' : 'bg-line-strong'}`}
                    aria-hidden="true"
                  />
                )}
                {state === 'added' ? s.added : state === 'adding' ? s.adding : s.waiting}
              </span>
            </li>
          );
        })}
      </ul>
      {run.kind === 'refused' ? <PolicyLine verdict="block" reason={copy.common.policyRefused} /> : null}
      {run.kind === 'error' && run.cancelled ? <Note tone="warn">{copy.review.passkeyCancelled}</Note> : null}
      {run.kind === 'error' && !run.cancelled ? (
        <ApiErrorState error={run.error} title={s.errorTitle} body={s.errorBody} onRetry={start} />
      ) : null}
      <div className="kl-actions">
        <ActionButton
          full
          label={settled ? copy.common.continue : s.primary}
          successLabel={s.titleDone}
          status={closed && !settled ? 'success' : working ? 'loading' : 'idle'}
          onClick={
            settled
              ? onNext
              : run.kind === 'idle' || run.kind === 'error' || run.kind === 'refused'
                ? start
                : undefined
          }
          data-testid="protect-primary"
        />
        <p className="m-0 text-center text-12 text-ink-3" data-testid="protect-status" aria-live="polite">
          {run.kind === 'included' ? (
            <a
              className="kl2-link inline-flex items-center gap-1"
              href={txUrl(run.txHash)}
              target="_blank"
              rel="noreferrer"
              aria-label={`${statusLine} · ${copy.common.viewOnBasescan}`}
            >
              {statusLine}
              <ArrowSquareOut size={12} aria-hidden="true" />
            </a>
          ) : (
            statusLine
          )}
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* After the proof · Move your first funds (it happens on the laptop's Swissquote page)                          */
/* ------------------------------------------------------------------------------------------------------------ */

function FirstFunds({ onHome }: { onHome: () => void }) {
  const s = copyV2.onboarding.firstFunds;
  return (
    <>
      <div className="grid justify-items-start gap-6 pt-4">
        <ProtectionRing state="protected" size={64} />
        <div className="kl-stack">
          <h1 className="kl-title">{s.title}</h1>
          <p className="kl-lead">{s.body}</p>
        </div>
      </div>
      <div className="kl-actions">
        <ActionButton full label={s.primary} onClick={onHome} data-testid="first-funds-home" />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Step 1 · Create your Keyline                                                                                  */
/* ------------------------------------------------------------------------------------------------------------ */

function Step1({ onCreated }: { onCreated: (wallet: LocalWallet) => void }) {
  const router = useRouter();
  const s = copy.onboarding.s1;
  const create = useMutation({
    mutationFn: async (): Promise<LocalWallet> => {
      const passkey = await registerPasskey();
      const created = await api.wallets.create({
        pubKeyX: passkey.pubKeyX,
        pubKeyY: passkey.pubKeyY,
        credentialId: passkey.credentialId,
        deviceLabel: getDeviceLabel(),
        recoveryMode: 'default',
      });
      return {
        address: created.address,
        credentialId: passkey.credentialId,
        pubKeyX: passkey.pubKeyX,
        pubKeyY: passkey.pubKeyY,
        deviceLabel: getDeviceLabel(),
        status: 'pending',
        attested: false,
        recoveryMode: created.wallet.recoveryMode,
        guardians: {},
        onboardingStep: 2,
      };
    },
    onSuccess: onCreated,
  });
  const signIn = useMutation({
    mutationFn: loginWithPasskey,
    onSuccess: (result) => {
      const local = localWalletFromLogin(result);
      if (local) {
        onCreated(local);
        if (local.onboardingStep > TOTAL) router.push('/');
      }
    },
  });
  const error = create.error ?? signIn.error;
  const cancelled = error instanceof PasskeyCancelledError;
  const unsupported = error instanceof PasskeyUnsupportedError;

  return (
    <>
      <Stepper current={1} total={TOTAL} label={s.step} />
      <div className="kl-stack">
        <h1 className="kl-title">{s.title}</h1>
        <p className="kl-lead">{s.body}</p>
      </div>
      <Panel title={s.panelTitle} rows={s.rows.map(([label, value]) => ({ label, value }))} />
      {cancelled ? <Note tone="warn">{s.cancelled}</Note> : null}
      {unsupported ? <ErrorState title={s.unsupportedTitle} body={s.unsupportedBody} /> : null}
      {error && !cancelled && !unsupported ? (
        <ApiErrorState error={error} body={copy.common.errorBody} onRetry={() => create.mutate()} />
      ) : null}
      <div className="kl-actions">
        <Button variant="primary" full loading={create.isPending} onClick={() => create.mutate()}>
          {s.primary}
        </Button>
        <Button variant="ghost" full loading={signIn.isPending} onClick={() => signIn.mutate()}>
          {s.signIn}
        </Button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Step 3 · Print your Emergency card (key generated here, shown once, dropped after registration)               */
/* ------------------------------------------------------------------------------------------------------------ */

function Step3({ wallet, onNext }: { wallet: LocalWallet; onNext: (address: Addr) => void }) {
  const s = copy.onboarding.s3;
  // Generated once per visit of this step, in the browser, with viem. Never persisted.
  const [card, setCard] = useState<{ privateKey: Hex; address: Addr } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cardKey, setCardKey] = useState(0);
  useEffect(() => {
    const privateKey = generatePrivateKey();
    setCard({ privateKey, address: privateKeyToAccount(privateKey).address });
  }, []);
  const register = useMutation({
    mutationFn: (address: Addr) =>
      api.wallets.addGuardian(wallet.address, { kind: 'emergency-card', address }),
    onSuccess: (guardian: Guardian) => {
      const address = getAddress(guardian.address);
      setCard(null); // drop the key from memory
      setConfirming(false);
      onNext(address);
    },
  });

  return (
    <>
      <Stepper current={3} total={TOTAL} label={s.step} />
      <div className="kl-stack">
        <h1 className="kl-title">{s.title}</h1>
        <p className="kl-lead">{s.body}</p>
      </div>
      {card ? (
        <EmergencyCard
          key={cardKey}
          privateKeyHex={card.privateKey}
          address={card.address}
          walletAddress={wallet.address}
          onStored={() => setConfirming(true)}
        />
      ) : (
        <Skeleton kind="block" height={220} />
      )}
      {register.isError ? (
        <ApiErrorState
          error={register.error}
          body={copy.common.errorBody}
          onRetry={() => card && register.mutate(card.address)}
        />
      ) : null}
      <Sheet
        open={confirming}
        title={s.confirmTitle}
        onClose={() => {
          setConfirming(false);
          setCardKey((k) => k + 1);
        }}
      >
        <div className="kl-stack gap-4">
          <p className="kl-lead">{s.confirmBody}</p>
          <Button
            variant="primary"
            full
            loading={register.isPending}
            onClick={() => card && register.mutate(card.address)}
          >
            {s.confirmYes}
          </Button>
          <Button
            variant="ghost"
            full
            onClick={() => {
              setConfirming(false);
              setCardKey((k) => k + 1);
            }}
          >
            {s.confirmNo}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Step 4 · Choose how recovery works                                                                            */
/* ------------------------------------------------------------------------------------------------------------ */

function Step4({ wallet, onNext }: { wallet: LocalWallet; onNext: () => void }) {
  const s = copy.onboarding.s4;
  const [mode, setMode] = useState('default');
  const setRemote = useMutation({
    mutationFn: () => api.wallets.setMode(wallet.address, { recoveryMode: 'default' }),
    onSuccess: onNext,
  });
  return (
    <>
      <Stepper current={4} total={TOTAL} label={s.step} />
      <h1 className="kl-title">{s.title}</h1>
      <div className="kl-stack">
        <RadioCard
          name="mode"
          value="default"
          checked={mode === 'default'}
          onChange={setMode}
          title={s.defaultName}
          body={s.defaultBody}
          meta={s.defaultWait}
        />
        <RadioCard
          name="mode"
          value="assisted"
          checked={mode === 'assisted'}
          onChange={setMode}
          title={s.assistedName}
          body={s.assistedBody}
          meta={
            <>
              <span>{s.assistedWait}</span>
              <span>{s.assistedUnavailable}</span>
              <SimulatedBadge label={s.assistedPartner} />
            </>
          }
          disabled
        />
      </div>
      {setRemote.isError ? (
        <ApiErrorState
          error={setRemote.error}
          body={copy.common.errorBody}
          onRetry={() => setRemote.mutate()}
        />
      ) : null}
      <div className="kl-actions">
        <Button variant="primary" full loading={setRemote.isPending} onClick={() => setRemote.mutate()}>
          {copy.common.continue}
        </Button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Step 6 · Prove ownership to Swissquote (EIP-712 attestation through the Safe, ERC-1271)                      */
/* ------------------------------------------------------------------------------------------------------------ */

function Step6({ wallet, onDone }: { wallet: LocalWallet; onDone: (attested: boolean) => void }) {
  const s = copy.onboarding.s6;
  const [cancelled, setCancelled] = useState(false);
  const sign = useMutation({
    mutationFn: async () => {
      const challenge = await api.attestations.challenge(wallet.address);
      const clientId = challenge.typedData.message.clientId;
      const signature = await signAttestation(wallet, { clientId, nonce: challenge.nonce });
      return api.attestations.submit({ wallet: wallet.address, clientId, nonce: challenge.nonce, signature });
    },
    onError: (error) => setCancelled(error instanceof PasskeyCancelledError),
  });

  if (sign.isSuccess) {
    return (
      <>
        <Stepper current={6} total={TOTAL} label={s.step} />
        <div className="kl-stack">
          <h1 className="kl-title">{s.doneTitle}</h1>
          <p className="kl-lead">{s.doneBody}</p>
        </div>
        <Panel
          rows={[
            {
              label: s.rows.wallet,
              value: <Address value={wallet.address} explorerUrl={addressUrl(wallet.address)} />,
            },
            {
              label: s.rows.client,
              value: (
                <>
                  {sign.data.attestation.clientId} <SimulatedBadge />
                </>
              ),
            },
            { label: s.rows.validFor, value: copy.security.swissquote.name },
          ]}
        />
        <div className="kl-actions">
          <Button variant="primary" full onClick={() => onDone(true)}>
            {s.goHome}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Stepper current={6} total={TOTAL} label={s.step} />
      <div className="kl-stack">
        <h1 className="kl-title">{s.title}</h1>
        <p className="kl-lead">{s.body}</p>
      </div>
      <Panel
        rows={[
          {
            label: s.rows.wallet,
            value: <Address value={wallet.address} explorerUrl={addressUrl(wallet.address)} />,
          },
          {
            label: s.rows.client,
            value: (
              <>
                {env.clientId} <SimulatedBadge />
              </>
            ),
          },
          { label: s.rows.validFor, value: copy.security.swissquote.name },
        ]}
      />
      {cancelled ? <Note tone="warn">{copy.review.passkeyCancelled}</Note> : null}
      {sign.isError && !cancelled ? (
        <ApiErrorState error={sign.error} body={copy.common.errorBody} onRetry={() => sign.mutate()} />
      ) : null}
      <div className="kl-actions">
        <Button variant="primary" full loading={sign.isPending} onClick={() => sign.mutate()}>
          {s.primary}
        </Button>
        {sign.isError && isApiError(sign.error) && sign.error.notImplemented ? (
          <Button variant="ghost" full onClick={() => onDone(false)}>
            {copy.onboarding.s6.skip}
          </Button>
        ) : null}
      </div>
    </>
  );
}
