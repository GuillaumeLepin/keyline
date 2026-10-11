// The light half of the chain layer: public reads and explorer links, no viem at runtime. Screens that only read (Home,
// receipts, contacts, Swissquote web) import from here so they do not pull `@keyline/chain` / abstractionkit
// (the signing half, ~250 kB) into their first load — Lighthouse ≥ 95 (DESIGN.md §8). `./chain` re-exports these.
import type { Address, Hex } from 'viem';
import { env } from '../env';

// Public reads go through ./rpc-reads (plain JSON-RPC, see why there); loaded on first read, not with the page.
let loaded: Promise<typeof import('./rpc-reads')> | null = null;
const rpc = () => {
  loaded ??= import('./rpc-reads');
  return loaded;
};

export class PasskeyCancelledError extends Error {
  constructor() {
    super('The passkey prompt was dismissed');
    this.name = 'PasskeyCancelledError';
  }
}

export async function readUsdcBalance(address: Address): Promise<number> {
  const r = await rpc();
  return r.units(await r.erc20Balance(env.usdcAddress, address), 6);
}

/** Deployed bytecode at `address` (undefined when nothing is deployed yet). */
export async function readCode(address: Address): Promise<Hex | undefined> {
  return (await rpc()).code(address);
}

/** Circle EURC on Base Sepolia (DECISIONS #27, verified; 6 decimals). */
export const EURC_ADDRESS: Address = '0x808456652fdb597867f38412077A9182bf77359F';

export interface AssetBalances {
  readonly USDC: number;
  readonly EURC: number;
  readonly ETH: number;
}

/** USDC, EURC and ETH held by the Safe, read from chain (Home v2 asset rows). */
export async function readAssetBalances(address: Address): Promise<AssetBalances> {
  const r = await rpc();
  const [usdc, eurc, eth] = await Promise.all([
    readUsdcBalance(address),
    r.erc20Balance(EURC_ADDRESS, address).then((raw) => r.units(raw, 6)),
    r.nativeBalance(address).then((raw) => r.units(raw, 18)),
  ]);
  return { USDC: usdc, EURC: eurc, ETH: eth };
}

/** Same rule as `explorerTxUrl` in @keyline/chain (Ethereum Sepolia → Etherscan, else Basescan). */
export function txUrl(txHash: string): string {
  const base =
    Number(env.chainId) === 11155111 ? 'https://sepolia.etherscan.io' : 'https://sepolia.basescan.org';
  return `${base}/tx/${txHash}`;
}

export function addressUrl(address: string): string {
  return `${env.explorer}/address/${address}`;
}
