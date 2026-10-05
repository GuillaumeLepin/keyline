# `@keyline/bank` — the mocked Swissquote core

Fastify 5 service on `:4000`. It is the **policy and identity layer** of Keyline: passkey registration and login,
wallet registry, Travel-Rule attestation, policy engine (tiers, limits, allowlist), simulation + sanctions
screening, the paymaster gateway, recovery orchestration with a simulated identity check, the operator desk API
and the append-only event feed.

## What it can NEVER do (by construction)

- **It holds no guardian key.** Its three EOAs are a *verdict* key (signs `KeylineIdentityVerdict` so the guardian
  processes can check a verdict came from the bank — not a guardian, holds no ETH), a *relayer* key (pays gas to
  submit client-guardian signatures) and a *funder* key (holds test USDC for "Top up from my Swissquote account").
- **No function in this service builds or signs a Safe transaction.** It never imports account-building code from
  `packages/chain`; it only attaches paymaster data to a userOp the client built and will sign. Removing this
  process leaves the client's Safe fully usable (SPEC F5).
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
`DESK_OPERATOR_TOKEN`). `BANK_CANDIDE_API_KEY` may be empty: `/health` then reports `paymasterEnabled: false`
and sponsorship is refused, never faked.

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
| `src/routes/core.ts` | live routes (Wave 0) · `src/routes/stubs.ts` 501 placeholders for Wave 1 |

## Contracts

All request/response bodies are zod schemas in `packages/shared/src/schemas.ts`; responses are parsed through
the schema before being sent so drift is caught server-side. Everything simulated carries `simulated: true`
and is listed in [`docs/MOCKS.md`](../../docs/MOCKS.md).
