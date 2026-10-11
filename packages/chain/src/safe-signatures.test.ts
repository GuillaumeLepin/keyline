import { type Address, getAddress, type Hex, hashMessage, hashTypedData, slice, toHex } from 'viem';
import { describe, expect, it } from 'vitest';
import { passkeySignerAddress } from './account.js';
import {
  attestationChallenge,
  attestationSignatureFromPasskey,
  attestationTypedData,
} from './attestation.js';
import {
  type CodeReader,
  contractSignatureFromPasskey,
  detectSignatureScheme,
  PERMIT_BYTES_SELECTOR,
  PERMIT_VRS_SELECTOR,
  PERMIT2_ADDRESS,
  probeSignatureScheme,
  safeMessageHash,
  safeMessageHashForMessage,
  safeMessageHashForTypedData,
  USDC_BASE_SEPOLIA,
} from './safe-signatures.js';

const SAFE: Address = '0x2eac8081f2c00f526369AabB7492abE2ec280dea';
const OWNER_PROXY = '0xed28ebf172551f6ca1392a5e6a71f505096bbe2b';
const CHAIN_ID = 84532n;

/** Arbitrary public key: only the proxy-address derivation and the byte layout are exercised here. */
const OWNER = {
  x: 0x7f0de8bb47dfdc9db91e6b72a1d9e5b4e8b1f0b5a4b8c0e7c39c0b5a6b5f3d2an,
  y: 0x1n,
};

const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

function permitFor(token: Address) {
  return {
    domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: token },
    types: PERMIT_TYPES,
    primaryType: 'Permit',
    message: { owner: SAFE, spender: SAFE, value: 1n, nonce: 0n, deadline: 1n },
  } as const;
}

describe('Safe message hashes', () => {
  it('personal_sign: SafeMessage over EIP-191 hashMessage; string and {raw} agree', () => {
    const viaString = safeMessageHashForMessage({ safe: SAFE, chainId: CHAIN_ID, message: 'Hello Keyline' });
    const viaRaw = safeMessageHashForMessage({
      safe: SAFE,
      chainId: CHAIN_ID,
      message: { raw: toHex('Hello Keyline') },
    });
    expect(viaRaw).toBe(viaString);
    expect(viaString).toBe(safeMessageHash(SAFE, CHAIN_ID, hashMessage('Hello Keyline')));
    // Live value from scripts/spike-erc1271.ts (11 Oct 2026) — the challenge whose signature the Safe accepted.
    expect(viaString).toBe('0x2b00d14c18f8fa7e30a33178b6d0f4190edf37bda485c612cf1635124d9b314d');
  });

  it('typed data: SafeMessage over hashTypedData — identical to the attestation challenge', () => {
    const td = attestationTypedData({
      clientId: 'SQ-48213-LK',
      wallet: SAFE,
      chainId: CHAIN_ID,
      nonce: `0x${'11'.repeat(32)}`,
    });
    const challenge = safeMessageHashForTypedData({ safe: SAFE, chainId: CHAIN_ID, typedData: td });
    expect(challenge).toBe(attestationChallenge(td));
    expect(challenge).toBe(safeMessageHash(SAFE, CHAIN_ID, hashTypedData(td)));
  });

  it('depends on the Safe and the chain (no cross-Safe / cross-chain replay)', () => {
    const base = safeMessageHashForMessage({ safe: SAFE, chainId: CHAIN_ID, message: 'x' });
    expect(
      safeMessageHashForMessage({ safe: OWNER_PROXY as Address, chainId: CHAIN_ID, message: 'x' }),
    ).not.toBe(base);
    expect(safeMessageHashForMessage({ safe: SAFE, chainId: 1n, message: 'x' })).not.toBe(base);
  });
});

describe('contractSignatureFromPasskey', () => {
  const assertion = {
    authenticatorData: new Uint8Array(37).fill(7),
    clientDataJSON: new TextEncoder().encode(
      '{"type":"webauthn.get","challenge":"AAAA","origin":"http://localhost:3000","crossOrigin":false}',
    ),
    signature: { r: 123n, s: 456n },
  };

  it('is the bare Safe v=0 contract signature pointing at the passkey proxy (same bytes as the attestation)', () => {
    const sig = contractSignatureFromPasskey(assertion, OWNER);
    expect(sig).toBe(attestationSignatureFromPasskey(assertion, OWNER));
    expect(BigInt(slice(sig, 32, 64))).toBe(0x41n); // s = offset of the dynamic part
    expect(slice(sig, 64, 65)).toBe('0x00'); // v = 0 → contract signature
    expect(getAddress(slice(sig, 12, 32))).toBe(passkeySignerAddress(OWNER)); // r = the passkey's signer proxy
  });
});

describe('detectSignatureScheme', () => {
  it('Permit2 (canonical address) → erc1271-ok', () => {
    const scheme = detectSignatureScheme({
      domain: { name: 'Permit2', chainId: 84532, verifyingContract: PERMIT2_ADDRESS },
      types: { PermitSingle: [] },
      primaryType: 'PermitSingle',
    });
    expect(scheme).toMatchObject({ kind: 'erc1271-ok', family: 'permit2' });
  });

  it('USDC (FiatTokenV2_2) EIP-2612 permit on Base Sepolia → erc1271-ok', () => {
    expect(detectSignatureScheme(permitFor(USDC_BASE_SEPOLIA))).toMatchObject({
      kind: 'erc1271-ok',
      family: 'eip2612-permit',
    });
  });

  it('same USDC address but another chain → unknown (not verified there)', () => {
    const td = permitFor(USDC_BASE_SEPOLIA);
    expect(detectSignatureScheme({ ...td, domain: { ...td.domain, chainId: 1 } }).kind).toBe('unknown');
  });

  it('USDC transferWithAuthorization (EIP-3009) → erc1271-ok', () => {
    expect(
      detectSignatureScheme({
        domain: { chainId: 84532, verifyingContract: USDC_BASE_SEPOLIA },
        primaryType: 'TransferWithAuthorization',
      }),
    ).toMatchObject({ kind: 'erc1271-ok', family: 'eip3009-authorization' });
  });

  it('DAI-style permit → eoa-only', () => {
    expect(
      detectSignatureScheme({
        domain: { chainId: 1, verifyingContract: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
        types: {
          Permit: [
            { name: 'holder', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'expiry', type: 'uint256' },
            { name: 'allowed', type: 'bool' },
          ],
        },
        primaryType: 'Permit',
      }),
    ).toMatchObject({ kind: 'eoa-only', family: 'dai-permit' });
  });

  it('unknown token permit and generic typed data → unknown', () => {
    expect(detectSignatureScheme(permitFor('0x0000000000000000000000000000000000001234')).kind).toBe(
      'unknown',
    );
    expect(detectSignatureScheme({ primaryType: 'Mail', domain: { chainId: 84532 } })).toMatchObject({
      kind: 'unknown',
      family: 'other',
    });
  });
});

describe('probeSignatureScheme (bytecode probe, stubbed)', () => {
  const TOKEN: Address = '0x0000000000000000000000000000000000001234';
  const IMPL: Address = '0x00000000000000000000000000000000000abcde';
  function reader(codes: Record<string, Hex>, implSlotValue?: Hex): CodeReader {
    return {
      getCode: async ({ address }) => codes[address.toLowerCase()],
      getStorageAt: async ({ slot }) =>
        slot.startsWith('0x7050') && implSlotValue ? implSlotValue : `0x${'0'.repeat(64)}`,
    };
  }
  const dispatch = (selector: Hex): Hex => `0x6000${'63'}${selector.slice(2)}14`;

  it('token with permit(…, bytes) behind a proxy → erc1271-ok', async () => {
    const client = reader(
      { [TOKEN.toLowerCase()]: '0x6080', [IMPL.toLowerCase()]: dispatch(PERMIT_BYTES_SELECTOR) },
      `0x${IMPL.slice(2).padStart(64, '0')}`,
    );
    expect((await probeSignatureScheme(client, permitFor(TOKEN))).kind).toBe('erc1271-ok');
  });

  it('token with only permit(v, r, s) → eoa-only', async () => {
    const client = reader({ [TOKEN.toLowerCase()]: dispatch(PERMIT_VRS_SELECTOR) });
    expect(await probeSignatureScheme(client, permitFor(TOKEN))).toMatchObject({
      kind: 'eoa-only',
      family: 'eip2612-permit',
    });
  });

  it('does not touch the chain for already-classified payloads', async () => {
    const client: CodeReader = {
      getCode: () => Promise.reject(new Error('no RPC expected')),
      getStorageAt: () => Promise.reject(new Error('no RPC expected')),
    };
    expect((await probeSignatureScheme(client, permitFor(USDC_BASE_SEPOLIA))).kind).toBe('erc1271-ok');
  });
});
