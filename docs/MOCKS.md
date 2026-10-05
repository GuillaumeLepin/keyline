# Mocks register (owned by `bank-backend`)

Every simulated thing in the bank service, where it lives, and how it is labelled. Rule (CLAUDE.md #2): a mocked
payload carries `simulated: true`, the UI shows `<SimulatedBadge/>`, diagrams use a dashed box. Nothing on-chain is
ever faked: no fake transaction, no fake signature, no fake passing identity check without the badge.

| What | Why it is mocked | Where in code | Label |
|---|---|---|---|
| **Client identity / KYC file** — Lea Keller `SQ-48213-LK`, kycLevel `full` | No real core-banking system | `services/bank/src/seed.ts` (`LEA`), table `clients` | Seed event `seed.applied` has `simulated: true`; README table |
| **Swissquote account balance (CHF)** decremented by top-ups | No real account | `clients.account_balance_chf`; `TopupResponseSchema.accountBalanceChf` | `TopupResponse.simulated: true` |
| **CHF rates** — 1 USDC = CHF 0.80, static | No market data | Wave 1: `services/bank/src/policy/rates.ts` | `PolicyDecision.reasons[]` mention "indicative rate (simulated)" |
| **Seeded contacts** — Lukas Meier (known, verifiedOwnership), Marta Rossi (new), "Sanctioned test address" | Demo data; addresses are real random EOAs generated once with viem `generatePrivateKey` and persisted | `seed.ts` `SEEDED_CONTACTS`, table `contacts.simulated` | `Contact.simulated: true` only on the sanctioned entry |
| **Sanctioned test address** flagged by screening | We cannot put a real SDN address in a demo wallet's contact list | `seed.ts` (`sanctionedSeedAddress`); Wave 1: `screening/seeded-sanctioned.json` | `Screening.simulatedHit: true`, `Screening.simulated: true` |
| **SECO list** in `listsChecked` | SECO publishes names, not addresses | Wave 1: `screening/` | `Screening.simulated: true` + `note` |
| **OFAC SDN ETH list** | Real list (0xB10C GitHub `lists` branch) with vendored snapshot fallback — *not* mocked; only the hit above is | Wave 1: `screening/ofac.ts` | `Screening.source` names the list/snapshot |
| **Mock inbox** (`GET /mock/inbox/:email`) — recovery OTP e-mails | No e-mail delivery (out of scope) | `routes/core.ts`, table `inbox` | `InboxMessage.channel: 'email-simulated'`, `simulated: true` |
| **swiyu e-ID form** (`POST /mock/eid`) and persona rules (`deviceLabel` contains "thief" or name mismatch → fail) | swiyu goes live 1 Dec 2026; the thief persona is scripted | Wave 1: `identity.ts`, `routes/recoveries.ts` | `EidResponse.issuer: 'swiyu-simulated'`, `IdentityVerdict.method: 'eid-simulated'`, `simulated: true` |
| **Identity verdict** signed by the bank verdict key | The *check* is simulated; the *signature* (EIP-712 `KeylineIdentityVerdict`) is real and verified by the guardians | `packages/shared/src/typed-data.ts`; Wave 1 `identity.ts` | `IdentityVerdict.simulated: true` |
| **Bank-mediated Safety-key pairing** (6-digit code) | Production would use a proper device-pairing protocol | Wave 1: `routes/wallets.ts` | Event `guardian.paired` with `simulated: true` |
| **Push notifications** | Out of scope | Events with `payload.channel: 'push-simulated'` | event payload |
| **Operator SSO** | Single shared `DESK_OPERATOR_TOKEN` | `src/auth.ts` | README |
| **Tier-2 step-up / Tier-3 cooling** | Policy-layer enforcement in the prototype (production: Safe AllowanceModule / delay module) | Wave 1: `policy/engine.ts` | `PolicyDecision.reasons[]`: "policy-layer enforcement in prototype" |
| **DemoSwap** and **Unknown dApp** | Mock dApps to show an allowlisted `approve(∞)` danger decode and a blocked request | `services/bank/policy/allowlist.json` | `Dapp.simulated: true` |

## Not mocked (real)

Passkey ceremonies (`@simplewebauthn/server`, real platform authenticators), the Safe + 4337 userOps on Base Sepolia,
Candide paymaster sponsorship (when `BANK_CANDIDE_API_KEY` is set — otherwise refused, never faked), the
SocialRecoveryModule confirm/execute/finalize/cancel, the ERC-1271 attestation verification, the OFAC SDN address list,
the EIP-712 verdict signature, the USDC top-up transfer from the funder EOA.

## Implementation notes

- SQLite driver: `better-sqlite3` 12 (native build succeeded on Node 24.8). `node:sqlite` was not needed.
- `events` is append-only twice: the TS module exports only `recordEvent`/`list*`, and SQLite triggers abort any
  `UPDATE`/`DELETE` on the table.
