// Human-readable decode of the calls a decision covers. Wave 1: ERC-20 transfer + the recovery-module
// protect calls. The real eth_simulateV1 panel is Wave 3; until then `provider: 'fallback'` + simulated: true.
import type { Call, DecodedCall, Simulation } from '@keyline/shared';
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  type Hex,
  isAddressEqual,
} from 'viem';

const RECOVERY_MODULE_ABI = [
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
] as const;
const SAFE_ABI = [
  {
    type: 'function',
    name: 'enableModule',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'module', type: 'address' }],
    outputs: [],
  },
] as const;

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

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const decodeCall = (call: Call, ctx: DecodeContext): DecodedCall => {
  const to = getAddress(call.to);
  const transfer = parseErc20Transfer(call, ctx.usdc);
  if (transfer) {
    const usdc = formatUnits(transfer.amount, 6);
    return {
      to,
      fn: 'transfer(address,uint256)',
      args: [transfer.to, transfer.amount.toString()],
      humanText: `Send ${usdc} USDC to ${short(transfer.to)}`,
      risk: 'none',
    };
  }
  if (isAddressEqual(to, ctx.wallet)) {
    try {
      const d = decodeFunctionData({ abi: SAFE_ABI, data: call.data as Hex });
      return {
        to,
        fn: 'enableModule(address)',
        args: [d.args[0]],
        humanText: 'Turn on recovery for this wallet',
        risk: 'none',
      };
    } catch {
      /* fall through */
    }
  }
  if (isAddressEqual(to, ctx.recoveryModule)) {
    try {
      const d = decodeFunctionData({ abi: RECOVERY_MODULE_ABI, data: call.data as Hex });
      if (d.functionName === 'cancelRecovery') {
        return {
          to,
          fn: 'cancelRecovery()',
          args: [],
          humanText: 'Cancel the pending recovery of this wallet',
          risk: 'none',
        };
      }
      return {
        to,
        fn: 'addGuardianWithThreshold(address,uint256)',
        args: [d.args[0], d.args[1].toString()],
        humanText: `Add recoverer ${short(d.args[0])} · ${d.args[1].toString()} needed to restore`,
        risk: 'none',
      };
    } catch {
      /* fall through */
    }
  }
  return {
    to,
    fn: 'unknown',
    args: [],
    humanText: `Call ${short(to)} (${(call.data as Hex).slice(0, 10)})`,
    risk: 'warn',
  };
};

/** Fallback "simulation": decode only. Marked simulated so the UI shows the badge until eth_simulateV1 lands. */
export const fallbackSimulation = (calls: Call[], ctx: DecodeContext): Simulation => ({
  ok: true,
  assetChanges: [],
  decodedCalls: calls.map((c) => decodeCall(c, ctx)),
  gasEstimate: '0',
  provider: 'fallback',
  simulated: true,
});
