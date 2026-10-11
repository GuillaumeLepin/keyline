'use client';

import { Chip } from '@keyline/ui';
import { useAppKit, useDisconnect } from '@reown/appkit/react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { type Address, encodeFunctionData, type Hex, isAddress, maxUint256, parseUnits } from 'viem';
import { createSiweMessage, generateSiweNonce } from 'viem/siwe';
import { useAccount, useCallsStatus, usePublicClient, useSendCalls, useSignMessage } from 'wagmi';
import {
  APP_DOMAIN,
  APP_ORIGIN,
  addressUrl,
  CHAIN_ID,
  DEMO_SPENDER,
  DEMO_VAULT,
  erc20Abi,
  PROJECT_ID,
  SANCTIONED_LABEL,
  txUrl,
  USDC,
  USDC_DECIMALS,
} from './constants';
import { describeError, errorLine } from './errors';
import { short } from './format';
import { ActionCard, Btn, IDLE, type Outcome } from './ui';
import { type LogFn, useTxAction } from './useTxAction';

type LogEntry = { id: number; time: string; action: string; method: string; result: string; hash?: Hex };

const ONE = parseUnits('1', USDC_DECIMALS);
const HUNDRED = parseUnits('100', USDC_DECIMALS);
const TEST_CHIP =
  'A test app for the Keyline prototype on Base Sepolia (testnet). Not a real exchange or brand.';

export function DemoSwap() {
  const { address, chainId, isConnected, status } = useAccount();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });

  const [log, setLog] = useState<LogEntry[]>([]);
  const addLog: LogFn = useCallback((e) => {
    setLog((prev) => [
      { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString('en-GB'), ...e },
      ...prev,
    ]);
  }, []);

  // ---- account kind (smart account vs EOA) ----
  const [isContract, setIsContract] = useState<boolean | null>(null);
  useEffect(() => {
    setIsContract(null);
    if (!address || !publicClient) return;
    publicClient
      .getCode({ address })
      .then((code) => setIsContract(Boolean(code && code !== '0x')))
      .catch(() => setIsContract(null));
  }, [address, publicClient]);
  const kind = isContract === null ? '' : isContract ? 'smart account, ERC-1271' : 'EOA, ECDSA';

  // ---- 1. SIWE ----
  const { signMessageAsync } = useSignMessage();
  const [siwe, setSiwe] = useState<Outcome>(IDLE);
  const [siweMessage, setSiweMessage] = useState<string>('');
  const signIn = async () => {
    if (!address || !publicClient) return;
    const now = new Date();
    const message = createSiweMessage({
      domain: APP_DOMAIN,
      address,
      statement: 'Sign in to DemoSwap (test app). This does not move money.',
      uri: APP_ORIGIN,
      version: '1',
      chainId: CHAIN_ID,
      nonce: generateSiweNonce(),
      issuedAt: now,
      expirationTime: new Date(now.getTime() + 10 * 60_000),
    });
    setSiweMessage(message);
    setSiwe({ phase: 'pending', lines: ['EIP-4361 message sent (personal_sign). Waiting for the wallet…'] });
    addLog({ action: 'Sign in (SIWE)', method: 'personal_sign', result: 'sent' });
    try {
      const signature = await signMessageAsync({ message });
      setSiwe({
        phase: 'pending',
        lines: [`Signature received (${(signature.length - 2) / 2} bytes). Verifying on Base Sepolia…`],
      });
      // viem verifyMessage: ecrecover for an EOA, isValidSignature (ERC-1271) for a deployed contract account.
      const valid = await publicClient.verifyMessage({ address, message, signature });
      if (valid) {
        const who = `Signed in as ${address}${kind ? ` (${kind})` : ''}.`;
        setSiwe({
          phase: 'ok',
          lines: [
            who,
            `verifyMessage → true; ${(signature.length - 2) / 2}-byte signature, expires in 10 min.`,
          ],
        });
        addLog({ action: 'Sign in (SIWE)', method: 'verifyMessage', result: `valid — ${short(address)}` });
      } else {
        setSiwe({
          phase: 'error',
          lines: [],
          error: { title: 'Signature did NOT verify for this address. Not signed in.' },
        });
        addLog({ action: 'Sign in (SIWE)', method: 'verifyMessage', result: 'invalid signature' });
      }
    } catch (e) {
      const d = describeError(e);
      setSiwe({ phase: 'error', lines: [], error: d });
      addLog({ action: 'Sign in (SIWE)', method: 'personal_sign', result: errorLine(d) });
    }
  };

  // ---- 2–5. single USDC calls ----
  const approveMax = useTxAction('Approve unlimited USDC', addLog);
  const approve100 = useTxAction('Approve 100 USDC', addLog);
  const swap = useTxAction('Swap (test)', addLog);
  const sanctionedTx = useTxAction('Send to sanctioned recipient', addLog);

  // Sanctioned address from the bank (server-side proxy; the bank's CORS only allows the wallet origin).
  const [sanctioned, setSanctioned] = useState<{ address?: string; error?: string; loading: boolean }>({
    loading: true,
  });
  const [pasted, setPasted] = useState('');
  useEffect(() => {
    fetch('/api/sanctioned')
      .then(async (r) => {
        const body = (await r.json()) as { address?: string; error?: string };
        setSanctioned({ loading: false, ...body });
      })
      .catch((e: unknown) => setSanctioned({ loading: false, error: String(e) }));
  }, []);
  const sanctionedAddress = (sanctioned.address ?? (isAddress(pasted) ? pasted : undefined)) as
    | Address
    | undefined;

  // ---- 6. EIP-5792 batch ----
  const { sendCallsAsync } = useSendCalls();
  const [batchId, setBatchId] = useState<string>();
  const [batch, setBatch] = useState<Outcome>(IDLE);
  const callsStatus = useCallsStatus({
    id: batchId ?? '',
    query: {
      enabled: Boolean(batchId),
      refetchInterval: (q) => (q.state.data && q.state.data.status !== 'pending' ? false : 1000),
    },
  });
  const sendBatch = async () => {
    setBatchId(undefined);
    setBatch({ phase: 'pending', lines: ['wallet_sendCalls sent (2 calls). Waiting for the wallet…'] });
    addLog({ action: 'Batch (EIP-5792)', method: 'wallet_sendCalls', result: 'sent' });
    try {
      const res = await sendCallsAsync({
        chainId: CHAIN_ID,
        calls: [
          {
            to: USDC,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [DEMO_SPENDER, HUNDRED],
            }),
          },
          {
            to: USDC,
            data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [DEMO_VAULT, ONE] }),
          },
        ],
      });
      setBatchId(res.id);
      setBatch({
        phase: 'pending',
        lines: [`Batch id ${short(res.id)} returned. Polling wallet_getCallsStatus every 1 s…`],
      });
      addLog({ action: 'Batch (EIP-5792)', method: 'wallet_sendCalls', result: `id ${res.id}` });
    } catch (e) {
      const d = describeError(e);
      setBatch({ phase: 'error', lines: [], error: d });
      addLog({ action: 'Batch (EIP-5792)', method: 'wallet_sendCalls', result: errorLine(d) });
    }
  };
  const cs = callsStatus.data;
  const batchReceiptHash = cs?.receipts?.[0]?.transactionHash;
  useEffect(() => {
    if (!cs || cs.status === 'pending') return;
    addLog({
      action: 'Batch (EIP-5792)',
      method: 'wallet_getCallsStatus',
      result: `${cs.status} (statusCode ${cs.statusCode}, atomic ${String(cs.atomic)})`,
      ...(cs.receipts?.[0]?.transactionHash ? { hash: cs.receipts[0].transactionHash } : {}),
    });
  }, [cs, addLog]);
  const batchOutcome: Outcome = cs
    ? {
        phase: cs.status === 'success' ? 'ok' : cs.status === 'failure' ? 'error' : 'pending',
        lines: [
          ...batch.lines,
          `wallet_getCallsStatus → ${cs.status} (statusCode ${cs.statusCode}, atomic ${String(cs.atomic)}, ${cs.receipts?.length ?? 0} receipt(s)${cs.receipts?.[0] ? `, ${cs.receipts[0].logs.length} logs` : ''}).`,
        ],
        ...(batchReceiptHash ? { hash: batchReceiptHash } : {}),
      }
    : callsStatus.error
      ? { phase: 'error', lines: batch.lines, error: describeError(callsStatus.error) }
      : batch;

  // ---- 7. disconnect ----
  const doDisconnect = async () => {
    try {
      await disconnect();
      addLog({ action: 'Disconnect', method: 'session delete', result: 'disconnected' });
    } catch (e) {
      addLog({ action: 'Disconnect', method: 'session delete', result: errorLine(describeError(e)) });
    }
  };

  const ready = isConnected && Boolean(address);
  const wrongChain = ready && chainId !== CHAIN_ID;
  const can = ready && !wrongChain;

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 py-8">
      {/* ---- top bar ---- */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div className="flex items-center gap-3">
          {/* biome-ignore lint/performance/noImgElement: a 32 px local svg, no optimisation needed */}
          <img src="/demoswap.svg" alt="" width={32} height={32} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-20 font-semibold">DemoSwap</span>
              <Chip label="Test app" tooltip={TEST_CHIP} />
            </div>
            <p className="m-0 text-14 text-ink-3">
              Test dApp for Keyline · Base Sepolia only · WalletConnect
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ready && address ? (
            <>
              <a
                className="font-mono text-14 text-ink underline"
                href={addressUrl(address)}
                target="_blank"
                rel="noreferrer"
                title={address}
              >
                {short(address)}
              </a>
              <Btn variant="secondary" onClick={doDisconnect}>
                Disconnect
              </Btn>
            </>
          ) : (
            <Btn onClick={() => open({ view: 'Connect' })} disabled={!PROJECT_ID}>
              {status === 'connecting' || status === 'reconnecting' ? 'Connecting…' : 'Connect wallet'}
            </Btn>
          )}
        </div>
      </header>

      {!PROJECT_ID ? (
        <p className="m-0 rounded-control bg-danger-bg px-3 py-2 text-14 text-danger">
          NEXT_PUBLIC_REOWN_PROJECT_ID is not set in apps/demoswap/.env.local — WalletConnect cannot start.
        </p>
      ) : null}

      {/* ---- connection panel ---- */}
      <section className="grid gap-4 rounded-sheet border border-line bg-surface p-5 md:grid-cols-3">
        <Field label="Connected address">
          {ready && address ? (
            <span className="break-all font-mono text-14">{address}</span>
          ) : (
            <span className="text-ink-3">Not connected</span>
          )}
          {ready && kind ? <span className="block text-12 text-ink-3">{kind}</span> : null}
        </Field>
        <Field label="Chain">
          {ready ? (
            <span className={wrongChain ? 'text-danger' : ''}>
              {chainId === CHAIN_ID ? 'Base Sepolia' : 'Unsupported chain'} ({chainId})
            </span>
          ) : (
            <span className="text-ink-3">Base Sepolia (84532) when connected</span>
          )}
        </Field>
        <Field label="Contracts">
          <span className="block font-mono text-12">USDC {USDC}</span>
          <span className="block font-mono text-12">spender {DEMO_SPENDER}</span>
          <span className="block font-mono text-12">vault {DEMO_VAULT}</span>
        </Field>
      </section>

      {!ready ? (
        <p className="m-0 text-14 text-ink-2">
          Connect a wallet to try the requests below. “Connect wallet” opens the WalletConnect modal: scan the
          QR code with the wallet, or use “Copy link” and paste it into Keyline’s Connect screen.
        </p>
      ) : null}

      {/* ---- actions ---- */}
      <div className="grid gap-4 md:grid-cols-2">
        <ActionCard
          n={1}
          title="Sign in (SIWE)"
          description="Signs an EIP-4361 message and verifies it with viem verifyMessage on Base Sepolia (ERC-1271 for a smart account)."
          sends={`personal_sign(message, ${address ? short(address) : 'account'})\nmessage: EIP-4361, domain ${APP_DOMAIN}, uri ${APP_ORIGIN}, chainId ${CHAIN_ID}, nonce, issuedAt, expirationTime +10 min`}
          outcome={siwe}
        >
          <Btn onClick={signIn} disabled={!can || siwe.phase === 'pending'}>
            Sign in
          </Btn>
          {siweMessage ? (
            <details className="w-full text-12 text-ink-2">
              <summary className="cursor-pointer">Message signed</summary>
              <pre className="m-0 mt-1 whitespace-pre-wrap break-all font-mono">{siweMessage}</pre>
            </details>
          ) : null}
        </ActionCard>

        <ActionCard
          n={2}
          title="Approve unlimited USDC"
          description="Lets the DemoSwap spender take any amount of your USDC, forever. A careful wallet should flag this."
          sends={`eth_sendTransaction → USDC.approve(${short(DEMO_SPENDER)}, 2^256 − 1)`}
          outcome={approveMax.outcome}
          tag={<span className="text-12 font-semibold text-danger">risky</span>}
        >
          <Btn
            variant="danger"
            onClick={() => approveMax.run('approve', DEMO_SPENDER, maxUint256)}
            disabled={!can || approveMax.busy}
          >
            Approve unlimited
          </Btn>
        </ActionCard>

        <ActionCard
          n={3}
          title="Approve 100 USDC"
          description="A capped allowance: the spender can take at most 100 USDC."
          sends={`eth_sendTransaction → USDC.approve(${short(DEMO_SPENDER)}, 100 000 000)  // 100 USDC`}
          outcome={approve100.outcome}
        >
          <Btn
            onClick={() => approve100.run('approve', DEMO_SPENDER, HUNDRED)}
            disabled={!can || approve100.busy}
          >
            Approve 100 USDC
          </Btn>
        </ActionCard>

        <ActionCard
          n={4}
          title="Swap (test)"
          description="There is no DEX we control on Base Sepolia. This test action sends 1 USDC to the DemoSwap vault (nobody holds its key) and waits for the receipt."
          sends={`eth_sendTransaction → USDC.transfer(${short(DEMO_VAULT)}, 1 000 000)  // 1 USDC`}
          outcome={swap.outcome}
          tag={
            <Chip
              label="Test action"
              tooltip="Not a swap: a plain 1 USDC transfer to a fixed vault address."
            />
          }
        >
          <Btn onClick={() => swap.run('transfer', DEMO_VAULT, ONE)} disabled={!can || swap.busy}>
            Swap 1 USDC (test)
          </Btn>
        </ActionCard>

        <ActionCard
          n={5}
          title="Send to sanctioned recipient"
          description={`Sends 1 USDC to the bank's seeded "${SANCTIONED_LABEL}". The wallet should block it.`}
          sends={`eth_sendTransaction → USDC.transfer(${sanctionedAddress ? short(sanctionedAddress) : '?'}, 1 000 000)`}
          outcome={sanctionedTx.outcome}
          tag={
            <Chip
              label="Simulated list"
              tooltip="The sanctions hit is simulated by the bank's screening module (docs/MOCKS.md)."
            />
          }
        >
          {sanctioned.loading ? (
            <span className="text-14 text-ink-3">Reading the address from the bank…</span>
          ) : null}
          {sanctioned.address ? (
            <span className="w-full break-all font-mono text-12 text-ink-2">
              {sanctioned.address} (from the bank, GET /contacts)
            </span>
          ) : null}
          {!sanctioned.loading && !sanctioned.address ? (
            <label className="flex w-full flex-col gap-1 text-12 text-ink-2">
              Bank not reachable ({sanctioned.error}). Paste the sanctioned address:
              <input
                className="h-10 rounded-control border border-line-strong bg-surface px-3 font-mono text-14 text-ink"
                value={pasted}
                onChange={(e) => setPasted(e.target.value.trim())}
                placeholder="0x…"
                spellCheck={false}
              />
            </label>
          ) : null}
          <Btn
            variant="danger"
            onClick={() => sanctionedAddress && sanctionedTx.run('transfer', sanctionedAddress, ONE)}
            disabled={!can || !sanctionedAddress || sanctionedTx.busy}
          >
            Send 1 USDC
          </Btn>
        </ActionCard>

        <ActionCard
          n={6}
          title="Batch (EIP-5792)"
          description="Two calls in one request: approve 100 USDC and transfer 1 USDC to the vault. Then polls the batch status."
          sends={`wallet_sendCalls { version: "2.0.0", chainId: 0x14a34, calls: [\n  USDC.approve(${short(DEMO_SPENDER)}, 100 USDC),\n  USDC.transfer(${short(DEMO_VAULT)}, 1 USDC) ] }\nthen wallet_getCallsStatus(id) every 1 s`}
          outcome={batchOutcome}
        >
          <Btn onClick={sendBatch} disabled={!can || (batch.phase === 'pending' && !cs)}>
            Send batch
          </Btn>
        </ActionCard>
      </div>

      {/* ---- request log ---- */}
      <section className="rounded-sheet border border-line bg-surface p-5">
        <h2 className="m-0 mb-3 text-16 font-semibold">Request log</h2>
        {log.length === 0 ? (
          <p className="m-0 text-14 text-ink-3">No requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-14">
              <thead>
                <tr className="border-b border-line text-12 text-ink-3">
                  <th className="py-2 pr-4 font-normal">Time</th>
                  <th className="py-2 pr-4 font-normal">Action</th>
                  <th className="py-2 pr-4 font-normal">Method</th>
                  <th className="py-2 font-normal">Result / tx hash</th>
                </tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.id} className="border-b border-line align-top">
                    <td className="py-2 pr-4 font-mono text-12 whitespace-nowrap">{e.time}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{e.action}</td>
                    <td className="py-2 pr-4 font-mono text-12">{e.method}</td>
                    <td className="py-2 break-all">
                      {e.result}
                      {e.hash ? (
                        <>
                          {' · '}
                          <a
                            className="font-mono text-12 text-ink underline"
                            href={txUrl(e.hash)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {short(e.hash)}
                          </a>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="text-12 text-ink-3">
        DemoSwap is a test app for the Keyline prototype. Testnet only (Base Sepolia); it holds no funds and
        is not a real exchange.
      </footer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-12 text-ink-3">{label}</span>
      <div className="text-14">{children}</div>
    </div>
  );
}
