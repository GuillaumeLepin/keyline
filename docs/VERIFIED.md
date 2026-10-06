# VERIFIED — chain facts checked against the installed SDK, the live docs and Base Sepolia

Owner: `account-chain`. Checks 5 Oct 2026 17:00 – 6 Oct 00:10 CEST, against `abstractionkit@0.4.2` (installed in
`packages/chain`), `viem@2.57.3`, RPC `https://sepolia.base.org` (chainId 84532). `cast` = Foundry at `~/.foundry/bin`.

## SPEC corrections needed (orchestrator edits SPEC/CLAUDE.md; I do not)

| # | Where | SPEC says | Verified | Suggested wording |
|---|---|---|---|---|
| 1 | SPEC §0 "SafeWebAuthnSharedSigner / SignerFactory / SignerSingleton (v0.2.0) `0x94a4…` / `0x1d31…` / `0x4E27…`" | labels these v0.2.0 | Those three addresses are the **v0.2.1** set (abstractionkit constant names `DEFAULT_WEB_AUTHN_*_V_0_2_1`, used by `SafeMultiChainSigAccountV1`). The **v0.2.0** set — which `SafeAccountV0_3_0` (EntryPoint v0.7) uses by default and which Candide's deployments page lists — is SharedSigner `0xfD90FAd33ee8b58f32c00aceEad1358e4AFC23f9`, SignerFactory `0xF7488fFbe67327ac9f37D5F722d83Fc900852Fbf`, SignerSingleton `0x270D7E4a57E6322f336261f3EaE2BADe72E68d72`, FCLP256Verifier `0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765`. Both sets have bytecode on Base Sepolia. **Decision: `packages/chain` uses the v0.2.0 set** (zero override drift with `SafeAccountV0_3_0`). | Replace the row with the v0.2.0 addresses above; keep "same on Ethereum Sepolia". |
| 2 | SPEC §0 / STRATEGY §4 "The grace period is read from the contract" | implies a getter | The module stores `uint256 internal immutable recoveryPeriod` — **no getter** (`recoveryPeriod()`, `getRecoveryPeriod()`, `gracePeriod()` all revert). Value confirmed as **180 s** from the deployed runtime bytecode (`PUSH32 0x…b4`; the 3-day instance embeds `0x…3f480` = 259 200 the same way). Once a recovery is executed, `getRecoveryRequest(wallet).executeAfter` is the on-chain readable deadline. | "The grace period is a constructor immutable of the module instance (180 s on the testing instance, verified from bytecode); the UI shows the live `executeAfter` from the contract once a recovery is executed." `recovery.gracePeriodSeconds(module)` exposes the verified value. |
| 3 | SPEC §5 `recovery.gracePeriod() → seconds` | reads chain | Same as #2 — implemented as `gracePeriodSeconds(module)` from a verified table + `status().executeAfter`. | Rename in §5. |
| 4 | SPEC §5 `signUserOpWithPasskey` note "createWebAuthnSignature/formatSignaturesToUseroperationSignature" | ok | Still exported in 0.4.2 and used. 0.4.2 additionally offers `webauthnSignatureFromAssertion` (DER/clientDataJSON → `WebauthnSignatureData`) and the `fromSafeWebauthn` signer adapter. We use `webauthnSignatureFromAssertion` + `createWebAuthnSignature` + `formatSignaturesToUseroperationSignature`. | Add `webauthnSignatureFromAssertion` to the note. |
| 5 | CLAUDE.md pitfall "new owner after recovery = SafeWebAuthnSignerProxy" | ok, but incomplete | Also true for the **first** owner: abstractionkit prepends `factory.createSigner(x,y,verifiers)` + `swapOwner(sharedSigner → proxy)` to the first userOp, so after deployment the Safe is owned by the passkey's proxy, not the shared signer. `isInit = (factory != null)` selects which address the signature names. | Mention it; the Basescan "owners" view will show the proxy address. |
| 6 | Candide docs now recommend `SafeMultiChainSigAccountV1` for new passkey accounts | SPEC pins EP v0.7 + `SafeAccountV0_3_0` | `SafeMultiChainSigAccountV1` is EntryPoint **v0.9** (`0x433709009B8330FDa32311DF1C2AFA402eD8D009`) + Safe4337Module `0x22939E839e3c0F479B713eAF95e0df128554AEAd`. Candide's Base Sepolia bundler serves v0.6/v0.7/v0.8/v0.9. Staying on **v0.7 / `SafeAccountV0_3_0`** as pinned; it is fully supported ("legacy accounts may require SafeAccountV0_3_0"). | No change, note as a conscious choice. |

## 1. abstractionkit 0.4.2 — actual exported names (from `node -e` on the installed package and `dist/index.d.mts`)

| Claim | Verified value | How |
|---|---|---|
| Account class | `SafeAccountV0_3_0` (EP v0.7, Safe4337Module v0.3.0). Statics: `initializeNewAccount(owners: Signer[], overrides?: InitCodeOverrides)`, `createAccountAddress(owners, overrides?)`, `getUserOperationEip712Hash(userOp, chainId, overrides?)`, `getUserOperationEip712Data(...)`, `createWebAuthnSignerVerifierAddress(x, y, overrides?)`, `createDeployWebAuthnVerifierMetaTransaction(x, y, overrides?)`, `formatSignaturesToUseroperationSignature(pairs, options?)`, `createWebAuthnSignature(data)`, `createDummySignerSignaturePairForExpectedSigners(signers, overrides?)`, `createEnableModuleMetaTransaction(module, account)`. Instance: `createUserOperation(txs, providerRpc, bundlerRpc, overrides?: CreateUserOperationV7Overrides)`, `sendUserOperation(userOp, bundlerRpc) → SendUseroperationResponse`, `signUserOperationWithSigners(...)`, `getOwners`, `getThreshold`, `isModuleEnabled`. Defaults: `DEFAULT_ENTRYPOINT_ADDRESS = 0x0000000071727De22E5E9d8BAf0edAc6f37da032`, `DEFAULT_SAFE_4337_MODULE_ADDRESS = 0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226`, `DEFAULT_SAFE_MODULE_SETUP_ADDRESS = 0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47`, `DEFAULT_WEB_AUTHN_PRECOMPILE = 0x0` (**none — must be passed explicitly**). | `node -e "Object.getOwnPropertyNames(require('abstractionkit').SafeAccountV0_3_0)"`; d.ts lines 1120–1400 |
| WebAuthn owner type | `WebauthnPublicKey { x: bigint; y: bigint }`; `Signer = string \| WebauthnPublicKey`; `WebauthnSignatureData { authenticatorData: ArrayBuffer; clientDataFields: string; rs: [bigint, bigint] }`; `SignerSignaturePair { signer; signature; isContractSignature? }` | d.ts 943–960 |
| Assertion → signature helpers | `webauthnSignatureFromAssertion({ authenticatorData, clientDataJSON, signature: DER bytes \| {r,s} }) → WebauthnSignatureData` (added 0.3.5); `fromSafeWebauthn({ publicKey, isInit, getAssertion, accountClass }) → ExternalSigner`; `pubkeyCoordinatesFromJson/ToJson`. Browser `signature` is DER (parsed by the SDK); Node WebCrypto gives raw r‖s, which the test harness splits into `{r, s}`. | d.ts 1797–1824; changelog 0.3.5 |
| Precompile flag | Init: `InitCodeOverrides.eip7212WebAuthnPrecompileVerifierForSharedSigner`; estimation/signing/proxy: `eip7212WebAuthnPrecompileVerifier` (+ `eip7212WebAuthnContractVerifier`). Constant `DEFAULT_SECP256R1_PRECOMPILE_ADDRESS = 0x0000000000000000000000000000000000000100`. Packed into `uint176 verifiers = (precompile low 16 bits << 160) \| contractVerifier` by the SDK. | d.ts 835–890, 1637; index.mjs 5049 |
| Paymaster | `new CandidePaymaster(url)`; `createSponsorPaymasterUserOperation(smartAccount, userOp, bundlerRpc, sponsorshipPolicyId?, context?, overrides?) → { userOperation, sponsorMetadata? }` (object, not tuple — changed in 0.3.3). Also `createTokenPaymasterUserOperation`. | d.ts 1692–1740 |
| Bundler | `Bundler` class; `SendUseroperationResponse.included(timeoutSeconds?, intervalSeconds?) → UserOperationReceiptResult \| null` | d.ts 393–450 |
| `SocialRecoveryModule` | ctor `(moduleAddress = After3Days)`. Methods: `createEnableModuleMetaTransaction(account)`, `createAddGuardianWithThresholdMetaTransaction(guardian, threshold: bigint)`, `createRevokeGuardianWithThresholdMetaTransaction(rpc, account, guardian, threshold)`, `createChangeThresholdMetaTransaction(threshold)`, `createConfirmRecoveryMetaTransaction(account, newOwners, newThreshold: number, execute)`, `createMultiConfirmRecoveryMetaTransaction(account, newOwners, newThreshold, signaturePairList: RecoverySignaturePair[] /* {signer, signature} */, execute)`, `createExecuteRecoveryMetaTransaction(account, newOwners, newThreshold)`, `createFinalizeRecoveryMetaTransaction(account)`, `createCancelRecoveryMetaTransaction()`, `getRecoveryHash(rpc, account, newOwners, newThreshold, nonce)`, `getRecoveryRequest(rpc, account) → { guardiansApprovalCount, newThreshold, executeAfter, newOwners }`, `getRecoveryApprovals`, `hasGuardianApproved`, `isGuardian`, `guardiansCount`, `threshold`, `getGuardians`, `nonce`, `getRecoveryRequestEip712Data(rpc, chainId, account, newOwners, newThreshold, { recoveryNonce? }) → { domain, types, messageValue }`. Enum `SocialRecoveryModuleGracePeriodSelector { After3Minutes: 0x949d…8c66, After3Days: 0x3827…541c, After7Days: 0x088f…33f2, After14Days: 0x9Bac…f25b }`. Constants `EIP712_RECOVERY_MODULE_TYPE`, `EXECUTE_RECOVERY_PRIMARY_TYPE = "ExecuteRecovery"`. | d.ts 720–790; `node -e` |
| Changelog highlights | 0.3.2 `signUserOperationWithSigners` (plural, `ExternalSigner`); 0.3.3 paymaster returns objects; 0.3.5 `fromSafeWebauthn` + `webauthnSignatureFromAssertion`; 0.3.8 Transport abstraction (`string \| Transport \| JsonRpcNode`); 0.4.1 `createMultiConfirmRecoveryMetaTransaction` ABI-encoding fix; latest 0.4.2. | github.com/candidelabs/abstractionkit CHANGELOG.md |

## 2. Addresses on Base Sepolia (bytecode present = `eth_getCode` non-empty)

| Contract | Address | Code size (hex chars) | How |
|---|---|---|---|
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | 32 071 | `cast code` |
| Safe4337Module v0.3.0 | `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226` | 16 747 | `cast code` |
| SafeModuleSetup | `0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47` | 1 095 | `cast code` |
| SafeProxyFactory 1.4.1 | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` | 6 109 | `cast code` |
| SafeL2 1.4.1 singleton | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` | 48 843 | `cast code` |
| MultiSend 1.4.1 | `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526` | used in built userOp | SDK default |
| SafeWebAuthnSharedSigner **v0.2.0** (used) | `0xfD90FAd33ee8b58f32c00aceEad1358e4AFC23f9` | 5 922 | `eth_getCode`; selectors `configure((uint256,uint256,uint176))`=0x0dd9692f, `getConfiguration(address)`, `isValidSignature(bytes32,bytes)` found in code |
| SafeWebAuthnSignerFactory **v0.2.0** (used) | `0xF7488fFbe67327ac9f37D5F722d83Fc900852Fbf` | 4 736 | `eth_getCode` |
| SafeWebAuthnSignerSingleton **v0.2.0** (used) | `0x270D7E4a57E6322f336261f3EaE2BADe72E68d72` | 4 528 | `eth_getCode` |
| FCLP256Verifier v0.2.0 (fallback verifier) | `0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765` | in initializer | SDK default |
| SharedSigner / Factory / Singleton **v0.2.1** (SPEC's addresses, not used) | `0x94a4F6affBd8975951142c3999aEAB7ecee555c2` / `0x1d31F259eE307358a26dFb23EB365939E8641195` / `0x4E27b51350e6c2083EE19011120F50DAfEc5CA50` | 5 909 / 4 287 / 4 493 | `cast code`; factory selectors `createSigner(uint256,uint256,uint176)`=0x0d2f0489, `getSigner(...)`=0xa541d91a, `isValidSignatureForSigner(...)`=0xcb48798b present |
| P-256 precompile (RIP-7212) | `0x0000000000000000000000000000000000000100` | `0x` (precompile, no code — expected) | `cast code` |
| SocialRecoveryModule 3-min | `0x949d01d424bE050D09C16025dd007CB59b3A8c66` | 27 213 | `cast code`; `NAME()`="Social Recovery Module", `VERSION()`="0.0.1", `domainSeparator()`=`0x481e2a757defa5514cf76db923b9a4356d7e1875465c42bd79136e38f4e81675` |
| SocialRecoveryModule 3-day | `0x38275826E1933303E508433dD5f289315Da2541c` | 27 248 | `eth_getCode` |
| USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | 3 597 | `symbol()`="USDC", `decimals()`=6 |
| chainId | 84532 | — | `cast chain-id` |

Grace period: `recoveryPeriod()` / `getRecoveryPeriod()` / `RECOVERY_PERIOD()` / `gracePeriod()` / `delay()` all **revert** (no getter; `uint256 internal immutable recoveryPeriod`). Runtime bytecode of the 3-min instance contains exactly one `PUSH32 0x…00b4` (= **180**); the 3-day instance contains one `PUSH32 0x…03f480` (= 259 200) — same pattern, confirming the immutable. The runtime bytecode of `0x949d…8c66` is byte-identical on Base Sepolia and Ethereum Sepolia (sha256 prefix `57e616be95a107ae` on both), and Sourcify holds an **exact match** of the source for Ethereum Sepolia / OP Sepolia / Arbitrum Sepolia (not indexed for 84532). Source saved at `scratchpad/SocialRecoveryModule.deployed.sol` during the session (compiler 0.8.20).

## 3. THE key question — signature-based `multiConfirmRecovery` from EOA guardians

**Yes.** Verified from the deployed source (Sourcify exact match for the identical bytecode) and the selectors present in the Base Sepolia bytecode.

| Claim | Verified value |
|---|---|
| `confirmRecovery(address _wallet, address[] _newOwners, uint256 _newThreshold, bool _execute)` (selector `0x064e2d0e`) | `require(isGuardian(_wallet, msg.sender))` — **the caller must be the guardian** (EOA guardians like sq-guardian call it themselves and pay gas). |
| `multiConfirmRecovery(address _wallet, address[] _newOwners, uint256 _newThreshold, SignatureData[] _signatures, bool _execute)` (selector `0x0728e1e7`), `SignatureData { address signer; bytes signature }` | **No `msg.sender` restriction — anyone (the bank relayer) can submit.** For each entry: if `signature.length == 0` → `require(isGuardian(_wallet, msg.sender)) && require(msg.sender == value.signer)` ("empty slot = msg.sender confirms"); else `validateGuardianSignature(_wallet, recoveryHash, signer, signature)` = `require(isGuardian(_wallet, _signer))` + `SignatureChecker.isValidSignatureNow(_signer, _signHash, _signature)` (OpenZeppelin: 65-byte ECDSA for EOAs **or** ERC-1271 for contract guardians). Then `require(value.signer > lastSigner, "SM: duplicate signers/invalid ordering")` → **signatures must be sorted strictly ascending by signer address**. Each confirmation is stored (`confirmedHashes[recoveryHash][signer] = true`). If `_execute`: `require(getRecoveryApprovals(...) >= threshold)` then `_executeRecovery` (starts the grace period, `executeAfter = now + recoveryPeriod`). |
| Nonce | `getRecoveryHash(wallet, newOwners, newThreshold, nonce(wallet))` — the nonce is read on-chain inside the call; signers must sign with the current `nonce(wallet)` (`0x70ae92d2`). A finalized or cancelled recovery bumps it. |
| Recovery hash = EIP-712 | domain `{ name: "Social Recovery Module", version: "0.0.1", chainId, verifyingContract: <module> }`; primary type `ExecuteRecovery(address wallet,address[] newOwners,uint256 newThreshold,uint256 nonce)`; typehash `0x124b64921a7c7e677c6cc3b132eaaa57130bc6fc05ab157f35fe5264a7c198d5` (= `cast keccak` of the type string). Computed domain separator with `cast` = on-chain `domainSeparator()` = `0x481e2a75…e81675`. **Spike check: viem `hashTypedData(recoveryTypedData(...))` == on-chain `getRecoveryHash(...)` for a fresh wallet (`0xb98782e7…a997`, equal: true).** abstractionkit's `getRecoveryRequestEip712Data` uses the same domain (version "0.0.1"). The GitHub `main` source is a newer **0.2.0** (adds a `_nonce` parameter to confirm/multiConfirm) — **not** what is deployed; do not use it. |
| `cancelRecovery()` (`0x0ba234d6`) | `whenRecovery(msg.sender)` — called **by the Safe** (owner userOp) → `buildCancelRecoveryUserOp`. |
| `finalizeRecovery(address)` (`0x315a7af3`) | anyone, after `executeAfter`. `executeRecovery(address,address[],uint256)` (`0xb1f85f69`) anyone, once approvals ≥ threshold. |
| `addGuardianWithThreshold(address,uint256)` (`0xbe0e54d7`) | called by the Safe; `require(_threshold ≤ guardian count)` after the add, guardian ≠ owner of the Safe. So the three adds use thresholds **1, 2, 2** (implemented in `protectTransactions`). |

**Recommended path for F3 step 3 (Safety key / Emergency card):** the laptop (Safety key EOA, viem `privateKeyToAccount`) and the Emergency card EOA sign `recoveryTypedData({ wallet, newOwners: [newPasskeySignerProxy], threshold: 1n, nonce: await recoveryNonce(...), chainId, module })` with `account.signTypedData(typedData)`. The bank relayer calls `recovery.confirmWithSignatures({ client: relayerWalletClient, module, wallet, newOwners, threshold, signatures: [{signer, signature}, ...], execute: true })` — it sorts ascending and sends `multiConfirmRecovery`. sq-guardian (own process, own key) uses `recovery.confirmAsGuardian(...)` (direct `confirmRecovery`) or its signature can be relayed the same way. Mixed is fine: approvals accumulate per `recoveryHash` across both functions. `--without-bank`: the two client EOAs call `multiConfirmRecovery` themselves (any funded EOA as sender, e.g. the Emergency card with `signature: 0x` for itself + the Safety key's signature).

## 4. `eth_simulateV1` on `https://sepolia.base.org`

| Claim | Verified value | How |
|---|---|---|
| Supported (raw) | **Yes** — a `blockStateCalls` request with `traceTransfers: true` returned a simulated block (`result[0].hash/parentHash/miner 0x42…11…`) at 17:11 CEST. (Orchestrator saw the same at 15:08.) | raw JSON-RPC via `curl` |
| Supported (viem `simulateCalls`, `traceAssetChanges: true`) | **Yes** — 6 Oct 00:00 CEST, `simulate({ client, from: Safe 0x2eac…0dea, calls: [USDC.transfer(funder, 1 USDC)], tokens: [USDC] })` answered in **454 ms** with `assetChanges = [ETH 0→0, USDC 0→0 (symbol/decimals discovered by viem)]` and `results[0] = { status: 'failure', gasUsed: 36176, data: Error("ERC20: transfer amount exceeds balance") }` → normalised `{ ok: false, provider: 'eth_simulateV1', revertReason: 'ERC20: transfer amount exceeds balance', gasEstimate: '36176' }`. viem's wrapper issues ONE `eth_simulateV1` with 4 extra `blockStateCalls` (balance / `balanceOf` / `decimals` / `symbol` discovery), all honoured by the node. | `packages/chain/src/simulate.ts` (`simulate`), live vitest `simulate.test.ts` |
| Fallback | A dead RPC (`http://127.0.0.1:9`, `retryCount: 0`) → `{ provider: 'fallback', simulated: true, ok: true, assetChanges: [], decodedCalls, gasEstimate: 90000 × calls }` in < 1 s; the 8 s `withTimeout` race covers a hanging RPC. For a plain ERC-20 `transfer` the fallback tries `balanceOf(from)` (3 s cap) and reports `before = balance, after = before − amount`. | `simulate.test.ts` "dead RPC → fallback" |
| Output shape | Parses with `SimulationSchema` / `DecodedCallSchema` from `@keyline/shared` (asserted in the tests): `assetChanges[].token` is checksummed, ETH is viem's `0xEeee…EEeE` pseudo-address, `before/after` unsigned base-unit strings, `delta` signed. | `SimulationSchema.parse(result)` in both live tests |

### 4b. `decodeCalls` table (`simulate.test.ts`, 15 rows + helpers, all pure viem `decodeFunctionData`)

| Call | `fn` | risk | humanText |
|---|---|---|---|
| USDC `transfer(alice, 1e6)` | `transfer(address,uint256)` | none | `Send 1 USDC to 0x482B…458A` |
| USDC `transfer(alice, 1 250 000)` | same | none | `Send 1.25 USDC to 0x482B…458A` |
| USDC `approve(dapp, 2^256−1)` or `≥ 2^255` | `approve(address,uint256)` | **danger** | `This lets 0x1111…1111 spend an unlimited amount of USDC — we recommend a cap` |
| USDC `approve(dapp, 100e6)` | same | warn | `Allow 0x1111…1111 to spend up to 100 USDC on your behalf` |
| USDC `approve(dapp, 0)` | same | none | `Revoke 0x1111…1111's permission to spend your USDC` |
| USDC `transferFrom(safe, alice, 5e6)` | `transferFrom(address,address,uint256)` | warn | `Move 5 USDC from 0x2eac…0dea to 0x482B…458A using an existing allowance` |
| USDC `permit(…, ∞, ∞ deadline, …)` | `permit(address,address,uint256,uint256,uint8,bytes32,bytes32)` | **danger** | `This signed permit lets … spend an unlimited amount of USDC with no expiry — we recommend a cap` |
| ERC-721/1155 `setApprovalForAll(op, true)` | `setApprovalForAll(address,bool)` | **danger** | `This lets 0x1111…1111 move every item you hold in the collection at 0x2222…2222 — only continue if you trust them` |
| `setApprovalForAll(op, false)` | same | none | `Revoke 0x1111…1111's access to your items in the collection at 0x2222…2222` |
| unknown selector `0xdeadbeef` | `unknown` | warn | `Unknown action on 0x1111…1111` |
| `{ to: alice, value: 0.5 ETH, data: 0x }` | `eth-transfer` | none | `Send 0.5 ETH to 0x482B…458A` |
| Safe `enableModule(known Candide recovery module)` | `enableModule(address)` | none | `Turn on recovery for this wallet` |
| Safe `enableModule(anything else)` | same | **danger** | `This gives 0x… full control over your wallet — only continue if you know exactly what it is` |
| unknown ERC-20 `transfer(alice, 42)` | `transfer(address,uint256)` | none | `Send 42 units of the token at 0x1111…1111 to 0x482B…458A` |
| factory `createSigner(x, y, verifiers)` | `createSigner(uint256,uint256,uint176)` | none | `Register your passkey as an on-chain signer` |

Also decoded: `swapOwner`, `addGuardianWithThreshold`, `cancelRecovery`, ERC-721 `safeTransferFrom`. `suggestedApprovalCap(call, '100')` re-encodes an unlimited `approve` as `approve(spender, 100 USDC)` (same `to`, same spender; decodes as `warn`). `worstRisk(decoded)` = header colour. Known tokens: USDC Base Sepolia `0x036C…CF7e`, USDC Ethereum Sepolia `0x1c7D…7238` (6 decimals) — pass `decode.tokens` for others.

## 5. Candide endpoints (Base Sepolia)

| Claim | Verified value | How |
|---|---|---|
| Authenticated URL template (bundler **and** paymaster, one URL) | `https://api.candide.dev/api/v3/84532/<API_KEY>` → paste the same value into `BANK_CANDIDE_BUNDLER_URL` and `BANK_CANDIDE_PAYMASTER_URL`, key into `BANK_CANDIDE_API_KEY`. Older `/bundler/v3/<chain-name>` and `/paymaster/v3/<chain-name>` forms are deprecated. `POST /api/v3/84532/` with an empty key → 404. | docs.candide.dev/wallet/api/authenticated-endpoints |
| Public URL (no key, per-IP rate limit) | `https://api.candide.dev/public/v3/84532` — `eth_chainId` → `0x14a34`; `eth_supportedEntryPoints` → v0.9 `0x4337…009`, v0.8 `0x4337…108`, **v0.7 `0x…71727De…a032`**, v0.6 `0x5FF1…2789`; `pm_supportedEntryPoints` lists the same four. **Sponsorship works on the public endpoint:** `createSponsorPaymasterUserOperation` returned paymaster `0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba`, sponsor "Trilema" (19:36 CEST). Use for dev / as fallback until the key arrives; the bank service should use the authenticated URL. | `curl`; spike run with `--public` |
| Rate limit | authenticated: "scaled to your plan"; public: unspecified per-IP `Too Many Requests`. `waitForReceipt` polls every 3 s (≤ 10 req/s). | docs |

## 6. New-passkey signer proxy (after recovery)

| Claim | Verified value |
|---|---|
| Address | `SafeAccountV0_3_0.createWebAuthnSignerVerifierAddress(x, y, { eip7212WebAuthnPrecompileVerifier: 0x100, eip7212WebAuthnContractVerifier: 0x445a…, webAuthnSignerFactory: 0xF748…, webAuthnSignerSingleton: 0x270D… })` — CREATE2 over the proxy creation code; exported as `passkeySignerAddress(owner)`. Cross-check on-chain: `factory.getSigner(x, y, verifiers)` with `verifiers = (0x0100 << 160) \| 0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765` (`recovery.signerAddressFromFactory`). |
| Deployment | `SafeAccountV0_3_0.createDeployWebAuthnVerifierMetaTransaction(x, y, {...})` → `{ to: factory, data: createSigner(x,y,verifiers) }` — a plain tx anyone (relayer) can send; idempotent (`recovery.deploySignerProxy` skips when code exists). The proxy must exist before the new passkey's first userOp (the Safe calls `owner.isValidSignature`); deploy it right after the new-phone passkey is created, before `multiConfirmRecovery`. `newOwners = [proxy]`, `newThreshold = 1`. |
| Same mechanism on day 0 | The first userOp of a new Safe already does `createSigner` + `swapOwner(sharedSigner → proxy)` (SDK, automatic), visible in the built callData of the spike (`0x0d2f0489 …` then `0xe318b52b 0x…01, 0xfD90…, <proxy>`). |

## 7. Balances (`pnpm --filter @keyline/scripts check-balances`, 19:14 CEST)

All five EOAs are at **0 ETH**, funder at **0 USDC** — nothing funded yet. Minimums: 0.05 ETH guardians/relayer, 0.02 ETH + 10 USDC funder, verdict signer nothing. Faucets printed by the script (Coinbase CDP, Superchain, thirdweb, Circle). Sponsored userOps do not need these; recovery confirm/execute/finalize by EOAs and the signer-proxy deployment do.

## 8. Spike state (`pnpm --filter @keyline/scripts spike:create-and-send [--public]`)

- Without a key: builds the counterfactual Safe, verifies recovery-hash parity, estimates gas on the public bundler (callGasLimit 385 565, verificationGasLimit 695 243, preVerificationGas 71 798 for deploy + createSigner + swapOwner + enableModule + 3 × addGuardian), prints the userOp, exits 2 with `BLOCKED: BANK_CANDIDE_API_KEY missing`.
- With `--public` (19:40 CEST) — **Gate 1 create + protect done on Base Sepolia**: Safe `0x39ECE2fA9262408426E78c71A9dED95ddD42967D` deployed, recovery module enabled, guardians `[0x01Bb…4dE8 (sq), 0xd8f4…302d (emergency card stand-in), 0xCA70…89cF (safety key stand-in)]`, threshold 2, in ONE sponsored userOp signed by the test passkey over the SafeOp hash `0x3b8d5737…2574`. userOpHash `0x6687cca91a37fd0c1dc4ea2dca3a7526af259c3416e16fcb05b381541327f1ba`, tx <https://sepolia.basescan.org/tx/0x61a472d198e026cb4d3dd1f1b8f02803ccf8cc105002593c9b7de4f8c5cff4d5>, **actualGasUsed 873 505** (deploy + createSigner + swapOwner + enableModule + 3 adds; paymaster Trilema `0x8b1f…75ba`). Owner after the op = signer proxy `0xF1c393d2747dB731f3ff22BbDd8Da25e65a3c3A1`. USDC transfer skipped (no test USDC yet) — re-run with `--keyfile` once the Safe holds ≥ 1 USDC.
- Test-only passkey: Node WebCrypto ECDSA P-256; `authenticatorData` = SHA-256("localhost") ‖ flags 0x05 ‖ counter; `clientDataJSON` = `{type:"webauthn.get", challenge: base64url(SafeOp hash), origin}`; signature handed to abstractionkit as `{r, s}` (WebCrypto's raw r‖s split in two — not DER parsing). Never shipped to the app.

---

# Wave 1 (5 Oct 2026, 19:40–20:30 CEST) — callData parity, ERC-1271 attestation, recovery with zero ETH

## 9. `encodeCallData` / `decodeCallData` / `getUserOpStatus` (`packages/chain/src/account.ts`)

| Claim | Verified value | How |
|---|---|---|
| `encodeCallData(txs)` equals `buildUserOp(...).callData` | Yes for 1 tx (`executeUserOpWithErrorString`, selector `0x541d63c8`) and 3-tx batches (delegatecall to MultiSend 1.4.1 `0x3886…B526`, `multiSend(bytes)` `0x8d80ff0a`) — both go through `SafeAccountV0_3_0.createAccountCallData{Single,Batch}Transactions`, exactly what `createUserOperation` calls internally. | `packages/chain/src/account.test.ts` (live nonce read on Base Sepolia against the Gate 1 Safe `0x39EC…967D`) |
| First (init) userOp | abstractionkit prepends `factory.createSigner` + `swapOwner(0x1, sharedSigner, proxy)`; `encodeCallData([...initOwnerTransactions(owner, safe), ...protectTxs])` equals the built callData. The bank uses this to verify the create+protect op. | same test |
| `decodeCallData` | Inverse: outer `decodeAccountCallData` (SDK) + MultiSend packed layout `op(1)‖to(20)‖value(32)‖len(32)‖data`; round-trips value ≠ 0 and empty data. | same test |
| `getUserOpStatus(bundlerUrl, hash)` | One `eth_getUserOperationReceipt` via `Bundler` → `pending` (null) / `included` (success) / `failed`; returns `txHash`, `blockNumber`, `actualGasUsed`. | used by `scripts` only via `waitForReceipt`; manual call on the Gate 1 hash returns `included` |

## 10. ERC-1271 ownership attestation (`packages/chain/src/attestation.ts`) — **proven on-chain**

| Claim | Verified value |
|---|---|
| Fresh test Safe (keyfile `data/test-keyfile.json`, git-ignored) | Safe **`0x2eac8081f2c00f526369AabB7492abE2ec280dea`**, owner = signer proxy `0xed28eBf172551f6CA1392A5e6A71f505096BbE2b`; guardians `[sq 0x01Bb…4dE8, emergency 0x745C…1926, safety 0x52da…0f56]`, threshold 2. Create+protect tx <https://sepolia.basescan.org/tx/0xf317b51d0f9b3932eb2ddcc1f113ae0e3e3e90de6ea3309cdee7a5d9637785c3> (actualGasUsed 874 430, sponsor Trilema via the public Candide endpoint). |
| What the passkey signs | Safe 1.4.1 `CompatibilityFallbackHandler.isValidSignature(bytes32 dataHash, bytes sig)` wraps `dataHash` as `SafeMessage(bytes message)` with `message = abi.encode(dataHash)` under the Safe's own domain `{chainId, verifyingContract: safe}`, then `checkSignatures(messageHash, messageData, sig)`; a v=0 contract signature makes the Safe call `proxy.isValidSignature(messageData, webauthnSig)`, and the proxy hashes `messageData` → the WebAuthn challenge is `keccak256(messageData)` = `hashTypedData(SafeMessage)` = **`attestationChallenge(fields)`**. abstractionkit's `getSafeMessageEip712Data` is the same wrapper but over `hashMessage(string)` (EIP-191), so it is not used; its `SAFE_MESSAGE_MODULE_TYPE` constant is. |
| Signature bytes | `attestationSignatureFromPasskey(assertion, owner)` = `buildSignaturesFromSingerSignaturePairs([{signer:{x,y}, signature: createWebAuthnSignature(webauthnSignatureFromAssertion(assertion))}], {isInit:false, …overrides})` → 417 bytes: `r = proxy address, s = 0x41 (offset), v = 0`, then `uint256 len ‖ abi.encode(authenticatorData, clientDataFields, [r, s])`. The Safe4337Module `0x00 ‖ validAfter ‖ validUntil` prefix (what `formatSignaturesToUseroperationSignature` adds) is deliberately absent — Safe's `isValidSignature` wants the bare signature. |
| Live result (`pnpm --filter @keyline/scripts spike:attestation --keyfile ../data/test-keyfile.json`, 19:44 CEST) | digest `0xea676567…6d30`, challenge `0xabaaf4e2…8efb`, viem `verifyTypedData({address: safe})` → **`ok: true`**; raw `eth_call isValidSignature(digest, sig)` → **`0x1626ba7e`**; another passkey signing the same challenge → `ok: false`; same signature with a tampered nonce → `ok: false`. The signature is pinned as a fixture in `attestation.test.ts` (live ERC-1271 test). |
| ERC-6492 | Not needed: the attestation is signed after deployment (SPEC F1.6). Production refinement for counterfactual Safes only. |

## 11. Recovery with ZERO ETH — Candide-sponsored relayer Safe (`packages/chain/src/relayer.ts`)

| Claim | Verified value |
|---|---|
| Problem | All gas EOAs (sq-guardian, partner, relayer, funder) hold 0 ETH (`pnpm --filter @keyline/scripts fund-guardians`, 20:05 CEST → exit 2 with faucet list). |
| Solution | `sponsoredRelayer({ ownerPrivateKey, endpoints })` = an EOA-owned `SafeAccountV0_3_0` whose userOps are Candide-sponsored; `sendTransaction({to, data, value})` builds → sponsors → `signUserOperation([ownerKey])` → sends → waits for inclusion → returns the tx hash. Relayer Safe for `BANK_RELAYER_PRIVATE_KEY` (`0x11a2…F8a9`): **`0x8Fadb595e6f3b59123c7A20c2c895C697816361a`** (deployed by its first sponsored userOp). `recovery.confirmWithSignatures / finalize / executeRecovery / confirmAsGuardian / deploySignerProxy` take `client: Submitter = viem WalletClient \| TxSubmitter`. |
| msg.sender rules (from the deployed module source, §3) | `multiConfirmRecovery` with non-empty signatures: any sender ✔ (relayer Safe). `finalizeRecovery`, `executeRecovery`, factory `createSigner`: any sender ✔. `confirmRecovery`: `msg.sender` must be the guardian ✘ for a relayer Safe (unless that Safe IS the registered guardian). |

## 12. Gate 2 — recovery executed → finalized, and executed → cancelled, **all with 0 ETH on every EOA**

Command: `pnpm --filter @keyline/scripts spike:recovery --public --keyfile ../data/test-keyfile-recovery.json [--mode finalize|cancel]`. Submitter auto-selected = **sponsored relayer Safe `0x8Fadb595e6f3b59123c7A20c2c895C697816361a`** (relayer EOA `0x11a2…F8a9` at 0 ETH). Paymaster Trilema `0x8b1f…75ba` via the public Candide endpoint.

| Step | Result (Base Sepolia) |
|---|---|
| Test Safe | **`0x10b6b8542f734863C6b90703e522B22DF19f1628`**, created+protected 19:48 CEST: <https://sepolia.basescan.org/tx/0xfbf4ce024e7f75b5c94101c799e4466d90dd4e5a0b2081fa017170e1480ea6d1>. Owner before = proxy `0x2C7399327f5CC72e81AC0D8c4E28A2bCc9FB0D42`; guardians `[sq 0x01Bb…4dE8, emergency 0xBb16…E3a2, safety 0x98dC…BfE0]`, threshold 2. |
| (a) new passkey → `deploySignerProxy` via the relayer Safe (first sponsored userOp also deployed the relayer Safe) | proxy **`0xf84BB12E76De0Ba23b30A8093a1cf73Ddc097b45`** <https://sepolia.basescan.org/tx/0x188117528b18dc27a44355cb7863a63563775af48fb59c9cf1617f4d69c3af7f> |
| (b) Safety key + Emergency card `signTypedData(ExecuteRecovery)` (recoveryHash `0xa0ed3b54…5e63` = on-chain `getRecoveryHash`, nonce 0) → relayer Safe `multiConfirmRecovery(execute=true)` | <https://sepolia.basescan.org/tx/0xb53f58a60c2202e499d9ed130b2fe56a328f2a6b885ee15f9190a5c0a2ef26e5> → `status()`: `pending: true, approvals: 2, executeAfter: 2026-10-05T17:51:58Z, newOwners: [0xf84B…7b45], newThreshold: 1` |
| (c) wait 180 s (polled `executeAfter` vs block timestamp) → relayer Safe `finalizeRecovery` | <https://sepolia.basescan.org/tx/0xcad741a3c66c039b28b41696492026839921ff5d13d7358207126cbecd51b874> → **`getOwners() = [0xf84BB12E76De0Ba23b30A8093a1cf73Ddc097b45]`** (old proxy gone), `pending: false`. The new passkey then signed an attestation that verified via ERC-1271 (`ok: true`) — control proven without any further tx. |
| (d) second run, `--mode cancel`: execute again (another new passkey, proxy <https://sepolia.basescan.org/tx/0x131b6d7c2f85051c3939c2b5c5e0e8d5953bb10fb59336ad9b064599bbcba235>, `multiConfirmRecovery(execute=true)` <https://sepolia.basescan.org/tx/0x45b0bed022ffb14c66f0012612bfd393590e4b43cb145a36ed7cef250ad57b35>, `executeAfter 17:56:26Z`) → **owner passkey sends a sponsored `cancelRecovery()` userOp** (`buildCancelRecoveryUserOp`, actualGasUsed 198 525) | <https://sepolia.basescan.org/tx/0xebb4bf7031ad65b33f64aac2a34e83908ca52443ec1168bd15a8fb1d9c12b02d> → `pending: false`, owners unchanged. (This run happened on Safe `0x4d58e3df70Dc885F1D150CC78D74D6bD96d100d6`, created by the same recovered passkey — harness bug, see below — then re-run on `0x10b6…1628`, §12b.) |
| Nonce behaviour (correction to §3) | `nonce(wallet)` is bumped when the recovery is **executed** (0 → 1 right after `multiConfirmRecovery(execute=true)`), not at finalize/cancel. Guardian signatures must therefore be collected against the current nonce *before* execution; signatures for an executed request cannot be replayed. |
| Harness lesson | After a recovery the Safe address can no longer be derived from the current passkey (`createPasskeyAccount` would give a new counterfactual Safe). The keyfile now records `safe` and the spikes use `loadPasskeyAccount(safe, owner)`. The same applies to the wallet app: store the Safe address at creation, never re-derive it from the live passkey. |

### 12b. Cancel path re-run on the recovered Safe `0x10b6b8542f734863C6b90703e522B22DF19f1628` (keyfile with `safe` recorded; owner = recovered passkey proxy 0xf84B…7b45)

| Step | Tx |
|---|---|
| new passkey proxy (relayer Safe, sponsored) | <https://sepolia.basescan.org/tx/0xbc2f43a0d6a0d60b9daaa890897ed804e4cce43ada05b11e60eb920b260dcb64> |
| Safety key + Emergency card → relayer Safe `multiConfirmRecovery(execute=true)` | <https://sepolia.basescan.org/tx/0xc612a175a1e03f0cfee7de3a028a3e4c2112cddb8486c0a9fc89f618ff78ebc1> → `executeAfter 2026-10-05T17:57:22.000Z` |
| owner (recovered passkey) sponsored `cancelRecovery()` userOp | <https://sepolia.basescan.org/tx/0x5ba3e0db186f726f04c14c46211a52d37eec486d79418a1880ab3ceef0a931f9> → `pending: false`, owners unchanged `[0xf84B…7b45]` |

Three sponsored relayer userOps + three owner userOps in this wave, all paid by the Candide testnet sponsor; no EOA spent a wei. Public endpoint rate limit was never hit (≤ 1 req / 3 s polling).

## 13. Recommendation — sq-guardian when the EOAs never get ETH

Two workable options, both using only `multiConfirmRecovery` (no `confirmRecovery`, which needs `msg.sender == guardian`):

| Option | How | Pros | Cons |
|---|---|---|---|
| **A (recommended)** sq-guardian **signs**, the bank relayer **submits** | sq-guardian keeps its EOA key as the on-chain guardian (already in the guardian set of every Safe). It signs `recoveryTypedData(...)` with `GUARDIAN_PRIVATE_KEY` (`account.signTypedData`, 65-byte ECDSA — exactly what the module's `SignatureChecker` accepts for EOAs) and returns `{signer, signature}` to the bank; the bank relayer (sponsored relayer Safe today, plain EOA once funded) submits ONE `confirmWithSignatures({ signatures: [sq, safetyKey], execute: true })`. Approvals accumulate per `recoveryHash`, so sq's signature can also be submitted alone first (`execute: false`) to show "1 of 2" on the desk. | Zero changes to the guardian set, zero ETH anywhere, same code path when ETH arrives; the guardian key never leaves the sq-guardian process (it only emits a signature). Custody claim unchanged: the on-chain guardian is still the sq EOA. | sq-guardian no longer "sends its own tx" — the bank relays it. Separation of duties is preserved cryptographically (the bank cannot forge sq's signature), but the sq process has no tx hash of its own until the relayed tx lands (the bank returns it). |
| B sq-guardian owns its **own sponsored Safe** that is the on-chain guardian | Register `sponsoredRelayer({ ownerPrivateKey: GUARDIAN_PRIVATE_KEY }).address` as the guardian at create+protect; sq-guardian then calls `confirmAsGuardian({ client: relayerSafe })` itself (`msg.sender` = its Safe = the guardian). | sq-guardian submits its own transaction, no bank in the loop. | The guardian set changes (a Safe instead of an EOA; existing test Safes must be redeployed); the guardian Safe needs the Candide sponsorship URL inside the guardian process (today the public endpoint; in prod a second API key); ERC-1271 path for `multiConfirm` signatures becomes more complex. |

Go with **A**. Only the Safety key / Emergency card flow (F3 step 3) and sq's confirmation differ in *who signs*, not in *how it is submitted*. If ETH arrives, switch `pickSubmitter` to the EOA (`eoaSubmitter(walletClient)`) — nothing else changes. `confirmRecovery` by a funded sq EOA remains available via `confirmAsGuardian` for the "guardian sends its own tx" narrative.

## 14. Wave 3 — `pnpm keyline recover --without-bank` (F5 exit hatch) proven live, plus Gate 1 USDC leg re-check

Command (no bank, no guardian service, no Keyline server running — only the RPC and Candide's public testnet sponsor):

```
pnpm keyline recover --without-bank --safe 0x17049195C25b075c224AA05368287832F6d678c6 \
  --safety-key ../data/safety-key-cli.json --emergency-card 0x<card hex> \
  --new-passkey ../data/test-keyfile-cli-newphone.json --finalize --public
pnpm keyline guardians --safe <addr>          # "verify yourself": owners, guardians, threshold, pending request, Basescan link
pnpm keyline status    --safe <addr>
```

| Step (6 Oct 2026, 00:02–00:08 CEST) | Result (Base Sepolia) |
|---|---|
| Fresh Safe (`spike:create-and-send --public --keyfile ../data/test-keyfile-cli.json`) | **`0x17049195C25b075c224AA05368287832F6d678c6`**, owner = proxy `0xc86D…30Fe`; guardians `[sq 0x01Bb…4dE8, emergency 0xe5E3…4DA1, safety 0x8FA5…edcd]`, threshold 2. Create+protect <https://sepolia.basescan.org/tx/0x1d3bdd5dfba562014e645d5862e61dbd66e0b62557df1558be11b799d986f3b4> (actualGasUsed 875 589, sponsor Trilema). |
| `keyline guardians` before | owners `[0xc86D…30Fe]`, guardians as above, `2 of 3`, pending `none`, link `…/address/<module>#readContract → getGuardians(<safe>)`. |
| Submitter chosen by the CLI | Emergency card EOA 0 ETH, Safety key EOA 0 ETH → **sponsored relayer Safe `0xB303a9E0581104EC1E2DbC2662d891c5552fe106` owned by the Safety key** (Candide public sponsor). With ETH on either EOA the CLI uses it directly (`eoaSubmitter`, threshold 0.0003 ETH). In production the client pays gas from any funded account — the sponsor is a testnet convenience, not a dependency. |
| (a) new passkey (`--new-passkey`, test keyfile created on the fly) → signer proxy deployed by the relayer Safe (its first sponsored userOp also deployed the relayer Safe) | proxy **`0xfe9532EB16eED4d9d77FA727509494658D3a89C5`** <https://sepolia.basescan.org/tx/0x23bd6357244f523c4fa744bf6aebc57e35a94f000c46ed07bf731444160fb497> |
| (b) Safety key + Emergency card `signTypedData(ExecuteRecovery)` (recoveryHash `0x5678f8d8…dc96` = on-chain, nonce 0) → `multiConfirmRecovery(execute=true)` | <https://sepolia.basescan.org/tx/0x7f7254b7ca8b5ced992d042052aeadb0d9302b9616bc588e7be1570dc3ae75cd> → approvals 2, **`executeAfter 2026-10-05T22:06:28Z`** (printed as "finishes at 06/10/2026 00:06:28"), grace 180 s. |
| second invocation without `--finalize` while pending | prints the pending request and `next step: re-run this command after 06/10/2026 00:06:28 (in 72 s), or add --finalize to wait here` — exit 0, no tx. `keyline status` shows `nonce: 1`, `pendingRecovery {…}`. |
| (c) `--finalize`: polled block timestamp vs `executeAfter` → `finalizeRecovery` by the relayer Safe | <https://sepolia.basescan.org/tx/0xfad34f525dd19f01862aa581c0227c9ee7673288b9ae8d81e490c90cb28a16c8> → **`getOwners() = [0xfe9532EB16eED4d9d77FA727509494658D3a89C5]`**, threshold 1. `RESULT: RECOVERED — your new key owns the wallet. Swissquote was not involved.` |

Safety-key file format — **decision**: the prototype reads the plain JSON the wallet's "Export Safety key" writes,
`{ "address": "0x…", "privateKey": "0x…" }`, mode 0600 (the CLI checks `address` matches `privateKey`). No keystore
library is installed in the workspace (`node_modules/.pnpm` has `@scure/bip32|bip39|base` only — no EIP-2335 / Web3
Secret Storage implementation, and `viem` ships none), and a hand-rolled AES-GCM/PBKDF2 would violate "no homemade
crypto". Production: EIP-2335 / Web3 keystore v3 (scrypt + AES-128-CTR) via `ethereum-cryptography`/`@ethereumjs/wallet`
— the F5 screen says "password-encrypted JSON"; mark the export as **prototype: plain JSON** until that package is added.
The Emergency card is the 32-byte hex on the card itself (`--emergency-card 0x…`).

Gate 1 USDC leg re-check (6 Oct 00:01 CEST): bank funder `0x482B…458A` still holds **0 USDC and 0 ETH**; the Safe
`0x1704…78c6` holds 0 USDC → `spike:create-and-send` printed `USDC transfer skipped … https://faucet.circle.com`. The
sponsored transfer leg (`buildTransferUserOp` → `signSponsorSend`) is unchanged and runs automatically once ≥ 1 USDC
is on the Safe (same `--keyfile`); the live `eth_simulateV1` test above exercises the same `transfer` calldata.

Quality (6 Oct 00:10): `packages/chain` typecheck clean, vitest 46/46 (5 files, incl. the live `eth_simulateV1` and
the live ERC-1271 tests); `scripts` typecheck clean for every file owned by account-chain — `scripts/demo-lib.ts`
(qa-demo) fails TS2742 ("inferred type of `publicClient` cannot be named") and `scripts/anvil-fork.ts`, `demo-lib.ts`,
`demo-reset.ts` (qa-demo) fail `biome check` formatting; `biome check packages/chain scripts/src scripts/keyline-cli.ts
scripts/spike-*.ts` is clean.


## 15. Gate 2 from the UI (recorded by the orchestrator, 6 Oct 2026 08:40 CEST)

Driven by Playwright CDP virtual authenticators against a private bank (:4200) + sq-guardian, public Candide endpoint, every EOA at 0 ETH (sponsored relayer Safe).

| Step | Value | How |
|---|---|---|
| Safe | `0xeF2c271d40d72bc5Dc4fef277846CA66886E2cce` | bank DB `recovery_requests` (status `finalized`) |
| Execute (`multiConfirmRecovery`, Swissquote signature + Safety-key signature, relayer-submitted) | https://sepolia.basescan.org/tx/0xe56ca70dadcf94b0ff840ebfb80be0f3a2d69764a029b5c1fac56d3b2652d7f5 | bank DB `onchain.executedTxHash` |
| Finalize (after the 180 s grace period, sq-guardian via its sponsored Safe) | https://sepolia.basescan.org/tx/0xad898b42a5b7696fef18c4680ba96b70d397e1482ad26bc8b01e5f8db0213e53 | `cast receipt … status` → 1 (success) |
| New sole owner | `0x07dDC4D0DfF95022806Ec4931EBB8cfF89fd016A` (new phone's SafeWebAuthnSignerProxy) | `cast call <safe> "getOwners()(address[])"` |
| Thief persona | `identity-refused` → after operator override `awaiting-guardians`, `waitingFor: second-recoverer`; nothing executed on-chain | bank DB + desk screenshot `docs/screens/w2-desk-override.png` |
