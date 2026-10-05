import { type Address, createPublicClient, type Hex, hashTypedData, http, slice } from 'viem';
import { baseSepolia } from 'viem/chains';
import { describe, expect, it } from 'vitest';
import {
  ATTESTATION_DOMAIN_NAME,
  attestationChallenge,
  attestationDigest,
  attestationTypedData,
  safeMessageHash,
  verify,
} from './attestation.js';

const RPC_URL = process.env.RPC_URL ?? 'https://sepolia.base.org';

/**
 * Live fixture from `pnpm --filter @keyline/scripts spike:attestation --keyfile ../data/test-keyfile.json` (5 Oct 2026):
 * Safe 0x2eac…0dea on Base Sepolia, owner = signer proxy 0xed28…bE2b of the test passkey. The signature is a Safe v=0
 * contract signature wrapping the WebAuthn assertion; it stays valid as long as that Safe keeps that owner.
 */
const SAFE: Address = '0x2eac8081f2c00f526369AabB7492abE2ec280dea';
const OWNER_PROXY = '0xed28ebf172551f6ca1392a5e6a71f505096bbe2b';
const fields = {
  clientId: 'SQ-48213-LK',
  wallet: SAFE,
  chainId: 84532n,
  nonce: '0x21423a660d131007cafdb72409bd90c4be42b92f5e0c933cb433d909db0fc8ee' as Hex,
};
const SIGNATURE: Hex =
  '0x000000000000000000000000ed28ebf172551f6ca1392a5e6a71f505096bbe2b0000000000000000000000000000000000000000000000000000000000000041000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000e06f6e181032644ae132419c877a78b9a7087fcc402b8d22302a50b866390dfc5d848380a13c082ad941bbd872ae75e415fff2cb2c2a0b421b17b224f3f964d789000000000000000000000000000000000000000000000000000000000000002549960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d976305000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000034226f726967696e223a22687474703a2f2f6c6f63616c686f73743a33303030222c2263726f73734f726967696e223a66616c7365000000000000000000000000';

describe('attestation typed data', () => {
  it('uses the Keyline domain with the Safe as verifyingContract', () => {
    const td = attestationTypedData(fields);
    expect(td.domain).toEqual({
      name: ATTESTATION_DOMAIN_NAME,
      version: '1',
      chainId: 84532,
      verifyingContract: SAFE,
    });
    expect(td.primaryType).toBe('Attestation');
    expect(attestationDigest(fields)).toBe(hashTypedData(td));
    expect(attestationDigest(fields)).toBe(
      '0xea676567186a6550784c608a1a2782124f599b4ebb69b07e9efa9b8472866d30',
    );
  });

  it('rejects a nonce that is not bytes32', () => {
    expect(() => attestationTypedData({ ...fields, nonce: '0x01' })).toThrow();
  });

  it('challenge = Safe SafeMessage hash over the digest (what the passkey signs)', () => {
    const challenge = attestationChallenge(fields);
    expect(challenge).toBe(safeMessageHash(SAFE, 84532n, attestationDigest(fields)));
    expect(challenge).toBe('0xabaaf4e2bc98347c4962aeb2cf63ef4d93d5f417edbec5e85a732c5c73248efb');
    expect(challenge).not.toBe(attestationDigest(fields));
    expect(attestationChallenge({ ...fields, nonce: `0x${'11'.repeat(32)}` })).not.toBe(challenge);
  });

  it('fixture signature is a Safe v=0 contract signature pointing at the owner proxy', () => {
    expect(slice(SIGNATURE, 12, 32)).toBe(OWNER_PROXY);
    expect(slice(SIGNATURE, 64, 65)).toBe('0x00');
  });
});

describe('attestation.verify (live ERC-1271 on Base Sepolia)', () => {
  const client = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

  it('accepts the owner passkey signature for the deployed Safe', async () => {
    const result = await verify({ client, wallet: SAFE, fields, signature: SIGNATURE });
    expect(result).toMatchObject({ ok: true, method: 'erc1271' });
  }, 30_000);

  it('rejects a tampered nonce', async () => {
    const result = await verify({
      client,
      wallet: SAFE,
      fields: { ...fields, nonce: `0x${'22'.repeat(32)}` },
      signature: SIGNATURE,
    });
    expect(result.ok).toBe(false);
  }, 30_000);

  it('rejects the signature for another Safe (wrong signer for that wallet)', async () => {
    const other: Address = '0x39ECE2fA9262408426E78c71A9dED95ddD42967D';
    const result = await verify({
      client,
      wallet: other,
      fields: { ...fields, wallet: other },
      signature: SIGNATURE,
    });
    expect(result.ok).toBe(false);
  }, 30_000);

  it('refuses typed data whose verifyingContract is not the wallet', async () => {
    const result = await verify({
      client,
      wallet: SAFE,
      typedData: attestationTypedData({ ...fields, wallet: '0x39ECE2fA9262408426E78c71A9dED95ddD42967D' }),
      signature: SIGNATURE,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/verifyingContract/);
  });
});
