// Wallet registry (SPEC F1.1–F1.4): counterfactual address from the passkey, guardians, recovery mode,
// and the bank-mediated Safety-key pairing (6-digit code, SIMULATED).
import { randomInt } from 'node:crypto';
import { createPasskeyAccount } from '@keyline/chain';
import {
  AddGuardianBodySchema,
  ClaimPairingBodySchema,
  CreatePairingBodySchema,
  CreateWalletBodySchema,
  CreateWalletResponseSchema,
  GuardianSchema,
  GuardiansResponseSchema,
  type Pairing,
  PairingSchema,
  SetModeBodySchema,
  WalletDetailSchema,
  WalletSchema,
} from '@keyline/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getAddress, isAddressEqual } from 'viem';
import { z } from 'zod';
import { type ClientIdentity, clientOf } from '../auth';
import type { BankConfig } from '../config';
import { type Db, nowIso } from '../db';
import type { ChainDeps } from '../deps';
import { conflict, forbidden, notFound, policyRefused, validationError } from '../errors';
import type { EventStore } from '../events';
import { createGuardianRegistrar } from '../guardians';
import type { Repo } from '../repo';
import { GUARDIAN_ORDER, GUARDIAN_THRESHOLD, type Store } from '../store';
import { rowToPasskey } from '../webauthn';

type Deps = { config: BankConfig; db: Db; events: EventStore; repo: Repo; store: Store; chain: ChainDeps };

const AddressParam = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });
const CodeParam = z.object({ code: z.string().regex(/^\d{6}$/) });
const PAIRING_TTL_MS = 10 * 60 * 1000;

type PairingRow = {
  code: string;
  wallet_address: string;
  client_id: string;
  status: string;
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
};

export const registerWalletRoutes = (
  app: FastifyInstance,
  { config, db, events, repo, store, chain }: Deps,
): void => {
  const findPasskey = db.prepare('SELECT * FROM passkeys WHERE credential_id = ?');
  const bindPasskey = db.prepare('UPDATE passkeys SET wallet_address = ? WHERE credential_id = ?');
  const insertWallet = db.prepare(
    `INSERT INTO wallets (address, client_id, chain_id, owner_credential_id, status, recovery_mode, deploy_tx_hash, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, NULL, ?)`,
  );
  const insertDemoPasskey = db.prepare(
    `INSERT INTO passkeys (credential_id, client_id, wallet_address, role, public_key, pub_key_x, pub_key_y, counter, transports, device_label, created_at)
     VALUES (?, ?, NULL, 'owner', ?, ?, ?, 0, '[]', ?, ?)`,
  );
  const bindHandoff = db.prepare(
    "UPDATE handoffs SET wallet_address = ? WHERE code = ? AND client_id = ? AND status = 'claimed'",
  );
  const openPairing = db.prepare(
    "SELECT * FROM pairings WHERE lower(wallet_address) = lower(?) AND status = 'open' AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
  );
  const pairingByCode = db.prepare('SELECT * FROM pairings WHERE code = ?');
  const insertPairing = db.prepare(
    "INSERT INTO pairings (code, wallet_address, client_id, status, created_at, expires_at, claimed_at) VALUES (?, ?, ?, 'open', ?, ?, NULL)",
  );
  const claimPairing = db.prepare(
    "UPDATE pairings SET status = 'claimed', claimed_at = ? WHERE code = ? AND status = 'open'",
  );

  /** Wallet of the caller or 404/403 — a client never sees another client's wallet. */
  const ownedWallet = (req: FastifyRequest, address: string) => {
    const client = clientOf(req);
    const wallet = repo.walletByAddress(address);
    if (!wallet) throw notFound('Wallet');
    if (wallet.clientId !== client.clientId) throw forbidden('This wallet belongs to another client');
    return { wallet, client };
  };

  const addGuardian = createGuardianRegistrar({ config, events, repo, store, chain });

  const guardiansResponse = (walletAddress: string) => {
    const wallet = repo.walletByAddress(walletAddress);
    if (!wallet) throw notFound('Wallet');
    const requiredKinds = GUARDIAN_ORDER[wallet.recoveryMode];
    const guardians = store.guardians(wallet.address);
    return GuardiansResponseSchema.parse({
      walletAddress: wallet.address,
      recoveryMode: wallet.recoveryMode,
      requiredKinds,
      guardians,
      threshold: GUARDIAN_THRESHOLD,
      complete: store.orderedGuardians(wallet.address, wallet.recoveryMode) != null,
    });
  };

  const pairingView = (row: PairingRow): Pairing => {
    const expired = row.status === 'open' && row.expires_at <= nowIso();
    const guardian =
      row.status === 'claimed'
        ? store.guardians(row.wallet_address).find((g) => g.kind === 'safety-key')
        : undefined;
    return PairingSchema.parse({
      code: row.code,
      walletAddress: row.wallet_address,
      status: expired ? 'expired' : row.status,
      guardian,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      claimedAt: row.claimed_at ?? undefined,
      simulated: true,
    });
  };

  // ---- POST /wallets ----
  app.post('/wallets', { config: { client: true, idempotent: true } }, async (req, reply) => {
    const body = CreateWalletBodySchema.parse(req.body);
    const client: ClientIdentity = clientOf(req);
    if (!/^0x[0-9a-fA-F]{64}$/.test(body.pubKeyX) || !/^0x[0-9a-fA-F]{64}$/.test(body.pubKeyY))
      throw validationError('pubKeyX / pubKeyY must be 32-byte hex');

    const existingWallet = repo.walletByOwnerCredential(body.credentialId);
    if (existingWallet)
      return CreateWalletResponseSchema.parse({ address: existingWallet.address, wallet: existingWallet });

    const passkeyRow = findPasskey.get(body.credentialId) as
      | { wallet_address: string | null; pub_key_x: string; pub_key_y: string; client_id: string }
      | undefined;
    if (passkeyRow) {
      if (passkeyRow.wallet_address)
        throw conflict('This passkey already owns a wallet', { address: passkeyRow.wallet_address });
      if (
        passkeyRow.pub_key_x.toLowerCase() !== body.pubKeyX.toLowerCase() ||
        passkeyRow.pub_key_y.toLowerCase() !== body.pubKeyY.toLowerCase()
      )
        throw conflict('pubKeyX / pubKeyY do not match the registered passkey');
    } else if (client.auth === 'session' && client.credentialId !== body.credentialId) {
      throw forbidden('credentialId does not match the signed-in passkey');
    } else if (!config.DEMO_FAST_MODE) {
      throw notFound('Passkey');
    }

    // The counterfactual address is a pure library computation (abstractionkit CREATE2) — nothing is deployed here.
    const { address } = createPasskeyAccount({
      pubKeyX: BigInt(body.pubKeyX),
      pubKeyY: BigInt(body.pubKeyY),
    });
    if (repo.walletByAddress(address))
      throw conflict('A wallet for this passkey already exists', { address });
    const createdAt = nowIso();
    db.transaction(() => {
      if (!passkeyRow) {
        // DEMO_FAST_MODE only: a passkey registered outside /auth (E2E / curl). It cannot log in; it only owns the Safe.
        insertDemoPasskey.run(
          body.credentialId,
          client.clientId,
          Buffer.alloc(0),
          body.pubKeyX,
          body.pubKeyY,
          body.deviceLabel ?? client.deviceLabel ?? 'unlabelled device',
          createdAt,
        );
      }
      insertWallet.run(
        address,
        client.clientId,
        config.CHAIN_ID,
        body.credentialId,
        body.recoveryMode,
        createdAt,
      );
      bindPasskey.run(address, body.credentialId);
    })();
    events.recordEvent('wallet.created', address, {
      clientId: client.clientId,
      credentialId: body.credentialId,
      recoveryMode: body.recoveryMode,
      deviceLabel: body.deviceLabel ?? client.deviceLabel,
      counterfactual: true,
    });
    if (client.handoffCode) {
      // SPEC §10: the phone came from a claimed handoff — the laptop's tile and Safety-key prompt follow this wallet.
      bindHandoff.run(address, client.handoffCode, client.clientId);
      events.recordEvent('handoff.wallet-bound', address, {
        code: client.handoffCode,
        clientId: client.clientId,
        simulated: true,
      });
    }
    const wallet = repo.walletByAddress(address);
    return reply.status(201).send(CreateWalletResponseSchema.parse({ address, wallet }));
  });

  app.get('/wallets/:address', { config: { client: true } }, async (req) => {
    const { address } = AddressParam.parse(req.params);
    const { wallet } = ownedWallet(req, address);
    const pk = findPasskey.get(wallet.ownerCredentialId);
    return WalletDetailSchema.parse({
      ...wallet,
      guardians: store.guardians(wallet.address),
      passkey: pk ? rowToPasskey(pk as Parameters<typeof rowToPasskey>[0]) : undefined,
    });
  });

  app.get('/wallets/:address/guardians', { config: { client: true } }, async (req) => {
    const { address } = AddressParam.parse(req.params);
    ownedWallet(req, address);
    return guardiansResponse(address);
  });

  app.post(
    '/wallets/:address/guardians',
    { config: { client: true, idempotent: true } },
    async (req, reply) => {
      const { address } = AddressParam.parse(req.params);
      const body = AddGuardianBodySchema.parse(req.body);
      const { client } = ownedWallet(req, address);
      const guardian = await addGuardian(
        address,
        body.kind,
        body.address,
        client.deviceLabel ?? client.credentialId ?? 'session',
      );
      return reply.status(201).send(GuardianSchema.parse(guardian));
    },
  );

  app.post('/wallets/:address/mode', { config: { client: true, idempotent: true } }, async (req) => {
    const { address } = AddressParam.parse(req.params);
    const body = SetModeBodySchema.parse(req.body);
    const { wallet } = ownedWallet(req, address);
    if (wallet.status !== 'pending')
      throw conflict('The recovery mode is fixed once the wallet is protected');
    if (body.recoveryMode === 'assisted') {
      const partnerKnown = store.guardians(wallet.address).some((g) => g.kind === 'partner');
      if (!partnerKnown && !config.PARTNER_GUARDIAN_URL)
        throw policyRefused('Assisted mode needs a partner recoverer, which is not available yet');
    }
    store.setWalletMode(wallet.address, body.recoveryMode);
    events.recordEvent('wallet.mode-set', wallet.address, { recoveryMode: body.recoveryMode });
    return WalletSchema.parse(repo.walletByAddress(wallet.address));
  });

  // ---- Safety-key pairing (phone shows the code, laptop claims it) ----
  app.post('/pairings', { config: { client: true } }, async (req, reply) => {
    const body = CreatePairingBodySchema.parse(req.body);
    const { wallet, client } = ownedWallet(req, body.wallet);
    if (wallet.status !== 'pending')
      throw conflict('Recoverers are fixed on-chain once the wallet is protected');
    const open = openPairing.get(wallet.address, nowIso()) as PairingRow | undefined;
    if (open) return pairingView(open);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
    let code = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      if (!pairingByCode.get(code)) break;
    }
    insertPairing.run(code, wallet.address, client.clientId, createdAt, expiresAt);
    events.recordEvent('pairing.opened', wallet.address, { expiresAt, simulated: true });
    return reply.status(201).send(pairingView(pairingByCode.get(code) as PairingRow));
  });

  app.get('/pairings/:code', async (req) => {
    const { code } = CodeParam.parse(req.params);
    const row = pairingByCode.get(code) as PairingRow | undefined;
    if (!row) throw notFound('Pairing code');
    return pairingView(row);
  });

  app.post('/pairings/:code/claim', { config: { idempotent: true } }, async (req, reply) => {
    const { code } = CodeParam.parse(req.params);
    const body = ClaimPairingBodySchema.parse(req.body);
    const row = pairingByCode.get(code) as PairingRow | undefined;
    if (!row) throw notFound('Pairing code');
    const view = pairingView(row);
    if (view.status === 'expired')
      throw conflict('This pairing code has expired — show a new one on the phone');
    if (view.status === 'claimed') {
      if (view.guardian && isAddressEqual(view.guardian.address as `0x${string}`, getAddress(body.address)))
        return view.guardian;
      throw conflict('This pairing code was already used');
    }
    const guardian = await addGuardian(row.wallet_address, body.kind, body.address, `pairing:${code}`);
    claimPairing.run(nowIso(), code);
    events.recordEvent('guardian.paired', row.wallet_address, {
      kind: body.kind,
      address: guardian.address,
      code,
      simulated: true,
    });
    return reply.status(201).send(GuardianSchema.parse(guardian));
  });
};
