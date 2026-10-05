/**
 * Candide SocialRecoveryModule ABI (deployed version 0.0.1 — Sourcify exact match for
 * 0x949d01d424bE050D09C16025dd007CB59b3A8c66; identical runtime bytecode on Base Sepolia).
 * Only the functions and events Keyline uses. Selectors verified against the live bytecode (docs/VERIFIED.md).
 */
export const socialRecoveryModuleAbi = [
  {
    type: 'function',
    name: 'confirmRecovery',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_wallet', type: 'address' },
      { name: '_newOwners', type: 'address[]' },
      { name: '_newThreshold', type: 'uint256' },
      { name: '_execute', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'multiConfirmRecovery',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_wallet', type: 'address' },
      { name: '_newOwners', type: 'address[]' },
      { name: '_newThreshold', type: 'uint256' },
      {
        name: '_signatures',
        type: 'tuple[]',
        components: [
          { name: 'signer', type: 'address' },
          { name: 'signature', type: 'bytes' },
        ],
      },
      { name: '_execute', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeRecovery',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_wallet', type: 'address' },
      { name: '_newOwners', type: 'address[]' },
      { name: '_newThreshold', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeRecovery',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [],
  },
  { type: 'function', name: 'cancelRecovery', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'addGuardianWithThreshold',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_guardian', type: 'address' },
      { name: '_threshold', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getRecoveryHash',
    stateMutability: 'view',
    inputs: [
      { name: '_wallet', type: 'address' },
      { name: '_newOwners', type: 'address[]' },
      { name: '_newThreshold', type: 'uint256' },
      { name: '_nonce', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getRecoveryRequest',
    stateMutability: 'view',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'guardiansApprovalCount', type: 'uint256' },
          { name: 'newThreshold', type: 'uint256' },
          { name: 'executeAfter', type: 'uint64' },
          { name: 'newOwners', type: 'address[]' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getRecoveryApprovals',
    stateMutability: 'view',
    inputs: [
      { name: '_wallet', type: 'address' },
      { name: '_newOwners', type: 'address[]' },
      { name: '_newThreshold', type: 'uint256' },
    ],
    outputs: [{ name: 'approvalCount', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'hasGuardianApproved',
    stateMutability: 'view',
    inputs: [
      { name: '_wallet', type: 'address' },
      { name: '_guardian', type: 'address' },
      { name: '_newOwners', type: 'address[]' },
      { name: '_newThreshold', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isGuardian',
    stateMutability: 'view',
    inputs: [
      { name: '_wallet', type: 'address' },
      { name: '_guardian', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getGuardians',
    stateMutability: 'view',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'guardiansCount',
    stateMutability: 'view',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'threshold',
    stateMutability: 'view',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'nonce',
    stateMutability: 'view',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [{ name: '_nonce', type: 'uint256' }],
  },
  { type: 'function', name: 'NAME', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'VERSION', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  {
    type: 'function',
    name: 'domainSeparator',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'event',
    name: 'RecoveryExecuted',
    inputs: [
      { name: 'wallet', type: 'address', indexed: true },
      { name: 'newOwners', type: 'address[]', indexed: false },
      { name: 'newThreshold', type: 'uint256', indexed: false },
      { name: 'nonce', type: 'uint256', indexed: false },
      { name: 'executeAfter', type: 'uint64', indexed: false },
      { name: 'guardiansApprovalCount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RecoveryFinalized',
    inputs: [
      { name: 'wallet', type: 'address', indexed: true },
      { name: 'newOwners', type: 'address[]', indexed: false },
      { name: 'newThreshold', type: 'uint256', indexed: false },
      { name: 'nonce', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RecoveryCanceled',
    inputs: [
      { name: 'wallet', type: 'address', indexed: true },
      { name: 'nonce', type: 'uint256', indexed: false },
    ],
  },
] as const;
