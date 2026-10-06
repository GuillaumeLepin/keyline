# HANDOFF — state at 09:45 CEST, 6 Oct 2026 (code frozen; qa-demo final runs + video in flight)

Resume by pasting into a fresh Claude Code session at this repo root: "Read CLAUDE.md, docs/SPEC.md, docs/DECISIONS.md, docs/VERIFIED.md, docs/HANDOFF.md, then continue the build prompt from Gate 1." Rules learned: preinstall all deps at the root, forbid `pnpm add` in agents, one tool call at a time, Bash < 60 s.

## State (all committed on `main`)
- Gates 0, 2, 3 passed and verified by the orchestrator (DECISIONS #18, #20, #22; VERIFIED §9–§16). Gate 1: protect op + attestation from the UI proven; **the USDC transfer leg has never run because no USDC exists anywhere** (funder 0x482B512e50e6FB886A70D027DF20b1D55369458A, faucet.circle.com).
- Unit tests 289 green, `pnpm lint` clean, CI workflow present (no git remote yet).
- README, SUBMISSION.md, ARCHITECTURE, THREAT-MODEL, LEGAL, BUSINESS, AI-TOOLS, SOURCES final except `TODO-FINAL:` video link + e2e counts (qa-demo) + repo URL.
- Running services for the demo: `pnpm dev` (wallet 3000, bank 4000, sq-guardian 4001). Desk operator token: `DESK_OPERATOR_TOKEN` in services/bank/.env.

## Remaining
1. qa-demo report → fill README/SUBMISSION TODO-FINAL (video path `docs/demo.webm`, e2e counts), commit.
2. Human: USDC faucet → then `pnpm --filter @keyline/scripts spike:create-and-send --keyfile data/test-keyfile-cli.json --public` or simply Top up + Send in the UI → paste the hash into VERIFIED §14 and README §12.
3. Human: create a GitHub repo, `git remote add origin … && git push -u origin main`, put the URL in SUBMISSION.md/README; optional Candide key into services/bank/.env (replace the public URL in BANK_CANDIDE_*).
4. Rehearse twice with docs/DEMO.md (pre-flight: `pnpm demo:reset`, `pnpm demo:predeploy`, T−2:30 `pnpm demo:stage-recovery`, `pnpm demo:open`).
