/**
 * Gate 2 spike — TEST HARNESS ONLY (software passkeys, see src/test-passkey.ts).
 *
 *   mode finalize (default): new passkey → deploy its signer proxy → Safety key + Emergency card sign the module's
 *     EIP-712 ExecuteRecovery → relayer submits multiConfirmRecovery(execute=true) → wait the 180 s grace period →
 *     finalizeRecovery → Safe owners = [new proxy]. The keyfile's passkey is rotated to the new one, and the new
 *     passkey proves control by signing an ERC-1271 attestation that verifies on-chain.
 *   mode cancel: same up to "executed", then the OWNER (current passkey) sends a sponsored cancelRecovery userOp.
 *
 * Submitter (`--relayer auto|eoa|sponsored`): `eoa` = BANK_RELAYER_PRIVATE_KEY pays gas; `sponsored` = a
 * Candide-sponsored relayer Safe owned by that key (zero ETH); `auto` picks eoa when the relayer EOA holds ETH.
 * `--sq` replaces the Emergency card by the Swissquote guardian (SQ_GUARDIAN_PRIVATE_KEY signs; same relayed path).
 *
 * Usage: pnpm --filter @keyline/scripts spike:recovery --keyfile ../data/test-keyfile-recovery.json [--public]
 *        [--mode finalize|cancel] [--relayer auto|eoa|sponsored] [--sq]
 */

import {
  attestation,
  attestationChallenge,
  attestationSignatureFromPasskey,
  attestationTypedData,
  buildCancelRecoveryUserOp,
  buildCreateAndProtectUserOp,
  ChainError,
  createPasskeyAccount,
  eoaSubmitter,
  explorerAddressUrl,
  explorerTxUrl,
  loadPasskeyAccount,
  type PasskeyAccount,
  passkeySignerAddress,
  recovery,
  type Submitter,
  sponsoredRelayer,
} from '@keyline/chain';
import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  type Hex,
  http,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { arg, hasFlag, log, requireEnv, type SpikeEndpoints, sleep, spikeEndpoints } from './src/cli.js';
import { createEphemeralPasskey, loadTestKeys, type SoftPasskey, type TestKeys } from './src/test-passkey.js';
import { signSponsorSend } from './src/userop.js';

const endpoints: SpikeEndpoints = spikeEndpoints();
const { chainId, rpcUrl } = endpoints;
const recoveryModule = getAddress(requireEnv('RECOVERY_MODULE_ADDRESS'));
const sqGuardian = getAddress(requireEnv('SQ_GUARDIAN_ADDRESS'));
const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
const txLink = (hash: Hex): string => explorerTxUrl(chainId, hash);

async function pickSubmitter(): Promise<Submitter> {
  const relayerKey = requireEnv('BANK_RELAYER_PRIVATE_KEY') as Hex;
  const relayerEoa = privateKeyToAccount(relayerKey);
  const balance = await client.getBalance({ address: relayerEoa.address });
  const choice = arg('--relayer') ?? 'auto';
  const useEoa = choice === 'eoa' || (choice === 'auto' && balance >= 1_000_000_000_000_000n);
  log('relayer EOA', {
    address: relayerEoa.address,
    balanceEth: formatEther(balance),
    mode: useEoa ? 'eoa' : 'sponsored',
  });
  if (useEoa) {
    return eoaSubmitter(
      createWalletClient({ account: relayerEoa, chain: baseSepolia, transport: http(rpcUrl) }),
    );
  }
  if (!endpoints.paymasterUrl)
    throw new ChainError('MISSING_PAYMASTER', 'sponsored relayer needs a Candide URL (--public)');
  const relayer = sponsoredRelayer({
    ownerPrivateKey: relayerKey,
    endpoints: { chainId, rpcUrl, bundlerUrl: endpoints.bundlerUrl, paymasterUrl: endpoints.paymasterUrl },
  });
  log('sponsored relayer Safe', {
    address: explorerAddressUrl(chainId, relayer.address),
    owner: relayer.owner,
    deployed: await relayer.isDeployed(),
  });
  return relayer;
}

async function ensureProtectedSafe(keys: TestKeys): Promise<PasskeyAccount> {
  // After a recovery the owner passkey is no longer the one the address was derived from → use the recorded address.
  const pk = keys.safe
    ? loadPasskeyAccount(keys.safe, keys.passkey.publicKey)
    : createPasskeyAccount({ pubKeyX: keys.passkey.publicKey.x, pubKeyY: keys.passkey.publicKey.y });
  log('Safe', explorerAddressUrl(chainId, pk.address));
  if ((await client.getCode({ address: pk.address })) !== undefined) {
    await keys.save({ safe: pk.address });
    return pk;
  }
  const guardians: Address[] = [
    privateKeyToAccount(keys.guardians.safetyKey).address,
    privateKeyToAccount(keys.guardians.emergencyCard).address,
    sqGuardian,
  ];
  log('deploying + protecting (guardians, threshold 2)', guardians);
  const op = await buildCreateAndProtectUserOp(pk, { guardians, threshold: 2, recoveryModule }, endpoints);
  await signSponsorSend('create+protect', pk, keys.passkey, op, endpoints);
  await keys.save({ safe: pk.address });
  return pk;
}

async function owners(pk: PasskeyAccount): Promise<Address[]> {
  const list = await pk.account.getOwners(rpcUrl);
  return list.map((o) => getAddress(o));
}

/** Steps (a)+(b): new passkey proxy, two guardian signatures, relayed multiConfirmRecovery(execute = true). */
async function executeRecoveryFor(
  pk: PasskeyAccount,
  keys: TestKeys,
  submitter: Submitter,
): Promise<{ newPasskey: SoftPasskey; newOwner: Address }> {
  const { passkey: newPasskey } = await createEphemeralPasskey();
  const newOwner = passkeySignerAddress(newPasskey.publicKey);
  const proxy = await recovery.deploySignerProxy({
    client: submitter,
    reader: client,
    owner: newPasskey.publicKey,
  });
  log('(a) new passkey signer proxy', {
    address: explorerAddressUrl(chainId, proxy.address),
    tx: proxy.txHash ? txLink(proxy.txHash) : 'already deployed',
  });
  if (proxy.txHash) await client.waitForTransactionReceipt({ hash: proxy.txHash });

  const nonce = await recovery.recoveryNonce(client, recoveryModule, pk.address);
  const request = {
    wallet: pk.address,
    newOwners: [newOwner],
    threshold: 1n,
    nonce,
    chainId,
    module: recoveryModule,
  };
  const typedData = recovery.recoveryTypedData(request);
  const onChain = await recovery.recoveryHashOnChain(client, request);
  if (recovery.recoveryHash(request) !== onChain) throw new Error('recovery hash mismatch');

  const safetyKey = privateKeyToAccount(keys.guardians.safetyKey);
  const second = hasFlag('--sq')
    ? privateKeyToAccount(requireEnv('SQ_GUARDIAN_PRIVATE_KEY') as Hex)
    : privateKeyToAccount(keys.guardians.emergencyCard);
  const signatures = [
    { signer: safetyKey.address, signature: await safetyKey.signTypedData(typedData) },
    { signer: second.address, signature: await second.signTypedData(typedData) },
  ];
  log('(b) guardian signatures over ExecuteRecovery', {
    recoveryHash: onChain,
    nonce: nonce.toString(),
    signers: {
      safetyKey: safetyKey.address,
      [hasFlag('--sq') ? 'swissquote' : 'emergencyCard']: second.address,
    },
  });

  const txHash = await recovery.confirmWithSignatures({
    client: submitter,
    module: recoveryModule,
    wallet: pk.address,
    newOwners: [newOwner],
    threshold: 1n,
    signatures,
    execute: true,
  });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error(`multiConfirmRecovery reverted: ${txHash}`);
  const st = await recovery.status(client, recoveryModule, pk.address);
  log('(b) multiConfirmRecovery(execute=true) mined', { tx: txLink(txHash), status: st });
  if (!st.pending || !st.executeAfter) throw new Error('recovery not executed');
  return { newPasskey, newOwner };
}

async function finalizeFlow(pk: PasskeyAccount, keys: TestKeys, submitter: Submitter): Promise<void> {
  const before = await owners(pk);
  log('owners before', before);
  const { newPasskey, newOwner } = await executeRecoveryFor(pk, keys, submitter);

  // (c) wait for executeAfter (block timestamps; +3 s margin), polling the chain head
  for (;;) {
    const st = await recovery.status(client, recoveryModule, pk.address);
    const head = await client.getBlock();
    const remaining = Number(st.executeAfter ?? new Date(0)) / 1000 - Number(head.timestamp);
    if (remaining <= -3) break;
    log('(c) waiting for grace period', {
      executeAfter: st.executeAfter?.toISOString(),
      remainingSeconds: Math.ceil(remaining),
    });
    await sleep(Math.min(30_000, Math.max(5_000, (remaining + 4) * 1000)));
  }
  const finalizeTx = await recovery.finalize({
    client: submitter,
    module: recoveryModule,
    wallet: pk.address,
  });
  const receipt = await client.waitForTransactionReceipt({ hash: finalizeTx });
  if (receipt.status !== 'success') throw new Error(`finalizeRecovery reverted: ${finalizeTx}`);
  const after = await owners(pk);
  log('(c) finalizeRecovery mined', {
    tx: txLink(finalizeTx),
    ownersAfter: after,
    expectedNewOwner: newOwner,
  });
  if (after.length !== 1 || after[0] !== newOwner)
    throw new Error('owners after finalize are not [newOwner]');
  const st = await recovery.status(client, recoveryModule, pk.address);
  log('status after finalize', st);

  // Keyfile now follows the Safe: persist the new passkey (+ the Safe address) and prove control (ERC-1271, no gas)
  await keys.save({ passkey: newPasskey, safe: pk.address });
  log('keyfile rotated to the new passkey', arg('--keyfile'));
  const fields = {
    clientId: 'SQ-48213-LK',
    wallet: pk.address,
    chainId,
    nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
  };
  const assertion = await newPasskey.sign(attestationChallenge(fields));
  const proof = await attestation.verify({
    client,
    wallet: pk.address,
    typedData: attestationTypedData(fields),
    signature: attestationSignatureFromPasskey(assertion, newPasskey.publicKey),
  });
  log('new passkey proves control (ERC-1271 attestation)', proof);
  if (!proof.ok) throw new Error('new passkey attestation failed');
}

async function cancelFlow(pk: PasskeyAccount, keys: TestKeys, submitter: Submitter): Promise<void> {
  const before = await owners(pk);
  await executeRecoveryFor(pk, keys, submitter);
  // (d) the owner vetoes: cancelRecovery() must be called by the Safe → sponsored owner userOp
  const op = await buildCancelRecoveryUserOp(pk, recoveryModule, endpoints);
  const sent = await signSponsorSend('(d) owner cancelRecovery userOp', pk, keys.passkey, op, endpoints);
  const st = await recovery.status(client, recoveryModule, pk.address);
  log('(d) status after cancel', { tx: txLink(sent.txHash), status: st, owners: await owners(pk) });
  if (st.pending) throw new Error('recovery still pending after cancel');
  if ((await owners(pk)).join() !== before.join()) throw new Error('owners changed after cancel');
}

async function main(): Promise<void> {
  const keyfile = arg('--keyfile');
  if (!keyfile) throw new Error('--keyfile <path> is required');
  const mode = arg('--mode') ?? 'finalize';
  log('spike-recovery', { mode, chainId: chainId.toString(), module: recoveryModule });
  const keys = await loadTestKeys(keyfile);
  const pk = await ensureProtectedSafe(keys);
  const submitter = await pickSubmitter();
  if (mode === 'cancel') await cancelFlow(pk, keys, submitter);
  else await finalizeFlow(pk, keys, submitter);
  log('RESULT', 'PASS');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
