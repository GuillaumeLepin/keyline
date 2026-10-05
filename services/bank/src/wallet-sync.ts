// A Safe can be deployed outside the bank's relay (another bundler, a direct factory call, a restored device): the
// registry would still say `pending` and refuse attestation / top-ups / transfers. Before refusing, look at the chain:
// code at the address → mark `deployed` and record the recoverers the SocialRecoveryModule actually holds.
import type { Wallet } from '@keyline/shared';
import { type Address, getAddress } from 'viem';
import type { Db } from './db';
import type { ChainDeps } from './deps';
import type { EventStore } from './events';
import type { Repo } from './repo';

export type WalletSyncDeps = {
  db: Db;
  repo: Repo;
  events: EventStore;
  chain: Pick<ChainDeps, 'walletHasCode' | 'onchainGuardians'>;
};

/** Returns the (possibly refreshed) wallet. Never throws for chain reasons: an unreachable RPC keeps `pending`. */
export const syncWalletStatus = async (deps: WalletSyncDeps, wallet: Wallet): Promise<Wallet> => {
  if (wallet.status !== 'pending') return wallet;
  const address = getAddress(wallet.address);
  let hasCode = false;
  try {
    hasCode = await deps.chain.walletHasCode(address);
  } catch {
    return wallet;
  }
  if (!hasCode) return wallet;
  let guardians: Address[] = [];
  try {
    guardians = (await deps.chain.onchainGuardians(address)).map((g) => getAddress(g));
  } catch {
    /* the module read is informational */
  }
  deps.db
    .prepare("UPDATE wallets SET status = 'deployed' WHERE lower(address) = lower(?) AND status = 'pending'")
    .run(address);
  const registered = deps.db
    .prepare('SELECT kind, address FROM guardians WHERE lower(wallet_address) = lower(?)')
    .all(address) as { kind: string; address: string }[];
  deps.events.recordEvent('wallet.deployed-externally', address, {
    source: 'eth_getCode',
    onchainGuardians: guardians,
    registeredGuardians: registered,
    unregisteredOnchain: guardians.filter(
      (g) => !registered.some((r) => r.address.toLowerCase() === g.toLowerCase()),
    ),
  });
  return deps.repo.walletByAddress(address) ?? { ...wallet, status: 'deployed' };
};
