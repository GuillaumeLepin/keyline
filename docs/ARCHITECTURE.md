# Architecture

Owner: `docs-submission`. State of the code: the freeze of 6 Oct 2026, 09:15 CEST (commit `ae4f253`). Every box below is a process, package or contract that exists in the repository. Dashed boxes carry the word SIMULATED and are listed in `docs/MOCKS.md`. Anything the strategy promised that the code lacks is marked "not built". The WalletConnect parts (SPEC §11: WalletKit in the wallet, the Reown relay, `apps/demoswap`, the bank's `/dapp-sessions`) were added on 11 Oct 2026 from the code as it stands that day.

## 1. Components

```mermaid
flowchart LR
  subgraph Client["Client devices (browser, PWA)"]
    W["apps/wallet · Next.js 15 · :3000<br/>(client) onboarding, home, send, recover, alerts, security<br/>(laptop) pair, approve · (desk) queue, request, audit"]
    PK[("Phone passkey<br/>platform authenticator, P-256<br/>never leaves the device")]
    SK[("Safety key<br/>laptop browser profile, IndexedDB<br/>software EOA (viem generatePrivateKey)")]
    EC[("Emergency card<br/>EOA key shown once at onboarding<br/>never stored by the app")]
    WK["WalletKit (Reown) in apps/wallet<br/>one per browser profile<br/>sessions in that profile's storage"]
  end

  DS["apps/demoswap · Next.js · :3100<br/>separate process, wagmi + Reown AppKit (WalletConnect)<br/>test dApp: SIWE, approve, 1 USDC test 'swap' to a fixed vault"]
  RELAY["WalletConnect relay (Reown)<br/>external third-party service<br/>end-to-end encrypted, signs nothing"]
  TP["Any third-party Base Sepolia dApp<br/>(e.g. Reown AppKit Lab)"]

  subgraph Bank["services/bank · Fastify · :4000 (Swissquote core, mocked)"]
    B["policy engine · screening · simulation<br/>paymaster gateway · userOp relay<br/>attestation verify · recovery orchestration · desk API"]
    BK[("verdict key 0xba9a…A23b<br/>relayer key 0x11a2…F8a9<br/>funder key 0x482B…458A<br/>no guardian key")]
    BD[("bank.sqlite<br/>append-only events")]
    ID["Identity / e-ID check<br/>persona rules<br/>SIMULATED"]
    INBOX["Mock inbox (OTP e-mail)<br/>SIMULATED"]
    BAL["Swissquote account balance CHF<br/>SIMULATED"]
    FX["CHF rate 1 USDC = 0.80<br/>SIMULATED"]
    SSO["Operator SSO<br/>shared DESK_OPERATOR_TOKEN<br/>SIMULATED"]
    SANC["Seeded sanctioned address<br/>SIMULATED (OFAC list itself is real)"]
    PUSH["Push notifications<br/>in-app alerts feed<br/>SIMULATED"]
  end

  subgraph SQG["services/sq-guardian · Fastify · :4001"]
    G["verifies the bank verdict<br/>signs ExecuteRecovery · finalizes"]
    GK[("guardian key 0x01Bb…4dE8<br/>own .env, own sq-guardian.sqlite")]
  end

  subgraph PG["services/partner-guardian · :4002"]
    P["same guardian-core code<br/>not built into the story<br/>assisted mode not built<br/>SIMULATED"]
  end

  subgraph Pkgs["packages (no process)"]
    CH["packages/chain<br/>abstractionkit + viem wrappers<br/>account, recovery, attestation, simulate, relayer"]
    SH["packages/shared<br/>zod schemas, EIP-712 typed data"]
    UI["packages/ui<br/>tokens, primitives, SimulatedBadge"]
    GC["services/guardian-core<br/>rules, verdict verify, chain port"]
  end

  CANDIDE["Candide bundler + paymaster<br/>https://api.candide.dev/public/v3/84532<br/>public testnet endpoint, no key, no SLA"]

  subgraph Chain["Base Sepolia (chainId 84532)"]
    EP["EntryPoint v0.7<br/>0x0000000071727De22E5E9d8BAf0edAc6f37da032"]
    SAFE["Safe 1.4.1 (SafeL2 0x29fc…C762) + Safe4337Module v0.3.0 0x75cf…c226<br/>owner = SafeWebAuthnSignerProxy of the phone passkey<br/>signer factory 0xF748…2Fbf · P-256 precompile 0x…0100"]
    REC["Candide SocialRecoveryModule, 3-minute instance<br/>0x949d01d424bE050D09C16025dd007CB59b3A8c66<br/>guardians [Swissquote, Emergency card, Safety key] · threshold 2"]
    USDC["USDC (Circle) 0x036C…CF7e"]
    RS["Sponsored relayer Safe<br/>0x8Fad…361a, owned by the relayer key"]
  end

  W --- PK
  W --- SK
  W -. shown once .- EC
  W --- WK
  DS <-->|"session, requests, results (encrypted)"| RELAY
  TP <-->|"encrypted"| RELAY
  RELAY <-->|"encrypted"| WK
  W -->|"POST /dapp-sessions (topic, Verify context)<br/>POST /policy/evaluate {kind: dapp, topic}"| B
  DS -->|"verifyMessage (ERC-1271), receipts"| SAFE
  W -->|"policy, sponsor, send, attest, recover"| B
  W -->|"gas estimate, unsigned op"| CANDIDE
  B --- BK
  B --- BD
  B -.- ID
  B -.- INBOX
  B -.- BAL
  B -.- FX
  B -.- SSO
  B -.- SANC
  B -.- PUSH
  B -->|"signed verdict → signature"| G
  G --- GK
  B -.->|"not wired"| P
  B -->|"pm_ sponsor, eth_sendUserOperation"| CANDIDE
  CANDIDE --> EP --> SAFE
  SAFE --> USDC
  SAFE --- REC
  RS -->|"multiConfirmRecovery, finalize, createSigner"| REC
  B -->|"relayer key signs"| RS
  G -->|"finalizeRecovery (own EOA or own sponsored Safe)"| REC
  W -->|"cancelRecovery() userOp via the Safe"| REC
  W --> CH
  B --> CH
  G --> GC --> CH
  W --> UI
  W --> SH
  B --> SH
  G --> SH

  classDef sim stroke-dasharray: 6 4, stroke-width: 2px;
  class ID,INBOX,BAL,FX,SSO,SANC,PUSH,P sim;
```

Notes on the diagram.

- WalletConnect: the relay only carries end-to-end encrypted messages between a dApp and the wallet's WalletKit; it holds no key to the Safe, cannot read the requests and cannot sign anything. DemoSwap is a dApp like any other: it reaches Keyline only through the relay, and the wallet answers with the bank's policy in the loop (sequence below).
- The wallet builds every unsigned userOp itself (`apps/wallet/src/lib/chain.ts`, `buildUserOp` from `packages/chain`) and estimates gas on the public Candide endpoint. The bank only sponsors and relays (DECISIONS #14).
- The partner guardian is the same `guardian-core` server with `GUARDIAN_KIND=partner`. No code adds it to a guardian set. Assisted mode is not built; onboarding shows it greyed out with a SIMULATED badge.
- The OFAC SDN ETH address list is real (live fetch at startup, vendored snapshot offline, `services/bank/src/screening/ofac.ts`). Only the one seeded demo address is simulated.
- Verified contract addresses: `docs/VERIFIED.md` §2. Demo EOAs: `docs/ADDRESSES.md`.

## 2. What each process can and cannot do

| Process | Holds | Can | Cannot |
|---|---|---|---|
| `apps/wallet` (phone, laptop, desk views of one Next.js app) | Only client material: the passkey lives in the platform authenticator; the Safety key EOA sits in the laptop profile's IndexedDB; the Emergency card is generated with viem and displayed once; the Safe address is persisted in `localStorage` (`keyline.wallet`) and never re-derived | Build unsigned userOps, ask the passkey to sign the SafeOp hash, send `cancelRecovery()` as the owner, sign `ExecuteRecovery` with the Safety key, show decoded calls and the simulation before signing | Sponsor gas (no Candide key), issue identity verdicts, act as any guardian other than the client's own, see any institutional key |
| `services/bank` (:4000) | Verdict key, relayer key, funder key, bank.sqlite | Evaluate policy (tiers, limits, allowlist, screening, simulation), attach paymaster data to an unsigned userOp whose `callData` hashes to the evaluated calls, relay a client-signed userOp, verify the ERC-1271 attestation, sign an EIP-712 identity verdict, collect guardian signatures and submit one `multiConfirmRecovery`, deploy the new passkey's signer proxy, run the finalizer loop, serve the desk | Build or sign a Safe transaction (it holds no owner key and recomputes `encodeCallData` only to verify), act as a guardian (the verdict key is not in any guardian list), move funds, finalize before `executeAfter` (the module refuses) |
| `services/sq-guardian` (:4001) | Guardian key, sq-guardian.sqlite; refuses to start with any `BANK_*` secret or `WALLET_*` variable in its environment | Verify the bank's verdict signature against `BANK_VERDICT_ADDRESS`, check it is an on-chain guardian of that wallet, sign `ExecuteRecovery` at the live module nonce (one approval of two), record an execution after checking the chain, send `finalizeRecovery` after `executeAfter` | Build any Safe transaction (the chain port exposes recovery reads, `confirmRecovery`, `finalizeRecovery` only), reach the threshold alone, finalize early, act with the partner on a default-mode wallet (the partner is not in the guardian list) |
| `services/partner-guardian` (:4002) | Its own key and SQLite | Start, answer `/identity` and `/health` | Anything in the story: it is never a guardian of any Safe the prototype creates. Not built into onboarding or recovery |
| `apps/demoswap` (:3100) | Nothing but its own UI state; it never sees a key | Propose a WalletConnect session, ask for sign-in, signatures, transactions and batches, verify the Safe's signature with viem `verifyMessage`, read receipts | Sign for the client, reach the bank (except a server-side read of the seeded sanctioned address via `GET /contacts`), bypass the wallet's review |
| WalletConnect relay (Reown) | Encrypted envelopes in transit | Deliver messages between a dApp and the wallet | Read them (end-to-end encrypted), sign anything, approve a session or a request |
| Candide bundler + paymaster | Sponsorship policy | Include userOps, pay gas on the testnet | Sign for anyone; the bank's sponsorship decision gates which ops reach it |

## 3. Sequence diagrams

### F1 Create and protect

```mermaid
sequenceDiagram
  autonumber
  participant P as Lea · phone (wallet)
  participant L as Lea · laptop (wallet /pair)
  participant B as bank :4000
  participant G as sq-guardian :4001
  participant C as Candide (bundler + paymaster)
  participant S as Base Sepolia (EntryPoint, Safe, module)

  P->>P: WebAuthn create (platform passkey, P-256 x,y saved)
  P->>B: POST /wallets {pubKeyX, pubKeyY, credentialId}
  B-->>P: counterfactual Safe address (abstractionkit CREATE2)
  P->>B: POST /pairings → 6-digit code (SIMULATED pairing channel)
  L->>L: viem generatePrivateKey → Safety key (IndexedDB)
  L->>B: POST /pairings/:code/claim {safety-key, address}
  P->>P: viem generatePrivateKey → Emergency card, shown once, dropped
  P->>B: POST /wallets/:a/guardians {emergency-card, address}
  P->>B: POST /wallets/:a/guardians {swissquote}
  B->>G: GET /identity
  G-->>B: guardian address 0x01Bb…4dE8 (key never leaves G)
  P->>B: POST /policy/evaluate {kind: protect}
  B-->>P: decision: calls = enableModule + 3 × addGuardianWithThreshold (1,2,2), callsHash
  P->>C: eth_estimateUserOperationGas (unsigned op, dummy signature)
  P->>B: POST /userops/sponsor {decisionId, userOp}
  B->>B: keccak256(userOp.callData) == callsHash (incl. createSigner + swapOwner prefix)
  B->>C: pm_sponsorUserOperation
  B-->>P: userOp with paymaster fields
  P->>P: passkey signs the SafeOp EIP-712 hash (WebAuthn challenge)
  P->>B: POST /userops/send {decisionId, signed userOp}
  B->>C: eth_sendUserOperation
  C->>S: handleOps → deploy Safe, createSigner, swapOwner, enableModule, addGuardian × 3
  P->>B: GET /userops/:hash (poll)
  B-->>P: included, txHash → receipt with Basescan link
  P->>B: GET /attestations/:wallet/challenge → bytes32 nonce, typed data
  P->>P: passkey signs SafeMessage(Attestation{clientId, address, chainId, nonce})
  P->>B: POST /attestations {signature}
  B->>S: eth_call Safe.isValidSignature (ERC-1271) → 0x1626ba7e
  B-->>P: attested; address bound to the KYC file (whitelist both ways)
```

Signing order is fixed by EntryPoint v0.7: build with a dummy signature, sponsor, sign the SafeOp hash, send. The passkey never signs before the paymaster fields are in the op.

### F2 Sign a transfer

```mermaid
sequenceDiagram
  autonumber
  participant P as Lea · phone (wallet)
  participant L as Lea · laptop (Safety key)
  participant B as bank :4000
  participant R as RPC sepolia.base.org
  participant C as Candide
  participant S as Base Sepolia

  P->>B: POST /policy/evaluate {kind: transfer, calls: [USDC.transfer(to, amount)]}
  B->>B: screening: OFAC SDN ETH list (real) + seeded test address (SIMULATED), SECO note
  B->>R: eth_simulateV1 (viem simulateCalls, traceAssetChanges), 8 s timeout → decode-only fallback
  B->>B: tiers: CHF value at the static rate (SIMULATED) → approve | step-up | cooling | block
  B-->>P: decision {verdict, decodedCalls, assetChanges, screening, sponsorship, reasons}
  alt step-up (Tier 2, above CHF 1'000/day)
    L->>B: POST /policy/:id/step-up {Safety-key EIP-712 KeylinePolicyStepUp signature}
    B->>B: verifyTypedData against the registered Safety key → approve (policy layer only)
  else cooling (Tier 3, new recipient or > CHF 10'000)
    B-->>P: coolingUntil = now + 60 s (demo value); POST /policy/:id/cancel stops it
  else block
    B-->>P: 403 policy-refused with the reason shown verbatim; no sponsorship
  end
  P->>C: estimate gas (unsigned op)
  P->>B: POST /userops/sponsor {decisionId, userOp}
  B->>B: callData hash == decision.callsHash
  B->>C: pm_sponsorUserOperation
  B-->>P: op with paymaster fields
  P->>P: passkey signs the SafeOp hash
  P->>B: POST /userops/send
  B->>C: eth_sendUserOperation
  C->>S: handleOps → Safe executes USDC.transfer
  P->>B: GET /userops/:hash → included, txHash
```

Enforcement note. Tier 2 and Tier 3 are policy-layer verdicts: they decide whether the bank sponsors and relays. A userOp paid with the Safe's own ETH through any bundler bypasses them. The on-chain production path (Safe AllowanceModule, threshold 2 above the allowance, delay module) is not built. The laptop screen that signs the Tier-2 step-up (`apps/wallet/app/(laptop)/approve/page.tsx`), the phone's step-up and cooling states (`send/review/page.tsx`) and the bank routes are all built; Gate 3 confirmed a Tier-2 operation on-chain (wallet `0x3cfC079f1fFA8C66DC40B2B115fAcc8963F0D7E2`, DECISIONS #22).

### F2b dApp transaction over WalletConnect (SPEC §11)

```mermaid
sequenceDiagram
  autonumber
  participant D as dApp (DemoSwap :3100 or any Base Sepolia dApp)
  participant X as WalletConnect relay (Reown)
  participant K as WalletKit in Keyline (Lea · phone)
  participant B as bank :4000
  participant L as Lea · laptop (Safety key)
  participant C as Candide
  participant S as Base Sepolia

  Note over D,K: Pairing: Lea pastes or scans the wc: link. Proposal → Reown Verify context (VALID / INVALID / UNKNOWN, isScam, origin)
  K->>B: POST /dapp-sessions {topic, metadata, verify}
  B-->>K: verdict allow | block (INVALID, scam, origin host ≠ app URL host → no Connect button, session rejected)
  K->>X: approveSession eip155:84532:<Safe>
  X->>D: session (end-to-end encrypted)
  D->>X: eth_sendTransaction {to, data, value}
  X->>K: request (topic, id, verifyContext)
  K->>B: POST /policy/evaluate {kind: dapp, topic, origin, calls}
  B->>B: session active for this wallet? identity: allowlisted host / first time / unverified / blocked
  B->>B: screening: every call target, decoded address and address-shaped word of calldata
  B->>S: eth_simulateV1 (asset changes)
  B-->>K: decision {verdict, tier, decodedCalls, assetChanges, suggestedCap?, sponsorship}
  alt block (sanctions hit, blocked identity, revert)
    K->>X: error 4001 + policy reason
    X->>D: error
  else step-up (first-time or unverified app, approve(∞), above the daily limit)
    L->>B: POST /policy/:id/step-up (Safety-key EIP-712 signature)
  end
  K->>K: review sheet (same as /send/review, plus the dApp identity row), Lea approves
  K->>B: POST /userops/sponsor {decisionId, userOp}
  B->>B: keccak256(callData) == decision.callsHash
  B->>C: pm_sponsorUserOperation (within 20 sponsored ops a day)
  B-->>K: op with paymaster fields
  K->>K: passkey signs the SafeOp hash
  K->>B: POST /userops/send
  B->>C: eth_sendUserOperation
  C->>S: handleOps → Safe executes the dApp's call
  K->>B: GET /userops/:hash (until included, about 4 s)
  K->>X: result = bundle transaction hash
  X->>D: tx hash (waitForTransactionReceipt resolves, logs carry the inner events)
  K->>B: POST /dapp-sessions/:topic/events (outcome, txHash)
```

`wallet_sendCalls` takes the same path with every call in one batched userOp and answers `{ id: userOpHash }`; `wallet_getCallsStatus` then answers the EIP-5792 v2 shape from the bundler receipt. Sign-in, `personal_sign` and typed data stay in the wallet: decoded on a review sheet, signed by the passkey as a Safe message (ERC-1271), answered through the relay and logged as a bank event; they do not go through `/policy/evaluate`. A declined request answers `USER_REJECTED`; one past its WalletConnect expiry is shown as expired.

### F3 Lose the phone and recover (Option A, DECISIONS #15)

```mermaid
sequenceDiagram
  autonumber
  participant N as Lea · new phone (wallet /recover)
  participant L as Lea · laptop (wallet /approve)
  participant B as bank :4000
  participant G as sq-guardian :4001
  participant RS as Relayer (sponsored relayer Safe 0x8Fad…361a or relayer EOA)
  participant M as SocialRecoveryModule 0x949d…8c66

  N->>N: WebAuthn create → new passkey (x, y)
  N->>B: POST /recoveries {wallet, email, new passkey}
  B->>RS: factory.createSigner(x, y) → new SafeWebAuthnSignerProxy (real tx)
  B-->>N: request id; 6-digit code sent to the mock inbox (SIMULATED e-mail)
  N->>B: code from GET /mock/inbox/:email
  N->>B: POST /recoveries/:id/identity {e-ID form from POST /mock/eid}
  B->>B: persona rules (SIMULATED identity check): device label, e-ID name vs client file
  B->>B: sign EIP-712 KeylineIdentityVerdict {requestId, wallet, newOwner, verdict: pass} with the verdict key (real signature)
  Note over B: DEMO_FAST_MODE signs at once; otherwise the desk operator approves (SIMULATED SSO)
  B->>G: POST /recoveries {request, newOwners: [proxy], newThreshold: 1, verdict}
  G->>G: rule 1 verify verdict signature vs BANK_VERDICT_ADDRESS · rule 2 verdict == pass · rule 2b bound to this request/wallet/owner
  G->>M: isGuardian(wallet, self)? nonce(wallet)? no execution in the last 24 h (rule 4, 5)
  G->>G: signTypedData ExecuteRecovery(wallet, newOwners, 1, nonce) with the guardian key
  G-->>B: {signer: 0x01Bb…4dE8, signature, nonce}  (1 of 2)
  L->>B: GET /recoveries/:id/typed-data
  L->>L: Safety key signs the same ExecuteRecovery hash
  L->>B: POST /recoveries/:id/confirm {signer, signature}
  B->>B: verifyTypedData, nonce still current, signer is a registered client recoverer
  B->>RS: multiConfirmRecovery(wallet, [proxy], 1, [sq, safety] sorted, execute = true)
  RS->>M: approvals 2 ≥ threshold 2 → executeAfter = block.timestamp + 180 s
  B->>G: POST /recoveries/:id/executed {txHash, executeAfter}
  G->>M: status(wallet).pending and executeAfter match? → record, arm the 24 h rule
  N->>B: GET /recoveries/:id (poll) → executeAfter read from the module
  Note over N: countdown shows the on-chain deadline; the old phone could still cancel here
  loop bank finalizer loop
    B->>G: POST /recoveries/:id/finalize (after executeAfter)
    G->>M: finalizeRecovery(wallet) from the guardian EOA or its own sponsored Safe
  end
  M-->>N: getOwners() = [new proxy]; "Welcome back, Lea"
```

Proofs. Gate 2 run from the UI (DECISIONS #20): execute `0xe56ca70d…2d7f5`, finalize `0xad898b42…13e53`, Safe `0xeF2c271d40d72bc5Dc4fef277846CA66886E2cce`, owner `0x07dDC4D0DfF95022806Ec4931EBB8cfF89fd016A`. Earlier chain-level proofs with 0 ETH on every EOA: `docs/VERIFIED.md` §12.

### F4 Attacker refused; override still waits

```mermaid
sequenceDiagram
  autonumber
  participant T as Thief · stolen phone (wallet /recover)
  participant B as bank :4000
  participant D as Swissquote desk (wallet /desk)
  participant G as sq-guardian :4001
  participant M as SocialRecoveryModule
  participant O as Lea (owner, alerts)

  T->>T: locked phone: the passkey needs biometrics → cannot sign
  T->>B: POST /recoveries (new passkey, Lea's e-mail)
  B-->>T: code to the inbox the thief controls → OTP step passes
  T->>B: POST /recoveries/:id/identity
  B->>B: persona rules: device label "Thief" → verdict fail, reasons ["ID document name mismatch", "liveness check failed"] (SIMULATED check, real signature)
  B-->>T: /refused — "Refused — identity mismatch"
  B-->>O: alert "Recovery attempt refused" (push SIMULATED, in-app feed)
  B-->>D: queue shows the refused request with reasons
  Note over D: Bonus narration: "even if the bank were fooled"
  D->>B: POST /recoveries/:id/operator {action: override}
  B->>B: sign a pass verdict (method kyc-reverify-simulated)
  B->>G: POST /recoveries {verdict: pass}
  G-->>B: ExecuteRecovery signature (1 of 2)
  B-->>D: status awaiting-guardians, waitingFor: second-recoverer
  Note over M: never called: approvals 1 < threshold 2. No laptop, no card, no recovery.
```

Variant F4b, fraud while Lea still has her phone: if the attacker also held the Emergency card, the request would execute and Lea's phone would show the alert with a Cancel button. The cancel is an owner userOp (`POST /policy/evaluate {kind: cancel-recovery}` → sponsor → passkey signs → send → `cancelRecovery()`), proven on-chain from the CLI (`docs/VERIFIED.md` §12b, tx `0x5ba3e0db…a931f9`). The in-app path exists in `/alerts`; its on-chain run from the UI is not recorded.

## 4. Data and keys per process

| Store | Process | Content |
|---|---|---|
| `services/bank/data/bank.sqlite` | bank | clients (seeded Lea, SIMULATED balance), wallets, pairings, guardians, decisions, sponsorships, attestations, recoveries, inbox, events (append-only, SQLite triggers); dApp sessions (topic, metadata, Verify context, status) |
| `services/sq-guardian/data/sq-guardian.sqlite` | sq-guardian | recovery confirmations, executions, events (append-only) |
| Browser profile | wallet | `localStorage`: device label, Safe address, local transfer list, pending recovery; IndexedDB: Safety key (laptop only); WalletKit's default store (IndexedDB / `localStorage`): WalletConnect sessions and their encryption keys, per profile |
| Platform authenticator | phone | passkey private key (never exported) |
| Paper | client | Emergency card (32-byte hex) |

Environment: one `.env` per process from the root `.env.example`. The guardian process refuses to start if it sees bank or wallet variables.
