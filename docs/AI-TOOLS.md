# AI tools used

Owner: `docs-submission`. Draft of 6 Oct 2026, early pass. This project was built by one person over about 24 hours with Claude Code as the engineering team. This page says which model did what, which decisions and actions were the human's, and what was not automated. Final figures are in the `TODO (Wave 5)` section at the end.

## 1. Setup

| Role | Tool | Notes |
|---|---|---|
| Orchestrator | Claude Code, model Claude Fable 5.1, one main terminal session | Planned waves and gates, assigned work to subagents, integrated results, ran typecheck/lint/test gates, kept `docs/DECISIONS.md` and `docs/HANDOFF.md`, made the commits |
| Seven subagents | Claude Code subagents defined in `.claude/agents/*.md` (model per definition: `opus` for engineering and docs, `sonnet` for QA) | Each owns a directory and never edits another's (table in `CLAUDE.md`). Each reads `docs/SPEC.md` first and reports files changed, how to verify, open risks |
| Research assistants | Claude (chat), before the hackathon | Produced the strategy kit: `docs/STRATEGY.md`, `docs/SPEC.md`, the first `docs/SOURCES.md`, `CLAUDE.md`, the agent definitions. Secondary-source facts from this phase are marked as such in `docs/SOURCES.md` §7 |
| Spell and style | None beyond the model | No Grammarly or similar |

Rules the agents worked under (from `CLAUDE.md`): no homemade cryptography, every simulated thing labelled, share holders in separate processes, a real transaction on Base Sepolia, custody claims true on-chain and phrased precisely. Rules learned during the run and written into `docs/HANDOFF.md`: preinstall all dependencies at the root, forbid `pnpm add` in agents, one tool call at a time, Bash under 60 s.

## 2. What each subagent produced

| Agent | Owns | Produced so far (commits on `main`) |
|---|---|---|
| `account-chain` | `packages/chain`, `scripts/spike-*`, `scripts/keyline-cli.ts`, `docs/VERIFIED.md` | Wave 0: verified every address and SDK export against Base Sepolia and the installed `abstractionkit@0.4.2`, found that SPEC's WebAuthn signer addresses were the v0.2.1 set rather than v0.2.0, read the 180 s grace period from bytecode because the module has no getter, deployed the first protected Safe (`d3c649d`). Wave 1: ERC-1271 attestation proven live, zero-ETH sponsored relayer Safe, recovery execute → finalize and execute → cancel proven on-chain (`bfaf793`). Wave 3: `eth_simulateV1` simulation and decode table, `keyline recover --without-bank` proven live with finalize tx `0xfad34f…a16c8` on Safe `0x1704…78c6` (`c18c46f`) |
| `bank-backend` | `services/bank`, `packages/shared` bank contracts, `docs/MOCKS.md` | Wave 0: Fastify skeleton with WebAuthn, shared zod contracts (`b28318d`). Wave 1: wallets, pairings, policy engine v1, paymaster gateway with callData hash check, userOps relay, attestation challenge and verify, top-ups (`250d106`). Wave 2: recovery orchestration, persona identity rules, signed EIP-712 verdicts, guardian signature collection, relayed execute, finalizer loop, cancel detection, desk API, alerts, mock e-ID and inbox; 65 tests (`9519167`) |
| `guardian-services` | `services/guardian-core`, `services/sq-guardian`, `services/partner-guardian` | Wave 0: guardian rules as one pure function, verdict verification, per-process SQLite and events. Wave 2: real chain adapter, signature-mode confirmations (Option A, DECISIONS #15), `/executed` and `/finalize` endpoints, sponsored finalize; 26 tests (`6e6fd6a`) |
| `wallet-client` | `apps/wallet` | Wave 1: onboarding steps 1–6, laptop pairing, home, send/review/receipt, personas; the protect userOp and the attestation proven from the UI with a virtual authenticator, Safe `0x291A…4482` (`3a10de1`). Recovery, alerts, refused and desk screens exist as routes; their end-to-end run is the Gate 2 item |
| `design-system` | `packages/ui`, `docs/DESIGN.md`, `docs/DESIGN-AUDIT.md` | Wave 0: tokens, primitives, `<SimulatedBadge/>`, the `/design` kitchen sink, the Next.js skeleton (`6c25703`). Wave 1: a visual audit with 29 findings, primitive fixes, and `DESIGN.md` strings for every copy gap (`885e653`) |
| `qa-demo` | `e2e/`, `scripts/demo-*`, `scripts/anvil-fork.ts`, `docs/DEMO.md`, `docs/screens/` | Playwright story with CDP virtual authenticators running F1 (create, pair, card, protect on-chain, attestation) and F2 live on Base Sepolia; a 52-scene screenshot spec; `demo:reset`, `demo:predeploy`, `demo:stage-recovery` (finalized a twin wallet's recovery with zero ETH), `demo:open`, Anvil fork; `docs/DEMO.md` (`f45dad1`). Latest run: 6 passed, 5 skipped because the funder holds no USDC |
| `docs-submission` | `README.md`, `SUBMISSION.md`, `docs/ARCHITECTURE.md`, `THREAT-MODEL.md`, `LEGAL.md`, `BUSINESS.md`, `SOURCES.md`, `AI-TOOLS.md` | This pass: `THREAT-MODEL.md`, `LEGAL.md`, `BUSINESS.md`, `SOURCES.md` additions and verification status, this file. README, ARCHITECTURE and SUBMISSION are Wave 5 |

Timeline (CEST): scaffold 5 Oct 15:00; Wave 0 closed about 20:00 (3.5 h late, subagent stalls, DECISIONS #9); Gate 1 partial at 00:20 on 6 Oct (protect from the UI confirmed on-chain; the USDC leg blocked on a faucet); Wave 2 and Wave 3 chain work merged overnight; the orchestrator session was cut once by a usage limit at 22:00 and resumed from `docs/HANDOFF.md`.

## 3. What the human did

Decisions. Chose the Swissquote track and the self-custody-with-guardian-recovery design over a custodial or MPC wallet; approved the strategy kit; chose the repository location and accepted Node 24 instead of the pinned 22 (DECISIONS #1–2); decided to run against Candide's public testnet endpoint rather than wait for an API key (#11); approved Option A for guardian confirmations (#15); accepted a plain-JSON Safety key export over homemade encryption (#19); set the cut list when the schedule slipped (#9).

Actions only a person could take. Created accounts and requested faucets (Base Sepolia ETH, Circle USDC; the USDC was still outstanding at the time of writing, which is why the transfer leg is skipped in the Playwright run); requested the Candide dashboard key; prepared the five Chrome profiles with real platform passkeys for the live demo; will record the video and present.

Review. Read every gate report, every `docs/DECISIONS.md` entry and the verified-facts file before the next wave started; decided which agent findings changed the SPEC (DECISIONS #12); checked the custody wording against the on-chain guardian list.

## 4. What the models did not do

They did not design the cryptography (none was written; see CLAUDE.md rule 1). They did not fund wallets, click faucets, or hold any key outside the per-process `.env` files the orchestrator generated with viem on this machine. They did not verify the business or legal sources against primary documents beyond what `docs/SOURCES.md` §7 lists; those marks are honest about it. They did not run the live demo.

## 5. Where the models were wrong and how it was caught

| Issue | Caught by |
|---|---|
| SPEC listed v0.2.1 WebAuthn signer addresses as v0.2.0 | `account-chain` comparing abstractionkit constants with the deployments page (VERIFIED §1) |
| SPEC assumed a `recoveryPeriod()` getter | All candidate selectors reverted; the immutable was read from bytecode (VERIFIED §2) |
| The module's GitHub `main` (0.2.0, extra `_nonce` argument) differs from the deployed 0.0.1 | Sourcify exact match and selector check (VERIFIED §3) |
| Re-deriving the Safe address from the passkey breaks after recovery | `account-chain` finding; address is now persisted (DECISIONS #16) |
| Wave 0 subagents stalled on long-running tool calls | Orchestrator watchdog; rule "one tool call at a time, Bash under 60 s" added |
| A spike harness ran the cancel test on the wrong Safe once | Spotted in the transaction log; re-run on the intended Safe (VERIFIED §12b) |

## TODO (Wave 5)

- Final test counts per package (`pnpm test`), Playwright pass/skip counts after USDC lands, CI status.
- Gate 2 record: recovery from the UI end to end (new phone, identity, Swissquote signature, Safety key signature, execute, countdown, finalize) with tx hashes.
- Gate 3 record: screening with the OFAC list loaded, allowlist and `/dapps`, exit hatch and Safety key export, `eth_simulateV1` panel in the review screen.
- Design audit round 2 findings and fixes.
- Video: length, what is live versus pre-staged (the twin-wallet recovery), link.
- Whether the Candide API key replaced the public endpoint before the demo.
- Token and wall-clock totals if the human wants to publish them.
