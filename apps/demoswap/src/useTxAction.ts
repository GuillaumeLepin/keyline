'use client';

import { useEffect, useRef, useState } from 'react';
import { type Address, type Hex, isAddressEqual, parseEventLogs, type TransactionReceipt } from 'viem';
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { CHAIN_ID, erc20Abi, USDC } from './constants';
import { describeError, errorLine } from './errors';
import { formatAmount } from './format';
import { IDLE, type Outcome } from './ui';

export type LogFn = (entry: { action: string; method: string; result: string; hash?: Hex }) => void;

type Fn = 'approve' | 'transfer';

/** Is the expected USDC event (Approval / Transfer from this account to `target`) in the bundle receipt? */
function findEvent(receipt: TransactionReceipt, fn: Fn, account: Address, target: Address) {
  const logs = parseEventLogs({ abi: erc20Abi, logs: receipt.logs }).filter((l) =>
    isAddressEqual(l.address, USDC),
  );
  for (const l of logs) {
    if (fn === 'approve' && l.eventName === 'Approval') {
      if (isAddressEqual(l.args.owner, account) && isAddressEqual(l.args.spender, target)) {
        return `USDC Approval(owner = you, spender = ${target}, value = ${formatAmount(l.args.value)}) is in the receipt logs.`;
      }
    }
    if (fn === 'transfer' && l.eventName === 'Transfer') {
      if (isAddressEqual(l.args.from, account) && isAddressEqual(l.args.to, target)) {
        return `USDC Transfer(from = you, to = ${target}, value = ${formatAmount(l.args.value)}) is in the receipt logs.`;
      }
    }
  }
  return null;
}

/**
 * One USDC call (approve / transfer) sent with wagmi `useWriteContract` → `eth_sendTransaction` over
 * WalletConnect, then `useWaitForTransactionReceipt` on the hash the wallet returns (for Keyline: the
 * bundle tx hash, ≈ 4 s, VERIFIED §20). Success is judged from the USDC event in the receipt logs,
 * because a bundle receipt says `success` even when the inner user operation reverted.
 */
export function useTxAction(action: string, log: LogFn) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [hash, setHash] = useState<Hex>();
  const [pre, setPre] = useState<Outcome>(IDLE);
  const [call, setCall] = useState<{ fn: Fn; target: Address; from: Address; sentAt: number } | null>(null);
  const receipt = useWaitForTransactionReceipt({
    hash,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(hash) },
  });
  const logged = useRef<string | null>(null);

  const run = async (fn: Fn, target: Address, amount: bigint) => {
    if (!address) return;
    setHash(undefined);
    const sentAt = Date.now();
    setCall({ fn, target, from: address, sentAt });
    setPre({
      phase: 'pending',
      lines: ['Sent to the wallet over WalletConnect. Waiting for approval in the wallet…'],
    });
    try {
      const h = await writeContractAsync({
        address: USDC,
        abi: erc20Abi,
        functionName: fn,
        args: [target, amount],
        chainId: CHAIN_ID,
      });
      const secs = ((Date.now() - sentAt) / 1000).toFixed(1);
      setHash(h);
      setPre({
        phase: 'pending',
        lines: [`The wallet answered with a transaction hash after ${secs} s. Waiting for the receipt…`],
        hash: h,
      });
      log({ action, method: 'eth_sendTransaction', result: `hash returned after ${secs} s`, hash: h });
    } catch (e) {
      const d = describeError(e);
      setPre({ phase: 'error', lines: [], error: d });
      log({ action, method: 'eth_sendTransaction', result: errorLine(d) });
    }
  };

  let outcome: Outcome = pre;
  let verdict: { ok: boolean; line: string } | null = null;
  if (hash && receipt.data && call) {
    const found = findEvent(receipt.data, call.fn, call.from, call.target);
    verdict = found
      ? { ok: true, line: found }
      : {
          ok: false,
          line: 'Included, but the expected USDC event is not in the logs: the inner call did not succeed (a bundle receipt says "success" even when the user operation reverted).',
        };
    outcome = {
      phase: verdict.ok ? 'ok' : 'error',
      lines: [
        `Confirmed in block ${receipt.data.blockNumber} (receipt.status: ${receipt.data.status}).`,
        verdict.line,
      ],
      hash,
    };
  } else if (hash && receipt.error) {
    outcome = { phase: 'error', lines: pre.lines, error: describeError(receipt.error), hash };
  }

  useEffect(() => {
    if (!hash || !verdict || logged.current === hash) return;
    logged.current = hash;
    log({
      action,
      method: 'eth_getTransactionReceipt',
      result: verdict.ok ? 'confirmed' : 'included, call failed',
      hash,
    });
  }, [hash, verdict, action, log]);

  const busy = pre.phase === 'pending' && !receipt.data && !receipt.error;
  return { run, outcome, busy };
}
