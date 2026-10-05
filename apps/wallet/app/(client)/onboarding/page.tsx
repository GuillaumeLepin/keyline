'use client';

import type { Guardian, PolicyDecision } from '@keyline/shared';
import {
  Address,
  Button,
  Disclosure,
  EmergencyCard,
  ErrorState,
  formatDuration,
  formatInteger,
  KeyCard,
  Note,
  Panel,
  PolicyLine,
  RadioCard,
  Sheet,
  SimulatedBadge,
  Skeleton,
  StatusSequence,
  type StatusStep,
  Stepper,
} from '@keyline/ui';
import { ArrowSquareOut, Bank, CheckCircle, IdentificationCard, Key } from '@phosphor-icons/react/dist/ssr';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Address as Addr, type Hex, getAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { copy, copyGaps } from '@/src/copy';
import { env } from '@/src/env';
import { api, isApiError } from '@/src/lib/api';
import {
  addressUrl,
  buildOpFromDecision,
  PasskeyCancelledError,
  pollUserOp,
  signAttestation,
  sponsorSignAndSend,
  type SubmitStage,
  txUrl,
} from '@/src/lib/chain';
import { getDeviceLabel } from '@/src/lib/device';
import { useLocalWallet } from '@/src/lib/hooks';
import { localWalletFromLogin, loginWithPasskey, PasskeyUnsupportedError, registerPasskey } from '@/src/lib/passkey';
import type { LocalWallet } from '@/src/lib/storage';

const TOTAL = 6;

export default function OnboardingPage() {
  const router = useRouter();
  const { wallet, save, patch } = useLocalWallet();
  if (wallet === undefined) {
    return (
      <>
        <Skeleton kind="line" count={2} />
        <Skeleton kind="block" />
      </>
    );
  }
  const step = wallet ? Math.min(wallet.onboardingStep, TOTAL) : 1;
  if (wallet && wallet.onboardingStep > TOTAL) {
    router.replace('/');
    return null;
  }
  const go = (next: number, extra: Partial<LocalWallet> = {}) => patch({ ...extra, onboardingStep: next });

  switch (step) {
    case 1:
      return <Step1 onCreated={save} />;
    case 2:
      return wallet ? <Step2 wallet={wallet} onNext={(g) => go(3, g ? { guardians: { safetyKey: g } } : {})} /> : null;
    case 3:
      return wallet ? <Step3 wallet={wallet} onNext={(addr) => go(4, { guardians: { emergencyCard: addr } })} /> : null;
    case 4:
      return wallet ? <Step4 wallet={wallet} onNext={() => go(5, { recoveryMode: 'default' })} /> : null;
    case 5:
      return wallet ? (
        <Step5
          wallet={wallet}
          onProtected={(tx, sq) =>
            patch({ status: 'deployed', protectTxHash: tx, guardians: sq ? { swissquote: sq } : {} })
          }
          onNext={() => go(6)}
        />
      ) : null;
    default:
      return wallet ? (
        <Step6
          wallet={wallet}
          onDone={(attested) => {
            patch({ attested, onboardingStep: TOTAL + 1 });
            router.push('/');
          }}
        />
      ) : null;
  }
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
        <ApiErrorState error={error} body={copy.onboarding.s5.errorBody} onRetry={() => create.mutate()} />
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
/* Step 2 · Add your Safety key (6-digit pairing code, polled until the laptop claims it)                        */
/* ------------------------------------------------------------------------------------------------------------ */

function Step2({ wallet, onNext }: { wallet: LocalWallet; onNext: (safetyKey?: Addr) => void }) {
  const s = copy.onboarding.s2;
  const [attempt, setAttempt] = useState(0);
  const pairing = useQuery({
    queryKey: ['pairing', wallet.address, attempt],
    queryFn: () => api.pairings.create(wallet.address),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const code = pairing.data?.code;
  const status = useQuery({
    queryKey: ['pairing-status', code],
    queryFn: () => api.pairings.get(code as string),
    enabled: Boolean(code),
    refetchInterval: (q) => (q.state.data?.status === 'open' ? 2_000 : false),
  });
  const now = useNow(Boolean(code));
  const expiresAt = pairing.data ? new Date(pairing.data.expiresAt).getTime() : 0;
  const remaining = Math.max(0, expiresAt - now);
  const claimed = status.data?.status === 'claimed' || wallet.guardians.safetyKey !== undefined;
  const expired = !claimed && (status.data?.status === 'expired' || (pairing.data !== undefined && remaining === 0));
  const guardianAddress = status.data?.guardian?.address ?? wallet.guardians.safetyKey;

  return (
    <>
      <Stepper current={2} total={TOTAL} label={s.step} />
      <div className="kl-stack">
        <h1 className="kl-title">{s.title}</h1>
        <p className="kl-lead">{s.body(env.pairUrl)}</p>
      </div>

      {pairing.isPending ? (
        <Skeleton kind="amount" />
      ) : pairing.isError ? (
        <ApiErrorState error={pairing.error} body={copy.common.offlineBody} onRetry={() => setAttempt((a) => a + 1)} />
      ) : (
        <div className="kl-stack kl-stack--tight items-center text-center">
          <p className="kl-pairing-code" aria-label={pairing.data.code}>
            {pairing.data.code.slice(0, 3)} {pairing.data.code.slice(3)}
          </p>
          {expired ? (
            <>
              <p className="text-12 text-ink-3">{s.expired}</p>
              <Button variant="secondary" size="sm" onClick={() => setAttempt((a) => a + 1)}>
                {s.newCode}
              </Button>
            </>
          ) : (
            <p className="text-12 text-ink-3">{s.expiresIn(formatDuration(remaining))}</p>
          )}
          <p className="text-12 text-ink-3">
            <SimulatedBadge />
          </p>
        </div>
      )}

      <KeyCard
        name={s.keyName}
        where={claimed ? s.keyWhere : s.waiting}
        can={s.keyCan}
        cannot={s.keyCannot}
        icon={<Key size={20} aria-hidden="true" />}
        status={claimed ? 'active' : 'pending'}
        statusWord={claimed ? undefined : s.waiting}
        action={guardianAddress ? <Address value={guardianAddress} explorerUrl={addressUrl(guardianAddress)} /> : undefined}
      />

      <Disclosure summary={copy.common.technicalDetails}>
        <div className="kl-stack kl-stack--tight">
          <p className="text-12 text-ink-3">{copy.onboarding.s1.techAddress}</p>
          <Address value={wallet.address} explorerUrl={addressUrl(wallet.address)} />
        </div>
      </Disclosure>

      <div className="kl-actions">
        <Button
          variant="primary"
          full
          disabled={!claimed}
          onClick={() => onNext(guardianAddress ? getAddress(guardianAddress) : undefined)}
        >
          {copy.common.continue}
        </Button>
        {!claimed ? (
          <Button variant="ghost" full onClick={() => onNext()}>
            {s.skip}
          </Button>
        ) : null}
      </div>
    </>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
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
    mutationFn: (address: Addr) => api.wallets.addGuardian(wallet.address, { kind: 'emergency-card', address }),
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
          body={copy.common.offlineBody}
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
        <div className="kl-stack" style={{ gap: 'var(--space-4)' }}>
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
              {s.assistedWait} <SimulatedBadge label={s.assistedPartner} /> · {s.assistedUnavailable}
            </>
          }
          disabled
        />
      </div>
      {setRemote.isError ? (
        <ApiErrorState error={setRemote.error} body={copy.common.offlineBody} onRetry={() => setRemote.mutate()} />
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
/* Step 5 · Protect my wallet (first sponsored userOp: deploy + enableModule + 3 guardians, threshold 2)          */
/* ------------------------------------------------------------------------------------------------------------ */

type ProtectPhase =
  | { kind: 'idle' }
  | { kind: 'running'; stage: SubmitStage | 'guardians' | 'policy'; decision?: PolicyDecision }
  | { kind: 'sent'; userOpHash: Hex; decision: PolicyDecision }
  | { kind: 'included'; userOpHash: Hex; txHash: Hex; blockNumber?: number }
  | { kind: 'confirmed'; userOpHash: Hex; txHash: Hex; blockNumber?: number }
  | { kind: 'refused'; decision: PolicyDecision }
  | { kind: 'error'; error: unknown; cancelled: boolean };

function Step5({
  wallet,
  onProtected,
  onNext,
}: {
  wallet: LocalWallet;
  onProtected: (txHash: Hex, swissquote?: Addr) => void;
  onNext: () => void;
}) {
  const s = copy.onboarding.s5;
  const [phase, setPhase] = useState<ProtectPhase>(wallet.status === 'deployed' && wallet.protectTxHash
    ? { kind: 'confirmed', userOpHash: '0x', txHash: wallet.protectTxHash as Hex }
    : { kind: 'idle' });
  const sqRef = useRef<Addr | undefined>(wallet.guardians.swissquote as Addr | undefined);

  const run = useCallback(async () => {
    try {
      setPhase({ kind: 'running', stage: 'guardians' });
      // Swissquote's recoverer: the bank fetches sq-guardian's public address itself. Idempotent server-side.
      try {
        const sq = await api.wallets.addGuardian(wallet.address, { kind: 'swissquote' });
        sqRef.current = getAddress(sq.address);
      } catch (error) {
        // Already added is fine (409); anything else is a real failure.
        if (!(isApiError(error) && error.status === 409)) throw error;
      }
      setPhase({ kind: 'running', stage: 'policy' });
      const decision = await api.policy.evaluate({
        kind: 'protect',
        walletAddress: wallet.address,
        calls: [],
        chfValue: 0,
        recipientAddress: wallet.address,
        deviceLabel: getDeviceLabel(),
      });
      if (decision.verdict !== 'approve') {
        setPhase({ kind: 'refused', decision });
        return;
      }
      setPhase({ kind: 'running', stage: 'building', decision });
      const unsigned = await buildOpFromDecision(wallet, decision);
      const result = await sponsorSignAndSend({
        wallet,
        unsignedUserOp: unsigned,
        decision,
        onStage: (stage) => setPhase({ kind: 'running', stage, decision }),
      });
      setPhase({ kind: 'sent', userOpHash: result.userOpHash, decision });
      const final = await pollUserOp(result.userOpHash, (st) => {
        if ((st.status === 'included' || st.status === 'confirmed') && st.txHash) {
          setPhase({
            kind: st.status,
            userOpHash: result.userOpHash,
            txHash: st.txHash as Hex,
            blockNumber: st.blockNumber,
          });
        }
      });
      if (final.status === 'failed') {
        setPhase({ kind: 'error', error: new Error(copy.activity.failedStep), cancelled: false });
        return;
      }
      if (final.txHash) {
        onProtected(final.txHash as Hex, sqRef.current);
        setPhase({ kind: 'confirmed', userOpHash: result.userOpHash, txHash: final.txHash as Hex, blockNumber: final.blockNumber });
      }
    } catch (error) {
      setPhase({ kind: 'error', error, cancelled: error instanceof PasskeyCancelledError });
    }
  }, [wallet, onProtected]);

  const isConfirmed = phase.kind === 'confirmed';
  const steps = protectSequence(phase);

  return (
    <>
      <Stepper current={5} total={TOTAL} label={s.step} />
      {isConfirmed ? (
        <>
          <h1 className="kl-title">{s.protectedTitle}</h1>
          <ul className="kl-stack kl-stack--tight list-none p-0 m-0">
            {s.protectedLines.map((line) => (
              <li key={line} className="flex items-start gap-2 text-16">
                <span className="text-ok" style={{ flexShrink: 0, paddingTop: 2 }}>
                  <CheckCircle size={20} aria-hidden="true" />
                </span>
                {line}
              </li>
            ))}
          </ul>
          <div className="kl-stack">
            <KeyCard
              name={copy.security.safetyKey.name}
              where={copy.security.safetyKey.where}
              can={copy.security.safetyKey.can}
              cannot={copy.pair.keyCannot}
              icon={<Key size={20} aria-hidden="true" />}
              status={wallet.guardians.safetyKey ? 'active' : 'pending'}
            />
            <KeyCard
              name={copy.security.emergencyCard.name}
              where={copy.security.emergencyCard.where}
              can={copy.security.emergencyCard.can}
              cannot={copy.security.emergencyCard.cannot}
              icon={<IdentificationCard size={20} aria-hidden="true" />}
            />
            <KeyCard
              name={copy.security.swissquote.name}
              where={copy.security.swissquote.where}
              can={copy.security.swissquote.can}
              cannot={copy.security.swissquote.cannot}
              icon={<Bank size={20} aria-hidden="true" />}
            />
          </div>
          {phase.txHash !== '0x' ? (
            <a className="kl-link" href={txUrl(phase.txHash)} target="_blank" rel="noreferrer">
              {copy.common.viewOnBasescan}
              <ArrowSquareOut size={16} aria-hidden="true" />
            </a>
          ) : null}
          <div className="kl-actions">
            <Button variant="primary" full onClick={onNext}>
              {copy.common.continue}
            </Button>
          </div>
        </>
      ) : (
        <>
          <h1 className="kl-title">{s.title}</h1>
          <Panel title={s.panelTitle} rows={s.rows.map(([label, value]) => ({ label, value }))} />
          {phase.kind === 'refused' ? (
            <PolicyLine
              verdict={phase.decision.verdict === 'block' ? 'block' : phase.decision.verdict === 'cooling' ? 'cooling' : 'step-up'}
              reason={phase.decision.reasons.join(' · ')}
            />
          ) : null}
          {phase.kind === 'error' && phase.cancelled ? <Note tone="warn">{copy.review.passkeyCancelled}</Note> : null}
          {phase.kind === 'error' && !phase.cancelled ? (
            <ApiErrorState error={phase.error} title={s.errorTitle} body={s.errorBody} onRetry={run} />
          ) : null}
          {steps ? <StatusSequence steps={steps} /> : null}
          <div className="kl-actions">
            <Button
              variant="primary"
              full
              loading={phase.kind === 'running' || phase.kind === 'sent' || phase.kind === 'included'}
              onClick={run}
            >
              {s.primary}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

function protectSequence(phase: ProtectPhase): StatusStep[] | null {
  const labels = copy.onboarding.s5.sequence;
  if (phase.kind === 'idle' || phase.kind === 'refused' || phase.kind === 'error') return null;
  const stageIndex =
    phase.kind === 'running'
      ? phase.stage === 'signing' || phase.stage === 'building' || phase.stage === 'sponsoring' || phase.stage === 'guardians' || phase.stage === 'policy'
        ? 0
        : 1
      : phase.kind === 'sent'
        ? 2
        : phase.kind === 'included'
          ? 3
          : 4;
  const blockLabel = phase.kind === 'included' || phase.kind === 'confirmed'
    ? copy.review.inBlock(phase.blockNumber ? formatInteger(phase.blockNumber) : '…')
    : labels[2];
  return [
    { label: labels[0], state: stageIndex > 0 ? 'done' : 'active' },
    { label: labels[1], state: stageIndex > 1 ? 'done' : stageIndex === 1 ? 'active' : 'todo' },
    { label: blockLabel, state: stageIndex > 2 ? 'done' : stageIndex === 2 ? 'active' : 'todo' },
    { label: labels[3], state: stageIndex > 3 ? 'done' : stageIndex === 3 ? 'active' : 'todo' },
  ];
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
            { label: s.rows.wallet, value: <Address value={wallet.address} explorerUrl={addressUrl(wallet.address)} /> },
            { label: s.rows.client, value: sign.data.attestation.clientId },
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
          { label: s.rows.wallet, value: <Address value={wallet.address} explorerUrl={addressUrl(wallet.address)} /> },
          { label: s.rows.client, value: env.clientId },
          { label: s.rows.validFor, value: copy.security.swissquote.name },
        ]}
      />
      {cancelled ? <Note tone="warn">{copy.review.passkeyCancelled}</Note> : null}
      {sign.isError && !cancelled ? (
        <ApiErrorState error={sign.error} body={copy.common.offlineBody} onRetry={() => sign.mutate()} />
      ) : null}
      <div className="kl-actions">
        <Button variant="primary" full loading={sign.isPending} onClick={() => sign.mutate()}>
          {s.primary}
        </Button>
        {sign.isError && isApiError(sign.error) && sign.error.notImplemented ? (
          <Button variant="ghost" full onClick={() => onDone(false)}>
            {copyGaps.skipProof}
          </Button>
        ) : null}
      </div>
    </>
  );
}
