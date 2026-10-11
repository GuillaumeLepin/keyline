// SPEC §11 / DECISIONS #30 — what a dApp asks the wallet to SIGN (personal_sign, SIWE, EIP-712), analysed for policy:
// every address it mentions (for sanctions screening), whether a SIWE message targets another website, and whether
// a Permit / Permit2 / order grants unlimited or never-expiring spending. Pure: no I/O.
import {
  type Address,
  getAddress,
  type Hex,
  hashMessage,
  hashTypedData,
  hexToString,
  isHex,
  keccak256,
  toHex,
} from 'viem';
import { parseSiweMessage } from 'viem/siwe';
import { hostOf } from './dapp-identity';

export const REASON_SIWE_OTHER_SITE = 'This sign-in is for another website';
export const REASON_UNLIMITED_PERMISSION = 'Unlimited spending permission';
export const REASON_NO_SIGNATURE_FEE = 'No network fee for a signature';

/** Amounts at or above this are "unlimited" (catches 2^256-1, Permit2's 2^160-1, 2^128-1…). */
export const UNLIMITED_AMOUNT = 2n ** 128n;
/** Deadlines at or above this (≈ year 36 812) mean "never expires" (catches Permit2's 2^48-1 and 2^256-1). */
export const NO_EXPIRY = 2n ** 40n;

export type SignatureInput = {
  method: 'personal_sign' | 'eth_signTypedData' | 'eth_signTypedData_v4';
  message?: string;
  typedData?: Record<string, unknown>;
  siwe?: { domain: string; uri?: string; chainId?: number; address?: string };
};

export type SignatureAnalysis = {
  /** keccak of the exact digest that will be signed (EIP-191 / EIP-712), bound into the decision as `callsHash`. */
  digest: Hex;
  addresses: Address[];
  siwe?: { domain: string; host: string | null };
  /** Set when a permit / order grants unlimited or never-expiring spending. */
  unlimited?: { spender?: Address; why: 'amount' | 'expiry' };
  /** Short plain-language line for the reasons ("Sign in to localhost:3100", "Sign a message", "Sign Permit"). */
  summary: string;
};

const ADDRESS_RE = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
const AMOUNT_KEY =
  /^(value|amount|allowance|making(amount)?|taking(amount)?|startamount|endamount|maxamount)$/i;
const EXPIRY_KEY = /(deadline|expir|endtime|validto|validuntil)/i;
const SPENDER_KEY = /^(spender|operator|taker|delegate)$/i;

const pushAddress = (out: Address[], raw: string) => {
  try {
    const a = getAddress(raw);
    if (!out.some((x) => x.toLowerCase() === a.toLowerCase())) out.push(a);
  } catch {
    /* not an address */
  }
};

const bigOf = (v: unknown): bigint | null => {
  try {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v));
    if (typeof v === 'string' && /^(0x[0-9a-fA-F]+|\d+)$/.test(v)) return BigInt(v);
  } catch {
    /* ignore */
  }
  return null;
};

/** personal_sign params arrive as hex; show / scan the UTF-8 text when it decodes cleanly. */
export const messageText = (message: string): string => {
  if (!isHex(message)) return message;
  try {
    const text = hexToString(message);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting binary payloads on purpose
    return /[\u0000-\u0008\u000e-\u001f]/.test(text) ? message : text;
  } catch {
    return message;
  }
};

export const analyseSignature = (input: SignatureInput): SignatureAnalysis => {
  const addresses: Address[] = [];
  if (input.method === 'personal_sign') {
    const message = input.message ?? '';
    const text = messageText(message);
    for (const m of `${text}\n${message}`.matchAll(ADDRESS_RE)) pushAddress(addresses, m[0]);
    let siwe: SignatureAnalysis['siwe'];
    const declared = input.siwe?.domain;
    let parsedDomain: string | undefined;
    try {
      parsedDomain = parseSiweMessage(text).domain;
    } catch {
      parsedDomain = undefined;
    }
    const domain = declared ?? parsedDomain;
    if (domain) siwe = { domain, host: hostOf(domain) };
    const digest = keccak256(hashMessage(isHex(message) ? { raw: message } : message));
    return { digest, addresses, siwe, summary: siwe ? `Sign in to ${siwe.domain}` : 'Sign a message' };
  }

  const td = input.typedData ?? {};
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(ADDRESS_RE)) pushAddress(addresses, m[0]);
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x);
    } else if (v && typeof v === 'object') {
      for (const x of Object.values(v)) walk(x);
    }
  };
  walk(td);

  const primaryType = typeof td.primaryType === 'string' ? td.primaryType : '';
  let unlimited: SignatureAnalysis['unlimited'];
  if (/permit|order/i.test(primaryType)) {
    let spender: Address | undefined;
    let why: 'amount' | 'expiry' | undefined;
    const scan = (v: unknown, key = ''): void => {
      if (Array.isArray(v)) {
        for (const x of v) scan(x, key);
        return;
      }
      if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) scan(x, k);
        return;
      }
      if (SPENDER_KEY.test(key) && typeof v === 'string') {
        try {
          spender = getAddress(v);
        } catch {
          /* ignore */
        }
      }
      const n = bigOf(v);
      if (n === null) return;
      if (AMOUNT_KEY.test(key) && n >= UNLIMITED_AMOUNT) why ??= 'amount';
      if (EXPIRY_KEY.test(key) && n >= NO_EXPIRY) why ??= 'expiry';
    };
    scan(td.message);
    if (why) unlimited = { spender, why };
  }

  let digest: Hex;
  try {
    digest = keccak256(hashTypedData(td as Parameters<typeof hashTypedData>[0]));
  } catch {
    digest = keccak256(toHex(JSON.stringify(td)));
  }
  return { digest, addresses, unlimited, summary: primaryType ? `Sign ${primaryType}` : 'Sign typed data' };
};
