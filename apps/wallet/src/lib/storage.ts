// Per-browser-profile state. localStorage holds only public material (addresses, passkey public key,
// credential id); the laptop's Safety key lives in IndexedDB. The Emergency card key is never stored anywhere.
import type { Address, Hex } from 'viem';
import { z } from 'zod';

const HexSchema = z.string().regex(/^0x[0-9a-fA-F]*$/);
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const LocalWalletSchema = z.object({
  address: AddressSchema,
  credentialId: z.string().min(1),
  pubKeyX: HexSchema,
  pubKeyY: HexSchema,
  deviceLabel: z.string().min(1),
  status: z.enum(['pending', 'deployed']).default('pending'),
  protectTxHash: HexSchema.optional(),
  attested: z.boolean().default(false),
  recoveryMode: z.enum(['default', 'assisted']).default('default'),
  guardians: z
    .object({
      safetyKey: AddressSchema.optional(),
      emergencyCard: AddressSchema.optional(),
      swissquote: AddressSchema.optional(),
    })
    .default({}),
  onboardingStep: z.number().int().min(1).max(7).default(1),
});
export type LocalWallet = z.infer<typeof LocalWalletSchema>;

export const LocalTransferSchema = z.object({
  userOpHash: HexSchema,
  to: AddressSchema,
  toLabel: z.string(),
  amountUsdc: z.number(),
  amountChf: z.number(),
  at: z.string(),
  status: z.enum(['signed', 'sent', 'included', 'confirmed', 'failed']),
  txHash: HexSchema.optional(),
  blockNumber: z.number().optional(),
  timeline: z
    .object({
      signedAt: z.string().optional(),
      sentAt: z.string().optional(),
      includedAt: z.string().optional(),
      confirmedAt: z.string().optional(),
    })
    .default({}),
  decisionId: z.string().optional(),
  /** dApp operations: the bank's decode of the call (shown instead of an amount on /activity). */
  summary: z.string().optional(),
  /** WalletConnect operations: the receipt hero (amount / limit) and who asked (DESIGN-AUDIT WC-14). */
  dapp: z
    .object({
      amount: z.string().optional(),
      /** The signed call grants an unlimited allowance (maxUint256): the receipt says so in danger tone. */
      unlimited: z.boolean().optional(),
      name: z.string(),
      url: z.string(),
      icon: z.string().optional(),
      verification: z.enum(['verified', 'unverified', 'flagged']),
    })
    .optional(),
});
export type LocalTransfer = z.infer<typeof LocalTransferSchema>;

const KEYS = {
  device: 'keyline.device',
  wallet: 'keyline.wallet',
  transfers: 'keyline.transfers',
  topups: 'keyline.topups',
  pendingSend: 'keyline.pendingSend',
} as const;

function read<T>(key: string, schema: z.ZodType<T>): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the screens re-fetch from the bank in that case.
  }
}

export const walletStore = {
  get: (): LocalWallet | null => read(KEYS.wallet, LocalWalletSchema),
  set: (wallet: LocalWallet): void => write(KEYS.wallet, wallet),
  update: (patch: Partial<LocalWallet>): LocalWallet | null => {
    const current = read(KEYS.wallet, LocalWalletSchema);
    if (!current) return null;
    const next = { ...current, ...patch, guardians: { ...current.guardians, ...(patch.guardians ?? {}) } };
    write(KEYS.wallet, next);
    return next;
  },
  clear: (): void => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(KEYS.wallet);
  },
};

const TransfersSchema = z.array(LocalTransferSchema);

export const transferStore = {
  list: (): LocalTransfer[] => read(KEYS.transfers, TransfersSchema) ?? [],
  get: (userOpHash: string): LocalTransfer | null =>
    transferStore.list().find((t) => t.userOpHash.toLowerCase() === userOpHash.toLowerCase()) ?? null,
  upsert: (transfer: LocalTransfer): void => {
    const rest = transferStore.list().filter((t) => t.userOpHash !== transfer.userOpHash);
    write(KEYS.transfers, [transfer, ...rest]);
  },
};

export const LocalTopupSchema = z.object({
  txHash: HexSchema,
  amountUsdc: z.number(),
  amountChf: z.number(),
  at: z.string(),
});
export type LocalTopup = z.infer<typeof LocalTopupSchema>;

export const topupStore = {
  list: (): LocalTopup[] => read(KEYS.topups, z.array(LocalTopupSchema)) ?? [],
  add: (topup: LocalTopup): void => write(KEYS.topups, [topup, ...topupStore.list()]),
};

/** The draft carried from /send to /send/review (sessionStorage would also do; localStorage survives reloads). */
export const PendingSendSchema = z.object({
  to: AddressSchema,
  toLabel: z.string(),
  knownContact: z.boolean(),
  /** Zero for a dApp permission request (no USDC leaves the wallet at signing time). */
  amountChf: z.number().nonnegative(),
  amountUsdc: z.number().nonnegative(),
  /** Present when the draft is a dApp request from /dapps: the review evaluates `kind: 'dapp'` with these calls. */
  dapp: z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string(),
      calls: z.array(z.object({ to: AddressSchema, value: z.string(), data: HexSchema })),
      /** SPEC §11.2: the WalletConnect request this review answers (`eth_sendTransaction` / `wallet_sendCalls`). */
      wc: z
        .object({
          topic: z.string().min(1),
          requestId: z.number(),
          method: z.enum(['eth_sendTransaction', 'wallet_sendCalls']),
          url: z.string(),
          icon: z.string().optional(),
          verification: z.enum(['verified', 'unverified', 'flagged']),
          origin: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type PendingSend = z.infer<typeof PendingSendSchema>;

/** Fired on window when a new draft replaces the one /send/review may be showing (WalletConnect requests). */
export const PENDING_SEND_EVENT = 'keyline:pending-send';

export const pendingSendStore = {
  get: (): PendingSend | null => read(KEYS.pendingSend, PendingSendSchema),
  set: (draft: PendingSend): void => write(KEYS.pendingSend, draft),
  clear: (): void => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(KEYS.pendingSend);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// IndexedDB — the laptop's Safety key (prototype: software key). Tiny idb-keyval-style wrapper over raw IndexedDB.
// ---------------------------------------------------------------------------------------------------------------

const DB_NAME = 'keyline';
const STORE = 'keys';
const SAFETY_KEY_ID = 'safety-key';

/**
 * ONE Safety key per browser profile; it may guard several wallets (each registers the same `address` as its
 * `safety-key` recoverer). Never generate a second key while one exists: overwriting it would silently break the
 * recovery of every wallet it already guards.
 */
export interface SafetyKeyRecord {
  readonly id: typeof SAFETY_KEY_ID;
  readonly privateKey: Hex;
  /** The guardian address registered on each wallet. Signing looks the key up by this, never by wallet. */
  readonly address: Address;
  /** Every wallet this key guards (oldest first). */
  readonly walletAddresses: readonly Address[];
  readonly label: 'prototype: software key';
  readonly createdAt: string;
}

/** Records written before multi-wallet support carried a single `walletAddress`. */
export type StoredSafetyKey = Omit<SafetyKeyRecord, 'walletAddresses'> & {
  walletAddresses?: readonly Address[];
  walletAddress?: Address;
};

export function normalizeSafetyKey(stored: StoredSafetyKey): SafetyKeyRecord {
  const { walletAddress, walletAddresses, ...rest } = stored;
  const list = [...(walletAddresses ?? []), ...(walletAddress ? [walletAddress] : [])];
  const unique = list.filter((w, i) => list.findIndex((x) => x.toLowerCase() === w.toLowerCase()) === i);
  return { ...rest, walletAddresses: unique };
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export const safetyKeyStore = {
  /** This profile's Safety key (legacy single-wallet records are migrated in place). */
  async get(): Promise<SafetyKeyRecord | null> {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const stored = (await requestToPromise(tx.objectStore(STORE).get(SAFETY_KEY_ID))) as
        | StoredSafetyKey
        | undefined;
      if (!stored) return null;
      const record = normalizeSafetyKey(stored);
      if (stored.walletAddress !== undefined || !stored.walletAddresses)
        await requestToPromise(tx.objectStore(STORE).put(record));
      return record;
    } finally {
      db.close();
    }
  },
  /** The key whose address is `guardianAddress` (a wallet's registered `safety-key` recoverer), else null. */
  async forGuardian(guardianAddress: string): Promise<SafetyKeyRecord | null> {
    const record = await safetyKeyStore.get();
    return record && sameAddress(record.address, guardianAddress) ? record : null;
  },
  /**
   * The first key of this profile. Refuses to overwrite: an existing key must be reused via `addWallet`.
   */
  async create(record: Omit<SafetyKeyRecord, 'id' | 'label'>): Promise<SafetyKeyRecord> {
    const full: SafetyKeyRecord = { id: SAFETY_KEY_ID, label: 'prototype: software key', ...record };
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      // `add` (not `put`) fails if a key already exists — never replace a Safety key.
      await requestToPromise(tx.objectStore(STORE).add(full));
      return full;
    } finally {
      db.close();
    }
  },
  /** Records that the existing key now also guards `walletAddress` (no-op if it already does). */
  async addWallet(walletAddress: Address): Promise<SafetyKeyRecord> {
    const record = await safetyKeyStore.get();
    if (!record) throw new Error('no Safety key in this browser');
    if (record.walletAddresses.some((w) => sameAddress(w, walletAddress))) return record;
    const next: SafetyKeyRecord = { ...record, walletAddresses: [...record.walletAddresses, walletAddress] };
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      await requestToPromise(tx.objectStore(STORE).put(next));
      return next;
    } finally {
      db.close();
    }
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Recovery in progress on this device (new phone / thief): the recovery id plus the NEW passkey's public material.
// The wallet address comes from the bank's RecoveryRequest, never re-derived (DECISIONS #16).
// ---------------------------------------------------------------------------------------------------------------

export const PendingRecoverySchema = z.object({
  recoveryId: z.string().min(1).optional(),
  walletAddress: AddressSchema.optional(),
  email: z.string().optional(),
  newPasskey: z
    .object({ credentialId: z.string().min(1), pubKeyX: HexSchema, pubKeyY: HexSchema })
    .optional(),
  /** Last status seen from the bank; the screens re-fetch, this only picks the step to resume at. */
  status: z.string().optional(),
  reasons: z.array(z.string()).default([]),
  startedAt: z.string(),
});
export type PendingRecovery = z.infer<typeof PendingRecoverySchema>;

const RECOVERY_KEY = 'keyline.recovery';

export const recoveryStore = {
  get: (): PendingRecovery | null => read(RECOVERY_KEY, PendingRecoverySchema),
  set: (value: PendingRecovery): void => write(RECOVERY_KEY, value),
  update: (patch: Partial<PendingRecovery>): PendingRecovery => {
    const current = read(RECOVERY_KEY, PendingRecoverySchema) ?? {
      reasons: [],
      startedAt: new Date().toISOString(),
    };
    const next = { ...current, ...patch };
    write(RECOVERY_KEY, next);
    return next;
  },
  clear: (): void => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(RECOVERY_KEY);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Desk operator token — sessionStorage only (gone when the desk tab closes). Simulated SSO.
// ---------------------------------------------------------------------------------------------------------------

const DESK_TOKEN_KEY = 'keyline.desk.token';

export const deskTokenStore = {
  get: (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return window.sessionStorage.getItem(DESK_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string): void => {
    try {
      window.sessionStorage.setItem(DESK_TOKEN_KEY, token);
    } catch {
      // sessionStorage unavailable: the operator signs in again on the next page
    }
  },
  clear: (): void => {
    try {
      window.sessionStorage.removeItem(DESK_TOKEN_KEY);
    } catch {
      // nothing to clear
    }
  },
};
