# Design audit

**Restored build (10 Oct, `main` after the Stage rollback):** Wave 1 re-checked — all 28 fixed rows still hold on current code; #28 stays open (`copyGaps`, 44 refs). Wave 2 statuses are in the "Wave 2 status, 10 Oct" table; new findings in "Restored build, 10 Oct" at the end. `docs/DESIGN.md` carries no Stage section (§11 is the review checklist; Appendix A has no `stage.*`).

**Wave 1 status (re-checked 6 Oct 08:40):** 28 of 29 rows are fixed in the current sources (9 in `packages/ui`, 19 in `apps/wallet`); #28 stays open because a new Wave 2 `copyGaps` block exists. Wave 2 table below.

## Wave 1 (onboarding, pair, home, send, review)

Reviewer: `design-system`. Inputs: `docs/screens/w1-*.png` (15), `docs/screens/design-kitchen-sink.png`, sources under `apps/wallet/app/(client)`, `apps/wallet/app/(laptop)`, `apps/wallet/src/components`, `apps/wallet/src/copy.ts`.
Judged as a Swissquote product manager would: does it read like a bank statement, amount first, every mock badged, "Protected" convincing, "What will happen" the centre of the review screen, persona bars distinct.

Overall: the typographic system holds (Hanken, hairlines, one accent, 6/10 px radii, no palette classes, no emoji, no banned words, no inline prose outside `copy.ts`/`copyGaps`). The three blockers are all about honesty and verifiability, not style. "Protected" (step 5) is the strongest screen in the wave. Thief bar is red and the Thief home has no primary — correct. Only three of five persona bars appear in this wave (`lea-phone`, `lea-laptop`, `thief`); `lea-new-phone` and `desk` are not exercised yet.

Severity: **blocker** = contradicts CLAUDE.md non-negotiables or makes a judge distrust the product · **should** = fix before the next screenshot pass · **nit** = fix when touching the file.

## Audit table

| # | Screen | Screenshot | Violation | Severity | Fix (file + exact change) | Status (checked against sources 6 Oct 08:40) |
|---|---|---|---|---|---|---|
| 1 | Home | `w1-home-topup.png` | `SimulatedBadge` sits on the CHF balance (`CHF 0.00 SIMULATED`). A judge reads "the balance is fake". The USDC balance is a real chain read; only the CHF conversion is mocked. | blocker | `apps/wallet/app/(client)/page.tsx` `WalletHome`: remove `<SimulatedBadge />` from `<p className="kl-balance__amount">`; after `<p className="kl-balance__secondary">{formatUSDC(usdc)}</p>` add `<p className="text-12 text-ink-3">{copy.send.rate(formatCHF(env.chfPerUsdc))} <SimulatedBadge /></p>` (spec §10 Home updated). | fixed |
| 2 | Onboarding step 3 | `w1-onboarding-card.png` | Printed Emergency card shows `Recoverer 0x67dC…B725` and `For wallet 0xBF9E…5650` — a paper card with truncated addresses cannot be verified on Basescan without the app. Ban list: truncated address with no way to see the full one. | blocker | **Fixed in `packages/ui`** (`EmergencyCard` prints both full addresses in mono under the QR block). No wallet change. | fixed (ui) |
| 3 | Onboarding step 6 | `w1-onboarding-prove.png`, `w1-onboarding-proven.png` | `Client  SQ-48213-LK` is a mocked Swissquote client file with no `SimulatedBadge` (CLAUDE.md §2: every simulated identity element is badged). | blocker | `apps/wallet/app/(client)/onboarding/page.tsx` `Step6`, both `Panel`s: `{ label: s.rows.client, value: <>{env.clientId} <SimulatedBadge /></> }` (done state: `<>{sign.data.attestation.clientId} <SimulatedBadge /></>`). | fixed |
| 4 | Home | `w1-home.png` (sheet) | Top-up `Sheet` renders as the 480 px desk modal over the phone bezel instead of a bottom sheet inside the phone screen. | should | **Fixed in `packages/ui`** (`components.css`: a `.kl-sheet` inside `.kl-phone__screen` is `position:absolute`, bottom-anchored, clipped by the screen). No wallet change. | fixed (ui) |
| 5 | Home | `w1-home.png`, `w1-home-topup.png` | Next.js dev overlay `1 Issue` is visible: a runtime/hydration error exists in app code. Screenshots with the overlay are not shippable. | should | `wallet-client`: open the overlay in `pnpm dev`, fix the error (likely the `useLocalWallet` / persona first-render path in `page.tsx`). `qa-demo`: fail `pnpm screenshots` when `nextjs-portal` is present. | fixed — no overlay in any `w2-*` capture; `story-07/08` predate the fix |
| 6 | Home, Send, Review, Onboarding 2/3/4/6, Pair, Activity | `w1-home.png`, `w1-send-review.png` | Error title `Something didn’t work` is paired with the *offline* body (`…The bank service answers policy checks and pays network fees; try again in a moment.`). Contradictory sentence; the offline title/body pair is already produced by `ApiErrorState` when `error.offline`. | should | Replace every `body={copy.common.offlineBody}` passed to `<ApiErrorState>` with `body={copy.common.errorBody}` (new key, Appendix A): `page.tsx` ×4 (balance, events, login, top-up), `send/page.tsx` ×1, `onboarding/page.tsx` ×4 (steps 2, 3, 4, 6), `pair/page.tsx` ×1, `activity/[hash]/page.tsx` ×1. In `Step1`, `body={copy.onboarding.s5.errorBody}` ("Nothing was charged…") is the wrong sentence for a passkey/bank failure → `copy.common.errorBody`. | fixed |
| 7 | Onboarding step 2 | `w1-onboarding.png` | `SIMULATED` badge on its own line under the pairing code. §9: the badge is placed inline after the thing it qualifies, never on its own line. | should | `onboarding/page.tsx` `Step2`: delete `<p className="text-12 text-ink-3"><SimulatedBadge /></p>`; change the countdown line to `<p className="text-12 text-ink-3">{s.expiresIn(formatDuration(remaining))} <SimulatedBadge /></p>` and the expired line to `<p className="text-12 text-ink-3">{s.expired} <SimulatedBadge /></p>`. | fixed |
| 8 | Onboarding step 2 | `w1-onboarding.png` | `Waiting for your laptop` printed twice (KeyCard `where` line and status chip). | should | `Step2` `<KeyCard>`: `where={s.keyWhere}` (always); keep `statusWord={claimed ? undefined : s.waiting}`. | fixed |
| 9 | Onboarding step 2 | `w1-onboarding-paired.png` | After the laptop paired, the 6-digit code and `Code expires in 09:57` are still shown and ticking. | should | `Step2`: wrap the code block (`<div className="kl-stack kl-stack--tight items-center text-center">…</div>`) in `{claimed ? null : (…)}`; the Skeleton/ApiErrorState branches stay. | fixed |
| 10 | Onboarding step 4 | `w1-onboarding-mode.png` | `· Not in this prototype` wraps onto its own line with an orphaned middle dot. | nit | `Step4` assisted `meta={<><span>{s.assistedWait}</span><span>{s.assistedUnavailable}</span><SimulatedBadge label={s.assistedPartner} /></>}` — the meta line is a flex row with gap; no literal `·`. | fixed |
| 11 | Onboarding step 4 | `w1-onboarding-mode.png` | Disabled Assisted card at 55 % opacity: `--ink-3` text drops to ≈ 2.6:1. | should | **Fixed in `packages/ui`** (`.kl-radio--disabled`: `--surface-2` fill + dashed border, text colours unchanged; ink-3 on surface-2 = 4.57:1). | fixed (ui) |
| 12 | Onboarding step 5 | source | Refused path renders `phase.decision.reasons.join(' · ')` — raw backend prose as client copy. | should | `Step5`: `<PolicyLine … reason={copy.common.policyRefused} />` and add `<Disclosure summary={copy.common.technicalDetails}><pre className="kl-code">{phase.decision.reasons.join('\n')}</pre></Disclosure>` under it. | fixed |
| 13 | Pair | `w1-pair.png` | Badge `PROTOTYPE: SOFTWARE KEY` is an invented string (`'prototype: software key'` literal in `pair/page.tsx`), duplicates the `Note` right below it, and uses `SimulatedBadge` for something that is not a mock. | should | `apps/wallet/app/(laptop)/pair/page.tsx`: remove the `nameTrailing={…}` prop from `<KeyCard>`. The `Note` keeps `copy.pair.note`. | fixed |
| 14 | Pair | `w1-pair-done.png` | Success `Note tone="ok"` showed a warning icon (`WarningCircle`) with a green border — icon and word disagreed. | should | **Fixed in `packages/ui`** (`Note` ok tone → `CheckCircle`). | fixed (ui) |
| 15 | Pair | `w1-pair-done.png` | `statusWord={copyGaps.pairedOnLaptop}` | nit | `copy.pair.pairedHere`. | fixed |
| 16 | Send | `w1-send.png` | Contacts: `Known` / `New — first transfer` are rendered in the **amount** slot (16 px, 600) — they read like amounts and outweigh the names; the address meta is sans, not mono. Spec: address mono, `Known` as a small ok status with ✓. | should | `apps/wallet/app/(client)/send/page.tsx` contact `<StatementRow>`: drop `amount={…}`; `meta={<span className="kl-mono">{shortAddress(c.address)}</span>}`; `status={c.verifiedOwnership ? 'ok' : undefined}`; `statusWord={c.verifiedOwnership ? copy.send.known : undefined}`; for unverified contacts append the word to meta: `meta={<><span className="kl-mono">{shortAddress(c.address)}</span><span>{copy.send.newContact}</span></>}`. | fixed |
| 17 | Send | `w1-send.png` | `Sanctioned test addre…` — contact name truncated. | nit | **Fixed in `packages/ui`** (`.kl-row__label` wraps to two lines instead of ellipsis). | fixed (ui) |
| 18 | Send | source | After picking a contact, `Recipient: 0xdD50…253E` is plain text — no way to see or copy the full address. | should | `send/page.tsx`: replace the `<p className="text-12 text-ink-3">{copyGaps.recipientLabel}: …</p>` with `<Address value={picked.address} label={copy.send.recipient} explorerUrl={addressUrl(picked.address)} />` (import `addressUrl` from `@/src/lib/chain`). | fixed |
| 19 | Review | `w1-send-review.png` | The policy `ErrorState` (title + body + button + disclosure, ~230 px) sits between the amount and `What will happen`, pushing the panel below the fold. The panel must be the centre of the screen. | should | `apps/wallet/app/(client)/send/review/page.tsx` `Review`: keep `<Skeleton kind="line" count={2} />` in the verdict slot, but move the `decision.isError` `<ApiErrorState …>` to just after `<Panel …/>` (before the `Disclosure`), with `body={copy.common.errorBody}` (`copy.activity.failedBody` is correct only for `confirm.isError`). | fixed (verify on re-shoot) |
| 20 | Review | `w1-send-review.png` | `Your balance  0.00 USDC → −25.00 USDC`. Review was reached with more than the balance (the `/send` funds check is skipped while `balance.data` is undefined). The current code hides the negative number but still lets the draft through. | should | `review/page.tsx`: in `whatWillHappen`, keep `before → after` only when `after >= 0` (done); in `Review`, when `balance.data !== undefined && draft.amountUsdc > balance.data` render `<Note tone="danger">{copy.send.errFunds(formatUSDC(balance.data))}</Note>` and force `canConfirm = false`. | fixed |
| 21 | Review | source | `block` fallback `reason={decision.reasons.join(' · ')}` — raw backend prose. | should | `Verdict` block case: `reason={decision.screening.hit ? p.block.reason : copy.common.policyRefused}`; reasons already appear under `Technical details`. | fixed |
| 22 | Review | source | Cooling `PolicyLine` reason `You can cancel for 0:59` is computed once at render and never ticks while the ring does. | nit | Use the `useNow` hook from `onboarding/page.tsx` (move it to `src/lib/hooks.ts`) and `formatDuration(endsAt - now)`. | fixed |
| 23 | Review, Step 2, Step 6, Activity | `w1-send-review.png` | Explorer link label `Basescan` ≠ spec `View on Basescan`. | nit | **Fixed in `packages/ui`** (`Address`). | fixed (ui) |
| 24 | Home (thief) | `w1-home-thief.png` | `TestnetStrip` link broke as `View on` / `Basescan`. | nit | **Fixed in `packages/ui`** (`.kl-testnet a { white-space: nowrap }`). | fixed (ui) |
| 25 | Home | source | `Statement · All` links to `/security`. | nit | `page.tsx` `WalletHome`: remove the `All` `<Link>` until an activity list route exists. | fixed |
| 26 | Alerts | source | `ScreenHeader title={copy.alerts.emptyTitle}` → header `No alerts` above an empty state `No alerts`. | nit | `alerts/page.tsx`: `title={copy.alerts.title}` (new key). | fixed |
| 27 | All | source | `ScreenHeader` back button `aria-label="Back"` literal. | nit | `src/components/ScreenHeader.tsx`: `aria-label={copy.common.back}` (import `copy`). | fixed |
| 28 | All | source | `copyGaps` block in `copy.ts` (25 strings) — now in Appendix A. | nit | Re-paste Appendix A, replace `copyGaps.*` with the keys in the mapping below, delete the block. | Wave 1 keys fixed; a new Wave 2 `copyGaps` block (79 refs) exists → W2-N8 |
| 29 | Onboarding 5, Home, Laptop shell | source | Inline `style={{…}}` in 5 places (`marginTop: 0`, `gap: var(--space-4)`, `flexShrink: 0, paddingTop: 2`). | nit | Use utilities (`mt-0`, `gap-4`, `shrink-0 pt-0.5`); no inline style outside `packages/ui`. | fixed in app code (inline styles remain only in `/design`, allowed) |

**Counts:** 3 blockers (1 fixed in ui, 2 for wallet-client) · 14 should (3 fixed in ui, 11 for wallet-client) · 12 nits (3 fixed in ui, 9 for wallet-client).

Verified clean (no row): Tailwind default palette classes, gradients, shadows, `rounded-2xl`, emoji, `$`, "Dashboard/Overview/Welcome back", guardian/gas/seed/userOp outside `Technical details`, spinners without sentences, missing loading states (every query has a `Skeleton`), tap targets (buttons 48 px, rows 56 px), one primary per screen (Thief home has none, Review disables it), `formatCHF`/`formatUSDC` everywhere, text clipping at 390 px.

## Strings missing from DESIGN.md — now added to Appendix A

Added in `docs/DESIGN.md` Appendix A (and §9 for the error rules). `wallet-client`: re-paste Appendix A into `apps/wallet/src/copy.ts`, replace the `copyGaps` references with the keys below, delete `copyGaps`.

| `copyGaps` key | Appendix A key | String |
|---|---|---|
| `notAvailableTitle` | `common.notAvailableTitle` | `Not available yet` |
| `notAvailableBody` | `common.notAvailableBody` | `Swissquote is still switching this on. Nothing was changed — try again in a moment.` |
| `comingSoonTitle` | `common.comingSoonTitle` | `Coming in the next step` |
| `comingSoonBody` | `common.comingSoonBody` | `This screen is built in the next wave of the prototype.` |
| — (new) | `common.errorBody` | `Nothing was changed. Try again in a moment.` — generic body for `ApiErrorState` when the screen has no sentence of its own |
| — (new) | `common.policyRefused` | `Swissquote’s policy check didn’t approve this. Nothing was sent.` |
| `guardianPending` | `common.pending` | `Pending` |
| `signIn` | `home.signIn` | `Sign in` |
| `signInTitle` | `home.signInTitle` | `Sign in with your phone key` |
| `signInBody` | `home.signInBody` | `Your Face ID or fingerprint unlocks the key that stays on this phone.` |
| `noWalletTitle` | `home.noWalletTitle` | `No Keyline on this device yet` |
| `noWalletBody` | `home.noWalletBody` | `Create a wallet or sign in with the phone key that owns it.` |
| `createWallet` | `home.createWallet` | `Create a Keyline` |
| `receiveTitle` | `home.receiveTitle` | `Receive` |
| `pairedOnLaptop` | `pair.pairedHere` | `Paired on this laptop` |
| `recipientLabel` | `send.recipient` | `Recipient` |
| `pasteAddress` | `send.pasteAddress` | `Paste an address` |
| `simulatedRate` | `send.indicativeRate` | `indicative rate` |
| `reviewMissingTitle` | `review.missingTitle` | `Nothing to review` |
| `reviewMissingBody` | `review.missingBody` | `Choose a recipient and an amount first.` |
| `activityNotFoundTitle` | `activity.notFoundTitle` | `Transfer not found` |
| `activityNotFoundBody` | `activity.notFoundBody` | `This device has no record of that transfer.` |
| `skipProof` | `onboarding.s6.skip` | `Skip for now` |
| `retryAttestation` | `onboarding.s6.retry` | `Sign again` |
| `statusInBlock` | already `review.sequence[2]` | `In block` — delete the gap key |
| `keyPhone` | already `security.phoneKey.name` | `Phone key` — delete the gap key |
| — (new) | `alerts.title` | `Alerts` |

Spec clarifications added to §10: Home balance carries no badge; the mocked conversion is shown as `Rate 1 USDC = CHF 0.80 SIMULATED` (reuse `send.rate`). Step 6 `Client` row carries `SimulatedBadge`.

## `packages/ui` fixes applied

Gates: `pnpm --filter @keyline/ui typecheck` ✓ · `pnpm --filter @keyline/ui test` ✓ (11/11) · `pnpm exec biome check packages/ui` ✓ (0 warnings).

| File | Change |
|---|---|
| `packages/ui/src/components/EmergencyCard.tsx` | Card prints the **full** wallet address and recoverer address (`<dl class="kl-ecard__ids">`, mono 12 px, wraps) instead of `shortAddress`; the head keeps only the title. Audit #2. |
| `packages/ui/src/components/States.tsx` | `Note tone="ok"` uses `CheckCircle` (was `WarningCircle`). Audit #14. |
| `packages/ui/src/components/Address.tsx` | Explorer link label `View on Basescan` (was `Basescan`). Audit #23. |
| `packages/ui/src/components.css` | `.kl-row__label`: 2-line clamp with `overflow-wrap: anywhere` instead of single-line ellipsis (#17). `.kl-testnet a`: `white-space: nowrap; flex: none` (#24). `.kl-radio--disabled`: `--surface-2` fill + dashed border, name in `--ink-2`, no opacity (#11). ≥ 768 px: `.kl-phone__screen { position: relative }` and a `.kl-sheet` inside it becomes `position: absolute`, bottom-anchored, full phone width, 10 px top radii, clipped by the screen (#4). New `.kl-ecard__ids` block (#2). |

Not changed on purpose: `ErrorState`/`Sheet`/`EmergencyCard` keep their own English defaults (they are the same strings as Appendix A); the kitchen sink needs no update.

## Remaining risks

- Screens not yet in this wave (`/security`, `/recover`, `/alerts` content, `/refused`, `/approve` queue, `/desk`, `/mock/*`) will be audited in Wave 2; the countdown ring and the five-bar persona set are unverified in real screens.
- Re-shoot `w1-home*.png` after #1, #4 and #5: the current Home screenshots only show the sheet, never the plain statement screen, so the amount-first hierarchy of Home has not been judged on a real capture.
- `#20` depends on the balance query being settled before `/send` validates; if `useUsdcBalance` is slow the funds check still races.


---

# Wave 2 (recover, alerts, refused, security, approve, desk, mock)

Inputs: `docs/screens/w2-*.png` (27), `docs/screens/story-*.png` (14), sources `apps/wallet/app/(client)/{recover,alerts,refused,security,mock/*}/page.tsx`, `(laptop)/approve/page.tsx`, `(desk)/**`. Judged as a Swissquote PM watching the climax: the ring is the single motion and the exact finish time is shown (✓); the "accelerated for the demo" caption is present (✓); the desk has no "Dashboard", shows the Real/Simulated legend, the "cannot move client funds" footer and the override copy verbatim (✓); identity signals, e-ID, inbox and operator SSO are all badged (✓); `/refused` is calm, final and has no primary (✓). The problems are credibility (the demo visibly cheats on the identity check; an override erases a failed verdict), duplication (the finish time three times, persona labels leaking into client copy) and three screens where the state and the sentence disagree.

Severity as in Wave 1. "ui" = fixed in `packages/ui` by this pass; everything else is an exact instruction for `wallet-client` (or the named owner).

| # | Screen | Screenshot | Violation | Severity | Exact fix |
|---|---|---|---|---|---|
| W2-1 | Desk request (thief), `/mock/eid`, `/alerts`, `/refused` | `w2-desk-request-thief.png`, `w2-mock-eid.png`, `w2-alerts.png` | The identity refusal reason reads `Device label contains "thief" (Thief · stolen phone)`, and the e-ID stand-in body says so. The bank refuses because the device *announced* it is the thief — a judge concludes the identity check is theatre. The persona label (a demo aid for judges) is being sent to the bank as the device label. | **blocker** | `bank-backend`: remove the device-label rule from the e-ID stand-in; the thief fails on `name "Max Muster" ≠ client "Lea Keller"` (and liveness when toggled off). `wallet-client` `src/lib/device.ts` `getDeviceLabel()`: return a device-ish label, never the persona (`lea-phone` → `iPhone · this phone`, `lea-new-phone` → `iPhone · new device`, `thief` → `Android · unknown device`, laptop → `MacBook · Safety key`); the `DeviceBar` keeps the persona. `copy.mock.eidBody` → `Stand-in for the Swiss e-ID (live 1 Dec 2026). A name that doesn’t match the client, or a failed liveness check, fails.` (Appendix A updated). |
| W2-2 | Desk request after override | `w2-desk-override.png` | After `Override (demo: assume the bank was fooled)` the identity rows flip to `Name matches · Passed · Pass, signed by the bank`. The failed check is erased from the operator's screen; CLAUDE.md §2 forbids a passing identity check that was not passed. | **blocker** | `apps/wallet/app/(desk)/desk/requests/[id]/page.tsx` `signalRows`: build rows from the *original* signals (`item.signals` at refusal time) and, when `r.operatorOverride` / a reason starting with `Operator: override`, render `Verdict` value `copy.desk.sigValues.verdictOverridden` (`Overridden by operator (demo)`), tone `pending`, plus a row `Operator  M. Keller · 00:29`. If the bank only returns the post-override signals, `bank-backend` must keep both (`signals` + `signalsBeforeOverride`). |
| W2-3 | Desk request (thief, override) | `w2-desk-request-thief.png`, `w2-desk-override.png` | Grid collapsed: each section renders heading · card · note as a **row** (the `Reasons` note is 130 px wide, one word per line; headings squeezed to 80 px). The 00:30:13 Lea capture is correct and the current source uses `kl-stack` sections, so the two 00:29 captures predate a fix. | should (blocker in the capture) | No code change expected — **re-shoot** `w2-desk-request-thief` and `w2-desk-override` and confirm all four sections stack. If it recurs: the `<section>` must carry `kl-stack`, never `kl-section`. |
| W2-4 | Recover step 5 | `w2-recover-waiting.png` | The finish time appears three times: title `Access restores at 00:33:02`, ring `Finishes at 00:33:02`, and `Finishes at 00:33:02 · read from the chain`. The third line also leaks `SocialRecoveryModule` (`copy.desk.timerSource`) to the client. | should | `recover/page.tsx` `StepWaiting`: `<CountdownRing … showFinish={false} />` (new ui prop) and delete `<p className="text-12 text-ink-3 text-center">{copy.desk.timerSource}</p>`; the module address stays under `Technical details`. Result: title (time) → ring (remaining) → demo caption → body. |
| W2-5 | Recover finished | `w2-recover-welcome.png` | Title `Welcome back, Lea` is on the ban list; the stepper still says `Step 5 of 5 · Waiting period` on the finished state; the bare `View on Basescan` link does not say which transaction. | should | `copy.recover.welcome` → `You’re back in, Lea` (Appendix A updated); `StepWaiting` finalized branch: `<Stepper current={5} total={TOTAL} label={copy.recover.restoredLabel} />` (`Restored`); replace `<ExplorerLink hash={finalizedTxHash} />` with a link whose text is `copy.recover.viewRestoreTx` (`View the restore transaction on Basescan`). |
| W2-6 | Recover step 4 | `w2-recover-recoverers.png` | KeyCard copy duplicates itself and leaks the persona label: Safety key `Open Keyline on Lea · laptop to confirm` + `Confirm on your laptop`; Emergency card `Paste the key from your card` + `Paste your Emergency card`. | should | `copy.recover.recSafety` → `Your laptop`, KeyCard `can={copy.recover.recSafetyCan}` (`Open Keyline on your laptop to confirm`); `copy.recover.recCard` → `On paper, with you`, `can={copy.recover.recCardCan}` (`Paste the key printed on the card below`). Delete `copyGaps.recover.laptopOption/cardOption`. |
| W2-7 | Recover step 3, `/mock/eid` | `w2-recover-identity.png`, `w2-mock-eid.png` | `Date of birth` is a native `type="date"`: renders `03/14/1991` (US order) with the browser calendar glyph — the only non-system control in the app, and wrong for a Swiss client. | should | Both pages: `<TextField label={s.idDob} inputMode="numeric" autoComplete="bday" placeholder={copy.recover.idDobPlaceholder} … />` (`DD.MM.YYYY`), keep ISO in state (`parseSwissDate` in `src/lib/format.ts`). |
| W2-8 | Alerts (started) | `w2-alerts.png` | `Note` title `Recovery started from a new device` and body `Recovery started from a new phone in Zürich…` say the same thing twice; the question the owner must answer is missing. | should | `copy.alerts.startedTitle` → `Was this you?` (Appendix A updated). Body unchanged. |
| W2-9 | Alerts after the period ended | `w2-fail-lea-phone.png` | Ring shows `Done / Finished` while the body still says `If nobody cancels, that device becomes the only key at 00:33:02` and the red primary `Cancel recovery — it wasn’t me` remains. Three statements, one screen, all contradicting. `doneLabel={copy.desk.status.finalized}` is the wrong word (the *period* is over, not the recovery). | should | ui: ring centre now reads `00:00` with the sub-label. `alerts/page.tsx` `StartedAlert`: `doneLabel={copy.alerts.periodOver}` (`Period over`); when `executeAfter <= now` render body `copy.alerts.periodOverBody(formatClock(executeAfter))` (`The waiting period ended at {t}. The new phone can finish at any moment; you can still cancel until it does.`); when a `recovery-finalized` alert exists for the same request, do not render the started alert (the finalized `Note` replaces it, no cancel button). Same `doneLabel` rule in `recover/page.tsx` (`copy.recover.ready` = `Ready to finish`). |
| W2-10 | Home (Lea · phone) during the attack | `w2-home.png` | Nothing on Home says a recovery is running; `/alerts` is reachable only by URL. The owner's climax line ("Wasn’t you? Cancel recovery") cannot be found. | should | `app/(client)/page.tsx` `WalletHome`: `const alerts = useAlerts(wallet.address)`; if any `recovery-started`, render above the balance `<Note tone="danger" title={copy.alerts.startedTitle}><Button variant="danger" size="sm" href="/alerts">{copy.alerts.open}</Button></Note>` (`Open alerts`); add a `Bell` ghost icon link to `/alerts` in `kl-topbar` next to the shield when `alerts.data?.length`. |
| W2-11 | Home (Lea · new phone) after restore | `w2-home-newphone.png` | Restored wallet shows `Nothing yet — Your first top-up will appear here` and `CHF 0.00`; the point of the story (money intact, access restored) is invisible. | should | `page.tsx` `buildStatement`: map `recovery.finalized` events to a row `copy.home.restoredRow` (`Access restored on this phone`) with the time; `qa-demo`: the staged twin wallet must hold a balance before the pitch (`demo:stage-recovery`). |
| W2-12 | Desk queue | `w2-desk-queue.png` | Filter chips: the selected `Open` is *lighter* than the unselected ones; row meta `Waiting for: Waiting period · ⏱ Waiting period` repeats; request id `#48A7BE` in pending amber reads as a status. | should | ui: `.kl-chip[aria-selected="true"]` is solid ink. `queue/page.tsx`: `className="kl-chip kl-chip--neutral"` for every chip (no toggle); drop the `· Waiting for: …` fragment when it equals the status label (`executed-waiting`, `awaiting-guardians`); id `<span className="kl-mono text-ink-2">#{shortId}</span>`. |
| W2-13 | Desk request | `w2-desk-request.png` | `Back to queue` is centred above the title; everything else is flush-left. | should | `requests/[id]/page.tsx`: `<Button variant="ghost" size="sm" href="/desk/queue" className="self-start">` directly in the `kl-stack` (remove the wrapping `div`); if `kl-btn` still centres, add `kl-btn--inline` (ui, Wave 3). |
| W2-14 | Desk request | `w2-desk-request.png`, `w2-desk-request-thief.png` | Raw signals footnote (`… Verdict: pass, signed by the bank (eid-simulated) · swissquote: signed (nonce 0)`) is backend prose under the operator's card; in the thief capture it even says `Liveness: passed (simulated)` next to the row `Liveness Failed`. | should | `requests/[id]/page.tsx`: remove `footnote={item.signals.join(' · ')}` from the identity `Panel` and render `<pre className="kl-code">{item.signals.join('\n')}</pre>` inside the existing `Technical details`. `bank-backend`: the stand-in's reason list must agree with its structured fields. |
| W2-15 | Desk override form | `w2-desk-override.png` | `Reason (required)` TextField is ~200 px and clips its own prefilled text; `Refuse` floats at the far right. | should | Override/refuse form: `<TextField className="w-full" …/>` on its own row, actions row below (`Refuse` secondary, flush-left). |
| W2-16 | Approve (confirmed) | `w2-approve-confirmed.png`, `w2-fail-lea-laptop.png` | No heading; the `Note` says `The waiting period starts once Swissquote’s signature is relayed with yours` while the `Status` row already reads `Waiting period`. | should | `approve/page.tsx` confirmed branch: add `<h1 className="kl-title">{copy.approve.confirmedTitle}</h1>` (`Confirmed on this laptop`); pick the note by status: `awaiting-guardians` → existing sentence; `executed-waiting` → `copy.approve.waitingBody(formatClock(executeAfter))` (`The waiting period has started. It ends at {t}.`) + `View on Basescan` on `executedTxHash`. |
| W2-17 | Security → Prove sheet | `w2-security-prove.png` | `Method  ERC1271` — a standard's name on a client screen (vocabulary rule); the proof hex was clipped at the right edge. | should | ui: `.kl-code` wraps. `security/page.tsx`: `{ label: copyGaps.security.method, value: copy.security.proof.methodValue }` (`Signed by your wallet`), and `ERC-1271` only inside `Technical details`. |
| W2-18 | All five personas | `w2-home.png`, `w2-home-newphone.png`, `w2-approve-recovery.png`, `w2-desk-queue.png`, `w2-refused.png` | Three of the five bars (`Lea · phone`, `Lea · laptop`, `Lea · new phone`) were identical ink bars — only the Thief was distinct. | should | **Fixed in `packages/ui`**: laptop = `--laptop-bar` (ink-2), new phone = `--newphone-bar` (ok green), desk = ink with a 2 px accent rule, thief = red, phone = ink. Contrast 6.2:1 / 4.9:1. No wallet change; re-shoot. |
| W2-19 | Top-up sheet (error) | `story-08-home-topup-error-funder-empty.png` | With the error state open the primary `Top up` is pushed below the sheet's bottom edge. | should | `design-system` Wave 3: sticky `.kl-actions` at the bottom of `.kl-sheet__panel`. Interim, `wallet-client`: render `ApiErrorState` *below* the actions inside the sheet. |
| W2-20 | Panel rows holding an `Address` | `w2-recover-welcome.png`, `w2-approve-recovery.png`, `w2-desk-request.png` | `Wallet being restored 0xeF2c … 2cce / Show full address Copy / View on Basescan` wraps into a ragged right-aligned column. | should | **Fixed in `packages/ui`**: a `.kl-panel__row:has(.kl-addr)` stacks label over value, flush-left. No wallet change. |
| W2-N1 | Recover step 1 | `w2-recover-key.png` | Empty middle of the screen. | nit | Add `<KeyCard name={copy.security.phoneKey.name} where={copy.recover.keyWhere} can={copy.recover.keyCan} status="pending" />` (`This phone` / `Signs every transfer once access is restored`). |
| W2-N2 | Recover step 3 | `w2-recover-identity.png` | `swiyu e-ID check SIMULATED` twice (eyebrow + footer link). | nit | Footer link text `copy.recover.openEid` (`Open the e-ID stand-in`), no second badge. |
| W2-N3 | Recover step 2 | `w2-recover-code.png` | Hint contains a URL path: `Check /mock/inbox — …`. | nit | `copy.recover.codeHint` → `Email delivery is simulated — the code is in the demo inbox.` (Appendix A updated); keep `Show inbox`. |
| W2-N4 | Refused | `w2-refused.png` | Raw reasons as a footnote (Wave 1 rule: raw reasons under `Technical details`). | nit | Replace `footnote` with `<Disclosure summary={copy.common.technicalDetails}><pre className="kl-code">{reasons.join('\n')}</pre></Disclosure>` under the `Panel`. |
| W2-N5 | Mock inbox | `w2-mock-inbox.png` | Title wraps to two lines with the badge floating beside line 1. | nit | `ScreenHeader title={copy.mock.inboxShort}` (`Inbox`) + `<p className="kl-lead">{email}</p>`; badge after `Inbox`. |
| W2-N6 | Desk request | `w2-desk-request.png` | Confirmations footnote `2 / 2`. | nit | `copy.desk.confOf(have, need)` → `2 of 2 confirmations`. |
| W2-N7 | Desk audit | `w2-desk-audit.png` | `Feeds: sq-guardian ✓` lists one feed although the table shows `bank` events too. | nit | `audit/page.tsx`: iterate both sources (`bank`, `sq-guardian`). |
| W2-N8 | All | source | New `copyGaps` block in `copy.ts` (79 refs: `recover`, `approve`, `alerts`, `desk`, `mock`, `security`). | nit | Appendix A.2 (DESIGN.md) now carries every string with its key; re-paste, replace, delete the block. |
| W2-N9 | Desk kicker, Alerts body | source | `'Zürich'` is a literal in JSX in two places. | nit | `copy.demo.city`. |
| W2-N10 | Security → Limits | `w2-security-prove.png` (background) | `First transfer to a new address, > CHF 10’000` — the `>` orphan. | nit | `… or above CHF 10’000`. |
| W2-N11 | Home | `w2-home.png` | Double hairline under `Statement` (section border + list border). | nit | Drop the first row's `border-top` when the list follows a `kl-section` (`first:border-t-0`). |

**Counts (Wave 2):** 2 blockers (both honesty of the identity check — one for `bank-backend` + `wallet-client`, one for `wallet-client`) · 20 should (3 fixed in ui: #18 persona bars, #20 panel/address rows, #17/#9 partials; 1 likely already fixed in source: #3; 16 for `wallet-client`, 2 of them shared with `bank-backend`/`qa-demo`) · 11 nits (all `wallet-client`).

Verified clean in Wave 2 (no row): purple/gradients/shadows/pill shapes, emoji, `$`, "Dashboard/Overview", guardian/gas/seed/userOp outside `Technical details` (the desk's `SocialRecoveryModule` line is an operator screen and acceptable there), spinners without a sentence, one primary per screen (Thief screens have none; `/approve` has one), tap targets (≥ 48 px buttons, 56 px rows, 24 px chips are desk-only pointer targets), text clipping at 390 px (only the two `.kl-code` cases, fixed), focus ring visible (`w2-thief-identity.png`), the ring is the only animation on every screen it appears on.

### Wave 2 status, 10 Oct (restored build)

Checked against current sources and the 10 Oct E2E captures (`story-*`, `attacker-*`, `fraud-*`).

| # | Status | Note |
|---|---|---|
| W2-1 | **open — downgraded to should** | The refusal reason no longer cites the label (`ID document name mismatch · liveness check failed`) and the thief also fails on the name, but `services/bank/src/identity.ts` still fails any label containing "thief" and `routes/desk.ts` still emits `Device label contains "thief"` (now only under the desk's Technical details). The persona label still reaches client copy: Lea's alert ("a device labelled “Thief · stolen phone”") and the laptop's `Device  Lea · new phone`. Needs `bank-backend` + `wallet-client` (`getDeviceLabel`), a behaviour change outside this pass. |
| W2-2 | fixed | Verdict row reads `Overridden by operator (demo)`, failed rows stay red, Operator row added (`attacker-08`). |
| W2-3 | fixed | Request sections stack (`attacker-06/08`). |
| W2-4 | fixed (this pass) | `recover` waiting: `showFinish={false}`, module line removed from the main column (still in Technical details). |
| W2-5 | fixed (this pass) | Title fixed earlier; stepper reads `Restored`; row `Wallet`; link `View the restore transaction on Basescan`. |
| W2-6 | fixed | `Your laptop` / `On paper, with you`. |
| W2-7 | open (should, wallet-client) | Native `type="date"` still renders `03/14/1991`; the fix changes input parsing (behaviour), not done here. |
| W2-8 | fixed | `Was this you?`. |
| W2-9 | fixed | `periodOver` body + done label; recover ring now `Ready to finish`. |
| W2-10 | fixed | Home has the alert banner + bell (`story-16`). |
| W2-11 | open (should, wallet-client + qa-demo) | `copy.home.restoredRow` exists but no statement row maps `recovery.finalized`; `story-16` still ends on an empty statement. |
| W2-12 | fixed (this pass) | Chips solid-ink when selected; duplicate "Waiting for" dropped; id in mono ink-2. |
| W2-13 | nit, open | `Back to queue` is flush-left but indented by the ghost button's 12 px padding. |
| W2-14 | fixed (this pass) | Raw signals moved into Technical details. |
| W2-15 | fixed (this pass) | Refuse form is a stack (field full width, actions flush-left, max 560 px). |
| W2-16 | fixed (this pass) | `Confirmed on this laptop` heading; note says `The waiting period has started. It ends at …` once `executeAfter` is known. |
| W2-17 | fixed (this pass) | `Method  Signed by your wallet`. |
| W2-18 | fixed | Five distinct bars in captures. |
| W2-19 | fixed (this pass) | Top-up error renders below the primary (`home-topup-error-funder-empty`). |
| W2-20 | fixed | Address rows stack. |
| W2-N1 | open (nit) | Recover step 1 still has no KeyCard. |
| W2-N2 | open (nit) | `swiyu e-ID check SIMULATED` still twice (`attacker-02`). |
| W2-N3 | fixed | Hint uses `copy.recover.codeHint`. |
| W2-N4 | won't fix | The two reasons are plain client sentences; keeping them visible helps the thief understand the refusal. |
| W2-N5 | open (nit) | Inbox title unchanged. |
| W2-N6 | fixed (this pass) | `2 of 2 confirmations`. |
| W2-N7 | fixed | Audit iterates every source. |
| W2-N8 | open (nit) | `copyGaps` 44 refs. |
| W2-N9 | fixed (this pass) | Last `'Zürich'` literal → `copy.demo.city`. |
| W2-N10 | fixed (this pass) | `… or above CHF 10’000`. |
| W2-N11 | fixed (this pass) | ui: `.kl-section + .kl-empty` drops the top rule. |

## `packages/ui` changes in this pass

Gates: `pnpm --filter @keyline/ui typecheck` ✓ · `test` ✓ (11/11) · `pnpm exec biome check packages/ui` ✓ · `contrast` ✓ 25/25 (two new device-bar pairs).

| File | Change |
|---|---|
| `packages/ui/src/tokens.css` | `--laptop-bar: #5c5c57`, `--newphone-bar: #1f7a4d` (W2-18). |
| `packages/ui/src/components.css` | `.kl-code` wraps (`pre-wrap` + `overflow-wrap: anywhere`) (W2-17, story-08). `.kl-devicebar--laptop/--new/--desk` (W2-18). `.kl-panel__row:has(.kl-addr)` stacks label over value, flush-left (W2-20). `.kl-chip[aria-selected="true"]` solid ink (W2-12). |
| `packages/ui/src/components/Chrome.tsx` | `DeviceBar` picks a tone class per persona (`PERSONA_TONE`). |
| `packages/ui/src/components/CountdownRing.tsx` | Finished state: centre reads `00:00` with the `doneLabel` under it (was the word `Done`); new prop `showFinish` (default `true`) to drop the `Finishes at` line when the title already states the time (W2-4, W2-9). |
| `packages/ui/scripts/contrast.ts` | Two new pairs for the device bars. |
| `packages/ui/assets/icon.svg`, `icon-192.png`, `icon-512.png` | PWA icon: a key-line mark (ring + rule + two bits) in ink on paper, one accent dot; PNGs rasterised with the cached Playwright chromium. `wallet-client`: reference from `apps/wallet/app/manifest.ts` (`icons: [{ src: '/icon-192.png', sizes: '192x192' }, { src: '/icon-512.png', sizes: '512x512' }]`) after copying to `apps/wallet/public/`. |

## Screenshots for the README strip

See `docs/screens/README.md` — which captures are demo-ready now and which to re-shoot after Wave 3.

## Remaining risks

- W2-1 and W2-2 change what the bank returns; if `bank-backend` cannot ship them, the desk must at least stop printing the device-label reason and show the pre-override verdict (wallet-only fallback described in each row).
- The three `w2-desk-request*` captures are 30 s apart with different layouts: re-shoot before trusting any desk screenshot.
- The restored-wallet Home (W2-11) is a staging problem as much as a UI one; without a funded twin the story ends on `CHF 0.00`.


---

# Restored build, 10 Oct

Inputs: `pnpm screenshots` (10 Oct 11:56, 49 passed / 3 failed — see risks), the 10 Oct E2E captures (`story-*`, `attacker-*`, `fraud-*`), `/dev/reset` shot at 1280×900 (`docs/screens/dev-reset.png`), live `/desk/queue` re-shot after the fix. Only the restored per-device screens; the abandoned Stage is not in `main` and was not audited.

| # | Screen | Violation | Severity | Fix | Status |
|---|---|---|---|---|---|
| R-1 | Desk queue | `attacker-05`: the request list renders as a third column to the right of the heading and chips (the `<section>` was `kl-section`, a flex row — the W2-3 bug on the queue). | blocker | `queue/page.tsx`: section `kl-stack`, header row `kl-section`. | fixed (live re-shot) |
| R-2 | Desk request | Refused request shows Swissquote / Safety key / Emergency card all `Pending` — they will never confirm. | should | `confirmationValue`: `identity-refused` → `Not used`. | fixed |
| R-3 | Alerts (started) | Inside the danger Note the paragraph, ring, `Finishes at` and the red primary touch (0–4 px); the finish time repeats the body. | should | ui: `Note` body `.kl-note__body` spaces block children by `--space-3`; `alerts`: `showFinish={false}`. | fixed |
| R-4 | Alerts (refused), all Notes with a ghost action | `See event log` floats 12 px right of the text column. | nit | ui: `.kl-note__body > .kl-btn--ghost.kl-btn--sm` pulls the button flush. | fixed |
| R-5 | Recover waiting (`story-14`, `fraud-02`) | Finish time three times + `read from the SocialRecoveryModule` on a client screen. | should | = W2-4. | fixed |
| R-6 | Home offline | `Nothing yet — Your first top-up will appear here` shown above `Swissquote isn’t reachable`: an empty statement is claimed while the statement could not be read. | should | `page.tsx`: no empty state when `events.isError`. | fixed (re-shot) |
| R-7 | Home (empty statement) | Double hairline under `Statement` (section rule + empty-state rule). | nit | ui: `.kl-section + .kl-empty { border-top: 0 }`. | fixed |
| R-8 | Review | `Approved · Within your CHF 1’000 daily limit` shown together with `Approval expired` (contradiction). | should | `review/page.tsx`: the verdict is hidden while the expired state is shown. | fixed |
| R-9 | Review | `✓ Ok  Send 25 USDC` row repeats `You send` with a raw risk word. | should | `whatWillHappen`: decoded-call rows only for dapp requests or when `risk ≠ none`. | fixed |
| R-10 | Approve (confirmed) | No heading; note contradicts `Status  Waiting period`. | should | = W2-16. | fixed |
| R-11 | Desk request | Raw signals footnote under the identity card, incl. `Device label contains "thief"` and `Liveness: passed (simulated)` next to `Liveness Failed`. | should | = W2-14. | fixed |
| R-12 | Desk request | `Refuse` floats far right of the note field. | should | = W2-15. | fixed |
| R-13 | `/dev/reset` | The page's only action is a secondary button — no primary. | should | `variant="primary"`. | fixed |
| R-14 | `/dev/reset` | Inline `style={{ maxWidth, margin, padding }}`. | nit | `mx-auto my-12 max-w-[560px] px-4`. | fixed |
| R-15 | `/dev/reset` | Straight quotes/apostrophe; `chrome://password-manager/passkeys` breaks at the hyphen; removed-item strings were literals in the component. | nit | `devResetCopy`: curly quotes, `passkeyBefore/passkeyUrl/passkeyAfter`, URL in `kl-mono whitespace-nowrap`; item strings moved to copy (`localItems`, `sessionItems`, `safetyKeyItem`, `cookieItem`). | fixed |
| R-16 | Lea's alerts, laptop approve | Persona label leaks into client copy (`device labelled “Thief · stolen phone”`, `Device  Lea · new phone`). | should | = W2-1 remainder (`getDeviceLabel`, bank rule). | open |
| R-17 | Security (guardians error) | `Protected · 2 of 3 recoverers` above three `Pending` recoverers when the guardian read fails; `pendingWallet` is also rendered in ok-green. | should | `security/page.tsx`: derive the line from `guardians` (and use ink-2 + Clock when not deployed); needs a `KeyCard` status for "unknown". | open (wallet-client) |
| R-18 | Top-up sheet | `SIMULATED` wraps onto its own line under the account balance. | nit | Shorten to `Account balance: CHF …` or `text-12`. | open |
| R-19 | Home statement | Pressable row amounts sit left of the chevron, non-pressable ones flush right: the amount column is ragged. | nit | ui: reserve the chevron slot on every row of a list that has one. | open |
| R-20 | Activity (failed) | `– 25.00 USDC` at full weight for a transfer that never left; tx hash row offers `Show full address`; three `View on Basescan` links. | nit | Strike/ink-3 the amount when failed; `Address` label `Show full hash` for hashes; drop the standalone link. | open |
| R-21 | Onboarding 2 (expired) | The expired code stays at full weight. | nit | ink-3 + line-through when expired. | open |
| R-22 | Desk request | `Back to queue` indented 12 px (= W2-13). | nit | — | open |

**Counts (restored build):** 1 blocker (fixed) · 12 should (10 fixed, 2 open: R-16, R-17) · 9 nits (4 fixed, 5 open). Including the Wave 2 carry-overs: open shoulds are W2-1 (downgraded), W2-7, W2-11, R-16 (same root as W2-1), R-17. **No blocker remains open.**

Gates after the fixes: `pnpm --filter @keyline/ui typecheck` ✓ · `test` ✓ 11/11 · `contrast` ✓ 25/25 · `pnpm --filter @keyline/wallet typecheck` ✓ · `pnpm exec biome check packages/ui apps/wallet` ✓.

## Risks (restored build)

- `pnpm screenshots` fixtures have drifted (owner `qa-demo`, `e2e/screenshots.spec.ts`): `NOW` is pinned to 6 Oct but the browser clock is not, so every policy decision is already expired; `send-review-step-up`, `send-review-block` and `onboarding-5-protect-refused` time out (decision parse/fixture missing), `send-review-cooling` hits `no fixture for GET /policy/dec_…`, and after R-8 `send-review-approve` no longer shows `Approved` (it waits for it). Fix: fake the page clock to `NOW` (`page.clock.setFixedTime`) or build fixtures from `Date.now()`. The review captures are not trustworthy until then.
- The desk request (R-2, R-11, R-12), recover waiting/finished (R-5, W2-5), alerts (R-3) and approve-confirmed (R-10) fixes were verified in code and on the live queue only; they need the next `pnpm e2e` run to re-shoot `attacker-06/08`, `fraud-02/03`, `story-13/14/15`.
