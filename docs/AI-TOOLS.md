# AI tools used

Owner: `docs-submission`. Final pass, 6 Oct 2026, after the application code freeze (09:15 CEST, commit `ae4f253`). This project was built by one person over about 24 hours with Claude Code as the engineering team. This page says which model did what, which decisions and actions were the human's, where the models were wrong and how it was caught, and what was not automated.

## 1. Setup

| Role | Tool | Notes |
|---|---|---|
| Orchestrator | Claude Code, model Claude Fable 5.1, one main terminal session | Planned waves and gates, assigned work to subagents, integrated results, ran typecheck, lint and test gates, kept `docs/DECISIONS.md` and `docs/HANDOFF.md`, made every commit |
| Seven subagents | Claude Code subagents defined in `.claude/agents/*.md` (model per definition: `opus` for engineering and docs, `sonnet` for QA) | Each owns a directory and never edits another's (table in `CLAUDE.md`). Each reads `docs/SPEC.md` first and reports files changed, how to verify, open risks |
| Research assistant | Claude (chat), before the hackathon | Produced the strategy kit: `docs/STRATEGY.md`, `docs/SPEC.md`, the first `docs/SOURCES.md`, `CLAUDE.md`, the agent definitions, `03-DEMO-SCRIPT.md`. Secondary-source facts from this phase are marked in `docs/SOURCES.md` §7 |
| Spell and style | None beyond the model | |

Rules the agents worked under (from `CLAUDE.md`): no homemade cryptography, every simulated thing labelled, share holders in separate processes, a real transaction on Base Sepolia, custody claims true on-chain and phrased precisely. Rules added during the run after stalls (`docs/HANDOFF.md`): preinstall all dependencies at the root, no `pnpm add` inside agents, one tool call at a time, Bash under 60 s (later 30 s).

## 2. Commit timeline (CEST, `git log`)

| When | Commit | What |
|---|---|---|
| 5 Oct 15:08 | `430e427` | Scaffold: pnpm workspaces, turbo, biome, vitest, per-process env templates, pinned verdict contract |
| 19:25 | `b28318d` | Wave 0 guardian-core, sq/partner guardian processes, bank skeleton with WebAuthn, shared zod contracts |
| 19:34 | `d3c649d` | Wave 0 chain: verified facts, `packages/chain`, spike deploys a protected Safe on Base Sepolia; SPEC corrections |
| 19:42 | `6c25703` | Wave 0 design tokens, primitives, `/design` kitchen sink; Gate 0 passed (planned 16:00, 3.5 h late) |
| 19:56 | `bfaf793` | Wave 1 chain: ERC-1271 attestation, zero-ETH sponsored relayer, recovery execute, finalize and cancel proven on-chain |
| 20:01 | `250d106` | Wave 1 bank: wallets, pairings, policy engine v1, paymaster gateway, userOps, attestations, top-ups |
| 23:44 | `6e6fd6a` | Wave 2 guardian: real chain adapter, Option A signatures, executed and finalize endpoints; 26 tests |
| 23:50 | `3a10de1` | Wave 1 wallet: onboarding 1–6, pairing, home, send, review, receipt; protect and attestation from the UI |
| 23:51 | `e23ecfc` | Gate 1 partial proof recorded (planned 20:00) |
| 23:52 | `885e653` | Design audit, Wave 1: 29 findings, primitive fixes |
| 6 Oct 00:05 | `9519167` | Wave 2 bank: recovery orchestration, persona identity, signed verdicts, guardian signatures, finalizer, desk API; 65 tests |
| 00:08 | `c18c46f` | Wave 3 chain: `eth_simulateV1`, decode table, `keyline` CLI; `recover --without-bank` proven live |
| 00:22 | `f45dad1` | Playwright story (F1 and F2 live), screenshot spec, demo scripts, `DEMO.md` |
| 00:24 | `439a406` | Threat model, legal, business, sources, this file (early pass) |
| 00:30 | `7bf93b5` | Wave 3 bank: OFAC screening live and snapshot, policy engine v2 (tiers, cooling, step-up, allowlist, suggested cap), `eth_simulateV1` wired; 115 tests |
| 00:32 | `1a7b7af`, `fe60ca0` | Repository lint and test gate green; CI workflow |
| 08:34 | `08748e9` | Wave 2 wallet: recover stepper with on-chain countdown, laptop approve, alerts with cancel, refused, desk, security first cut; Gate 2 passed from the UI (planned 01:00) |
| 08:48 | `544b730` | README draft, ARCHITECTURE diagrams, SUBMISSION draft; VERIFIED §15 |
| 08:50 | `e95a99b` | Design audit, Wave 2: 31 findings, persona bar tones, countdown finish state, PWA icon |
| 08:51 | `b49e5c6` | Bank: operator-visible identity signal no longer names the demo switch |
| 09:04 | `ae4f253` | Wave 3 wallet: review decision states, "What will happen", laptop Tier-2 approval, `/dapps` with capped approve, exit hatch, export; audit fixes |
| 09:04 | `64398e4`, `ecb2a23` | Gate 3 recorded; code freeze; biome format |
| 09:05 | `7fe46cf` | Playwright run artifacts dropped from the index and ignored |

The log shows no commit between 00:32 and 08:34. After the freeze the only open work was `qa-demo` (attacker and fraud-cancel specs, screenshots, video) and this documentation pass. No remote existed at submission time; the repository URL in `SUBMISSION.md` is a placeholder.

## 3. Stalls and limits, and how they were handled

| What happened | Handling |
|---|---|
| Wave 0 subagents stalled on long-running tool calls; Gate 0 closed 3.5 h late | Orchestrator watchdog; rules "one tool call at a time, Bash under 60 s" written into `docs/HANDOFF.md`; the timeline was re-based twice (DECISIONS #7, #9, #21) and the cut list in STRATEGY §11 was applied: assisted mode and the partner guardian were never built |
| The orchestrator session hit a usage limit at 22:00 on 5 Oct | `docs/HANDOFF.md` was written before the cut; a fresh session resumed from it with `CLAUDE.md`, `SPEC.md`, `DECISIONS.md` and `VERIFIED.md` |
| No Candide API key arrived | The public testnet endpoint (no key, sponsors on testnet) was used throughout (DECISIONS #11); still in use at the freeze; an env change switches to an authenticated URL |
| Every EOA held 0 ETH for most of the run | `account-chain` built a Candide-sponsored relayer Safe so the bank relayer, the guardian finalizer and the CLI could submit with 0 ETH (DECISIONS #15); the demo never depended on the human's faucet clicks landing |
| The Circle USDC faucet never delivered | The Gate 1 transfer leg and the e2e USDC legs skip themselves and say why; the README states that no transfer hash exists (DECISIONS #18, #22) |
| Gates planned for 20:00, 01:00 and 05:00 landed at 23:51 (partial), 08:40 and 09:15 | Core story first: the recovery proof existed from the CLI before any UI, so Gate 2 risk was carried by the chain spike, not the screens |
| Documentation written against in-flight code | The early docs pass (00:24) described Wave 3 as "not built"; this final pass re-read every named file after the freeze and replaced those statements |

## 4. What each subagent produced

| Agent | Owns | Produced |
|---|---|---|
| `account-chain` | `packages/chain`, `scripts/spike-*`, `scripts/keyline-cli.ts`, `docs/VERIFIED.md` | Verified every address and SDK export against Base Sepolia and the installed `abstractionkit@0.4.2`; read the 180 s grace period from bytecode; first protected Safe; ERC-1271 attestation proven live; zero-ETH sponsored relayer; recovery execute, finalize and cancel on-chain; `eth_simulateV1` and the decode table; the `keyline` CLI with `recover --without-bank` proven live. 46 tests |
| `bank-backend` | `services/bank`, `packages/shared` bank contracts, `docs/MOCKS.md` | WebAuthn registration and login, wallets, pairings, policy engine v1 and v2 (tiers, cooling, step-up with Safety-key EIP-712, dApp allowlist, suggested cap), paymaster gateway with callData hash check, userOps relay, attestation verify, top-ups, recovery orchestration with persona identity and signed verdicts, finalizer loop, cancel detection, desk API, alerts, mock e-ID and inbox, OFAC screening live and snapshot. 115 tests |
| `guardian-services` | `services/guardian-core`, `services/sq-guardian`, `services/partner-guardian` | Guardian rules as one pure function, verdict verification, per-process SQLite and events, real chain adapter, Option A signatures, `/executed` and `/finalize`, sponsored finalize. 26 tests |
| `wallet-client` | `apps/wallet` | Onboarding 1–6, pairing, home, send, review with decision states and "What will happen", receipt, recover stepper with on-chain countdown, laptop approval for recovery and Tier 2, alerts with cancel, refused, desk, `/dapps`, security centre with exit hatch and export, personas, PWA |
| `design-system` | `packages/ui`, `docs/DESIGN.md`, `docs/DESIGN-AUDIT.md` | Tokens, primitives, `<SimulatedBadge/>`, kitchen sink; two audits (29 and 31 findings) with fixes and copy for every gap. 11 tests |
| `qa-demo` | `e2e/`, `scripts/demo-*`, `docs/DEMO.md`, `docs/screens/` | Playwright story, attacker and fraud-cancel specs with CDP virtual authenticators (22 tests), screenshot spec and captures, `demo:reset`, `demo:predeploy`, `demo:stage-recovery`, `demo:open`, Anvil fork, `DEMO.md`, video |
| `docs-submission` | `README.md`, `SUBMISSION.md`, `docs/ARCHITECTURE.md`, `THREAT-MODEL.md`, `LEGAL.md`, `BUSINESS.md`, `SOURCES.md`, `AI-TOOLS.md` | All of the above, two passes (00:24 early, after the freeze final) |

Unit tests at the freeze (`pnpm test`, 09:20): 289 passing (bank 115, shared 89, chain 46, guardian-core 26, ui 11, scripts 2); `pnpm lint` clean.

## 5. What the human did

Decisions. Chose the Swissquote track and the self-custody-with-guardian-recovery design over a custodial or MPC wallet; approved the strategy kit; chose the repository location and accepted Node 24 instead of the pinned 22 (DECISIONS #1–#2); ran against Candide's public endpoint rather than wait for a key (#11); approved Option A for guardian confirmations (#15); accepted a plain-JSON Safety-key export over homemade encryption (#19); set the cut list when the schedule slipped (#9, #21); called the freeze (#23).

Actions only a person could take. Created accounts and requested faucets (Base Sepolia ETH, Circle USDC; the USDC never arrived); requested the Candide dashboard key; prepared the five Chrome profiles with real platform passkeys for the live demo; records the video and presents.

Review. Read every gate report, every `docs/DECISIONS.md` entry and `docs/VERIFIED.md` before the next wave started; decided which agent findings changed the SPEC (#12); checked the custody wording against the on-chain guardian list.

## 6. What the models did not do

They did not design the cryptography (none was written; `CLAUDE.md` rule 1). They did not fund wallets, click faucets, or hold any key outside the per-process `.env` files generated with viem on this machine. They did not verify the business or legal sources against primary documents beyond what `docs/SOURCES.md` §7 lists. They did not run the live demo. Token and wall-clock totals were not collected.

## 7. Where the models were wrong and how it was caught

| Issue | Caught by |
|---|---|
| SPEC listed v0.2.1 WebAuthn signer addresses as v0.2.0 | `account-chain` comparing abstractionkit constants with the deployments page (VERIFIED §1) |
| SPEC assumed a `recoveryPeriod()` getter | All candidate selectors reverted; the immutable was read from bytecode (VERIFIED §2) |
| The module's GitHub `main` (0.2.0, extra `_nonce` argument) differs from the deployed 0.0.1 | Sourcify exact match and selector check (VERIFIED §3) |
| Re-deriving the Safe address from the passkey breaks after recovery | `account-chain` finding; the address is persisted (DECISIONS #16) |
| Wave 0 subagents stalled on long-running tool calls | Orchestrator watchdog; the one-call, short-Bash rule |
| A spike harness ran the cancel test on the wrong Safe once | Spotted in the transaction log; re-run on the intended Safe (VERIFIED §12b) |
| `scripts/demo-lib.ts` failed typecheck (TS2742) and three demo scripts failed biome formatting | Reported by `account-chain` in VERIFIED §14; fixed in the repository gate commit `1a7b7af` |
| The desk showed an identity signal that named the demo switch ("thief" label) instead of what a real re-verification would report | Design audit, Wave 2; fixed in `b49e5c6` |
| `SimulatedBadge` on the real USDC balance, truncated addresses on the printed Emergency card, an unbadged mock client id | Design audit, Wave 1 (blockers #1–#3), fixed |
| The early docs pass stated the OFAC list was "not loaded", `eth_simulateV1` "not wired" and the Wave 3 screens "not built" while those commits were landing | This pass, by reading the frozen files; the statements were replaced |
| Playwright run artifacts were committed | Dropped from the index and ignored in `7fe46cf` |
| The Gate 3 Tier-2 transaction was recorded by wallet address only, not by hash | Noticed in this pass; stated as such in README §12 rather than filled in |
| The Playwright story initially marked F3, F4 and F4b as `test.fixme` | `qa-demo` replaced them with live specs after Gate 2 (`e2e/story.spec.ts` F3.1–F3.4, `attacker.spec.ts`, `fraud-cancel.spec.ts`) |

## 8. Open at submission

Video link and the final Playwright pass counts (`TODO-FINAL` in `README.md`); the repository URL; whether the Candide API key replaced the public endpoint before the demo (it had not at the freeze); the USDC transfer hash, which does not exist until the faucet delivers.

## 9. WalletConnect wave (11 Oct 2026, after the freeze)

Added after the 6 Oct freeze at the human's request (DECISIONS #29), in parallel with the Phase D close-out: Keyline as the wallet side of WalletConnect v2 (SPEC §11). Same rules as before: agents own their directories, one tool call at a time, no installs by agents.

| Who | What they did |
|---|---|
| Human | Asked for the feature (DECISIONS #29). A Reown project id is now set in `apps/wallet/.env.local`; who created the Reown Cloud project is not recorded in the repository |
| Orchestrator (main session) | Added SPEC §11; gave DemoSwap port 3100 and moved `qa-demo`'s isolated stack to 3150/4150/4151 (DECISIONS #29); installed the dependencies once, never through an agent (`@reown/walletkit`, `@walletconnect/core`, `@walletconnect/utils`, `qr-scanner`, and wagmi with Reown AppKit for DemoSwap); researched third-party Base Sepolia dApps from their GitHub configs and recorded VERIFIED §21 (not yet run against Keyline); design calls in DECISIONS #30 |
| `account-chain` | `packages/chain/src/safe-signatures.ts` and `dapp-calls.ts` with 17 tests; live spike `scripts/spike-erc1271.ts` on Safe `0x2eac…0dea` proving ERC-1271 for `personal_sign`, SIWE, typed data, USDC permit and Permit2; measured the dApp transaction result (bundle hash, about 4 s); recorded VERIFIED §20, which corrected SPEC §11 twice (USDC permits and Permit2 are not EOA-only; `wallet_getCallsStatus` answers the numeric EIP-5792 v2 shape) |
| `bank-backend` | `/dapp-sessions` routes and table, the dApp identity verdict (`policy/dapp-identity.ts`), `kind: 'dapp'` evaluation by session topic, screening of every address-shaped word in calldata, allowlist entries for DemoSwap and the Reown Labs, `dapp.*` events, the MOCKS.md row |
| `wallet-client` | `apps/wallet/src/wc/`: the WalletKit singleton, request classifier (9 unit tests), connection and request sheets, connected apps with disconnect, the dApp path through `/send/review`, inbox and expiry handling; the `wc-*` captures |
| `design-system` | `packages/ui/src/v2/wc/` primitives (request sheet, identity row, SIWE summary, typed-data rows), DESIGN.md §13 with EN/FR/DE copy, and the WalletConnect screens audit in DESIGN-AUDIT.md (23 findings) |
| DemoSwap (`apps/demoswap`) | Built in this wave as a separate Next.js app; the repository does not record which agent wrote it |
| `docs-submission` | This section, README §9 and the Real / Simulated rows, the ARCHITECTURE diagram and sequence, THREAT-MODEL §3.14, the SUBMISSION bonus line; written by reading the code, not the SPEC |

Where the models were wrong or the docs had to correct the plan:

| Issue | Caught by |
|---|---|
| SPEC §11 listed Permit2 and USDC's permit as EOA-only | `account-chain`'s on-chain simulation (VERIFIED §20.2) |
| SPEC §11 gave `wallet_getCallsStatus` the legacy `PENDING` / `CONFIRMED` shape | `account-chain` against viem 2.57 (VERIFIED §20.3) |
| DECISIONS #30 says a sign-in for another domain is refused outright; the code warns ("Don't sign it", red button) but still allows signing | `docs-submission` reading `WcSheets.tsx`; stated as a limitation in README §10 and THREAT-MODEL §3.14 rather than claimed |
| A capture run removed the approve, sent and swap-blocked screenshots mid-audit, so three findings (WC-13, WC-16, WC-17) could not be re-checked at the time | `design-system` (DESIGN-AUDIT, WalletConnect section) |

Not done in this wave: a recorded run of a third-party dApp (Reown AppKit Lab or Aave) against Keyline; a Playwright spec for WalletConnect (none exists in `e2e/`).
