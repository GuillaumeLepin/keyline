# Keyline — Swissquote self-custody wallet (EPFL hackathon, Swissquote track)

You are building a judged hackathon prototype in ~24 h, solo, with Claude Code as the engineering team. Read `docs/STRATEGY.md` (why) and `docs/SPEC.md` (what, exactly) before writing code. The rubric is the product spec: core story (create → sign → lose → recover) first, bonuses second, polish third.

## Non-negotiables (violating any of these loses the track)

1. **No homemade cryptography.** All signing, hashing, key handling and verification is a library call: browser WebAuthn, `viem`, Candide `abstractionkit`, Safe contracts, Candide `SocialRecoveryModule`. Never implement signature schemes, key splitting, random key generation beyond `viem`'s `generatePrivateKey`, or custom verification.
2. **Honest mocks.** Anything simulated shows a `SIMULATED` badge in the UI (component `<SimulatedBadge/>`), is a dashed box in diagrams, and is listed in README's Real / Simulated / Out-of-scope table. Never fake a chain interaction; never fake a signature; never fake a passing identity check without the badge.
3. **Share holders are separate processes with their own storage.** `services/sq-guardian` (and, in assisted mode, `services/partner-guardian`) run as their own process, with their own SQLite file, their own `.env` and their own key. `apps/wallet` never receives, stores or sees any institutional guardian key. The bank service never holds a guardian key either; it has only a verdict-signing key and a gas relayer key. The client's own material (passkeys, the laptop Safety key, the Emergency card shown once and never stored) is the client's.
4. **A real transaction must be signed and sent to Base Sepolia** (fallback: Ethereum Sepolia) and recovery must actually execute/cancel/finalize on-chain.
5. **One story, in order:** create wallet → log in & sign → lose the phone → recover (with the attacker refused). Every screen exists to serve that story.
6. **Custody claims must be true on-chain, and phrased precisely.** Default mode guardians are `{Safety key, Emergency card, Swissquote}` threshold 2 — Swissquote is the only institution in the list, so "Swissquote's recovery key cannot act alone or with any partner" is verifiable on Basescan. Never claim "the app can never misbehave": the app holds client keys, so vendor trust remains (open-source, reproducible builds) — say so in the threat model.
7. **Signing order for EntryPoint v0.7:** build userOp with dummy signature → sponsor (paymaster fields) → passkey signs the SafeOp EIP-712 hash → send. Never sign before sponsoring.

## Stack (pin these; verify against docs at the start, don't guess APIs)

- Monorepo: `pnpm` workspaces + `turbo`. Node 22. TypeScript strict everywhere. `zod` for all boundaries.
- Chain: **Base Sepolia** (chainId 84532, 2 s blocks); fallback Ethereum Sepolia (11155111) with identical contract addresses. EntryPoint **v0.7**. Safe 1.4.1 + Safe4337Module v0.3.0 + SafeWebAuthnSharedSigner. P-256 precompile at `0x0000000000000000000000000000000000000100` (RIP-7212 on Base; EIP-7951 on Ethereum Sepolia).
- Account SDK: `abstractionkit` (Candide) — `SafeAccountV0_3_0`, WebAuthn owner, `CandidePaymaster`, `SocialRecoveryModule`. Fallback if blocked: `permissionless` `toSafeSmartAccount` + `toWebAuthnAccount` with hand-wired recovery calls.
- Bundler/paymaster: Candide (API key in `BANK_CANDIDE_API_KEY`, used **only by the bank service**).
- Recovery: Candide SocialRecoveryModule, 3-minute-grace testing instance (same address on Base Sepolia and Ethereum Sepolia; see `docs/SPEC.md §0`).
- Client: Next.js 15 (App Router), React 19, Tailwind v4 with our own tokens (no shadcn default theme), `@simplewebauthn/browser` for passkey ceremonies, `viem` for chain reads, Phosphor icons. Mobile-first in a 390×844 phone frame on desktop; installable PWA.
- Services: Node 22 + Fastify + `better-sqlite3` + `drizzle-orm` (or plain SQL). One SQLite file per service under `./data/<service>.sqlite` (git-ignored).
- Tests: `vitest` (unit: policy engine, screening, attestation verify), Playwright (E2E with CDP virtual authenticator for the whole story).
- Lint/format: `biome`. Conventional commits.

## Repository layout

```
apps/wallet            Next.js PWA: client app (+ /desk route group = Swissquote recovery desk UI, reads bank API)
services/bank          Fastify: identity (mock), policy engine, simulation, screening, travel-rule attestation, paymaster gateway, event feed
services/guardian-core Library shared by the two guardian processes (validation rules, module calls, events)
services/sq-guardian   Fastify: Swissquote recovery guardian (own key, own DB, own .env) — separate process
services/partner-guardian  Fastify: independent partner guardian (assisted mode only; mock org, own key, own DB, own .env) — separate process
packages/chain         abstractionkit/viem wrappers: account creation, userOps, recovery module calls, attestation signing/verify. No UI.
packages/shared        zod schemas + TypeScript types for every HTTP contract (single source of truth)
packages/ui            design system: tokens, primitives, patterns, <SimulatedBadge/>, formatting helpers (CHF, addresses)
e2e/                   Playwright: full story + attacker refusal
scripts/               fund/seed/pre-deploy/reset-demo
docs/                  STRATEGY.md, SPEC.md, DESIGN.md, ARCHITECTURE.md (mermaid), THREAT-MODEL.md, LEGAL.md, BUSINESS.md, DEMO.md, SOURCES.md
```

## Commands

- `pnpm i` · `pnpm dev` (wallet 3000, bank 4000, sq-guardian 4001 via turbo; `pnpm dev:partner` adds partner-guardian 4002)
- `pnpm test` (vitest) · `pnpm e2e` (Playwright, headless, virtual authenticator) · `pnpm lint`
- `pnpm demo:reset` (wipe DBs, seed, check balances) · `pnpm demo:predeploy` (deploy + protect a Safe for the fallback demo) · `pnpm demo:stage-recovery` (start a recovery on the twin wallet before the pitch) · `pnpm demo:open` (five Chrome profiles)

## Environment (one `.env` per process; `.env.example` at the root is the template; never commit real keys)

Shared: `CHAIN_ID`, `RPC_URL`, `USDC_ADDRESS`, `RECOVERY_MODULE_ADDRESS`, `DEMO_FAST_MODE`. Bank: `BANK_PORT`, `BANK_CANDIDE_API_KEY`, `BANK_CANDIDE_BUNDLER_URL`, `BANK_CANDIDE_PAYMASTER_URL`, `BANK_VERDICT_PRIVATE_KEY`, `BANK_RELAYER_PRIVATE_KEY`, `BANK_FUNDER_PRIVATE_KEY`, `BANK_JWT_SECRET`, `BANK_DB_PATH`, `DESK_OPERATOR_TOKEN`. Guardians: `GUARDIAN_KIND`, `GUARDIAN_PORT`, `GUARDIAN_PRIVATE_KEY`, `GUARDIAN_DB_PATH`, `BANK_VERDICT_ADDRESS`. Wallet: `NEXT_PUBLIC_BANK_URL`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_EXPLORER`, `WALLET_RP_ID` (default `localhost`), `WALLET_ORIGIN`. The guardian processes must never see bank or wallet variables.

## Agents (use them — the human is one person)

Agent definitions live in `.claude/agents/`. The orchestrator (main session) plans, assigns, integrates and runs gates; agents own directories:

| Agent | Owns | Never touches |
|---|---|---|
| `design-system` | `packages/ui`, `docs/DESIGN.md`, visual audit of every screen | business logic |
| `account-chain` | `packages/chain`, `scripts/spike-*`, `scripts/check-balances.ts`, `scripts/fund-*`, `scripts/keyline-cli.ts` | UI |
| `bank-backend` | `services/bank`, `packages/shared` contracts for bank | guardian keys |
| `guardian-services` | `services/guardian-core`, `services/sq-guardian`, `services/partner-guardian` | bank DB, UI |
| `wallet-client` | `apps/wallet` | chain internals (uses `packages/chain`) |
| `qa-demo` | `e2e/`, `scripts/demo-*`, `scripts/anvil-fork.ts`, `docs/DEMO.md`, `docs/screens/` | — |
| `docs-submission` | `README.md`, `SUBMISSION.md`, `docs/ARCHITECTURE.md`, `THREAT-MODEL.md`, `LEGAL.md`, `BUSINESS.md`, `SOURCES.md`, `AI-TOOLS.md` | code; `docs/DESIGN*.md` (design-system), `docs/DEMO.md` (qa-demo), `docs/MOCKS.md` (bank-backend), `docs/VERIFIED.md` (account-chain) |

Run independent agents in parallel. Every agent reads `docs/SPEC.md` first and reports back: files changed, how to verify, open risks.

## Definition of done for any feature

Works against Base Sepolia (or is labelled SIMULATED) · types shared through `packages/shared` · a vitest or Playwright test · no `any`, no `console.log` left in app code · UI passes the `design-system` checklist · README/docs updated by `docs-submission` if user-visible.

## Coding standards

Small modules, named exports, explicit error types (`Result`-style or thrown typed errors), `zod.parse` at every HTTP boundary, idempotent service endpoints keyed by request id, append-only `events` table in every service (what happened, when, by whom) — the desk reads it. No secrets in the client bundle (`NEXT_PUBLIC_*` only for non-secret config). Comments explain *why*, not what.

## Known pitfalls (learned, keep updated)

See `docs/STRATEGY.md §13`. Highlights: sponsor before signing (v0.7); the WebAuthn challenge is the SafeOp EIP-712 hash; never hand-parse WebAuthn output; rpId binding (never change the domain); demo with real platform passkeys in non-synced Chrome profiles, virtual authenticators only in Playwright; save passkey pubkey (x,y) at creation; set the P-256 precompile verifier explicitly; the Safe's owner is always a `SafeWebAuthnSignerProxy` (abstractionkit deploys + swaps it in the first userOp; after recovery the new passkey's proxy is deployed via the factory first); EntryPoint v0.7 only; fund guardian/relayer/funder EOAs early; Candide 10 req/s; one Candide URL serves bundler+paymaster (public no-key endpoint sponsors on testnet — dev fallback only); the recovery module's grace period has no getter (180 s, verified from bytecode) — show `executeAfter`; the 3-min grace does not fit a 3-min pitch (stage a twin recovery).

## Vocabulary in UI copy (never show the left column to a client)

private key → key · guardian → **recoverer** (the three are: your **Safety key**, your **Emergency card**, **Swissquote**) · MPC/threshold → "2 of 3 recoverers" · gas → network fee · signer → approver · seed phrase → never shown (the Emergency card is explained as "cannot spend, only restore after a waiting period") · userOp/bundler/entrypoint → never shown.
