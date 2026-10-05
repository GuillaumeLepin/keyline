/** build → sponsor → passkey signs SafeOp hash → send → receipt, shared by the spikes (test harness). */
import {
  ChainError,
  explorerTxUrl,
  type PasskeyAccount,
  safeOpHash,
  sendUserOp,
  signUserOpWithPasskey,
  sponsor,
  userOpToJson,
  waitForReceipt,
} from '@keyline/chain';
import type { UserOperationV7 } from 'abstractionkit';
import type { Hex } from 'viem';
import { log, type SpikeEndpoints } from './cli.js';
import type { SoftPasskey } from './test-passkey.js';

export async function signSponsorSend(
  label: string,
  pk: PasskeyAccount,
  passkey: SoftPasskey,
  userOp: UserOperationV7,
  endpoints: SpikeEndpoints,
  options: { verbose?: boolean } = {},
): Promise<{ txHash: Hex; userOpHash: string; actualGasUsed: bigint }> {
  log(`${label}: built userOp (dummy signature)`);
  if (options.verbose) log('userOp', userOpToJson(userOp));

  if (!endpoints.paymasterUrl) {
    throw new ChainError(
      'MISSING_PAYMASTER',
      'BANK_CANDIDE_API_KEY missing — cannot sponsor. Paste the key from https://dashboard.candide.dev into root .env ' +
        '(BANK_CANDIDE_BUNDLER_URL/PAYMASTER_URL = https://api.candide.dev/api/v3/84532/<KEY>), or re-run with --public.',
    );
  }
  const sponsored = await sponsor(pk, userOp, {
    paymasterUrl: endpoints.paymasterUrl,
    bundlerUrl: endpoints.bundlerUrl,
  });
  log(`${label}: sponsored`, {
    paymaster: sponsored.userOp.paymaster,
    sponsor: sponsored.sponsorMetadata?.name ?? null,
  });

  const challenge = safeOpHash(sponsored.userOp, endpoints.chainId);
  log(`${label}: SafeOp EIP-712 hash (WebAuthn challenge)`, challenge);
  const assertion = await passkey.sign(challenge);
  const signed = signUserOpWithPasskey(sponsored.userOp, assertion, pk.owner);

  const response = await sendUserOp(pk, signed, endpoints.bundlerUrl);
  log(`${label}: sent`, { userOpHash: response.userOperationHash });
  const receipt = await waitForReceipt(response);
  const txHash = receipt.receipt.transactionHash as Hex;
  log(`${label}: included`, {
    tx: explorerTxUrl(endpoints.chainId, txHash),
    actualGasUsed: receipt.actualGasUsed.toString(),
    actualGasCostWei: receipt.actualGasCost.toString(),
  });
  return { txHash, userOpHash: response.userOperationHash, actualGasUsed: receipt.actualGasUsed };
}
