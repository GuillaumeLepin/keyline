// The three public reads Home and the Swissquote tile need (ERC-20 balanceOf, native balance, bytecode), as plain
// JSON-RPC `fetch` calls. Why not viem here: even tree-shaken, viem's client is a ~170 ms long task on a mid-range
// phone right after first paint, which alone keeps Home under Lighthouse 95 (DESIGN.md §8). These are reads of
// public state — no keys, no signatures, no hashing; everything that signs or builds a userOp stays on viem /
// abstractionkit in ./chain.
import { env } from '../env';
import { units } from './format';

export { units };

type Hex = `0x${string}`;
let id = 0;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(env.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} failed: HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error || body.result === undefined)
    throw new Error(`RPC ${method} failed: ${body.error?.message ?? 'no result'}`);
  return body.result;
}

/** ERC-20 `balanceOf(address)` (selector 0x70a08231). */
export async function erc20Balance(token: Hex, owner: Hex): Promise<bigint> {
  const data = `0x70a08231${owner.slice(2).toLowerCase().padStart(64, '0')}` as Hex;
  const result = await rpc<Hex>('eth_call', [{ to: token, data }, 'latest']);
  return result === '0x' ? 0n : BigInt(result);
}

export async function nativeBalance(owner: Hex): Promise<bigint> {
  return BigInt(await rpc<Hex>('eth_getBalance', [owner, 'latest']));
}

/** Deployed bytecode, or undefined when the address has none (same contract as viem's getCode). */
export async function code(address: Hex): Promise<Hex | undefined> {
  const result = await rpc<Hex>('eth_getCode', [address, 'latest']);
  return result === '0x' ? undefined : result;
}
