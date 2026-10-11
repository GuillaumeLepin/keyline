import { describe, expect, it } from 'vitest';
import { humanLabel, typedDataRows, UINT256_MAX } from './typed-data';

describe('typedDataRows', () => {
  it('flattens nested structs with depth (EIP-712 Mail)', () => {
    const rows = typedDataRows({
      types: {
        Person: [
          { name: 'name', type: 'string' },
          { name: 'wallet', type: 'address' },
        ],
        Mail: [
          { name: 'from', type: 'Person' },
          { name: 'to', type: 'Person' },
          { name: 'contents', type: 'string' },
        ],
      },
      primaryType: 'Mail',
      message: {
        from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
        to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
        contents: 'Hello, Bob!',
      },
    });
    expect(rows.map((r) => [r.label, r.depth, r.group ?? false])).toEqual([
      ['From', 0, true],
      ['Name', 1, false],
      ['Wallet', 1, false],
      ['To', 0, true],
      ['Name', 1, false],
      ['Wallet', 1, false],
      ['Contents', 0, false],
    ]);
    expect(rows[2]?.mono).toBe(true);
  });

  it('flags an unlimited Permit value as danger', () => {
    const rows = typedDataRows({
      types: {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'Permit',
      message: {
        owner: '0x1',
        spender: '0x2',
        value: UINT256_MAX.toString(),
        nonce: 0,
        deadline: 1760000000,
      },
    });
    const value = rows.find((r) => r.label === 'Value');
    expect(value).toMatchObject({ value: 'Unlimited', danger: true });
    expect(rows.filter((r) => r.danger)).toHaveLength(1);
    expect(rows.find((r) => r.label === 'Deadline')?.value).toBe('2025-10-09 08:53');
  });

  it('humanises field names', () => {
    expect(humanLabel('sigDeadline')).toBe('Sig deadline');
    expect(humanLabel('tokenId')).toBe('Token ID');
  });
});
