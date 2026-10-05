// The ONLY surface through which a guardian process can touch the chain. By construction it exposes
// exactly two write operations (confirm, finalize) on the SocialRecoveryModule — no generic Safe
// transaction, no transfer. Wave 2 swaps `stubChainPort` for a one-file adapter over @keyline/chain.
import type { Address, Hex } from 'viem';
import { keccak256, toHex } from 'viem';

export interface RecoveryChainPort {
  /** Which implementation is live; surfaced in /health so nobody mistakes the stub for the chain. */
  readonly kind: 'stub' | 'real';
  isGuardian(wallet: Address, guardian: Address): Promise<boolean>;
  threshold(wallet: Address): Promise<number>;
  /** Confirmations collected so far for this exact (wallet, newOwners, newThreshold) request. */
  approvals(wallet: Address, newOwners: Address[], newThreshold: number): Promise<number>;
  status(wallet: Address): Promise<{ pending: boolean; executeAfter?: number; newOwners?: Address[] }>;
  confirmAsGuardian(p: {
    wallet: Address;
    newOwners: Address[];
    newThreshold: number;
    execute: boolean;
  }): Promise<{ txHash: Hex }>;
  finalize(p: { wallet: Address }): Promise<{ txHash: Hex }>;
}

export type ConfirmCall = Parameters<RecoveryChainPort['confirmAsGuardian']>[0];

export interface StubChainPortOptions {
  /** Guardian set per wallet (lower-cased lookups). Default: nobody is a guardian. */
  guardians?: Record<string, Address[]>;
  /** Threshold per wallet; default 2. */
  threshold?: Record<string, number> | number;
  /** Pre-existing approvals per request key; default 0. */
  approvals?: Record<string, number>;
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
  const executed = new Map<string, { executeAfter: number; newOwners: Address[] }>();
  const confirmCalls: ConfirmCall[] = [];
  const finalizeCalls: { wallet: Address }[] = [];
  let txCounter = 0;

  const thresholdFor = (wallet: Address): number => {
    if (typeof opts.threshold === 'number') return opts.threshold;
    return opts.threshold?.[wallet.toLowerCase()] ?? opts.threshold?.[wallet] ?? 2;
  };

  return {
    kind: 'stub',
    confirmCalls,
    finalizeCalls,
    setExecuted(wallet, newOwners, executeAfter) {
      executed.set(wallet.toLowerCase(), { executeAfter, newOwners });
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
    async status(wallet) {
      const e = executed.get(wallet.toLowerCase());
      return e ? { pending: true, executeAfter: e.executeAfter, newOwners: e.newOwners } : { pending: false };
    },
    async confirmAsGuardian(p) {
      confirmCalls.push({ ...p, newOwners: [...p.newOwners] });
      const key = requestKey(p.wallet, p.newOwners, p.newThreshold);
      approvals.set(key, (approvals.get(key) ?? 0) + 1);
      if (p.execute) {
        executed.set(p.wallet.toLowerCase(), {
          executeAfter: Math.floor(now() / 1000) + grace,
          newOwners: [...p.newOwners],
        });
      }
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
      return { txHash };
    },
  };
}
