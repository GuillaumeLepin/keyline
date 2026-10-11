import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  BEFORE_EXECUTION_TOPIC,
  CALLS_STATUS,
  dappCallToMetaTransaction,
  getCallsStatus,
  USER_OPERATION_EVENT_TOPIC,
  userOpLogsFromBundle,
} from './dapp-calls.js';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

describe('dappCallToMetaTransaction', () => {
  it('parses RPC hex value and defaults empty data', () => {
    expect(dappCallToMetaTransaction({ to: USDC.toLowerCase() as Hex, value: '0x10' })).toEqual({
      to: USDC,
      value: 16n,
      data: '0x',
    });
    expect(dappCallToMetaTransaction({ to: USDC, data: '0x095ea7b3' }).value).toBe(0n);
  });
});

describe('userOpLogsFromBundle', () => {
  const op = (hash: string) => ({ address: '0xEP', topics: [USER_OPERATION_EVENT_TOPIC, hash], data: '0x' });
  const inner = (tag: string) => ({ address: tag, topics: ['0xaa'], data: '0x' });
  const A = `0x${'a'.repeat(64)}` as Hex;
  const B = `0x${'b'.repeat(64)}` as Hex;
  const logs = [
    { address: '0xEP', topics: [BEFORE_EXECUTION_TOPIC], data: '0x' },
    inner('a1'),
    inner('a2'),
    op(A),
    inner('b1'),
    op(B),
  ];

  it('returns only the span of the requested op (first and later ops of a bundle)', () => {
    expect(userOpLogsFromBundle(logs, A).map((l) => l.address)).toEqual(['a1', 'a2', '0xEP']);
    expect(userOpLogsFromBundle(logs, B).map((l) => l.address)).toEqual(['b1', '0xEP']);
    expect(userOpLogsFromBundle(logs, `0x${'c'.repeat(64)}`)).toEqual([]);
  });
});

describe('getCallsStatus (live, Candide public bundler)', () => {
  it('returns EIP-5792 v2 CONFIRMED with the bundle hash and the inner Approval logs', async () => {
    // wallet_sendCalls batch (2 × USDC approve(0)) sent by scripts/spike-erc1271.ts, 11 Oct 2026.
    const status = await getCallsStatus(
      'https://api.candide.dev/public/v3/84532',
      '0x11d25e3d47449c5855d563576314c954bc9454601dfa3bbdc893fa0d62e22959',
      84532n,
    );
    expect(status).toMatchObject({
      version: '2.0.0',
      chainId: '0x14a34',
      atomic: true,
      status: CALLS_STATUS.CONFIRMED,
    });
    const receipt = status.receipts?.[0];
    expect(receipt?.transactionHash).toBe(
      '0x904b752f1eaca15f8ca95ed8ba40af612694722514794b9ef9ee028ad02a04b5',
    );
    expect(receipt?.status).toBe('0x1');
    const approvals = receipt?.logs.filter(
      (l) => l.address.toLowerCase() === USDC.toLowerCase() && l.topics[0]?.startsWith('0x8c5be1e5'),
    );
    expect(approvals).toHaveLength(2);
  }, 20_000);

  it('unknown userOp → PENDING', async () => {
    const status = await getCallsStatus(
      'https://api.candide.dev/public/v3/84532',
      `0x${'0'.repeat(63)}1`,
      84532n,
    );
    expect(status.status).toBe(CALLS_STATUS.PENDING);
    expect(status.receipts).toBeUndefined();
  }, 20_000);
});
