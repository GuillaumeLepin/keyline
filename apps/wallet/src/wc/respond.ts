// Answers to dApps and the bank's request log. Every outcome of a WalletConnect request ends here, so the dApp always
// gets an answer (never a silent drop) and the bank (and the desk) sees every proposal, request and refusal.
import {
  CALLS_STATUS,
  type CallsStatus,
  USER_OPERATION_EVENT_TOPIC,
  userOpLogsFromBundle,
} from '@keyline/chain';
import type { DappRequestOutcome } from '@keyline/shared';
import { type Hex, numberToHex } from 'viem';
import { api } from '../lib/api';
import { endpoints, publicClient } from '../lib/chain';
import { RPC_ERRORS } from './requests';
import { getWalletKit } from './walletkit';

export interface WcRequestRef {
  readonly topic: string;
  readonly id: number;
  readonly method: string;
}

export async function respondResult(ref: WcRequestRef, result: unknown): Promise<void> {
  const kit = await getWalletKit();
  await kit.respondSessionRequest({ topic: ref.topic, response: { id: ref.id, jsonrpc: '2.0', result } });
}

export async function respondError(
  ref: WcRequestRef,
  error: { code: number; message: string; data?: string },
): Promise<void> {
  const kit = await getWalletKit();
  await kit.respondSessionRequest({ topic: ref.topic, response: { id: ref.id, jsonrpc: '2.0', error } });
}

/** `getSdkError('USER_REJECTED')` with Keyline's sentence (SPEC §11.2: declines answer USER_REJECTED). */
export async function respondRejected(ref: WcRequestRef, message?: string): Promise<void> {
  const { getSdkError } = await import('@walletconnect/utils');
  const sdk = getSdkError('USER_REJECTED');
  await respondError(ref, { code: sdk.code, message: message ?? sdk.message });
}

/** Policy block → 4001 with the bank's reason. */
export function respondBlocked(ref: WcRequestRef, reason: string): Promise<void> {
  return respondError(ref, { code: RPC_ERRORS.blocked, message: reason });
}

/** Fire-and-forget line in the bank's request log (a missing route or a network blip never blocks the answer). */
export function logRequest(
  ref: WcRequestRef,
  summary: string,
  outcome: DappRequestOutcome,
  hashes: { txHash?: string; userOpHash?: string } = {},
): void {
  api.dappSessions
    .event(ref.topic, {
      topic: ref.topic,
      method: ref.method,
      summary: summary.slice(0, 500) || ref.method,
      outcome,
      requestId: ref.id,
      ...(hashes.txHash ? { txHash: hashes.txHash } : {}),
      ...(hashes.userOpHash ? { userOpHash: hashes.userOpHash } : {}),
    })
    .catch(() => undefined);
}

/**
 * EIP-5792 v2 status for a userOp, computed in the browser from the bank's userOp record (bundle tx hash) and the
 * bundle receipt read with viem: the op's own log span (`userOpLogsFromBundle`) and its `UserOperationEvent.success`
 * (VERIFIED §20.3 — the bundle receipt's status says nothing about the op). Same shape as `@keyline/chain`
 * `getCallsStatus`, which reads Candide's receipt instead (that call does not complete in the browser build).
 */
export async function callsStatus(userOpHash: Hex): Promise<CallsStatus> {
  const base = {
    version: '2.0.0',
    id: userOpHash,
    chainId: numberToHex(endpoints.chainId),
    atomic: true,
  } as const;
  const op = await api.userops.status(userOpHash);
  if (!op.txHash)
    return { ...base, status: op.status === 'failed' ? CALLS_STATUS.REVERTED : CALLS_STATUS.PENDING };
  const receipt = await publicClient.getTransactionReceipt({ hash: op.txHash as Hex });
  const logs = userOpLogsFromBundle(receipt.logs, userOpHash);
  const event = logs.find(
    (l) =>
      l.topics[0]?.toLowerCase() === USER_OPERATION_EVENT_TOPIC &&
      l.topics[1]?.toLowerCase() === userOpHash.toLowerCase(),
  );
  // UserOperationEvent data: (nonce, success, actualGasCost, actualGasUsed).
  const words = event ? (event.data.slice(2).match(/.{64}/g) ?? []) : [];
  const success = words[1] ? BigInt(`0x${words[1]}`) === 1n : op.status !== 'failed';
  const gasUsed = words[3] ? BigInt(`0x${words[3]}`) : receipt.gasUsed;
  return {
    ...base,
    status: success ? CALLS_STATUS.CONFIRMED : CALLS_STATUS.REVERTED,
    receipts: [
      {
        logs: logs.map((l) => ({
          address: l.address as Hex,
          data: l.data as Hex,
          topics: [...l.topics] as Hex[],
        })),
        status: success ? '0x1' : '0x0',
        blockHash: receipt.blockHash,
        blockNumber: numberToHex(receipt.blockNumber),
        gasUsed: numberToHex(gasUsed),
        transactionHash: receipt.transactionHash,
      },
    ],
  };
}

/**
 * `eth_sendTransaction` answers with the BUNDLE transaction hash, which exists only once the userOp is included
 * (≈ 4 s, VERIFIED §20.3). Success is the userOp's own `UserOperationEvent.success`, not the bundle receipt's
 * status — a reverted userOp sits in a successful bundle.
 */
export async function waitForInclusion(
  userOpHash: Hex,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ txHash: Hex; success: boolean }> {
  const started = Date.now();
  const timeout = options.timeoutMs ?? 120_000;
  for (;;) {
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const status = await callsStatus(userOpHash).catch(() => null);
    const receipt = status?.receipts?.[0];
    if (status && status.status !== CALLS_STATUS.PENDING && receipt) {
      return { txHash: receipt.transactionHash, success: receipt.status === '0x1' };
    }
    if (Date.now() - started > timeout) throw new Error('The transaction was not included in time.');
    await new Promise((r) => setTimeout(r, 1_500));
  }
}
