// Travel-Rule ownership proof (SPEC F1.6 / F6): challenge → passkey signs through the Safe → ERC-1271 verify.
import { randomBytes } from 'node:crypto';
import { attestationTypedData } from '@keyline/chain';
import {
  AttestationBodySchema,
  AttestationChallengeResponseSchema,
  AttestationResponseSchema,
  AttestationSchema,
} from '@keyline/shared';
import type { FastifyInstance } from 'fastify';
import { bytesToHex, getAddress, type Hex } from 'viem';
import { z } from 'zod';
import { clientOf } from '../auth';
import type { BankConfig } from '../config';
import { type Db, nowIso } from '../db';
import type { ChainDeps } from '../deps';
import { conflict, forbidden, notFound, policyRefused } from '../errors';
import type { EventStore } from '../events';
import type { Repo } from '../repo';
import { syncWalletStatus } from '../wallet-sync';

type Deps = { config: BankConfig; db: Db; events: EventStore; repo: Repo; chain: ChainDeps };
const WalletParam = z.object({ wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });
const NONCE_TTL_MS = 10 * 60 * 1000;

type NonceRow = {
  nonce: string;
  wallet_address: string;
  client_id: string;
  expires_at: string;
  used_at: string | null;
};
type AttRow = {
  wallet_address: string;
  client_id: string;
  nonce: string;
  chain_id: number;
  signature: string;
  verified_at: string;
  method: string;
};

const rowToAttestation = (r: AttRow) =>
  AttestationSchema.parse({
    walletAddress: r.wallet_address,
    clientId: r.client_id,
    nonce: r.nonce,
    chainId: r.chain_id,
    signature: r.signature,
    verifiedAt: r.verified_at,
    method: r.method,
  });

export const registerAttestationRoutes = (
  app: FastifyInstance,
  { config, db, events, repo, chain }: Deps,
): void => {
  const insertNonce = db.prepare(
    'INSERT INTO attestation_nonces (nonce, wallet_address, client_id, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)',
  );
  const findNonce = db.prepare('SELECT * FROM attestation_nonces WHERE nonce = ?');
  const useNonce = db.prepare(
    'UPDATE attestation_nonces SET used_at = ? WHERE nonce = ? AND used_at IS NULL',
  );
  const upsertAttestation = db.prepare(
    `INSERT INTO attestations (wallet_address, client_id, nonce, chain_id, signature, verified_at, method) VALUES (?, ?, ?, ?, ?, ?, 'erc1271')
     ON CONFLICT(wallet_address) DO UPDATE SET nonce = excluded.nonce, signature = excluded.signature, verified_at = excluded.verified_at`,
  );
  const findAttestation = db.prepare('SELECT * FROM attestations WHERE lower(wallet_address) = lower(?)');

  app.get('/attestations/:wallet/challenge', { config: { client: true } }, async (req) => {
    const { wallet: address } = WalletParam.parse(req.params);
    const client = clientOf(req);
    const wallet = repo.walletByAddress(address);
    if (!wallet) throw notFound('Wallet');
    if (wallet.clientId !== client.clientId) throw forbidden('This wallet belongs to another client');
    if ((await syncWalletStatus({ db, repo, events, chain }, wallet)).status !== 'deployed')
      throw conflict('Protect your wallet first — the proof is signed by the deployed wallet');
    // 32 random bytes from Node's CSPRNG (a nonce, not key material); the typed data wants bytes32.
    const nonce = bytesToHex(randomBytes(32));
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();
    insertNonce.run(nonce, getAddress(wallet.address), client.clientId, nowIso(), expiresAt);
    const typed = attestationTypedData({
      clientId: client.clientId,
      wallet: getAddress(wallet.address),
      chainId: config.CHAIN_ID,
      nonce,
    });
    // JSON-safe copy: message.chainId is a bigint in the chain package.
    const typedData = { ...typed, message: { ...typed.message, chainId: Number(typed.message.chainId) } };
    return AttestationChallengeResponseSchema.parse({ nonce, typedData, expiresAt });
  });

  app.post('/attestations', { config: { client: true, idempotent: true } }, async (req, reply) => {
    const body = AttestationBodySchema.parse(req.body);
    const client = clientOf(req);
    const wallet = repo.walletByAddress(body.wallet);
    if (!wallet) throw notFound('Wallet');
    if (wallet.clientId !== client.clientId) throw forbidden('This wallet belongs to another client');
    if (body.clientId !== client.clientId) throw forbidden('clientId does not match the signed-in client');
    if ((await syncWalletStatus({ db, repo, events, chain }, wallet)).status !== 'deployed')
      throw policyRefused('The wallet must be protected (deployed) before it can prove ownership');

    const nonceRow = findNonce.get(body.nonce) as NonceRow | undefined;
    if (
      !nonceRow ||
      nonceRow.wallet_address.toLowerCase() !== wallet.address.toLowerCase() ||
      nonceRow.client_id !== client.clientId
    )
      throw notFound('Challenge nonce');
    if (nonceRow.used_at) throw conflict('This challenge was already used — request a new one');
    if (nonceRow.expires_at <= nowIso()) throw conflict('This challenge expired — request a new one');

    if (!/^0x[0-9a-fA-F]{64}$/.test(body.nonce)) throw notFound('Challenge nonce');
    const fields = {
      clientId: client.clientId,
      wallet: getAddress(wallet.address),
      chainId: config.CHAIN_ID,
      nonce: body.nonce as Hex,
    };
    const result = await chain.verifyAttestation({
      client: chain.publicClient,
      wallet: getAddress(wallet.address),
      fields,
      signature: body.signature as Hex,
    });
    if (!result.ok) {
      events.recordEvent('attestation.rejected', wallet.address, {
        reason: result.reason,
        nonce: body.nonce,
      });
      throw forbidden(
        `The wallet did not accept this signature${result.reason ? ` (${result.reason})` : ''}`,
      );
    }
    const verifiedAt = nowIso();
    db.transaction(() => {
      if (useNonce.run(verifiedAt, body.nonce).changes !== 1)
        throw conflict('This challenge was already used');
      upsertAttestation.run(
        getAddress(wallet.address),
        client.clientId,
        body.nonce,
        config.CHAIN_ID,
        body.signature,
        verifiedAt,
      );
    })();
    events.recordEvent('attestation.verified', wallet.address, {
      clientId: client.clientId,
      method: result.method,
      nonce: body.nonce,
    });
    const attestation = rowToAttestation(findAttestation.get(wallet.address) as AttRow);
    return reply
      .status(201)
      .send(AttestationResponseSchema.parse({ verified: true, method: 'erc1271', attestation }));
  });

  app.get('/attestations/:wallet', async (req) => {
    const { wallet } = WalletParam.parse(req.params);
    const row = findAttestation.get(wallet) as AttRow | undefined;
    if (!row) throw notFound('Attestation');
    return rowToAttestation(row);
  });
};
