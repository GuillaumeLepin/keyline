/**
 * Gate 1 spike — TEST HARNESS ONLY, never shipped to the app (see src/test-passkey.ts).
 *
 * Flow: pubkey (x, y) → counterfactual Safe → ONE userOp [deploy + enableModule(recovery) + addGuardian ×3,
 * threshold 2] built with a dummy signature → sponsored by Candide → passkey signs the SafeOp EIP-712 hash → sent →
 * receipt → then a sponsored 1 USDC transfer (skipped, with the Circle faucet URL, when the Safe holds no USDC).
 *
 * Usage: pnpm --filter @keyline/scripts spike:create-and-send [--public] [--keyfile path] [--to 0x...]
 *   --public   use Candide's public endpoint for sponsorship when BANK_CANDIDE_API_KEY is empty (dev only).
 *   --keyfile  persist the TEST passkey + the two stand-in guardian keys so later spikes reuse the same Safe.
 */
import {
  buildCreateAndProtectUserOp,
  buildTransferUserOp,
  ChainError,
  createPasskeyAccount,
  explorerAddressUrl,
  passkeySignerAddress,
  recovery,
} from '@keyline/chain';
import { type Address, createPublicClient, erc20Abi, getAddress, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { arg, env, log, requireEnv, spikeEndpoints } from './src/cli.js';
import { loadTestKeys } from './src/test-passkey.js';
import { signSponsorSend } from './src/userop.js';

async function main(): Promise<void> {
  const endpoints = spikeEndpoints();
  const { chainId, rpcUrl } = endpoints;
  const usdc = getAddress(requireEnv('USDC_ADDRESS'));
  const recoveryModule = getAddress(requireEnv('RECOVERY_MODULE_ADDRESS'));
  const sqGuardian = getAddress(requireEnv('SQ_GUARDIAN_ADDRESS'));
  log('endpoints', {
    chainId: chainId.toString(),
    rpcUrl,
    bundlerUrl: endpoints.bundlerUrl.replace(env('BANK_CANDIDE_API_KEY') ?? '§', '<key>'),
    sponsorship: endpoints.paymasterUrl ? 'yes' : 'NO KEY',
  });

  // 1. passkey (software, test only) → counterfactual Safe
  const keys = await loadTestKeys(arg('--keyfile'));
  const passkey = keys.passkey;
  const pk = createPasskeyAccount({ pubKeyX: passkey.publicKey.x, pubKeyY: passkey.publicKey.y });
  log('passkey public key', { x: passkey.publicKey.x.toString(16), y: passkey.publicKey.y.toString(16) });
  log('counterfactual Safe', explorerAddressUrl(chainId, pk.address));
  log('signer proxy (owner after first userOp)', passkeySignerAddress(pk.owner));

  // 2. guardians: two EOAs stand in for the Safety key and the Emergency card (persisted in the keyfile) + Swissquote
  const safetyKey = privateKeyToAccount(keys.guardians.safetyKey);
  const emergencyCard = privateKeyToAccount(keys.guardians.emergencyCard);
  const guardians: Address[] = [safetyKey.address, emergencyCard.address, sqGuardian];
  log('guardians (threshold 2)', {
    safetyKey: safetyKey.address,
    emergencyCard: emergencyCard.address,
    swissquote: sqGuardian,
  });

  // Sanity: the local EIP-712 recovery hash must equal the module's getRecoveryHash for this wallet.
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const probe = {
    wallet: pk.address,
    newOwners: [passkeySignerAddress(pk.owner)],
    threshold: 1n,
    nonce: 0n,
    chainId,
    module: recoveryModule,
  };
  const [local, onChain] = [recovery.recoveryHash(probe), await recovery.recoveryHashOnChain(client, probe)];
  log('recovery hash local == on-chain', { local, onChain, equal: local === onChain });
  if (local !== onChain) throw new Error('recovery typed data mismatch — do not proceed');

  // 3. build → sponsor → sign → send: deploy + protect (skipped when a --keyfile Safe is already deployed)
  const deployed = (await client.getCode({ address: pk.address })) !== undefined;
  if (deployed) {
    log('Safe already deployed — skipping create+protect', pk.address);
  } else {
    const createOp = await buildCreateAndProtectUserOp(
      pk,
      { guardians, threshold: 2, recoveryModule },
      endpoints,
      {
        sponsored: Boolean(endpoints.paymasterUrl),
      },
    );
    await signSponsorSend('create+protect', pk, passkey, createOp, endpoints, { verbose: true });
  }

  const st = await recovery.status(client, recoveryModule, pk.address);
  log('on-chain guardian set', { guardians: st.guardians, threshold: st.guardianThreshold.toString() });

  // 4. sponsored 1 USDC transfer (needs USDC on the Safe: fund it from the faucet or the bank funder first)
  const to = getAddress(arg('--to') ?? requireEnv('BANK_FUNDER_ADDRESS'));
  const balance = await client.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [pk.address],
  });
  if (balance < parseUnits('1', 6)) {
    log(
      'USDC transfer skipped',
      `Safe ${pk.address} holds ${balance} USDC units (<1 USDC). Get test USDC at https://faucet.circle.com (Base Sepolia) ` +
        `and send ≥1 USDC to ${pk.address}, then re-run with the same --keyfile.`,
    );
    return;
  }
  const transferOp = await buildTransferUserOp(
    pk,
    { token: usdc, to, amount: parseUnits('1', 6) },
    endpoints,
    {
      sponsored: Boolean(endpoints.paymasterUrl),
    },
  );
  await signSponsorSend('transfer 1 USDC', pk, passkey, transferOp, endpoints);
}

main().catch((error: unknown) => {
  if (error instanceof ChainError && error.code === 'MISSING_PAYMASTER') {
    console.error(`\nBLOCKED: ${error.message}`);
    process.exit(2);
  }
  console.error(error);
  process.exit(1);
});
