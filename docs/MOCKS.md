# Mocks register (owned by `bank-backend`)

Every simulated thing in the bank service, where it lives, and how it is labelled. Rule (CLAUDE.md #2): a mocked
payload carries `simulated: true`, the UI shows `<SimulatedBadge/>`, diagrams use a dashed box. Nothing on-chain is
ever faked: no fake transaction, no fake signature, no fake passing identity check without the badge.

| What | Why it is mocked | Where in code | Label |
|---|---|---|---|
| **Client identity / KYC file** — Lea Keller `SQ-48213-LK`, kycLevel `full` | No real core-banking system | `services/bank/src/seed.ts` (`LEA`), table `clients` | Seed event `seed.applied` has `simulated: true`; README table |
| **Swissquote account balance (CHF)** — seeded CHF 12'500.00, debited by top-ups at the static rate | No real account | `clients.account_balance_chf`; `GET /me` → `account.simulated: true`; `POST /topups` | `TopupResponse.simulated: true`, `MeResponse.account.simulated: true` |
| **CHF rates** — 1 USDC = CHF 0.80, static | No market data | `services/bank/src/policy/rates.ts` | `PolicyDecision.fx.simulated: true`, `TopupResponse.fx.simulated: true`, reason "Indicative rate … (simulated)" |
| **Seeded contacts** — Lukas Meier (known, verifiedOwnership), Marta Rossi (new), "Sanctioned test address" | Demo data; addresses are real random EOAs generated once with viem `generatePrivateKey` and persisted | `seed.ts` `SEEDED_CONTACTS`, table `contacts.simulated` | `Contact.simulated: true` only on the sanctioned entry |
| **Sanctioned test address** flagged by screening | We cannot put a real SDN address in a demo wallet's contact list | `seed.ts` (`sanctionedSeedAddress`); `screening/index.ts` (Wave 3: `seeded-sanctioned.json`) | `Screening.simulatedHit: true`, `Screening.simulated: true` |
| **Screening (Wave 1)** — pass-through stub: only the seeded address hits; **SECO** in `listsChecked` | OFAC list loading is Wave 3; SECO publishes names, not addresses | `services/bank/src/screening/index.ts` | `Screening.simulated: true` + `note` |
| **OFAC SDN ETH list** | Real list (0xB10C GitHub `lists` branch) with vendored snapshot fallback — *not* mocked; only the hit above is | Wave 1: `screening/ofac.ts` | `Screening.source` names the list/snapshot |
| **Mock inbox** (`GET /mock/inbox/:email`) — recovery OTP e-mails | No e-mail delivery (out of scope) | `routes/core.ts`, table `inbox` | `InboxMessage.channel: 'email-simulated'`, `simulated: true` |
| **swiyu e-ID form** (`POST /mock/eid`) and persona rules (`deviceLabel` contains "thief" or name mismatch → fail) | swiyu goes live 1 Dec 2026; the thief persona is scripted | Wave 1: `identity.ts`, `routes/recoveries.ts` | `EidResponse.issuer: 'swiyu-simulated'`, `IdentityVerdict.method: 'eid-simulated'`, `simulated: true` |
| **Identity verdict** signed by the bank verdict key | The *check* is simulated; the *signature* (EIP-712 `KeylineIdentityVerdict`) is real and verified by the guardians | `packages/shared/src/typed-data.ts`; Wave 1 `identity.ts` | `IdentityVerdict.simulated: true` |
| **Bank-mediated Safety-key pairing** — `POST /pairings` → 6-digit code (10 min, one open code per wallet) · `GET /pairings/:code` (phone polls) · `POST /pairings/:code/claim` (laptop registers its Safety key) | Production would use a proper device-pairing protocol | `routes/wallets.ts`, table `pairings` | `Pairing.simulated: true`; events `pairing.opened`, `guardian.paired` with `simulated: true` |
| **Push notifications** | Out of scope | Events with `payload.channel: 'push-simulated'` | event payload |
| **Operator SSO** | Single shared `DESK_OPERATOR_TOKEN` | `src/auth.ts` | README |
| **Tier-2 step-up / Tier-3 cooling** | Policy-layer enforcement in the prototype (production: Safe AllowanceModule / delay module) | `policy/engine.ts` (Wave 1: step-up verdict only; `POST /policy/:id/step-up` and cooling are Wave 3) | `PolicyDecision.reasons[]`: "Policy-layer enforcement in the prototype (simulated)" |
| **Simulation fallback** — `provider: 'fallback'`: calls are decoded (ERC-20 `transfer`, `enableModule`, `addGuardianWithThreshold`) but no state simulation yet | `eth_simulateV1` panel is Wave 3 | `services/bank/src/chain/decode.ts` | `Simulation.simulated: true` when `provider === 'fallback'` |
| **`X-Device-Label` auth fallback** — with `DEMO_FAST_MODE=true`, client routes (`/wallets*`, `/policy/*`, `/attestations*`, `/topups`, `/pairings`, `/me`) accept this header instead of the passkey session cookie so curl / Playwright can drive the registry; a passkey registered this way (`POST /wallets` with an unknown `credentialId`) cannot log in, it only owns the Safe | No browser ceremony in E2E / curl | `src/auth.ts` (`requireClient`), `routes/wallets.ts` | `MeResponse.auth: 'device-label'`; events carry `deviceLabel`; disabled when `DEMO_FAST_MODE=false` |
| **Sponsored-gas counter** — 20 userOps / client / day, counted from the bank's `sponsorships` table (UTC day) | Policy bookkeeping, not an on-chain limit | `policy/engine.ts`, `store.ts` | reason copy "… of 20 free transactions left today" |
| **DemoSwap** and **Unknown dApp** | Mock dApps to show an allowlisted `approve(∞)` danger decode and a blocked request | `services/bank/policy/allowlist.json` | `Dapp.simulated: true` |

## Not mocked (real)

Passkey ceremonies (`@simplewebauthn/server`, real platform authenticators), the counterfactual Safe address
(abstractionkit CREATE2), the Safe + 4337 userOps on Base Sepolia, Candide paymaster sponsorship (`POST /userops/sponsor`
calls the real paymaster at `BANK_CANDIDE_PAYMASTER_URL` — the public testnet endpoint sponsors without a key, DECISIONS #11;
when no URL is set sponsorship is refused with 502, never faked), the bundler relay (`POST /userops/send`) and receipt lookup
(`GET /userops/:hash` → `eth_getUserOperationReceipt`), the callData check (`keccak256(userOp.callData)` must equal the
decision's `callsHash`, recomputed by the bank with `@keyline/chain.encodeCallData` — for the protect op including the
`createSigner` + `swapOwner` prefix abstractionkit prepends to a Safe's first userOp), the SocialRecoveryModule
confirm/execute/finalize/cancel, the ERC-1271 attestation verification (`@keyline/chain.attestation.verify` → viem
`verifyTypedData` against the deployed Safe; bytes32 nonce issued by `GET /attestations/:wallet/challenge`, single-use, 10 min),
the Swissquote recoverer address (read from the live `sq-guardian /identity`, the bank never sees the key), the EIP-712
verdict signature, the USDC top-up transfer from the funder EOA (`POST /topups` → viem `writeContract` on `RPC_URL`;
insufficient funder ETH/USDC → 502 with the real balances, never a fake hash).

## Implementation notes

- SQLite driver: `better-sqlite3` 12 (native build succeeded on Node 24.8). `node:sqlite` was not needed.
- `events` is append-only twice: the TS module exports only `recordEvent`/`list*`, and SQLite triggers abort any
  `UPDATE`/`DELETE` on the table.
