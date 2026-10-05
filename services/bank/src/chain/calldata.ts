// Recomputes the Safe4337Module callData for the calls a decision covers, so /userops/sponsor can check
// keccak256(userOp.callData) === decision.callsHash (DECISIONS #14). Verification only: nothing here signs.
import {
  encodeCallData,
  initOwnerTransactions,
  type MetaTransaction,
  type PasskeyAccount,
} from '@keyline/chain';
import type { Call } from '@keyline/shared';
import { getAddress, type Hex, keccak256 } from 'viem';

export const callToMetaTransaction = (call: Call): MetaTransaction => ({
  to: getAddress(call.to),
  value: BigInt(call.value),
  data: call.data,
});

export const metaTransactionToCall = (tx: MetaTransaction): Call => ({
  to: getAddress(tx.to),
  value: (tx.value ?? 0n).toString(),
  data: (tx.data ?? '0x') as Hex,
});

/**
 * callData of the protect op exactly as `buildCreateAndProtectUserOp` produces it: for an undeployed Safe
 * abstractionkit prepends `createSigner` + `swapOwner(sharedSigner → proxy)` (docs/VERIFIED.md §6).
 */
export const protectCallData = (pk: PasskeyAccount, protectTxs: MetaTransaction[], deployed: boolean): Hex =>
  encodeCallData(deployed ? protectTxs : [...initOwnerTransactions(pk.owner, pk.address), ...protectTxs]);

export { encodeCallData };
export const callsHashOf = (callData: Hex): Hex => keccak256(callData);
