// Recovery orchestration shared by the HTTP routes and the finalizer loop (SPEC F3 / F4 / F4b, DECISIONS #15).
// The bank: signs identity verdicts (verdict key), asks sq-guardian for its ExecuteRecovery signature, verifies the
// client recoverers' signatures, and relays ONE multiConfirmRecovery(execute=true) once it holds two of them.
// It never holds a guardian key: without a second signature nothing it does can change the Safe.
import { recoveryTypedData } from '@keyline/chain';
import type {
  GuardianConfirmation,
  GuardianRecoveryRequest,
  IdentityVerdict,
  RecoveryRequest,
  RecoveryWaitingFor,
} from '@keyline/shared';
import { RecoveryRequestSchema } from '@keyline/shared';
import { type Address, getAddress, type Hex, isAddressEqual } from 'viem';
import type { BankConfig } from './config';
import { nowIso } from './db';
import type { ChainDeps } from './deps';
import type { EventStore } from './events';
import { signIdentityVerdict, type VerdictInput } from './identity';
import type { RecoveryStore } from './recovery-store';
import type { Repo } from './repo';
import { GUARDIAN_THRESHOLD } from './store';

export type RecoveryServiceDeps = {
  config: BankConfig;
  events: EventStore;
  repo: Repo;
  recoveries: RecoveryStore;
  chain: ChainDeps;
  log?: { info: (o: unknown, msg?: string) => void; warn: (o: unknown, msg?: string) => void };
};

/** Owner-facing copy (docs/DESIGN.md Appendix A). */
export const COPY = {
  started: {
    title: 'Recovery started from a new device',
    body: (label: string, executeAfter: string) =>
      `Recovery started from “${label}”. If nobody cancels, that device becomes the only key at ${executeAfter}.`,
  },
  refused: {
    title: 'Recovery attempt refused',
    body: (label: string, at: string) =>
      `Someone tried to recover this wallet from a device labelled “${label}” at ${at}. The identity check failed; Swissquote’s recoverer did not act. Nothing changed.`,
  },
  requested: {
    title: 'Someone started a recovery of your wallet',
    body: (label: string) =>
      `A recovery was started from “${label}”. Nothing changes until the identity check passes and a second recoverer confirms.`,
  },
  cancelled: {
    title: 'Recovery cancelled by the owner',
    body: 'Recovery cancelled. Your phone remains the only key.',
  },
  finalized: {
    title: 'Welcome back',
    body: 'This phone is now your only key. The old phone can no longer sign.',
  },
} as const;

const shortTime = (iso: string) => new Date(iso).toISOString().slice(11, 16);

export const waitingForOf = (r: RecoveryRequest): RecoveryWaitingFor | undefined => {
  switch (r.status) {
    case 'identity-pending':
      return r.identity.verdict === 'pending' && r.identity.emailOtpPassed && r.identity.idCheckPassed
        ? 'operator'
        : 'identity';
    case 'awaiting-guardians':
      return 'second-recoverer';
    case 'executed-waiting':
      return 'grace-period';
    default:
      return undefined;
  }
};

/** Distinct, non-void `signature`-mode confirmations bound to `nonce` — what one multiConfirmRecovery can carry. */
export const usableSignatures = (r: RecoveryRequest, nonce: string) => {
  const seen = new Set<string>();
  const out: { signer: Address; signature: Hex; kind: GuardianConfirmation['kind'] }[] = [];
  for (const c of r.guardianConfirmations) {
    if (c.void || c.mode !== 'signature' || !c.signature || !c.guardianAddress || c.nonce !== nonce) continue;
    const signer = getAddress(c.guardianAddress);
    if (seen.has(signer.toLowerCase())) continue;
    seen.add(signer.toLowerCase());
    out.push({ signer, signature: c.signature as Hex, kind: c.kind });
  }
  return out;
};

export const createRecoveryService = ({
  config,
  events,
  repo,
  recoveries,
  chain,
  log,
}: RecoveryServiceDeps) => {
  const module = getAddress(config.RECOVERY_MODULE_ADDRESS);
  const warn = (o: unknown, msg?: string) => log?.warn(o, msg);

  const save = (r: RecoveryRequest): RecoveryRequest =>
    recoveries.save(RecoveryRequestSchema.parse({ ...r, waitingFor: waitingForOf(r) }));

  const view = (r: RecoveryRequest): RecoveryRequest =>
    RecoveryRequestSchema.parse({ ...r, waitingFor: waitingForOf(r) });

  /** SIMULATED push to the owner's existing devices: an append-only event the /alerts screen and the desk read. */
  const notifyOwner = (
    r: RecoveryRequest,
    kind: string,
    title: string,
    body: string,
    extra: Record<string, unknown> = {},
  ) =>
    events.recordEvent('notification.sent', r.walletAddress, {
      channel: 'push-simulated',
      simulated: true,
      kind,
      title,
      body,
      recoveryRequestId: r.id,
      requestedFrom: r.requestedFrom,
      ...extra,
    });

  const issueVerdict = async (
    r: RecoveryRequest,
    input: Omit<VerdictInput, 'recoveryRequestId' | 'wallet' | 'newOwner'>,
  ): Promise<IdentityVerdict> => {
    const verdict = await signIdentityVerdict(config.BANK_VERDICT_PRIVATE_KEY as Hex, config.CHAIN_ID, {
      ...input,
      recoveryRequestId: r.id,
      wallet: getAddress(r.walletAddress),
      newOwner: getAddress(r.newOwner.signerProxyAddress),
    });
    events.recordEvent('recovery.verdict-signed', r.walletAddress, {
      recoveryRequestId: r.id,
      verdict: verdict.verdict,
      method: verdict.method,
      operatorNote: verdict.operatorNote,
      signedBy: config.addresses.verdict,
      issuedAt: verdict.issuedAt,
      simulated: true,
    });
    return verdict;
  };

  /** The relayed execute landed (or the guardian executed itself): read the timer from chain, notify, arm the guardian. */
  const markExecuted = async (
    r: RecoveryRequest,
    txHash: Hex,
    submitter?: string,
  ): Promise<RecoveryRequest> => {
    const status = await chain.recoveryStatus(getAddress(r.walletAddress));
    const executeAfter = status.executeAfter?.toISOString();
    r.status = 'executed-waiting';
    r.onchain = {
      ...r.onchain,
      executedTxHash: txHash,
      executeAfter,
      nonce: status.nonce.toString(),
    };
    recoveries.markWalletRecovering(r.walletAddress);
    events.recordEvent('recovery.executed', r.walletAddress, {
      recoveryRequestId: r.id,
      txHash,
      executeAfter,
      approvals: status.approvals.toString(),
      newOwners: status.newOwners,
      submitter,
      signers: r.guardianConfirmations
        .filter((c) => !c.void)
        .map((c) => ({ kind: c.kind, address: c.guardianAddress })),
    });
    notifyOwner(
      r,
      'recovery-started',
      COPY.started.title,
      COPY.started.body(
        r.requestedFrom.deviceLabel,
        executeAfter ? shortTime(executeAfter) : 'the end of the waiting period',
      ),
      { executeAfter, txHash },
    );
    if (executeAfter) {
      const ack = await chain.sqGuardian.reportExecuted(r.id, {
        txHash,
        executeAfter: Math.floor(new Date(executeAfter).getTime() / 1000),
      });
      if (!ack.ok) {
        warn(
          { recoveryRequestId: r.id, reasons: ack.reasons },
          'sq-guardian did not acknowledge the execute',
        );
        events.recordEvent('recovery.guardian-notify-failed', r.walletAddress, {
          recoveryRequestId: r.id,
          kind: 'swissquote',
          status: ack.status,
          reasons: ack.reasons,
        });
      }
    }
    return save(r);
  };

  /** Two distinct signatures for the current module nonce → ONE relayed multiConfirmRecovery(execute=true). */
  const maybeExecute = async (r: RecoveryRequest): Promise<RecoveryRequest> => {
    if (r.status !== 'awaiting-guardians') return save(r);
    const nonce = (await chain.recoveryNonce(getAddress(r.walletAddress))).toString();
    r.onchain = { ...r.onchain, nonce };
    const sigs = usableSignatures(r, nonce);
    if (sigs.length < GUARDIAN_THRESHOLD) return save(r);
    const { txHash, submitter } = await chain.confirmWithSignatures({
      wallet: getAddress(r.walletAddress),
      newOwners: [getAddress(r.newOwner.signerProxyAddress)],
      signatures: sigs.map((s) => ({ signer: s.signer, signature: s.signature })),
    });
    for (const c of r.guardianConfirmations)
      if (!c.void && c.mode === 'signature' && c.nonce === nonce) c.txHash = txHash;
    return markExecuted(r, txHash, submitter);
  };

  /** POST sq-guardian /recoveries with the signed pass verdict; records the signature or the refusal. */
  const askSwissquote = async (r: RecoveryRequest): Promise<RecoveryRequest> => {
    if (r.identity.verdict !== 'pass') throw new Error('askSwissquote requires a pass verdict');
    const body: GuardianRecoveryRequest = {
      recoveryRequestId: r.id,
      wallet: getAddress(r.walletAddress),
      newOwners: [getAddress(r.newOwner.signerProxyAddress)],
      newThreshold: 1,
      identityVerdict: r.identity,
    };
    const res = await chain.sqGuardian.requestConfirmation(body);
    const at = nowIso();
    if (!res.ok) {
      r.guardianRefusals = [
        ...r.guardianRefusals,
        { kind: 'swissquote', status: res.status, reasons: res.reasons, at },
      ];
      events.recordEvent('recovery.guardian-refused', r.walletAddress, {
        recoveryRequestId: r.id,
        kind: 'swissquote',
        status: res.status,
        reasons: res.reasons,
      });
      return save(r);
    }
    // One live Swissquote confirmation at a time: an older one for a previous nonce is superseded, not duplicated.
    r.guardianConfirmations = r.guardianConfirmations.filter((c) => c.kind !== 'swissquote' || c.void);
    if (res.body.mode === 'signature') {
      r.guardianConfirmations.push({
        kind: 'swissquote',
        guardianAddress: getAddress(res.body.guardianAddress),
        mode: 'signature',
        signature: res.body.signature,
        nonce: res.body.nonce,
        at,
      });
      r.onchain = { ...r.onchain, nonce: res.body.nonce };
      events.recordEvent('recovery.guardian-confirmed', r.walletAddress, {
        recoveryRequestId: r.id,
        kind: 'swissquote',
        mode: 'signature',
        guardianAddress: res.body.guardianAddress,
        nonce: res.body.nonce,
        executed: false,
      });
      return save(r);
    }
    r.guardianConfirmations.push({ kind: 'swissquote', mode: 'onchain', txHash: res.body.txHash as Hex, at });
    events.recordEvent('recovery.guardian-confirmed', r.walletAddress, {
      recoveryRequestId: r.id,
      kind: 'swissquote',
      mode: 'onchain',
      txHash: res.body.txHash,
      executed: res.body.executed,
    });
    if (res.body.executed) return markExecuted(r, res.body.txHash as Hex, 'guardian-eoa');
    return save(r);
  };

  /** Pass verdict → awaiting-guardians → ask Swissquote → execute if two signatures are already there. */
  const passIdentity = async (
    r: RecoveryRequest,
    input: { method: IdentityVerdict['method']; operatorNote?: string; emailOtpPassed: boolean },
  ): Promise<RecoveryRequest> => {
    r.identity = await issueVerdict(r, {
      method: input.method,
      verdict: 'pass',
      emailOtpPassed: input.emailOtpPassed,
      idCheckPassed: true,
      livenessPassed: true,
      operatorNote: input.operatorNote,
    });
    r.status = 'awaiting-guardians';
    r.reasons = [];
    events.recordEvent('recovery.identity-passed', r.walletAddress, {
      recoveryRequestId: r.id,
      method: input.method,
      operatorNote: input.operatorNote,
      simulated: true,
    });
    save(r);
    await askSwissquote(r);
    return maybeExecute(r);
  };

  /** Fail verdict → identity-refused; any stored (never relayed) confirmation is voided; the owner is told. */
  const refuseIdentity = async (
    r: RecoveryRequest,
    input: {
      method: IdentityVerdict['method'];
      reasons: string[];
      operatorNote?: string;
      emailOtpPassed: boolean;
      idCheckPassed: boolean;
      livenessPassed: boolean;
      by: 'persona-rules' | 'operator';
    },
  ): Promise<RecoveryRequest> => {
    r.identity = await issueVerdict(r, {
      method: input.method,
      verdict: 'fail',
      emailOtpPassed: input.emailOtpPassed,
      idCheckPassed: input.idCheckPassed,
      livenessPassed: input.livenessPassed,
      operatorNote: input.operatorNote,
    });
    r.status = 'identity-refused';
    r.reasons = input.reasons;
    r.guardianConfirmations = r.guardianConfirmations.map((c) => ({ ...c, void: true }));
    events.recordEvent('recovery.identity-refused', r.walletAddress, {
      recoveryRequestId: r.id,
      reasons: input.reasons,
      by: input.by,
      operatorNote: input.operatorNote,
      deviceLabel: r.requestedFrom.deviceLabel,
      voidedConfirmations: r.guardianConfirmations.length,
      simulated: true,
    });
    notifyOwner(
      r,
      'recovery-refused',
      COPY.refused.title,
      COPY.refused.body(r.requestedFrom.deviceLabel, shortTime(nowIso())),
      {
        reasons: input.reasons,
      },
    );
    return save(r);
  };

  const finalizeLocal = (r: RecoveryRequest, txHash: Hex | null): RecoveryRequest => {
    const wallet = repo.walletByAddress(r.walletAddress);
    r.status = 'finalized';
    r.onchain = { ...r.onchain, finalizedTxHash: txHash ?? undefined };
    if (wallet) recoveries.swapOwner(wallet.address, wallet.ownerCredentialId, r.newOwner.credentialId);
    events.recordEvent('recovery.finalized', r.walletAddress, {
      recoveryRequestId: r.id,
      txHash,
      newOwnerCredentialId: r.newOwner.credentialId,
      newOwnerProxy: r.newOwner.signerProxyAddress,
      revokedCredentialId: wallet?.ownerCredentialId,
    });
    notifyOwner(r, 'recovery-finalized', COPY.finalized.title, COPY.finalized.body, { txHash });
    return save(r);
  };

  const cancelLocal = (r: RecoveryRequest, txHash: Hex | null): RecoveryRequest => {
    r.status = 'cancelled';
    r.onchain = { ...r.onchain, cancelledTxHash: txHash };
    recoveries.markWalletDeployed(r.walletAddress);
    events.recordEvent('recovery.cancelled', r.walletAddress, {
      recoveryRequestId: r.id,
      txHash,
      message: COPY.cancelled.title,
    });
    notifyOwner(r, 'recovery-cancelled', COPY.cancelled.title, COPY.cancelled.body, { txHash });
    return save(r);
  };

  // Finalizer bookkeeping: only record a "deferred" event when the guardian's answer changes (no 5 s spam).
  const lastDeferral = new Map<string, string>();

  /** One finalizer pass over every executed-waiting request. Idempotent; safe to call concurrently-guarded. */
  const tick = async (now: () => number = Date.now): Promise<void> => {
    for (const r of recoveries.listByStatus('executed-waiting')) {
      try {
        const wallet = getAddress(r.walletAddress);
        const status = await chain.recoveryStatus(wallet);
        if (status.pending) {
          const executeAfter = status.executeAfter;
          if (executeAfter && r.onchain.executeAfter !== executeAfter.toISOString()) {
            r.onchain = { ...r.onchain, executeAfter: executeAfter.toISOString() };
            save(r);
          }
          if (!executeAfter || now() < executeAfter.getTime()) continue;
          const res = await chain.sqGuardian.finalize(r.id);
          if (res.ok) {
            lastDeferral.delete(r.id);
            finalizeLocal(r, res.txHash);
          } else {
            const key = res.reasons.join('|');
            if (lastDeferral.get(r.id) !== key) {
              lastDeferral.set(r.id, key);
              events.recordEvent('recovery.finalize-deferred', r.walletAddress, {
                recoveryRequestId: r.id,
                status: res.status,
                reasons: res.reasons,
              });
            }
          }
          continue;
        }
        // No pending request on the module any more: finalized by someone else, or cancelled by the owner.
        const owners = await chain.safeOwners(wallet);
        if (owners.some((o) => isAddressEqual(o, getAddress(r.newOwner.signerProxyAddress)))) {
          finalizeLocal(r, null);
        } else {
          const txHash = await chain.findCancelTx(wallet, undefined).catch(() => null);
          cancelLocal(r, txHash);
        }
      } catch (err) {
        warn({ recoveryRequestId: r.id, err }, 'finalizer pass failed for one request');
      }
    }
  };

  /** What the Safety key / Emergency card sign right now (module nonce read live). */
  const typedDataFor = async (r: RecoveryRequest) => {
    const nonce = await chain.recoveryNonce(getAddress(r.walletAddress));
    return {
      nonce,
      typedData: recoveryTypedData({
        wallet: getAddress(r.walletAddress),
        newOwners: [getAddress(r.newOwner.signerProxyAddress)],
        threshold: 1n,
        nonce,
        chainId: config.CHAIN_ID,
        module,
      }),
    };
  };

  return {
    view,
    save,
    notifyOwner,
    passIdentity,
    refuseIdentity,
    askSwissquote,
    maybeExecute,
    markExecuted,
    finalizeLocal,
    cancelLocal,
    typedDataFor,
    tick,
  };
};
export type RecoveryService = ReturnType<typeof createRecoveryService>;
