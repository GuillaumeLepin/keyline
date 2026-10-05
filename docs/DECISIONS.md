# Decisions log (orchestrator). Product calls made where the SPEC was silent, plus deviations and why.

| # | When (CEST) | Decision | Why |
|---|---|---|---|
| 1 | 5 Oct 2026 15:05 | Repo lives directly in `~/Documents/Hackathon BSA 2026` (path contains spaces). | The human asked to build in that folder. All scripts must quote paths. |
| 2 | 15:05 | Node 24.8 instead of the pinned Node 22. | It is what the machine has; `engines >= 22`. `better-sqlite3` prebuilt binaries exist for 24; `node:sqlite` is the fallback. |
| 3 | 15:10 | Five EOAs generated with viem `generatePrivateKey` (sq-guardian, partner-guardian, relayer, funder, verdict). Public addresses in `docs/ADDRESSES.md`. | None existed. Funding is on the human's list. |
| 4 | 15:10 | `RPC_URL=https://sepolia.base.org` (public). `eth_simulateV1` confirmed working on it (15:08). | No private RPC available; works for reads + simulate. Bundler/paymaster go through Candide. |
| 5 | 15:12 | `IdentityVerdict` EIP-712 typed data and the bank→guardian request schema are pinned by the orchestrator in `packages/shared/src/{typed-data,guardian}.ts` before Wave 0. | Two parallel agents (bank-backend signs, guardian-services verifies) must agree on one hash. bank-backend may extend, never rename. |
| 6 | 15:12 | `design-system` bootstraps the Next.js app skeleton in `apps/wallet` during Wave 0 (layout, Tailwind v4 + tokens, fonts, `/design` route only). `wallet-client` takes ownership of `apps/wallet` from Wave 1. | The kitchen-sink route has to live somewhere in Wave 0 and nobody else touches `apps/wallet` this wave. |
| 7 | 15:12 | Wave timing re-based: hour 0 = 15:00 CEST 5 Oct. Gate 0 16:00 · Gate 1 20:00 (hard stop 22:00) · Gate 2 01:00 · Gate 3 05:00 · Gate 4 08:00 · submission 11:00 · rehearsal 11:00–15:00 6 Oct. | Clock at start. |
| 8 | 15:12 | Spike/CLI scripts live in the `scripts/` workspace package (`@keyline/scripts`). `account-chain` owns `check-balances`, `spike-*`, `fund-*`, `keyline-cli`; `qa-demo` owns `demo-*`, `anvil-fork`. They never edit each other's files; `scripts/package.json` script entries are merged by the orchestrator. | Avoid two agents editing the same package in one wave. |
