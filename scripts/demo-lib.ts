/**
 * Shared helpers for the demo scripts (qa-demo owns `demo-*`). Balance printing mirrors `check-balances.ts`
 * (account-chain) on purpose: that script auto-runs its `main()` on import, so the logic is small enough to repeat.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Address, Hex, PublicClient, Transport } from 'viem';
import {
  createPublicClient,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  http,
  parseEther,
  parseUnits,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { env, log, requireEnv } from './src/cli.js';

export const ROOT = resolve(import.meta.dirname, '..');
export const DEMO_STATE_PATH = resolve(ROOT, 'data/demo-state.json');

export const FAUCETS = [
  'Coinbase CDP faucet   https://portal.cdp.coinbase.com/products/faucet',
  'Superchain faucet     https://console.optimism.io/faucet',
  'thirdweb faucet       https://thirdweb.com/base-sepolia-testnet',
  'Circle USDC faucet    https://faucet.circle.com (Base Sepolia → USDC)',
] as const;

export interface DemoEoa {
  readonly label: string;
  readonly envVar: string;
  readonly minEth: bigint;
  readonly minUsdc: bigint;
}

/** The five demo EOAs (docs/ADDRESSES.md) and what the demo needs on each. */
export const DEMO_EOAS: readonly DemoEoa[] = [
  { label: 'Swissquote guardian', envVar: 'SQ_GUARDIAN_ADDRESS', minEth: parseEther('0.05'), minUsdc: 0n },
  { label: 'Partner guardian', envVar: 'PARTNER_GUARDIAN_ADDRESS', minEth: parseEther('0.05'), minUsdc: 0n },
  { label: 'Bank relayer', envVar: 'BANK_RELAYER_ADDRESS', minEth: parseEther('0.05'), minUsdc: 0n },
  {
    label: 'Bank funder',
    envVar: 'BANK_FUNDER_ADDRESS',
    minEth: parseEther('0.02'),
    minUsdc: parseUnits('10', 6),
  },
  { label: 'Bank verdict signer', envVar: 'BANK_VERDICT_ADDRESS', minEth: 0n, minUsdc: 0n },
];

export function publicClient(): PublicClient<Transport, typeof baseSepolia> {
  return createPublicClient({ chain: baseSepolia, transport: http(requireEnv('RPC_URL')) });
}

export function usdcAddress(): Address {
  return getAddress(requireEnv('USDC_ADDRESS'));
}

export interface BalanceLine {
  readonly label: string;
  readonly address: Address;
  readonly eth: bigint;
  readonly usdc: bigint;
  readonly ethOk: boolean;
  readonly usdcOk: boolean;
}

/** ETH on every demo EOA, USDC too; `ok` false when anything is below the minimum. */
export async function demoBalances(extra: readonly { label: string; address: Address }[] = []): Promise<{
  lines: BalanceLine[];
  ok: boolean;
}> {
  const client = publicClient();
  const usdc = usdcAddress();
  const lines: BalanceLine[] = [];
  const targets = [
    ...DEMO_EOAS.map((t) => ({ ...t, address: getAddress(requireEnv(t.envVar)) })),
    ...extra.map((e) => ({ ...e, minEth: 0n, minUsdc: 0n })),
  ];
  for (const target of targets) {
    const [eth, bal] = await Promise.all([
      client.getBalance({ address: target.address }),
      client.readContract({
        address: usdc,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [target.address],
      }),
    ]);
    lines.push({
      label: target.label,
      address: target.address,
      eth,
      usdc: bal,
      ethOk: eth >= target.minEth,
      usdcOk: bal >= target.minUsdc,
    });
  }
  return { lines, ok: lines.every((l) => l.ethOk && l.usdcOk) };
}

export function printBalances(lines: readonly BalanceLine[]): void {
  for (const l of lines) {
    const mark = l.ethOk && l.usdcOk ? '✓' : '✗';
    console.info(
      `${mark} ${l.label.padEnd(22)} ${l.address}  ETH ${formatEther(l.eth).padStart(10)}  USDC ${formatUnits(l.usdc, 6).padStart(10)}`,
    );
  }
}

export function printFaucets(): void {
  console.info('\nFaucets (Base Sepolia):');
  for (const f of FAUCETS) console.info(`  - ${f}`);
}

// ---------------------------------------------------------------------------------------------------------------
// data/demo-state.json — everything the fallback demo needs, written by demo-predeploy, read by demo-stage-recovery.
// TEST HARNESS ONLY: software passkeys + script-held guardian keys (see scripts/src/test-passkey.ts). Git-ignored.
// ---------------------------------------------------------------------------------------------------------------

export interface DemoWalletState {
  /** Private JWK of the software passkey that owns the Safe (rotated after a finalized recovery). */
  passkey: JsonWebKey;
  guardians: { safetyKey: Hex; emergencyCard: Hex };
  /** Addresses, for the UI and Basescan. */
  addresses: {
    safe: Address;
    signerProxy: Address;
    safetyKey: Address;
    emergencyCard: Address;
    swissquote: Address;
  };
  /** The exact `pubKeyX/pubKeyY` the wallet UI stores (so a profile can "resume" this wallet read-only). */
  passkeyPublic: { pubKeyX: Hex; pubKeyY: Hex; credentialId: string };
  protectTxHash: Hex;
  topupTxHash?: Hex;
  createdAt: string;
  /** Set by demo-stage-recovery; cleared once finalized or cancelled. */
  pendingRecovery?: {
    newPasskey: JsonWebKey;
    newOwner: Address;
    signerProxyTxHash: Hex | null;
    executeTxHash: Hex;
    executeAfter: string;
    nonce: string;
    stagedAt: string;
  };
}

export interface DemoState {
  version: 1;
  chainId: number;
  recoveryModule: Address;
  /** Lea's fallback wallet (the one the pitch shows first). */
  passkey: JsonWebKey;
  guardians: { safetyKey: Hex; emergencyCard: Hex };
  safe: Address;
  lea: DemoWalletState;
  /** The twin: same shape, used for the staged recovery whose countdown ends during the pitch. */
  twin: DemoWalletState;
}

export function readDemoState(path = DEMO_STATE_PATH): DemoState | null {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as DemoState;
  if (parsed.version !== 1 || !parsed.lea || !parsed.twin)
    throw new Error(`${path}: not a v1 demo-state file`);
  return parsed;
}

export function writeDemoState(state: DemoState, path = DEMO_STATE_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600 });
}

export function explorer(): string {
  return env('CHAIN_ID') === '11155111' ? 'https://sepolia.etherscan.io' : 'https://sepolia.basescan.org';
}

export function basescanTx(hash: string): string {
  return `${explorer()}/tx/${hash}`;
}

export function basescanAddress(address: string): string {
  return `${explorer()}/address/${address}`;
}

/** Zürich wall clock for the presenter ("the countdown ends at 14:32:10"). */
export function zurichClock(date: Date): string {
  return date.toLocaleTimeString('de-CH', { timeZone: 'Europe/Zurich', hour12: false });
}

export { log };
