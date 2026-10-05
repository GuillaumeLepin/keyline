import { DecodedCallSchema, SimulationSchema } from '@keyline/shared';
import {
  type Address,
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  maxUint256,
  parseEther,
  parseUnits,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { describe, expect, it } from 'vitest';
import { RECOVERY_MODULE_3_MINUTES, WEBAUTHN_SIGNER_FACTORY } from './constants.js';
import {
  type CallLike,
  decodeCalls,
  isUnlimitedAllowance,
  type Risk,
  revertReasonFrom,
  simulate,
  suggestedApprovalCap,
  worstRisk,
} from './simulate.js';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const SAFE = '0x2eac8081f2c00f526369AabB7492abE2ec280dea'; // deployed test Safe (VERIFIED.md §10), 0 USDC
const ALICE = '0x482B512e50e6FB886A70D027DF20b1D55369458A';
const DAPP = '0x1111111111111111111111111111111111111111';
const NFT = '0x2222222222222222222222222222222222222222';
const SAFE_SELF = '0x3333333333333333333333333333333333333333';

const transfer = (to: Address, amount: bigint) =>
  encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amount] });
const approve = (spender: Address, amount: bigint) =>
  encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
const transferFrom = (from: Address, to: Address, amount: bigint) =>
  encodeFunctionData({ abi: erc20Abi, functionName: 'transferFrom', args: [from, to, amount] });

const permitAbi = [
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
] as const;
const approvalForAllAbi = [
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
] as const;
const enableModuleAbi = [
  {
    type: 'function',
    name: 'enableModule',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'module', type: 'address' }],
    outputs: [],
  },
] as const;

interface Row {
  readonly name: string;
  readonly call: CallLike;
  readonly fn: string;
  readonly risk: Risk;
  readonly text: RegExp;
}

const table: readonly Row[] = [
  {
    name: 'USDC transfer',
    call: { to: USDC, value: 0n, data: transfer(ALICE, parseUnits('1', 6)) },
    fn: 'transfer(address,uint256)',
    risk: 'none',
    text: /^Send 1 USDC to 0x482B…458A$/,
  },
  {
    name: 'USDC transfer with cents',
    call: { to: USDC, value: '0', data: transfer(ALICE, 1_250_000n) },
    fn: 'transfer(address,uint256)',
    risk: 'none',
    text: /^Send 1\.25 USDC to 0x482B…458A$/,
  },
  {
    name: 'unlimited approve (maxUint256)',
    call: { to: USDC, value: 0n, data: approve(DAPP, maxUint256) },
    fn: 'approve(address,uint256)',
    risk: 'danger',
    text: /^This lets 0x1111…1111 spend an unlimited amount of USDC — we recommend a cap$/,
  },
  {
    name: 'unlimited approve (2^255)',
    call: { to: USDC, value: 0n, data: approve(DAPP, 1n << 255n) },
    fn: 'approve(address,uint256)',
    risk: 'danger',
    text: /unlimited amount of USDC/,
  },
  {
    name: 'capped approve',
    call: { to: USDC, value: 0n, data: approve(DAPP, parseUnits('100', 6)) },
    fn: 'approve(address,uint256)',
    risk: 'warn',
    text: /^Allow 0x1111…1111 to spend up to 100 USDC on your behalf$/,
  },
  {
    name: 'approve 0 = revoke',
    call: { to: USDC, value: 0n, data: approve(DAPP, 0n) },
    fn: 'approve(address,uint256)',
    risk: 'none',
    text: /^Revoke 0x1111…1111's permission to spend your USDC$/,
  },
  {
    name: 'transferFrom',
    call: { to: USDC, value: 0n, data: transferFrom(SAFE, ALICE, parseUnits('5', 6)) },
    fn: 'transferFrom(address,address,uint256)',
    risk: 'warn',
    text: /^Move 5 USDC from 0x2eac…0dea to 0x482B…458A using an existing allowance$/,
  },
  {
    name: 'permit unlimited',
    call: {
      to: USDC,
      value: 0n,
      data: encodeFunctionData({
        abi: permitAbi,
        functionName: 'permit',
        args: [SAFE, DAPP, maxUint256, maxUint256, 27, `0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`],
      }),
    },
    fn: 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
    risk: 'danger',
    text: /unlimited amount of USDC with no expiry — we recommend a cap$/,
  },
  {
    name: 'setApprovalForAll(true)',
    call: {
      to: NFT,
      value: 0n,
      data: encodeFunctionData({
        abi: approvalForAllAbi,
        functionName: 'setApprovalForAll',
        args: [DAPP, true],
      }),
    },
    fn: 'setApprovalForAll(address,bool)',
    risk: 'danger',
    text: /^This lets 0x1111…1111 move every item you hold in the collection at 0x2222…2222/,
  },
  {
    name: 'setApprovalForAll(false)',
    call: {
      to: NFT,
      value: 0n,
      data: encodeFunctionData({
        abi: approvalForAllAbi,
        functionName: 'setApprovalForAll',
        args: [DAPP, false],
      }),
    },
    fn: 'setApprovalForAll(address,bool)',
    risk: 'none',
    text: /^Revoke 0x1111…1111's access/,
  },
  {
    name: 'unknown selector',
    call: { to: DAPP, value: 0n, data: '0xdeadbeef00000000000000000000000000000000000000000000000000000000' },
    fn: 'unknown',
    risk: 'warn',
    text: /^Unknown action on 0x1111…1111$/,
  },
  {
    name: 'plain ETH transfer',
    call: { to: ALICE, value: parseEther('0.5'), data: '0x' },
    fn: 'eth-transfer',
    risk: 'none',
    text: /^Send 0\.5 ETH to 0x482B…458A$/,
  },
  {
    name: 'enableModule(known recovery module)',
    call: {
      to: SAFE_SELF,
      value: 0n,
      data: encodeFunctionData({
        abi: enableModuleAbi,
        functionName: 'enableModule',
        args: [RECOVERY_MODULE_3_MINUTES],
      }),
    },
    fn: 'enableModule(address)',
    risk: 'none',
    text: /^Turn on recovery for this wallet$/,
  },
  {
    name: 'enableModule(unknown module)',
    call: {
      to: SAFE_SELF,
      value: 0n,
      data: encodeFunctionData({ abi: enableModuleAbi, functionName: 'enableModule', args: [DAPP] }),
    },
    fn: 'enableModule(address)',
    risk: 'danger',
    text: /full control over your wallet/,
  },
  {
    name: 'unknown token transfer (no symbol known)',
    call: { to: DAPP, value: 0n, data: transfer(ALICE, 42n) },
    fn: 'transfer(address,uint256)',
    risk: 'none',
    text: /^Send 42 units of the token at 0x1111…1111 to 0x482B…458A$/,
  },
];

describe('decodeCalls', () => {
  it.each(table)('$name', (row) => {
    const [decoded] = decodeCalls([row.call]);
    expect(decoded).toBeDefined();
    if (!decoded) return;
    expect(decoded.fn).toBe(row.fn);
    expect(decoded.risk).toBe(row.risk);
    expect(decoded.humanText).toMatch(row.text);
    expect(DecodedCallSchema.parse(decoded)).toEqual(decoded);
  });

  it('checksums addresses and stringifies numbers in args', () => {
    const [d] = decodeCalls([{ to: USDC.toLowerCase(), data: transfer(ALICE, 7n) }]);
    expect(d?.to).toBe(USDC);
    expect(d?.args).toEqual([ALICE, '7']);
  });

  it('worstRisk picks the highest level', () => {
    const decoded = decodeCalls([
      { to: USDC, data: transfer(ALICE, 1n) },
      { to: USDC, data: approve(DAPP, maxUint256) },
      { to: USDC, data: approve(DAPP, 5n) },
    ]);
    expect(decoded.map((d) => d.risk)).toEqual(['none', 'danger', 'warn']);
    expect(worstRisk(decoded)).toBe('danger');
    expect(worstRisk([])).toBe('none');
  });

  it('isUnlimitedAllowance threshold is 2^255', () => {
    expect(isUnlimitedAllowance(maxUint256)).toBe(true);
    expect(isUnlimitedAllowance(1n << 255n)).toBe(true);
    expect(isUnlimitedAllowance((1n << 255n) - 1n)).toBe(false);
  });

  it('createSigner on the WebAuthn factory reads as registering the passkey', () => {
    const data = encodeFunctionData({
      abi: [
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
      ] as const,
      functionName: 'createSigner',
      args: [1n, 2n, 3n],
    });
    const [d] = decodeCalls([{ to: WEBAUTHN_SIGNER_FACTORY, data }]);
    expect(d?.humanText).toBe('Register your passkey as an on-chain signer');
    expect(d?.risk).toBe('none');
  });
});

describe('suggestedApprovalCap', () => {
  it('rewrites an unlimited USDC approve into a 100 USDC cap, same spender and token', () => {
    const unlimited = { to: USDC, value: 0n, data: approve(DAPP, maxUint256) };
    const capped = suggestedApprovalCap(unlimited, '100');
    expect(capped.to).toBe(USDC);
    expect(capped.value).toBe(0n);
    const [d] = decodeCalls([capped]);
    expect(d?.risk).toBe('warn');
    expect(d?.args).toEqual([DAPP, parseUnits('100', 6).toString()]);
    expect(d?.humanText).toBe('Allow 0x1111…1111 to spend up to 100 USDC on your behalf');
  });

  it('accepts a bigint cap in base units and rejects non-approve calls', () => {
    const capped = suggestedApprovalCap({ to: USDC, data: approve(DAPP, maxUint256) }, 25_000_000n);
    expect(decodeCalls([capped])[0]?.args[1]).toBe('25000000');
    expect(() => suggestedApprovalCap({ to: USDC, data: transfer(ALICE, 1n) }, '1')).toThrow(
      /not an approve/,
    );
  });
});

describe('revertReasonFrom', () => {
  it('decodes Error(string) payloads', () => {
    const data =
      '0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000' +
      '2645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000';
    expect(revertReasonFrom(`0x${data.slice(2)}`, undefined)).toBe('ERC20: transfer amount exceeds balance');
  });
  it('falls back to the error message', () => {
    expect(revertReasonFrom('0x', new Error('boom'))).toBe('boom');
    expect(revertReasonFrom(undefined, undefined)).toBe('reverted');
  });
});

describe('simulate (live eth_simulateV1 on https://sepolia.base.org)', () => {
  const client = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });

  it('1 USDC transfer from a deployed Safe with 0 USDC → provider eth_simulateV1, revert reason reported', async () => {
    const result = await simulate({
      client,
      from: SAFE,
      calls: [{ to: USDC, value: 0n, data: transfer(ALICE, parseUnits('1', 6)) }],
      tokens: [USDC],
    });
    expect(result.provider).toBe('eth_simulateV1');
    expect(SimulationSchema.parse(result)).toEqual(result);
    expect(result.decodedCalls[0]?.humanText).toBe('Send 1 USDC to 0x482B…458A');
    const usdc = result.assetChanges.find((c) => c.token === USDC);
    expect(usdc?.symbol).toBe('USDC');
    // the Safe holds 0 USDC today: either the call reverted (ok=false + reason) or the delta is 0
    if (result.ok) {
      expect(usdc?.delta).toBe('0');
    } else {
      expect(result.revertReason).toMatch(/transfer amount exceeds balance|revert/i);
      expect(BigInt(result.gasEstimate)).toBeGreaterThan(0n);
    }
  }, 30_000);

  it('dead RPC → fallback: decode only, simulated badge, schema-valid', async () => {
    const dead = createPublicClient({
      chain: baseSepolia,
      transport: http('http://127.0.0.1:9', { retryCount: 0, timeout: 2_000 }),
    });
    const result = await simulate({
      client: dead,
      from: SAFE,
      calls: [{ to: USDC, value: 0n, data: transfer(ALICE, parseUnits('1', 6)) }],
      timeoutMs: 3_000,
    });
    expect(result.provider).toBe('fallback');
    expect(result.simulated).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.assetChanges).toEqual([]); // balanceOf is unreachable too
    expect(result.decodedCalls).toHaveLength(1);
    expect(SimulationSchema.parse(result)).toEqual(result);
  }, 20_000);
});
