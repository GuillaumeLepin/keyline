import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { describe, expect, it } from 'vitest';
import { eoaSubmitter, isTxSubmitter, sponsoredRelayer, toSubmitter } from './relayer.js';

const key = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const endpoints = {
  chainId: 84532n,
  rpcUrl: 'https://sepolia.base.org',
  bundlerUrl: 'https://api.candide.dev/public/v3/84532',
  paymasterUrl: 'https://api.candide.dev/public/v3/84532',
};

describe('relayer submitters', () => {
  it('sponsoredRelayer derives a deterministic relayer Safe from the owner key', () => {
    const a = sponsoredRelayer({ ownerPrivateKey: key, endpoints });
    const b = sponsoredRelayer({ ownerPrivateKey: key, endpoints });
    expect(a.kind).toBe('sponsored-safe');
    expect(a.address).toBe(b.address);
    expect(a.owner).toBe(privateKeyToAccount(key).address);
    expect(a.address).not.toBe(a.owner);
    expect(a.lastUserOpHash()).toBeNull();
  });

  it('eoaSubmitter exposes the EOA as msg.sender; toSubmitter passes submitters through', () => {
    const account = privateKeyToAccount(key);
    const client = createWalletClient({ account, chain: baseSepolia, transport: http(endpoints.rpcUrl) });
    const eoa = eoaSubmitter(client);
    expect(eoa.kind).toBe('eoa');
    expect(eoa.address).toBe(account.address);
    expect(isTxSubmitter(eoa)).toBe(true);
    expect(isTxSubmitter(client)).toBe(false);
    expect(toSubmitter(eoa)).toBe(eoa);
    expect(toSubmitter(client).address).toBe(account.address);
  });
});
