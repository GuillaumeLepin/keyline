# Keyline — demo runbook (owned by `qa-demo`)

Final wave (6 Oct 2026, code freeze 10:45 CEST). Everything in the 3-minute script below exists in the app and is
exercised by the E2E suite: `pnpm e2e` runs **F1 → F2 → F3** (`e2e/story.spec.ts`), **F4** (`e2e/attacker.spec.ts`)
and **F4b** (`e2e/fraud-cancel.spec.ts`) against a live stack and Base Sepolia, with every "it worked" checked
on-chain. The suite is the executable version of this runbook; `docs/demo.webm` is the backup video.

## 0. What is proven (QA runs, 6 Oct morning, isolated stack :3100/:4100/:4101, Base Sepolia)

Run 1 (08:47–08:58 CEST) — the story in **4.5 min**, attacker + fraud-cancel in **4.3 min**. Every EOA at 0 ETH /
0 USDC: everything below ran through Candide's public testnet sponsor and the sponsored relayer Safe.

| Step | Result | Proof (Base Sepolia) |
|---|---|---|
| F1.1 passkey → counterfactual Safe | ✓ 1.9 s | Safe `0xD5DaDcB5b18Ed182ef81D405D444eb32CDB05e52`, no code before protect |
| F1.2 laptop pairs the Safety key | ✓ 2.3 s | bank `GET /wallets/:a/guardians` has `safety-key` |
| F1.3 Emergency card shown once | ✓ | key dropped from memory, address registered |
| F1.4 Default mode | ✓ | — |
| F1.5 **Protect** (one sponsored userOp, passkey-signed) | ✓ **7 s** | <https://sepolia.basescan.org/tx/0xaefe6ef9a1d950f42b9104ddf891199ec3632941052a9288e9a07e4d1dcc6532> — guardians `[0x01Bb…4dE8 (Swissquote), 0x249d…50e6, 0xFD99…7872]`, threshold **2** |
| F1.6 Ownership proof (ERC-1271) | ✓ | bank `GET /attestations/:wallet` → `method: erc1271` |
| F1.7 Top up / F2 Send | skipped — funder `0x482B…458A` holds 0 USDC | honest 502 in the ErrorState; both run the moment the funder is funded |
| F3.1 new phone: new key → e-mail code (mock inbox) → e-ID "Lea Keller" → Swissquote confirms | ✓ signer deployed in **5 s** | <https://sepolia.basescan.org/tx/0x166f22fbf4e4f7d7f6af67fbcd9b090cf548cd608a7e5cf7c843d5ac2bbc0e6f>; module: nothing pending yet (signature held) |
| F3.2 laptop **Confirm with Safety key** → `multiConfirmRecovery(execute)` | ✓ executed **9 s** after the click | <https://sepolia.basescan.org/tx/0xe312dc6015a8f77c285e6531482412c84484a0f35b35f98471b87de5409266a0> — `pending = true`, `newOwners = [0xb4e7…7193]`, `executeAfter = 06:52:32Z` (177 s ahead, module grace 180 s) |
| F3.3 grace period → bank finalizer → **"Welcome back, Lea"** | ✓ finalized **10 s** after `executeAfter` | <https://sepolia.basescan.org/tx/0xc2817d8cfe467c7fcfbcc3c4ebe2e5dab708481d4dd5b0be73fd317b6a010138> — `getOwners() = [0xb4e7cDA0DC5b8375dd4A3C396D2c96234ca27193]`, old proxy `0x601d…2289` gone |
| F3.4 send from the new phone | skipped — no USDC | — |
| F4.0–F4.3 thief: no key on Home → e-mail code passes → e-ID refused → `/refused`; Lea's `/alerts` "Recovery attempt refused" | ✓ | Safe `0xC375d0A039010204fA1952Bc2830e19B4E2eB9Dc` (protect <https://sepolia.basescan.org/tx/0xbffd8c1c57997f0d7cd8a10f9c0d27f7727cad1724e8b39fa089b34641e67556>); reasons `ID document name mismatch · liveness check failed`; module `pending = false`, `approvals = 0` |
| F4.4–F4.5 desk `identity-refused` → **Override** → stays `awaiting-guardians` / `second-recoverer` | ✓ in run 1b (run 1 failed on a test selector, fixed) | `pending = false`, owners unchanged — one institution never moves the wallet |
| F4b.1–F4b.2 override + pasted Emergency card → **executed** | ✓ | Safe `0x3da1A223423177D0dD7472E77B67A0d9D7E673b4`; <https://sepolia.basescan.org/tx/0x814a452aca442ce212b59275dbba8b423c712499d79f2e88269786dc0d8d2ce0> `pending = true` |
| F4b.3 Lea · phone `/alerts` → **Cancel recovery — it wasn't me** (sponsored owner userOp) | ✓ cancelled **9 s** after the tap | <https://sepolia.basescan.org/tx/0xd1175115e7d1df8f2ea0f65c09d3b7324d857256db916e29fa4d8a807003812d> — `pending = false`, owners unchanged; bank request `cancelled`; thief sees "Recovery cancelled by the owner." |

Run 2 (08:59–09:09, full `pnpm e2e` in one process incl. the screenshot project): chain legs all green again
(protect, signer deploy, execute, finalize <https://sepolia.basescan.org/tx/0x25b213f74912ac81b7971d9eeaaed912bd1bfc6a1d04356683442a730810ef75>
on Safe `0x6E40B28dfb2aB50Db4Eba102894711a81A815a82`; F4b execute <https://sepolia.basescan.org/tx/0x8814d0d82239ffa41a3f0dce6b6e06521b8e50681298a17ec3d8b5faffe6f725>);
three **test-side** failures — a desk navigation timeout on a cold route, a strict-mode text collision, and the
"Welcome back" copy moving under the test — all fixed in the specs (see §7). The run also showed what happens when
nobody cancels an executed fraud: the module finalized the thief's key on the F4b test wallet after 180 s, exactly as
designed (the veto window is the only protection once 2 of 3 signed).

Run 3 (09:10–09:25, attacker 6/6 in 1.6 min; story + fraud-cancel **13 passed, 3 skipped, 6.6 min**):

| Step | Result | Proof |
|---|---|---|
| F1 Safe `0xA6b9e958d9F97d881b1c2d5e13657D27B69753E7` | ✓ protect confirmed in **41 s** (bundler slower than run 1) | <https://sepolia.basescan.org/tx/0xdaf435f3b35aee9ae6ea47cb15254aac904f213dbef8a87bd759fafc35a0ff98> |
| F3.1 signer for the new passkey | ✓ 11 s | <https://sepolia.basescan.org/tx/0x6094043b8aaf8da8ebf21913355d6a1de6a297db0f9ae96807ef706d24e669c5> |
| F3.2 execute (laptop Safety key + Swissquote) | ✓ 39 s after the click, `executeAfter` 07:24:00Z (177 s ahead) | <https://sepolia.basescan.org/tx/0x76abc01907b7cc93ef0198e013fa655d7ad7e1dfe5fba39654d6f0d2e375d368> |
| F3.3 finalize → owner `0x111B…78a2` → `0xACd34E44AC7bFE84e508b7aa8e9fAd5e7c40A8f9` | ✓ 14 s after `executeAfter` | <https://sepolia.basescan.org/tx/0xc15022a96e335410da90046c8e136ba23bee9522a1df01319e596a6fe8bb9ff4> |
| F4 attacker (Safe `0xBDAF4F0F2Ec55Bd0A8E1Cc6AFc7aF7fFd1bfD58c`) | ✓ 6/6 — refused, desk override, stays `awaiting-guardians`, `pending = false` | protect <https://sepolia.basescan.org/tx/0x2aa92c28d0c3c9f2a5da6a62fb6beb149cd58e360f11f79cfb9a829c9c80dc69> |
| F4b fraud + owner cancel (Safe `0x6b808d4F174E044Ed041f68e368c5e1a96fF55aa`) | ✓ 4/4 — cancel confirmed in the UI **22 s** after the tap, module `pending = false`, owners unchanged | execute <https://sepolia.basescan.org/tx/0x77843fd40c728707d7ee6283d1b2f7d8ccc304a0f021e9dc1248477999ce10be> (cancel tx: see the bank note in §7 — the UI showed it, the bank's request record did not keep it) |

Runs 4–6 (09:25–09:32): attacker 6/6 and fraud-cancel 4/4 again, then every Protect refused — the **20/day
sponsorship cap** of the isolated bank (§7). Run 7 (09:32–09:37, after `demo:reset --keep-db`): story **9 passed,
3 skipped, 4.2 min** — Safe `0x824192a3907a1CF42Ecc4cB655dA62c32147A6C2`, protect 7 s
<https://sepolia.basescan.org/tx/0x8d4ec7487d0c0344401a84873807f9212c3bba2a311bf37c8e7dbd1c6356dac1>, signer
<https://sepolia.basescan.org/tx/0x3257b6225b39d4bba8582bd80f5f7988401b4bc26ca67afbbbb96821616c2c7c>, execute 17 s after the
laptop's click <https://sepolia.basescan.org/tx/0xb6356f10a03347acc6a748566f60bf2cc5759ac81fc13941d9769fba8374739e>
(`executeAfter` 07:36:16Z, 179 s ahead), finalize
<https://sepolia.basescan.org/tx/0x09568d0e7783062bcc37991816de1f160be003707f10f1e7aabebef3d1767ef3> → owner
`0x2Da4…beA2` → `0x1993F68A47Dd89de40ee0872753c08De9368eAB5`. Over the morning: 7 story runs, 5 complete F3 recoveries
finalized on-chain, 3 owner cancels, 0 chain-side failures; every failure was a test selector, an artefact clash, or
the sponsorship cap.

**Backup videos** (run 3, Playwright recordings, 1280×960 VP8/WebM; Playwright's bundled ffmpeg has no H.264, hstack
or concat, so no MP4 and no side-by-side — play two files next to each other if needed):

| File | Persona | Length | Shows |
|---|---|---|---|
| `docs/demo.webm` | Lea · new phone | 5:16 | `/recover`: new key → e-mail code → e-ID → "Waiting for a second recoverer" → countdown ring → "Welcome back, Lea" → Home |
| `docs/demo-phone.webm` | Lea · phone | 5:40 | onboarding F1.1–F1.6, Protected home, top-up 502, then the phone is lost (idle) |
| `docs/demo-laptop.webm` | Lea · laptop | 5:36 | `/pair`, then `/approve` → "Confirm with Safety key" |

Screens: `docs/screens/story-*.png` (21), `attacker-*.png` (9), `fraud-*.png` (5), plus every state from `pnpm screenshots`.



## 1. Window layout

`pnpm demo:open` opens five **separate Chrome instances** (one `--user-data-dir` each under `~/.keyline-chrome/`,
nothing signed in to Google, nothing syncs), tiled for a 1440×900 laptop + a second screen:

| Window | URL (`?device=` sets the DeviceBar + the `X-Device-Label` the bank logs) | Where |
|---|---|---|
| **Lea · phone** | `/?device=lea-phone` | left, 520×900 (phone frame) |
| **Lea · laptop — Safety key** | `/approve?device=lea-laptop` | top right |
| **Thief · stolen phone** | `/?device=thief` (red bar) | bottom right |
| **Lea · new phone** | `/recover?device=lea-new-phone` | bottom right, behind the thief; raised at 1:40 |
| **Swissquote desk (simulated)** | `/desk?device=desk` | second screen / projector tab |

Zoom: the script passes `--force-device-scale-factor=1.25` (`KEYLINE_CHROME_SCALE=1` to disable on a projector that
already scales). `pnpm demo:open --reset` wipes the five profiles (fresh localStorage; platform passkeys live in the
OS keychain and survive — the thief never registers one for Lea's wallet). Live demo = real Touch ID passkeys;
virtual authenticators only in Playwright.

## 2. Pre-flight checklist (T−30 min)

- [ ] `pnpm demo:reset` → DBs wiped, balances printed. **The bank sponsors 20 userOps per client per day** (SPEC §0,
      table `sponsorships`): every Protect, Send and owner-cancel counts; a full `pnpm e2e` uses ~8. After rehearsals,
      `pnpm demo:reset --keep-db` clears the counter without touching anything else — do it at T−30 and again at T−5. Funder needs **≥ 10 USDC + 0.02 ETH** for the top-up; relayer
      and sq-guardian may stay at 0 ETH (the sponsored relayer Safe handles recovery, finalize and the signer deploy).
- [ ] `pnpm dev` → `/health` on :4000 (`paymasterEnabled: true`) and :4001 (`chainPort: "real"`, `submitter: "sponsored-safe"`).
      `DEMO_FAST_MODE=true` in `services/bank/.env` (identity verdict signed without a desk click; the desk still shows it).
- [ ] `pnpm demo:predeploy` → `data/demo-state.json` with Lea's fallback Safe + the **twin**; both "Protected" on Basescan.
- [ ] `pnpm e2e` green within the last hour (or at least `story.spec.ts` F1–F3) → bundler, sponsor, relayer, finalizer alive.
- [ ] `pnpm demo:open`; macOS Focus on; laptop charged; hotspot ready; `pnpm --filter @keyline/scripts anvil-fork --fund`
      terminal ready but not switched (§5).
- [ ] Backup video `docs/demo.webm` (or `.mp4`) open in QuickTime, paused at 0:00.
- [ ] The fallback Safe's Emergency card hex in a text file *outside the app* (`data/demo-state.json → lea.guardians.emergencyCard`).
- [ ] Desk operator token at hand (`DESK_OPERATOR_TOKEN` in `services/bank/.env`); desk window already signed in.
- [ ] Lea's e-mail on file: `lea.keller@example.ch`; the code is read from `/mock/inbox` (SIMULATED badge).
- [ ] **T−2:30:** `pnpm demo:stage-recovery` → prints the exact Zürich time the twin's countdown ends; open
      `/recover?device=lea-new-phone` on the twin's recovery so the ring is on screen at 2:30.

## 3. Minute-by-minute (3-minute slot; ≥ 5 min → run F3 live on one wallet and skip the twin)

Confirmation waits are 5–30 s on Base Sepolia; the right-hand column is what to say *during* them.

| Time | Window | Do | Say | While waiting |
|---|---|---|---|---|
| 0:00 | Lea · phone `/onboarding` | Create with Face ID → 6-digit code → laptop `/pair` → "I stored it" → Default → **Protect my wallet** → Sign the proof → Go to my wallet. | "USD 409 M stolen through compromised keys in 2024 — Swissquote's own figure. A client who wants their own keys has to leave the bank today. Keyline: your keys, a Swiss bank as a safety net that can never move your money." | Protect (7–30 s): "One signature: the account, the recovery module and the three recoverers go on-chain in a single sponsored transaction. Swissquote pays the network fee." |
| 0:40 | Protected screen → **View on Basescan** | Point at the module's three guardians, threshold 2. | "Three recoverers, any two restore: her Safety key on her laptop, her Emergency card in a drawer, and Swissquote — the only institution on the list. Verifiable here, not in our code." | — |
| 0:55 | Home → **Top up** CHF 8 | 10 USDC from the bank funder. *Funder empty → the app shows the honest 502; say "the test funder is dry, the transfer is in the recording" and skip to 1:10.* | "Her Swissquote account tops this up instantly because the wallet just proved it is hers — the Travel-Rule check, signed, no screenshots." | — |
| 1:00 | Send → Lukas Meier → CHF 2 → Review → **Confirm with Face ID** | Signed → Sent → In block → Confirmed, Basescan link. | "Before she signs we decode it in words: 2.50 USDC, counterparty screened, fee paid by Swissquote. Real transaction, Base Sepolia." | 5–20 s: "Two-second blocks; the bundler batches our operation with others. What you see next is the Basescan receipt, not our UI's opinion." |
| 1:10 | Close Lea · phone | — | "Lea's phone is gone." | — |
| 1:15 | Thief `/` → `/recover` | Home: "This device has no key for this wallet." → Create key → `lea.keller@example.ch` → code from `/mock/inbox` → e-ID form, type a wrong name → Submit → **`/refused`**. Desk: Refused tab → request → **Override** → status stays "Waiting for a 2nd recoverer". | "He has her phone and her inbox, so the e-mail code passes. He can't pass the identity check. And even if the bank were fooled — here, override — Swissquote's confirmation alone leaves the recovery waiting forever: 2 of 3 is enforced on-chain." | Signer deploy (10–60 s) after "Send code": "The bank deploys the new key's signer now — a real transaction, so a refused attempt still costs Swissquote a fee, never the client." |
| 1:40 | Lea · new phone `/recover` + laptop `/approve` | Create key → e-mail → code → e-ID (Lea Keller, prefilled) → "Waiting for a second recoverer" (Swissquote confirmed) → laptop **Confirm with Safety key** → "Access restores at hh:mm" ring. | "Swissquote verifies her identity — simulated e-ID, badge on screen — and confirms as one recoverer; her laptop is the second. Executed. Now the chain enforces a waiting period: three minutes here, seventy-two hours in production. Public, un-shortcuttable." | Relay (5–30 s): "One transaction carries both signatures — Swissquote's held one and the laptop's. The module attributes each approval to the recoverer, not to who paid." |
| 2:10 | Lea · phone `/alerts` (fallback wallet) | Show "Recovery started from a new device" + **Cancel recovery — it wasn't me** (don't click unless ≥ 5 min). | "During the wait the old phone can veto with one tap: the account cancels on the module itself, sponsored. That's the fraud case — the bank fooled *and* the card photographed — stopped by the owner." | — |
| 2:30 | Twin wallet (`/recover?device=lea-new-phone`, staged at T−2:30) | Countdown ends → bank finalizer → **"Welcome back, Lea"** → Basescan: owner = the new key only. | "This one we started before walking up so you see the end: restored, old key revoked on-chain." | If the finalizer lags (≤ 30 s): "The bank's finalizer polls the chain every five seconds and submits a sponsored finalize; the module checks the time, not the bank." |
| 2:45 | README table | Real vs Simulated. | "Real: passkeys, the Safe, sponsored transactions, on-chain recovery with a veto window, screening, a separate guardian process. Simulated: identity check, e-mail, the Swissquote balance." | — |
| 2:55 | Close | — | "Swissquote's key cannot act alone or with any partner — that's a line on Basescan, not a promise." | — |

## 4. Isolated ports (several agents / stacks on one machine)

The default stack is wallet `:3000`, bank `:4000`, sq-guardian `:4001`. To run a second, independent stack without
touching the first one's databases (CLI env wins over each process's `.env`):

```sh
# terminal 1 — guardian (own DB)
cd services/sq-guardian && GUARDIAN_PORT=4101 GUARDIAN_DB_PATH=./data/e2e-sq.sqlite pnpm exec tsx --env-file=.env src/index.ts
# terminal 2 — bank (own DB, talks to the guardian above, accepts WebAuthn from :3100)
cd services/bank && BANK_PORT=4100 BANK_DB_PATH=./data/e2e-bank.sqlite SQ_GUARDIAN_URL=http://localhost:4101 \
  WALLET_ORIGIN=http://localhost:3100 pnpm exec tsx --env-file=.env src/index.ts
# terminal 3 — wallet, from a SNAPSHOT COPY so it has its own .next (see below)
rsync -a --delete --exclude node_modules --exclude .next --exclude .turbo apps/wallet/ e2e/.wallet-snapshot/
ln -sfn "$PWD/apps/wallet/node_modules" e2e/.wallet-snapshot/node_modules
cd e2e/.wallet-snapshot && NEXT_PUBLIC_BANK_URL=http://localhost:4100 ./node_modules/.bin/next dev --port 3100
# tests against it
E2E_WALLET_URL=http://localhost:3100 E2E_BANK_URL=http://localhost:4100 pnpm e2e
pnpm --filter @keyline/scripts demo:reset --only --db services/bank/data/e2e-bank.sqlite --db services/sq-guardian/data/e2e-sq.sqlite
```

Why the snapshot: two `next dev` servers on one `apps/wallet/.next` corrupt each other (ENOENT 500s), and every edit
by another agent triggers a Fast Refresh that remounts the page under test (run 1 this morning failed F1.6 exactly
like that: `[Fast Refresh] rebuilding` in the trace, blank onboarding page). The copy must stay **inside the
monorepo** (module resolution has to reach the root `node_modules`; outside it Next tries to `pnpm add typescript`).
Re-sync the copy before each run to test the current code. `PersonaSession.goto` additionally retries a 5xx/ENOENT
answer after 20 s, three times.

## 5. If Wi-Fi dies — switch to the local fork in 60 s, and say so

`pnpm --filter @keyline/scripts anvil-fork --fund` (terminal kept open since pre-flight) runs an Anvil fork of Base
Sepolia on `127.0.0.1:8545` with the same chainId and contract addresses, and writes `.env.anvil`:

1. `sed -i '' 's#^RPC_URL=.*#RPC_URL=http://127.0.0.1:8545#' services/bank/.env services/sq-guardian/.env`
2. `sed -i '' 's#^NEXT_PUBLIC_RPC_URL=.*#NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545#' apps/wallet/.env.local`
3. restart `pnpm dev`.

Works offline: every read (balances, recoverers, recovery status, countdown), guardian/relayer EOA transactions (the
fork funded them with `--fund`), the funder's USDC top-up, `demo:stage-recovery --relayer eoa` and `--finalize`.
**Does not work:** anything that is an ERC-4337 userOp — Protect, Send, the owner's cancel — no bundler/paymaster on
a fork. Say: "local fork of Base Sepolia, same addresses; sponsored transactions need the live bundler, so those
steps are from the recording" and play `docs/demo.webm` for 0:00–1:10. Revert the two `sed` lines when the network is
back. Basescan links will not resolve for fork-only transactions — don't click them.

## 6. Scripts

| Command | What |
|---|---|
| `pnpm demo:reset [--keep-db] [--all] [--db p] [--only]` | wipe `services/*/data/*.sqlite` (never `.env`), print the five EOAs' ETH/USDC + faucets + the fallback Safes. |
| `pnpm demo:predeploy [--fresh] [--topup 10] [--bank URL\|none]` | two protected Safes (Lea fallback + twin) with script-held Safety key / Emergency card, USDC top-up if the funder has any, bank registration, `data/demo-state.json`, the `localStorage` resume line. |
| `pnpm demo:stage-recovery [--wallet twin\|lea] [--relayer auto\|eoa\|sponsored] [--finalize] [--status]` | new signer proxy + two guardian signatures → `multiConfirmRecovery(execute=true)`; prints `executeAfter` and the Zürich wall-clock. `--finalize` after the grace period. |
| `pnpm demo:open [--reset]` | five Chrome instances, tiled, `?device=` URLs (`bash -n` clean). |
| `pnpm --filter @keyline/scripts anvil-fork [--fund]` | offline fallback (§5). |
| `pnpm e2e` / `pnpm screenshots` | story + attacker + fraud-cancel (videos under `e2e/test-results/**/videos/`, `docs/screens/{story,attacker,fraud}-*.png`) / every screen & state at 2×. |

## 7. Known flakiness and the mitigation

- **Shared `next dev` / Fast Refresh** (above, §4): run the wallet under test from the snapshot copy.
- **One Playwright process at a time per `outputDir`**: a second `playwright test` wipes `test-results/.playwright-artifacts-*`
  under the first one's `afterAll` (run 1 lost its story videos that way). Run the suites sequentially (`pnpm e2e`).
- **Cold routes on `next dev`**: the first visit of `/desk/queue`, `/alerts`, `/recover` after a (re)start compiles the
  route (5–30 s). The specs allow 90 s on those navigations; pre-flight visits every window once (§2).
- **Copy drift**: the wallet's microcopy is still moving ("Welcome back, Lea" / "You're back in, Lea", "Recovery started
  from a new device" / "Was this you?"). The specs match either; prefer roles + stable labels over sentences.
- **Signer deploy on "Send code"**: `POST /recoveries` deploys the new passkey's `SafeWebAuthnSignerProxy` through
  the sponsored relayer before answering — 10–60 s, during which the button spins. The tests allow 240 s; the pitch
  narrates (§3, 1:15 column).
- **Sheet backdrop intercepts clicks** after a failed top-up (`.kl-sheet` stays open): close with the header X.
- **Bundler latency**: protect 7 s (run 1), 41 s (run 3), sometimes 60 s (VERIFIED §8). Tests allow 240 s.
- **Daily sponsorship cap reached looks like a network failure** (runs 4–6, 09:27–09:32): Protect came back "The
  wallet wasn't created. Nothing was charged. The network didn't accept the request — try again." The Technical
  details say what really happened: `403 policy-refused: You used today's free transactions · the network fee is
  yours this time { sponsored: false, remainingToday: 0, dailyCap: 20 }` — six E2E runs had used the 20 sponsored
  userOps of the isolated bank. Fix: `pnpm demo:reset --keep-db` (counter only). Wallet bug filed: a policy refusal
  must not be worded as a network rejection (see the report). The specs tap **Try again** once on any Protect
  error and print the Technical details when it fails twice.
- **Public Candide endpoint** (no key, 10 req/s): the UI polls every 2→6 s, scripts ≤ 1 req/3 s. If sponsorship
  stops, the bank answers 502 (never fakes) — switch to the dashboard key in `services/bank/.env`.
- **WebAuthn origin**: the bank verifies `WALLET_ORIGIN`; a wallet on another port needs a bank started with that
  `WALLET_ORIGIN` (§4) or registration fails with "origin mismatch".
- **Virtual authenticators** die with the CDP session; never reload a Playwright page and expect the passkey to survive.
  `loseDevice()` = `WebAuthn.removeVirtualAuthenticator`, the realistic "the phone is gone".
- **Finalizer timing**: the bank polls every 5 s and the sponsored finalize takes 10–40 s; "Welcome back" appears
  15–60 s after the ring hits zero. The desk's "On-chain timer" and the ring both read `executeAfter` from the module.
- **`/me` returns Lea's latest wallet**: the SIMULATED bank has one client, so a `/recover` from any device targets
  the most recently registered wallet. Run specs sequentially (Playwright `workers: 1`), never two stacks on one bank DB.
- **Cancelled recovery keeps no tx hash in the bank** (`services/bank/src/recovery-service.ts` finalizer →
  `chain.findCancelTx` returned `null` in every run): the request flips to `cancelled` correctly, but the desk and the
  `/alerts` "Recovery cancelled" note (re-rendered from the bank's alert) show no Basescan link, although the phone had
  the hash from the bundler. Owner: bank-backend. Workaround in the pitch: the cancel receipt is in the phone's status
  sequence right after the tap.
- **Pre-deployed wallets cannot attest** (bank): `GET /attestations/:wallet/challenge` answers `409 Protect your wallet
  first` for a Safe deployed outside the bank's `/userops` relay; the fallback wallet is shown read-only.
- **Next dev overlay**: `devIndicators: false` hides it; demo in `next build && next start` if anything else shows.
