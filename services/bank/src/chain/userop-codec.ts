// The HTTP contract carries userOp numbers as strings (hex or decimal); abstractionkit wants bigint.
// This is the ONE place where the two representations meet.
import type { UserOperationV7 as ChainUserOp } from '@keyline/chain';
import type { UserOperationV7 as WireUserOp } from '@keyline/shared';
import { getAddress, type Hex } from 'viem';

const toBig = (v: string): bigint => BigInt(v);
const fromBig = (v: bigint): string => `0x${v.toString(16)}`;

export const toChainUserOp = (op: WireUserOp): ChainUserOp => ({
  sender: getAddress(op.sender),
  nonce: toBig(op.nonce),
  factory: op.factory ? getAddress(op.factory) : null,
  factoryData: op.factoryData ?? null,
  callData: op.callData,
  callGasLimit: toBig(op.callGasLimit),
  verificationGasLimit: toBig(op.verificationGasLimit),
  preVerificationGas: toBig(op.preVerificationGas),
  maxFeePerGas: toBig(op.maxFeePerGas),
  maxPriorityFeePerGas: toBig(op.maxPriorityFeePerGas),
  paymaster: op.paymaster ? getAddress(op.paymaster) : null,
  paymasterVerificationGasLimit: op.paymasterVerificationGasLimit
    ? toBig(op.paymasterVerificationGasLimit)
    : null,
  paymasterPostOpGasLimit: op.paymasterPostOpGasLimit ? toBig(op.paymasterPostOpGasLimit) : null,
  paymasterData: op.paymasterData ?? null,
  signature: op.signature,
});

const optHex = (v: string | null | undefined): Hex | undefined =>
  v == null || v === '0x' || v === '' ? undefined : (v as Hex);

export const fromChainUserOp = (op: ChainUserOp): WireUserOp => ({
  sender: op.sender,
  nonce: fromBig(op.nonce),
  factory: optHex(op.factory),
  factoryData: optHex(op.factoryData),
  callData: op.callData as Hex,
  callGasLimit: fromBig(op.callGasLimit),
  verificationGasLimit: fromBig(op.verificationGasLimit),
  preVerificationGas: fromBig(op.preVerificationGas),
  maxFeePerGas: fromBig(op.maxFeePerGas),
  maxPriorityFeePerGas: fromBig(op.maxPriorityFeePerGas),
  paymaster: optHex(op.paymaster),
  paymasterVerificationGasLimit:
    op.paymasterVerificationGasLimit == null ? undefined : fromBig(op.paymasterVerificationGasLimit),
  paymasterPostOpGasLimit:
    op.paymasterPostOpGasLimit == null ? undefined : fromBig(op.paymasterPostOpGasLimit),
  paymasterData: optHex(op.paymasterData),
  signature: op.signature as Hex,
});
