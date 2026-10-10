import { encodeErrorResult, parseAbi, zeroAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { AA_REASONS, decodeRevertReason, GENERIC_REVERT, mapBundlerError } from './userop-errors';

const abi = parseAbi([
  'error Error(string message)',
  'error Panic(uint256 code)',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ExecutionFailed()',
]);

describe('bundler rejection → plain language', () => {
  it.each([
    ['AA21', "AA21 didn't pay prefund"],
    ['AA23', 'AA23 reverted: 0x'],
    ['AA24', 'UserOperation reverted during simulation with reason: AA24 signature error'],
    ['AA25', 'AA25 invalid account nonce'],
    ['AA33', 'AA33 reverted (or OOG)'],
  ])('%s keeps the code and a short sentence', (code, message) => {
    const mapped = mapBundlerError(message);
    expect(mapped.code).toBe(code);
    expect(mapped.reason).toBe(AA_REASONS[code]);
    expect(mapped.reason).not.toMatch(/AA\d\d/);
  });

  it('copy for the five SPEC codes', () => {
    expect(mapBundlerError('AA24 signature error').reason).toBe(
      "The passkey signature doesn't match this wallet.",
    );
    expect(mapBundlerError('AA25 invalid account nonce').reason).toMatch(/already sent or is out of order/);
    expect(mapBundlerError('AA33 reverted').reason).toMatch(/fee sponsor declined/);
  });

  it('unknown AA code and code-less messages fall back to a generic sentence', () => {
    expect(mapBundlerError('AA99 something new')).toEqual({
      code: 'AA99',
      reason: 'The network refused this transaction.',
    });
    expect(mapBundlerError('socket hang up')).toEqual({ reason: 'The network refused this transaction.' });
    expect(mapBundlerError('nonce too low').code).toBeUndefined();
  });
});

describe('receipt revert data → plain language', () => {
  it('decodes OZ v5 ERC20InsufficientBalance', () => {
    const data = encodeErrorResult({
      abi,
      errorName: 'ERC20InsufficientBalance',
      args: [zeroAddress, 1n, 2n],
    });
    expect(decodeRevertReason(data)).toEqual({
      reason: 'Not enough funds in your wallet for this transfer.',
      code: 'ERC20InsufficientBalance',
    });
  });

  it('maps Circle / OZ v4 Error(string) messages and keeps the raw message as code', () => {
    const data = encodeErrorResult({
      abi,
      errorName: 'Error',
      args: ['ERC20: transfer amount exceeds balance'],
    });
    expect(decodeRevertReason(data)).toEqual({
      reason: 'Not enough funds in your wallet for this transfer.',
      code: 'Error(ERC20: transfer amount exceeds balance)',
    });
    const other = encodeErrorResult({ abi, errorName: 'Error', args: ['something odd'] });
    expect(decodeRevertReason(other).reason).toBe(GENERIC_REVERT);
  });

  it('ExecutionFailed, Panic, unknown selectors and empty data → "The transfer reverted on-chain"', () => {
    expect(decodeRevertReason(encodeErrorResult({ abi, errorName: 'ExecutionFailed' }))).toEqual({
      reason: GENERIC_REVERT,
      code: 'ExecutionFailed',
    });
    expect(decodeRevertReason(encodeErrorResult({ abi, errorName: 'Panic', args: [17n] })).code).toBe(
      'Panic(17)',
    );
    expect(decodeRevertReason('0xdeadbeef00')).toEqual({ reason: GENERIC_REVERT, code: '0xdeadbeef' });
    expect(decodeRevertReason(undefined)).toEqual({ reason: GENERIC_REVERT });
    expect(decodeRevertReason('0x')).toEqual({ reason: GENERIC_REVERT });
  });
});
