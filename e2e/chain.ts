// On-chain assertions for the E2E story. The UI says "Protected"; these functions check it on Base Sepolia through
// `@keyline/chain` + viem, so a test can never pass on copy alone.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { recovery } from '@keyline/chain';
import { type Address, createPublicClient, erc20Abi, formatUnits, getAddress, type Hex, http } from 'viem';
import { baseSepolia } from 'viem/chains';

// Root `.env` holds the shared chain constants (RPC_URL, USDC_ADDRESS, RECOVERY_MODULE_ADDRESS, SQ_GUARDIAN_ADDRESS).
// Node ≥ 20.12 can load it without a dependency; already-set variables win.
const rootEnv = resolve(import.meta.dirname, '../.env');
if (existsSync(rootEnv)) {
  try {
    process.loadEnvFile(rootEnv);
  } catch {
    // unreadable .env: fall back to the defaults below
  }
}

export const chainEnv = {
  chainId: BigInt(process.env.CHAIN_ID ?? '84532'),
  rpcUrl: process.env.RPC_URL ?? 'https://sepolia.base.org',
  usdc: getAddress(process.env.USDC_ADDRESS ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
  recoveryModule: getAddress(
    process.env.RECOVERY_MODULE_ADDRESS ?? '0x949d01d424bE050D09C16025dd007CB59b3A8c66',
  ),
  /** Swissquote's recoverer EOA; the bank reads it live from sq-guardian, the test knows it from `.env`. */
  sqGuardian: process.env.SQ_GUARDIAN_ADDRESS ? getAddress(process.env.SQ_GUARDIAN_ADDRESS) : undefined,
  explorer: process.env.NEXT_PUBLIC_EXPLORER ?? 'https://sepolia.basescan.org',
} as const;

// Module-private: an exported viem client's inferred type is not portable across the workspace's viem copies (TS2742).
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(chainEnv.rpcUrl) });

export async function hasCode(address: Address): Promise<boolean> {
  const code = await publicClient.getCode({ address });
  return code !== undefined && code !== '0x';
}

export async function usdcBalance(address: Address): Promise<bigint> {
  return publicClient.readContract({
    address: chainEnv.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
}

export function formatUsdc(units: bigint): string {
  return formatUnits(units, 6);
}

export interface GuardianSetCheck {
  readonly guardians: readonly Address[];
  readonly threshold: bigint;
  readonly ok: boolean;
  readonly missing: readonly Address[];
}

/**
 * SPEC F1.5: three recoverers, threshold 2, Swissquote the only institution. `expected` are the addresses the UI
 * registered (Safety key, Emergency card) plus the sq-guardian EOA; order on-chain is whatever the module stores.
 */
export async function guardianSet(
  safe: Address,
  expected: readonly Address[] = [],
): Promise<GuardianSetCheck> {
  const status = await recovery.status(publicClient, chainEnv.recoveryModule, safe);
  const have = new Set(status.guardians.map((g) => g.toLowerCase()));
  const missing = expected.filter((a) => !have.has(a.toLowerCase()));
  return {
    guardians: status.guardians,
    threshold: status.guardianThreshold,
    ok: status.guardians.length === 3 && status.guardianThreshold === 2n && missing.length === 0,
    missing,
  };
}

export function recoveryStatus(safe: Address) {
  return recovery.status(publicClient, chainEnv.recoveryModule, safe);
}

/** 180 s on the demo module instance (verified from bytecode, no getter — docs/VERIFIED.md). */
export function gracePeriodSeconds(): number {
  return recovery.gracePeriodSeconds(chainEnv.recoveryModule);
}

export async function safeOwners(safe: Address): Promise<Address[]> {
  const owners = await publicClient.readContract({
    address: safe,
    abi: [
      {
        type: 'function',
        name: 'getOwners',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address[]' }],
      },
    ] as const,
    functionName: 'getOwners',
  });
  return owners.map((o) => getAddress(o));
}

export async function txSucceeded(txHash: Hex): Promise<boolean> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  return receipt.status === 'success';
}

export function txUrl(txHash: string): string {
  return `${chainEnv.explorer}/tx/${txHash}`;
}

export function addressUrl(address: string): string {
  return `${chainEnv.explorer}/address/${address}`;
}

/** Extract the tx hash from a Basescan `/tx/0x…` link the UI renders. */
export function txHashFromUrl(url: string | null): Hex | null {
  const match = url?.match(/\/tx\/(0x[0-9a-fA-F]{64})/);
  return match ? (match[1] as Hex) : null;
}
