/**
 * `pnpm keyline` — the client-side exit hatch (SPEC §3 F5, §8): everything here talks to the chain directly.
 * No bank process, no Keyline server. It needs an RPC URL and, when no EOA holds ETH, a Candide endpoint for the
 * Safety key's sponsored relayer Safe (`--public` = Candide's public testnet endpoint; in production the client
 * simply pays gas from any funded account, so the sponsor is a testnet convenience, not a dependency).
 *
 *   pnpm keyline recover --without-bank --safe <addr> --safety-key <file.json> --emergency-card <hex>
 *                        (--new-passkey <keyfile> | --new-owner <addr>) [--finalize] [--public]
 *                        [--module <addr>] [--rpc <url>]
 *   pnpm keyline guardians --safe <addr> [--module <addr>] [--rpc <url>]       "verify yourself"
 *   pnpm keyline status    --safe <addr> [--module <addr>] [--rpc <url>]
 *
 * Safety-key file (prototype): the plain JSON the wallet's "Export Safety key" writes, `{ "address", "privateKey" }`,
 * protected by file permissions (0600). Production: EIP-2335 / Web3 Secret Storage keystore (password-encrypted) —
 * no keystore library is installed in this workspace, so we do not hand-roll one (see docs/VERIFIED.md §14).
 * `--emergency-card <hex>` is the 32-byte private key printed on the card (0x-prefixed).
 * `--new-passkey <keyfile>` reads (or creates) a TEST passkey keyfile (scripts/src/test-passkey.ts) — the stand-in
 * for the new phone; `--new-owner <addr>` takes an already-deployed signer proxy / any owner address instead.
 */
import { existsSync, readFileSync } from 'node:fs';
import {
  eoaSubmitter,
  explorerAddressUrl,
  explorerTxUrl,
  gracePeriodSeconds,
  passkeySignerAddress,
  RECOVERY_MODULE_3_MINUTES,
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
  isAddress,
  isHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { arg, env, hasFlag, log, sleep, spikeEndpoints } from './src/cli.js';
import { loadTestKeys } from './src/test-passkey.js';

const SAFE_ABI = [
  {
    type: 'function',
    name: 'getOwners',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'getThreshold',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

/** An EOA with at least this much ETH pays its own gas; below it we use the Safety key's sponsored relayer Safe. */
const MIN_SELF_PAY_WEI = 300_000_000_000_000n; // 0.0003 ETH ≈ a few module calls on Base Sepolia

class UsageError extends Error {}

function usage(): string {
  return [
    'Usage:',
    '  pnpm keyline recover --without-bank --safe <addr> --safety-key <file.json> --emergency-card <hex>',
    '                       (--new-passkey <keyfile> | --new-owner <addr>) [--finalize] [--public] [--module <addr>] [--rpc <url>]',
    '  pnpm keyline guardians --safe <addr> [--module <addr>] [--rpc <url>]',
    '  pnpm keyline status    --safe <addr> [--module <addr>] [--rpc <url>]',
  ].join('\n');
}

function requireAddressArg(flag: string): Address {
  const value = arg(flag);
  if (!value || !isAddress(value)) throw new UsageError(`${flag} <address> is required`);
  return getAddress(value);
}

type ChainClient = ReturnType<typeof makeClient>;

function makeClient(rpcUrl: string) {
  return createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
}

function chainContext(): { client: ChainClient; rpcUrl: string; module: Address; safe: Address } {
  const rpcUrl = arg('--rpc') ?? env('RPC_URL') ?? 'https://sepolia.base.org';
  const module = getAddress(arg('--module') ?? env('RECOVERY_MODULE_ADDRESS') ?? RECOVERY_MODULE_3_MINUTES);
  const client = makeClient(rpcUrl);
  return { client, rpcUrl, module, safe: requireAddressArg('--safe') };
}

async function safeOwners(
  client: ChainClient,
  safe: Address,
): Promise<{ owners: Address[]; threshold: bigint }> {
  const [owners, threshold] = await Promise.all([
    client.readContract({ address: safe, abi: SAFE_ABI, functionName: 'getOwners' }),
    client.readContract({ address: safe, abi: SAFE_ABI, functionName: 'getThreshold' }),
  ]);
  return { owners: owners.map((o) => getAddress(o)), threshold };
}

function describeStatus(
  st: recovery.RecoveryStatus,
  chainId: bigint,
  module: Address,
  safe: Address,
): Record<string, unknown> {
  return {
    guardians: st.guardians,
    guardianThreshold: st.guardianThreshold.toString(),
    nonce: st.nonce.toString(),
    pendingRecovery: st.pending
      ? {
          newOwners: st.newOwners,
          newThreshold: st.newThreshold?.toString(),
          approvals: st.approvals.toString(),
          executeAfter: st.executeAfter?.toISOString(),
          finishesAtLocal: st.executeAfter?.toLocaleString(),
        }
      : null,
    verifyYourself: `${explorerAddressUrl(chainId, module)}#readContract → getGuardians(${safe})`,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// guardians / status
// ---------------------------------------------------------------------------------------------------------------

async function cmdGuardians(): Promise<void> {
  const { client, module, safe } = chainContext();
  const chainId = BigInt(await client.getChainId());
  const [st, owners] = await Promise.all([recovery.status(client, module, safe), safeOwners(client, safe)]);
  log('Safe', explorerAddressUrl(chainId, safe));
  log('owners (on-chain getOwners)', owners.owners);
  log('owner threshold', owners.threshold.toString());
  log('recovery module', explorerAddressUrl(chainId, module));
  log('grace period (s)', gracePeriodSeconds(module));
  log('guardians (on-chain getGuardians)', st.guardians);
  log('guardian threshold', `${st.guardianThreshold.toString()} of ${st.guardians.length}`);
  log('pending recovery', describeStatus(st, chainId, module, safe).pendingRecovery ?? 'none');
  log('verify yourself', `${explorerAddressUrl(chainId, module)}#readContract → getGuardians(${safe})`);
}

async function cmdStatus(): Promise<void> {
  const { client, module, safe } = chainContext();
  const chainId = BigInt(await client.getChainId());
  const [st, owners, code] = await Promise.all([
    recovery.status(client, module, safe),
    safeOwners(client, safe),
    client.getCode({ address: safe }),
  ]);
  log('status', {
    safe: explorerAddressUrl(chainId, safe),
    deployed: code !== undefined && code !== '0x',
    owners: owners.owners,
    ownerThreshold: owners.threshold.toString(),
    module,
    gracePeriodSeconds: gracePeriodSeconds(module),
    ...describeStatus(st, chainId, module, safe),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// recover --without-bank
// ---------------------------------------------------------------------------------------------------------------

interface ClientGuardians {
  readonly safetyKey: Hex;
  readonly emergencyCard: Hex;
}

function readSafetyKeyFile(path: string): Hex {
  if (!existsSync(path)) throw new UsageError(`--safety-key file not found: ${path}`);
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const key = parsed.privateKey;
  if (!isHex(key) || key.length !== 66) {
    throw new UsageError(
      `${path}: expected { "address", "privateKey": "0x<64 hex>" } (prototype plain-JSON export)`,
    );
  }
  if (typeof parsed.address === 'string' && isAddress(parsed.address)) {
    const derived = privateKeyToAccount(key).address;
    if (getAddress(parsed.address) !== derived)
      throw new UsageError(`${path}: address does not match privateKey`);
  }
  return key;
}

function clientGuardians(): ClientGuardians {
  const safetyPath = arg('--safety-key');
  const card = arg('--emergency-card');
  if (!safetyPath) throw new UsageError('--safety-key <file.json> is required');
  if (!card || !isHex(card) || card.length !== 66)
    throw new UsageError('--emergency-card <0x 32-byte hex> is required');
  return { safetyKey: readSafetyKeyFile(safetyPath), emergencyCard: card };
}

/** Who pays: the Emergency-card EOA if funded, else the Safety-key EOA if funded, else a sponsored relayer Safe. */
async function pickSubmitter(
  client: ChainClient,
  rpcUrl: string,
  keys: ClientGuardians,
): Promise<{ submitter: Submitter; description: string }> {
  const chainId = BigInt(await client.getChainId());
  for (const [label, key] of [
    ['Emergency card', keys.emergencyCard],
    ['Safety key', keys.safetyKey],
  ] as const) {
    const account = privateKeyToAccount(key);
    const balance = await client.getBalance({ address: account.address });
    log(`${label} EOA ${account.address}`, `${formatEther(balance)} ETH`);
    if (balance >= MIN_SELF_PAY_WEI) {
      const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });
      return { submitter: eoaSubmitter(wallet), description: `${label} EOA pays gas (${account.address})` };
    }
  }
  const endpoints = spikeEndpoints();
  if (!endpoints.paymasterUrl) {
    throw new UsageError(
      'No client EOA holds ETH and no Candide endpoint is configured. Fund the Emergency-card or Safety-key address ' +
        '(any faucet), or re-run with --public to use the Candide public testnet sponsor for a relayer Safe owned by the Safety key.',
    );
  }
  const relayer = sponsoredRelayer({
    ownerPrivateKey: keys.safetyKey,
    endpoints: { chainId, rpcUrl, bundlerUrl: endpoints.bundlerUrl, paymasterUrl: endpoints.paymasterUrl },
  });
  return {
    submitter: relayer,
    description: `sponsored relayer Safe ${relayer.address} owned by the Safety key (Candide pays; deployed=${await relayer.isDeployed()})`,
  };
}

async function resolveNewOwner(client: ChainClient, submitter: Submitter, chainId: bigint): Promise<Address> {
  const explicit = arg('--new-owner');
  if (explicit) {
    if (!isAddress(explicit)) throw new UsageError('--new-owner must be an address');
    return getAddress(explicit);
  }
  const keyfile = arg('--new-passkey');
  if (!keyfile) throw new UsageError('one of --new-passkey <keyfile> or --new-owner <addr> is required');
  const keys = await loadTestKeys(keyfile);
  const owner = passkeySignerAddress(keys.passkey.publicKey);
  const proxy = await recovery.deploySignerProxy({
    client: submitter,
    reader: client,
    owner: keys.passkey.publicKey,
  });
  if (proxy.txHash) {
    await client.waitForTransactionReceipt({ hash: proxy.txHash });
    log('new passkey signer proxy deployed', { address: owner, tx: explorerTxUrl(chainId, proxy.txHash) });
  } else {
    log('new passkey signer proxy', `${owner} (already deployed)`);
  }
  await keys.save({ safe: requireAddressArg('--safe') });
  return owner;
}

async function waitForGrace(client: ChainClient, module: Address, safe: Address): Promise<void> {
  for (;;) {
    const st = await recovery.status(client, module, safe);
    if (!st.pending || !st.executeAfter) throw new Error('no pending recovery to finalize');
    const head = await client.getBlock();
    const remaining = st.executeAfter.getTime() / 1000 - Number(head.timestamp);
    if (remaining <= -2) return;
    log('waiting for the grace period', {
      executeAfter: st.executeAfter.toISOString(),
      remainingSeconds: Math.ceil(remaining),
    });
    await sleep(Math.min(30_000, Math.max(4_000, (remaining + 3) * 1000)));
  }
}

async function finalizeNow(
  client: ChainClient,
  submitter: Submitter,
  module: Address,
  safe: Address,
  chainId: bigint,
): Promise<void> {
  const tx = await recovery.finalize({ client: submitter, module, wallet: safe });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== 'success') throw new Error(`finalizeRecovery reverted: ${tx}`);
  const owners = await safeOwners(client, safe);
  log('finalizeRecovery mined', { tx: explorerTxUrl(chainId, tx) });
  log('getOwners() after recovery', owners.owners);
  log('owner threshold', owners.threshold.toString());
  log('RESULT', 'RECOVERED — your new key owns the wallet. Swissquote was not involved.');
}

async function cmdRecover(): Promise<void> {
  if (!hasFlag('--without-bank')) {
    throw new UsageError(
      'this CLI implements the bank-less path only: add --without-bank (the in-app flow goes through the wallet UI)',
    );
  }
  const { client, rpcUrl, module, safe } = chainContext();
  const keys = clientGuardians();
  const chainId = BigInt(await client.getChainId());
  const safetyKey = privateKeyToAccount(keys.safetyKey);
  const emergencyCard = privateKeyToAccount(keys.emergencyCard);
  log('keyline recover --without-bank', {
    safe: explorerAddressUrl(chainId, safe),
    module,
    gracePeriodSeconds: gracePeriodSeconds(module),
    safetyKey: safetyKey.address,
    emergencyCard: emergencyCard.address,
  });

  // 1. read the guardian set from chain — both client keys must be guardians, together reaching the threshold
  const st = await recovery.status(client, module, safe);
  const isGuardian = (a: Address) => st.guardians.some((g) => g === a);
  log('on-chain guardians', { guardians: st.guardians, threshold: st.guardianThreshold.toString() });
  if (!isGuardian(safetyKey.address))
    throw new Error(`Safety key ${safetyKey.address} is not a guardian of ${safe}`);
  if (!isGuardian(emergencyCard.address))
    throw new Error(`Emergency card ${emergencyCard.address} is not a guardian of ${safe}`);
  if (st.guardianThreshold > 2n)
    throw new Error(`threshold ${st.guardianThreshold} > 2: two client keys are not enough`);

  const { submitter, description } = await pickSubmitter(client, rpcUrl, keys);
  log('submitter', description);

  // 2. a recovery already executed? → finalize path only
  if (st.pending && st.executeAfter) {
    log('a recovery is already pending', describeStatus(st, chainId, module, safe).pendingRecovery);
    const head = await client.getBlock();
    const remaining = st.executeAfter.getTime() / 1000 - Number(head.timestamp);
    if (remaining > 0 && !hasFlag('--finalize')) {
      log(
        'next step',
        `re-run this command after ${st.executeAfter.toLocaleString()} (in ${Math.ceil(remaining)} s), or add --finalize to wait here`,
      );
      return;
    }
    await waitForGrace(client, module, safe);
    await finalizeNow(client, submitter, module, safe, chainId);
    return;
  }

  // 3. new owner (deploy the passkey signer proxy if needed), both client guardians sign the module's EIP-712 request
  const newOwner = await resolveNewOwner(client, submitter, chainId);
  const nonce = await recovery.recoveryNonce(client, module, safe);
  const request = { wallet: safe, newOwners: [newOwner], threshold: 1n, nonce, chainId, module };
  const typedData = recovery.recoveryTypedData(request);
  const hash = recovery.recoveryHash(request);
  if (hash !== (await recovery.recoveryHashOnChain(client, request)))
    throw new Error('recovery hash mismatch');
  const signatures = [
    { signer: safetyKey.address, signature: await safetyKey.signTypedData(typedData) },
    { signer: emergencyCard.address, signature: await emergencyCard.signTypedData(typedData) },
  ];
  log('both client guardians signed ExecuteRecovery', {
    recoveryHash: hash,
    nonce: nonce.toString(),
    newOwner,
  });

  // 4. submit multiConfirmRecovery(execute = true) → grace period starts
  const tx = await recovery.confirmWithSignatures({
    client: submitter,
    module,
    wallet: safe,
    newOwners: [newOwner],
    threshold: 1n,
    signatures,
    execute: true,
  });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== 'success') throw new Error(`multiConfirmRecovery reverted: ${tx}`);
  const after = await recovery.status(client, module, safe);
  if (!after.pending || !after.executeAfter) throw new Error('recovery was confirmed but not executed');
  log('multiConfirmRecovery(execute=true) mined', {
    tx: explorerTxUrl(chainId, tx),
    approvals: after.approvals.toString(),
    executeAfter: after.executeAfter.toISOString(),
    finishesAtLocal: after.executeAfter.toLocaleString(),
    gracePeriodSeconds: gracePeriodSeconds(module),
  });

  // 5. finalize now (--finalize waits here) or tell the user when to come back
  if (!hasFlag('--finalize')) {
    log(
      'next step',
      `after ${after.executeAfter.toLocaleString()} run the same command again (or add --finalize now to wait here). ` +
        'Your old key can still cancel until then — that is the point of the grace period.',
    );
    return;
  }
  await waitForGrace(client, module, safe);
  await finalizeNow(client, submitter, module, safe, chainId);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case 'recover':
      return cmdRecover();
    case 'guardians':
      return cmdGuardians();
    case 'status':
      return cmdStatus();
    default:
      throw new UsageError(usage());
  }
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`\n${error.message}\n\n${usage()}`);
    process.exit(2);
  }
  console.error(error);
  process.exit(1);
});
