/**
 * `pnpm demo:predeploy` — the fallback for a nervous presenter: two Safes created + protected ahead of time.
 *
 *   lea   Lea's fallback wallet (shown first in the pitch if live onboarding is skipped or fails).
 *   twin  identical wallet used by `demo:stage-recovery`: its recovery is started ~2:30 before the pitch so the
 *         3-minute on-chain countdown ends while the judges watch (03-DEMO-SCRIPT.md "Timing trick").
 *
 * Each wallet: software passkey (TEST HARNESS, scripts/src/test-passkey.ts) → counterfactual Safe → ONE sponsored
 * userOp [deploy + enableModule(recovery) + addGuardian ×3, threshold 2] → guardians verified on-chain. Both the
 * Safety key and the Emergency card are script-held EOAs (a Node script cannot reach the laptop's IndexedDB), the
 * third recoverer is the live sq-guardian EOA (SQ_GUARDIAN_ADDRESS) — the custody claim is the same as in the app.
 *
 * Then, best effort: USDC top-up from the bank funder (skipped with the faucet URL while it holds 0 USDC), and the
 * bank registry (`--bank http://localhost:4000`, default; skipped if unreachable): POST /wallets + guardians + the
 * ERC-1271 ownership attestation signed by the software passkey, so /topups and the Security centre know the wallet.
 *
 * Writes data/demo-state.json (0600, git-ignored): { passkey, guardians, safe, lea: {...}, twin: {...} } and prints
 * the Basescan links + the localStorage line that lets "Lea · phone" resume the fallback wallet read-only.
 *
 * Usage: pnpm --filter @keyline/scripts demo:predeploy [--public] [--fresh] [--topup 10] [--bank URL|none]
 *   --fresh   ignore an existing demo-state.json and deploy two new Safes
 */
import {
  attestationChallenge,
  attestationSignatureFromPasskey,
  buildCreateAndProtectUserOp,
  ChainError,
  createPasskeyAccount,
  passkeySignerAddress,
  recovery,
} from '@keyline/chain';
import {
  type Address,
  createWalletClient,
  erc20Abi,
  formatUnits,
  getAddress,
  type Hex,
  http,
  parseUnits,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import {
  basescanAddress,
  basescanTx,
  DEMO_STATE_PATH,
  type DemoState,
  type DemoWalletState,
  demoBalances,
  printFaucets,
  publicClient,
  readDemoState,
  usdcAddress,
  writeDemoState,
} from './demo-lib.js';
import { arg, env, hasFlag, log, requireEnv, spikeEndpoints } from './src/cli.js';
import { createEphemeralPasskey, passkeyFromJwk, type SoftPasskey } from './src/test-passkey.js';
import { signSponsorSend } from './src/userop.js';

const endpoints = spikeEndpoints();
const client = publicClient();
const recoveryModule = getAddress(requireEnv('RECOVERY_MODULE_ADDRESS'));
const sqGuardian = getAddress(requireEnv('SQ_GUARDIAN_ADDRESS'));
const DEVICE_LABEL = 'Lea · phone';

function hex32(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, '0')}`;
}

async function deployProtected(label: 'lea' | 'twin'): Promise<DemoWalletState> {
  const { passkey, jwk } = await createEphemeralPasskey();
  const pk = createPasskeyAccount({ pubKeyX: passkey.publicKey.x, pubKeyY: passkey.publicKey.y });
  const guardians = { safetyKey: generatePrivateKey(), emergencyCard: generatePrivateKey() };
  const safetyKey = privateKeyToAccount(guardians.safetyKey).address;
  const emergencyCard = privateKeyToAccount(guardians.emergencyCard).address;
  log(`[${label}] counterfactual Safe`, basescanAddress(pk.address));
  const op = await buildCreateAndProtectUserOp(
    pk,
    { guardians: [safetyKey, emergencyCard, sqGuardian], threshold: 2, recoveryModule },
    endpoints,
  );
  const sent = await signSponsorSend(`[${label}] create+protect`, pk, passkey, op, endpoints);
  const st = await recovery.status(client, recoveryModule, pk.address);
  if (st.guardians.length !== 3 || st.guardianThreshold !== 2n)
    throw new Error(`[${label}] guardian set wrong on-chain: ${JSON.stringify(st)}`);
  log(`[${label}] protected`, { guardians: st.guardians, threshold: st.guardianThreshold.toString() });
  return {
    passkey: jwk,
    guardians,
    addresses: {
      safe: pk.address,
      signerProxy: passkeySignerAddress(pk.owner),
      safetyKey,
      emergencyCard,
      swissquote: sqGuardian,
    },
    passkeyPublic: {
      pubKeyX: hex32(passkey.publicKey.x),
      pubKeyY: hex32(passkey.publicKey.y),
      credentialId: `demo-predeploy-${label}-${pk.address.slice(2, 10).toLowerCase()}`,
    },
    protectTxHash: sent.txHash,
    createdAt: new Date().toISOString(),
  };
}

async function topUp(wallet: DemoWalletState, amountUsdc: string): Promise<Hex | null> {
  const funderKey = env('BANK_FUNDER_PRIVATE_KEY') as Hex | undefined;
  if (!funderKey) {
    log('top-up skipped', 'BANK_FUNDER_PRIVATE_KEY not in root .env');
    return null;
  }
  const funder = privateKeyToAccount(funderKey);
  const usdc = usdcAddress();
  const amount = parseUnits(amountUsdc, 6);
  const [eth, bal] = await Promise.all([
    client.getBalance({ address: funder.address }),
    client.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [funder.address] }),
  ]);
  if (bal < amount || eth < 200_000_000_000_000n) {
    log(
      'top-up skipped',
      `funder ${funder.address} holds ${formatUnits(bal, 6)} USDC / ${formatUnits(eth, 18)} ETH — needs ≥ ${amountUsdc} USDC and ≥ 0.0002 ETH (https://faucet.circle.com)`,
    );
    return null;
  }
  const wallet_ = createWalletClient({
    account: funder,
    chain: baseSepolia,
    transport: http(requireEnv('RPC_URL')),
  });
  const hash = await wallet_.writeContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [wallet.addresses.safe, amount],
  });
  await client.waitForTransactionReceipt({ hash });
  log(`top-up ${amountUsdc} USDC → ${wallet.addresses.safe}`, basescanTx(hash));
  return hash;
}

async function bankJson(
  bank: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(`${bank}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'X-Device-Label': DEVICE_LABEL.replace(/[^\x20-\x7e]/g, '-'),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : null };
}

/** Teach the bank about the wallet (registry + recoverers + ownership proof) so top-ups and the desk work on it. */
async function registerWithBank(bank: string, wallet: DemoWalletState, passkey: SoftPasskey): Promise<void> {
  try {
    const health = await fetch(`${bank}/health`, { signal: AbortSignal.timeout(2000) });
    if (!health.ok) throw new Error(`health ${health.status}`);
  } catch (error) {
    log(
      'bank registration skipped',
      `${bank} unreachable (${error instanceof Error ? error.message : error})`,
    );
    return;
  }
  const created = await bankJson(bank, 'POST', '/wallets', {
    pubKeyX: wallet.passkeyPublic.pubKeyX,
    pubKeyY: wallet.passkeyPublic.pubKeyY,
    credentialId: wallet.passkeyPublic.credentialId,
    deviceLabel: DEVICE_LABEL,
    recoveryMode: 'default',
  });
  if (created.status === 201 && created.json?.address) {
    const addr = String(created.json.address);
    if (addr.toLowerCase() !== wallet.addresses.safe.toLowerCase())
      throw new Error(
        `bank derived ${addr}, script has ${wallet.addresses.safe} — abstractionkit versions differ?`,
      );
  } else if (created.status !== 409) {
    log('bank POST /wallets', { status: created.status, body: created.json });
    return;
  }
  for (const body of [
    { kind: 'safety-key', address: wallet.addresses.safetyKey },
    { kind: 'emergency-card', address: wallet.addresses.emergencyCard },
    { kind: 'swissquote' },
  ]) {
    const g = await bankJson(bank, 'POST', `/wallets/${wallet.addresses.safe}/guardians`, body);
    if (g.status !== 201 && g.status !== 200 && g.status !== 409) log(`bank guardian ${body.kind}`, g);
  }
  // Ownership proof (SPEC F1.6) with the software passkey: the same ERC-1271 path the phone uses.
  const challenge = await bankJson(bank, 'GET', `/attestations/${wallet.addresses.safe}/challenge`);
  const nonce = challenge.json?.nonce as Hex | undefined;
  const typed = challenge.json?.typedData as { message?: { clientId?: string } } | undefined;
  const clientId = typed?.message?.clientId;
  if (challenge.status !== 200 || !nonce || !clientId) {
    log('bank attestation skipped', challenge);
    return;
  }
  const fields = { clientId, wallet: wallet.addresses.safe, chainId: endpoints.chainId, nonce };
  const assertion = await passkey.sign(attestationChallenge(fields));
  const signature = attestationSignatureFromPasskey(assertion, passkey.publicKey);
  const att = await bankJson(bank, 'POST', '/attestations', {
    wallet: wallet.addresses.safe,
    clientId,
    nonce,
    signature,
  });
  log('bank attestation', att.status === 201 ? 'verified (wallet attested → top-ups allowed)' : att);
}

function resumeLine(wallet: DemoWalletState, attested: boolean): string {
  const local = {
    address: wallet.addresses.safe,
    credentialId: wallet.passkeyPublic.credentialId,
    pubKeyX: wallet.passkeyPublic.pubKeyX,
    pubKeyY: wallet.passkeyPublic.pubKeyY,
    deviceLabel: DEVICE_LABEL,
    status: 'deployed',
    protectTxHash: wallet.protectTxHash,
    attested,
    recoveryMode: 'default',
    guardians: {
      safetyKey: wallet.addresses.safetyKey,
      emergencyCard: wallet.addresses.emergencyCard,
      swissquote: wallet.addresses.swissquote,
    },
    onboardingStep: 7,
  };
  return `localStorage.setItem('keyline.wallet', ${JSON.stringify(JSON.stringify(local))}); location.reload();`;
}

async function main(): Promise<void> {
  log('demo-predeploy', {
    chainId: endpoints.chainId.toString(),
    sponsorship: endpoints.paymasterUrl ? 'yes' : 'NO (add --public)',
    stateFile: DEMO_STATE_PATH,
  });
  const existing = hasFlag('--fresh') ? null : readDemoState();
  let state: DemoState;
  if (existing && (await client.getCode({ address: existing.lea.addresses.safe })) !== undefined) {
    log(
      'reusing',
      `${DEMO_STATE_PATH} (lea ${existing.lea.addresses.safe}, twin ${existing.twin.addresses.safe})`,
    );
    state = existing;
  } else {
    const lea = await deployProtected('lea');
    const twin = await deployProtected('twin');
    state = {
      version: 1,
      chainId: Number(endpoints.chainId),
      recoveryModule,
      passkey: lea.passkey,
      guardians: lea.guardians,
      safe: lea.addresses.safe,
      lea,
      twin,
    };
    writeDemoState(state);
    log('written', DEMO_STATE_PATH);
  }

  const amount = arg('--topup') ?? '10';
  for (const wallet of [state.lea, state.twin]) {
    const bal = await client.readContract({
      address: usdcAddress(),
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [wallet.addresses.safe],
    });
    if (bal >= parseUnits(amount, 6)) {
      log(`${wallet.addresses.safe} already holds`, `${formatUnits(bal, 6)} USDC`);
      continue;
    }
    const tx = await topUp(wallet, amount);
    if (tx) wallet.topupTxHash = tx;
  }
  writeDemoState(state);

  const bank = arg('--bank') ?? 'http://localhost:4000';
  let attested = false;
  if (bank !== 'none') {
    await registerWithBank(bank, state.lea, await passkeyFromJwk(state.lea.passkey));
    const check = await bankJson(bank, 'GET', `/attestations/${state.lea.addresses.safe}`).catch(() => null);
    attested = check?.status === 200;
  }

  const { lines } = await demoBalances([
    { label: 'Lea fallback Safe', address: state.lea.addresses.safe },
    { label: 'Twin Safe', address: state.twin.addresses.safe },
  ]);
  const funder = lines.find((l) => l.label === 'Bank funder');
  if (funder && funder.usdc === 0n) printFaucets();

  console.info(`
== Fallback wallets (data/demo-state.json)
Lea   Safe  ${basescanAddress(state.lea.addresses.safe)}
      protect tx ${basescanTx(state.lea.protectTxHash)}${state.lea.topupTxHash ? `\n      top-up  tx ${basescanTx(state.lea.topupTxHash)}` : ''}
      recoverers safety ${state.lea.addresses.safetyKey} · card ${state.lea.addresses.emergencyCard} · Swissquote ${state.lea.addresses.swissquote}
Twin  Safe  ${basescanAddress(state.twin.addresses.safe)}
      protect tx ${basescanTx(state.twin.protectTxHash)}${state.twin.topupTxHash ? `\n      top-up  tx ${basescanTx(state.twin.topupTxHash)}` : ''}
      → pnpm demo:stage-recovery at T−2:30 before the pitch

Resume Lea's fallback wallet in the "Lea · phone" Chrome window (DevTools console, read-only: the passkey is script-held):
${resumeLine(state.lea, attested)}
`);
}

main().catch((error: unknown) => {
  if (error instanceof ChainError && error.code === 'MISSING_PAYMASTER') {
    console.error(`\nBLOCKED: ${error.message}`);
    process.exit(2);
  }
  console.error(error);
  process.exit(1);
});

export type { Address };
