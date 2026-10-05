/**
 * `encodeCallData` must equal the callData `buildUserOp` produces (the bank relies on this to verify client userOps).
 * The build step talks to Base Sepolia (nonce + fee reads only — `sponsored: true` skips bundler estimation).
 */
import type { MetaTransaction } from 'abstractionkit';
import { type Address, encodeFunctionData, erc20Abi, parseUnits } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  buildUserOp,
  createPasskeyAccount,
  decodeCallData,
  encodeCallData,
  initOwnerTransactions,
  loadPasskeyAccount,
  protectTransactions,
  transferTransaction,
} from './account.js';
import { RECOVERY_MODULE_3_MINUTES } from './constants.js';

const RPC_URL = process.env.RPC_URL ?? 'https://sepolia.base.org';
const BUNDLER_URL = process.env.BANK_CANDIDE_BUNDLER_URL ?? 'https://api.candide.dev/public/v3/84532';
const endpoints = { chainId: 84532n, rpcUrl: RPC_URL, bundlerUrl: BUNDLER_URL };

/** Gate 1 Safe (docs/VERIFIED.md §8) — deployed, so its userOps are non-init. Any (x, y) works for callData. */
const DEPLOYED_SAFE: Address = '0x39ECE2fA9262408426E78c71A9dED95ddD42967D';
const USDC: Address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const owner = { x: 0x1234n, y: 0x5678n };

const oneTx: MetaTransaction[] = [
  transferTransaction({ token: USDC, to: '0x00000000000000000000000000000000000000aa', amount: parseUnits('1', 6) }),
];
const threeTxs: MetaTransaction[] = [
  ...oneTx,
  {
    to: USDC,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: ['0x00000000000000000000000000000000000000bb', 5n],
    }),
  },
  { to: '0x00000000000000000000000000000000000000cc', value: 1n, data: '0x' },
];

describe('encodeCallData', () => {
  it('matches buildUserOp for a 1-tx userOp on a deployed Safe', async () => {
    const pk = loadPasskeyAccount(DEPLOYED_SAFE, owner);
    const userOp = await buildUserOp(pk, oneTx, endpoints, { sponsored: true });
    expect(userOp.callData).toBe(encodeCallData(oneTx));
    expect(userOp.callData.startsWith('0x541d63c8')).toBe(true); // executeUserOpWithErrorString
  }, 30_000);

  it('matches buildUserOp for a 3-tx batch (MultiSend) on a deployed Safe', async () => {
    const pk = loadPasskeyAccount(DEPLOYED_SAFE, owner);
    const userOp = await buildUserOp(pk, threeTxs, endpoints, { sponsored: true });
    expect(userOp.callData).toBe(encodeCallData(threeTxs));
  }, 30_000);

  it('matches buildUserOp for the first (init) userOp once initOwnerTransactions are prepended', async () => {
    const pk = createPasskeyAccount({ pubKeyX: owner.x, pubKeyY: owner.y });
    const protect = protectTransactions(pk, {
      guardians: ['0x00000000000000000000000000000000000000a1', '0x00000000000000000000000000000000000000a2'],
      threshold: 2,
      recoveryModule: RECOVERY_MODULE_3_MINUTES,
    });
    const userOp = await buildUserOp(pk, protect, endpoints, { sponsored: true });
    expect(userOp.factory).not.toBeNull();
    expect(userOp.callData).toBe(encodeCallData([...initOwnerTransactions(pk.owner, pk.address), ...protect]));
  }, 30_000);

  it('is pure and rejects an empty batch', () => {
    expect(encodeCallData(oneTx)).toBe(encodeCallData([...oneTx]));
    expect(() => encodeCallData([])).toThrow();
  });
});

describe('decodeCallData', () => {
  it('round-trips a single call', () => {
    const [call] = decodeCallData(encodeCallData(oneTx));
    expect(call).toEqual({ to: USDC, value: 0n, data: oneTx[0]?.data, operation: 'call' });
  });

  it('round-trips a MultiSend batch, including empty data and non-zero value', () => {
    const calls = decodeCallData(encodeCallData(threeTxs));
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.to)).toEqual(threeTxs.map((t) => t.to));
    expect(calls.map((c) => c.value)).toEqual([0n, 0n, 1n]);
    expect(calls.map((c) => c.data)).toEqual(threeTxs.map((t) => t.data));
    expect(calls.every((c) => c.operation === 'call')).toBe(true);
  });
});
