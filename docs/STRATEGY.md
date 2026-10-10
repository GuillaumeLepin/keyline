# Swissquote Wallet Challenge — Winning Strategy

Prepared 5 Oct 2026 for a solo, ~24 h build. Everything below is derived from the official challenge text plus research into the current (Oct 2026) tooling, Swiss law and Swissquote's business. Items marked **(verify)** could not be confirmed against a primary source; check them in the first hour.

---

## 1. The rubric, decoded

Judges score **/100 + up to 20 bonus**. The table maps every line of the rubric to the exact thing you will show, and where.

| Criterion | Pts | What the text literally says | What we show | Where the judge sees it |
|---|---|---|---|---|
| Technical implementation | **35** | "create → sign → recover works end to end; clean, sensible code" | Passkey-owned Safe smart account on Base Sepolia; sponsored USDC transfer with a block-explorer link; on-chain recovery (execute → grace period → finalize) with the old key revoked; a Playwright E2E test that runs the whole story | Live demo + CI badge + `pnpm e2e` + repo structure |
| Security & custody design | **20** | "well-argued custody model, credible threat model, recovery that can't be abused" | 1 owner key + 3 recovery guardians (2-of-3) with Swissquote the only institution among them; **Swissquote's key can never sign and never complete a recovery alone**; every recovery is public and delayed, cancellable by the owner while they hold their phone; attacker with phone+email refused twice (identity check, then the on-chain threshold) | Threat-model table in README + the attacker demo |
| Legal feasibility | **15** | "realistic reasoning about custody and wallet ownership verification" | "Power of disposal" test (DLT Act / FINMA 01/2026): no unilateral disposal ⇒ not custody; honest grey-zone paragraph on bank+partner recovery; Travel Rule solved by an EIP-712 ownership attestation signed right after deployment (FINMA 02/2019 has **no threshold** for unhosted wallets) | README legal section + "Proof of ownership" screen |
| Business case | **15** | "concrete value: revenue, retention or cost savings" | Crypto income CHF 85.7 m (2025) → CHF 14.6 m (H1 2026, −66 %) because it is volatility-driven; wallet adds non-cyclical revenue (swap fee, staking share, premium gasless tier), retention (clients currently must *leave* to self-custody) and cost savings (no screenshot/Satoshi-test checks) | README business paragraph + one demo screen |
| UX & pitch | **15** | "a non-technical client could use it; the demo tells a clear story" | Bank-statement-grade UI (no crypto jargon: "safety key", "network fee"), amount-first review, one story with a climax (the thief is refused) | The demo itself |
| Bonus: gasless | **+10** | "paymaster… explain who pays and how abuse is prevented" | Candide paymaster sponsored by the bank, gated by the policy service; per-client daily gas cap, allowlisted targets, client can always pay own gas | Review screen "Network fee: paid by Swissquote" + README |
| Bonus: compliant dApp | **+10** | "approved list of dApps, sanctions screening, simulate and explain in plain language, extra checks above a threshold" | `eth_simulateV1` asset diff rendered as "What will happen", OFAC/SECO screening with a seeded sanctioned address, dApp allowlist, tiered limits | Review screen + blocked-transfer demo |

**Bonus points are only awarded if the core story works.** Therefore the build order is non-negotiable: core story first, bonuses second, polish third.

### Hard constraints (disqualifiers)

1. **No homemade crypto.** Everything cryptographic is a library call: WebAuthn (browser), Safe contracts, Safe4337Module, Candide `abstractionkit`, viem, Candide SocialRecoveryModule. We never implement signing, hashing, key splitting or verification ourselves.
2. **Honest mocks.** Every mocked component carries a visible `SIMULATED` badge in the UI, a dashed box in the diagram and a row in the README's Real / Simulated / Out-of-scope table.
3. **Mocked share holders run as separate processes with their own storage; the client app never holds a share.** Swissquote's guardian is a separate Node process (`sq-guardian`) with its own SQLite file and its own key; the optional assisted-mode partner is a second such process (`partner-guardian`). The bank service holds no guardian key. The client app holds only the client's own material: passkeys (never exposed by the authenticator), the Safety key on the laptop, and the Emergency card shown once and never stored.
4. **One end-to-end story**: create → log in & sign → lose → recover. The demo follows exactly that order.
5. **A transaction must be signed and sent to a blockchain.** We send a real USDC transfer on Base Sepolia (2 s blocks) and show the hash on Basescan.

---

## 2. The design in one paragraph

**Keyline** (working name — rename freely, don't use the Swissquote logo) is a self-custody wallet where the client's phone passkey is the sole owner of a Safe smart account on an EVM chain (Base Sepolia in the prototype). Three *recovery guardians* can together — never alone — restore access when the phone is lost: the client's own **Safety key** (on the laptop), the client's offline **Emergency card** (printed once, never stored in the app, unable to move money) and **Swissquote's recovery service** (a separate process holding one guardian key in a Swiss HSM in production). Any two of the three can propose a new owner, but the change only takes effect after a public waiting period during which the current owner can cancel it. Swissquote is the only institution among the guardians, so **no combination of institutions can act without the client** and Swissquote has **no power of disposal** — the Swiss legal test for custody. An opt-in *assisted* mode swaps the Emergency card for an independent recovery partner (mocked) for clients who refuse offline material; that mode is the legal grey zone and is labelled as such. Because Swissquote already knows the client (KYC), the wallet signs an ownership attestation at creation, so the FINMA Travel Rule ownership check that today needs screenshots or a Satoshi test becomes automatic. Transactions are gasless (the bank sponsors fees through a paymaster, gated by its compliance policy), simulated and explained in plain language before signing, and screened against sanctions lists.

### Architecture

```mermaid
flowchart LR
  subgraph Client["Client (browser / PWA on phone)"]
    W[Keyline wallet app<br/>Next.js, mobile-first]
    PK[(Phone passkey<br/>platform authenticator)]
    SK[(Safety key<br/>laptop profile · prototype: software key<br/>prod: hardware wallet key)]
  end
  subgraph Bank["Swissquote backend (mock, separate process)"]
    B[bank service<br/>identity · policy · simulation<br/>screening · travel-rule · paymaster gateway]
    BD[(SQLite)]
    DESK[Recovery desk UI<br/>no 'send' button]
  end
  subgraph G1["Swissquote recovery guardian (separate process)"]
    SQG[sq-guardian<br/>own key, own SQLite]
  end
  subgraph G2["Independent partner guardian (mock, separate process — assisted mode only)"]
    PG[partner-guardian<br/>own key, own SQLite]
  end
  subgraph Offline["Client offline material"]
    EC[(Emergency card<br/>printed EOA key, never stored in app)]
  end
  subgraph Chain["Base Sepolia (fallback: Ethereum Sepolia)"]
    EP[EntryPoint v0.7]
    SAFE[Safe 1.4.1 + Safe4337Module<br/>owner = phone passkey]
    REC[SocialRecoveryModule<br/>default: Safety key, Emergency card, SQ · threshold 2<br/>assisted: Safety key, SQ, Partner · threshold 2<br/>grace 3 min (prod: 72 h / 14 d)]
    USDC[USDC test token]
    P256[P-256 precompile 0x100]
  end
  BUNDLER[Candide bundler + paymaster]
  W --> PK
  W --> SK
  W -->|policy check, simulation, attestation| B
  B --> BD
  DESK --> B
  B -->|identity verdict| SQG
  B -->|identity verdict, assisted mode only| PG
  W -->|signed userOp| BUNDLER --> EP --> SAFE
  SAFE --> P256
  SAFE --> USDC
  SQG -->|confirm/execute/finalize recovery| REC
  PG -->|confirm recovery| REC
  SK -->|confirm recovery| REC
  EC -->|confirm recovery (scan)| REC
  PK -->|cancel recovery| REC
  REC --> SAFE
```

Dashed in the README diagram (mocked): bank identity/KYC checks, e-ID verification, notifications, the Swissquote account balance used for top-ups, the partner guardian's "independence", the Swiss HSM.

---

## 3. Custody model decision (and why not the others)

**Chosen: smart-contract account (ERC-4337 Safe) owned by a passkey, with a threshold guardian recovery module.** Combination of "smart-contract account" and "split backup" rows in the challenge table.

| Model | Why we did not pick it as the primary |
|---|---|
| Custodial account | It is not a wallet: Swissquote has full power of disposal → custody and segregation rules, bankruptcy risk borne by segregation law rather than by construction, no transfers to exchanges, no DeFi. What the client gains with ours instead: keys they control, any dApp, bankruptcy-remote by design, the same bank-grade recovery and screening. |
| Seed phrase | A typical Swissquote client will lose or photograph it. Swissquote's own blog cites USD 408.9 m lost to private-key compromise in 2024. No bank-assisted recovery is possible without becoming a custodian of the phrase. Our Emergency card is the safe version of this idea: it cannot spend, only start a delayed, visible recovery. |
| MPC / TSS 2-of-3 as the everyday signing path | Chain-agnostic (Bitcoin works) and the hint in the brief, but: the only browser-ready TSS WASM (Silence Labs) is non-commercial-licensed; a 2-of-3 TSS wallet with client + bank + backup in 24 h solo is unrealistic; and TSS gives you **no on-chain veto window**: if two shares collude or are stolen, funds move instantly. We keep TSS as the documented roadmap for Bitcoin (see §10). |
| Split backup (Shamir / SLIP-39) | Reassembling the seed somewhere means that place holds the whole key at that moment; if Swissquote + partner can reassemble it, that is joint power of disposal with no delay and no veto. |
| **Passkey Safe + guardian recovery (chosen)** | Audited contracts (Safe, Safe4337Module, Candide SocialRecoveryModule — Ackee audit 2024); the Swiss bank Sygnum ships exactly this pattern with Safe RecoveryHub; recovery is slow, public and cancellable by design; the client's key alone always suffices; gasless and transaction simulation fall out naturally on EVM. Weakness: EVM-only (said openly). |

### Who holds what — default mode (what we demo)

| Key | Where | Power |
|---|---|---|
| Phone key (passkey, P-256) | Client's phone/browser authenticator, biometric-gated | Sole Safe owner: signs any transaction alone; the only key that can **cancel** a recovery |
| Safety key | Client's laptop (prototype: a software key in the laptop browser profile, exportable as an encrypted file; production: a hardware-wallet key or a PRF-encrypted key — **not** a passkey, because passkeys are bound to the app's domain and must survive the app's disappearance) | Recovery guardian 1 of 3; co-approves high-value transfers |
| Emergency card | A printed QR/text key the client stores offline (safe-deposit box, notary). Never stored in the app. | Recovery guardian 2 of 3. Unlike a seed phrase it **cannot move money**: stolen, it can only start a public, delayed recovery the client sees and cancels |
| Swissquote recovery key | `sq-guardian` process (prod: HSM in Switzerland) | Recovery guardian 3 of 3. **Cannot sign transactions. Cannot recover alone. No other institution is a guardian in default mode, so no combination of institutions can act without the client — enforced on-chain, not in software.** |

Guardian threshold 2 of 3 on the Candide SocialRecoveryModule. Recovery combinations: Swissquote + Safety key (lost phone — the demo), Swissquote + Emergency card (lost phone and laptop), Safety key + Emergency card (**Swissquote gone** — the client recovers alone). Swissquote alone: impossible. Two institutions: there are none.

### Assisted mode (opt-in, explained; built only if time permits)

For clients who refuse to keep any offline material: guardians = Safety key + Swissquote + an **independent recovery partner** (`partner-guardian`, mocked), threshold 2, on the 14-day module instance. Here Swissquote + partner *could* complete a recovery without the client after 14 public days — this is the legal grey zone the brief points at, and we say so (§6). Default mode has no such path.

### Threat model (put this table in the README verbatim)

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

---

## 4. Recovery design (the climax of the demo)

Mechanism: **Candide SocialRecoveryModule** on Safe. Guardians confirm a recovery request `(wallet, newOwners, newThreshold)`; once the threshold is met the request is *executed* and a **grace period** starts; anyone can *finalize* afterwards; the **current owner can cancel** during the grace period. A pre-deployed testing instance uses a **3-minute** grace period (`0x949d01d424bE050D09C16025dd007CB59b3A8c66`, verified 5 Oct 2026 on Base Sepolia, Ethereum Sepolia, OP Sepolia and Arbitrum Sepolia) — ideal for a live demo; production would use the 3-day/7-day/14-day instances (72 h default, 14 days in assisted mode). The grace period is a property of the module instance, read from the contract and displayed as-is.

Paths:

1. **Lost phone, has laptop (default, demoed).** New phone → create new passkey → request recovery → bank identity check (simulated e-ID / KYC re-verification; swiyu e-ID goes live 1 Dec 2026, label it "simulated") → `sq-guardian` confirms (guardian 1) → Safety key confirms on the laptop (guardian 2) → executed → 3-minute countdown shown with the exact finalization time (public; nobody can cancel because the only owner key is lost — the threshold protected this request, the delay makes it visible) → finalize → new passkey is the owner, old one gone → send a transaction from the new phone.
2. **Attacker with stolen phone + email (bonus, demoed).** Attacker browser: cannot sign (no biometric). Starts recovery, passes the email step (he has the inbox), **fails the identity step** → the desk shows "Refused — identity mismatch"; the owner is notified. Then the narration: "even if he had fooled the bank, he would still need her laptop or her emergency card" — and the desk's "override (demo)" button proves it: Swissquote's lone confirmation leaves the request at "waiting for a second recoverer" forever.
3. **Fraud while Lea still has her phone (variant, demoed if time).** A fraudster with a forged ID and a photo of the emergency card: bank fooled (override) + emergency card → executed → Lea's phone shows "Recovery started from a new device in Zürich — wasn't you?" → **Cancel recovery** (owner userOp) → on-chain cancelled. The chain, not the bank, stops it.
4. **Swissquote permanently gone.** Safety key (exported from the laptop as an encrypted file via Security centre → "Export Safety key") + Emergency card = 2 of 3 → recovery to a new owner with no Swissquote process involved (`keyline recover --without-bank`, or any tool that can call the module; the client pays the gas). The phone key keeps signing through any ERC-4337 bundler meanwhile. Caveat stated openly: passkeys are bound to the app's web domain (rpId), so production registers them on a domain held by an independent escrow and ships the open-source client for self-hosting; the "Exit hatch" screen explains exactly this and shows the Safe address + the guardian set, verifiable on Basescan.
5. **Lost everything (assisted mode, explained only).** Swissquote + partner, 14-day delay, notifications; a client in default mode has no such path by construction.

Why it cannot be abused: email/SMS are never sufficient; the identity check (bank) and the guardian key (sq-guardian) are separate processes with separate keys — the guardian validates the bank's signed verdict and refuses anything else; threshold 2 means Swissquote never decides alone; the second guardian is client-held in default mode; the delay is on-chain and public; the owner's veto is on-chain; every step is written to an append-only event log shown in the desk; the desk has no function that moves funds and its operator actions require an operator login. Guardian rate rule: one *executed* recovery per wallet per 24 h (not one *request*), and an operator refusal supersedes any pending confirmation — otherwise the thief's refused attempt would block Lea's real one.

Who pays gas for recovery: the guardian processes and the bank relayer pay for confirm/execute/finalize (bank cost); with Swissquote gone, the client pays from the Emergency card's EOA or any funded account.

---

## 5. Authentication tiers

| Tier | Trigger | What the client does | Enforcement in prototype | Production path |
|---|---|---|---|---|
| 1 | ≤ CHF 1'000 / day, known recipient, allowlisted dApp | Phone passkey (biometric) | Policy service + paymaster sponsorship | Same + Safe AllowanceModule |
| 2 | Above the daily limit | Phone passkey + Safety key confirmation on the laptop | Policy service verifies the Safety key's signature over the decision (clearly labelled "policy-layer enforcement in prototype") | Safe threshold 2 above allowance (AllowanceModule for Tier 1) |
| 3 | First transfer to a new address, or > CHF 10'000 | Tier 2 + cooling delay with cancel (prototype 60 s, prod 24 h) | Policy service queue, visible in desk | Delay module |

Say the quiet part out loud in the README: in self-custody the client can bypass the policy layer by paying their own gas; the policy layer is a *protection the client opts into*, not a custody control. The on-chain production path is what makes the limits binding against a thief with an unlocked phone.

---

## 6. Legal reasoning (15 points — write exactly this, in your words)

**Custody.** Under the DLT Act (Art. 16 no. 1bis BankA, Art. 242a DEBA) and FINMA Guidance 01/2026, custody presupposes that the institution has *power of disposal* over the assets and has undertaken to keep them available. Swiss doctrine (MME, caplaw, IFLR) is explicit that where the client can dispose of the assets alone, or where more than one key is needed and the provider cannot act alone, the assets never form part of the provider's estate. In Keyline the client's phone key alone moves funds; Swissquote holds one of three recovery guardian keys, which cannot sign transactions and cannot complete a recovery alone; any recovery is delayed and cancellable on-chain. Swissquote therefore has no power of disposal → the wallet is software plus an optional recovery/co-approval service, not custody, and not a deposit. Consequences: no segregation booking, no custody insurance, no key-theft liability, no 800 % risk-weight exposure (note: segregated custody is already capital-free — do **not** claim "we save capital"; claim operational risk, liability and compliance cost).

**Grey zone (say it before the judge does).** In default mode no two institutions are guardians, so the question does not arise on-chain. In *assisted* mode, Swissquote and the partner could together reach the recovery threshold without the client. FATF's 2021 guidance (§73) warns that multi-signature does not automatically exclude control. Our answer: (a) default mode has exactly one institutional guardian, enforced by the on-chain guardian list anyone can verify, so no combination of institutions suffices; (b) assisted mode is opt-in, the partner runs its own identity check and signs its own verdict (simulated) rather than trusting Swissquote's, it is contractually barred from cooperating with Swissquote outside a client-initiated request, and the module imposes a 14-day on-chain delay with notification and owner veto; (c) FINMA has not spoken on MPC/multisig key-share models — a no-action letter would be sought before launch. We present both modes and let the client choose, which is itself the argument that control sits with the client.

**AML still applies.** Swissquote is a bank; the client relationship is fully KYC'd; non-custodial does not mean unregulated.

**Travel Rule / ownership verification.** FINMA Guidance 02/2019 and Art. 10 AMLO-FINMA: a Swiss institution may transfer to/from an external wallet only if it belongs to its own client and ownership is proven by "suitable technical means" — **with no amount threshold** (the CHF 1'000 figure is the exchange-transaction identification threshold, a different rule). Today Swissquote whitelists addresses and asks for screenshots. Keyline makes the proof cryptographic and automatic: right after deployment the Safe signs an EIP-712 attestation `{clientId, address, chainId, nonce}` inside the authenticated Swissquote session; the bank verifies it with ERC-1271 (ERC-6492 would extend this to not-yet-deployed accounts), binds the address to the KYC file and whitelists it in both directions. This is native AOPP (the Swiss protocol from 21 Analytics) without the screenshots. Who is the sending institution? Three cases: (1) Swissquote account → Keyline wallet: Swissquote orders the transfer to its own client's verified wallet — exactly the FINMA 02/2019 case, satisfied by the attestation; (2) Keyline → Swissquote account: Swissquote is the beneficiary institution and the sender is its own verified client; (3) Keyline → third party: Swissquote's key is not required and it does not order the transfer — sponsoring gas and screening a transaction is not ordering it — so Swissquote is **not the ordering institution**; the obligation sits with the receiving VASP, which can request a one-tap signed proof (and, with consent, a Swissquote-signed "KYC'd client" attestation) from the wallet. If co-signing were mandatory, a conservative reading would make Swissquote a payment service provider — which is why co-signing stays optional.

**Data protection.** The address↔client link is bank-secret data (Art. 47 BankA) and personal data under the revised FADP (2023); the guardian service is "critical data" under FINMA Circular 2023/1; key shares in Swiss HSMs are a selling point ("the material that matters most does not leave Switzerland").

Sources to cite in the README: FINMA Guidance 02/2019; FINMA Guidance 01/2026; MME "Provision of custody services for digital assets under Swiss law"; caplaw on DLT insolvency; 21 Analytics Swiss Travel Rule page; FATF Oct 2021 VA guidance; Sygnum × Safe RecoveryHub (Oct 2024); Swissquote wallet FAQ (whitelisting + screenshots).

---

## 7. Business case (15 points — one concrete paragraph)

Numbers (sources in `docs/SOURCES.md` of the kit → copy into README):

- Swissquote crypto income: **CHF 85.5 m (2024), CHF 85.7 m (2025, ~12 % of CHF 723 m revenue), CHF 14.6 m in H1 2026 (−66 %)** — CEO Marc Bürki: "volatility remained very low". Crypto revenue is cyclical.
- Client assets **CHF 96.3 bn**, **1.22 m accounts** (incl. 423 k Yuh), net new money CHF 5.1 bn in H1 2026.
- 18 % of Swiss residents hold crypto (HSLU/LUKB 2026); trust beats price: doubling fees barely changed choices; median allocation preferred a cantonal bank over Coinbase.
- 66 % of crypto users call self-custody important but only 33 % use one; 19 % cite complexity (Protocol Theory 2026).
- Today a Swissquote client who wants self-custody **must leave**: withdrawals to exchanges are unsupported, Yuh allows no transfers out, deposits need screenshots. Each 1 % of crypto activity retained ≈ CHF 0.86 m/yr.
- Bitcoin is assumed to be the crypto asset Swissquote clients hold most — a **working assumption**: Swissquote publishes no breakdown by asset, so no figure is cited (BUSINESS §6). v1 shows BTC but does not move it (SPEC §10). So the first value is **retention** plus the ETH / stablecoin / DeFi activity captured now; **BTC self-custody is the roadmap item that unlocks the larger pool** (same policy as a threshold key or a miniscript timelocked script, §10).
- In-app retention hooks (v2, DECISIONS #26–#27): "In your Swissquote account" section on every wallet open; "Move to Keyline" (Swissquote web) and "Back to Swissquote" (wallet) are bank actions; no generic top-up.
- PostFinance: 56 % of crypto clients had never used an investment product before (acquisition).
- Precedents: eToro bought Zengo (2-of-2 MPC, non-custodial, outside its MiCA licence) for ~USD 70 m (Apr 2026); Revolut opened self-custody withdrawals for 50 m users (Dec 2025); Coinbase Smart Wallet (passkeys + sponsored gas); Sygnum recovery on Safe.
- Existing price points: trading 1 %, staking reward share 20 %, custody fee CHF 20–50/quarter, MetaMask swap fee 0.875 %.

Draft paragraph:

> Swissquote earned CHF 85.7 m from crypto in 2025 but only CHF 14.6 m in H1 2026, because that income follows volatility. Meanwhile 18 % of Swiss residents hold crypto and the post-FTX trend is to move coins off platforms — and a Swissquote client who wants self-custody or DeFi today has to leave. Keyline's first value is retention: it keeps that client one tap from their account, and every 1 % of crypto activity kept in the ecosystem is ≈ CHF 0.86 m/yr. The wallet opens on "In your Swissquote account", and money moves in and out as bank actions, "Move to Keyline" and "Back to Swissquote". It also captures the ETH, stablecoin and DeFi activity that leaves today, with revenue that does not depend on volatility: a 0.5 % in-wallet swap fee (below MetaMask's 0.875 %), non-custodial staking at the existing 20 % reward share, a CHF 5/month "Protected" tier covering gas sponsorship, assisted recovery and transaction screening, plus existing on/off-ramp fees. Illustrative: 40 k wallets (5 % of non-Yuh accounts) × CHF 4 k swap volume × 0.5 % ≈ CHF 0.8 m, + CHF 50 m staked × 2.5 % × 20 % ≈ CHF 0.25 m, + 20 k Protected subscriptions ≈ CHF 1.2 m → ≈ CHF 2.25 m direct. Costs: wallet-ownership checks become automatic (no screenshots, no Satoshi tests), no custody insurance or key-theft liability for assets the client holds. The larger pool is Bitcoin, which we assume is what clients hold most: v1 shows it but does not move it, and BTC self-custody under the same policy — a threshold key or a miniscript timelocked script (§10) — is the roadmap item that unlocks it. Acquisition: at PostFinance 56 % of crypto clients were new to investing.

Why Bitcoin is not in v1:

> Keyline moves an asset only when it can give it the same protection as the rest of the wallet: the phone signs, and any 2 of the 3 recoverers can restore access after a waiting period. On Ethereum that comes from the Safe and its recovery module; Bitcoin needs a different tool, a 2-of-3 threshold key or a miniscript script with a timelock. That is on the roadmap, not in this prototype. Until then a client's Bitcoin stays in their Swissquote account, where it is today, and Keyline shows it there.

---

## 8. Bonus topics — exactly what earns the points

**Gasless (+10).** The bank sponsors gas via the Candide paymaster (free tier, no card). Who pays: Swissquote, as a cost of the Protected tier (≈ USD 0.02–0.10 per L2 tx in production; on testnet free). Abuse prevention: the paymaster API key lives only in the bank service; sponsorship is granted only after the policy engine approves the exact userOp (target allowlist, simulation passed, screening passed, daily gas cap per client, rate limit); the client can always pay own gas — self-custody preserved. Show "Network fee: paid by Swissquote" on the review screen and a "Sponsored gas today: 3/20" counter in the Security centre.

**Compliant dApp interaction (+10).** Before signing: (1) `eth_simulateV1` via viem `simulateCalls` with `traceAssetChanges` → "You will send 25 USDC to Lukas Meier. Your balance: 120 → 95 USDC. Nothing else changes." (2) Decode `approve`/`permit`/`setApprovalForAll` and warn in words ("This lets Uniswap spend up to ∞ USDC — we recommend 100"). (3) Screen counterparties against the OFAC SDN address list (0xB10C nightly list) and mention SECO; seed one test address flagged as sanctioned to demo a block. (4) dApp allowlist with a `/dapps` screen: an allowlisted mock dApp ("DemoSwap", neutral name) that requests `approve(∞)` — flagged danger with a suggested cap — and a non-allowlisted dApp that is blocked with "Request review"; this is the actual *dApp interaction* the bonus asks for. (5) Thresholds trigger Tier 2/3. Optional: ERC-7730 clear-signing descriptors for known contracts.

---

## 9. Real vs simulated (README table — copy)

| Component | Status |
|---|---|
| Passkey creation/assertion (WebAuthn) | Real |
| Safe account, Safe4337Module, EntryPoint, P-256 precompile, USDC transfer | Real, Base Sepolia |
| Bundler + paymaster sponsorship | Real (Candide testnet) |
| SocialRecoveryModule execute/cancel/finalize, 3-min grace | Real on-chain |
| Swissquote guardian (separate process, own key, own storage) | Real process; software key (prod: HSM) |
| Transaction simulation (`eth_simulateV1`) | Real |
| Sanctions screening | Real list (OFAC), **plus one seeded test address** labelled simulated |
| Bank identity check / KYC re-verification / e-ID | **Simulated** |
| Notifications (push/email) | **Simulated** (in-app event feed) |
| Partner guardian (assisted mode) and its organisational independence | **Simulated** (built only if time) |
| Swissquote account balance for "Top up from my Swissquote account" | **Simulated** balance; the on-chain USDC transfer from the bank's funder account is real |
| Safety key as a passkey-signer contract | **Prototype simplification**: a software key in the laptop profile; production: passkey-signer contract or hardware key |
| Swissquote account linkage, CHF prices | **Simulated** (static rates) |
| Bitcoin support | **Out of scope** (roadmap: Bitcoin miniscript with relative timelocks reproduces delay + veto natively, Liana-style; or a 2-of-3 TSS key under the same identity rules) |

---

## 10. How this beats the other teams

What most teams will submit: a MetaMask-style wallet with a seed phrase and a "recovery" that emails a backup; or a hosted-MPC SDK (Web3Auth/Turnkey) where the vendor holds the key — which violates "the client app must never hold its share / separate process" or hands control to a third party; or a 4337 demo without any recovery, or recovery without a delay (ZeroDev/Rhinestone defaults) that a judge will break in Q&A ("so a stolen guardian key moves my funds instantly?").

We win on: (1) the recovery has a **cancellable on-chain delay** — the one feature that makes "recovery that can't be abused" literally true; (2) the attacker demo is the climax and hits the bonus line verbatim; (3) the legal section uses the right test (power of disposal), cites the right texts, and admits the grey zone before being asked; (4) the business paragraph has Swissquote's own numbers from H1 2026; (5) the UI reads like a bank statement, not a crypto dashboard; (6) honesty: a Real/Simulated table and `SIMULATED` badges; (7) Bitcoin is addressed, not ignored: "4337 is EVM-only; on Bitcoin the same policy — owner key now, 2-of-3 recovery keys after a timelock — is expressible natively in miniscript (as Liana does), or via a 2-of-3 TSS key (cggmp21/FROST) — roadmap, not promised."

Swiss-flavoured details judges will notice: amounts formatted `de-CH` (`CHF 1'234.50`), the swiyu e-ID (live 1 Dec 2026) as the identity step, SECO alongside OFAC, Sygnum's precedent, Swissquote's own "USD 408.9 m lost to key compromise" figure as the opening hook.

---

## 11. 24-hour plan with gates

| Hours | Work | Gate (do not pass without it) |
|---|---|---|
| 0–1 | Run the build prompt; agents scaffold; verify tool versions, keys, faucets | `pnpm dev` runs the three core processes (wallet, bank, sq-guardian); partner-guardian is optional |
| 1–5 | Wallet creation (passkey → counterfactual Safe → sponsored deploy + enable recovery module + guardians: Safety key, Emergency card, Swissquote) → "Top up from Swissquote account" (bank funder → Safe, real on-chain) → USDC transfer | **Gate 1:** Basescan link of a sponsored USDC transfer signed by a passkey |
| 5–10 | Recovery: new device, identity check (simulated), sq-guardian + Safety key confirm, 3-min grace, finalize, owner cancel path, desk UI with operator login, `demo:stage-recovery` | **Gate 2:** recovery finalized on-chain; cancel path works; thief persona refused |
| 10–14 | Compliance bonus: simulation panel, screening, `/dapps` screen, tiers (Tier 2 Safety-key co-approval); gasless counter; ownership attestation (after deploy, ERC-1271); Exit-hatch screen; assisted mode + partner only if ahead of schedule | **Gate 3:** blocked transfer to the sanctioned address; approve(∞) flagged; attestation verified |
| 14–17 | Design pass (design agent audit → fixes), phone frame, PWA, seeding, Playwright E2E with virtual authenticator, GitHub Actions for lint + unit tests | `pnpm e2e` green; CI green; screenshots in README |
| 17–20 | Submission prompt: README, diagram, tables, legal/business, AI-tools disclosure; record 3-min backup video | Video exists; README complete |
| 20–24 | Rehearse twice with a timer; pre-fund and pre-deploy; sleep ≥ 2 h | — |

If Gate 1 is not reached by hour 7: drop Tier 2/3, drop assisted mode and the partner guardian entirely (explain it), drop the dApp screen (keep the review-panel simulation). If Gate 2 is not reached by hour 12: drop simulation diff (keep decoded calldata text), keep screening.

---

## 12. Before the hackathon (this week)

Check the rules on pre-written code; what follows is *account setup and learning*, not project code.

1. Candide account → API key (free Starter, no card). Confirm Base Sepolia bundler + paymaster endpoints and the SocialRecoveryModule 3-minute instance address (already verified on the Candide deployments page).
2. Five EOAs (sq-guardian, partner-guardian, bank relayer, bank verdict signer — no ETH needed —, funder) funded with **Base Sepolia ETH this week** — faucets are the #1 time sink (Coinbase CDP faucet, Superchain faucet, thirdweb faucet; Alchemy's needs mainnet ETH; or get Ethereum Sepolia ETH from the Google Cloud / pk910 PoW faucets and bridge via the Base Sepolia bridge). Fund the same keys on Ethereum Sepolia too, so the fallback chain is one env switch away.
3. Circle faucet: USDC on Base Sepolia to a throwaway address (20 USDC / 2 h).
4. Chrome: five profiles named *Lea · phone*, *Lea · laptop (Safety key)*, *Lea · new phone*, *Thief · stolen phone*, *Swissquote desk* — none signed in to Google, so passkeys stay local and "losing the phone" is just switching profiles. Keep DevTools virtual authenticators for Playwright only.
5. Spike in a throwaway repo: abstractionkit passkey Safe on Base Sepolia → sponsored transfer → recovery module execute/cancel/finalize. Write down every pitfall you hit (they go into CLAUDE.md "Known pitfalls").
6. Read the Candide passkeys + recovery docs, Safe passkeys docs, viem `simulateCalls` docs once.
7. Install the Swissquote and Yuh apps; screenshot their statement screens for the design agent's reference folder (`docs/design-refs/`, not committed if copyrighted).
8. Ask the organisers: demo length, slides allowed?, projector/HDMI, internet reliability (bring a phone hotspot), whether pre-registered accounts/keys are allowed.
9. Rehearse the pitch's first sentence until it is automatic.

## 13. Known technical pitfalls (feed into CLAUDE.md)

- Passkeys are bound to the rpId (domain). `localhost` is a secure context; a LAN IP over http is not. Pick the demo domain on day 0 (localhost for profiles; a cloudflared/ngrok HTTPS tunnel for the real phone) and never switch.
- Synced passkeys (iCloud/Google) survive "losing" a device. Use Chrome profiles not signed in to Google and say so in narration.
- Store the passkey public key (x, y) at registration — it is only available at creation. Keep a copy in the bank DB (not secret).
- Set the P-256 precompile verifier explicitly (`0x100`: RIP-7212 on Base Sepolia, EIP-7951 on Ethereum Sepolia since Fusaka, 14 Oct 2025); without it each signature check costs ~300–400 k gas and trips paymaster limits.
- After recovery the new passkey needs a `SafeWebAuthnSignerProxy` deployed through the factory; that proxy address is the new owner. Test this path on day 1.
- Do not mix EntryPoint versions: Safe4337Module v0.3.0 ↔ EntryPoint v0.7.
- Guardian EOAs need ETH for execute/finalize; fund them early. Candide rate limit 10 req/s — back off when polling receipts.
- `eth_simulateV1` on Base Sepolia: reported to work on Base's Flashblocks endpoint (`sepolia.base.org`) **(verify)**; Ethereum Sepolia public nodes vary; fallback to `simulateContract` + decoded calldata so the "What will happen" panel never blocks the demo.
- Sanctions lists are mainnet-only in practice; seed one fake sanctioned address for the demo and label it.
- **Signing order (EntryPoint v0.7):** paymaster fields are part of the signed hash. Flow is: build userOp with a dummy signature → bank sponsorship (`/userops/sponsor` attaches paymaster data) → passkey signs the **Safe EIP-712 SafeOp hash** (`SafeAccount.getUserOperationEip712Hash`), not the EntryPoint userOpHash → send. Sign-then-sponsor invalidates the signature.
- **Never hand-parse WebAuthn output.** DER → r/s and `clientDataJSON` field extraction come from library helpers (abstractionkit's `createWebAuthnSignature` / `ox`'s WebAuthnP256), never from your own code.
- **Demo passkeys:** use real platform passkeys in Chrome profiles that are *not* signed in to Google (so nothing syncs); "losing the phone" = switching to the "Lea · new phone" profile. Keep DevTools virtual authenticators for Playwright only (they vanish on reload).
- **The 3-minute grace period does not fit a 3-minute pitch.** `pnpm demo:stage-recovery` starts a recovery on a twin wallet ~2.5 min before you walk up; you show execute + countdown live on Lea's wallet, then finalize the staged one live and say so. If the slot is ≥ 5 min, do it all live.
- Bring a local Anvil fork + pre-deployed Safe as the offline fallback for the demo.
