// Recoverer registration shared by POST /wallets/:address/guardians, the legacy /pairings claim and the
// SPEC §10 laptop Safety key (POST /sq/safety-key). One code path, one set of checks.
import type { Guardian, GuardianKind } from '@keyline/shared';
import { getAddress, isAddressEqual } from 'viem';
import type { BankConfig } from './config';
import type { ChainDeps } from './deps';
import { conflict, notFound, validationError } from './errors';
import type { EventStore } from './events';
import type { Repo } from './repo';
import { GUARDIAN_ORDER, type Store } from './store';

export type GuardianRegistrarDeps = {
  config: BankConfig;
  events: EventStore;
  repo: Repo;
  store: Store;
  chain: Pick<ChainDeps, 'guardianIdentity'>;
};

export const createGuardianRegistrar =
  ({ config, events, repo, store, chain }: GuardianRegistrarDeps) =>
  async (
    walletAddress: string,
    kind: GuardianKind,
    address: string | undefined,
    by: string,
  ): Promise<Guardian> => {
    const wallet = repo.walletByAddress(walletAddress);
    if (!wallet) throw notFound('Wallet');
    if (wallet.status !== 'pending')
      throw conflict('Recoverers are fixed on-chain once the wallet is protected');
    const required: readonly GuardianKind[] = GUARDIAN_ORDER[wallet.recoveryMode];
    if (!required.includes(kind))
      throw validationError(`${kind} is not a recoverer in ${wallet.recoveryMode} mode`);

    let resolved = address;
    if (kind === 'swissquote' || kind === 'partner') {
      // The bank never holds that key: it only reads the public address the guardian process publishes.
      const identity = await chain.guardianIdentity(kind);
      if (identity.chainId !== config.CHAIN_ID)
        throw conflict(`${kind} guardian runs on chain ${identity.chainId}`);
      resolved = identity.guardianAddress;
    }
    if (!resolved) throw validationError('address is required');
    const addr = getAddress(resolved);

    const existing = store.guardians(wallet.address);
    const sameKind = existing.find((g) => g.kind === kind);
    if (sameKind) {
      if (isAddressEqual(sameKind.address as `0x${string}`, addr)) return sameKind;
      throw conflict(`A ${kind} recoverer is already registered`, { address: sameKind.address });
    }
    if (existing.some((g) => isAddressEqual(g.address as `0x${string}`, addr)))
      throw conflict('This address is already one of the recoverers');
    if (isAddressEqual(addr, wallet.address as `0x${string}`))
      throw validationError('The wallet cannot be its own recoverer');

    const guardian = store.addGuardian(wallet.address, kind, addr);
    events.recordEvent('guardian.registered', wallet.address, { kind, address: addr, by });
    return guardian;
  };
export type GuardianRegistrar = ReturnType<typeof createGuardianRegistrar>;
