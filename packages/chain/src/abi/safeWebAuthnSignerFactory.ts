/**
 * Safe passkeys SafeWebAuthnSignerFactory (v0.2.0 at 0xF7488fFbe67327ac9f37D5F722d83Fc900852Fbf, v0.2.1 at
 * 0x1d31F259eE307358a26dFb23EB365939E8641195 — both on Base Sepolia). `verifiers` packs the P-256 verifier:
 * the low 160 bits are the fallback contract verifier, the top 16 bits the precompile address (0x100 → RIP-7212).
 * Selectors verified against the live bytecode (docs/VERIFIED.md).
 */
export const safeWebAuthnSignerFactoryAbi = [
  {
    type: 'function',
    name: 'getSigner',
    stateMutability: 'view',
    inputs: [
      { name: 'x', type: 'uint256' },
      { name: 'y', type: 'uint256' },
      { name: 'verifiers', type: 'uint176' },
    ],
    outputs: [{ name: 'signer', type: 'address' }],
  },
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
  {
    type: 'function',
    name: 'isValidSignatureForSigner',
    stateMutability: 'view',
    inputs: [
      { name: 'message', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
      { name: 'x', type: 'uint256' },
      { name: 'y', type: 'uint256' },
      { name: 'verifiers', type: 'uint176' },
    ],
    outputs: [{ name: 'magicValue', type: 'bytes4' }],
  },
  {
    type: 'function',
    name: 'SINGLETON',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;
