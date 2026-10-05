# Threat model

Owner: `docs-submission`. State of the code: 6 Oct 2026, early pass (Waves 0–2 merged, Wave 3 in flight). Every statement about the code names the file that implements it. Where the prototype differs from production, both are given. Where something is not built, it says "not built".

## 1. What is protected, by whom

One Safe 1.4.1 smart account per client on Base Sepolia. Its only owner is a `SafeWebAuthnSignerProxy` bound to the client's phone passkey (P-256). A Candide `SocialRecoveryModule` (`0x949d01d424bE050D09C16025dd007CB59b3A8c66`, 180 s grace period on the testing instance) is enabled on the Safe with three guardians and threshold 2.

| Key | Holder | Where it lives in the prototype | Can move funds | Can start a recovery | Can cancel a recovery |
|---|---|---|---|---|---|
| Phone key (passkey) | Client | Phone or browser platform authenticator, biometric or PIN gated | Yes, alone | No | Yes, alone (`cancelRecovery()` is called by the Safe) |
| Safety key | Client | Laptop browser profile, IndexedDB, software EOA key (`apps/wallet/app/(laptop)/pair/page.tsx`) | No | 1 of 2 | No |
| Emergency card | Client | Shown once at onboarding, never stored by the app (`apps/wallet/app/(client)/onboarding/page.tsx`, viem `generatePrivateKey`); typed back on recovery (`apps/wallet/app/(client)/recover/page.tsx`) | No | 1 of 2 | No |
| Swissquote recovery key | Swissquote | `services/sq-guardian` process, own `.env`, own SQLite, EOA `0x01Bbd43cd140a7BfcA7836e577470Af2B1d04dE8` | No | 1 of 2 | No |
| Bank verdict key | Swissquote | `services/bank`, EOA `0xba9a649F248BCBCF098680d9EA6E952F342BA23b` | No | No (it is not a guardian; it signs an EIP-712 identity verdict that `sq-guardian` checks) | No |
| Bank relayer key | Swissquote | `services/bank`, EOA `0x11a2170B2fA64944F3b6ffB9De9Fb3246330F8a9`, owns the sponsored relayer Safe `0x8Fadb595e6f3b59123c7A20c2c895C697816361a` | No | No (it submits other people's signatures; the module attributes each approval to the signer, see `multiConfirmRecovery` in VERIFIED §3) | No |

Default mode is the only mode built. Assisted mode (Swissquote + an independent partner instead of the Emergency card) exists as a `services/partner-guardian` process skeleton; it is not wired into onboarding or recovery. Not built.

## 2. The table (STRATEGY §3, verbatim)

| Threat | Can they steal funds? | Can they lock the client out? | Mitigation | Demoed? |
|---|---|---|---|---|
| Thief with locked phone | No — the passkey needs biometrics/PIN | No | WebAuthn user verification; nothing to extract from the phone | Yes |
| Thief with phone **and** email | No | No | Email alone is never enough. Recovery needs an identity check the thief fails **and** a second guardian he does not have (laptop or emergency card); the attempt is public and logged. (Lea cannot cancel here — the thief holds her phone — so the threshold, not the veto, is the protection.) | **Yes (bonus)** |
| Fraudster with forged ID (bank fooled) while Lea still has her phone | No | No | Still needs a second guardian; if he also had her emergency card, the recovery executes but Lea's phone gets the alert and **cancels on-chain** during the delay | Yes (variant) |
| Thief with *unlocked* phone and PIN | Prototype: yes up to the Safe balance (the policy layer only withholds sponsorship; paying own gas bypasses it). Production: limited by on-chain allowance | **Yes, while he holds the unlocked phone**: he can cancel any recovery (veto griefing); there is no on-chain way to evict a holder of the owner key, in ours or any self-custody wallet | Production: Safe AllowanceModule + threshold 2 above the daily limit caps the damage; first-time-recipient cooling delay; the bank stops sponsoring and flags the account — stated plainly as the residual risk of self-custody | Explained |
| Malicious Swissquote insider / compromised bank verdict key / desk operator abusing "override" | **No** | No | Swissquote holds one guardian key; threshold 2; the second guardian is always client-held in default mode; on-chain delay + owner veto; every action logged | Explained |
| Swissquote + partner collude | Default mode: impossible on-chain (no partner). Assisted mode: only after 14 public days if the owner does not cancel | No | Assisted mode is opt-in, contractually constrained, notified on every channel; flagged as the grey zone | Explained |
| Swissquote goes offline / bankrupt | No | **No** | The Safe is on-chain; the phone key signs through any ERC-4337 bundler, paying own gas; Safety key + Emergency card recover to a new owner with no Swissquote involvement; the open-source app keeps running on a domain held in escrow so the phone passkey keeps working (passkeys are domain-bound — the one thing self-hosting cannot fix, see §4) | Yes (screen) |
| Bundler or paymaster outage | — | No | Any public bundler; "Pay my own fee" path | Explained |
| Client loses phone | — | Not permanently | Safety key + Swissquote (identity check) → recovery after delay | **Yes (core)** |
| Client loses phone, laptop and emergency card | — | Default mode: yes (true self-custody). Assisted mode: no | Client chooses at onboarding; explained plainly | Explained |
| Phishing / malicious dApp | Reduced | — | Simulation shows the asset diff in plain language; allowlist; sanctions screening; unlimited approvals flagged | Yes (bonus) |
| Compromised or malicious app release (XSS, rogue deploy) | In principle yes: the app generates the Emergency card and holds the Safety key, so malicious code plus Swissquote's guardian key reaches 3 of 3; it could also ask the passkey to sign an opaque hash | — | This is vendor trust, the same as for every non-custodial wallet (MetaMask, Zengo); legally still software, not custody. Mitigations: open-source reproducible builds on an escrowed domain, Safety key gated by user verification (PRF-encrypted) or on a hardware wallet, Emergency card generated on an independent offline page, step-ups shown on the laptop before signing. Said out loud: the honest claim is "Swissquote's recovery key cannot act alone", not "the app can never misbehave" | Explained |
| Bug in our code | — | — | We wrote no cryptography; all signing is library code; contracts are audited | Explained |

The "Demoed?" column describes the planned demo. Section 3 says what the code does today.

## 3. Row by row: code today vs production

### 3.1 Thief with locked phone

Today. The passkey assertion requires user verification; the wallet never holds the private key (`@simplewebauthn/browser` ceremonies, `services/bank/src/webauthn.ts` for registration and login). The Safe owner is the signer proxy, so there is nothing on the phone that signs without the authenticator.

Production. Same. Residual: a phone unlocked by the thief (next row).

### 3.2 Thief with phone and email

Today. `POST /recoveries` (bank) issues a 6-digit code to a simulated inbox (`services/bank/src/recovery-store.ts`, `sendOtpEmail`). The thief has the inbox, so the code step passes. The identity step is `evaluatePersona` in `services/bank/src/identity.ts`: a device label containing "thief" or an e-ID name different from the client file yields `verdict: 'fail'` with reasons `["ID document name mismatch", "liveness check failed"]`. The bank signs that verdict (EIP-712 `KeylineIdentityVerdict`, `signIdentityVerdict`). `sq-guardian` runs `evaluateRecoveryRequest` in `services/guardian-core/src/rules.ts`: rule 1 verifies the signature against `BANK_VERDICT_ADDRESS` (`verdict.ts`, viem `verifyTypedData`), rule 2 refuses anything that is not `pass`, rule 2b refuses a verdict issued for another request id, wallet or new owner. A failed verdict therefore never produces a guardian signature. Even with a forged pass (desk "override", `services/bank/src/routes/recoveries.ts`), the module needs a second guardian signature the thief does not have: `multiConfirmRecovery` only executes once `getRecoveryApprovals >= threshold` (VERIFIED §3).

Honest caveat. The identity check is scripted (persona rules). The thief fails because the demo says he fails. What the prototype proves is the second layer: a bank that is fooled still cannot reach threshold 2. Marked `SIMULATED` in the UI and `simulated: true` on every verdict (`docs/MOCKS.md`).

Production. Identity through swiyu e-ID or KYC re-verification with liveness; the verdict key in an HSM; the same on-chain threshold.

### 3.3 Fraudster with forged ID while the client still has her phone

Today. Execute path proven on Base Sepolia: two guardian signatures relayed as one `multiConfirmRecovery(execute=true)` start the 180 s grace period; the owner's passkey then sends a sponsored `cancelRecovery()` userOp (`packages/chain/src/account.ts`, `buildCancelRecoveryUserOp`; bank route `POST /policy/evaluate { kind: 'cancel-recovery' }`, always Tier 1 and sponsored). Cancel tx on Safe `0x10b6b8542f734863C6b90703e522B22DF19f1628`: <https://sepolia.basescan.org/tx/0x5ba3e0db186f726f04c14c46211a52d37eec486d79418a1880ab3ceef0a931f9>. The bank's finalizer loop (`services/bank/src/recovery-service.ts`) detects cancellation from `status(wallet).pending === false` plus unchanged `getOwners()` and the `RecoveryCanceled` log; the owner's alert is an in-app event (`notifyOwner`, `push-simulated`).

Production. Push notification on every channel; grace period 72 h on the 3-day module instance (`0x38275826E1933303E508433dD5f289315Da2541c`, verified bytecode), so the owner has days, not minutes.

### 3.4 Thief with unlocked phone and PIN

Today. Nothing stops this thief on-chain. The policy engine (`services/bank/src/policy/engine.ts`) returns `step-up` above CHF 1'000 per day and `block` on a screening hit, but these verdicts only control sponsorship and the bank relay. A userOp paid with the Safe's own ETH through any bundler bypasses them. The Tier-2 step-up itself is a verdict only; the route that accepts a Safety-key signature over the decision (`POST /policy/:id/step-up`) is not built. Tier-3 cooling delay: not built.

Veto griefing. The same thief can call `cancelRecovery()` as often as the client's guardians execute. There is no module function to evict the owner key without the grace period elapsing. This is true of every self-custody wallet with an owner veto; we chose the veto because the alternative (no veto) makes stolen guardian keys fatal.

Production. Safe AllowanceModule for Tier 1 so the owner key alone is capped per day; Safe threshold 2 (phone + Safety key) above the cap; a delay module for first-time recipients. The bank stops sponsoring and flags the account, which limits damage but does not stop a thief who pays gas.

### 3.5 Malicious insider, compromised verdict key, abusive desk operator

Today. Three separate keys in three separate places: the verdict key (bank), the guardian key (`sq-guardian`), the relayer key (bank). The verdict key alone produces nothing the module accepts. The guardian key alone produces one signature; the module needs two (`threshold(wallet) = 2`, verifiable with `cast`, section 5). The desk (`apps/wallet/app/(desk)`, `services/bank/src/routes/desk.ts`) has `approve`, `refuse` and `override` actions behind `DESK_OPERATOR_TOKEN`; none moves funds, and `override` leaves the request at "waiting for a second recoverer" (`docs/MOCKS.md`). Every action is an append-only event (`events` table with SQLite triggers that abort `UPDATE` and `DELETE`, `services/bank/src/events.ts`; same pattern in `services/guardian-core/src/db.ts`).

Production. HSM for both bank keys; four-eyes on desk actions; operator SSO instead of the single shared token.

### 3.6 Swissquote + partner collude

Today. Not possible: the guardian list on every Safe created by the prototype is `[Swissquote, Emergency card, Safety key]` (`packages/chain/src/account.ts`, `protectTransactions`; verified on Safe `0x291A6d162dc3bfa2c7a5B623d676cFeF4CEc4482`, DECISIONS #18). Rule 4 in `rules.ts` even has `sq-guardian` refuse to sign for a wallet where it is not an on-chain guardian. The partner guardian process exists (`services/partner-guardian/src/index.ts`) but no code adds it to a guardian set. Assisted mode: not built.

Production. If assisted mode ships, the 14-day module instance, mandatory notifications, and a contract that bars the partner from acting outside a client-initiated request. This remains the legal grey zone (`docs/LEGAL.md`).

### 3.7 Swissquote offline or bankrupt

Today. Proven without any Keyline server running: `pnpm keyline recover --without-bank` (`scripts/keyline-cli.ts`) takes the Safety key file and the Emergency card hex, deploys the new passkey's signer proxy, submits `multiConfirmRecovery(execute=true)` with the two client signatures and finalizes after 180 s. Safe `0x17049195C25b075c224AA05368287832F6d678c6`: execute <https://sepolia.basescan.org/tx/0x7f7254b7ca8b5ced992d042052aeadb0d9302b9616bc588e7be1570dc3ae75cd>, finalize <https://sepolia.basescan.org/tx/0xfad34f525dd19f01862aa581c0227c9ee7673288b9ae8d81e490c90cb28a16c8>, after which `getOwners()` returned only the new proxy (VERIFIED §14).

Two caveats. (1) The CLI run used Candide's public testnet sponsor because the client EOAs held 0 ETH; with ETH on either EOA it sends directly (`eoaSubmitter`). In production the client pays gas from any funded account. (2) The passkey is bound to the app's rpId. If the domain disappears, the phone passkey cannot sign through a different origin. The recovery path above does not depend on the passkey, so funds are recoverable; day-to-day signing needs the domain held in escrow and the open-source client self-hosted on it. The "Exit hatch" screen and "Export Safety key" button are listed as Wave 3 in `apps/wallet/app/(client)/security/page.tsx` and are not built at the time of writing.

### 3.8 Bundler or paymaster outage

Today. The bank calls Candide's public endpoint `https://api.candide.dev/public/v3/84532` for both bundler and paymaster (DECISIONS #11). If sponsorship is refused the bank returns 502 and never fakes it (`docs/MOCKS.md`). A "pay my own fee" path in the wallet UI is not built; the CLI and `packages/chain` can submit through any bundler URL. Residual risk for the demo: a public, per-IP rate-limited endpoint with no SLA. The authenticated URL replaces it as soon as an API key is configured, with no code change.

### 3.9 Client loses phone (core story)

Today. New device creates a passkey, `POST /recoveries` deploys its signer proxy through the relayer (real tx in event `recovery.signer-deployed`), the simulated identity step passes, the bank signs the verdict, `sq-guardian` verifies it and returns an `ExecuteRecovery` signature (Option A, DECISIONS #15), the laptop signs with the Safety key (`apps/wallet/app/(laptop)/approve/page.tsx`), the bank relays one `multiConfirmRecovery(execute=true)`, reads `executeAfter` from the module, and after the grace period asks `sq-guardian` to finalize (`POST /recoveries/:id/finalize` in `services/guardian-core/src/server.ts`). Each leg was proven on-chain by the chain spike (execute <https://sepolia.basescan.org/tx/0xb53f58a60c2202e499d9ed130b2fe56a328f2a6b885ee15f9190a5c0a2ef26e5>, finalize <https://sepolia.basescan.org/tx/0xcad741a3c66c039b28b41696492026839921ff5d13d7358207126cbecd51b874>). The Playwright story (`e2e/story.spec.ts`, CDP virtual authenticators) runs create, pair, Emergency card, protect on-chain and attestation live on Base Sepolia (latest run 6 passed, 5 skipped while the funder holds no USDC); `scripts/demo-stage-recovery.ts` has executed and finalized a recovery on a twin wallet with 0 ETH on every EOA. The recovery flow driven from the UI screens is the Gate 2 item and is not recorded in `docs/VERIFIED.md` yet.

The 24 h rule. `rules.ts` rule 5 refuses a second executed recovery for the same wallet within 24 h (`EXECUTED_RECOVERY_COOLDOWN_MS`). Because `sq-guardian` only signs and the bank submits, the guardian learns that the execute landed when the bank calls `POST /recoveries/:id/executed`; that route checks on-chain that a recovery is pending before recording it. If the bank never calls it, the cooldown is never armed. This is a known dependency of Option A and is why the rule reads the chain before trusting the bank.

### 3.10 Client loses phone, laptop and card

Today. No path. The module has three guardians and threshold 2; one is gone with the phone's owner key, and only one client-held guardian remains plus Swissquote. Swissquote + the remaining client guardian still reach 2, so this row is only fatal when both client guardians are lost. Stated as such.

### 3.11 Phishing or malicious dApp

Today. The policy engine blocks on a screening hit and on a simulation revert. Screening (`services/bank/src/screening/index.ts`) is a pass-through stub that only flags the seeded test address; the OFAC SDN snapshot file exists in the repo but is not loaded yet, and SECO publishes names, not addresses. The transaction "simulation" in the bank is calldata decoding (`services/bank/src/chain/decode.ts`, `provider: 'fallback'`, `simulated: true`). `eth_simulateV1` with asset-change tracing exists in `packages/chain/src/simulate.ts` and is tested live, but is not wired into the bank route at the time of writing. The dApp allowlist file is in place (`services/bank/policy/allowlist.json`, DemoSwap and Uniswap allowlisted, an unknown dApp deliberately not); the `/dapps` screen is a placeholder. Unlimited-approval decoding: the `decodeCalls` table covers `approve` and friends in `packages/chain`; the warning copy in the review screen is Wave 3.

Production. Real OFAC list refresh, ERC-7730 clear-signing descriptors for known contracts, allowlist curated by compliance.

### 3.12 Compromised or malicious app release

Today. The wallet generates the Emergency card and the Safety key with viem in the browser and asks the passkey to sign hashes it computes. A malicious build could exfiltrate both client guardian keys at creation and later present an opaque hash to the passkey. This is the vendor trust every non-custodial wallet carries. Mitigations in the code: the phone never receives the Safety key (generated on the laptop, `pair/page.tsx`), the card is never stored, the review screen shows the decoded calls before signing. Not built: reproducible builds, an independent offline card generator, PRF-encrypted Safety key.

The claim we make is therefore "Swissquote's recovery key cannot act alone or with any other institution", which is a property of the guardian list, not "the app can never misbehave".

### 3.13 Bug in our code

No cryptographic primitive is implemented in this repository. Hashing, signing and verification go through WebAuthn, `viem`, `abstractionkit`, `@simplewebauthn`, Safe contracts and the Candide module (CLAUDE.md rule 1). The module's deployed bytecode matches the Sourcify-verified source audited by Ackee (VERIFIED §2–3). Our own risk is in orchestration: wrong nonce, wrong signer order, replayed verdict. Each has a test (`packages/chain/src/recovery.test.ts`, `services/guardian-core/src/guardian.test.ts`, `services/bank/src/routes/recoveries.test.ts`).

## 4. Residual risks, stated plainly

| Risk | Why it remains | What would remove it |
|---|---|---|
| Unlocked phone with PIN | The owner key signs alone and can veto recoveries | Safe AllowanceModule + threshold 2 above the cap (production) |
| Veto griefing | Any owner-key holder cancels any recovery | Inherent to owner veto; shorter damage window via allowance caps |
| Vendor trust in the app | The app generates and handles client guardian keys | Reproducible builds, escrowed domain, hardware Safety key |
| Public Candide endpoint | No SLA, per-IP rate limit, sponsorship could stop | Authenticated API key (env change only) |
| Software Safety key | An EOA key in IndexedDB of a browser profile | Hardware wallet key or PRF-encrypted key |
| Plain-JSON Safety key export | No keystore library installed; homemade encryption is banned | EIP-2335 / Web3 keystore v3 via `ethereum-cryptography` (DECISIONS #19) |
| 24 h guardian rule | Armed only when the bank calls `/executed` (Option A) | Guardian reads the module's events itself |
| Policy-layer step-up | Tier 2/3 are verdicts, not on-chain rules; the step-up signature route is not built | Safe threshold 2 above allowance; delay module |
| Simulated identity | Persona rules decide pass/fail | swiyu e-ID (1 Dec 2026) or KYC re-verification |
| Passkey rpId binding | A lost domain strands the phone key for signing (not for recovery) | Escrowed domain, self-hostable client |

## 5. Verify our claims

Foundry `cast` against the public RPC. Module `M = 0x949d01d424bE050D09C16025dd007CB59b3A8c66`. Safe created from the UI with the virtual authenticator: `S = 0x291A6d162dc3bfa2c7a5B623d676cFeF4CEc4482` (protect tx <https://sepolia.basescan.org/tx/0xa40c042a5774cd1fec93c9832d00311611fd6bd34896ef0b3a21be7e1850d425>).

```sh
RPC=https://sepolia.base.org
M=0x949d01d424bE050D09C16025dd007CB59b3A8c66
S=0x291A6d162dc3bfa2c7a5B623d676cFeF4CEc4482

# Who can recover: expect three addresses, one of them Swissquote's 0x01Bbd43cd140a7BfcA7836e577470Af2B1d04dE8
cast call $M "getGuardians(address)(address[])" $S --rpc-url $RPC
# How many must agree: expect 2
cast call $M "threshold(address)(uint256)" $S --rpc-url $RPC
# Is Swissquote alone enough? isGuardian is true, but one address is below the threshold of 2
cast call $M "isGuardian(address,address)(bool)" $S 0x01Bbd43cd140a7BfcA7836e577470Af2B1d04dE8 --rpc-url $RPC
# Who owns the Safe: expect exactly one address, the passkey signer proxy
cast call $S "getOwners()(address[])" --rpc-url $RPC
# Is the recovery module enabled on the Safe
cast call $S "isModuleEnabled(address)(bool)" $M --rpc-url $RPC
# Recovery nonce (bumps on finalize or cancel)
cast call $M "nonce(address)(uint256)" $S --rpc-url $RPC
```

Recovery proofs on other Safes created by the same code:

| Proof | Safe | Transactions |
|---|---|---|
| Execute then finalize, 0 ETH on every EOA | `0x10b6b8542f734863C6b90703e522B22DF19f1628` | proxy <https://sepolia.basescan.org/tx/0x188117528b18dc27a44355cb7863a63563775af48fb59c9cf1617f4d69c3af7f> · execute <https://sepolia.basescan.org/tx/0xb53f58a60c2202e499d9ed130b2fe56a328f2a6b885ee15f9190a5c0a2ef26e5> · finalize <https://sepolia.basescan.org/tx/0xcad741a3c66c039b28b41696492026839921ff5d13d7358207126cbecd51b874> |
| Execute then owner cancels | `0x10b6b8542f734863C6b90703e522B22DF19f1628` | execute <https://sepolia.basescan.org/tx/0xc612a175a1e03f0cfee7de3a028a3e4c2112cddb8486c0a9fc89f618ff78ebc1> · cancel <https://sepolia.basescan.org/tx/0x5ba3e0db186f726f04c14c46211a52d37eec486d79418a1880ab3ceef0a931f9> |
| Recovery without Swissquote (CLI, no Keyline server) | `0x17049195C25b075c224AA05368287832F6d678c6` | create <https://sepolia.basescan.org/tx/0x1d3bdd5dfba562014e645d5862e61dbd66e0b62557df1558be11b799d986f3b4> · execute <https://sepolia.basescan.org/tx/0x7f7254b7ca8b5ced992d042052aeadb0d9302b9616bc588e7be1570dc3ae75cd> · finalize <https://sepolia.basescan.org/tx/0xfad34f525dd19f01862aa581c0227c9ee7673288b9ae8d81e490c90cb28a16c8> |
| ERC-1271 ownership attestation | `0x2eac8081f2c00f526369AabB7492abE2ec280dea` | create <https://sepolia.basescan.org/tx/0xf317b51d0f9b3932eb2ddcc1f113ae0e3e3e90de6ea3309cdee7a5d9637785c3>; verification is an `eth_call` to `isValidSignature`, returned `0x1626ba7e` (VERIFIED §10) |

`pnpm keyline guardians --safe <addr>` prints the same facts with a Basescan link (`scripts/keyline-cli.ts`). The grace period has no getter; the module's bytecode holds the immutable `180` (VERIFIED §2), and the UI shows `executeAfter` read from the module.
