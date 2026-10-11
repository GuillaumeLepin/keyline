/**
 * dApp transaction requests (WalletConnect `eth_sendTransaction`, EIP-5792 `wallet_sendCalls` /
 * `wallet_getCallsStatus`) mapped onto the Safe's userOps. See VERIFIED §20 for the measured behaviour:
 * the hash a dApp receives for `eth_sendTransaction` is the BUNDLE transaction hash (from = bundler, to = EntryPoint),
 * which viem `waitForTransactionReceipt` resolves and whose logs contain the inner call's events.
 */
import { Bundler, type MetaTransaction, type UserOperationV7 } from 'abstractionkit';
import { type Address, getAddress, type Hex, numberToHex, toEventSelector } from 'viem';
import {
  type BuildOptions,
  buildUserOp,
  type ChainEndpoints,
  ChainError,
  type PasskeyAccount,
} from './account.js';

/** One call as dApps send it (`eth_sendTransaction` params[0] or one entry of `wallet_sendCalls` `calls`). */
export interface DappCall {
  readonly to: Address;
  /** Hex quantity (RPC form) or bigint; absent = 0. */
  readonly value?: Hex | bigint;
  readonly data?: Hex;
}

/** RPC-shaped call → abstractionkit MetaTransaction (CALL, not DELEGATECALL — dApps can never request a delegatecall). */
export function dappCallToMetaTransaction(call: DappCall): MetaTransaction {
  if (!call.to) throw new ChainError('BAD_INPUT', 'contract creation (no `to`) is not supported from a dApp');
  const value = call.value === undefined ? 0n : BigInt(call.value);
  if (value < 0n) throw new ChainError('BAD_INPUT', 'negative value');
  return { to: getAddress(call.to), value, data: call.data && call.data !== '0x' ? call.data : '0x' };
}

/**
 * All calls in ONE userOp (atomic: MultiSend 1.4.1 delegatecall when > 1 call, single `executeUserOp` otherwise) —
 * the `wallet_sendCalls` implementation; also used for a single `eth_sendTransaction` (calls.length === 1).
 * Same dummy-signature/sponsor/sign path as in-app transfers.
 */
export function buildBatchUserOp(
  pk: PasskeyAccount,
  calls: readonly DappCall[],
  endpoints: ChainEndpoints,
  options: BuildOptions = {},
): Promise<UserOperationV7> {
  if (calls.length === 0) throw new ChainError('BAD_INPUT', 'wallet_sendCalls needs at least one call');
  return buildUserOp(pk, calls.map(dappCallToMetaTransaction), endpoints, options);
}

/** EIP-5792 v2.0.0 status codes (what viem ≥ 2.30 `getCallsStatus` maps to pending / success / failure). */
export const CALLS_STATUS = { PENDING: 100, CONFIRMED: 200, REVERTED: 500 } as const;

export interface CallsReceipt {
  readonly logs: { address: Hex; data: Hex; topics: Hex[] }[];
  /** `0x1` when the userOp's calls succeeded, `0x0` when the userOp reverted (the bundle tx itself succeeds). */
  readonly status: '0x1' | '0x0';
  readonly blockHash: Hex;
  readonly blockNumber: Hex;
  readonly gasUsed: Hex;
  readonly transactionHash: Hex;
}

/** `wallet_getCallsStatus` result (EIP-5792 v2.0.0; viem also accepts the legacy 'PENDING'/'CONFIRMED' strings). */
export interface CallsStatus {
  readonly version: '2.0.0';
  readonly id: string;
  readonly chainId: Hex;
  readonly atomic: true;
  readonly status: (typeof CALLS_STATUS)[keyof typeof CALLS_STATUS];
  readonly receipts?: CallsReceipt[];
}

export const USER_OPERATION_EVENT_TOPIC = toEventSelector(
  'UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)',
);
export const BEFORE_EXECUTION_TOPIC = toEventSelector('BeforeExecution()');

interface RawLog {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
}

/**
 * The logs one userOp produced inside its bundle transaction: everything after the previous op's
 * `UserOperationEvent` (or the EntryPoint's `BeforeExecution`) up to and including this op's `UserOperationEvent`.
 * Needed because Candide's `eth_getUserOperationReceipt.logs` holds ONLY the `UserOperationEvent` (VERIFIED §20),
 * while the full bundle receipt holds the inner call's events (e.g. USDC `Approval`).
 */
export function userOpLogsFromBundle(txLogs: readonly RawLog[], userOpHash: Hex): RawLog[] {
  const isMarker = (log: RawLog) =>
    log.topics[0]?.toLowerCase() === USER_OPERATION_EVENT_TOPIC ||
    log.topics[0]?.toLowerCase() === BEFORE_EXECUTION_TOPIC;
  const end = txLogs.findIndex(
    (log) =>
      log.topics[0]?.toLowerCase() === USER_OPERATION_EVENT_TOPIC &&
      log.topics[1]?.toLowerCase() === userOpHash.toLowerCase(),
  );
  if (end < 0) return [];
  let start = end - 1;
  while (start >= 0 && !isMarker(txLogs[start] as RawLog)) start--;
  return txLogs.slice(start + 1, end + 1);
}

/**
 * One `eth_getUserOperationReceipt` → the EIP-5792 status for `id = userOpHash`. Receipt logs are this op's span of
 * the bundle transaction's logs (`userOpLogsFromBundle`); `gasUsed` is the userOp's `actualGasUsed`.
 */
export async function getCallsStatus(
  bundlerUrl: string,
  userOpHash: Hex,
  chainId: bigint | number,
): Promise<CallsStatus> {
  const base = {
    version: '2.0.0',
    id: userOpHash,
    chainId: numberToHex(BigInt(chainId)),
    atomic: true,
  } as const;
  const result = await new Bundler(bundlerUrl).getUserOperationReceipt(userOpHash);
  if (result == null) return { ...base, status: CALLS_STATUS.PENDING };
  const receipt: CallsReceipt = {
    logs: userOpLogsFromBundle(result.receipt.logs, userOpHash).map((log) => ({
      address: log.address as Hex,
      data: log.data as Hex,
      topics: [...log.topics] as Hex[],
    })),
    status: result.success ? '0x1' : '0x0',
    blockHash: result.receipt.blockHash as Hex,
    blockNumber: numberToHex(BigInt(result.receipt.blockNumber)),
    gasUsed: numberToHex(BigInt(result.actualGasUsed)),
    transactionHash: result.receipt.transactionHash as Hex,
  };
  return {
    ...base,
    status: result.success ? CALLS_STATUS.CONFIRMED : CALLS_STATUS.REVERTED,
    receipts: [receipt],
  };
}
