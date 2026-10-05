// Recomputes the Safe4337Module callData for the calls a decision covers, so /userops/sponsor can check
// keccak256(userOp.callData) === decision.callsHash (DECISIONS #14). Verification only: nothing here signs.

import type { MetaTransaction, PasskeyAccount } from '@keyline/chain';
import * as chain from '@keyline/chain';
import type { Call } from '@keyline/shared';
import {
  type Address,
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  type Hex,
  keccak256,
  size,
} from 'viem';

/** Safe4337Module `executeUserOpWithErrorString(address,uint256,bytes,uint8)` — abstractionkit's default executor. */
const EXECUTE_USER_OP_WITH_ERROR_STRING = '0x541d63c8' as const;
/** MultiSend 1.4.1 (abstractionkit DEFAULT_MULTISEND_CONTRACT_ADDRESS, verified on Base Sepolia). */
export const MULTISEND_ADDRESS: Address = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526';
const MULTISEND_ABI = [
  {
    type: 'function',
    name: 'multiSend',
    stateMutability: 'payable',
    inputs: [{ name: 'transactions', type: 'bytes' }],
    outputs: [],
  },
] as const;

type EncodeCallData = (txs: MetaTransaction[]) => Hex;

/** Same packing as abstractionkit `encodeMultiSendTransaction`: op ‖ to ‖ value ‖ len(data) ‖ data. */
const packMultiSend = (txs: MetaTransaction[]): Hex =>
  concatHex(
    txs.map((tx) =>
      encodePacked(
        ['uint8', 'address', 'uint256', 'uint256', 'bytes'],
        [
          tx.operation ?? 0,
          getAddress(tx.to),
          tx.value ?? 0n,
          BigInt(size((tx.data ?? '0x') as Hex)),
          (tx.data ?? '0x') as Hex,
        ],
      ),
    ),
  );

const executeUserOp = (to: Address, value: bigint, data: Hex, operation: 0 | 1): Hex =>
  concatHex([
    EXECUTE_USER_OP_WITH_ERROR_STRING,
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'uint8' }],
      [to, value, data, operation],
    ),
  ]);

/** Local mirror of abstractionkit `createAccountCallDataSingleTransaction` / `...BatchTransactions`. */
export const encodeCallDataLocal: EncodeCallData = (txs) => {
  if (txs.length === 0) throw new Error('encodeCallData needs at least one transaction');
  if (txs.length === 1) {
    const tx = txs[0] as MetaTransaction;
    return executeUserOp(
      getAddress(tx.to),
      tx.value ?? 0n,
      (tx.data ?? '0x') as Hex,
      tx.operation === 1 ? 1 : 0,
    );
  }
  const multiSendData = encodeFunctionData({
    abi: MULTISEND_ABI,
    functionName: 'multiSend',
    args: [packMultiSend(txs)],
  });
  return executeUserOp(MULTISEND_ADDRESS, 0n, multiSendData, 1);
};

// TODO(account-chain): remove the local fallback once `encodeCallData` lands in @keyline/chain.
const chainEncode = (chain as unknown as { encodeCallData?: EncodeCallData }).encodeCallData;
export const encodeCallData: EncodeCallData = chainEncode ?? encodeCallDataLocal;

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
 * The first userOp of a passkey Safe: abstractionkit prepends `factory.createSigner(x,y)` and
 * `swapOwner(sentinel, sharedSigner → proxy)` to whatever the client asked for (docs/VERIFIED.md §6).
 * The bank mirrors that so the protect decision's callsHash matches the op the client builds.
 */
export const initPrefixTransactions = (pk: PasskeyAccount): MetaTransaction[] => [
  chain.deploySignerProxyTx(pk.owner),
  {
    to: pk.address,
    value: 0n,
    data: encodeFunctionData({
      abi: [
        {
          type: 'function',
          name: 'swapOwner',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'prevOwner', type: 'address' },
            { name: 'oldOwner', type: 'address' },
            { name: 'newOwner', type: 'address' },
          ],
          outputs: [],
        },
      ],
      functionName: 'swapOwner',
      args: [
        '0x0000000000000000000000000000000000000001',
        chain.WEBAUTHN_SHARED_SIGNER,
        chain.passkeySignerAddress(pk.owner),
      ],
    }),
  },
];

/** callData of the protect op exactly as `buildCreateAndProtectUserOp` will produce it for an undeployed Safe. */
export const protectCallData = (pk: PasskeyAccount, protectTxs: MetaTransaction[], deployed: boolean): Hex =>
  encodeCallData(deployed ? protectTxs : [...initPrefixTransactions(pk), ...protectTxs]);

export const callsHashOf = (callData: Hex): Hex => keccak256(callData);
