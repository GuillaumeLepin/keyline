// The ONLY surface through which a guardian process can touch the chain. By construction it exposes
// exactly two write operations (confirm, finalize) on the SocialRecoveryModule — no generic Safe
// transaction, no transfer. `chain-real.ts` is the one-file adapter over @keyline/chain; this file
// holds the interface and the SIMULATED stub used by tests.
import type { Address, Hex } from 'viem';
import { keccak256, toHex } from 'viem';

/** Who submits a real transaction. The stub reports 'stub' so nobody mistakes it for the chain. */
export type SubmitterKind = 'eoa' | 'sponsored-safe' | 'stub';

export interface SubmitterInfo {
  kind: SubmitterKind;
  /** `msg.sender` the module will see for finalize (EOA or the guardian's own sponsored Safe). */
  address: Address;
}

export interface RecoveryStatusView {
  pending: boolean;
  /** unix seconds */
  executeAfter?: number;
  newOwners?: Address[];
}

export interface RecoveryChainPort {
  /** Which implementation is live; surfaced in /health so nobody mistakes the stub for the chain. */
  readonly kind: 'stub' | 'real';
  isGuardian(wallet: Address, guardian: Address): Promise<boolean>;
  threshold(wallet: Address): Promise<number>;
  /** Confirmations collected so far for this exact (wallet, newOwners, newThreshold) request. */
  approvals(wallet: Address, newOwners: Address[], newThreshold: number): Promise<number>;
  /** `module.nonce(wallet)` — what an EIP-712 ExecuteRecovery signature is bound to (bumped at execute). */
  nonce(wallet: Address): Promise<bigint>;
  status(wallet: Address): Promise<RecoveryStatusView>;
  /** Which submitter `finalize` would use right now (for /health and the finalize response). */
  describeSubmitter(): Promise<SubmitterInfo>;
  confirmAsGuardian(p: {
    wallet: Address;
    newOwners: Address[];
    newThreshold: number;
    execute: boolean;
  }): Promise<{ txHash: Hex }>;
  finalize(p: { wallet: Address }): Promise<{ txHash: Hex; submitter: SubmitterKind }>;
}

export type ConfirmCall = Parameters<RecoveryChainPort['confirmAsGuardian']>[0];

export interface StubChainPortOptions {
  /** Guardian set per wallet (lower-cased lookups). Default: nobody is a guardian. */
  guardians?: Record<string, Address[]>;
  /** Threshold per wallet; default 2. */
  threshold?: Record<string, number> | number;
  /** Pre-existing approvals per request key; default 0. */
  approvals?: Record<string, number>;
  /** Starting nonce per wallet (lower-cased); default 0. */
  nonces?: Record<string, bigint>;
  /** Grace period applied when a confirmation executes; default 180 s (the testing module). */
  gracePeriodSeconds?: number;
  now?: () => number;
  log?: (msg: string, data?: Record<string, unknown>) => void;
}

export interface StubChainPort extends RecoveryChainPort {
  readonly kind: 'stub';
  /** Every confirm call, in order, so tests can assert the exact payload. */
  readonly confirmCalls: ConfirmCall[];
  readonly finalizeCalls: { wallet: Address }[];
  /** Test helper: move a wallet into the executed state with a given executeAfter (unix seconds). */
  setExecuted(wallet: Address, newOwners: Address[], executeAfter: number): void;
}

const requestKey = (wallet: Address, newOwners: Address[], newThreshold: number) =>
  `${wallet.toLowerCase()}|${newOwners.map((o) => o.toLowerCase()).join(',')}|${newThreshold}`;

/** Deterministic, obviously-fake hash: keccak of the call description. Never confusable with a real tx. */
const fakeTxHash = (label: string, n: number): Hex => keccak256(toHex(`SIMULATED:${label}:${n}`));

const STUB_SUBMITTER: Address = '0x0000000000000000000000000000000000000000';

export function stubChainPort(opts: StubChainPortOptions = {}): StubChainPort {
  const now = opts.now ?? (() => Date.now());
  const grace = opts.gracePeriodSeconds ?? 180;
  const log = opts.log ?? (() => {});
  const guardians = new Map<string, Set<string>>(
    Object.entries(opts.guardians ?? {}).map(([w, gs]) => [
      w.toLowerCase(),
      new Set(gs.map((g) => g.toLowerCase())),
    ]),
  );
  const approvals = new Map<string, number>(Object.entries(opts.approvals ?? {}));
  const nonces = new Map<string, bigint>(
    Object.entries(opts.nonces ?? {}).map(([w, n]) => [w.toLowerCase(), n]),
  );
  const executed = new Map<string, { executeAfter: number; newOwners: Address[] }>();
  const confirmCalls: ConfirmCall[] = [];
  const finalizeCalls: { wallet: Address }[] = [];
  let txCounter = 0;

  const thresholdFor = (wallet: Address): number => {
    if (typeof opts.threshold === 'number') return opts.threshold;
    return opts.threshold?.[wallet.toLowerCase()] ?? opts.threshold?.[wallet] ?? 2;
  };
  // VERIFIED §12: the module bumps nonce(wallet) when the recovery is EXECUTED, not at finalize/cancel.
  const markExecuted = (wallet: Address, newOwners: Address[], executeAfter: number) => {
    executed.set(wallet.toLowerCase(), { executeAfter, newOwners: [...newOwners] });
    nonces.set(wallet.toLowerCase(), (nonces.get(wallet.toLowerCase()) ?? 0n) + 1n);
  };

  return {
    kind: 'stub',
    confirmCalls,
    finalizeCalls,
    setExecuted(wallet, newOwners, executeAfter) {
      markExecuted(wallet, newOwners, executeAfter);
    },
    async isGuardian(wallet, guardian) {
      return guardians.get(wallet.toLowerCase())?.has(guardian.toLowerCase()) ?? false;
    },
    async threshold(wallet) {
      return thresholdFor(wallet);
    },
    async approvals(wallet, newOwners, newThreshold) {
      return approvals.get(requestKey(wallet, newOwners, newThreshold)) ?? 0;
    },
    async nonce(wallet) {
      return nonces.get(wallet.toLowerCase()) ?? 0n;
    },
    async status(wallet) {
      const e = executed.get(wallet.toLowerCase());
      return e ? { pending: true, executeAfter: e.executeAfter, newOwners: e.newOwners } : { pending: false };
    },
    async describeSubmitter() {
      return { kind: 'stub', address: STUB_SUBMITTER };
    },
    async confirmAsGuardian(p) {
      confirmCalls.push({ ...p, newOwners: [...p.newOwners] });
      const key = requestKey(p.wallet, p.newOwners, p.newThreshold);
      approvals.set(key, (approvals.get(key) ?? 0) + 1);
      if (p.execute) markExecuted(p.wallet, p.newOwners, Math.floor(now() / 1000) + grace);
      txCounter += 1;
      const txHash = fakeTxHash('confirmRecovery', txCounter);
      log('SIMULATED chain: confirmRecovery', { wallet: p.wallet, execute: p.execute, txHash });
      return { txHash };
    },
    async finalize(p) {
      finalizeCalls.push({ wallet: p.wallet });
      executed.delete(p.wallet.toLowerCase());
      txCounter += 1;
      const txHash = fakeTxHash('finalizeRecovery', txCounter);
      log('SIMULATED chain: finalizeRecovery', { wallet: p.wallet, txHash });
      return { txHash, submitter: 'stub' };
    },
  };
}
