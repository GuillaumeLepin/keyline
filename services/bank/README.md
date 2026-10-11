# `@keyline/bank` — the mocked Swissquote core

Fastify 5 service on `:4000`. It is the **policy and identity layer** of Keyline: passkey registration and login,
wallet registry, Travel-Rule attestation, policy engine (tiers, limits, allowlist), simulation + sanctions
screening, the paymaster gateway, recovery orchestration with a simulated identity check, the operator desk API
and the append-only event feed.

## What it can NEVER do (by construction)

- **It holds no guardian key.** Its three EOAs are a *verdict* key (signs `KeylineIdentityVerdict` so the guardian
  processes can check a verdict came from the bank — not a guardian, holds no ETH), a *relayer* key (pays gas to
  submit client-guardian signatures) and a *funder* key (holds test USDC for "Top up from my Swissquote account").
- **No function in this service signs a Safe transaction.** The client builds and signs every userOp; the bank
  only (1) recomputes the expected `callData` from the evaluated calls (`@keyline/chain.encodeCallData`,
  `protectTransactions`) to *verify* what it sponsors, (2) attaches paymaster data to an **unsigned** op, (3) relays
  the client-signed op to the bundler. It holds no passkey, no Safety key, no Emergency card. Removing this process
  leaves the client's Safe fully usable (SPEC F5).
- The desk API (`/desk/*`, `/recoveries/:id/operator`) can approve/refuse/override an *identity* verdict; it cannot
  move funds and cannot complete a recovery alone (threshold 2 of 3 is on-chain).

## Run

```sh
pnpm --filter @keyline/bank dev        # tsx watch --env-file=.env  (the service reads ONLY services/bank/.env)
curl -s localhost:4000/health
pnpm --filter @keyline/bank test
pnpm --filter @keyline/bank typecheck
```

Env vars: see the root `.env.example` (`BANK_*`, shared chain vars, `WALLET_RP_ID`, `WALLET_ORIGIN`,
`DESK_OPERATOR_TOKEN`, `SQ_GUARDIAN_URL`). `paymasterEnabled` is true whenever `BANK_CANDIDE_BUNDLER_URL` /
`BANK_CANDIDE_PAYMASTER_URL` is set (one Candide URL serves both; the public testnet endpoint needs no key —
`BANK_CANDIDE_API_KEY` is optional). With no URL, sponsorship is refused (502), never faked.

## Wave 1 flow (what the client calls, in order)

```
POST /wallets { pubKeyX, pubKeyY, credentialId, deviceLabel? }      → 201 { address, wallet }   (counterfactual Safe)
POST /pairings { wallet } → { code }  ·  laptop: POST /pairings/:code/claim { kind:'safety-key', address }
POST /wallets/:address/guardians { kind:'emergency-card', address }
POST /wallets/:address/guardians { kind:'swissquote' }               (bank reads sq-guardian GET /identity)
GET  /wallets/:address/guardians                                     → { requiredKinds, guardians, complete }
POST /policy/evaluate { kind:'protect', walletAddress, deviceLabel } → 201 PolicyDecision { decisionId, calls[4], callsHash }
   client: buildUserOp(pk, decision.calls) with dummy signature
POST /userops/sponsor { decisionId, userOp }                         → { userOp }  (paymaster fields added)
   client: passkey signs the SafeOp hash
POST /userops/send { decisionId, userOp }                            → { userOpHash }
GET  /userops/:hash                                                  → { status, txHash, blockNumber, walletStatus }
GET  /attestations/:wallet/challenge → { nonce, typedData }  ·  client signs through the Safe (chain.attestationSignatureFromPasskey)
POST /attestations { wallet, clientId, nonce, signature }            → 201 { verified, attestation }   (wallet.attested = true)
POST /topups { wallet, amountUsdc }                                  → 201 { txHash, accountBalanceChf, simulated }
POST /policy/evaluate { kind:'transfer', walletAddress, calls:[usdcTransfer], deviceLabel } → approve | step-up | block
GET  /me                                                             → client + SIMULATED account + wallet
```

Client routes take the passkey session cookie, or — with `DEMO_FAST_MODE=true` — an `X-Device-Label` header
(curl / Playwright). Refusals are `403 { error: 'policy-refused', message }` with the copy the UI shows verbatim.
Decisions expire after 10 minutes and are single-use once a userOp was sent with them.

Still `501 not-implemented-yet` (Wave 2/3): `POST /policy/:id/step-up`, `/recoveries*`, `POST /contacts`,
`GET /desk/queue`, `POST /mock/eid`.

## v2 journey (SPEC §10) — Swissquote web, handoff, laptop Safety key, moves

Everything below is SIMULATED except the on-chain transfers (see `docs/MOCKS.md`). Two separate cookies: `sq_web`
(Swissquote web, 2 h) and `keyline_session` (wallet passkey session). Schemas: `packages/shared/src/sq.ts`.

```
Laptop (Swissquote web, cookie sq_web)
  POST /sq/login { username: 'lea.keller' }       → SqSession          (no password; also 'lea', email, client id)
  GET  /sq/me                                     → SqSession · POST /sq/logout → { ok: true }
  GET  /sq/positions                              → SqPositionsResponse (sq_web OR wallet session / X-Device-Label)
  POST /handoff                                   → Handoff (201 new, 200 = this session's open code) · 10 min
  GET  /handoff/:code                             → Handoff (status open|claimed|expired; client + walletAddress
                                                    only for the session that opened it)
  GET  /sq/keyline                                → { wallets: [{ address, status, protected, createdAt }], currentSetup?: { code, status, walletAddress? } }
                                                    (also as `keyline` on GET /handoff/:code for the client's own session)
  GET  /sq/safety-key-request                     → { walletAddress|null, status: none|waiting|done, requestedAt?, safetyKeyAddress? }
                                                    bound to the wallet created with THIS session's latest claimed code, else 'none'
  POST /sq/safety-key { address }                 → Guardian (same registrar as the old /pairings claim)
  POST /sq/moves { asset: USDC|EURC|ETH, amount } → Move (201; idempotent with Idempotency-Key / requestId)
  GET  /sq/moves                                  → { moves: Move[] } (follows receipts: sent → confirmed|failed)
Phone
  POST /handoff/:code/claim                       → { client, onboardingToken, expiresAt } (no session; single use)
                                                    5 unknown/expired codes per IP / sliding 10 min → 429 too-many-attempts
  then send `X-Onboarding-Token: <onboardingToken>` (30 min) on POST /auth/passkey/register/options|verify and
  POST /wallets (and any client route during onboarding) → passkey + wallet bound to that client, handoff.walletAddress set
  GET  /sq/deposit-address                        → { address (= funder), label: 'Your Swissquote account', verified: true }
  POST /policy/evaluate { kind: 'transfer' | 'to-own-account', calls: [USDC transfer to the deposit address] }
                                                  → kind 'to-own-account', Tier 1 approve at any amount, sponsored, not screened
  GET  /userops/:hash (included)                  → SIMULATED ledger credit once, event `sq.credit`
```

Moves refuse unless the client's newest wallet is deployed **and** attested (403 "This wallet hasn't proven ownership
yet"); then the SIMULATED ledger is checked (403), the funder's real ETH / token balance is checked (502 with the real
numbers), the ledger is debited, the funder sends (ERC-20 `transfer` for USDC / EURC `EURC_ADDRESS`, native for ETH) and a
failed send is refunded (502, move recorded as `failed`). BTC, CHF cash and the ETF are `movable: false`; only BTC carries
`notMovableReason: 'bitcoin-roadmap'`. Events: `sq.login`, `sq.logout`, `handoff.opened`, `handoff.claimed`,
`handoff.wallet-bound`, `guardian.paired` (`via: 'sq-web'`), `sq.move.sent|failed|confirmed`, `sq.credit`.
The old `/pairings*` and `POST /topups` endpoints still work (old E2E) but the v2 UI does not use them.

## Layout

| File | Role |
|---|---|
| `src/config.ts` | zod-parsed env; derives the three public addresses (keys are never logged) |
| `src/db.ts` | SQLite (`better-sqlite3`, plain SQL, idempotent migrations). Triggers make `events` append-only at the DB level |
| `src/events.ts` | `recordEvent` + read; `GET /wallets/:address/events`, `GET /desk/events` |
| `src/webauthn.ts` | `@simplewebauthn/server` v13: register (platform, resident, UV required, ES256 only), login (discoverable), counter check, P-256 (x,y) via the library's COSE helpers |
| `src/auth.ts` | operator-token guard, JWT session (15 min, httpOnly cookie `keyline_session`) |
| `src/idempotency.ts` | `Idempotency-Key` header or body `requestId` → replayed response (`config.idempotent` routes) |
| `src/errors.ts` | `ApiError` → 400 validation · 401 · 403 policy/operator · 404 · 409 · 501 · 502 upstream |
| `src/seed.ts` | Lea Keller, contacts (addresses generated once with viem), dApps from `policy/allowlist.json` |
| `src/routes/core.ts` | health, events, passkeys, `/me`, contacts, dapps, mock inbox · `src/routes/stubs.ts` 501 placeholders |
| `src/routes/wallets.ts` | wallet registry (counterfactual address via `@keyline/chain.createPasskeyAccount`), recoverers, mode, pairing codes |
| `src/routes/policy.ts` · `src/policy/engine.ts` | `POST /policy/evaluate`; pure engine (table-tested), static CHF rate, sponsorship counter |
| `src/routes/userops.ts` | paymaster gateway + relay + status; `src/chain/calldata.ts` recomputes the expected callData, `src/chain/userop-codec.ts` string↔bigint |
| `src/routes/attestations.ts` | challenge (bytes32 nonce) + ERC-1271 verification through `@keyline/chain.attestation.verify` |
| `src/routes/topups.ts` | funder EOA → wallet USDC transfer (viem `writeContract`), only for attested wallets |
| `src/deps.ts` | the network edges (paymaster, bundler, RPC, guardian `/identity`) in one injectable bag; tests stub it |
| `src/screening/` · `src/chain/decode.ts` | Wave 1 screening stub + fallback decode (`simulated: true`) |

## Contracts

All request/response bodies are zod schemas in `packages/shared/src/schemas.ts`; responses are parsed through
the schema before being sent so drift is caught server-side. Everything simulated carries `simulated: true`
and is listed in [`docs/MOCKS.md`](../../docs/MOCKS.md).
