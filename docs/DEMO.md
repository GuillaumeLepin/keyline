# Keyline — demo runbook (owned by `qa-demo`)

First version, Wave 2 (6 Oct 2026, 00:30 CEST). Adapted from `03-DEMO-SCRIPT.md` to **what exists now**: F1 create →
protect → prove, top-up, F2 send are live in the app; F3 recover and F4 attacker are being wired this wave (their
screens are `ComingSoon` placeholders today) — the runbook marks those minutes *(Wave 2/3)* and says what to show
instead until they land. Re-read this file after every wave; the E2E suite (`pnpm e2e`) is the executable version.

## 0. What is proven today (QA run, 6 Oct 00:02 CEST, isolated stack on :3100/:4100/:4101, Base Sepolia)

| Step | Result | Proof |
|---|---|---|
| F1.1 passkey → counterfactual Safe | ✓ 4.0 s | Safe `0x8EA8CC21BA541C6beD79cBb576cdC81B6F4Ba566`, no code before protect |
| F1.2 laptop pairs the Safety key (6-digit code) | ✓ 4.1 s | bank `GET /wallets/:a/guardians` has `safety-key` |
| F1.3 Emergency card shown once, registered | ✓ | key dropped from memory, address registered |
| F1.4 Default mode, Assisted greyed out | ✓ | — |
| F1.5 **Protect** — one sponsored userOp, passkey-signed | ✓ confirmed in the UI **7 s** after the click | <https://sepolia.basescan.org/tx/0x1d3bdd5dfba562014e645d5862e61dbd66e0b62557df1558be11b799d986f3b4> — on-chain guardians `[0x01Bb…4dE8 (Swissquote), 0xf8F5…2784, 0x6D86…2Fb1]`, threshold **2**, no pending recovery |
| F1.6 Ownership proof (ERC-1271) | ✓ 1.6 s | bank `GET /attestations/:wallet` → `method: erc1271` |
| F1.7 Top up | **502 by design** | `Bank funder 0x482B…458A holds 0 USDC — fund it at faucet.circle.com` shown in the ErrorState with Technical details; the test skips the transfer with that reason |
| F2 Send 2.50 USDC | skipped — no USDC | runs the moment the funder is funded (same build→sponsor→sign→send pipeline as protect) |
| F3 / F4 / F4b | `test.fixme` with the exact SPEC steps | — |

Whole story run: **21 s**, 6 passed, 5 skipped, 2 videos (`e2e/test-results/**/videos/*.webm`), 14 screenshots
`docs/screens/story-*.png`. Every EOA is at 0 ETH / 0 USDC — everything above ran on Candide's public testnet sponsor.

Demo scripts, same night, all live on Base Sepolia with 0 ETH everywhere:

| Script | Result |
|---|---|
| `demo:reset --only --db …e2e-bank.sqlite --db …e2e-sq.sqlite` | both isolated DBs deleted, balances + faucets printed, exit 1 (funder empty) |
| `demo:predeploy --bank http://localhost:4100` | Lea fallback Safe `0x78763D1e6928A3C5CC8c3d7E19d8AB924a0A4B6b` (<https://sepolia.basescan.org/tx/0x5f0fdc9665443ef94def0731875c77626173093c128c6525231957894afbfbd4>) · twin `0x25aA65D08191de824cD358d97C7284E560ee37b9` (<https://sepolia.basescan.org/tx/0x51c182c568f2ab636624431bcd754b1734007cf845ed3095ea8425321a0f70b8>); guardians 3 / threshold 2 verified; top-up skipped (funder 0 USDC); bank registration OK, attestation refused `409 Protect your wallet first` (bank limitation, see §7) |
| `demo:stage-recovery` (twin) | new signer proxy <https://sepolia.basescan.org/tx/0x62568dbd611acd60906b52592947c38c156c7ecf48e8b705e71aacaf5bef44ab> · `multiConfirmRecovery(execute=true)` <https://sepolia.basescan.org/tx/0x344d4293c3653a05eced7c5e7a7b2006ae4d3fbe546e237381bf7291906c00d3> → `executeAfter 2026-10-05T22:14:46Z` = **00:14:46 Zürich**, printed 179 s ahead |
| `demo:stage-recovery --finalize` | waited for the chain head, `finalizeRecovery` <https://sepolia.basescan.org/tx/0xd49da8c36993eba66f65ceb052e5b4e63183c3a940d3e766222d26e190ab5fc6> → owner = new proxy `0x91C5…6912`, keyfile rotated |

## 1. Window layout

`pnpm demo:open` opens five **separate Chrome instances** (one `--user-data-dir` each under `~/.keyline-chrome/`,
so nothing is signed in to Google and nothing syncs), tiled for a 1440×900 laptop + a second screen:

| Window | URL (`?device=` sets the DeviceBar + the `X-Device-Label` the bank logs) | Where |
|---|---|---|
| **Lea · phone** | `/?device=lea-phone` | left, 520×900 (phone frame) |
| **Lea · laptop — Safety key** | `/approve?device=lea-laptop` | top right |
| **Thief · stolen phone** | `/?device=thief` (red bar) | bottom right |
| **Lea · new phone** | `/?device=lea-new-phone` | bottom right, opened now, used at 1:40 |
| **Swissquote desk (simulated)** | `/desk?device=desk` | second screen / a tab |

Zoom: the script passes `--force-device-scale-factor=1.25` (`KEYLINE_CHROME_SCALE=1` to disable on a projector that
already scales). `pnpm demo:open --reset` wipes the five profiles (fresh localStorage; passkeys live in the OS
keychain and survive — the thief never registers one).

Real platform passkeys (Touch ID) in the live demo; virtual authenticators only in Playwright (they vanish on reload).

## 2. Pre-flight checklist (T−30 min)

- [ ] `pnpm demo:reset` → DBs wiped, balances printed. Funder needs **≥ 10 USDC + 0.02 ETH** for the top-up; relayer /
      sq-guardian may stay at 0 ETH (the sponsored relayer Safe handles recovery). Faucets are printed.
- [ ] `pnpm dev` → `/health` on :4000 (`paymasterEnabled: true`) and :4001 (`chainPort: "real"`, `submitter: "sponsored-safe"`).
- [ ] `pnpm demo:predeploy` → `data/demo-state.json` with Lea's fallback Safe + the twin; both "Protected" on Basescan.
      Paste the printed `localStorage.setItem('keyline.wallet', …)` line in the *Lea · phone* window if you want to start
      from a pre-created wallet (read-only: that passkey is script-held; the live create takes ~30 s, prefer it).
- [ ] `pnpm e2e` green (or at least F1.1–F1.6) within the last hour → the bundler + sponsor are alive.
- [ ] `pnpm demo:open`; macOS Focus on (no notifications); laptop charged; hotspot ready; `pnpm anvil-fork` terminal
      ready but not switched (see §5).
- [ ] Backup video present (`e2e/test-results/**/videos/*.webm` of the last green run, or the recorded rehearsal).
- [ ] The Emergency card hex of the fallback Safe in a text file *outside the app* (`data/demo-state.json → lea.guardians.emergencyCard`).
- [ ] Desk operator token at hand (`DESK_OPERATOR_TOKEN` in `services/bank/.env`).
- [ ] **T−2:30:** `pnpm demo:stage-recovery` → prints the exact Zürich time the twin's countdown ends.

## 3. Minute-by-minute (3-minute slot; ≥ 5 min → everything live on one wallet, skip the twin)

| Time | Window | Do | Say |
|---|---|---|---|
| 0:00 | Lea · phone, Home | Pre-created wallet (fallback) **or** `/onboarding` live: Create with Face ID → code → laptop pairs → "I stored it" → Default → **Protect my wallet** (7–30 s) → Sign the proof. | "USD 409 M stolen through compromised keys in 2024 — Swissquote's own figure. Today a client who wants their own keys has to leave. Keyline: your keys, a Swiss bank as a safety net that can never move your money." While Protect confirms: "One signature: the account, the recovery module and the three recoverers go on-chain in a single sponsored transaction. Swissquote pays the network fee." |
| 0:40 | Protected screen → **View on Basescan** | Click the link, point at the recovery module's guardians. | "Three recoverers, any two restore: her Safety key on her laptop, her Emergency card in a drawer, and Swissquote — the only institution on the list. Verifiable here." |
| 0:55 | Home → **Top up** | CHF 8 (= 10 USDC). *If the funder is empty the app shows the honest 502 — say "the bank's test funder is dry; the transfer below is from the recording" and skip to 1:10.* | "Her Swissquote account tops this up instantly, because the wallet just proved it is hers — that's the Travel Rule check, signed, no screenshots." |
| 1:00 | Send → Lukas Meier → CHF 2 → Review → **Confirm with Face ID** | Signed → Sent → In block → Confirmed, Basescan link. | "Before she signs we decode it in words: 10 → 7.5 USDC, counterparty screened, fee paid by Swissquote. Real transaction, Base Sepolia, two-second blocks." |
| 1:10 | Close Lea · phone | — | "Lea's phone is gone." |
| 1:15 | Thief | `/` shows "This device has no key for this wallet." *(Wave 2/3: `/recover` → email code passes → identity fails → `/refused`; desk `identity-refused`; Override → stays `awaiting-guardians`.)* Until then: show the home refusal and narrate the override from the slide/recording. | "He has her phone and her inbox. He can't sign — the key needs her face. And even if the bank were fooled, Swissquote's confirmation alone leaves the recovery waiting forever: threshold 2 of 3 is on-chain, not in our code." |
| 1:40 | Lea · new phone + laptop | *(Wave 2/3: `/recover` → e-ID (SIMULATED) → new passkey → Swissquote confirms → laptop "Confirm with Safety key" → executed → countdown ring with the on-chain `executeAfter`.)* Until then: `pnpm demo:stage-recovery` output + Basescan `getRecoveryRequest` on the twin. | "Swissquote verifies her identity — simulated e-ID — and confirms as one recoverer; her laptop is the second. Executed. Now the chain enforces a waiting period: three minutes here, seventy-two hours in production. Public, un-shortcuttable." |
| 2:10 | Security centre → "If Swissquote disappears" *(Wave 3)* | — | "Her phone key keeps signing through any public bundler; Safety key + Emergency card restore access with no Swissquote process — here is the CLI. Honest caveat: passkeys bind to the app's address, so the open-source client lives on an escrowed domain." |
| 2:30 | Twin wallet | Countdown ends (staged at T−2:30) → finalize → "Welcome back, Lea" *(Wave 2/3)* / `pnpm demo:stage-recovery --finalize` → owners on Basescan = the new key only. | "This one we started before walking up so you see the end: restored, old key revoked on-chain." |
| 2:45 | Legal / business lines | from `03-DEMO-SCRIPT.md` | — |
| 2:55 | Real vs Simulated | README table | "Real: passkeys, the Safe, sponsored transactions, on-chain recovery with a veto window, screening, a separate guardian process. Simulated: identity check, notifications, the Swissquote account balance." |

What to say while waiting for confirmations: "Two-second blocks; the bundler batches our operation with others, so
five to twenty seconds. What you'll see is the Basescan receipt — not our UI's opinion."

## 4. Isolated ports (several agents / stacks on one machine)

The default stack is wallet `:3000`, bank `:4000`, sq-guardian `:4001`. To run a second, independent stack without
touching the first one's databases, override on the command line (CLI env wins over each process's `.env`; Node's
`--env-file` never overrides already-set variables):

```sh
# terminal 1 — guardian (own DB)
cd services/sq-guardian && GUARDIAN_PORT=4101 GUARDIAN_DB_PATH=./data/e2e-sq.sqlite pnpm exec tsx --env-file=.env src/index.ts
# terminal 2 — bank (own DB, talks to the guardian above, accepts WebAuthn from :3100)
cd services/bank && BANK_PORT=4100 BANK_DB_PATH=./data/e2e-bank.sqlite SQ_GUARDIAN_URL=http://localhost:4101 \
  WALLET_ORIGIN=http://localhost:3100 pnpm exec tsx --env-file=.env src/index.ts
# terminal 3 — wallet
cd apps/wallet && NEXT_PUBLIC_BANK_URL=http://localhost:4100 pnpm exec next dev --port 3100
# tests against it
E2E_WALLET_URL=http://localhost:3100 E2E_BANK_URL=http://localhost:4100 pnpm e2e
E2E_WALLET_URL=http://localhost:3100 pnpm screenshots        # bank + RPC are mocked; only the wallet is needed
pnpm --filter @keyline/scripts demo:reset --only --db services/bank/data/e2e-bank.sqlite --db services/sq-guardian/data/e2e-sq.sqlite
pnpm --filter @keyline/scripts demo:predeploy --bank http://localhost:4100
```

Caveat: two `next dev` servers share `apps/wallet/.next` (Next 15 has no per-port dist dir). Start the second
one only when the first is idle, or expect one-off "module not found" reloads — a reload fixes it.

## 5. If Wi-Fi dies — switch to the local fork in 60 s, and say so

`pnpm --filter @keyline/scripts anvil-fork --fund` (terminal kept open since pre-flight) runs an Anvil fork of Base
Sepolia on `127.0.0.1:8545` with the same chainId and the same contract addresses, and writes `.env.anvil`:

1. `sed -i '' 's#^RPC_URL=.*#RPC_URL=http://127.0.0.1:8545#' services/bank/.env services/sq-guardian/.env`
2. `sed -i '' 's#^NEXT_PUBLIC_RPC_URL=.*#NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545#' apps/wallet/.env.local`
3. restart `pnpm dev`.

Works offline: every read (balances, recoverers, recovery status, countdown), guardian/relayer EOA transactions
(the fork funded them with `--fund`), the funder's USDC top-up. **Does not work:** anything that is an ERC-4337
userOp — Protect, Send, the owner's cancel — because there is no bundler/paymaster on a fork. Say to the judges:
"local fork of Base Sepolia, same addresses; sponsored transactions need the live bundler, so those steps are from
the recording." Revert the two `sed` lines when the network is back. Basescan links will not resolve for fork-only
transactions — don't click them.

## 6. Scripts

| Command | What |
|---|---|
| `pnpm demo:reset [--keep-db] [--all] [--db p] [--only]` | wipe `services/*/data/*.sqlite` (never `.env`), print the five EOAs' ETH/USDC + faucets + the fallback Safes. `--keep-db` only clears the bank's sponsorship counter. |
| `pnpm demo:predeploy [--fresh] [--topup 10] [--bank URL\|none]` | two protected Safes (Lea fallback + twin) with script-held Safety key / Emergency card, USDC top-up from the funder if it has any, bank registration + ERC-1271 attestation, `data/demo-state.json`, Basescan links, the `localStorage` resume line. |
| `pnpm demo:stage-recovery [--wallet twin\|lea] [--finalize] [--status]` | new signer proxy + two guardian signatures → `multiConfirmRecovery(execute=true)` via the sponsored relayer; prints `executeAfter` and the Zürich wall-clock. `--finalize` after the grace period rotates the keyfile to the new passkey. |
| `pnpm demo:open [--reset]` | five Chrome instances, tiled, `?device=` URLs. |
| `pnpm --filter @keyline/scripts anvil-fork [--fund]` | offline fallback (§5). |
| `pnpm e2e` / `pnpm screenshots` | the story (video + `docs/screens/story-*.png`) / every screen & state at 2× (`docs/screens/<route>-<state>.png`). |

## 7. Known flakiness and the mitigation

- **Sheet backdrop intercepts clicks** after a failed top-up (`.kl-sheet` stays open): the test closes it via the
  header's Close button before touching Home. Presenter: tap the X, not outside the sheet.
- **Bundler latency**: protect confirmed in 7 s tonight, 30–60 s earlier today (VERIFIED §8). The test allows 240 s;
  the pitch narrates while waiting (§3).
- **Public Candide endpoint** (no key, 10 req/s): the UI polls every 2→6 s, the scripts ≤ 1 req/3 s. If sponsorship
  stops, the bank answers 502 (never fakes) — switch to the dashboard key in `services/bank/.env`.
- **WebAuthn origin**: the bank verifies `WALLET_ORIGIN`; a wallet on another port must be paired with a bank started
  with that `WALLET_ORIGIN` (§4) or registration fails with "origin mismatch".
- **Virtual authenticators** die with the CDP session; never reload a Playwright page and expect the passkey to survive.
- **Pre-deployed wallets cannot attest** (bank): `GET /attestations/:wallet/challenge` answers `409 Protect your wallet
  first` because `wallets.status` only becomes `deployed` through the bank's own `/userops` relay; a Safe deployed by
  `demo:predeploy` (or by a client paying its own fee) is on-chain but the bank still says `pending`, so `/topups` and
  "Prove ownership" refuse it. Until the bank checks `eth_getCode`, the fallback wallet is shown read-only (balance,
  recoverers, Basescan) and the top-up is narrated.
- **Next dev overlay**: a `1 Issue` badge appears bottom-left after any console error (e.g. the expected 502 top-up).
  Demo in production mode (`next build && next start`) or dismiss it before the pitch; it is not part of the app.
- **Shared dev server**: while another agent edits `apps/wallet`, `next dev` recompiles and briefly answers 404 /
  `_error`; the screenshot project retries once. Don't run `pnpm screenshots` during an active wallet edit.
