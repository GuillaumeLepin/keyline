# Keyline — demo runbook (owned by `qa-demo`)

v2 journey (SPEC §10, DECISIONS #26–#28), updated 11 Oct 2026. The pitch now opens on **Swissquote web on the
laptop**: sign in → portfolio → the Keyline tile → a 6-digit code → the phone. Everything in the 3-minute script
below exists in the app and is exercised by the E2E suite: `pnpm e2e` runs **F0 → F1 → F2 → F3 → F3.5**
(`e2e/story.spec.ts`), **F4** (`e2e/attacker.spec.ts`) and **F4b** (`e2e/fraud-cancel.spec.ts`) against a live stack
and Base Sepolia, with every "it worked" checked on-chain, plus the `screenshots` project (every screen, v2 routes in
light and dark). The suite is the executable version of this runbook; `docs/demo.webm` is the (v1) backup video.

## 0a. What is proven — WalletConnect (QA runs, 11 Oct, LIVE stack :3000/:4000/:4001 + DemoSwap :3100, Base Sepolia)

`e2e/walletconnect.spec.ts` (project `story`, serial, 9 tests): a protected wallet from the onboarding fixture; a
third browser context plays the laptop screen running **DemoSwap** (Reown AppKit + wagmi) over the **public Reown
relay**. **Two consecutive green runs, 9/9 each** (run A 1.6 min, run B 1.1 min). Funder still 0 ETH, so "Move to
Keyline" is refused honestly and the Safe holds 0 USDC (the swap takes its "unfunded" branch).

| Step | Result | Proof |
|---|---|---|
| DemoSwap **Connect wallet** → AppKit modal → **Copy link** → clipboard | ✓ the link read from the clipboard equals the QR's `uri` | `navigator.clipboard.readText()` with clipboard permissions |
| Paste in Keyline **Connect** (`/dapps`) → sheet "DemoSwap · localhost:3100 · **Verified domain** · Reviewed by Swissquote" → Connect | ✓ ~7–12 s | DemoSwap header + "Connected address" = the Safe; bank `dapp-sessions` VALID, `verifyUrl` verify.walletconnect.org |
| **Sign in (SIWE)** → phone sheet → Face ID | ✓ | DemoSwap: "Signed in as 0x… (smart account, ERC-1271). verifyMessage → true; 417-byte signature" |
| **Approve unlimited** → phone flags it (`approve-unlimited` secondary) → **Approve 100.00 USDC instead** → Face ID | ✓ ~16 s | run A <https://sepolia.basescan.org/tx/0xf64de3fe27cef5908a28687b06523c3cffdacf716642781e27b69fef6a6191cc>, run B <https://sepolia.basescan.org/tx/0x5f3c4394ae9f2fbee1933420151f1f9b1bd0a1f869bf9b73e989028d7435a882>; `allowance(safe, 0xDe30…00dE) == 100 000 000` read on-chain |
| **Swap (test)** with 0 USDC | ✓ honest block | DemoSwap: "Refused by the wallet (code 4001) … Blocked by Keyline: This transaction would fail …" (with USDC the spec asserts the hash instead) |
| **Send to sanctioned recipient** `0x42b1…0A73` (read by DemoSwap from the same bank :4000) | ✓ | bank decision `verdict: block`, `reasons[0]` "Counterparty appears on the OFAC SDN list — simulated test entry" (screened before simulation, so it wins over the 0-balance revert); same sentence on the phone and in DemoSwap's 4001 |
| Reload the phone → **Connected apps** still lists DemoSwap → detail → **Disconnect** → confirm | ✓ | DemoSwap back to "Connect wallet" / "Not connected" |
| Negative, bank: `POST /dapp-sessions` with Verify `INVALID`, `isScam`, origin ≠ metadata url | ✓ 3/3 `verdict: block` | "This app's identity could not be verified" |
| Negative, wallet sheet: a real DemoSwap proposal over the relay, the bank's answer for it rewritten to that block verdict (Playwright route on the phone) | ✓ sheet `refused`, no Connect button, DemoSwap never connects | **substituted**: only the bank verdict for that one proposal. Reown Verify attests localhost:3100 as VALID, and rewriting DemoSwap's metadata url in its JS bundle (verified in-page) still produced a proposal with url `http://localhost:3100`, so a genuine Verify mismatch could not be produced from localhost |

Full `pnpm e2e` right after (18.4 min, live stack): **121 ✓ / 1 ✗ / 13 not run** — attacker 6/6, fraud-cancel 4/4,
walletconnect **9/9 (third consecutive green;** capped approve
<https://sepolia.basescan.org/tx/0x6b9c432c84935579cc34332f7ece498f3272b8e44c189a9a3f7fcd62f3545e2b>**)**, screenshots
101/101; story failed at F0.2: Lea already had protected wallets from attacker/fraud-cancel, and the tile now offers
"Set up Keyline on another phone" (`tile-start-another`), which `openHandoff` did not know. Fixture fixed
(`e2e/fixtures/onboard.ts`), `story.spec.ts` re-run alone: **11 ✓ / 4 skipped** (F1.7, F2, F3.4, F3.5: funder 0 ETH).

Protect txs: run A <https://sepolia.basescan.org/tx/0xaec9ac6fadc34d477afaab06fa3e4c40f56765ae5b4102593a8a68f1cefff3fb>
(Safe `0xc71fE45f23C39AE2309E1BBD443417D61A6CAe5B`), run B
<https://sepolia.basescan.org/tx/0x6b6f565609e222508cae9ba0f5fd23937aa0bb0431426ef4e82a9e67cd37192b>
(Safe `0xC765081C74Eec2a87bc6eb7CB7f0A850eceb4725`). Run: `pnpm --filter @keyline/e2e exec playwright test
walletconnect.spec.ts --project=story` with the four dev servers up.

## 0. What is proven — v2 (QA runs, 11 Oct night, isolated stack :3100/:4100/:4101, Base Sepolia)

Wallet under test = a snapshot of the **committed** `apps/wallet` (`git archive HEAD`, §4): `ccff1c0`/`137779e` for
run A, `6711c0b` (Phase C + D) for the final runs. Funder `0x482B…458A` holds **0 ETH / 0 USDC**, so "Move to Keyline",
Send and Back to Swissquote are skipped with the bank's own reason (`502 Bank funder … holds 0 ETH — not enough for
… the network fee`, nothing debited, no hash) — they run the moment the funder is funded.

Run A (00:17–00:40, `pnpm e2e`, 23.3 min, fresh bank DB): **story 11 ✓ / 4 skipped, attacker 6/6, fraud-cancel 4/4**;
screenshots 90 ✓ / 5 ✗ (Send scenes — the bank's contacts gained a required `id` in `137779e`; fixtures fixed).

| Step | Result | Proof (Base Sepolia) |
|---|---|---|
| F0.1 `/swissquote` one-click sign-in → portfolio, SIMULATED chips, BTC "Not movable yet" + Why? sheet | ✓ 6.8 s | — |
| F0.2 Keyline tile → 6-digit code | ✓ | `POST /handoff` (via API in runs where an earlier spec left Lea a wallet, §7) |
| F1.1 `/start` → "Hi Lea" → passkey → counterfactual Safe; the code can't be claimed twice (409) | ✓ 6.8 s | Safe `0xbb658b963C26A2e333A870b0E689Df04545627Ad` |
| F1.2 laptop "Make this computer your Safety key?" → key in the laptop's IndexedDB → phone "Confirmed on your laptop" | ✓ 1.9 s | bank `safety-key` = the IndexedDB key |
| F1.3 Emergency card shown once — hex in no request body, no storage, no cookie | ✓ | — |
| F1.5 **Protect** — ring drew 0 → 1 → 2 → 3, closed | ✓ ring closed **12 s** after the tap | <https://sepolia.basescan.org/tx/0x59a26f34bafaf0a4d4d6289807d07d809b4d058d834185b46b22f09e671cd4f3> — 3 guardians, threshold **2** |
| F1.6 proof (ERC-1271) → "Move your first funds" → Home v2; laptop tile "Protected · 2 of 3" from chain | ✓ | bank `method: erc1271` |
| F1.7 Move to Keyline / F2 Send / F3.4 / F3.5 Back to Swissquote | skipped — funder 0 ETH / 0 USDC | honest refusal in the sheet |
| F3.1 signer deploy | ✓ | <https://sepolia.basescan.org/tx/0x3308ecb6a5714587768b7ead4ed7ae14848c112f4364e1888447998fe9d60d89> |
| F3.2 laptop Safety key + Swissquote → execute, `executeAfter` 177 s ahead | ✓ 18 s | <https://sepolia.basescan.org/tx/0x4cd7687af1a6a399802f4b74fde3b57e4e6e122e2b94b9b975e5169d8aa31a7a> |
| F3.3 finalize → "Welcome back, Lea"; owner `0xC2eD…6DA2` → `0x00FA…3e5d` | ✓ | <https://sepolia.basescan.org/tx/0xb8f7b05517aac1f8e360488d7b94f4709e95ce05f7f950b7d30d6a789234f4f7> |
| F4 attacker (Safe `0xcbD49d949C9020629f93BB0E3D153a1E9F9D0Bfc`) | ✓ 6/6 | protect `0x6c6c30b45bff7ead93bf5e43291593b2967edadf51dd1890446e2ef0afada0c6` |
| F4b fraud + owner cancel (Safe `0xa9afCB9989169506Ec0367c8a61A5D1aF543bd13`) | ✓ 4/4, cancel 17 s after the tap | execute <https://sepolia.basescan.org/tx/0xfb5205e61ef5c6c7234040ec1dac14669abdf6a7278243fc7eb301bb21f451bf>, cancel <https://sepolia.basescan.org/tx/0x83569acc31ea8af3db0f3a8c96726c07bd57f39faa2cd05c8c406e7dd05d9924> |

Run B was stopped when Phase C (`05bba0c`) landed (Send became three screens: selectors updated). Run C: story
project green up to F1.6, where `next dev` restarted itself ("approaching the used memory threshold") during the push
to `/` → heap raised to 8 GB, and the fixture reloads `/` if the push never commits. Run D: story project **21 ✓ / 4
skipped** (story Safe `0x751aa8cC0403356340430364A67dB9ea70212fE6`, protect 8 s
<https://sepolia.basescan.org/tx/0x837afb4933f1befc55750bd77a3439280956e871b7952bb1a49f2a8d55b34814>, execute
<https://sepolia.basescan.org/tx/0xb9270f828ac61c3603f0a15ed9f924fa1e6adb846336e2720e6ad995e0fcbf74>, finalize
<https://sepolia.basescan.org/tx/0x5e8e9f660e3d63ba288f01d536535898136db9fea5880ede96787212ff2d92f7>; fraud cancel
<https://sepolia.basescan.org/tx/0x8818a6cca8976a5ffc6bfe004bccff6a5ff533d5ebc3b4b8838cb37a164d08ce>), then the wallet
server was killed under the screenshot project by another agent's `pkill -f next-server` → the snapshot now runs as
`node qa-server.mjs` (§4).

**Run F (02:25–02:44, wallet `6711c0b`, 19.1 min): GREEN — 122 passed, 4 skipped** (story 11 ✓ / 4 skipped, attacker
6/6, fraud-cancel 4/4, screenshots 101/101). Story Safe `0xE4EAa171B790234F74161Ac283ebA7ba46ae4f22`: ring closed 16 s
after the tap, protect <https://sepolia.basescan.org/tx/0x91c03ba8bc13f6e01cda0c783cf90c2c919ab54efab75cae3ef76e1cd6dddf3a>,
signer <https://sepolia.basescan.org/tx/0x8c19f99ab132935d3fd9b7cfb61818979fa884ac71ec40e8e95f2621bd55dbcf>, execute
<https://sepolia.basescan.org/tx/0x4b919aa163265e28e2e55fd8d6a9e55054a0955b3aeb4c01c16b1c6cfa510d44> (`executeAfter`
176 s ahead), finalize <https://sepolia.basescan.org/tx/0x5d89d0a6e49b7a9d22ea434bafc76feec7f3deaa67a4acd5343d5cd7a832f947>
→ owner `0x5e2a…4534` → `0xf34CfE7f0cAFef794a14212e01D29D923fefD125`. Attacker Safe `0x72C3B43d8dc38B3deA02F879a0B695185C34D6EC`
(protect `0x8b585fd646df4e01c8aa010dbca154fe30db4acd1b977096dbbbed49da569d5d`); fraud Safe `0x99f7b0529cA16e15c1B4b2168736c6c2fEf2Df6b`,
execute <https://sepolia.basescan.org/tx/0x12d03a013feb2fa41f4b0af9452c73db337efc7b47a21a5d6927d2e461861c5e>, owner cancel
**7 s** after the tap <https://sepolia.basescan.org/tx/0xa46d49165ba24b7e68f026dff23129d3b8a8d7826084f1cb4f21c5e3d4e0250c>.

**Run G (02:45–03:04, wallet `ee02d81` = Phase D, 18.3 min): GREEN — 122 passed, 4 skipped** — two green full runs
in a row (F, G). Story Safe `0x330993e0bbD7188Dd88dE6B2f15084320241747F`: ring closed **9 s** after the tap, protect
<https://sepolia.basescan.org/tx/0xab1eea2c4ed01e9aba393040458435c79ec695ad1062695fe7da078b25082db1>, signer
<https://sepolia.basescan.org/tx/0x7c2563e3e5fb1c84a5d46154206fd2756959e439ca52c2fab24ab45e6b20cdb0>, execute
<https://sepolia.basescan.org/tx/0xf4f6a4c3996d58c21645a8399c4cfa580ed83906b6c3136650e8feb615930cd0> (`executeAfter`
178 s ahead), finalize <https://sepolia.basescan.org/tx/0x78cd93eb1709ad664058ae4ad676ea48a151320752c13c5b7ec8880c8d947d3d>
→ owner `0xFD7A…5496` → `0xe75e75EA7C4BAe1E2a1f0C422B59D1c151A27C67`. Attacker Safe `0x7ca52a4756D966a69959D226961EEF133349A18D`
(protect `0x76b4cc56d7deafd7fd1f83628f0e1ec9a8713300bc1f46c4010e7e6ac7e6e545`); fraud Safe `0x03b35dA4e659185022cc005D75AF021795A45d1e`,
execute <https://sepolia.basescan.org/tx/0x9a2c573a968d6916ab5bc01846ec6756ac2e562294fd4129dbd9cbdb59f7970b>, owner cancel
24 s after the tap <https://sepolia.basescan.org/tx/0x12af8a628651082beaa932b2f0d255e6f87a9a22032ae790fbeaceb71afe05b4>.

Videos of the green runs: `e2e/test-results/**/videos/*.webm` (laptop = Swissquote web, phone, new phone). Screens:
`docs/screens/story-0*-sq-*.png` (Swissquote web), `story-*.png`, `qa-v2-*-{light,dark}.png`.



## 0b. v1 history — what was proven (QA runs, 6 Oct morning, isolated stack :3100/:4100/:4101, Base Sepolia)

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



## 1. Window layout (v2: the story opens on Swissquote web on the laptop)

`pnpm demo:open` opens five **separate Chrome instances** (one `--user-data-dir` each under `~/.keyline-chrome/`,
nothing signed in to Google, nothing syncs). Screen 1 is the laptop itself; the phones and the desk go on the second
screen / projector (`SECOND_SCREEN_X`, default 1440 = the second screen sits right of the laptop):

| Window | URL (`?device=` sets the DeviceBar + the `X-Device-Label` the bank logs) | Where |
|---|---|---|
| **Lea · laptop — Safety key** | `/swissquote?device=lea-laptop` — Swissquote web (SIMULATED): sign in → portfolio → Keyline tile; later its **Approvals** nav → `/approve` | screen 1, **full width** 1440×900 |
| **Lea · laptop, tab 2 — DemoSwap** | `http://localhost:3100` (`apps/demoswap`, a real WalletConnect dApp: Reown AppKit + wagmi, Base Sepolia; `DEMOSWAP_URL` overrides) — same Chrome profile as the laptop | screen 1, tab next to Swissquote |
| **Lea · phone** | `/?device=lea-phone` → `/start` | screen 2, left, 520×900 (phone frame) |
| **Lea · new phone** | `/?device=lea-new-phone` → `/recover` at 1:40 | screen 2, top middle, 460×450 |
| **Thief · stolen phone** | `/?device=thief` (red bar) | screen 2, bottom middle, 460×450 |
| **Swissquote desk (simulated)** | `/desk?device=desk` | screen 2, right, 940×900 |

With a single screen: keep the laptop window full width and switch to the phone windows with ⌘\` — the audience
should see Swissquote web as a real laptop page, the phone as a phone.

Zoom: the script passes `--force-device-scale-factor=1.25` (`KEYLINE_CHROME_SCALE=1` to disable on a projector that
already scales). `pnpm demo:open --reset` wipes the five profiles (fresh localStorage; platform passkeys live in the
OS keychain and survive — the thief never registers one for Lea's wallet). Live demo = real Touch ID passkeys;
virtual authenticators only in Playwright.

## 2. Pre-flight checklist (T−30 min)

- [ ] `pnpm demo:reset` → DBs wiped, balances printed. **The bank sponsors 20 userOps per client per day** (SPEC §0,
      table `sponsorships`): every Protect, Send and owner-cancel counts; a full `pnpm e2e` uses ~8. After rehearsals,
      `pnpm demo:reset --keep-db` clears the counter without touching anything else — do it at T−30 and again at T−5. Funder needs **≥ 10 USDC + 0.02 ETH** for "Move to Keyline" (otherwise the bank refuses the move with the real balance); relayer
      and sq-guardian may stay at 0 ETH (the sponsored relayer Safe handles recovery, finalize and the signer deploy).
- [ ] `pnpm dev` → `/health` on :4000 (`paymasterEnabled: true`) and :4001 (`chainPort: "real"`, `submitter: "sponsored-safe"`).
      `DEMO_FAST_MODE=true` in `services/bank/.env` (identity verdict signed without a desk click; the desk still shows it).
- [ ] ⚠ **v2 order matters:** the live onboarding needs the Swissquote tile's "Set up Keyline on my phone", which the
      app only shows while Lea has **no** wallet at the bank (§7). `demo:predeploy` registers the fallback Safe and
      the twin under Lea → the tile shows "Protected" and the 0:15 step is gone. Until the app is fixed: run
      `demo:predeploy --bank none` (Safes on-chain only; the twin's staged recovery then has no desk/bank record) or
      rehearse the live onboarding on a bank DB without predeployed wallets, and keep the predeployed run as the
      fallback stack.
- [ ] DemoSwap on :3100 (`pnpm --filter @keyline/demoswap dev` or the turbo `dev`), `NEXT_PUBLIC_REOWN_PROJECT_ID` set in `apps/demoswap/.env.local` and the wallet's env; it talks to the same bank :4000 as the wallet. Phone **Apps** tab shows no stale DemoSwap session (Disconnect it after rehearsals). `pnpm e2e -- walletconnect.spec.ts` green within the hour = relay + Verify + sponsor alive.
- [ ] `pnpm demo:predeploy` → `data/demo-state.json` with Lea's fallback Safe + the **twin**; both "Protected" on Basescan.
- [ ] `pnpm e2e` green within the last hour (or at least `story.spec.ts` F1–F3) → bundler, sponsor, relayer, finalizer alive.
- [ ] **Clean profiles after rehearsals:** in each of the five profiles open `http://localhost:3000/dev/reset?device=<persona>`
      once (`lea-phone`, `lea-laptop`, `thief`, `lea-new-phone`, `desk`) and press **Clear this profile** — dev-only page;
      it clears that profile's `keyline*` local/sessionStorage, the Safety key (IndexedDB `keyline`) and the bank session
      cookie (via `POST /auth/logout`). Then delete the leftover passkeys in
      `chrome://password-manager/passkeys` (rpId `localhost`) so Touch ID offers no stale Keyline credential.
- [ ] `pnpm demo:open` (the laptop window opens on `/swissquote?device=lea-laptop`, signed out); macOS Focus on; laptop charged; hotspot ready; `pnpm --filter @keyline/scripts anvil-fork --fund`
      terminal ready but not switched (§5).
- [ ] Backup video `docs/demo.webm` (or `.mp4`) open in QuickTime, paused at 0:00.
- [ ] The fallback Safe's Emergency card hex in a text file *outside the app* (`data/demo-state.json → lea.guardians.emergencyCard`).
- [ ] Desk operator token at hand (`DESK_OPERATOR_TOKEN` in `services/bank/.env`); desk window already signed in.
- [ ] Lea's e-mail on file: `lea.keller@example.ch`; the code is read from `/mock/inbox` (SIMULATED badge).
- [ ] **T−2:30:** `pnpm demo:stage-recovery` → prints the exact Zürich time the twin's countdown ends; open
      `/recover?device=lea-new-phone` on the twin's recovery so the ring is on screen at 2:30.

## 3. Minute-by-minute (3-minute slot; ≥ 5 min → run F3 live on one wallet and skip the twin)

v2 journey (SPEC §10): Lea starts where she already banks — Swissquote web on her laptop — and Keyline is a tile
there. Confirmation waits are 5–30 s on Base Sepolia; the right-hand column is what to say *during* them.

| Time | Window | Do | Say | While waiting |
|---|---|---|---|---|
| 0:00 | Lea · laptop `/swissquote` | **Sign in** (Lea pre-filled, one click) → Portfolio: CHF cash, SMI ETF, BTC, ETH, USDC, EURC, every figure with its SIMULATED chip. | "USD 409 M stolen through compromised keys in 2024 — Swissquote's own figure. A client who wants their own keys has to leave the bank today. Keyline keeps her here: her keys, a Swiss bank as a safety net that can never move her money." | — |
| 0:10 | Bitcoin row → **Why?** | Point at "Not movable yet", open the sheet (the Bitcoin script diagram), close it. | "Bitcoin stays in her Swissquote account for now. Keyline moves an asset only when it can give it the same protection — her key, two of three recoverers, a public waiting period. Bitcoin needs a different key design for that; it's on the roadmap, not faked." | — |
| 0:15 | Keyline tile → **Set up Keyline on my phone** | QR + 6-digit code, "Waiting for your phone". | "One tap on the bank's page — no app store search, no seed phrase." | — |
| 0:20 | Lea · phone `/start` | Type the code (or scan) → **"Hi Lea"** → Create my Keyline → **Create with Face ID**. The laptop tile turns "Phone connected". | "The phone knows it's Lea from the bank session — no form. Her key is created inside the phone's secure chip; it never leaves it." | — |
| 0:30 | Lea · laptop (Swissquote page) | "Make this computer your Safety key?" appears by itself → **Make this computer my Safety key**. Phone: "Confirmed on your laptop" → Continue. | "Her laptop becomes her second key — nothing to type. It can co-approve large transfers and help restore access; it can't spend on its own." | — |
| 0:40 | Lea · phone | Emergency card → **I stored it** → Yes → Default → **Protect my wallet**. | "The Emergency card is shown once, printed, never stored: it cannot spend, it can only restore after a waiting period." | **While the ring draws** (7–30 s): "One signature. When the block lands, each arc is one recoverer written into her wallet on-chain — her Safety key, her Emergency card, Swissquote. The ring closes at three: any two of them can restore access, none of them can spend. Swissquote pays the network fee." |
| 0:55 | Protected → status link (**In block …** → Basescan) | Point at the module's three guardians, threshold 2. Then **Sign the proof** → "Move your first funds". | "Three recoverers, any two restore, Swissquote the only institution on the list — verifiable here, not in our code. The proof is the Travel-Rule check: the wallet signs that it is Lea's, no screenshots." | — |
| 1:05 | Lea · laptop: tile now **Protected · 2 of 3 recoverers** → USDC **Move to Keyline** → 10 → Move | Real transfer from the bank to her Safe; the phone's Assets update within a minute. *Funder empty → the sheet says "Swissquote's test account has no funds for this asset right now. Nothing was moved and nothing was debited." Say "the test funder is dry, the transfer is in the recording" and go to 1:10.* | "No ownership check needed — the wallet is verified as hers. Real on-chain transfer; the ledger on the bank side is simulated." | Move (5–20 s): "The tile reads the wallet from the chain, never from the bank's database." |
| 1:10 | Lea · phone (only with USDC) Send → Lukas Meier → CHF 2 → **Confirm with Face ID** | Signed → Sent → In block → Confirmed. Then close Lea · phone. | "Decoded in words before she signs, counterparty screened, fee paid by Swissquote. … Lea's phone is gone." | — |
| 1:12 (+25 s) | **Connect to a real protocol** — laptop: DemoSwap tab (`http://localhost:3100`, opened by `demo:open`); Lea · phone: **Apps** tab | DemoSwap **Connect wallet** → AppKit modal → **Copy link** → paste into Keyline **Connect** on the phone → sheet: DemoSwap · localhost:3100 · **Verified domain** + "Reviewed by Swissquote" → **Connect** (DemoSwap header shows the Safe). DemoSwap **Sign in** → phone "Sign in to localhost:3100" → **Sign in with Face ID** → DemoSwap: "Signed in … (smart account, ERC-1271)". DemoSwap **Approve unlimited** → phone flags it (danger) → **Approve 100.00 USDC instead** → **Approve with Face ID** → DemoSwap: Confirmed + tx hash, `value = 100 USDC`. *Short slot: show only Connect + approve(∞) → capped; skip Sign in.* | "Any WalletConnect app works the same way — this is a real dApp over Reown's public relay. Every request goes through the same review, screening and sponsor as a transfer: an unlimited approval is flagged and capped before she signs. Sign-in is a real ERC-1271 signature the dApp verifies with stock viem." **Any-protocol line:** "Not just our test app — Reown's AppKit Lab (lab.reown.com/appkit?name=wagmi), a third-party dApp on Base Sepolia, connects the same way; sign message verifies." (show only if asked, or in the ≥ 5 min version) | Approve inclusion (≈ 4–10 s): "The dApp gets the real transaction hash and reads the Approval event from the receipt — the allowance on-chain is 100, not infinity." |
| 1:15 | Thief `/` → `/recover` | Home: "This device has no key for this wallet." → Create key → `lea.keller@example.ch` → code from `/mock/inbox` → e-ID form, type a wrong name → Submit → **`/refused`**. Desk: Refused tab → request → **Override** → status stays "Waiting for a 2nd recoverer". | "He has her phone and her inbox, so the e-mail code passes. He can't pass the identity check. And even if the bank were fooled — here, override — Swissquote's confirmation alone leaves the recovery waiting forever: 2 of 3 is enforced on-chain." | Signer deploy (10–60 s) after "Send code": "The bank deploys the new key's signer now — a real transaction, so a refused attempt still costs Swissquote a fee, never the client." |
| 1:40 | Lea · new phone `/recover` + Lea · laptop **Approvals** (`/approve`) | Create key → e-mail → code → e-ID (Lea Keller, prefilled) → "Waiting for a second recoverer" (Swissquote confirmed) → laptop **Confirm with Safety key** (the key the Swissquote page created at 0:30) → "Access restores at hh:mm" ring. | "Swissquote verifies her identity — simulated e-ID, chip on screen — and confirms as one recoverer; her laptop is the second. Executed. Now the chain enforces a waiting period: three minutes here, seventy-two hours in production. Public, un-shortcuttable." | Relay (5–30 s): "One transaction carries both signatures — Swissquote's held one and the laptop's. The module attributes each approval to the recoverer, not to who paid." |
| 2:10 | Lea · phone `/alerts` (fallback wallet) | Show "Recovery started from a new device" + **Cancel recovery — it wasn't me** (don't click unless ≥ 5 min). | "During the wait the old phone can veto with one tap: the account cancels on the module itself, sponsored. That's the fraud case — the bank fooled *and* the card photographed — stopped by the owner." | — |
| 2:30 | Twin wallet (`/recover?device=lea-new-phone`, staged at T−2:30) | Countdown ends → bank finalizer → **"Welcome back, Lea"** → Basescan: owner = the new key only. | "This one we started before walking up so you see the end: restored, old key revoked on-chain." | If the finalizer lags (≤ 30 s): "The bank's finalizer polls the chain every five seconds and submits a sponsored finalize; the module checks the time, not the bank." |
| 2:45 | Home → **Back to Swissquote** (show the review only) → README table | Review: "Your Swissquote account · verified", Tier 1, Travel Rule line. | "Money goes back the same way it came: to her own verified account, always the lowest tier. Real: passkeys, the Safe, sponsored transactions, on-chain recovery with a veto window, screening, a separate guardian process. Simulated: identity, e-mail, Swissquote web and its ledger." | — |
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
# snapshot of the COMMITTED wallet (not other agents' half-edited files): git archive → rsync
T=$(mktemp -d) && git archive HEAD apps/wallet | tar -x -C "$T"
rsync -a --delete --exclude node_modules --exclude .next --exclude .turbo --exclude .env.local --exclude qa-server.mjs "$T/apps/wallet/" e2e/.wallet-snapshot/
cp apps/wallet/.env.local e2e/.wallet-snapshot/.env.local
cp e2e/qa-server.mjs e2e/.wallet-snapshot/qa-server.mjs
ln -sfn "$PWD/apps/wallet/node_modules" e2e/.wallet-snapshot/node_modules
# 8 GB heap: with the default, `next dev` restarts itself ("approaching the used memory threshold") mid-run
# `qa-server.mjs` = `next dev` in-process (custom server): its process is `node qa-server.mjs`, not `next-server`, so
# another agent's `pkill -f next-server` (aimed at its own :3000) no longer kills the E2E stack mid-run (11 Oct).
cd e2e/.wallet-snapshot && NODE_OPTIONS=--max-old-space-size=8192 NEXT_PUBLIC_BANK_URL=http://localhost:4100 node qa-server.mjs
# tests against it
E2E_WALLET_URL=http://localhost:3100 E2E_BANK_URL=http://localhost:4100 pnpm e2e
pnpm --filter @keyline/scripts demo:reset --only --db services/bank/data/e2e-bank.sqlite --db services/sq-guardian/data/e2e-sq.sqlite
```

Why the snapshot: two `next dev` servers on one `apps/wallet/.next` corrupt each other (ENOENT 500s), and every edit
by another agent triggers a Fast Refresh that remounts the page under test (run 1 this morning failed F1.6 exactly
like that: `[Fast Refresh] rebuilding` in the trace, blank onboarding page). The copy must stay **inside the
monorepo** (module resolution has to reach the root `node_modules`; outside it Next tries to `pnpm add typescript`).
Re-sync the copy from `HEAD` before each run. Caveat: the snapshot resolves `@keyline/ui` / `@keyline/shared` through the
workspace, so uncommitted edits in `packages/*` still reach it. `PersonaSession.goto` additionally retries a 5xx/ENOENT
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
| `pnpm demo:open [--reset]` | five Chrome instances (`bash -n` clean): laptop full width on `/swissquote?device=lea-laptop`, phones + desk on the second screen (`SECOND_SCREEN_X`). |
| `pnpm --filter @keyline/scripts anvil-fork [--fund]` | offline fallback (§5). |
| `pnpm e2e` / `pnpm screenshots` | story v2 + attacker + fraud-cancel (videos under `e2e/test-results/**/videos/`, `docs/screens/{story,attacker,fraud}-*.png`) / every screen & state at 2×, v2 routes as `qa-v2-*-{light,dark}.png`. |

## 7. Known flakiness and the mitigation

- **v2: the Keyline tile only opens a handoff for a client without a wallet** (app limitation, reported to
  `wallet-client`/`bank-backend`): the tile and "Make this computer your Safety key?" follow Lea's *newest* wallet at
  the bank. Once that wallet is protected the tile says "Protected · 2 of 3 recoverers" and offers no "Set up Keyline
  on my phone"; a brand-new laptop profile even reads "This computer is already your Safety key". In the suite only
  the first spec of a run (attacker, alphabetical) drives the tile; later specs open the code through the same
  `POST /handoff` with the laptop's web session and carry the annotation `handoff-via-api`. **For the pitch this means
  the bank DB must not hold a Lea wallet before 0:15** — see the pre-flight warning (§2).
- **v2: cold routes reload open pages.** `next dev` compiles a route on first visit and then hot-reloads every open
  page; a reload mid-onboarding drops the phone's in-memory onboarding token. The specs call `warmRoutes()` (18
  routes, ~70 s cold, < 1 s warm) before opening any persona; pre-flight visits every window once.
- **v2 screenshots are prefixed `qa-v2-*`** (light + dark): `docs/screens/v2-*.png` belong to the design agent.

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
