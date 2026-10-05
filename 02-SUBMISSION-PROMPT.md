# Prompt 2 — Final version to submit (paste into the same Claude Code session after Gate 4, or a fresh one at the repo root)

> Preconditions: Gates 1–4 passed; `docs/VERIFIED.md`, `demo-state.json`, `docs/screens/*.png`, the E2E video and `docs/DESIGN-AUDIT.md` exist. Have the hackathon platform's submission form open to know its fields (title, tagline, description length, repo link, video link, "AI tools used").

---

We are now producing the **submission** for the Swissquote track. The code is frozen except for bug fixes; your job is to turn what actually exists in this repo into the document, diagram, demo assets and platform text the judges will score. Read `CLAUDE.md`, `docs/STRATEGY.md §1–§10`, `docs/SPEC.md`, `docs/VERIFIED.md`, `docs/MOCKS.md`, `docs/DECISIONS.md` and the current code before writing a word. Nothing may be claimed that the code does not do; where the strategy and the code diverge, the code wins and the divergence is stated ("not built; roadmap").

## Step 1 — freeze and verify (you, the orchestrator)

1. `pnpm lint && pnpm test && pnpm e2e` — paste results. Record the tx hashes of the final recorded story (deploy, transfer, recovery execute, cancel, finalize) in `docs/VERIFIED.md`.
2. `pnpm demo:reset && pnpm demo:predeploy` — confirm `demo-state.json`; confirm guardian, relayer and funder balances ≥ 0.05 ETH; confirm the funder's USDC balance; confirm `pnpm demo:stage-recovery` works on the twin wallet.
3. Run `qa-demo` for a final rehearsal run with video; keep the video at `docs/demo.webm` (and an mp4 if ffmpeg is available). Note its duration.
4. Produce the "Real / Simulated / Out of scope" table from the code (grep for `SimulatedBadge` and `simulated: true`), not from the plan.

## Step 2 — the submission package (delegate to `docs-submission`, with `design-system` for the diagram styling and `qa-demo` for assets)

Produce:

1. **`README.md`** — exactly the 14-section structure in `.claude/agents/docs-submission.md`, covering every item under "What your submission should cover" in the challenge brief: custody model decision + threat model; architecture diagram with mocked parts marked; custody and Travel Rule handling; how Swissquote makes money / what it gains; which bonus topics were tackled; which AI tools were used and for what. Also the six required topics (custody decision, architecture, wallet creation, authentication, recovery, business case) each under its own heading so a judge can tick them off. Include the threat-model table, the tiers table, the Real/Simulated table, run instructions, tx hashes with block-explorer (Basescan) links, screenshots strip, and the video link.
2. **`docs/ARCHITECTURE.md`** — component diagram (Mermaid; dashed = SIMULATED) and sequence diagrams for create, sign, recover, attacker-refused.
3. **`docs/THREAT-MODEL.md`**, **`docs/LEGAL.md`**, **`docs/BUSINESS.md`** — full versions; LEGAL answers explicitly: "is this custody and why", "could Swissquote, alone or with a partner, move the funds" (default mode: no, verifiable on-chain; assisted mode: the grey zone), "how ownership verification is automatic", and the three-case "who is the sending institution" table. BUSINESS has the numbers and sources from `docs/SOURCES.md`. THREAT-MODEL includes the residual risks (unlocked phone, veto griefing) stated plainly.
4. **`docs/AI-TOOLS.md`** — honest list: Claude Code (orchestrator + the named subagents and what each produced), research assistance, design audit; what the human decided, reviewed and tested. The brief asks for this explicitly; being specific is a plus.
5. **`SUBMISSION.md`** — the platform text: title, one-line tagline, ≤ 600-word description with the same headings condensed, repo URL, video URL, bonus topics tackled, AI tools used. Plain markdown, no emoji.
6. **`docs/DEMO.md`** — final minute-by-minute script (3 min) + Q&A crib sheet (see `03-DEMO-SCRIPT.md` in the kit for the baseline) + pre-flight checklist.
7. **`docs/screens/`** — one PNG per key screen (onboarding summary, review with "What will happen", receipt with Basescan, recovery countdown, attacker refused, desk request detail, security centre, exit hatch), captured by `qa-demo` at 2× in the phone frame; `design-system` checks each for ban-list violations before it goes in the README.

## Step 3 — judge pass (you)

Read the README as a Swissquote judge with the rubric from `docs/STRATEGY.md §1` open. For each criterion, write one line: "where in the README/demo is the evidence?" If any criterion or required topic lacks direct evidence, fix the document (or flag that the code lacks it). Check the ban list on the README itself (no hype adjectives, no emoji, no unverifiable claims). Check that every `(verify)` item in the strategy is either verified in `docs/VERIFIED.md` or removed from the claims.

## Step 4 — hand-off to me

Print: the final tree of docs, the sentences I should say if a judge asks "what is real and what is mocked?", "could Swissquote move my funds, alone or with a partner?", "isn't the Emergency card a seed phrase?" and "why not MPC?", and the exact text to paste into each field of the submission form.

---
