/**
 * Attestation spike — TEST HARNESS ONLY. Proves the EIP-712 ownership attestation signed by the passkey THROUGH the
 * Safe verifies on-chain via ERC-1271 (viem `verifyTypedData` → `Safe.isValidSignature`), and that a wrong signer or a
 * tampered nonce is rejected.
 *
 * Usage: pnpm --filter @keyline/scripts spike:attestation --keyfile ../data/test-keyfile.json
 * (the keyfile's Safe must already be deployed: run spike:create-and-send with the same --keyfile first)
 */
import {
  attestation,
  attestationChallenge,
  attestationDigest,
  attestationSignatureFromPasskey,
  attestationTypedData,
  createPasskeyAccount,
  explorerAddressUrl,
  passkeySignerAddress,
} from '@keyline/chain';
import { createPublicClient, type Hex, http, toHex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { arg, log, spikeEndpoints } from './src/cli.js';
import { createEphemeralPasskey, loadTestKeys } from './src/test-passkey.js';

const ERC1271_ABI = [
  {
    type: 'function',
    name: 'isValidSignature',
    stateMutability: 'view',
    inputs: [
      { name: '_dataHash', type: 'bytes32' },
      { name: '_signature', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes4' }],
  },
] as const;

function randomNonce(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

async function main(): Promise<void> {
  const { chainId, rpcUrl } = spikeEndpoints();
  const keyfile = arg('--keyfile');
  if (!keyfile) throw new Error('--keyfile <path> is required (the Safe deployed by spike:create-and-send)');
  const keys = await loadTestKeys(keyfile);
  const pk = createPasskeyAccount({ pubKeyX: keys.passkey.publicKey.x, pubKeyY: keys.passkey.publicKey.y });
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  log('Safe', explorerAddressUrl(chainId, pk.address));
  log('owner (signer proxy)', passkeySignerAddress(pk.owner));
  if ((await client.getCode({ address: pk.address })) === undefined) {
    throw new Error(
      `Safe ${pk.address} is not deployed — run spike:create-and-send --keyfile ${keyfile} first`,
    );
  }

  // 1. Attestation typed data (bank issues the nonce; demo persona clientId)
  const fields = { clientId: 'SQ-48213-LK', wallet: pk.address, chainId, nonce: randomNonce() };
  const typedData = attestationTypedData(fields);
  const digest = attestationDigest(typedData);
  const challenge = attestationChallenge(typedData);
  log('attestation', {
    typedData: {
      ...typedData,
      message: { ...typedData.message, chainId: typedData.message.chainId.toString() },
    },
  });
  log('EIP-712 digest (dataHash)', digest);
  log('WebAuthn challenge (SafeMessage hash)', challenge);

  // 2. Passkey signs the challenge; abstractionkit formats the Safe contract signature
  const assertion = await keys.passkey.sign(challenge);
  const signature = attestationSignatureFromPasskey(assertion, pk.owner);
  log('Safe signature', signature);

  // 3. Verify (bank side): viem verifyTypedData → ERC-1271
  const good = await attestation.verify({ client, wallet: pk.address, typedData, signature });
  log('verify (correct signer, correct nonce)', good);

  // Cross-check with the raw ERC-1271 call: magic value 0x1626ba7e expected
  const magic = await client.readContract({
    address: pk.address,
    abi: ERC1271_ABI,
    functionName: 'isValidSignature',
    args: [digest, signature],
  });
  log('Safe.isValidSignature(digest, sig) magic value', magic);

  // 4a. Wrong signer: another passkey signs the same challenge (its proxy is not an owner of this Safe)
  const stranger = await createEphemeralPasskey();
  const strangerAssertion = await stranger.passkey.sign(challenge);
  const strangerSignature = attestationSignatureFromPasskey(strangerAssertion, stranger.passkey.publicKey);
  const wrongSigner = await attestation.verify({
    client,
    wallet: pk.address,
    typedData,
    signature: strangerSignature,
  });
  log('verify (wrong signer)', wrongSigner);

  // 4b. Tampered nonce: same signature, different typed data
  const tampered = attestationTypedData({ ...fields, nonce: randomNonce() });
  const wrongNonce = await attestation.verify({ client, wallet: pk.address, typedData: tampered, signature });
  log('verify (tampered nonce)', wrongNonce);

  const pass = good.ok && !wrongSigner.ok && !wrongNonce.ok && magic === '0x1626ba7e';
  log('RESULT', pass ? 'PASS' : 'FAIL');
  if (!pass) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
