# Design audit — Wave 1 (onboarding, pair, home, send, review)

Reviewer: `design-system`. Inputs: `docs/screens/w1-*.png` (15), `docs/screens/design-kitchen-sink.png`, sources under `apps/wallet/app/(client)`, `apps/wallet/app/(laptop)`, `apps/wallet/src/components`, `apps/wallet/src/copy.ts`.
Judged as a Swissquote product manager would: does it read like a bank statement, amount first, every mock badged, "Protected" convincing, "What will happen" the centre of the review screen, persona bars distinct.

Overall: the typographic system holds (Hanken, hairlines, one accent, 6/10 px radii, no palette classes, no emoji, no banned words, no inline prose outside `copy.ts`/`copyGaps`). The three blockers are all about honesty and verifiability, not style. "Protected" (step 5) is the strongest screen in the wave. Thief bar is red and the Thief home has no primary — correct. Only three of five persona bars appear in this wave (`lea-phone`, `lea-laptop`, `thief`); `lea-new-phone` and `desk` are not exercised yet.

Severity: **blocker** = contradicts CLAUDE.md non-negotiables or makes a judge distrust the product · **should** = fix before the next screenshot pass · **nit** = fix when touching the file.

## Audit table

| # | Screen | Screenshot | Violation | Severity | Fix (file + exact change) |
|---|---|---|---|---|---|
| 1 | Home | `w1-home-topup.png` | `SimulatedBadge` sits on the CHF balance (`CHF 0.00 SIMULATED`). A judge reads "the balance is fake". The USDC balance is a real chain read; only the CHF conversion is mocked. | blocker | `apps/wallet/app/(client)/page.tsx` `WalletHome`: remove `<SimulatedBadge />` from `<p className="kl-balance__amount">`; after `<p className="kl-balance__secondary">{formatUSDC(usdc)}</p>` add `<p className="text-12 text-ink-3">{copy.send.rate(formatCHF(env.chfPerUsdc))} <SimulatedBadge /></p>` (spec §10 Home updated). |
| 2 | Onboarding step 3 | `w1-onboarding-card.png` | Printed Emergency card shows `Recoverer 0x67dC…B725` and `For wallet 0xBF9E…5650` — a paper card with truncated addresses cannot be verified on Basescan without the app. Ban list: truncated address with no way to see the full one. | blocker | **Fixed in `packages/ui`** (`EmergencyCard` prints both full addresses in mono under the QR block). No wallet change. |
| 3 | Onboarding step 6 | `w1-onboarding-prove.png`, `w1-onboarding-proven.png` | `Client  SQ-48213-LK` is a mocked Swissquote client file with no `SimulatedBadge` (CLAUDE.md §2: every simulated identity element is badged). | blocker | `apps/wallet/app/(client)/onboarding/page.tsx` `Step6`, both `Panel`s: `{ label: s.rows.client, value: <>{env.clientId} <SimulatedBadge /></> }` (done state: `<>{sign.data.attestation.clientId} <SimulatedBadge /></>`). |
| 4 | Home | `w1-home.png` (sheet) | Top-up `Sheet` renders as the 480 px desk modal over the phone bezel instead of a bottom sheet inside the phone screen. | should | **Fixed in `packages/ui`** (`components.css`: a `.kl-sheet` inside `.kl-phone__screen` is `position:absolute`, bottom-anchored, clipped by the screen). No wallet change. |
| 5 | Home | `w1-home.png`, `w1-home-topup.png` | Next.js dev overlay `1 Issue` is visible: a runtime/hydration error exists in app code. Screenshots with the overlay are not shippable. | should | `wallet-client`: open the overlay in `pnpm dev`, fix the error (likely the `useLocalWallet` / persona first-render path in `page.tsx`). `qa-demo`: fail `pnpm screenshots` when `nextjs-portal` is present. |
| 6 | Home, Send, Review, Onboarding 2/3/4/6, Pair, Activity | `w1-home.png`, `w1-send-review.png` | Error title `Something didn’t work` is paired with the *offline* body (`…The bank service answers policy checks and pays network fees; try again in a moment.`). Contradictory sentence; the offline title/body pair is already produced by `ApiErrorState` when `error.offline`. | should | Replace every `body={copy.common.offlineBody}` passed to `<ApiErrorState>` with `body={copy.common.errorBody}` (new key, Appendix A): `page.tsx` ×4 (balance, events, login, top-up), `send/page.tsx` ×1, `onboarding/page.tsx` ×4 (steps 2, 3, 4, 6), `pair/page.tsx` ×1, `activity/[hash]/page.tsx` ×1. In `Step1`, `body={copy.onboarding.s5.errorBody}` ("Nothing was charged…") is the wrong sentence for a passkey/bank failure → `copy.common.errorBody`. |
| 7 | Onboarding step 2 | `w1-onboarding.png` | `SIMULATED` badge on its own line under the pairing code. §9: the badge is placed inline after the thing it qualifies, never on its own line. | should | `onboarding/page.tsx` `Step2`: delete `<p className="text-12 text-ink-3"><SimulatedBadge /></p>`; change the countdown line to `<p className="text-12 text-ink-3">{s.expiresIn(formatDuration(remaining))} <SimulatedBadge /></p>` and the expired line to `<p className="text-12 text-ink-3">{s.expired} <SimulatedBadge /></p>`. |
| 8 | Onboarding step 2 | `w1-onboarding.png` | `Waiting for your laptop` printed twice (KeyCard `where` line and status chip). | should | `Step2` `<KeyCard>`: `where={s.keyWhere}` (always); keep `statusWord={claimed ? undefined : s.waiting}`. |
| 9 | Onboarding step 2 | `w1-onboarding-paired.png` | After the laptop paired, the 6-digit code and `Code expires in 09:57` are still shown and ticking. | should | `Step2`: wrap the code block (`<div className="kl-stack kl-stack--tight items-center text-center">…</div>`) in `{claimed ? null : (…)}`; the Skeleton/ApiErrorState branches stay. |
| 10 | Onboarding step 4 | `w1-onboarding-mode.png` | `· Not in this prototype` wraps onto its own line with an orphaned middle dot. | nit | `Step4` assisted `meta={<><span>{s.assistedWait}</span><span>{s.assistedUnavailable}</span><SimulatedBadge label={s.assistedPartner} /></>}` — the meta line is a flex row with gap; no literal `·`. |
| 11 | Onboarding step 4 | `w1-onboarding-mode.png` | Disabled Assisted card at 55 % opacity: `--ink-3` text drops to ≈ 2.6:1. | should | **Fixed in `packages/ui`** (`.kl-radio--disabled`: `--surface-2` fill + dashed border, text colours unchanged; ink-3 on surface-2 = 4.57:1). |
| 12 | Onboarding step 5 | source | Refused path renders `phase.decision.reasons.join(' · ')` — raw backend prose as client copy. | should | `Step5`: `<PolicyLine … reason={copy.common.policyRefused} />` and add `<Disclosure summary={copy.common.technicalDetails}><pre className="kl-code">{phase.decision.reasons.join('\n')}</pre></Disclosure>` under it. |
| 13 | Pair | `w1-pair.png` | Badge `PROTOTYPE: SOFTWARE KEY` is an invented string (`'prototype: software key'` literal in `pair/page.tsx`), duplicates the `Note` right below it, and uses `SimulatedBadge` for something that is not a mock. | should | `apps/wallet/app/(laptop)/pair/page.tsx`: remove the `nameTrailing={…}` prop from `<KeyCard>`. The `Note` keeps `copy.pair.note`. |
| 14 | Pair | `w1-pair-done.png` | Success `Note tone="ok"` showed a warning icon (`WarningCircle`) with a green border — icon and word disagreed. | should | **Fixed in `packages/ui`** (`Note` ok tone → `CheckCircle`). |
| 15 | Pair | `w1-pair-done.png` | `statusWord={copyGaps.pairedOnLaptop}` | nit | `copy.pair.pairedHere`. |
| 16 | Send | `w1-send.png` | Contacts: `Known` / `New — first transfer` are rendered in the **amount** slot (16 px, 600) — they read like amounts and outweigh the names; the address meta is sans, not mono. Spec: address mono, `Known` as a small ok status with ✓. | should | `apps/wallet/app/(client)/send/page.tsx` contact `<StatementRow>`: drop `amount={…}`; `meta={<span className="kl-mono">{shortAddress(c.address)}</span>}`; `status={c.verifiedOwnership ? 'ok' : undefined}`; `statusWord={c.verifiedOwnership ? copy.send.known : undefined}`; for unverified contacts append the word to meta: `meta={<><span className="kl-mono">{shortAddress(c.address)}</span><span>{copy.send.newContact}</span></>}`. |
| 17 | Send | `w1-send.png` | `Sanctioned test addre…` — contact name truncated. | nit | **Fixed in `packages/ui`** (`.kl-row__label` wraps to two lines instead of ellipsis). |
| 18 | Send | source | After picking a contact, `Recipient: 0xdD50…253E` is plain text — no way to see or copy the full address. | should | `send/page.tsx`: replace the `<p className="text-12 text-ink-3">{copyGaps.recipientLabel}: …</p>` with `<Address value={picked.address} label={copy.send.recipient} explorerUrl={addressUrl(picked.address)} />` (import `addressUrl` from `@/src/lib/chain`). |
| 19 | Review | `w1-send-review.png` | The policy `ErrorState` (title + body + button + disclosure, ~230 px) sits between the amount and `What will happen`, pushing the panel below the fold. The panel must be the centre of the screen. | should | `apps/wallet/app/(client)/send/review/page.tsx` `Review`: keep `<Skeleton kind="line" count={2} />` in the verdict slot, but move the `decision.isError` `<ApiErrorState …>` to just after `<Panel …/>` (before the `Disclosure`), with `body={copy.common.errorBody}` (`copy.activity.failedBody` is correct only for `confirm.isError`). |
| 20 | Review | `w1-send-review.png` | `Your balance  0.00 USDC → −25.00 USDC`. Review was reached with more than the balance (the `/send` funds check is skipped while `balance.data` is undefined). The current code hides the negative number but still lets the draft through. | should | `review/page.tsx`: in `whatWillHappen`, keep `before → after` only when `after >= 0` (done); in `Review`, when `balance.data !== undefined && draft.amountUsdc > balance.data` render `<Note tone="danger">{copy.send.errFunds(formatUSDC(balance.data))}</Note>` and force `canConfirm = false`. |
| 21 | Review | source | `block` fallback `reason={decision.reasons.join(' · ')}` — raw backend prose. | should | `Verdict` block case: `reason={decision.screening.hit ? p.block.reason : copy.common.policyRefused}`; reasons already appear under `Technical details`. |
| 22 | Review | source | Cooling `PolicyLine` reason `You can cancel for 0:59` is computed once at render and never ticks while the ring does. | nit | Use the `useNow` hook from `onboarding/page.tsx` (move it to `src/lib/hooks.ts`) and `formatDuration(endsAt - now)`. |
| 23 | Review, Step 2, Step 6, Activity | `w1-send-review.png` | Explorer link label `Basescan` ≠ spec `View on Basescan`. | nit | **Fixed in `packages/ui`** (`Address`). |
| 24 | Home (thief) | `w1-home-thief.png` | `TestnetStrip` link broke as `View on` / `Basescan`. | nit | **Fixed in `packages/ui`** (`.kl-testnet a { white-space: nowrap }`). |
| 25 | Home | source | `Statement · All` links to `/security`. | nit | `page.tsx` `WalletHome`: remove the `All` `<Link>` until an activity list route exists. |
| 26 | Alerts | source | `ScreenHeader title={copy.alerts.emptyTitle}` → header `No alerts` above an empty state `No alerts`. | nit | `alerts/page.tsx`: `title={copy.alerts.title}` (new key). |
| 27 | All | source | `ScreenHeader` back button `aria-label="Back"` literal. | nit | `src/components/ScreenHeader.tsx`: `aria-label={copy.common.back}` (import `copy`). |
| 28 | All | source | `copyGaps` block in `copy.ts` (25 strings) — now in Appendix A. | nit | Re-paste Appendix A, replace `copyGaps.*` with the keys in the mapping below, delete the block. |
| 29 | Onboarding 5, Home, Laptop shell | source | Inline `style={{…}}` in 5 places (`marginTop: 0`, `gap: var(--space-4)`, `flexShrink: 0, paddingTop: 2`). | nit | Use utilities (`mt-0`, `gap-4`, `shrink-0 pt-0.5`); no inline style outside `packages/ui`. |

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
