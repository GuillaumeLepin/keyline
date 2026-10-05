import type { UserOperationV7 } from 'abstractionkit';
import { describe, expect, it } from 'vitest';
import { counterfactualAddress, passkeySignerAddress, safeOpHash } from './account.js';
import { RECOVERY_MODULE_3_MINUTES } from './constants.js';
import { recoveryHash, recoveryTypedData, sortGuardianSignatures } from './recovery.js';

const wallet = '0x1111111111111111111111111111111111111111';
const input = {
  wallet,
  newOwners: ['0x2222222222222222222222222222222222222222'] as const,
  threshold: 1n,
  nonce: 0n,
  chainId: 84532n,
  module: RECOVERY_MODULE_3_MINUTES,
} as const;

describe('recovery typed data', () => {
  it('uses the deployed module domain (name / version 0.0.1)', () => {
    const td = recoveryTypedData(input);
    expect(td.domain).toEqual({
      name: 'Social Recovery Module',
      version: '0.0.1',
      chainId: 84532,
      verifyingContract: RECOVERY_MODULE_3_MINUTES,
    });
    expect(td.primaryType).toBe('ExecuteRecovery');
  });

  it('is deterministic and sensitive to every field', () => {
    const h = recoveryHash(input);
    expect(h).toBe(recoveryHash({ ...input }));
    expect(recoveryHash({ ...input, nonce: 1n })).not.toBe(h);
    expect(recoveryHash({ ...input, threshold: 2n })).not.toBe(h);
    expect(recoveryHash({ ...input, chainId: 11155111n })).not.toBe(h);
  });

  it('sorts guardian signatures ascending by address (module requirement)', () => {
    const sorted = sortGuardianSignatures([
      { signer: '0x00000000000000000000000000000000000000ff', signature: '0x02' },
      { signer: '0x0000000000000000000000000000000000000001', signature: '0x01' },
    ]);
    expect(sorted.map((s) => s.signature)).toEqual(['0x01', '0x02']);
  });
});

describe('passkey account', () => {
  // Any valid-looking P-256 coordinates work for address derivation (no curve check is done client-side).
  const owner = { x: 0x1234n, y: 0x5678n };

  it('derives deterministic counterfactual Safe and signer-proxy addresses', () => {
    expect(counterfactualAddress(owner)).toBe(counterfactualAddress({ ...owner }));
    expect(passkeySignerAddress(owner)).toBe(passkeySignerAddress({ ...owner }));
    expect(counterfactualAddress(owner)).not.toBe(counterfactualAddress({ x: 0x1234n, y: 0x5679n }));
  });

  it('safeOpHash is deterministic and depends on paymaster fields (sign AFTER sponsoring)', () => {
    const userOp: UserOperationV7 = {
      sender: wallet,
      nonce: 0n,
      factory: null,
      factoryData: null,
      callData: '0x',
      callGasLimit: 1n,
      verificationGasLimit: 1n,
      preVerificationGas: 1n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      paymaster: null,
      paymasterVerificationGasLimit: null,
      paymasterPostOpGasLimit: null,
      paymasterData: null,
      signature: '0x',
    };
    const h = safeOpHash(userOp, 84532n);
    expect(h).toBe(safeOpHash({ ...userOp }, 84532n));
    const sponsored: UserOperationV7 = {
      ...userOp,
      paymaster: '0x3333333333333333333333333333333333333333',
      paymasterVerificationGasLimit: 1n,
      paymasterPostOpGasLimit: 1n,
      paymasterData: '0x',
    };
    expect(safeOpHash(sponsored, 84532n)).not.toBe(h);
    expect(safeOpHash(userOp, 11155111n)).not.toBe(h);
  });
});
