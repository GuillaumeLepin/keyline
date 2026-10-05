# Swissquote Wallet Challenge — build kit

Everything you need to go from an empty folder to a submission, with Claude Code doing the engineering through seven specialised subagents (one per component, one dedicated to design so the result does not look vibe-coded).

## What is in the kit

| File | Purpose | When |
|---|---|---|
| `docs/STRATEGY.md` | Rubric decoded, the winning design, custody decision, threat model, recovery design, legal and business reasoning, bonus plan, 24 h timeline with gates, pre-hackathon checklist, pitfalls | Read fully this week |
| `docs/SPEC.md` | Exact functional and interface spec every agent follows (flows, HTTP contracts, chain API, screens, personas, seeding) | Copy into the repo |
| `docs/SOURCES.md` | Every URL behind the legal, business and technical claims | Copy into the repo; cite in README |
| `CLAUDE.md` | Repo-level rules for Claude Code: non-negotiables, stack, layout, agents table, definition of done, vocabulary | Copy to repo root |
| `.claude/agents/*.md` | The seven subagents: `design-system`, `account-chain`, `bank-backend`, `guardian-services`, `wallet-client`, `qa-demo`, `docs-submission` | Copy to repo root |
| `.env.example` | All environment variables | Fill `.env` before Prompt 1 |
| `01-BUILD-PROMPT.md` | **Prompt 1**: the orchestrator prompt — waves, gates, parallel agent launches | Paste at hour 0 |
| `02-SUBMISSION-PROMPT.md` | **Prompt 2**: freeze, verify, produce README/diagrams/legal/business/AI-tools/platform text/demo assets | Paste after Gate 4 |
| `03-DEMO-SCRIPT.md` | 3-minute demo script (with the staged twin-recovery trick for the 3-minute waiting period), window layout, judge Q&A crib sheet | Rehearse twice |

## How to use it

1. **This week** (no project code — check the rules): do `docs/STRATEGY.md §12`: Candide API key, three EOAs funded on Base Sepolia (and Ethereum Sepolia as fallback), Circle USDC, five Chrome profiles, a throwaway spike with abstractionkit passkeys + the recovery module (confirm the signing order: build → sponsor → sign → send), organiser questions (demo length, slides allowed?).
2. **Hour 0**: `mkdir keyline && cd keyline && git init`; copy `CLAUDE.md`, `.claude/`, `docs/STRATEGY.md`, `docs/SPEC.md`, `docs/SOURCES.md`, `.env.example` into it; fill `.env`; `claude` (Opus, large context); paste `01-BUILD-PROMPT.md`.
3. **Hours 0–17**: you are the product owner and tester. Keep the five profiles open; when the orchestrator asks for faucet clicks or a product call, answer fast; test each gate yourself in the UI and paste the block-explorer (Basescan) links back. Do not let it skip a gate.
4. **Hour 17**: paste `02-SUBMISSION-PROMPT.md`. Review `README.md` and `docs/LEGAL.md` yourself — you will be asked about them.
5. **Hours 20–24**: rehearse with `03-DEMO-SCRIPT.md` twice, record the backup video, sleep.

## Design decisions already made for you (change them only with a reason)

- Chain: **Base Sepolia** (fallback Ethereum Sepolia, same addresses) — 2-second blocks make the live demo feel instant; the P-256 precompile (RIP-7212) makes passkey signatures cheap; Candide's SocialRecoveryModule with a **3-minute** grace period, the Safe passkey contracts and Circle's USDC faucet are all there (verified 5 Oct 2026); the Candide paymaster is free with no card.
- Account: **Safe 1.4.1 + Safe4337Module (EntryPoint v0.7) + passkey owner** via Candide `abstractionkit`; recovery via **Candide SocialRecoveryModule** (audited; the owner can cancel during the grace period — the feature that makes "recovery that can't be abused" true).
- Custody model: the client's phone passkey is the sole owner; recovery guardians = the client's Safety key (laptop) + the client's Emergency card (printed, cannot spend) + Swissquote's recovery service, threshold 2 → Swissquote is the only institution on the on-chain list, so it has no power of disposal and no partner can help it act. An opt-in assisted mode (Safety key + Swissquote + mocked partner) is the documented grey zone. The Swissquote guardian is a separate process with its own key, DB and `.env`, satisfying the "mocked share holder" rule.
- Mobile: mobile-first PWA in a CSS phone frame (installable on a real phone through an HTTPS tunnel if you want a real-device moment) — not React Native; a second codebase would sink the core story solo in 24 h.
- Bitcoin: out of scope, with the honest roadmap (miniscript timelocks reproduce delay + veto natively; or a threshold key).
- Bonuses: gasless through the bank-gated paymaster; compliant dApp interaction through `eth_simulateV1` plain-language simulation, OFAC screening with a seeded test address, allowlist and tiers.
- Honesty: `SIMULATED` badges, dashed diagram boxes, a Real/Simulated/Out-of-scope table. Bitcoin is explicitly out of scope with a stated roadmap.

## Things to verify in the first hour (they were researched, not executed)

abstractionkit's current export names and method signatures; whether your RPC supports `eth_simulateV1`; the Candide Base Sepolia endpoints; the Swissquote accent colour. (The recovery-module, USDC and Safe passkey addresses in `docs/SPEC.md §0` were verified on 5 Oct 2026 — re-check in 30 seconds anyway.) The build prompt makes the `account-chain` agent do this and write `docs/VERIFIED.md`.
