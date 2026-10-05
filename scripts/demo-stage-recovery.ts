/**
 * `pnpm demo:stage-recovery` — start a recovery on the TWIN wallet so its 3-minute on-chain countdown ends during
 * the pitch (03-DEMO-SCRIPT.md: run it ~2 min 30 s before you start; the finalize moment lands around 2:30).
 *
 * What it does (all real, Base Sepolia, zero ETH needed thanks to the Candide-sponsored relayer Safe):
 *   1. new software passkey for "Lea · new phone" → deploySignerProxy (SafeWebAuthnSignerProxy via the factory)
 *   2. the twin's Safety key + Emergency card (script-held, data/demo-state.json) sign the module's EIP-712
 *      ExecuteRecovery(wallet, newOwners, newThreshold, nonce) — exactly what the laptop / the card do in the app
 *   3. relayer → multiConfirmRecovery(execute = true) → executed; prints `executeAfter` + the Zürich wall-clock time.
 *
 * The countdown is readable by anyone: Basescan (getRecoveryRequest) and the wallet's /recover ring read the chain.
 * This staged recovery does NOT go through the bank, so it is not in the desk queue — say so if asked.
 *
 * Usage: pnpm --filter @keyline/scripts demo:stage-recovery [--public] [--wallet twin|lea] [--relayer auto|eoa|sponsored]
 *        pnpm --filter @keyline/scripts demo:stage-recovery --finalize   # after executeAfter: finalizeRecovery, rotate keyfile
 *        pnpm --filter @keyline/scripts demo:stage-recovery --status     # just print the on-chain state
 */
import {
  ChainError,
  eoaSubmitter,
  explorerAddressUrl,
  passkeySignerAddress,
  recovery,
  type Submitter,
  sponsoredRelayer,
} from '@keyline/chain';
import { createWalletClient, formatEther, type Hex, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import {
  basescanAddress,
  basescanTx,
  DEMO_STATE_PATH,
  type DemoWalletState,
  publicClient,
  readDemoState,
  writeDemoState,
  zurichClock,
} from './demo-lib.js';
import { arg, hasFlag, log, requireEnv, sleep, spikeEndpoints } from './src/cli.js';
import { createEphemeralPasskey, passkeyFromJwk } from './src/test-passkey.js';

const endpoints = spikeEndpoints();
const client = publicClient();
const recoveryModule = requireEnv('RECOVERY_MODULE_ADDRESS') as `0x${string}`;

async function pickSubmitter(): Promise<Submitter> {
  const relayerKey = requireEnv('BANK_RELAYER_PRIVATE_KEY') as Hex;
  const relayerEoa = privateKeyToAccount(relayerKey);
  const balance = await client.getBalance({ address: relayerEoa.address });
  const choice = arg('--relayer') ?? 'auto';
  const useEoa = choice === 'eoa' || (choice === 'auto' && balance >= 1_000_000_000_000_000n);
  log('relayer', {
    eoa: relayerEoa.address,
    balanceEth: formatEther(balance),
    mode: useEoa ? 'eoa' : 'sponsored',
  });
  if (useEoa) {
    return eoaSubmitter(
      createWalletClient({ account: relayerEoa, chain: baseSepolia, transport: http(endpoints.rpcUrl) }),
    );
  }
  if (!endpoints.paymasterUrl)
    throw new ChainError('MISSING_PAYMASTER', 'the sponsored relayer needs a Candide URL (add --public)');
  const relayer = sponsoredRelayer({
    ownerPrivateKey: relayerKey,
    endpoints: { ...endpoints, paymasterUrl: endpoints.paymasterUrl },
  });
  log('sponsored relayer Safe', { address: explorerAddressUrl(endpoints.chainId, relayer.address) });
  return relayer;
}

function describe(st: Awaited<ReturnType<typeof recovery.status>>): Record<string, unknown> {
  return {
    pending: st.pending,
    approvals: st.approvals.toString(),
    nonce: st.nonce.toString(),
    executeAfter: st.executeAfter?.toISOString(),
    executeAfterZurich: st.executeAfter ? zurichClock(st.executeAfter) : undefined,
    newOwners: st.newOwners,
    guardians: st.guardians,
    threshold: st.guardianThreshold.toString(),
  };
}

async function stage(wallet: DemoWalletState, submitter: Submitter): Promise<void> {
  const safe = wallet.addresses.safe;
  const before = await recovery.status(client, recoveryModule, safe);
  if (before.pending) {
    log('a recovery is already executed on this wallet', describe(before));
    console.info(
      `Countdown ends at ${before.executeAfter ? zurichClock(before.executeAfter) : '?'} (Zürich). Use --finalize after that.`,
    );
    return;
  }
  const { passkey: newPasskey, jwk } = await createEphemeralPasskey();
  const newOwner = passkeySignerAddress(newPasskey.publicKey);
  const proxy = await recovery.deploySignerProxy({
    client: submitter,
    reader: client,
    owner: newPasskey.publicKey,
  });
  log('(1) new phone signer proxy', {
    address: basescanAddress(proxy.address),
    tx: proxy.txHash ? basescanTx(proxy.txHash) : 'already deployed',
  });
  if (proxy.txHash) await client.waitForTransactionReceipt({ hash: proxy.txHash });

  const nonce = await recovery.recoveryNonce(client, recoveryModule, safe);
  const request = {
    wallet: safe,
    newOwners: [newOwner],
    threshold: 1n,
    nonce,
    chainId: endpoints.chainId,
    module: recoveryModule,
  };
  const typedData = recovery.recoveryTypedData(request);
  const onChain = await recovery.recoveryHashOnChain(client, request);
  if (recovery.recoveryHash(request) !== onChain) throw new Error('recovery hash mismatch — do not proceed');
  const safetyKey = privateKeyToAccount(wallet.guardians.safetyKey);
  const emergencyCard = privateKeyToAccount(wallet.guardians.emergencyCard);
  const signatures = recovery.sortGuardianSignatures([
    { signer: safetyKey.address, signature: await safetyKey.signTypedData(typedData) },
    { signer: emergencyCard.address, signature: await emergencyCard.signTypedData(typedData) },
  ]);
  log('(2) Safety key + Emergency card signed ExecuteRecovery', {
    recoveryHash: onChain,
    nonce: nonce.toString(),
  });

  const txHash = await recovery.confirmWithSignatures({
    client: submitter,
    module: recoveryModule,
    wallet: safe,
    newOwners: [newOwner],
    threshold: 1n,
    signatures,
    execute: true,
  });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error(`multiConfirmRecovery reverted: ${txHash}`);
  const st = await recovery.status(client, recoveryModule, safe);
  if (!st.pending || !st.executeAfter) throw new Error('recovery not executed');
  log('(3) multiConfirmRecovery(execute=true) mined', { tx: basescanTx(txHash), ...describe(st) });

  wallet.pendingRecovery = {
    newPasskey: jwk,
    newOwner,
    signerProxyTxHash: proxy.txHash,
    executeTxHash: txHash,
    executeAfter: st.executeAfter.toISOString(),
    nonce: nonce.toString(),
    stagedAt: new Date().toISOString(),
  };
  const seconds = Math.round((st.executeAfter.getTime() - Date.now()) / 1000);
  console.info(`
== STAGED. Countdown on ${safe}
   executeAfter  ${st.executeAfter.toISOString()}
   Zürich time   ${zurichClock(st.executeAfter)}   (in ${seconds} s — now ${zurichClock(new Date())})
   Basescan      ${basescanAddress(safe)}  ·  ${basescanTx(txHash)}
   Then: the UI / sq-guardian finalizes, or \`pnpm demo:stage-recovery --finalize\`.
`);
}

async function finalize(wallet: DemoWalletState, submitter: Submitter): Promise<void> {
  const safe = wallet.addresses.safe;
  const pending = wallet.pendingRecovery;
  if (!pending) throw new Error('nothing staged for this wallet (run without --finalize first)');
  for (;;) {
    const st = await recovery.status(client, recoveryModule, safe);
    if (!st.pending) throw new Error('no pending recovery on-chain (cancelled or already finalized)');
    const head = await client.getBlock();
    const remaining = Number(st.executeAfter ?? new Date(0)) / 1000 - Number(head.timestamp);
    if (remaining <= -3) break;
    log('waiting for the grace period', {
      executeAfter: st.executeAfter?.toISOString(),
      remainingSeconds: Math.ceil(remaining),
    });
    await sleep(Math.min(30_000, Math.max(5_000, (remaining + 4) * 1000)));
  }
  const tx = await recovery.finalize({ client: submitter, module: recoveryModule, wallet: safe });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== 'success') throw new Error(`finalizeRecovery reverted: ${tx}`);
  const newPasskey = await passkeyFromJwk(pending.newPasskey);
  wallet.passkey = pending.newPasskey;
  wallet.addresses.signerProxy = pending.newOwner;
  wallet.passkeyPublic = {
    pubKeyX: `0x${newPasskey.publicKey.x.toString(16).padStart(64, '0')}`,
    pubKeyY: `0x${newPasskey.publicKey.y.toString(16).padStart(64, '0')}`,
    credentialId: `${wallet.passkeyPublic.credentialId}-recovered`,
  };
  wallet.pendingRecovery = undefined;
  log('finalized — Safe owner is the new phone', { tx: basescanTx(tx), newOwner: pending.newOwner });
}

async function main(): Promise<void> {
  const state = readDemoState();
  if (!state) throw new Error(`${DEMO_STATE_PATH} missing — run \`pnpm demo:predeploy\` first`);
  const which = arg('--wallet') === 'lea' ? 'lea' : 'twin';
  const wallet = state[which];
  log('demo-stage-recovery', { wallet: which, safe: wallet.addresses.safe, module: recoveryModule });

  if (hasFlag('--status')) {
    log('on-chain', describe(await recovery.status(client, recoveryModule, wallet.addresses.safe)));
    return;
  }
  const submitter = await pickSubmitter();
  if (hasFlag('--finalize')) await finalize(wallet, submitter);
  else await stage(wallet, submitter);
  writeDemoState(state);
}

main().catch((error: unknown) => {
  if (error instanceof ChainError && error.code === 'MISSING_PAYMASTER') {
    console.error(`\nBLOCKED: ${error.message}`);
    process.exit(2);
  }
  console.error(error);
  process.exit(1);
});
