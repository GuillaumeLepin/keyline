# HANDOFF — state at 22:00 CEST, 5 Oct 2026 (orchestrator session ended on usage limit)

Resume by pasting into a fresh Claude Code session at this repo root: "Read CLAUDE.md, docs/SPEC.md, docs/DECISIONS.md, docs/VERIFIED.md, docs/HANDOFF.md, then continue the build prompt from Gate 1." Rules learned: preinstall all deps at the root, forbid `pnpm add` in agents, one tool call at a time, Bash < 60 s.

## Done and verified (commits on `main`)
- Gate 0 passed (pnpm dev x3, /design, sq-guardian /identity, VERIFIED.md). Scaffold, env per process, 5 EOAs (docs/ADDRESSES.md).
- packages/chain: account (create/protect/transfer/cancel userOps, sponsor, safeOpHash, signUserOpWithPasskey, encodeCallData, getUserOpStatus), recovery (typed data, multiConfirm with signatures, finalize, status, deploySignerProxy), attestation (ERC-1271, proven live), relayer (sponsored relayer Safe, zero ETH). 21 tests. Spikes proved on Base Sepolia: protect deploy 0x61a472…, attestation Safe 0x2eac…0dea, recovery execute → finalize (0xcad741…) and execute → cancel (0x5ba3e0…). All tx hashes in docs/VERIFIED.md.
- services/bank: WebAuthn register/login, wallets, guardians (swissquote read from sq-guardian), pairings, policy engine v1 (protect + Tier 1 transfer + sponsorship counter), paymaster gateway (unsigned ops only, callData hash check), userops send/status, attestations (challenge + ERC-1271 verify), top-ups (attested wallets only), /me. 45 tests. packages/shared 79 tests.
- services/guardian-core + sq-guardian + partner-guardian: rules, verdict verification, events, own DBs. 18 tests (Wave 0 version; Wave 2 wiring in progress, see below).
- packages/ui + docs/DESIGN.md + apps/wallet skeleton with /design.

## In flight when the session ended (files may be partially written; check `git status`, run typecheck/tests before trusting)
- wallet-client Wave 1: onboarding 1–6, /pair, home, send/review/receipt, personas (apps/wallet). Not verified by the orchestrator.
- guardian-services Wave 2: real chain adapter, Option A signature confirmations (`mode: 'signature'`), `POST /recoveries/:id/executed`, sponsored finalize via GUARDIAN_CANDIDE_URL. Extends GuardianRecoveryResponseSchema in packages/shared/src/guardian.ts.

## Next steps (in order)
1. Verify wallet-client output: `pnpm --filter @keyline/wallet typecheck`, `pnpm exec biome check apps/wallet`, run `pnpm dev`, walk onboarding in a Chrome profile. Commit.
2. **Gate 1**: from "Lea · phone", passkey-signed, bank-sponsored USDC transfer confirmed on Basescan. Needs USDC on the Safe or the funder (faucet.circle.com → 0x482B512e50e6FB886A70D027DF20b1D55369458A, then "Top up" after attestation). Guardian list on-chain = 3, threshold 2.
3. Wave 2 bank: /recoveries orchestration (persona identity rules SPEC §7, signed IdentityVerdict with the pinned typed data incl. newOwner + recoveryRequestId, call sq-guardian, collect client-guardian signature via /recoveries/:id/confirm, submit multiConfirmRecovery through the relayer — use `sponsoredRelayer` from packages/chain while EOAs hold 0 ETH — poll status, tell the guardian `executed`, finalize after 180 s), desk API behind DESK_OPERATOR_TOKEN, mock inbox/e-ID, merged events. Then wallet-client /recover, /alerts (Cancel), /refused, /desk; qa-demo e2e + demo scripts. Gate 2.
4. Wave 3 reduced: screening (OFAC list + seeded address), allowlist + /dapps, exit hatch, attestation screen; Tier 2 step-up only if ahead.
5. Wave 4 design audit + E2E ×2 + video; Wave 5 = 02-SUBMISSION-PROMPT.md.

## Still needed from the human
USDC (Circle faucet) to the funder; Base Sepolia ETH to sq-guardian / relayer / funder (optional now, sponsored relayer covers it); Candide dashboard API key (replace the public endpoint before the demo); five Chrome profiles; organiser answers (slot length, slides).
