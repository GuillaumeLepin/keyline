/**
 * Transaction submitters for recovery-module calls (`multiConfirmRecovery`, `finalizeRecovery`, `createSigner`).
 *
 * Two interchangeable implementations behind `TxSubmitter`:
 *  - `eoaSubmitter(walletClient)` — a funded EOA (bank relayer, sq-guardian) sends a plain transaction.
 *  - `sponsoredRelayer(...)` — an EOA-OWNED `SafeAccountV0_3_0` ("relayer Safe") whose userOps Candide sponsors, so
 *    the relayer needs ZERO ETH. `msg.sender` seen by the module is the relayer Safe, which is fine for
 *    `multiConfirmRecovery` (signatures carry the guardians' identity), `finalizeRecovery` and the signer factory —
 *    but NOT for `confirmRecovery`, which requires `msg.sender` to be the guardian itself (unless the guardian
 *    registered on-chain IS that Safe's address).
 *
 * All signing is abstractionkit (`signUserOperation` with the owner key) — nothing homemade.
 */
import { CandidePaymaster, SafeAccountV0_3_0, type SendUseroperationResponse } from 'abstractionkit';
import type { Account, Address, Chain, Client, Hex, Transport } from 'viem';
import { getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sendTransaction } from 'viem/actions';
import { ChainError, waitForReceipt } from './account.js';

export interface TxRequest {
  readonly to: Address;
  readonly data: Hex;
  readonly value?: bigint;
}

export interface TxSubmitter {
  readonly kind: 'eoa' | 'sponsored-safe';
  /** The `msg.sender` contracts will see. */
  readonly address: Address;
  /** Resolves to the transaction hash (for the sponsored Safe: after the bundle is included). */
  sendTransaction(tx: TxRequest): Promise<Hex>;
}

export type WriteClient = Client<Transport, Chain, Account>;

export function isTxSubmitter(value: WriteClient | TxSubmitter): value is TxSubmitter {
  return 'kind' in value && (value.kind === 'eoa' || value.kind === 'sponsored-safe');
}

/** A viem wallet client (funded EOA) as a submitter. */
export function eoaSubmitter(client: WriteClient): TxSubmitter {
  return {
    kind: 'eoa',
    address: getAddress(client.account.address),
    sendTransaction: (tx) =>
      sendTransaction(client, {
        account: client.account,
        chain: client.chain,
        to: tx.to,
        data: tx.data,
        value: tx.value ?? 0n,
      }),
  };
}

/** Either form, normalised to a submitter. */
export function toSubmitter(clientOrSubmitter: WriteClient | TxSubmitter): TxSubmitter {
  return isTxSubmitter(clientOrSubmitter) ? clientOrSubmitter : eoaSubmitter(clientOrSubmitter);
}

export interface SponsoredRelayerInput {
  /** EOA that owns the relayer Safe (BANK_RELAYER_PRIVATE_KEY / GUARDIAN_PRIVATE_KEY). Never needs ETH. */
  readonly ownerPrivateKey: Hex;
  readonly endpoints: {
    readonly chainId: bigint;
    readonly rpcUrl: string;
    readonly bundlerUrl: string;
    /** Candide URL with sponsorship (authenticated, or the public testnet endpoint). */
    readonly paymasterUrl: string;
  };
  readonly sponsorshipPolicyId?: string;
  readonly timeoutSeconds?: number;
}

export interface SponsoredRelayer extends TxSubmitter {
  readonly kind: 'sponsored-safe';
  readonly owner: Address;
  /** Hash of the last userOp sent (for logs / the desk event feed). */
  readonly lastUserOpHash: () => Hex | null;
  readonly isDeployed: () => Promise<boolean>;
}

/**
 * Candide-sponsored relayer Safe. Deterministic address from the owner EOA; the first `sendTransaction` deploys it
 * as part of the same (sponsored) userOp. Sequential by design: each call waits for inclusion before returning.
 */
export function sponsoredRelayer(input: SponsoredRelayerInput): SponsoredRelayer {
  const owner = privateKeyToAccount(input.ownerPrivateKey);
  const account = SafeAccountV0_3_0.initializeNewAccount([owner.address]);
  const address = getAddress(account.accountAddress);
  const paymaster = new CandidePaymaster(input.endpoints.paymasterUrl);
  let last: Hex | null = null;

  return {
    kind: 'sponsored-safe',
    address,
    owner: owner.address,
    lastUserOpHash: () => last,
    isDeployed: () => SafeAccountV0_3_0.isDeployed(address, input.endpoints.rpcUrl),
    async sendTransaction(tx: TxRequest): Promise<Hex> {
      // 1. build (dummy EOA signature, estimation left to the paymaster) → 2. sponsor → 3. sign → 4. send
      const built = await account.createUserOperation(
        [{ to: tx.to, value: tx.value ?? 0n, data: tx.data }],
        input.endpoints.rpcUrl,
        input.endpoints.bundlerUrl,
        { expectedSigners: [owner.address], skipGasEstimation: true },
      );
      const sponsored = await paymaster.createSponsorPaymasterUserOperation(
        account,
        built,
        input.endpoints.bundlerUrl,
        input.sponsorshipPolicyId,
      );
      const userOp = sponsored.userOperation;
      userOp.signature = account.signUserOperation(userOp, [input.ownerPrivateKey], input.endpoints.chainId);
      const response: SendUseroperationResponse = await account.sendUserOperation(
        userOp,
        input.endpoints.bundlerUrl,
      );
      last = response.userOperationHash as Hex;
      const receipt = await waitForReceipt(response, { timeoutSeconds: input.timeoutSeconds ?? 180 });
      if (!receipt.success) throw new ChainError('USEROP_FAILED', `relayer userOp ${last} failed`);
      return receipt.receipt.transactionHash as Hex;
    },
  };
}
