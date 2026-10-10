'use client';

import type { RecoveryRequest } from '@keyline/shared';
import { ArrowSquareOut, Bank, IdentificationCard, Laptop } from '@phosphor-icons/react/dist/ssr';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAddress, type Hex, isHex } from 'viem';
import { ApiErrorState } from '@/src/components/ApiErrorState';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy, copyGaps } from '@/src/copy';
import { env } from '@/src/env';
import { api, isApiError } from '@/src/lib/api';
import {
  addressUrl,
  PasskeyCancelledError,
  readRecoveryStatus,
  signRecoveryConfirmation,
  txUrl,
} from '@/src/lib/chain';
import { getDeviceLabel } from '@/src/lib/device';
import { useRecovery } from '@/src/lib/hooks';
import { PasskeyUnsupportedError, registerPasskey } from '@/src/lib/passkey';
import { type PendingRecovery, recoveryStore, walletStore } from '@/src/lib/storage';
import {
  Address,
  Button,
  CountdownRing,
  Disclosure,
  ErrorState,
  formatClock,
  KeyCard,
  Note,
  Panel,
  SimulatedBadge,
  Skeleton,
  StatusSequence,
  Stepper,
  TextField,
  Toggle,
} from '@/src/ui';

const TOTAL = 5;
/**
 * DESIGN.md lists Email · Identity · New key · Recoverers · Waiting period. The bank issues the email code when the
 * recovery is created, and creating it needs the new key — so the key comes first. Same five labels, bank's order.
 */
const stepLabels = () =>
  [
    copy.recover.steps[2],
    copy.recover.steps[0],
    copy.recover.steps[1],
    copy.recover.steps[3],
    copy.recover.steps[4],
  ] as const;

/** SIMULATED e-ID prefill: Lea's file (SPEC §7). The thief types his own. */
const LEA_EID: { name: string; dateOfBirth: string; documentNumber: string } = {
  name: 'Lea Keller',
  dateOfBirth: '1991-03-14',
  documentNumber: 'C1234567',
};
const GRACE_MS = 180_000;

/** One header for the whole new-phone flow: the way back is always home (the recovery itself survives on the bank). */
export default function RecoverPage() {
  return (
    <>
      <ScreenHeader title={copy.recover.emailTitle} backHref="/" />
      <RecoverFlow />
    </>
  );
}

function RecoverFlow() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingRecovery | null | undefined>(undefined);
  const [otp, setOtp] = useState('');
  const [otpAccepted, setOtpAccepted] = useState(false);
  useEffect(() => {
    setPending(recoveryStore.get());
  }, []);
  const recovery = useRecovery(pending?.recoveryId);
  const update = (patch: Partial<PendingRecovery>) => setPending(recoveryStore.update(patch));

  // Terminal: identity refused → /refused (the thief's path). Reasons travel through localStorage.
  useEffect(() => {
    if (recovery.data?.status === 'identity-refused') {
      recoveryStore.update({ status: 'identity-refused', reasons: recovery.data.reasons });
      router.replace('/refused');
    }
  }, [recovery.data, router]);

  if (pending === undefined) {
    return (
      <>
        <Skeleton kind="line" count={2} />
        <Skeleton kind="block" />
      </>
    );
  }

  const r = recovery.data;
  const startOver = () => {
    recoveryStore.clear();
    setPending(null);
    setOtp('');
    setOtpAccepted(false);
  };

  if (!pending?.newPasskey) return <StepKey onCreated={(p) => update(p)} />;
  if (
    !pending.recoveryId ||
    (r?.status === 'identity-pending' && !otpAccepted) ||
    (!r && !recovery.isError)
  ) {
    if (pending.recoveryId && !r) {
      return (
        <>
          <Stepper current={2} total={TOTAL} label={stepLabels()[1]} />
          <Skeleton kind="line" count={2} />
          <Skeleton kind="block" />
        </>
      );
    }
    return (
      <StepEmail
        pending={pending}
        otp={otp}
        onOtp={setOtp}
        onCreated={(created) =>
          update({
            recoveryId: created.id,
            walletAddress: created.walletAddress,
            email: created.email,
            status: created.status,
          })
        }
        onCodeEntered={() => setOtpAccepted(true)}
      />
    );
  }
  if (recovery.isError || !r) {
    return (
      <ApiErrorState
        error={recovery.error}
        body={copy.common.errorBody}
        onRetry={() => recovery.refetch()}
        actions={
          <Button variant="ghost" onClick={startOver}>
            {copy.recover.startOver}
          </Button>
        }
      />
    );
  }

  switch (r.status) {
    case 'identity-pending':
      return (
        <StepIdentity
          recovery={r}
          otp={otp}
          onWrongCode={() => {
            setOtpAccepted(false);
            setOtp('');
          }}
          onSubmitted={(next) => update({ status: next.status, reasons: next.reasons })}
        />
      );
    case 'awaiting-guardians':
      return <StepRecoverers recovery={r} />;
    case 'executed-waiting':
    case 'finalized':
      return (
        <StepWaiting
          recovery={r}
          onWelcomeHome={() => {
            // The new passkey becomes this device's profile; the address is the bank's, never re-derived.
            walletStore.set({
              address: r.walletAddress,
              credentialId: r.newOwner.credentialId,
              pubKeyX: r.newOwner.pubKeyX,
              pubKeyY: r.newOwner.pubKeyY,
              deviceLabel: getDeviceLabel(),
              status: 'deployed',
              protectTxHash: r.onchain.finalizedTxHash,
              attested: false,
              recoveryMode: r.recoveryMode,
              guardians: {},
              onboardingStep: 7,
            });
            recoveryStore.clear();
            router.push('/');
          }}
        />
      );
    case 'cancelled':
      return (
        <>
          <Stepper current={5} total={TOTAL} label={stepLabels()[4]} />
          <ErrorState
            title={copy.recover.cancelledByOwner}
            body={copy.recover.cancelledBody}
            detail={r.onchain.cancelledTxHash ? `cancel tx ${r.onchain.cancelledTxHash}` : undefined}
            actions={
              <Button variant="secondary" onClick={startOver}>
                {copy.recover.startOver}
              </Button>
            }
          />
          {r.onchain.cancelledTxHash ? <ExplorerLink hash={r.onchain.cancelledTxHash} /> : null}
        </>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Step 1 · Create a key on this phone (new passkey; public x,y + credential id kept locally)                   */
/* ------------------------------------------------------------------------------------------------------------ */

function StepKey({ onCreated }: { onCreated: (patch: Partial<PendingRecovery>) => void }) {
  const s = copy.recover;
  const create = useMutation({
    mutationFn: async () => {
      const passkey = await registerPasskey();
      return {
        newPasskey: {
          credentialId: passkey.credentialId,
          pubKeyX: passkey.pubKeyX,
          pubKeyY: passkey.pubKeyY,
        },
        startedAt: new Date().toISOString(),
      };
    },
    onSuccess: onCreated,
  });
  const cancelled = create.error instanceof PasskeyCancelledError;
  const unsupported = create.error instanceof PasskeyUnsupportedError;
  return (
    <>
      <Stepper current={1} total={TOTAL} label={stepLabels()[0]} />
      <div className="kl-stack">
        <h1 className="kl-title">{s.keyTitle}</h1>
        <p className="kl-lead">{s.keyBody}</p>
      </div>
      {cancelled ? <Note tone="warn">{copy.onboarding.s1.cancelled}</Note> : null}
      {unsupported ? (
        <ErrorState title={copy.onboarding.s1.unsupportedTitle} body={copy.onboarding.s1.unsupportedBody} />
      ) : null}
      {create.isError && !cancelled && !unsupported ? (
        <ApiErrorState error={create.error} body={copy.common.errorBody} onRetry={() => create.mutate()} />
      ) : null}
      <div className="kl-actions">
        <Button variant="primary" full loading={create.isPending} onClick={() => create.mutate()}>
          {s.keyPrimary}
        </Button>
        <Button variant="ghost" full href="/">
          {copy.common.back}
        </Button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Step 2 · Email → the bank opens the recovery and drops the code in the SIMULATED inbox → 6-digit code        */
/* ------------------------------------------------------------------------------------------------------------ */

function StepEmail({
  pending,
  otp,
  onOtp,
  onCreated,
  onCodeEntered,
}: {
  pending: PendingRecovery;
  otp: string;
  onOtp: (code: string) => void;
  onCreated: (recovery: RecoveryRequest) => void;
  onCodeEntered: () => void;
}) {
  const s = copy.recover;
  const [email, setEmail] = useState(pending.email ?? '');
  const [unknown, setUnknown] = useState(false);
  const send = useMutation({
    mutationFn: async (typed: string) => {
      const me = await api.me();
      if (!me.wallet || me.client.email.toLowerCase() !== typed.trim().toLowerCase()) {
        setUnknown(true);
        return null;
      }
      const newPasskey = pending.newPasskey;
      if (!newPasskey) throw new Error('No new key on this phone');
      return api.recoveries.create({
        wallet: me.wallet.address,
        newOwner: {
          pubKeyX: newPasskey.pubKeyX,
          pubKeyY: newPasskey.pubKeyY,
          credentialId: newPasskey.credentialId,
        },
        device: { deviceLabel: getDeviceLabel() },
      });
    },
    onSuccess: (created) => {
      if (created) onCreated(created);
    },
  });
  const created = Boolean(pending.recoveryId);
  const inboxEmail = pending.email ?? email;
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const validCode = /^\d{6}$/.test(otp);

  return (
    <>
      <Stepper current={2} total={TOTAL} label={stepLabels()[1]} />
      <div className="kl-stack">
        <h1 className="kl-title">{s.emailTitle}</h1>
        <p className="kl-lead">{s.emailBody}</p>
      </div>
      <Note tone="ok">{copy.recover.keyDone}</Note>
      {created ? (
        <>
          <TextField label={s.emailField} type="email" value={inboxEmail} readOnly />
          <TextField
            label={s.codeField}
            mono
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => onOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            hint={
              <>
                {s.codeHint} <SimulatedBadge />{' '}
                <Link
                  className="kl-link kl-link--quiet"
                  href={`/mock/inbox?email=${encodeURIComponent(inboxEmail)}`}
                >
                  {copy.mock.inboxShow}
                </Link>
              </>
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && validCode) onCodeEntered();
            }}
          />
          <div className="kl-actions">
            <Button variant="primary" full disabled={!validCode} onClick={onCodeEntered}>
              {copy.common.continue}
            </Button>
          </div>
        </>
      ) : (
        <>
          <TextField
            label={s.emailField}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setUnknown(false);
            }}
            error={unknown ? copy.recover.emailUnknown : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && validEmail) send.mutate(email);
            }}
          />
          {send.isError ? (
            <ApiErrorState
              error={send.error}
              title={s.errTitle}
              body={copy.common.errorBody}
              onRetry={() => send.mutate(email)}
            />
          ) : null}
          <div className="kl-actions">
            <Button
              variant="primary"
              full
              disabled={!validEmail}
              loading={send.isPending}
              onClick={() => send.mutate(email)}
            >
              {s.sendCode}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Step 3 · Identity — SIMULATED swiyu e-ID form; the bank applies the persona rules and signs the verdict      */
/* ------------------------------------------------------------------------------------------------------------ */

function StepIdentity({
  recovery,
  otp,
  onWrongCode,
  onSubmitted,
}: {
  recovery: RecoveryRequest;
  otp: string;
  onWrongCode: () => void;
  onSubmitted: (next: RecoveryRequest) => void;
}) {
  const s = copy.recover;
  const thief = getDeviceLabel().toLowerCase().includes('thief');
  const [name, setName] = useState(thief ? '' : LEA_EID.name);
  const [dob, setDob] = useState(LEA_EID.dateOfBirth);
  const [doc, setDoc] = useState(LEA_EID.documentNumber);
  const [liveness, setLiveness] = useState(true);
  const [wrongCode, setWrongCode] = useState(false);
  const queryClient = useQueryClient();
  const submit = useMutation({
    mutationFn: () =>
      api.recoveries.identity(recovery.id, {
        emailOtp: otp,
        eidPayload: { name: name.trim(), dateOfBirth: dob, documentNumber: doc.trim(), liveness },
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['recovery', recovery.id], next);
      onSubmitted(next);
    },
    onError: (error) => {
      // A wrong email code is a 4xx with "code" in the message: back to the code field rather than /refused.
      if (isApiError(error) && error.kind === 'http' && /code/i.test(error.message)) setWrongCode(true);
    },
  });
  // The desk must decide (DEMO_FAST_MODE off): keep the sequence on "Being checked" while the request is polled.
  const awaitingOperator = recovery.waitingFor === 'operator';
  const valid = name.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dob) && doc.trim().length > 0;

  if (wrongCode) {
    return (
      <>
        <Stepper current={3} total={TOTAL} label={stepLabels()[2]} />
        <ErrorState
          title={s.codeWrong}
          body={copy.common.errorBody}
          detail={submit.error ? String(submit.error) : undefined}
          actions={
            <Button variant="secondary" onClick={onWrongCode}>
              {copy.common.back}
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <Stepper current={3} total={TOTAL} label={stepLabels()[2]} />
      <div className="kl-stack">
        <p className="kl-eyebrow">
          {s.idEyebrow} <SimulatedBadge />
        </p>
        <h1 className="kl-title">{s.idTitle}</h1>
        <p className="kl-lead">{s.idBody}</p>
      </div>
      {awaitingOperator || submit.isPending ? (
        <StatusSequence
          steps={[
            { label: s.idSequence[0], state: 'done' },
            { label: s.idSequence[1], state: 'active' },
          ]}
        />
      ) : (
        <>
          <TextField
            label={s.idName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
          <TextField label={s.idDob} type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          <TextField
            label={copy.recover.docNumber}
            mono
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
          />
          <Toggle checked={liveness} onChange={setLiveness} label={s.idLiveness} />
          <p className="text-12 text-ink-3">
            <Link className="kl-link kl-link--quiet" href="/mock/eid">
              {copy.mock.eidTitle}
            </Link>{' '}
            <SimulatedBadge />
          </p>
        </>
      )}
      {submit.isError && !wrongCode ? (
        <ApiErrorState error={submit.error} body={copy.common.errorBody} onRetry={() => submit.mutate()} />
      ) : null}
      {!awaitingOperator ? (
        <div className="kl-actions">
          <Button
            variant="primary"
            full
            disabled={!valid}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {s.idSubmit}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Step 4 · Waiting for a second recoverer — Swissquote holds its signature; laptop or Emergency card adds one  */
/* ------------------------------------------------------------------------------------------------------------ */

function StepRecoverers({ recovery }: { recovery: RecoveryRequest }) {
  const s = copy.recover;
  const queryClient = useQueryClient();
  const sq = recovery.guardianConfirmations.find((c) => c.kind === 'swissquote' && !c.void);
  const sqRefusal = recovery.guardianRefusals.filter((g) => g.kind === 'swissquote').at(-1);
  // Swissquote's state drives the whole step: confirmed, declined (e.g. the 24 h rule), or not answered yet.
  const sqDeclined = !sq && sqRefusal !== undefined;
  const sqReason = sqRefusal ? s.recSqReason(sqRefusal.status, sqRefusal.reasons.join(' ')) : undefined;
  const title = sq ? s.recTitle : sqDeclined ? s.recTitleSqDeclined : s.recTitleWaiting;
  const lead = sq ? s.recBody : sqDeclined ? s.recBodySqDeclined : s.recBodyWaiting;
  const [cardKey, setCardKey] = useState('');
  const [cardError, setCardError] = useState<string | undefined>(undefined);
  const useCard = useMutation({
    mutationFn: async (hex: string) => {
      const trimmed = hex.trim();
      if (!isHex(trimmed) || trimmed.length !== 66) throw new Error(copy.recover.cardInvalid);
      const signed = await signRecoveryConfirmation({
        privateKey: trimmed as Hex,
        recoveryId: recovery.id,
        wallet: getAddress(recovery.walletAddress),
        newOwnerProxy: getAddress(recovery.newOwner.signerProxyAddress),
      });
      const status = await readRecoveryStatus(getAddress(recovery.walletAddress));
      if (!status.guardians.some((g) => g.toLowerCase() === signed.guardianAddress.toLowerCase()))
        throw new Error(copy.recover.cardNotGuardian);
      return api.recoveries.confirm(recovery.id, {
        kind: 'emergency-card',
        guardianAddress: signed.guardianAddress,
        signature: signed.signature,
        nonce: signed.nonce,
      });
    },
    onSuccess: (next) => {
      setCardKey(''); // the card key is dropped from memory
      queryClient.setQueryData(['recovery', recovery.id], next);
    },
    onError: (error) => {
      if (error instanceof Error && !isApiError(error)) setCardError(error.message);
    },
  });

  return (
    <>
      <Stepper current={4} total={TOTAL} label={stepLabels()[3]} />
      <div className="kl-stack">
        <h1 className="kl-title">{title}</h1>
        <p className="kl-lead">{lead}</p>
      </div>
      <div className="kl-stack">
        <KeyCard
          name={copy.security.swissquote.name}
          where={copy.security.swissquote.where}
          can={copy.security.swissquote.can}
          cannot={copy.security.swissquote.cannot}
          icon={<Bank size={20} aria-hidden="true" />}
          status={sq ? 'active' : sqDeclined ? 'revoked' : 'pending'}
          statusWord={sq ? s.recSq(formatClock(new Date(sq.at))) : sqDeclined ? s.recSqDeclined : undefined}
          action={
            sq?.txHash ? (
              <ExplorerLink hash={sq.txHash} />
            ) : sq ? (
              <p className="text-12 text-ink-3">{copy.recover.sqHeld}</p>
            ) : sqDeclined ? (
              <p className="text-12 text-ink-2">{sqReason}</p>
            ) : undefined
          }
        />
        <KeyCard
          name={copy.security.safetyKey.name}
          where={s.recSafety}
          can={copyGaps.recover.laptopOption}
          icon={<Laptop size={20} aria-hidden="true" />}
          status="pending"
        />
        <KeyCard
          name={copy.security.emergencyCard.name}
          where={s.recCard}
          can={copyGaps.recover.cardOption}
          cannot={copy.security.emergencyCard.cannot}
          icon={<IdentificationCard size={20} aria-hidden="true" />}
          status="pending"
          action={
            <div className="kl-stack kl-stack--tight">
              <TextField
                label={s.recCardField}
                mono
                autoComplete="off"
                spellCheck={false}
                value={cardKey}
                onChange={(e) => {
                  setCardKey(e.target.value);
                  setCardError(undefined);
                }}
                error={cardError}
              />
              <Button
                variant="secondary"
                disabled={cardKey.trim().length === 0}
                loading={useCard.isPending}
                onClick={() => useCard.mutate(cardKey)}
              >
                {s.recCardUse}
              </Button>
            </div>
          }
        />
      </div>
      {useCard.isError && isApiError(useCard.error) ? (
        <ApiErrorState
          error={useCard.error}
          body={copy.common.errorBody}
          onRetry={() => useCard.mutate(cardKey)}
        />
      ) : null}
      <Note tone={sqDeclined ? 'warn' : 'info'}>{sqDeclined ? s.recBoth : s.recEither}</Note>
      <Disclosure summary={copy.common.technicalDetails}>
        <div className="kl-stack kl-stack--tight">
          {sqRefusal ? (
            <>
              <p className="text-12 text-ink-3">{s.recSqRawLabel}</p>
              <p className="kl-mono text-12">{`${sqRefusal.status} · ${sqRefusal.reasons.join(' · ')}`}</p>
            </>
          ) : null}
          <p className="text-12 text-ink-3">{copy.recover.walletLabel}</p>
          <Address value={recovery.walletAddress} explorerUrl={addressUrl(recovery.walletAddress)} />
          <p className="text-12 text-ink-3">{copy.recover.newKey}</p>
          <Address
            value={recovery.newOwner.signerProxyAddress}
            explorerUrl={addressUrl(recovery.newOwner.signerProxyAddress)}
          />
        </div>
      </Disclosure>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Step 5 · Waiting period — ring fed by executeAfter (bank mirrors the module; we also read the module live)    */
/* ------------------------------------------------------------------------------------------------------------ */

function StepWaiting({ recovery, onWelcomeHome }: { recovery: RecoveryRequest; onWelcomeHome: () => void }) {
  const s = copy.recover;
  const [chainExecuteAfter, setChainExecuteAfter] = useState<Date | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    const read = () =>
      readRecoveryStatus(getAddress(recovery.walletAddress))
        .then((st) => {
          if (!cancelled) setChainExecuteAfter(st.executeAfter);
        })
        .catch(() => undefined);
    read();
    const t = setInterval(read, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [recovery.walletAddress]);

  if (recovery.status === 'finalized') {
    return (
      <>
        <Stepper current={5} total={TOTAL} label={copy.recover.restoredLabel} />
        <div className="kl-stack">
          <h1 className="kl-title">{s.welcome}</h1>
          <p className="kl-lead">{s.welcomeBody}</p>
        </div>
        <Panel
          rows={[
            {
              label: copy.desk.wallet,
              value: (
                <Address value={recovery.walletAddress} explorerUrl={addressUrl(recovery.walletAddress)} />
              ),
            },
            {
              label: copy.recover.newKey,
              value: (
                <Address
                  value={recovery.newOwner.signerProxyAddress}
                  explorerUrl={addressUrl(recovery.newOwner.signerProxyAddress)}
                />
              ),
            },
          ]}
        />
        {recovery.onchain.finalizedTxHash ? (
          <ExplorerLink hash={recovery.onchain.finalizedTxHash} label={copy.recover.viewRestoreTx} />
        ) : null}
        <div className="kl-actions">
          <Button variant="primary" full onClick={onWelcomeHome}>
            {s.goHome}
          </Button>
        </div>
      </>
    );
  }

  const executeAfter =
    chainExecuteAfter ??
    (recovery.onchain.executeAfter ? new Date(recovery.onchain.executeAfter) : undefined);
  return (
    <>
      <Stepper current={5} total={TOTAL} label={stepLabels()[4]} />
      {executeAfter ? (
        <>
          <h1 className="kl-title">{s.waitTitle(formatClock(executeAfter))}</h1>
          <div className="flex justify-center">
            <CountdownRing
              endsAt={executeAfter}
              durationMs={GRACE_MS}
              size={200}
              caption={env.demoFastMode ? copy.demo.gracePeriod : undefined}
              doneLabel={copy.recover.ready}
              showFinish={false}
            />
          </div>
        </>
      ) : (
        <Skeleton kind="amount" />
      )}
      <p className="kl-lead">{s.waitBody}</p>
      {recovery.onchain.executedTxHash ? (
        <a className="kl-link" href={txUrl(recovery.onchain.executedTxHash)} target="_blank" rel="noreferrer">
          {s.watch}
          <ArrowSquareOut size={16} aria-hidden="true" />
        </a>
      ) : null}
      <Disclosure summary={copy.common.technicalDetails}>
        <div className="kl-stack kl-stack--tight">
          <p className="text-12 text-ink-3">{copy.recover.walletLabel}</p>
          <Address value={recovery.walletAddress} explorerUrl={addressUrl(recovery.walletAddress)} />
          <p className="text-12 text-ink-3">{copy.desk.timerSource}</p>
          <Address value={env.recoveryModule} explorerUrl={addressUrl(env.recoveryModule)} />
        </div>
      </Disclosure>
    </>
  );
}

function ExplorerLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a className="kl-link" href={txUrl(hash)} target="_blank" rel="noreferrer">
      {label ?? copy.common.viewOnBasescan}
      <ArrowSquareOut size={16} aria-hidden="true" />
    </a>
  );
}
