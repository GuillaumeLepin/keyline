// Thin row→schema mappers for the read endpoints that already exist in Wave 0.
import {
  type Client,
  ClientSchema,
  type Contact,
  ContactSchema,
  type Dapp,
  DappSchema,
  type Wallet,
  WalletSchema,
} from '@keyline/shared';
import type { Db } from './db';

type WalletRow = {
  address: string;
  client_id: string;
  chain_id: number;
  owner_credential_id: string;
  status: string;
  recovery_mode: string;
  deploy_tx_hash: string | null;
  created_at: string;
  attested?: number;
};
type ContactRow = {
  client_id: string;
  label: string;
  address: string;
  first_seen_at: string;
  verified_ownership: number;
  simulated: number;
};
type DappRow = {
  id: string;
  name: string;
  url: string;
  allowlisted: number;
  contracts: string;
  simulated: number;
};
type ClientRow = { id: string; name: string; email: string; kyc_level: string; created_at: string };

export const rowToWallet = (r: WalletRow): Wallet =>
  WalletSchema.parse({
    address: r.address,
    clientId: r.client_id,
    chainId: r.chain_id,
    ownerCredentialId: r.owner_credential_id,
    status: r.status,
    recoveryMode: r.recovery_mode,
    createdAt: r.created_at,
    deployTxHash: r.deploy_tx_hash ?? undefined,
    attested: r.attested === 1,
  });

export const rowToContact = (r: ContactRow): Contact =>
  ContactSchema.parse({
    clientId: r.client_id,
    label: r.label,
    address: r.address,
    firstSeenAt: r.first_seen_at,
    verifiedOwnership: r.verified_ownership === 1,
    simulated: r.simulated === 1 ? true : undefined,
  });

export const rowToDapp = (r: DappRow): Dapp =>
  DappSchema.parse({
    id: r.id,
    name: r.name,
    url: r.url,
    allowlisted: r.allowlisted === 1,
    contracts: JSON.parse(r.contracts) as string[],
    simulated: r.simulated === 1 ? true : undefined,
  });

export const rowToClient = (r: ClientRow): Client =>
  ClientSchema.parse({
    id: r.id,
    name: r.name,
    email: r.email,
    kycLevel: r.kyc_level,
    createdAt: r.created_at,
  });

/** `attested` is derived from the attestations table so no ALTER TABLE is needed on existing DBs. */
export const WALLET_SELECT =
  'SELECT w.*, EXISTS(SELECT 1 FROM attestations a WHERE lower(a.wallet_address) = lower(w.address)) AS attested FROM wallets w';

export const createRepo = (db: Db) => ({
  walletByOwnerCredential(credentialId: string): Wallet | null {
    const row = db.prepare(`${WALLET_SELECT} WHERE w.owner_credential_id = ?`).get(credentialId) as
      | WalletRow
      | undefined;
    return row ? rowToWallet(row) : null;
  },
  walletByAddress(address: string): Wallet | null {
    const row = db.prepare(`${WALLET_SELECT} WHERE lower(w.address) = lower(?)`).get(address) as
      | WalletRow
      | undefined;
    return row ? rowToWallet(row) : null;
  },
  walletsForClient(clientId: string): Wallet[] {
    return (
      db
        .prepare(`${WALLET_SELECT} WHERE w.client_id = ? ORDER BY w.created_at DESC`)
        .all(clientId) as WalletRow[]
    ).map(rowToWallet);
  },
  contacts(clientId: string): Contact[] {
    return (
      db.prepare('SELECT * FROM contacts WHERE client_id = ? ORDER BY label').all(clientId) as ContactRow[]
    ).map(rowToContact);
  },
  dapps(): Dapp[] {
    return (db.prepare('SELECT * FROM dapps ORDER BY allowlisted DESC, name').all() as DappRow[]).map(
      rowToDapp,
    );
  },
  client(clientId: string): Client | null {
    const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as ClientRow | undefined;
    return row ? rowToClient(row) : null;
  },
});
export type Repo = ReturnType<typeof createRepo>;
