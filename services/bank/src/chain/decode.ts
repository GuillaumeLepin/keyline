// Decode-only "simulation" for the cases eth_simulateV1 cannot run (undeployed Safe → the protect op) and for the
// 8 s timeout / RPC-error fallback. Decoding is `@keyline/chain.decodeCalls` (pure viem), marked `simulated: true`.
import { type Simulation as ChainSimulation, decodeCalls } from '@keyline/chain';
import type { Call, Simulation } from '@keyline/shared';
import { type Address, decodeFunctionData, erc20Abi, getAddress, type Hex, isAddressEqual } from 'viem';

export type DecodeContext = { usdc: Address; recoveryModule: Address; wallet: Address };

export type Erc20Transfer = { token: Address; to: Address; amount: bigint };

/** Strict parse of a single ERC-20 `transfer(address,uint256)` on `token`; null when it is anything else. */
export const parseErc20Transfer = (call: Call, token: Address): Erc20Transfer | null => {
  if (!isAddressEqual(getAddress(call.to), token) || call.value !== '0') return null;
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: call.data as Hex });
    if (decoded.functionName !== 'transfer') return null;
    const [to, amount] = decoded.args;
    return { token, to: getAddress(to), amount };
  } catch {
    return null;
  }
};

const FALLBACK_GAS_PER_CALL = 90_000n;

/** `@keyline/chain` returns readonly arrays; the zod-derived shared type wants mutable ones. Same data. */
export const toSimulation = (sim: ChainSimulation): Simulation => ({
  ok: sim.ok,
  assetChanges: sim.assetChanges.map((a) => ({ ...a })),
  decodedCalls: sim.decodedCalls.map((d) => ({ ...d, args: [...d.args] })),
  gasEstimate: sim.gasEstimate,
  provider: sim.provider,
  revertReason: sim.revertReason,
  simulated: sim.simulated,
});

/** Fallback "simulation": decode only. Marked simulated so the UI shows the badge. */
export const fallbackSimulation = (calls: Call[], ctx: DecodeContext): Simulation =>
  toSimulation({
    ok: true,
    assetChanges: [],
    decodedCalls: decodeCalls(calls, { wallet: ctx.wallet }),
    gasEstimate: (FALLBACK_GAS_PER_CALL * BigInt(Math.max(1, calls.length))).toString(),
    provider: 'fallback',
    simulated: true,
  });
