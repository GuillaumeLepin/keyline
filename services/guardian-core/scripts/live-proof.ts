// Live proof of Option A (docs/DECISIONS.md #15) against a running guardian and Base Sepolia.
//   1. `tsx scripts/live-proof.ts gen <keyfile>`  → prints a throwaway bank-verdict address
//   2. start the guardian with BANK_VERDICT_ADDRESS=<that address> on the command line
//   3. `tsx scripts/live-proof.ts check <keyfile>` → signs a verdict with the throwaway key, asks the
//      guardian to confirm, and verifies the returned EIP-712 signature against the module's own
//      `getRecoveryHash`. NOTHING is submitted on-chain.
import { readFileSync, writeFileSync } from 'node:fs';
import { recoveryHash, recoveryHashOnChain, recoveryNonce, recoveryTypedData } from '@keyline/chain';
import {
  GuardianRecoveryResponseSchema,
  IDENTITY_VERDICT_TYPES,
  type IdentityVerdict,
  identityVerdictDomain,
} from '@keyline/shared';
import { type Address, createPublicClient, type Hex, http, recoverTypedDataAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const out = (o: unknown) =>
  process.stdout.write(`${typeof o === 'string' ? o : JSON.stringify(o, null, 2)}\n`);
const [phase, keyFile] = process.argv.slice(2);
if (!phase || !keyFile) throw new Error('usage: live-proof.ts gen|check <keyfile>');

const GUARDIAN_URL = process.env.GUARDIAN_URL ?? 'http://127.0.0.1:4001';
const RPC_URL = process.env.RPC_URL ?? 'https://sepolia.base.org';
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 84532);
const MODULE = (process.env.RECOVERY_MODULE_ADDRESS ??
  '0x949d01d424bE050D09C16025dd007CB59b3A8c66') as Address;
/** Gate 1 Safe: guardians include sq-guardian, threshold 2 (other guardian keys lost → never execute). */
const SAFE = (process.env.PROOF_SAFE ?? '0x39ECE2fA9262408426E78c71A9dED95ddD42967D') as Address;
const NEW_OWNER = (process.env.PROOF_NEW_OWNER ?? '0x2222222222222222222222222222222222222222') as Address;
const NOT_A_SAFE: Address = '0x000000000000000000000000000000000000dEaD';

if (phase === 'gen') {
  const privateKey = generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address;
  writeFileSync(keyFile, JSON.stringify({ privateKey, address }));
  out(address);
  process.exit(0);
}

const { privateKey } = JSON.parse(readFileSync(keyFile, 'utf8')) as { privateKey: Hex };
const bank = privateKeyToAccount(privateKey);
const client = createPublicClient({ transport: http(RPC_URL) });
let failures = 0;
const check = (label: string, ok: boolean) => {
  out(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
};

async function signVerdict(recoveryRequestId: string, wallet: Address): Promise<IdentityVerdict> {
  const base: Omit<IdentityVerdict, 'signature'> = {
    recoveryRequestId,
    wallet,
    newOwner: NEW_OWNER,
    method: 'eid-simulated',
    emailOtpPassed: true,
    idCheckPassed: true,
    livenessPassed: true,
    verdict: 'pass',
    signedBy: 'bank',
    issuedAt: Math.floor(Date.now() / 1000),
    simulated: true,
  };
  const signature = await bank.signTypedData({
    domain: identityVerdictDomain(CHAIN_ID),
    types: IDENTITY_VERDICT_TYPES,
    primaryType: 'IdentityVerdict',
    message: {
      recoveryRequestId,
      wallet,
      newOwner: NEW_OWNER,
      method: base.method,
      verdict: base.verdict,
      issuedAt: BigInt(base.issuedAt),
    },
  });
  return { ...base, signature };
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${GUARDIAN_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: unknown = await res.json();
  out(`\n${method} ${path} → ${res.status}`);
  out(json);
  return { status: res.status, json };
}

const health = (await call('GET', '/health')).json as {
  chainPort: string;
  submitter: string;
  confirmMode: string;
};
check("health.chainPort === 'real'", health.chainPort === 'real');
const identity = (await call('GET', '/identity')).json as { guardianAddress: Address };

const id = `live-proof-${Date.now()}`;
const req = await call('POST', '/recoveries', {
  recoveryRequestId: id,
  wallet: SAFE,
  newOwners: [NEW_OWNER],
  newThreshold: 1,
  identityVerdict: await signVerdict(id, SAFE),
});
check('POST /recoveries → 200', req.status === 200);
const parsed = GuardianRecoveryResponseSchema.safeParse(req.json);
check('response matches GuardianRecoveryResponseSchema', parsed.success);
if (parsed.success && parsed.data.mode === 'signature') {
  const r = parsed.data;
  const liveNonce = await recoveryNonce(client, MODULE, SAFE);
  check(
    `nonce in response (${r.nonce}) equals live module.nonce(wallet) (${liveNonce})`,
    BigInt(r.nonce) === liveNonce,
  );
  const input = {
    wallet: SAFE,
    newOwners: [NEW_OWNER],
    threshold: 1n,
    nonce: BigInt(r.nonce),
    chainId: CHAIN_ID,
    module: MODULE,
  } as const;
  const local = recoveryHash(input);
  const onChain = await recoveryHashOnChain(client, input);
  out({ localRecoveryHash: local, onChainGetRecoveryHash: onChain });
  check('local EIP-712 hash equals module.getRecoveryHash', local === onChain);
  const recovered = await recoverTypedDataAddress({
    ...recoveryTypedData(input),
    signature: r.signature as Hex,
  });
  out({ recovered, guardianAddress: identity.guardianAddress });
  check('signature recovers to the guardian address', recovered === identity.guardianAddress);
  check('response.guardianAddress is the guardian', r.guardianAddress === identity.guardianAddress);
  check('executed === false (nothing submitted)', r.executed === false);
} else {
  check("mode === 'signature'", false);
}

await call('GET', `/recoveries/${id}`);

const bogus = await call('POST', `/recoveries/${id}/executed`, {
  txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  executeAfter: Math.floor(Date.now() / 1000) + 180,
});
check('/executed with no pending recovery on-chain → 409', bogus.status === 409);

const notGuardian = await call('POST', '/recoveries', {
  recoveryRequestId: `${id}-not-guardian`,
  wallet: NOT_A_SAFE,
  newOwners: [NEW_OWNER],
  newThreshold: 1,
  identityVerdict: await signVerdict(`${id}-not-guardian`, NOT_A_SAFE),
});
check('wallet where sq is not a guardian → 403', notGuardian.status === 403);

const still = await recoveryNonce(client, MODULE, SAFE);
out({ moduleNonceAfter: still.toString() });
out(
  failures === 0 ? '\nALL CHECKS PASSED — nothing was submitted on-chain' : `\n${failures} CHECK(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
