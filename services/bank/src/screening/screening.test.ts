import { ScreeningSchema } from '@keyline/shared';
import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { createScreening, loadSeededEntries, screen, screeningReason } from './index';
import { loadOfacList, loadSnapshot, parseAddressList } from './ofac';

const seededTest = '0x3333333333333333333333333333333333333333' as const;
const lukas = '0x1111111111111111111111111111111111111111' as const;

describe('screening', () => {
  const snapshot = loadSnapshot();

  it('vendored snapshot has ≥ 100 real OFAC ETH addresses and a retrieval date', () => {
    expect(snapshot.addresses.size).toBeGreaterThanOrEqual(100);
    expect(snapshot.source).toBe('snapshot');
    expect(snapshot.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('real hit from the snapshot → hit, source OFAC-SDN, not simulated', () => {
    const [first] = [...snapshot.addresses];
    if (!first) throw new Error('empty snapshot');
    const s = screen(getAddress(first), { ofac: snapshot.addresses, ofacSource: 'snapshot' });
    expect(ScreeningSchema.parse(s)).toMatchObject({
      hit: true,
      source: 'OFAC-SDN',
      simulatedHit: false,
      simulated: true,
      listsChecked: ['OFAC-SDN', 'SECO'],
    });
    expect(screeningReason(s)).toBe('Counterparty appears on the OFAC SDN list');
    // Case-insensitive: checksummed input matches the lowercase list.
    expect(s.counterparty).toBe(getAddress(first));
  });

  it('seeded test contact → hit flagged simulatedHit with the demo copy', () => {
    const s = screen(seededTest, { ofac: snapshot.addresses, sanctionedTestAddress: seededTest });
    expect(s).toMatchObject({ hit: true, source: 'seeded-test', simulatedHit: true, simulated: true });
    expect(screeningReason(s)).toBe('Counterparty appears on the OFAC SDN list — simulated test entry');
    expect(loadSeededEntries()[0]).toMatchObject({
      contactLabel: 'Sanctioned test address',
      simulatedHit: true,
    });
  });

  it('clean address → no hit, SECO noted as names-only', () => {
    const s = screen(lukas, { ofac: snapshot.addresses, sanctionedTestAddress: seededTest });
    expect(s.hit).toBe(false);
    expect(s.source).toBeUndefined();
    expect(s.simulatedHit).toBe(false);
    expect(s.note).toMatch(/SECO publishes names, not addresses/);
  });

  it('parseAddressList ignores comments / blanks and lowercases', () => {
    const set = parseAddressList('# c\n\n0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD\nnot-an-address\n');
    expect([...set]).toEqual(['0xabcdefabcdefabcdefabcdefabcdefabcdefabcd']);
  });

  it('live fetch failure / timeout / short list falls back to the snapshot', async () => {
    const failing = async () => {
      throw new Error('offline');
    };
    expect((await loadOfacList({ fetch: failing })).source).toBe('snapshot');
    const short = async () => ({ ok: true, text: async () => '0x1111111111111111111111111111111111111111' });
    expect((await loadOfacList({ fetch: short })).source).toBe('snapshot');
    const hanging = (_u: string, init: { signal: AbortSignal }) =>
      new Promise<{ ok: boolean; text(): Promise<string> }>((_res, rej) =>
        init.signal.addEventListener('abort', () => rej(new Error('aborted'))),
      );
    expect((await loadOfacList({ fetch: hanging, timeoutMs: 20 })).source).toBe('snapshot');
  });

  it('live fetch with a full list is used', async () => {
    const body = [...snapshot.addresses].join('\n');
    const ok = async () => ({ ok: true, text: async () => body });
    const list = await loadOfacList({ fetch: ok });
    expect(list.source).toBe('live');
    expect(list.addresses.size).toBe(snapshot.addresses.size);
  });

  it('createScreening offline binds the seeded address and reports status', async () => {
    const svc = await createScreening({ sanctionedTestAddress: seededTest, offline: true });
    expect(svc.screen(seededTest).simulatedHit).toBe(true);
    expect(svc.screen(lukas).hit).toBe(false);
    expect(svc.status()).toMatchObject({ ofac: { source: 'snapshot' }, simulated: true });
    expect(svc.status().ofac.count).toBeGreaterThanOrEqual(100);
  });
});
