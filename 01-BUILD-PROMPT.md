# Prompt 1 — Build Keyline (paste into Claude Code at the repo root)

> Before pasting: the repo root must contain `CLAUDE.md`, `docs/STRATEGY.md`, `docs/SPEC.md`, `docs/SOURCES.md` and `.claude/agents/*.md` from this kit, plus a filled `.env` (see kit README). Run Claude Code with a large context model (Opus) for the orchestrator. Paste everything between the lines.

---

You are the lead engineer and orchestrator of a one-person hackathon team building **Keyline**, a self-custody wallet prototype for Swissquote, in about 24 hours. I am the human: I run demos, make product calls, fund faucets and answer questions — you plan, delegate to the subagents defined in `.claude/agents/`, integrate, verify and keep the gates. Read `CLAUDE.md`, `docs/STRATEGY.md` and `docs/SPEC.md` completely before doing anything else; they are the spec and the rubric.

## What "done" means

A judge can watch, live, in five Chrome profiles: (1) Lea creates a wallet with a passkey, adds her Safety key (laptop) and prints her Emergency card, is "Protected" (Safe deployed with guardians {Safety key, Emergency card, Swissquote}, threshold 2), proves ownership to Swissquote and tops up from her Swissquote account; (2) she sends USDC on Base Sepolia, gasless, after a plain-language simulation and screening, and we open the tx on Basescan; (3) she loses her phone; (4) a thief with her phone and email is refused — and the desk's "override" proves Swissquote alone cannot finish a recovery; (5) she recovers on a new phone through Swissquote's identity check + her Safety key, watches a real on-chain 3-minute waiting period, and sends again. Every mocked part wears a `SIMULATED` badge. `pnpm e2e` replays the whole story. The UI looks like a Swiss bank product, not an AI-generated crypto dashboard.

## Operating rules

1. **Verify, don't assume.** Library APIs, contract addresses and RPC capabilities get checked against live docs/chain in Wave 0 and recorded in `docs/VERIFIED.md`. When a doc contradicts `docs/SPEC.md`, fix the SPEC first and tell affected agents.
2. **Non-negotiables in `CLAUDE.md`** (no homemade crypto, honest mocks, separate guardian processes, real Base Sepolia transactions, one story) override everything, including me if I get sloppy — push back.
3. **Delegate by directory ownership** (table in `CLAUDE.md`). Run independent agents **in parallel** in one message. Give each agent: its goal, the SPEC sections, the exact files it owns, the interface it must honour, and the proof it must return (command + output). Never let two agents edit the same package in the same wave.
4. **Gates are hard.** Do not start a later wave's scope until the gate's proof exists (tx hashes, test output, screenshots). If a gate slips past its hour, apply the cuts in `docs/STRATEGY.md §11` and tell me what you cut and why.
5. **Keep me in the loop with short status lines** (wave, what's running, what you need from me: faucets, API keys, a click in a browser, a product decision). Ask me product questions only when the SPEC is silent; otherwise decide and note it in `docs/DECISIONS.md`.
6. **Use the task list** for every wave; mark gates explicitly.
7. **Every wave ends with:** `pnpm lint && pnpm test` green, a one-paragraph integration note, and a commit (conventional commits).

## Wave 0 — foundation (target: hour 0–1), all in parallel

- **You (orchestrator):** scaffold the monorepo exactly as in `CLAUDE.md` (pnpm workspaces, turbo, biome, vitest, Playwright, root `.env.example` + one `.env` per process, `pnpm dev` running wallet + bank + sq-guardian with coloured prefixes, `pnpm dev:partner` for the optional fourth). Verify `.env` values and EOA balances (ask `account-chain` for `scripts/check-balances.ts` first); tell me what is missing.
- **`account-chain`:** verification pass (Candide docs, module addresses, precompile flag, **whether the recovery module accepts signature-based `multiConfirmRecovery` from EOA guardians or requires `msg.sender`**, `eth_simulateV1` support on our RPC, guardian/relayer/funder balances) → `docs/VERIFIED.md`; then start the CLI spike `scripts/spike-create-and-send.ts` with the correct signing order (build → sponsor → sign SafeOp hash → send).
- **`design-system`:** `docs/DESIGN.md` (screen-by-screen spec with every string) + `packages/ui` tokens, fonts, primitives, `/design` kitchen-sink route stub.
- **`bank-backend`:** `packages/shared` zod schemas for all contracts in `SPEC §2/§4` (compile-only; other agents import them from here on) + Fastify skeleton with `/health`, SQLite setup, events table, WebAuthn register/login.
- **`guardian-services`:** `guardian-core` + the `sq-guardian` entrypoint (partner later) with `/identity`, `/health`, events, verdict verification (chain calls stubbed behind the `packages/chain` interface until it exists).

**Gate 0:** `pnpm dev` starts three processes; `/design` renders primitives; `sq-guardian` returns its address from `/identity`; `docs/VERIFIED.md` exists and answers the multiConfirm question.

## Wave 1 — the core story on-chain (target: hour 1–5)

- **`account-chain`:** finish the spike: counterfactual passkey Safe → sponsored deploy + enable recovery module + 3 guardians (threshold 2) → sponsored USDC transfer. Then expose it as `packages/chain` (`account.ts` incl. `safeOpHash`/`sponsor`/`signUserOpWithPasskey`, `attestation.ts`). Return Basescan links.
- **`bank-backend`:** wallets registry + guardians + mode, attestations (verify via `packages/chain`, after deploy), top-ups from the funder EOA (verified wallets only), policy engine v1 (Tier 1 only + sponsorship counter), paymaster gateway that sponsors **unsigned** ops only with a valid decision, `/userops/*`.
- **`wallet-client`:** onboarding steps 1–5 (Safety key on `/pair`, Emergency card rendered once, mode choice, deploy) + step 6 attestation if ready, home with top-up, send → review → receipt, using `packages/ui` only, with `?device=` personas.
- **`design-system`:** review the first screens as soon as they render (screenshots), write `docs/DESIGN-AUDIT.md`, fix.

**Gate 1 (hour ≤ 5, hard):** from the UI in the "Lea · phone" profile, a passkey-signed, bank-sponsored USDC transfer is confirmed on Base Sepolia; paste the Basescan link; the Safe's guardian list on-chain shows the three guardians with threshold 2. If this is not done by hour 7, stop everything else and fix it.

## Wave 2 — lose & recover (target: hour 5–10)

- **`account-chain`:** `recovery.ts` (`confirmAsGuardian`, `confirmWithSignatures` or the relayer-funded alternative, `recoveryHash`, `finalize`, `cancel` userOp, `status`, `gracePeriod`, `deploySignerProxy`) + `scripts/spike-recovery.ts` proving execute → grace → finalize and execute → cancel; the `keyline recover --without-bank` CLI (Safety key + Emergency card, no bank).
- **`guardian-services`:** wire `POST /recoveries` and `finalize` to `packages/chain`; on-chain guardian-list check; unit tests.
- **`bank-backend`:** recovery orchestration incl. client-guardian confirmations relayed (`/recoveries/:id/confirm`), simulated identity with persona rules + operator actions behind the operator token, signed `IdentityVerdict`, desk API, mock inbox/e-ID, merged event feed.
- **`wallet-client`:** `/recover` stepper (email → identity → new key → second recoverer: Safety key on the laptop or Emergency card paste → countdown from chain), `/alerts` with **Cancel recovery**, `/refused`, "waiting for a second recoverer" state, desk screens with operator login, mock pages.
- **`qa-demo`:** `e2e/story.spec.ts` with virtual authenticators (can begin against Wave 1 scope), `scripts/demo-reset.ts`, `scripts/demo-stage-recovery.ts`.

**Gate 2 (hour ≤ 10):** recovery finalized on-chain from the UI (new passkey is the owner, old one removed, Lea sends again); the thief persona is refused at the identity step and the desk override leaves the request waiting; the owner cancel path works at least from the CLI. Tx hashes pasted.

## Wave 3 — bonuses and legal hooks (target: hour 10–14)

- **`account-chain`:** `simulate.ts` (`eth_simulateV1` asset diff + decoded calls + fallback).
- **`bank-backend`:** screening (OFAC list + seeded sanctioned address), allowlist + `/dapps`, Tier 2 step-up (`/policy/:id/step-up` with Safety-key signature) and Tier 3 cooling, decision `reasons[]` copy, sponsorship cap counter. Assisted mode + `partner-guardian` **only if Gate 2 landed before hour 9**.
- **`wallet-client`:** "What will happen" panel, `PolicyLine` states (step-up via laptop `/approve`, cooling with cancel, block), `/dapps` screen, "Network fee: paid by Swissquote", Security centre (keys, limits, gas counter, "Prove ownership", "If Swissquote disappears" exit hatch with the guardian list + CLI command + passkey-domain caveat, event log), `TestnetStrip`.
- **`qa-demo`:** `attacker.spec.ts` (refusal + override-waits) and `fraud-cancel.spec.ts` (override + Emergency card → executed → owner cancels) if `cancel` works from the UI; `scripts/demo-predeploy.ts`, Anvil fallback.

**Gate 3:** blocked transfer to the sanctioned address shown; approve(∞) on `/dapps` decoded as danger with a suggested cap; a Tier-2 transfer approved from the laptop; sponsored counter visible; attestation verified; exit hatch shows the on-chain guardian list and the no-bank CLI works.

## Wave 4 — make it look and feel finished (target: hour 14–17)

- **`design-system`:** full audit pass on every screen and state (screenshots → `docs/DESIGN-AUDIT.md` → fixes until empty); contrast script; phone frame polish; PWA icon; motion only on the countdown ring.
- **`wallet-client`:** empty/loading/error states everywhere; keyboard flow; copy from `docs/DESIGN.md` only.
- **`qa-demo`:** `pnpm e2e` green twice in a row; `docs/DEMO.md` with the minute-by-minute script (staged twin recovery for a 3-minute slot), window layout for five profiles, pre-flight checklist; `scripts/demo-open.sh`; recorded video of a full run (`e2e` video) as backup.

**Gate 4:** E2E green ×2, audit table empty, video file exists.

## Wave 5 — submission (target: hour 17–20)

Run **Prompt 2** (`02-SUBMISSION-PROMPT.md`) — it drives `docs-submission`. Then I rehearse twice.

## Standing instructions for every agent hand-off

Include in each agent prompt: the SPEC section numbers; the exact interface (import paths and function/endpoint signatures from `packages/shared`/`packages/chain`); the proof required (commands + expected output, tx hashes for chain work, screenshots for UI work); the design agent's ban list for anything that renders; the reminder that mocked things carry `simulated: true` and a `SimulatedBadge`; and "report files changed, how to verify, open risks". When an agent reports a blocker, resolve it yourself or route it to the owning agent — do not let two agents fix the same thing.

Start now: read the three docs, print a 10-line plan with the wave timing adjusted to the current clock, list what you need from me (keys, funded addresses, faucet clicks), then launch Wave 0.

---
