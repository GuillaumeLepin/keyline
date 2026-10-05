/**
 * Gate 1 spike — TEST HARNESS ONLY, never shipped to the app.
 *
 * A software P-256 key (Node WebCrypto) stands in for the phone's passkey and produces a WebAuthn-shaped
 * assertion the way the Candide docs describe for testing. The signature bytes are then handed to
 * abstractionkit (`webauthnSignatureFromAssertion` → `createWebAuthnSignature`), never parsed by hand.
 *
 * Flow: pubkey (x, y) → counterfactual Safe → ONE userOp [deploy + enableModule(recovery) + addGuardian ×3,
 * threshold 2] built with a dummy signature → sponsored by Candide → passkey signs the SafeOp EIP-712 hash → sent →
 * receipt → then a sponsored 1 USDC transfer.
 *
 * Usage: pnpm --filter @keyline/scripts spike:create-and-send [--public] [--to 0x...]
 *   --public  use Candide's public endpoint for sponsorship when BANK_CANDIDE_API_KEY is empty (dev only).
 */
import { webcrypto } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildCreateAndProtectUserOp,
  buildTransferUserOp,
  ChainError,
  candideEndpoint,
  createPasskeyAccount,
  explorerAddressUrl,
  explorerTxUrl,
  type PasskeyAccount,
  type PasskeyPublicKey,
  passkeySignerAddress,
  recovery,
  safeOpHash,
  sendUserOp,
  signUserOpWithPasskey,
  sponsor,
  userOpToJson,
  type WebAuthnAssertion,
  waitForReceipt,
} from '@keyline/chain';
import type { UserOperationV7 } from 'abstractionkit';
import { config } from 'dotenv';
import {
  type Address,
  bytesToHex,
  createPublicClient,
  erc20Abi,
  getAddress,
  type Hex,
  hexToBytes,
  http,
  parseUnits,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

config({ path: resolve(import.meta.dirname, '../.env') });

// ---------------------------------------------------------------------------------------------------------------
// Test-only passkey: Node WebCrypto ECDSA P-256. The browser does all of this inside the authenticator.
// ---------------------------------------------------------------------------------------------------------------
interface SoftPasskey {
  readonly publicKey: PasskeyPublicKey;
  sign(challenge: Hex): Promise<WebAuthnAssertion>;
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/** `--keyfile <path>` persists the TEST key as a JWK so the same Safe can be reused across runs (never for real users). */
async function createSoftPasskey(keyfile?: string): Promise<SoftPasskey> {
  const algorithm = { name: 'ECDSA', namedCurve: 'P-256' } as const;
  let keyPair: webcrypto.CryptoKeyPair;
  if (keyfile && existsSync(keyfile)) {
    const stored = JSON.parse(readFileSync(keyfile, 'utf8')) as JsonWebKey;
    const privateKey = await webcrypto.subtle.importKey('jwk', stored, algorithm, true, ['sign']);
    const { d: _d, ...publicJwk } = stored;
    const publicKey = await webcrypto.subtle.importKey(
      'jwk',
      { ...publicJwk, key_ops: ['verify'] },
      algorithm,
      true,
      ['verify'],
    );
    keyPair = { privateKey, publicKey };
  } else {
    keyPair = await webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
    if (keyfile)
      writeFileSync(keyfile, JSON.stringify(await webcrypto.subtle.exportKey('jwk', keyPair.privateKey)), {
        mode: 0o600,
      });
  }
  const jwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  if (!jwk.x || !jwk.y) throw new Error('WebCrypto did not export P-256 coordinates');
  const publicKey: PasskeyPublicKey = {
    x: BigInt(bytesToHex(Buffer.from(jwk.x, 'base64url'))),
    y: BigInt(bytesToHex(Buffer.from(jwk.y, 'base64url'))),
  };
  // Minimal authenticatorData: 32-byte rpIdHash + flags (UP|UV = 0x05) + 4-byte counter, as a real authenticator emits.
  const rpIdHash = new Uint8Array(
    await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('localhost')),
  );
  const authenticatorData = new Uint8Array(37);
  authenticatorData.set(rpIdHash, 0);
  authenticatorData[32] = 0x05;

  return {
    publicKey,
    async sign(challenge: Hex): Promise<WebAuthnAssertion> {
      const clientDataJSON = new TextEncoder().encode(
        JSON.stringify({
          type: 'webauthn.get',
          challenge: base64url(hexToBytes(challenge)),
          origin: 'http://localhost:3000',
          crossOrigin: false,
        }),
      );
      const clientDataHash = new Uint8Array(await webcrypto.subtle.digest('SHA-256', clientDataJSON));
      const signedPayload = new Uint8Array(authenticatorData.length + clientDataHash.length);
      signedPayload.set(authenticatorData, 0);
      signedPayload.set(clientDataHash, authenticatorData.length);
      // Browsers return DER (which abstractionkit parses); Node WebCrypto returns IEEE P1363 r||s (2 × 32 bytes).
      // Splitting the two fixed-width integers is not parsing or cryptography — abstractionkit takes {r, s} as is.
      const raw = new Uint8Array(
        await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, signedPayload),
      );
      const signature = { r: BigInt(bytesToHex(raw.slice(0, 32))), s: BigInt(bytesToHex(raw.slice(32, 64))) };
      return { authenticatorData, clientDataJSON, signature };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`${name} missing in root .env`);
  return value;
}

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function log(title: string, value?: unknown): void {
  console.info(
    value === undefined
      ? `\n== ${title}`
      : `${title}: ${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`,
  );
}

async function signSponsorSend(
  label: string,
  pk: PasskeyAccount,
  passkey: SoftPasskey,
  userOp: UserOperationV7,
  endpoints: { chainId: bigint; bundlerUrl: string; paymasterUrl: string | undefined },
): Promise<Hex> {
  log(`${label}: built userOp (dummy signature)`);
  log('userOp', userOpToJson(userOp));

  if (!endpoints.paymasterUrl) {
    throw new ChainError(
      'MISSING_PAYMASTER',
      'BANK_CANDIDE_API_KEY missing — cannot sponsor. Paste the key from https://dashboard.candide.dev into root .env ' +
        '(BANK_CANDIDE_BUNDLER_URL/PAYMASTER_URL = https://api.candide.dev/api/v3/84532/<KEY>), or re-run with --public.',
    );
  }
  const sponsored = await sponsor(pk, userOp, {
    paymasterUrl: endpoints.paymasterUrl,
    bundlerUrl: endpoints.bundlerUrl,
  });
  log(`${label}: sponsored`, {
    paymaster: sponsored.userOp.paymaster,
    sponsor: sponsored.sponsorMetadata?.name ?? null,
  });

  const challenge = safeOpHash(sponsored.userOp, endpoints.chainId);
  log(`${label}: SafeOp EIP-712 hash (WebAuthn challenge)`, challenge);
  const assertion = await passkey.sign(challenge);
  const signed = signUserOpWithPasskey(sponsored.userOp, assertion, pk.owner);

  const response = await sendUserOp(pk, signed, endpoints.bundlerUrl);
  log(`${label}: sent`, { userOpHash: response.userOperationHash });
  const receipt = await waitForReceipt(response);
  const txHash = receipt.receipt.transactionHash as Hex;
  log(`${label}: included`, {
    tx: explorerTxUrl(endpoints.chainId, txHash),
    actualGasUsed: receipt.actualGasUsed.toString(),
    actualGasCostWei: receipt.actualGasCost.toString(),
  });
  return txHash;
}

async function main(): Promise<void> {
  const chainId = BigInt(requireEnv('CHAIN_ID'));
  const rpcUrl = requireEnv('RPC_URL');
  const usdc = getAddress(requireEnv('USDC_ADDRESS'));
  const recoveryModule = getAddress(requireEnv('RECOVERY_MODULE_ADDRESS'));
  const sqGuardian = getAddress(requireEnv('SQ_GUARDIAN_ADDRESS'));
  const apiKey = env('BANK_CANDIDE_API_KEY');
  const usePublic = process.argv.includes('--public');

  const bundlerUrl = env('BANK_CANDIDE_BUNDLER_URL') ?? candideEndpoint(chainId, apiKey);
  const paymasterUrl =
    env('BANK_CANDIDE_PAYMASTER_URL') ?? (apiKey || usePublic ? candideEndpoint(chainId, apiKey) : undefined);
  const endpoints = { chainId, rpcUrl, bundlerUrl, paymasterUrl };
  log('endpoints', {
    chainId: chainId.toString(),
    rpcUrl,
    bundlerUrl: bundlerUrl.replace(apiKey ?? '§', '<key>'),
    sponsorship: paymasterUrl ? 'yes' : 'NO KEY',
  });

  // 1. passkey (software, test only) → counterfactual Safe
  const passkey = await createSoftPasskey(arg('--keyfile'));
  const pk = createPasskeyAccount({ pubKeyX: passkey.publicKey.x, pubKeyY: passkey.publicKey.y });
  log('passkey public key', { x: passkey.publicKey.x.toString(16), y: passkey.publicKey.y.toString(16) });
  log('counterfactual Safe', explorerAddressUrl(chainId, pk.address));
  log('signer proxy (owner after first userOp)', passkeySignerAddress(pk.owner));

  // 2. guardians: two throwaway EOAs stand in for the Safety key and the Emergency card + Swissquote
  const safetyKey = privateKeyToAccount(generatePrivateKey());
  const emergencyCard = privateKeyToAccount(generatePrivateKey());
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
        sponsored: Boolean(paymasterUrl),
      },
    );
    await signSponsorSend('create+protect', pk, passkey, createOp, endpoints);
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
      `Safe holds ${balance} USDC units (<1 USDC). Send test USDC to ${pk.address} and re-run the transfer step.`,
    );
    return;
  }
  const transferOp = await buildTransferUserOp(
    pk,
    { token: usdc, to, amount: parseUnits('1', 6) },
    endpoints,
    {
      sponsored: Boolean(paymasterUrl),
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
