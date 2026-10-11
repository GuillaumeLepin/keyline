/**
 * WalletConnect day-one spike — TEST HARNESS ONLY. Proves, on Base Sepolia, with a passkey-owned Safe:
 *  1. personal_sign (plain + SIWE) and eth_signTypedData_v4 (Mail + USDC EIP-2612 Permit + Permit2 PermitSingle)
 *     produce ERC-1271 signatures that viem `verifyMessage` / `verifyTypedData` / `verifySiweMessage` accept, and the
 *     raw `Safe.isValidSignature(bytes32, bytes)` returns 0x1626ba7e;
 *  2. USDC `permit(…, bytes)` and Permit2 `permit(owner, PermitSingle, bytes)` accept that signature (simulateContract),
 *     and reject a stranger's; `detectSignatureScheme` classification;
 *  3. eth_sendTransaction / wallet_sendCalls: a sponsored userOp (USDC approve(0)), the bundle tx hash, viem
 *     `waitForTransactionReceipt` on it, inner `Approval` log, timings, `getCallsStatus` shape.
 *
 * Usage: pnpm --filter @keyline/scripts exec tsx spike-erc1271.ts --keyfile ../data/test-keyfile.json [--skip-send]
 */
import {
  buildBatchUserOp,
  contractSignatureFromPasskey,
  createPasskeyAccount,
  detectSignatureScheme,
  ERC1271_ABI,
  explorerTxUrl,
  getCallsStatus,
  PERMIT2_ADDRESS,
  passkeySignerAddress,
  safeMessageHashForMessage,
  safeMessageHashForTypedData,
  safeOpHash,
  sendUserOp,
  signUserOpWithPasskey,
  sponsor,
  waitForReceipt,
} from '@keyline/chain';
import {
  type Address,
  createPublicClient,
  decodeEventLog,
  domainSeparator,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  type Hex,
  hashMessage,
  hashTypedData,
  http,
  isAddressEqual,
  parseAbi,
  toHex,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { createSiweMessage, generateSiweNonce, parseSiweMessage, verifySiweMessage } from 'viem/siwe';
import { arg, hasFlag, log, requireEnv, spikeEndpoints } from './src/cli.js';
import { createEphemeralPasskey, loadTestKeys, type SoftPasskey } from './src/test-passkey.js';

const USDC_PERMIT_ABI = parseAbi([
  'function permit(address owner, address spender, uint256 value, uint256 deadline, bytes signature)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
]);
const PERMIT2_ABI = parseAbi([
  'struct PermitDetails { address token; uint160 amount; uint48 expiration; uint48 nonce; }',
  'struct PermitSingle { PermitDetails details; address spender; uint256 sigDeadline; }',
  'function permit(address owner, PermitSingle permitSingle, bytes signature)',
  'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
]);
const SPENDER: Address = '0x000000000000000000000000000000000000dEaD';
const CALLER: Address = '0x11a2170B2fA64944F3b6ffB9De9Fb3246330F8a9'; // any eth_call sender (bank relayer)

const results: Record<string, unknown> = {};

async function main(): Promise<void> {
  const endpoints = spikeEndpoints();
  const { chainId, rpcUrl } = endpoints;
  const keyfile = arg('--keyfile');
  if (!keyfile) throw new Error('--keyfile <path> is required');
  const keys = await loadTestKeys(keyfile);
  const pk = createPasskeyAccount({ pubKeyX: keys.passkey.publicKey.x, pubKeyY: keys.passkey.publicKey.y });
  const safe = keys.safe ?? pk.address;
  const usdc = getAddress(requireEnv('USDC_ADDRESS'));
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  log('Safe', safe);
  log('owner (signer proxy)', passkeySignerAddress(pk.owner));
  if ((await client.getCode({ address: safe })) === undefined)
    throw new Error(`Safe ${safe} is not deployed`);
  const passkey: SoftPasskey = keys.passkey;
  const stranger = (await createEphemeralPasskey()).passkey;

  async function signWith(key: SoftPasskey, challenge: Hex): Promise<Hex> {
    return contractSignatureFromPasskey(await key.sign(challenge), key.publicKey);
  }
  async function magic(dataHash: Hex, signature: Hex): Promise<string> {
    try {
      return await client.readContract({
        address: safe,
        abi: ERC1271_ABI,
        functionName: 'isValidSignature',
        args: [dataHash, signature],
      });
    } catch (error) {
      return `revert: ${(error as Error).message.split('\n')[0]}`;
    }
  }

  // (a) personal_sign "Hello Keyline" — WalletConnect sends params [toHex(message), address]
  log('(a) personal_sign plain');
  const plain = 'Hello Keyline';
  const plainRaw = { raw: toHex(plain) } as const;
  const challengeA = safeMessageHashForMessage({ safe, chainId, message: plainRaw });
  const sigA = await signWith(passkey, challengeA);
  const a = {
    sameHashStringVsRaw: hashMessage(plain) === hashMessage(plainRaw),
    challenge: challengeA,
    signatureBytes: (sigA.length - 2) / 2,
    verifyMessage: await client.verifyMessage({ address: safe, message: plain, signature: sigA }),
    magic: await magic(hashMessage(plain), sigA),
    strangerVerify: await client.verifyMessage({
      address: safe,
      message: plain,
      signature: await signWith(stranger, challengeA),
    }),
  };
  log('(a)', a);
  results.a = a;

  // (b) SIWE
  log('(b) personal_sign SIWE (EIP-4361)');
  const now = new Date();
  const siwe = createSiweMessage({
    domain: 'localhost:3100',
    uri: 'http://localhost:3100',
    address: safe,
    chainId: Number(chainId),
    nonce: generateSiweNonce(),
    issuedAt: now,
    expirationTime: new Date(now.getTime() + 10 * 60_000),
    statement: 'Sign in to DemoSwap with Keyline.',
    version: '1',
  });
  console.info(siwe);
  const parsed = parseSiweMessage(siwe);
  const sigB = await signWith(passkey, safeMessageHashForMessage({ safe, chainId, message: siwe }));
  const b = {
    parsed: {
      ...parsed,
      issuedAt: parsed.issuedAt?.toISOString(),
      expirationTime: parsed.expirationTime?.toISOString(),
    },
    verifyMessage: await client.verifyMessage({ address: safe, message: siwe, signature: sigB }),
    verifySiweMessage: await verifySiweMessage(client, {
      message: siwe,
      signature: sigB,
      domain: 'localhost:3100',
      nonce: parsed.nonce,
      address: safe,
    }),
    verifySiweWrongDomain: await verifySiweMessage(client, {
      message: siwe,
      signature: sigB,
      domain: 'evil.example',
    }),
    magic: await magic(hashMessage(siwe), sigB),
  };
  log('(b)', b);
  results.b = b;

  // (c) eth_signTypedData_v4 — generic Mail
  log('(c) eth_signTypedData_v4 Mail');
  const mail = {
    domain: {
      name: 'Ether Mail',
      version: '1',
      chainId: Number(chainId),
      verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
    },
    types: {
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' },
      ],
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'to', type: 'Person' },
        { name: 'contents', type: 'string' },
      ],
    },
    primaryType: 'Mail',
    message: {
      from: { name: 'Keyline', wallet: safe },
      to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
      contents: 'Hello, Bob!',
    },
  } as const;
  const sigC = await signWith(passkey, safeMessageHashForTypedData({ safe, chainId, typedData: mail }));
  const c = {
    verifyTypedData: await client.verifyTypedData({ ...mail, address: safe, signature: sigC }),
    magic: await magic(hashTypedData(mail), sigC),
    detect: detectSignatureScheme(mail),
  };
  log('(c)', c);
  results.c = c;

  // (d) EIP-2612 Permit on USDC (FiatTokenV2_2)
  log('(d) USDC EIP-2612 Permit');
  const [usdcNonce, usdcDomainSep, usdcName, usdcVersion] = await Promise.all([
    client.readContract({ address: usdc, abi: USDC_PERMIT_ABI, functionName: 'nonces', args: [safe] }),
    client.readContract({ address: usdc, abi: USDC_PERMIT_ABI, functionName: 'DOMAIN_SEPARATOR' }),
    client.readContract({ address: usdc, abi: erc20Abi, functionName: 'name' }),
    client.readContract({
      address: usdc,
      abi: parseAbi(['function version() view returns (string)']),
      functionName: 'version',
    }),
  ]);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const permit = {
    domain: { name: usdcName, version: usdcVersion, chainId: Number(chainId), verifyingContract: usdc },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    message: { owner: safe, spender: SPENDER, value: 1_000_000n, nonce: usdcNonce, deadline },
  } as const;
  const domainMatches = domainSeparator({ domain: permit.domain }) === usdcDomainSep;
  const sigD = await signWith(passkey, safeMessageHashForTypedData({ safe, chainId, typedData: permit }));
  const sigDStranger = await signWith(
    stranger,
    safeMessageHashForTypedData({ safe, chainId, typedData: permit }),
  );
  async function simulateUsdcPermit(signature: Hex): Promise<string> {
    try {
      await client.simulateContract({
        account: CALLER,
        address: usdc,
        abi: USDC_PERMIT_ABI,
        functionName: 'permit',
        args: [safe, SPENDER, 1_000_000n, deadline, signature],
      });
      return 'ok';
    } catch (error) {
      return `revert: ${(error as Error & { shortMessage?: string }).shortMessage ?? (error as Error).message}`;
    }
  }
  async function simulateUsdcPermitVrs(signature: Hex): Promise<string> {
    // The (v, r, s) overload can only carry 65 bytes: take r, s, v from the head of the Safe signature.
    const r = `0x${signature.slice(2, 66)}` as Hex;
    const s = `0x${signature.slice(66, 130)}` as Hex;
    const v = Number.parseInt(signature.slice(130, 132), 16);
    try {
      await client.simulateContract({
        account: CALLER,
        address: usdc,
        abi: USDC_PERMIT_ABI,
        functionName: 'permit',
        args: [safe, SPENDER, 1_000_000n, deadline, v, r, s],
      });
      return 'ok';
    } catch (error) {
      return `revert: ${(error as Error & { shortMessage?: string }).shortMessage ?? (error as Error).message}`;
    }
  }
  const d = {
    usdcName,
    usdcVersion,
    usdcNonce,
    domainSeparatorMatches: domainMatches,
    verifyTypedData: await client.verifyTypedData({ ...permit, address: safe, signature: sigD }),
    magic: await magic(hashTypedData(permit), sigD),
    simulatePermitBytes: await simulateUsdcPermit(sigD),
    simulatePermitBytesStranger: await simulateUsdcPermit(sigDStranger),
    simulatePermitVrs: await simulateUsdcPermitVrs(sigD),
    detect: detectSignatureScheme(permit),
  };
  log('(d)', d);
  results.d = d;

  // Permit2 PermitSingle (AllowanceTransfer)
  log('(e) Permit2 PermitSingle');
  const permit2Code = await client.getCode({ address: PERMIT2_ADDRESS });
  const [, , p2Nonce] = await client.readContract({
    address: PERMIT2_ADDRESS,
    abi: PERMIT2_ABI,
    functionName: 'allowance',
    args: [safe, usdc, SPENDER],
  });
  const p2Single = {
    details: { token: usdc, amount: 1_000_000n, expiration: Number(deadline), nonce: Number(p2Nonce) },
    spender: SPENDER,
    sigDeadline: deadline,
  };
  const permit2Typed = {
    domain: { name: 'Permit2', chainId: Number(chainId), verifyingContract: PERMIT2_ADDRESS },
    types: {
      PermitDetails: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint160' },
        { name: 'expiration', type: 'uint48' },
        { name: 'nonce', type: 'uint48' },
      ],
      PermitSingle: [
        { name: 'details', type: 'PermitDetails' },
        { name: 'spender', type: 'address' },
        { name: 'sigDeadline', type: 'uint256' },
      ],
    },
    primaryType: 'PermitSingle',
    message: p2Single,
  } as const;
  const p2DomainSep = await client.readContract({
    address: PERMIT2_ADDRESS,
    abi: PERMIT2_ABI,
    functionName: 'DOMAIN_SEPARATOR',
  });
  const sigE = await signWith(
    passkey,
    safeMessageHashForTypedData({ safe, chainId, typedData: permit2Typed }),
  );
  const sigEStranger = await signWith(
    stranger,
    safeMessageHashForTypedData({ safe, chainId, typedData: permit2Typed }),
  );
  async function simulatePermit2(signature: Hex): Promise<string> {
    try {
      await client.simulateContract({
        account: CALLER,
        address: PERMIT2_ADDRESS,
        abi: PERMIT2_ABI,
        functionName: 'permit',
        args: [safe, { ...p2Single, details: { ...p2Single.details } }, signature],
      });
      return 'ok';
    } catch (error) {
      return `revert: ${(error as Error & { shortMessage?: string }).shortMessage ?? (error as Error).message}`;
    }
  }
  const e = {
    permit2CodeBytes: permit2Code ? (permit2Code.length - 2) / 2 : 0,
    domainSeparatorMatches: domainSeparator({ domain: permit2Typed.domain }) === p2DomainSep,
    verifyTypedData: await client.verifyTypedData({ ...permit2Typed, address: safe, signature: sigE }),
    magic: await magic(hashTypedData(permit2Typed), sigE),
    simulatePermit: await simulatePermit2(sigE),
    simulatePermitStranger: await simulatePermit2(sigEStranger),
    detect: detectSignatureScheme(permit2Typed),
  };
  log('(e)', e);
  results.e = e;

  // 3. eth_sendTransaction / wallet_sendCalls
  if (!hasFlag('--skip-send')) {
    if (!endpoints.paymasterUrl) throw new Error('no paymaster URL (run with --public)');
    for (const [label, calls] of [
      [
        'eth_sendTransaction approve(0)',
        [
          {
            to: usdc,
            data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [SPENDER, 0n] }),
          },
        ],
      ],
      [
        'wallet_sendCalls 2× approve(0)',
        [
          {
            to: usdc,
            data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [SPENDER, 0n] }),
          },
          {
            to: usdc,
            data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [CALLER, 0n] }),
          },
        ],
      ],
    ] as const) {
      log(label);
      const tBuild = Date.now();
      const built = await buildBatchUserOp(pk, calls, endpoints, { sponsored: true });
      const sponsored = await sponsor(pk, built, {
        paymasterUrl: endpoints.paymasterUrl,
        bundlerUrl: endpoints.bundlerUrl,
      });
      const signed = signUserOpWithPasskey(
        sponsored.userOp,
        await passkey.sign(safeOpHash(sponsored.userOp, chainId)),
        pk.owner,
      );
      const tSend = Date.now();
      const response = await sendUserOp(pk, signed, endpoints.bundlerUrl);
      const userOpHash = response.userOperationHash as Hex;
      const statusPending = await getCallsStatus(endpoints.bundlerUrl, userOpHash, chainId);
      const receipt = await waitForReceipt(response, { intervalSeconds: 1 });
      const tReceipt = Date.now();
      const txHash = receipt.receipt.transactionHash as Hex;
      const viemReceipt = await client.waitForTransactionReceipt({ hash: txHash });
      const tViem = Date.now();
      const tx = await client.getTransaction({ hash: txHash });
      const block = await client.getBlock({ blockNumber: viemReceipt.blockNumber });
      const approvals = viemReceipt.logs
        .filter((l) => isAddressEqual(l.address, usdc))
        .map((l) => decodeEventLog({ abi: erc20Abi, data: l.data, topics: l.topics }))
        .filter((ev) => ev.eventName === 'Approval');
      const status = await getCallsStatus(endpoints.bundlerUrl, userOpHash, chainId);
      const out = {
        userOpHash,
        txHash,
        explorer: explorerTxUrl(chainId, txHash),
        buildSponsorSignMs: tSend - tBuild,
        sendToUserOpReceiptMs: tReceipt - tSend,
        viemWaitForTransactionReceiptMs: tViem - tReceipt,
        blockTimestampMinusSendMs: Number(block.timestamp) * 1000 - tSend,
        viemReceiptStatus: viemReceipt.status,
        txFrom: tx.from,
        txTo: tx.to,
        logsInBundleTx: viemReceipt.logs.length,
        usdcApprovalLogs: approvals.map((ev) => ev.args),
        approvalOwnerIsSafe: approvals.every((ev) =>
          isAddressEqual((ev.args as { owner: Address }).owner, safe),
        ),
        statusBeforeInclusion: statusPending.status,
        getCallsStatus: { ...status, receipts: status.receipts?.map((r) => ({ ...r, logs: r.logs.length })) },
      };
      log(label, out);
      results[label] = out;
    }
  }

  log('RESULTS', results);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
