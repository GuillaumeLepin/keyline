// SPEC §11.1–11.2 — pure mapping of WalletConnect requests onto what Keyline does with them. No WalletKit, no React:
// unit-tested in requests.test.ts. The wallet side only ever answers for Base Sepolia (eip155:84532) and the Safe.
import { type Address, getAddress, type Hex, isAddress, isHex, numberToHex, toHex } from 'viem';

export const WC_CHAIN_ID = 84532;
export const WC_CHAIN = `eip155:${WC_CHAIN_ID}` as const;
export const WC_CHAIN_HEX = numberToHex(WC_CHAIN_ID); // 0x14a34

export const WC_METHODS = [
  'eth_sendTransaction',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v4',
  'eth_accounts',
  'eth_requestAccounts',
  'eth_chainId',
  'wallet_switchEthereumChain',
  'wallet_getCapabilities',
  'wallet_sendCalls',
  'wallet_getCallsStatus',
] as const;
export const WC_EVENTS = ['accountsChanged', 'chainChanged'] as const;

/** EIP-5792 capabilities for 0x14a34: one userOp is atomic; the bank sponsors (paymaster). */
export function capabilities() {
  return {
    [WC_CHAIN_HEX]: {
      atomic: { status: 'supported' },
      atomicBatch: { supported: true },
      paymasterService: { supported: true },
    },
  };
}

export interface RpcCall {
  readonly to: Address;
  readonly value: string; // decimal wei string, as the bank's CallSchema expects
  readonly data: Hex;
}

/** What the phone has to do with one request. */
export type Classified =
  | { kind: 'transaction'; calls: RpcCall[] }
  | { kind: 'batch'; calls: RpcCall[] }
  | { kind: 'message'; hex: Hex; text: string | null }
  | { kind: 'typed-data'; typedData: TypedDataPayload }
  | { kind: 'calls-status'; id: Hex }
  | { kind: 'instant'; result: unknown }
  | { kind: 'switch-chain'; chainId: string }
  | { kind: 'unsupported'; method: string }
  | { kind: 'invalid'; method: string; reason: string };

export interface TypedDataPayload {
  domain?: {
    name?: string;
    version?: string;
    chainId?: number | string | bigint;
    verifyingContract?: string;
  };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

function toCall(raw: unknown): RpcCall {
  const c = (raw ?? {}) as { to?: string; value?: string | number; data?: string; input?: string };
  if (!c.to || !isAddress(c.to))
    throw new Error('A call without a valid `to` address (contract creation) is not supported.');
  const data = (c.data ?? c.input ?? '0x') as string;
  if (!isHex(data)) throw new Error('Call data is not hex.');
  const value = c.value === undefined || c.value === null ? 0n : BigInt(c.value);
  if (value < 0n) throw new Error('Negative value.');
  return { to: getAddress(c.to), value: value.toString(), data };
}

/** Bytes → UTF-8 text when it is printable, else null (shown as hex only). */
export function readableText(hex: Hex): string | null {
  try {
    const bytes = Uint8Array.from((hex.slice(2).match(/.{1,2}/g) ?? []).map((b) => Number.parseInt(b, 16)));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Control characters other than tab / newline / carriage return mean it isn't meant to be read.
    return Array.from(text).some((ch) => {
      const code = ch.charCodeAt(0);
      return (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
    })
      ? null
      : text;
  } catch {
    return null;
  }
}

function parseTypedData(raw: unknown): TypedDataPayload {
  const value = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  const t = value as Partial<TypedDataPayload> | null;
  if (!t || typeof t !== 'object' || !t.types || !t.primaryType || !t.message) {
    throw new Error('Typed data is missing types, primaryType or message.');
  }
  return t as TypedDataPayload;
}

/** Map a JSON-RPC request onto the flow Keyline runs (SPEC §11.2). `safe` is the connected account. */
export function classify(method: string, params: unknown, safe: Address): Classified {
  const p = Array.isArray(params) ? params : [];
  try {
    switch (method) {
      case 'eth_sendTransaction':
        return { kind: 'transaction', calls: [toCall(p[0])] };
      case 'wallet_sendCalls': {
        const body = (p[0] ?? {}) as { calls?: unknown[]; chainId?: string };
        if (body.chainId && BigInt(body.chainId) !== BigInt(WC_CHAIN_ID)) {
          return { kind: 'switch-chain', chainId: String(body.chainId) };
        }
        const calls = (body.calls ?? []).map(toCall);
        if (calls.length === 0) throw new Error('wallet_sendCalls needs at least one call.');
        return { kind: 'batch', calls };
      }
      case 'wallet_getCallsStatus': {
        const id = p[0];
        if (typeof id !== 'string' || !isHex(id)) throw new Error('Unknown calls id.');
        return { kind: 'calls-status', id };
      }
      case 'personal_sign': {
        // [message, address]; some dApps swap them — take the one that isn't our address.
        const [a, b] = p as string[];
        const message = a && isAddress(a) && b && !isAddress(b) ? b : a;
        if (typeof message !== 'string') throw new Error('No message to sign.');
        const hex: Hex = isHex(message) ? message : toHex(message);
        return { kind: 'message', hex, text: readableText(hex) };
      }
      case 'eth_signTypedData':
      case 'eth_signTypedData_v4': {
        // [address, typedData] (v4); legacy order [typedData, address] is tolerated.
        const raw = typeof p[0] === 'string' && isAddress(p[0]) ? p[1] : p[0];
        return { kind: 'typed-data', typedData: parseTypedData(raw) };
      }
      case 'eth_accounts':
      case 'eth_requestAccounts':
        return { kind: 'instant', result: [safe] };
      case 'eth_chainId':
        return { kind: 'instant', result: WC_CHAIN_HEX };
      case 'wallet_getCapabilities':
        return { kind: 'instant', result: capabilities() };
      case 'wallet_switchEthereumChain': {
        const chainId = String((p[0] as { chainId?: string } | undefined)?.chainId ?? '');
        if (chainId && BigInt(chainId) === BigInt(WC_CHAIN_ID)) return { kind: 'instant', result: null };
        return { kind: 'switch-chain', chainId };
      }
      default:
        return { kind: 'unsupported', method };
    }
  } catch (error) {
    return { kind: 'invalid', method, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** EIP-1193 / EIP-3085 error codes Keyline answers with. */
export const RPC_ERRORS = {
  /** Policy block (SPEC §11.2: "policy blocks answer error 4001 with the policy reason"). */
  blocked: 4001,
  unsupportedChain: 4902,
  unsupportedMethod: 4200,
  invalidParams: -32602,
  internal: -32603,
} as const;

/** Verification chip for a proposal / request, from the Reown Verify context and the metadata url. */
export type Verification = 'verified' | 'unverified' | 'flagged';

export function verificationOf(
  verify: { validation?: string; isScam?: boolean | null; origin?: string } | undefined,
  metadataUrl: string,
): Verification {
  if (!verify) return 'unverified';
  if (verify.isScam || verify.validation === 'INVALID') return 'flagged';
  if (verify.origin && hostOf(verify.origin) !== hostOf(metadataUrl)) return 'flagged';
  return verify.validation === 'VALID' ? 'verified' : 'unverified';
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** One plain line for the bank's request log (DappRequestEventBody.summary, ≤ 500 chars). */
export function summaryOf(c: Classified, appName: string): string {
  const line = (() => {
    switch (c.kind) {
      case 'transaction':
        return `Transaction to ${c.calls[0]?.to ?? '?'} from ${appName}`;
      case 'batch':
        return `${c.calls.length} calls in one transaction from ${appName}`;
      case 'message':
        return c.text ? `Sign message: ${c.text}` : 'Sign a non-text message';
      case 'typed-data':
        return `Sign ${c.typedData.primaryType}${c.typedData.domain?.name ? ` for ${c.typedData.domain.name}` : ''}`;
      case 'calls-status':
        return `Status of ${c.id}`;
      case 'instant':
        return 'Account / chain query';
      case 'switch-chain':
        return `Switch to chain ${c.chainId} (refused: Base Sepolia only)`;
      case 'unsupported':
        return `${c.method} (not supported)`;
      case 'invalid':
        return `${c.method}: ${c.reason}`;
    }
  })();
  return line.slice(0, 500);
}
