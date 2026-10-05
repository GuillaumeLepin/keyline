/**
 * "What will happen" — `eth_simulateV1` (viem `simulateCalls`, `traceAssetChanges: true`) + plain-language decode.
 *
 * Output matches `SimulationSchema` / `DecodedCallSchema` in `@keyline/shared` (the bank wraps it as is):
 *   Simulation { ok, assetChanges: { token, symbol, before, after, delta }[], decodedCalls, gasEstimate,
 *                provider: 'eth_simulateV1' | 'fallback', revertReason?, simulated?: true }
 *   DecodedCall { to, fn, args, humanText, risk: 'none' | 'warn' | 'danger' }
 *
 * `simulate()` never throws for chain reasons: a reverting call gives `ok: false` + `revertReason`; an RPC that
 * does not answer within `timeoutMs` (8 s) or lacks `eth_simulateV1` gives `provider: 'fallback'` (decode only,
 * plus a balance-read estimate for plain token transfers). Decoding is pure viem `decodeFunctionData`.
 */
import type { MetaTransaction } from 'abstractionkit';
import type { Address, Chain, Client, Hex, Transport } from 'viem';
import {
  decodeErrorResult,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  isAddress,
  isAddressEqual,
  maxUint256,
  parseUnits,
} from 'viem';
import { readContract, simulateCalls } from 'viem/actions';
import {
  RECOVERY_MODULE_3_DAYS,
  RECOVERY_MODULE_3_MINUTES,
  RECOVERY_MODULE_7_DAYS,
  RECOVERY_MODULE_14_DAYS,
  WEBAUTHN_SIGNER_FACTORY,
} from './constants.js';

// ---------------------------------------------------------------------------------------------------------------
// Types (structurally identical to the zod schemas in @keyline/shared — the tests parse against them)
// ---------------------------------------------------------------------------------------------------------------

export type Risk = 'none' | 'warn' | 'danger';

export interface DecodedCall {
  readonly to: Address;
  /** Canonical signature, e.g. `transfer(address,uint256)`, or `unknown`. */
  readonly fn: string;
  /** Decoded arguments as strings (addresses checksummed, numbers decimal). */
  readonly args: readonly string[];
  readonly humanText: string;
  readonly risk: Risk;
}

export interface SimulatedAssetChange {
  readonly token: Address;
  readonly symbol: string;
  /** Base units (USDC: 6 decimals, ETH: wei), unsigned decimal strings. */
  readonly before: string;
  readonly after: string;
  /** Signed decimal string. */
  readonly delta: string;
}

export interface Simulation {
  readonly ok: boolean;
  readonly assetChanges: readonly SimulatedAssetChange[];
  readonly decodedCalls: readonly DecodedCall[];
  /** Gas units, decimal string (sum of the simulated calls; heuristic when `provider` is `fallback`). */
  readonly gasEstimate: string;
  readonly provider: 'eth_simulateV1' | 'fallback';
  readonly revertReason?: string;
  /** Set when `provider` is `fallback`: nothing was executed, the panel shows a "decode only" badge. */
  readonly simulated?: true;
}

export interface TokenInfo {
  readonly symbol: string;
  readonly decimals: number;
}

/** The calls `buildUserOp` accepts — `MetaTransaction` or the bank's `{ to, value: string, data }`. */
export interface CallLike {
  readonly to: string;
  readonly value?: bigint | string | undefined;
  readonly data?: string | undefined;
}

export interface DecodeOptions {
  /** Known ERC-20s (address → symbol/decimals). Defaults to USDC on Base Sepolia + Ethereum Sepolia. */
  readonly tokens?: Readonly<Record<string, TokenInfo>>;
  /** The Safe the calls run from — makes `enableModule`/`swapOwner` on it read as account settings. */
  readonly wallet?: Address;
}

// ---------------------------------------------------------------------------------------------------------------
// Known tokens / modules
// ---------------------------------------------------------------------------------------------------------------

/** viem's pseudo-address for the native asset in `eth_simulateV1` asset changes. */
export const ETH_PSEUDO_ADDRESS: Address = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const KNOWN_TOKENS: Readonly<Record<string, TokenInfo>> = {
  // Circle USDC, Base Sepolia
  '0x036cbd53842c5426634e7929541ec2318f3dcf7e': { symbol: 'USDC', decimals: 6 },
  // Circle USDC, Ethereum Sepolia
  '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': { symbol: 'USDC', decimals: 6 },
};

const KNOWN_RECOVERY_MODULES: ReadonlySet<string> = new Set(
  [RECOVERY_MODULE_3_MINUTES, RECOVERY_MODULE_3_DAYS, RECOVERY_MODULE_7_DAYS, RECOVERY_MODULE_14_DAYS].map(
    (a) => a.toLowerCase(),
  ),
);

/** Allowances at or above this are treated as unlimited (2^255; `maxUint256` is the usual "∞"). */
export const UNLIMITED_ALLOWANCE_THRESHOLD = 1n << 255n;

export function isUnlimitedAllowance(value: bigint): boolean {
  return value >= UNLIMITED_ALLOWANCE_THRESHOLD;
}

// ---------------------------------------------------------------------------------------------------------------
// ABI fragments we decode (viem `decodeFunctionData` picks the fragment by selector)
// ---------------------------------------------------------------------------------------------------------------

const DECODE_ABI = [
  ...erc20Abi,
  {
    type: 'function',
    name: 'permit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'safeTransferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
  // Safe account settings
  {
    type: 'function',
    name: 'enableModule',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'module', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'swapOwner',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'prevOwner', type: 'address' },
      { name: 'oldOwner', type: 'address' },
      { name: 'newOwner', type: 'address' },
    ],
    outputs: [],
  },
  // Candide SocialRecoveryModule
  {
    type: 'function',
    name: 'addGuardianWithThreshold',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'guardian', type: 'address' },
      { name: 'threshold', type: 'uint256' },
    ],
    outputs: [],
  },
  { type: 'function', name: 'cancelRecovery', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  // SafeWebAuthnSignerFactory
  {
    type: 'function',
    name: 'createSigner',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'x', type: 'uint256' },
      { name: 'y', type: 'uint256' },
      { name: 'verifiers', type: 'uint176' },
    ],
    outputs: [{ name: 'signer', type: 'address' }],
  },
] as const;

const REVERT_ABI = [
  { type: 'error', name: 'Error', inputs: [{ name: 'message', type: 'string' }] },
  { type: 'error', name: 'Panic', inputs: [{ name: 'code', type: 'uint256' }] },
] as const;

// ---------------------------------------------------------------------------------------------------------------
// decodeCalls
// ---------------------------------------------------------------------------------------------------------------

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function toBigint(value: bigint | string | undefined): bigint {
  if (value === undefined || value === '') return 0n;
  return typeof value === 'bigint' ? value : BigInt(value);
}

function tokenInfo(address: Address, options: DecodeOptions): TokenInfo | undefined {
  const key = address.toLowerCase();
  return options.tokens?.[key] ?? KNOWN_TOKENS[key];
}

/** "1 USDC" for a known token, "1000000 units of the token at 0x…" otherwise. */
export function formatTokenAmount(amount: bigint, token: Address, options: DecodeOptions = {}): string {
  const info = tokenInfo(token, options);
  return info
    ? `${formatUnits(amount, info.decimals)} ${info.symbol}`
    : `${amount.toString()} units of the token at ${shortAddress(token)}`;
}

function tokenName(token: Address, options: DecodeOptions): string {
  return tokenInfo(token, options)?.symbol ?? `the token at ${shortAddress(token)}`;
}

function ethPrefix(value: bigint): string {
  return value > 0n ? `Send ${formatEther(value)} ETH and ` : '';
}

function decodeOne(call: CallLike, options: DecodeOptions): DecodedCall {
  const to = getAddress(call.to);
  const value = toBigint(call.value);
  const data = (call.data && call.data !== '' ? call.data : '0x') as Hex;

  if (data === '0x' || data.length < 10) {
    return value > 0n
      ? {
          to,
          fn: 'eth-transfer',
          args: [to, value.toString()],
          humanText: `Send ${formatEther(value)} ETH to ${shortAddress(to)}`,
          risk: 'none',
        }
      : { to, fn: 'call', args: [], humanText: `Call ${shortAddress(to)} with no data`, risk: 'warn' };
  }

  let decoded: ReturnType<typeof decodeFunctionData<typeof DECODE_ABI>>;
  try {
    decoded = decodeFunctionData({ abi: DECODE_ABI, data });
  } catch {
    return {
      to,
      fn: 'unknown',
      args: [data.slice(0, 10)],
      humanText: `${ethPrefix(value)}Unknown action on ${shortAddress(to)}`.replace(
        /^Send (.*) ETH and Unknown/,
        'Send $1 ETH and run an unknown',
      ),
      risk: 'warn',
    };
  }

  const prefix = ethPrefix(value);
  switch (decoded.functionName) {
    case 'transfer': {
      const [recipient, amount] = decoded.args;
      return {
        to,
        fn: 'transfer(address,uint256)',
        args: [getAddress(recipient), amount.toString()],
        humanText: `${prefix}Send ${formatTokenAmount(amount, to, options)} to ${shortAddress(recipient)}`,
        risk: 'none',
      };
    }
    case 'approve': {
      const [spender, amount] = decoded.args;
      const args = [getAddress(spender), amount.toString()];
      if (isUnlimitedAllowance(amount)) {
        return {
          to,
          fn: 'approve(address,uint256)',
          args,
          humanText: `This lets ${shortAddress(spender)} spend an unlimited amount of ${tokenName(to, options)} — we recommend a cap`,
          risk: 'danger',
        };
      }
      if (amount === 0n) {
        return {
          to,
          fn: 'approve(address,uint256)',
          args,
          humanText: `Revoke ${shortAddress(spender)}'s permission to spend your ${tokenName(to, options)}`,
          risk: 'none',
        };
      }
      return {
        to,
        fn: 'approve(address,uint256)',
        args,
        humanText: `Allow ${shortAddress(spender)} to spend up to ${formatTokenAmount(amount, to, options)} on your behalf`,
        risk: 'warn',
      };
    }
    case 'transferFrom': {
      const [from, recipient, amount] = decoded.args;
      return {
        to,
        fn: 'transferFrom(address,address,uint256)',
        args: [getAddress(from), getAddress(recipient), amount.toString()],
        humanText: `Move ${formatTokenAmount(amount, to, options)} from ${shortAddress(from)} to ${shortAddress(recipient)} using an existing allowance`,
        risk: 'warn',
      };
    }
    case 'permit': {
      const [owner, spender, amount, deadline] = decoded.args;
      const until =
        deadline >= maxUint256
          ? 'with no expiry'
          : `until ${new Date(Number(deadline) * 1000).toISOString()}`;
      const unlimited = isUnlimitedAllowance(amount);
      return {
        to,
        fn: 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
        args: [getAddress(owner), getAddress(spender), amount.toString(), deadline.toString()],
        humanText: unlimited
          ? `This signed permit lets ${shortAddress(spender)} spend an unlimited amount of ${tokenName(to, options)} ${until} — we recommend a cap`
          : `Signed permit: ${shortAddress(spender)} may spend up to ${formatTokenAmount(amount, to, options)} of ${shortAddress(owner)}'s balance ${until}`,
        risk: unlimited ? 'danger' : 'warn',
      };
    }
    case 'setApprovalForAll': {
      const [operator, approved] = decoded.args;
      return {
        to,
        fn: 'setApprovalForAll(address,bool)',
        args: [getAddress(operator), String(approved)],
        humanText: approved
          ? `This lets ${shortAddress(operator)} move every item you hold in the collection at ${shortAddress(to)} — only continue if you trust them`
          : `Revoke ${shortAddress(operator)}'s access to your items in the collection at ${shortAddress(to)}`,
        risk: approved ? 'danger' : 'none',
      };
    }
    case 'safeTransferFrom': {
      const [from, recipient, tokenId] = decoded.args;
      return {
        to,
        fn: 'safeTransferFrom(address,address,uint256)',
        args: [getAddress(from), getAddress(recipient), tokenId.toString()],
        humanText: `Send item #${tokenId.toString()} from the collection at ${shortAddress(to)} to ${shortAddress(recipient)}`,
        risk: 'none',
      };
    }
    case 'enableModule': {
      const [module] = decoded.args;
      const known = KNOWN_RECOVERY_MODULES.has(module.toLowerCase());
      return {
        to,
        fn: 'enableModule(address)',
        args: [getAddress(module)],
        humanText: known
          ? 'Turn on recovery for this wallet'
          : `This gives ${shortAddress(module)} full control over your wallet — only continue if you know exactly what it is`,
        risk: known ? 'none' : 'danger',
      };
    }
    case 'swapOwner': {
      const [prev, oldOwner, newOwner] = decoded.args;
      const isSelf = options.wallet !== undefined && isAddressEqual(options.wallet, to);
      return {
        to,
        fn: 'swapOwner(address,address,address)',
        args: [getAddress(prev), getAddress(oldOwner), getAddress(newOwner)],
        humanText: `Replace the key ${shortAddress(oldOwner)} with ${shortAddress(newOwner)} as the owner of ${isSelf ? 'this wallet' : shortAddress(to)}`,
        risk: isSelf ? 'none' : 'warn',
      };
    }
    case 'addGuardianWithThreshold': {
      const [guardian, threshold] = decoded.args;
      return {
        to,
        fn: 'addGuardianWithThreshold(address,uint256)',
        args: [getAddress(guardian), threshold.toString()],
        humanText: `Add recoverer ${shortAddress(guardian)} · ${threshold.toString()} needed to restore`,
        risk: 'none',
      };
    }
    case 'cancelRecovery':
      return {
        to,
        fn: 'cancelRecovery()',
        args: [],
        humanText: 'Cancel the pending recovery of this wallet',
        risk: 'none',
      };
    case 'createSigner': {
      const [x, y, verifiers] = decoded.args;
      const factory = isAddressEqual(to, WEBAUTHN_SIGNER_FACTORY);
      return {
        to,
        fn: 'createSigner(uint256,uint256,uint176)',
        args: [x.toString(), y.toString(), verifiers.toString()],
        humanText: factory
          ? 'Register your passkey as an on-chain signer'
          : `Create a signer contract through ${shortAddress(to)}`,
        risk: factory ? 'none' : 'warn',
      };
    }
    default:
      return {
        to,
        fn: 'unknown',
        args: [data.slice(0, 10)],
        humanText: `${prefix}Unknown action on ${shortAddress(to)}`,
        risk: 'warn',
      };
  }
}

/** Plain-language decode of each call (pure; no RPC). Unknown selectors are `warn`, unlimited approvals `danger`. */
export function decodeCalls(calls: readonly CallLike[], options: DecodeOptions = {}): DecodedCall[] {
  return calls.map((call) => decodeOne(call, options));
}

/** The highest risk across the decoded calls (what the review screen colours the header with). */
export function worstRisk(calls: readonly DecodedCall[]): Risk {
  const rank: Record<Risk, number> = { none: 0, warn: 1, danger: 2 };
  return calls.reduce<Risk>((worst, call) => (rank[call.risk] > rank[worst] ? call.risk : worst), 'none');
}

/**
 * "Approve 100 USDC instead": the same `approve(spender, …)` call with the allowance capped at `amount` (human units,
 * e.g. "100" → 100 USDC with 6 decimals). Throws if the call is not an ERC-20 `approve`.
 */
export function suggestedApprovalCap(
  call: CallLike,
  amount: string | number | bigint,
  options: DecodeOptions = {},
): MetaTransaction {
  const to = getAddress(call.to);
  const decoded = decodeFunctionData({ abi: erc20Abi, data: (call.data ?? '0x') as Hex });
  if (decoded.functionName !== 'approve')
    throw new Error(`suggestedApprovalCap: not an approve call (${decoded.functionName})`);
  const [spender] = decoded.args;
  const decimals = tokenInfo(to, options)?.decimals ?? 18;
  const cap = typeof amount === 'bigint' ? amount : parseUnits(String(amount), decimals);
  return {
    to,
    value: toBigint(call.value),
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [getAddress(spender), cap] }),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// simulate
// ---------------------------------------------------------------------------------------------------------------

type ReadClient = Client<Transport, Chain | undefined>;

export interface SimulateInput {
  readonly client: ReadClient;
  /** The Safe (msg.sender of every call). */
  readonly from: Address;
  readonly calls: readonly CallLike[];
  /** ERC-20s to always report (before/after even when unchanged) and to use for the fallback estimate. */
  readonly tokens?: readonly Address[];
  /** Give up on `eth_simulateV1` after this long and fall back to decode-only. Default 8 000 ms. */
  readonly timeoutMs?: number;
  readonly decode?: DecodeOptions;
}

/** Heuristic for the fallback `gasEstimate` (a Safe4337 inner call is ~60–90 k gas; USDC transfer ≈ 55 k). */
const FALLBACK_GAS_PER_CALL = 90_000n;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Human revert reason from the return data (`Error(string)` / `Panic(uint256)`) or viem's message. */
export function revertReasonFrom(data: Hex | undefined, error: unknown): string {
  if (data && data !== '0x') {
    try {
      const decoded = decodeErrorResult({ abi: REVERT_ABI, data });
      if (decoded.errorName === 'Error') return String(decoded.args[0]);
      if (decoded.errorName === 'Panic') return `Panic(${decoded.args[0].toString()})`;
    } catch {
      /* not a standard revert payload */
    }
  }
  if (error instanceof Error) {
    const short =
      'shortMessage' in error && typeof error.shortMessage === 'string' ? error.shortMessage : undefined;
    const reason = /reason:\s*\n?\s*(.+)/.exec(error.message)?.[1]?.trim();
    return reason ?? short ?? error.message.split('\n')[0] ?? 'reverted';
  }
  return 'reverted';
}

/** The ERC-20s the calls touch (the `to` of every decoded token function). */
function touchedTokens(calls: readonly CallLike[], decoded: readonly DecodedCall[]): Address[] {
  const out: Address[] = [];
  decoded.forEach((d, i) => {
    const call = calls[i];
    if (!call) return;
    if (/^(transfer|approve|transferFrom|permit)\(/.test(d.fn)) out.push(getAddress(call.to));
  });
  return out;
}

function fallbackAssetChanges(
  input: SimulateInput,
  decoded: readonly DecodedCall[],
  decodeOptions: DecodeOptions,
): Promise<SimulatedAssetChange[]> {
  // Only plain ERC-20 transfers of a known token are estimated: before = balanceOf(from), after = before − Σ amounts.
  const perToken = new Map<string, { token: Address; out: bigint }>();
  decoded.forEach((d, i) => {
    const call = input.calls[i];
    if (!call || d.fn !== 'transfer(address,uint256)') return;
    const token = getAddress(call.to);
    const amount = BigInt(d.args[1] ?? '0');
    const entry = perToken.get(token.toLowerCase()) ?? { token, out: 0n };
    entry.out += amount;
    perToken.set(token.toLowerCase(), entry);
  });
  const reads = [...perToken.values()].map(async ({ token, out }): Promise<SimulatedAssetChange | null> => {
    try {
      const before = await withTimeout(
        readContract(input.client, {
          address: token,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [input.from],
        }),
        3_000,
        'balanceOf',
      );
      const after = before >= out ? before - out : 0n;
      return {
        token,
        symbol: tokenInfo(token, decodeOptions)?.symbol ?? 'TOKEN',
        before: before.toString(),
        after: after.toString(),
        delta: (after - before).toString(),
      };
    } catch {
      return null;
    }
  });
  return Promise.all(reads).then((rows) => rows.filter((row): row is SimulatedAssetChange => row !== null));
}

/**
 * Simulate `calls` from the Safe with `eth_simulateV1` and return the normalised `Simulation`.
 *  - every call succeeded → `ok: true`, asset changes (USDC base units / wei) for the tokens that moved, the tokens
 *    in `tokens` and the tokens the calls touch; `gasEstimate` = Σ gasUsed.
 *  - a call reverted → `ok: false`, `revertReason` (e.g. "ERC20: transfer amount exceeds balance").
 *  - RPC error / timeout → `provider: 'fallback'`, `simulated: true`, decode only (+ balance-based estimate).
 */
export async function simulate(input: SimulateInput): Promise<Simulation> {
  const decodeOptions: DecodeOptions = { wallet: input.from, ...input.decode };
  const decodedCalls = decodeCalls(input.calls, decodeOptions);
  const calls = input.calls.map((call) => ({
    to: getAddress(call.to),
    data: (call.data && call.data !== '' ? call.data : '0x') as Hex,
    value: toBigint(call.value),
  }));
  const wanted = new Set(
    [...(input.tokens ?? []), ...touchedTokens(input.calls, decodedCalls)].map((t) => t.toLowerCase()),
  );

  try {
    const result = await withTimeout(
      simulateCalls(input.client, { account: input.from, calls, traceAssetChanges: true }),
      input.timeoutMs ?? 8_000,
      'eth_simulateV1',
    );
    const assetChanges: SimulatedAssetChange[] = result.assetChanges
      .filter((change) => change.value.diff !== 0n || wanted.has(change.token.address.toLowerCase()))
      .map((change) => {
        const address = isAddressEqual(change.token.address, ETH_PSEUDO_ADDRESS)
          ? ETH_PSEUDO_ADDRESS
          : getAddress(change.token.address);
        return {
          token: address,
          symbol: change.token.symbol ?? tokenInfo(address, decodeOptions)?.symbol ?? 'TOKEN',
          before: change.value.pre.toString(),
          after: change.value.post.toString(),
          delta: change.value.diff.toString(),
        };
      });
    const failed = result.results.find((r) => r.status === 'failure');
    const gasEstimate = result.results.reduce((sum, r) => sum + r.gasUsed, 0n).toString();
    if (failed) {
      return {
        ok: false,
        assetChanges,
        decodedCalls,
        gasEstimate,
        provider: 'eth_simulateV1',
        revertReason: revertReasonFrom(failed.data, failed.error),
      };
    }
    return { ok: true, assetChanges, decodedCalls, gasEstimate, provider: 'eth_simulateV1' };
  } catch {
    const assetChanges = await fallbackAssetChanges(input, decodedCalls, decodeOptions);
    return {
      ok: true,
      assetChanges,
      decodedCalls,
      gasEstimate: (FALLBACK_GAS_PER_CALL * BigInt(Math.max(1, calls.length))).toString(),
      provider: 'fallback',
      simulated: true,
    };
  }
}

/** Guard for the bank: an `Address`-shaped string (the schema regex) — avoids `getAddress` throwing on bad input. */
export function isAddressLike(value: unknown): value is Address {
  return typeof value === 'string' && isAddress(value, { strict: false });
}
