// Everything that touches the network, in one injectable bag so tests can stub it (no fake chain results
// in production code: each default talks to the real bundler / paymaster / RPC / guardian process).

import type { PasskeyAccount, SendUseroperationResponse, UserOperationV7 } from '@keyline/chain';
import * as chain from '@keyline/chain';
import { type GuardianIdentity, GuardianIdentitySchema } from '@keyline/shared';
import { type Address, erc20Abi, type Hex } from 'viem';
import { type BankPublicClient, funderClientFor, publicClientFor } from './chain/clients';
import type { BankConfig } from './config';
import { upstream } from './errors';

export type FunderBalances = { eth: bigint; usdc: bigint; address: Address };
export type UserOpChainStatus = {
  status: 'pending' | 'included' | 'failed';
  txHash?: Hex;
  blockNumber?: number;
};
export type AttestationVerifyInput = {
  client: BankPublicClient;
  wallet: Address;
  fields: chain.AttestationFields;
  signature: Hex;
};
export type AttestationVerify = (
  input: AttestationVerifyInput,
) => Promise<{ ok: boolean; method: 'erc1271'; reason?: string }>;

export type ChainDeps = {
  publicClient: BankPublicClient;
  sponsor: (pk: PasskeyAccount, userOp: UserOperationV7) => Promise<{ userOp: UserOperationV7 }>;
  sendUserOp: (pk: PasskeyAccount, userOp: UserOperationV7) => Promise<SendUseroperationResponse>;
  userOpStatus: (userOpHash: Hex) => Promise<UserOpChainStatus>;
  verifyAttestation: AttestationVerify;
  /** Reads `GET /identity` from the guardian process — the bank only learns the PUBLIC address. */
  guardianIdentity: (kind: 'swissquote' | 'partner') => Promise<GuardianIdentity>;
  funderBalances: () => Promise<FunderBalances>;
  /** Funder EOA → wallet ERC-20 transfer. Returns the real tx hash or throws. */
  funderTransferUsdc: (to: Address, amount: bigint) => Promise<Hex>;
};

export const createChainDeps = (config: BankConfig): ChainDeps => {
  const publicClient = publicClientFor(config);
  const funder = funderClientFor(config);
  const usdc = config.USDC_ADDRESS as Address;

  const requireUrl = (): { paymasterUrl: string; bundlerUrl: string } => {
    if (!config.paymasterUrl || !config.bundlerUrl)
      throw upstream('Paymaster not configured — set BANK_CANDIDE_BUNDLER_URL / BANK_CANDIDE_PAYMASTER_URL');
    return { paymasterUrl: config.paymasterUrl, bundlerUrl: config.bundlerUrl };
  };

  return {
    publicClient,
    sponsor: (pk, userOp) => chain.sponsor(pk, userOp, requireUrl()),
    sendUserOp: (pk, userOp) => chain.sendUserOp(pk, userOp, requireUrl().bundlerUrl),
    userOpStatus: async (hash) => {
      const s = await chain.getUserOpStatus(requireUrl().bundlerUrl, hash);
      return {
        status: s.status,
        txHash: s.txHash,
        blockNumber: s.blockNumber == null ? undefined : Number(s.blockNumber),
      };
    },
    // ERC-1271 against the deployed Safe through viem — a library call, nothing hand-rolled (see packages/chain).
    verifyAttestation: (input) => chain.attestation.verify(input),
    guardianIdentity: async (kind) => {
      const base = kind === 'swissquote' ? config.SQ_GUARDIAN_URL : config.PARTNER_GUARDIAN_URL;
      const res = await fetch(`${base}/identity`).catch((err: unknown) => {
        throw upstream(
          `${kind} guardian unreachable at ${base}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      if (!res.ok) throw upstream(`${kind} guardian answered ${res.status}`);
      const identity = GuardianIdentitySchema.parse(await res.json());
      if (identity.kind !== kind)
        throw upstream(`${base}/identity reports kind ${identity.kind}, expected ${kind}`);
      return identity;
    },
    funderBalances: async () => {
      const [eth, usdcBal] = await Promise.all([
        publicClient.getBalance({ address: funder.account.address }),
        publicClient.readContract({
          address: usdc,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [funder.account.address],
        }),
      ]);
      return { eth, usdc: usdcBal, address: funder.account.address };
    },
    funderTransferUsdc: (to, amount) =>
      funder.client.writeContract({
        address: usdc,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, amount],
      }),
  };
};
