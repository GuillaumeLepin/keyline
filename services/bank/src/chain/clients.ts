// viem clients for the bank's own reads, the funder EOA (top-ups) and the relayer EOA (recovery submitter when funded).
import {
  type Chain,
  createPublicClient,
  createWalletClient,
  type HttpTransport,
  http,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, sepolia } from 'viem/chains';
import type { BankConfig } from '../config';

export const chainFor = (chainId: number): Chain => (chainId === 11155111 ? sepolia : baseSepolia);

export type BankPublicClient = PublicClient<HttpTransport, Chain>;
export type FunderClient = {
  client: WalletClient<HttpTransport, Chain, PrivateKeyAccount>;
  account: PrivateKeyAccount;
};

export const publicClientFor = (config: BankConfig): BankPublicClient =>
  createPublicClient({ chain: chainFor(config.CHAIN_ID), transport: http(config.RPC_URL) });

export const funderClientFor = (config: BankConfig): FunderClient => {
  const account = privateKeyToAccount(config.BANK_FUNDER_PRIVATE_KEY as `0x${string}`);
  return {
    account,
    client: createWalletClient({
      account,
      chain: chainFor(config.CHAIN_ID),
      transport: http(config.RPC_URL),
    }),
  };
};

/** Relayer EOA — used directly only when it holds ETH; otherwise `sponsoredRelayer` wraps the same key (deps.ts). */
export const relayerClientFor = (config: BankConfig): FunderClient => {
  const account = privateKeyToAccount(config.BANK_RELAYER_PRIVATE_KEY as `0x${string}`);
  return {
    account,
    client: createWalletClient({
      account,
      chain: chainFor(config.CHAIN_ID),
      transport: http(config.RPC_URL),
    }),
  };
};
