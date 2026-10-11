import { toHex } from 'viem';
import { describe, expect, it } from 'vitest';
import { classify, readableText, summaryOf, verificationOf, WC_CHAIN_HEX } from './requests';

const SAFE = '0x2eac8081f2c00f526369AabB7492abE2ec280dea';
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

describe('classify (SPEC §11.2)', () => {
  it('eth_sendTransaction → one call, value as decimal string', () => {
    const c = classify(
      'eth_sendTransaction',
      [{ from: SAFE, to: USDC, data: '0x095ea7b3', value: '0x10' }],
      SAFE,
    );
    expect(c).toEqual({ kind: 'transaction', calls: [{ to: USDC, value: '16', data: '0x095ea7b3' }] });
  });
  it('wallet_sendCalls → batch; other chain → switch refusal', () => {
    const calls = [
      { to: USDC, data: '0x01' },
      { to: USDC, data: '0x02' },
    ];
    expect(
      classify('wallet_sendCalls', [{ version: '2.0.0', chainId: WC_CHAIN_HEX, calls }], SAFE).kind,
    ).toBe('batch');
    expect(classify('wallet_sendCalls', [{ chainId: '0x1', calls }], SAFE)).toEqual({
      kind: 'switch-chain',
      chainId: '0x1',
    });
  });
  it('personal_sign → readable text, SIWE kept as text', () => {
    const c = classify('personal_sign', [toHex('Hello Keyline'), SAFE], SAFE);
    expect(c).toMatchObject({ kind: 'message', text: 'Hello Keyline' });
  });
  it('typed data v4 parses the JSON string', () => {
    const td = { types: { Mail: [{ name: 'x', type: 'string' }] }, primaryType: 'Mail', message: { x: 'y' } };
    expect(classify('eth_signTypedData_v4', [SAFE, JSON.stringify(td)], SAFE)).toMatchObject({
      kind: 'typed-data',
      typedData: { primaryType: 'Mail' },
    });
  });
  it('instant answers: accounts, chain, capabilities, same-chain switch', () => {
    expect(classify('eth_accounts', [], SAFE)).toEqual({ kind: 'instant', result: [SAFE] });
    expect(classify('eth_chainId', [], SAFE)).toEqual({ kind: 'instant', result: '0x14a34' });
    expect(classify('wallet_getCapabilities', [SAFE], SAFE)).toMatchObject({
      kind: 'instant',
      result: { '0x14a34': { atomicBatch: { supported: true }, paymasterService: { supported: true } } },
    });
    expect(classify('wallet_switchEthereumChain', [{ chainId: '0x14a34' }], SAFE).kind).toBe('instant');
    expect(classify('wallet_switchEthereumChain', [{ chainId: '0x1' }], SAFE).kind).toBe('switch-chain');
  });
  it('eth_sign / eth_signTransaction / unknown → unsupported; bad params → invalid', () => {
    expect(classify('eth_sign', [SAFE, '0x00'], SAFE).kind).toBe('unsupported');
    expect(classify('eth_signTransaction', [{}], SAFE).kind).toBe('unsupported');
    expect(classify('eth_sendTransaction', [{ data: '0x00' }], SAFE).kind).toBe('invalid');
  });
});

describe('helpers', () => {
  it('readableText refuses control bytes', () => {
    expect(readableText(toHex('ok\nline'))).toBe('ok\nline');
    expect(readableText('0x0001ff')).toBeNull();
  });
  it('verificationOf: scam / INVALID / origin mismatch are flagged', () => {
    expect(verificationOf({ validation: 'VALID', origin: 'https://a.example' }, 'https://a.example')).toBe(
      'verified',
    );
    expect(
      verificationOf({ validation: 'UNKNOWN', origin: 'http://localhost:3100' }, 'http://localhost:3100'),
    ).toBe('unverified');
    expect(verificationOf({ validation: 'VALID', origin: 'https://evil.example' }, 'https://a.example')).toBe(
      'flagged',
    );
    expect(verificationOf({ validation: 'VALID', isScam: true }, 'https://a.example')).toBe('flagged');
  });
  it('summaryOf stays under 500 chars', () => {
    expect(summaryOf({ kind: 'unsupported', method: 'x'.repeat(900) }, 'App').length).toBeLessThanOrEqual(
      500,
    );
  });
});
