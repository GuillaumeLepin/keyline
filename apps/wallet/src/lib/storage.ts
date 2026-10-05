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
  amountChf: z.number().positive(),
  amountUsdc: z.number().positive(),
});
export type PendingSend = z.infer<typeof PendingSendSchema>;

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

export interface SafetyKeyRecord {
  readonly id: typeof SAFETY_KEY_ID;
  readonly privateKey: Hex;
  readonly address: Address;
  readonly walletAddress: Address;
  readonly label: 'prototype: software key';
  readonly createdAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
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
  async get(): Promise<SafetyKeyRecord | null> {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readonly');
      const result = await requestToPromise(tx.objectStore(STORE).get(SAFETY_KEY_ID));
      return (result as SafetyKeyRecord | undefined) ?? null;
    } finally {
      db.close();
    }
  },
  async set(record: Omit<SafetyKeyRecord, 'id' | 'label'>): Promise<SafetyKeyRecord> {
    const full: SafetyKeyRecord = { id: SAFETY_KEY_ID, label: 'prototype: software key', ...record };
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      await requestToPromise(tx.objectStore(STORE).put(full));
      return full;
    } finally {
      db.close();
    }
  },
};
