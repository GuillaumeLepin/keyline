# Threat model

Owner: `docs-submission`. State of the code: the freeze of 6 Oct 2026, 09:15 CEST (commit `ae4f253`, Gates 0–3 passed, `docs/DECISIONS.md` #20–#23). Every statement about the code names the file that implements it. Where the prototype differs from production, both are given. Where something is not built, it says "not built".

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

The "Demoed?" column describes the planned demo; the corrections for the code as frozen are in `README.md` §2. Section 3 says what the code does today.

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

Today. Nothing stops this thief on-chain. The policy engine (`services/bank/src/policy/engine.ts`) returns `step-up` above CHF 1'000 per day (Tier 2), `cooling` for a first transfer to a new address or above CHF 10'000 (Tier 3, 60 s in the prototype, `COOLING_MS`, instead of 24 h), and `block` on a screening hit, a simulation revert or a dApp outside the allowlist. Tier 2 is complete end to end: the laptop screen (`apps/wallet/app/(laptop)/approve/page.tsx`) signs EIP-712 `KeylinePolicyStepUp(decisionId, wallet, callsHash, chfValueCents)` with the Safety key, `POST /policy/:id/step-up` (`services/bank/src/routes/policy.ts`) verifies it with viem `verifyTypedData` against the registered Safety key and promotes the decision to `approve`; the phone's review screen polls and continues. Tier 3 shows a countdown and `POST /policy/:id/cancel`; the decision becomes `approve` only when `coolingUntil` has passed and it was not cancelled (`promoteCooling`). Gate 3 ran a Tier-2 operation approved from the laptop and confirmed on Base Sepolia (wallet `0x3cfC079f1fFA8C66DC40B2B115fAcc8963F0D7E2`, DECISIONS #22). All of this is policy-layer enforcement: the verdicts decide whether the bank sponsors and relays, nothing more. A userOp paid with the Safe's own ETH through any bundler bypasses them, and the review screen says so ("policy-layer enforcement in the prototype").

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

Two caveats. (1) The CLI run used Candide's public testnet sponsor because the client EOAs held 0 ETH; with ETH on either EOA it sends directly (`eoaSubmitter`). In production the client pays gas from any funded account. (2) The passkey is bound to the app's rpId. If the domain disappears, the phone passkey cannot sign through a different origin. The recovery path above does not depend on the passkey, so funds are recoverable; day-to-day signing needs the domain held in escrow and the open-source client self-hosted on it. Both are built in `apps/wallet/app/(client)/security/page.tsx`: the exit hatch sheet reads the guardian list and threshold from the module on-chain (not from the bank), labels each address with the bank's kind where it matches, and prints the `pnpm keyline recover --without-bank` command for this wallet (`docs/screens/w3-security-exit.png`); "Export Safety key" (laptop persona only, where the key lives) downloads the plain JSON `{ address, privateKey }` the CLI reads, labelled prototype with a SIMULATED badge on the "not encrypted" note (DECISIONS #19). The "Pay my own network fee" toggle exists as copy only and is not built.

### 3.8 Bundler or paymaster outage

Today. The bank calls Candide's public endpoint `https://api.candide.dev/public/v3/84532` for both bundler and paymaster (DECISIONS #11). If sponsorship is refused the bank returns 502 and never fakes it (`docs/MOCKS.md`). A "pay my own fee" path in the wallet UI is not built; the CLI and `packages/chain` can submit through any bundler URL. Residual risk for the demo: a public, per-IP rate-limited endpoint with no SLA. The authenticated URL replaces it as soon as an API key is configured, with no code change.

### 3.9 Client loses phone (core story)

Today. New device creates a passkey, `POST /recoveries` deploys its signer proxy through the relayer (real tx in event `recovery.signer-deployed`), the simulated identity step passes, the bank signs the verdict, `sq-guardian` verifies it and returns an `ExecuteRecovery` signature (Option A, DECISIONS #15), the laptop signs with the Safety key (`apps/wallet/app/(laptop)/approve/page.tsx`), the bank relays one `multiConfirmRecovery(execute=true)`, reads `executeAfter` from the module, and after the grace period asks `sq-guardian` to finalize (`POST /recoveries/:id/finalize` in `services/guardian-core/src/server.ts`). Each leg was proven on-chain by the chain spike (execute <https://sepolia.basescan.org/tx/0xb53f58a60c2202e499d9ed130b2fe56a328f2a6b885ee15f9190a5c0a2ef26e5>, finalize <https://sepolia.basescan.org/tx/0xcad741a3c66c039b28b41696492026839921ff5d13d7358207126cbecd51b874>). The same flow driven from the UI screens with virtual authenticators is the Gate 2 proof (VERIFIED §15, DECISIONS #20): Safe `0xeF2c271d40d72bc5Dc4fef277846CA66886E2cce`, execute <https://sepolia.basescan.org/tx/0xe56ca70dadcf94b0ff840ebfb80be0f3a2d69764a029b5c1fac56d3b2652d7f5>, finalize <https://sepolia.basescan.org/tx/0xad898b42a5b7696fef18c4680ba96b70d397e1482ad26bc8b01e5f8db0213e53>, after which `getOwners()` returned only the new phone's proxy `0x07dDC4D0DfF95022806Ec4931EBB8cfF89fd016A`. The Playwright story (`e2e/story.spec.ts`, CDP virtual authenticators) runs F1.1 to F1.7, F2 and F3.1 to F3.4 against Base Sepolia, skipping the USDC legs while the funder holds no USDC; `scripts/demo-stage-recovery.ts` has executed and finalized a recovery on a twin wallet with 0 ETH on every EOA.

The 24 h rule. `rules.ts` rule 5 refuses a second executed recovery for the same wallet within 24 h (`EXECUTED_RECOVERY_COOLDOWN_MS`). Because `sq-guardian` only signs and the bank submits, the guardian learns that the execute landed when the bank calls `POST /recoveries/:id/executed`; that route checks on-chain that a recovery is pending before recording it. If the bank never calls it, the cooldown is never armed. This is a known dependency of Option A and is why the rule reads the chain before trusting the bank.

### 3.10 Client loses phone, laptop and card

Today. No path. The module has three guardians and threshold 2; one is gone with the phone's owner key, and only one client-held guardian remains plus Swissquote. Swissquote + the remaining client guardian still reach 2, so this row is only fatal when both client guardians are lost. Stated as such.

### 3.11 Phishing or malicious dApp

Today. Every `POST /policy/evaluate` runs screening and simulation before the engine decides (`services/bank/src/routes/policy.ts`). Screening (`services/bank/src/screening/`) checks the counterparty against the real OFAC SDN Ethereum address list: 0xB10C's nightly extraction is fetched at bank startup with a 5 s timeout (`ofac.ts`, `loadOfacList`), and the vendored `ofac-eth.snapshot.txt` next to it is the offline fallback, used also when the response has fewer than 100 entries; `GET /policy/screening` reports which source is loaded. On top of the real list, one seeded contact ("Sanctioned test address", a random EOA generated by the seed, `seeded-sanctioned.json`) is flagged with `simulatedHit: true` so the demo can show a block without sending to a real SDN address; the review screen shows the SIMULATED badge on that hit (`docs/screens/w3-review-block.png`, Gate 3, DECISIONS #22). SECO publishes names, not addresses, so it is listed in `listsChecked` and marked simulated. A hit gives `block` before any other rule. Simulation is `eth_simulateV1` with asset-change tracing (`packages/chain/src/simulate.ts`, called through `chain.simulate`); for an undeployed Safe (the protect op), after 8 s or on RPC error the bank falls back to calldata decoding and labels the result `simulated: true` (`services/bank/src/chain/decode.ts`). A revert blocks. The dApp allowlist (`services/bank/policy/allowlist.json`) is enforced for `kind: 'dapp'`: every call must target one of the dApp's contracts and the dApp must be allowlisted, otherwise `block`; the `/dapps` screen (`apps/wallet/app/(client)/dapps/page.tsx`) lists reviewed and not-reviewed apps and hands a mock request to the review screen, where the bank's decode, never the app's own description, is what the client reads. Decoded risk words (`approve(∞)`, `permit`, `setApprovalForAll`, `enableModule` of an unknown module) force at least `step-up`, and an unlimited `approve` comes back with a suggested cap that re-encodes it as 100 USDC ("Approve 100.00 USDC instead", `docs/screens/w3-review-dapp-danger.png`, `w3-review-dapp-capped.png`). DemoSwap and the unknown dApp are mock protocols with a placeholder router address, labelled SIMULATED; the Uniswap, Aave and Circle entries carry real Base Sepolia addresses not re-verified on-chain.

Production. A scheduled OFAC refresh instead of one fetch at startup, a name-based SECO check, ERC-7730 clear-signing descriptors for known contracts, allowlist curated by compliance.

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
| Plain-JSON Safety key export | The wallet's export button writes `{ address, privateKey }` unencrypted; no keystore library installed and homemade encryption is banned | EIP-2335 / Web3 keystore v3 via `ethereum-cryptography` (DECISIONS #19) |
| 24 h guardian rule | Armed only when the bank calls `/executed` (Option A) | Guardian reads the module's events itself |
| Policy-layer step-up and cooling | Tier 2 (laptop EIP-712 signature) and Tier 3 (60 s cooling with cancel) are built end to end but are verdicts that gate sponsorship, not on-chain rules | Safe threshold 2 above allowance; delay module |
| OFAC list freshness | Fetched once at bank startup (snapshot fallback); no refresh schedule; SECO is a name list, not checked | Scheduled refresh; name screening against SECO |
| Seeded sanctions hit | The demo's blocked transfer targets a seeded random address, not a real SDN entry (the real list is loaded and unit-tested against real hits) | None needed; stated on screen with the SIMULATED badge |
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
| Gate 2: recovery driven from the UI screens (new phone, simulated e-ID, Swissquote signature, laptop Safety key, execute, 180 s countdown, finalize) | `0xeF2c271d40d72bc5Dc4fef277846CA66886E2cce` | execute <https://sepolia.basescan.org/tx/0xe56ca70dadcf94b0ff840ebfb80be0f3a2d69764a029b5c1fac56d3b2652d7f5> · finalize <https://sepolia.basescan.org/tx/0xad898b42a5b7696fef18c4680ba96b70d397e1482ad26bc8b01e5f8db0213e53> · new owner `0x07dDC4D0DfF95022806Ec4931EBB8cfF89fd016A` (`cast call <safe> "getOwners()(address[])"`) |
| Gate 3: Tier-2 operation approved from the laptop with a Safety-key EIP-712 signature, confirmed on-chain | `0x3cfC079f1fFA8C66DC40B2B115fAcc8963F0D7E2` | DECISIONS #22 records the wallet; the transaction hash was not copied into `docs/VERIFIED.md` |
| Execute then finalize, 0 ETH on every EOA | `0x10b6b8542f734863C6b90703e522B22DF19f1628` | proxy <https://sepolia.basescan.org/tx/0x188117528b18dc27a44355cb7863a63563775af48fb59c9cf1617f4d69c3af7f> · execute <https://sepolia.basescan.org/tx/0xb53f58a60c2202e499d9ed130b2fe56a328f2a6b885ee15f9190a5c0a2ef26e5> · finalize <https://sepolia.basescan.org/tx/0xcad741a3c66c039b28b41696492026839921ff5d13d7358207126cbecd51b874> |
| Execute then owner cancels | `0x10b6b8542f734863C6b90703e522B22DF19f1628` | execute <https://sepolia.basescan.org/tx/0xc612a175a1e03f0cfee7de3a028a3e4c2112cddb8486c0a9fc89f618ff78ebc1> · cancel <https://sepolia.basescan.org/tx/0x5ba3e0db186f726f04c14c46211a52d37eec486d79418a1880ab3ceef0a931f9> |
| Recovery without Swissquote (CLI, no Keyline server) | `0x17049195C25b075c224AA05368287832F6d678c6` | create <https://sepolia.basescan.org/tx/0x1d3bdd5dfba562014e645d5862e61dbd66e0b62557df1558be11b799d986f3b4> · execute <https://sepolia.basescan.org/tx/0x7f7254b7ca8b5ced992d042052aeadb0d9302b9616bc588e7be1570dc3ae75cd> · finalize <https://sepolia.basescan.org/tx/0xfad34f525dd19f01862aa581c0227c9ee7673288b9ae8d81e490c90cb28a16c8> |
| ERC-1271 ownership attestation | `0x2eac8081f2c00f526369AabB7492abE2ec280dea` | create <https://sepolia.basescan.org/tx/0xf317b51d0f9b3932eb2ddcc1f113ae0e3e3e90de6ea3309cdee7a5d9637785c3>; verification is an `eth_call` to `isValidSignature`, returned `0x1626ba7e` (VERIFIED §10) |

`pnpm keyline guardians --safe <addr>` prints the same facts with a Basescan link (`scripts/keyline-cli.ts`). The grace period has no getter; the module's bytecode holds the immutable `180` (VERIFIED §2), and the UI shows `executeAfter` read from the module.
