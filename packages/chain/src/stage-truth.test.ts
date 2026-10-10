import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { describe, expect, it } from 'vitest';
import { clearStageTruthCache, findCancelTx, isOwner, readStageTruth } from './stage-truth.js';

// The public RPC caps eth_getLogs at 200 blocks — using it here proves the range-cap fallback works.
const RPC_URL = process.env.RPC_URL ?? 'https://sepolia.base.org';
const client = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

// Story run 7 (VERIFIED §17): protect → new signer → execute → finalize; owner now the new phone's proxy.
const STORY_SAFE = '0x824192a3907a1CF42Ecc4cB655dA62c32147A6C2';
const OLD_OWNER = '0x2Da4C93a1b0a08E9E8319688faA90a750ed7beA2';
const NEW_OWNER = '0x1993F68A47Dd89de40ee0872753c08De9368eAB5';
// fraud-cancel runs: execute then owner cancel.
const CANCEL_SAFE_A = '0x6b808d4F174E044Ed041f68e368c5e1a96fF55aa';
const CANCEL_SAFE_B = '0x3da1a223423177d0dd7472e77b67a0d9d7e673b4';

const timings: Record<string, number> = {};
async function timed<R>(label: string, fn: () => Promise<R>): Promise<R> {
  const t = performance.now();
  const r = await fn();
  timings[label] = Math.round(performance.now() - t);
  return r;
}

describe('readStageTruth (live Base Sepolia)', () => {
  it('reads the recovered story Safe and classifies its history', async () => {
    const truth = await timed('story window', () =>
      readStageTruth({ client, wallet: STORY_SAFE, fromBlock: 47_751_800n, toBlock: 47_752_100n }),
    );
    expect(truth.deployed).toBe(true);
    expect(truth.owners).toEqual([NEW_OWNER]);
    expect(truth.guardians).toHaveLength(3);
    expect(truth.threshold).toBe(2);
    expect(truth.recovery).toMatchObject({ pending: false, graceSeconds: 180 });
    expect(truth.usdcBalance).toMatch(/^\d+(\.\d{1,6})?$/);
    expect(truth.recentTxs.map((t) => [t.kind, t.hash.slice(0, 10)])).toEqual([
      ['recovery-finalize', '0x09568d0e'],
      ['recovery-execute', '0xb6356f10'],
      ['signer-deploy', '0x3257b622'],
    ]);
    expect(truth.recentTxs[0]?.explorerUrl).toBe(
      `https://sepolia.basescan.org/tx/${truth.recentTxs[0]?.hash}`,
    );
    expect(truth.recentTxs[0]?.at).toBeGreaterThan(1_759_000_000);
  }, 30_000);

  it('older window: protect is classified as protect', async () => {
    const truth = await readStageTruth({
      client,
      wallet: STORY_SAFE,
      fromBlock: 47_751_830n,
      toBlock: 47_751_845n,
    });
    expect(truth.recentTxs.map((t) => t.kind)).toEqual(['signer-deploy', 'protect']);
  }, 30_000);

  it('cancelled Safe shows execute then cancel', async () => {
    const truth = await readStageTruth({
      client,
      wallet: CANCEL_SAFE_A,
      fromBlock: 47_751_400n,
      toBlock: 47_751_500n,
    });
    expect(truth.recovery.pending).toBe(false);
    expect(truth.recentTxs.slice(0, 2).map((t) => [t.kind, t.hash.slice(0, 10)])).toEqual([
      ['recovery-cancel', '0xb5a56d02'],
      ['recovery-execute', '0x77843fd4'],
    ]);
  }, 30_000);

  it('default lookback: cold then warm (cached) read, warm under 1.5 s', async () => {
    clearStageTruthCache();
    const cold = await timed('default cold (20k-block scan)', () =>
      readStageTruth({ client, wallet: STORY_SAFE }),
    );
    const warm = await timed('default warm #1', () => readStageTruth({ client, wallet: STORY_SAFE }));
    await timed('default warm #2', () => readStageTruth({ client, wallet: STORY_SAFE }));
    expect(warm.owners).toEqual(cold.owners);
    expect(timings['default warm #1']).toBeLessThan(1_500);
    expect(timings['default warm #2']).toBeLessThan(1_500);
  }, 60_000);
});

describe('findCancelTx (live; the bank finalizer bug)', () => {
  it('finds the owner cancel of 0x6b80…55aa', async () => {
    const hash = await timed('findCancelTx 6b80', () =>
      findCancelTx({ client, wallet: CANCEL_SAFE_A, fromBlock: 47_741_000n, toBlock: 47_761_000n }),
    );
    expect(hash).toBe('0xb5a56d02c538ccaad501df3f61a0a6d3690b49a0f49ad9f6a51c8fbbbb7fc924');
  }, 30_000);

  it('finds 0xd1175115… (owner cancel of 0x3da1…d7e673b4)', async () => {
    const hash = await findCancelTx({
      client,
      wallet: CANCEL_SAFE_B,
      fromBlock: 47_741_000n,
      toBlock: 47_761_000n,
    });
    expect(hash).toBe('0xd1175115e7d1df8f2ea0f65c09d3b7324d857256db916e29fa4d8a807003812d');
  }, 30_000);

  it('returns null for a Safe that was never cancelled', async () => {
    const hash = await findCancelTx({
      client,
      wallet: STORY_SAFE,
      fromBlock: 47_741_000n,
      toBlock: 47_761_000n,
    });
    expect(hash).toBeNull();
  }, 30_000);
});

describe('isOwner ("Try the old phone")', () => {
  it('old phone proxy is no longer an owner; the new one is', async () => {
    expect(await timed('isOwner', () => isOwner({ client, wallet: STORY_SAFE, signer: OLD_OWNER }))).toBe(
      false,
    );
    expect(await isOwner({ client, wallet: STORY_SAFE, signer: NEW_OWNER })).toBe(true);
  }, 30_000);

  it('undeployed wallet → false', async () => {
    expect(
      await isOwner({ client, wallet: '0x000000000000000000000000000000000000dEaD', signer: NEW_OWNER }),
    ).toBe(false);
  }, 30_000);

  it('prints timings', () => {
    process.stdout.write(`stage-truth timings (ms): ${JSON.stringify(timings)}\n`);
  });
});
