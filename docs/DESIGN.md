# Keyline — Design specification

Owner: `design-system` agent. Engineers build screens **only** from the primitives in `packages/ui` and the copy in this file (Appendix A is pasted verbatim into `apps/wallet/src/copy.ts`). If a string is missing here, ask; do not invent it. If a screen disagrees with this file, this file wins until the orchestrator edits it.

## 1. Design position

A Swiss bank statement, not a crypto dashboard: International Typographic Style — strict grid, flush-left, one accent, hairlines instead of shadows, dense where it matters (amounts, status), quiet everywhere else.
Copy is plain, second person, specific and calm: it says what will happen, what it costs, and what cannot be undone. Nothing "unlocks", nothing is "seamless".
Every simulation is marked `SIMULATED`, every status has an icon **and** a word, every address can be read in full. Honesty is part of the aesthetic.

## 2. Tokens (`packages/ui/src/tokens.css`)

Ratios computed by `pnpm --filter @keyline/ui contrast` (WCAG 2.x). All text pairs ≥ 4.5:1; UI edges and large marks ≥ 3:1. 23/23 pass.

### Surfaces and ink

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--bg` | `#F7F6F3` | page background ("paper") | — |
| `--surface` | `#FFFFFF` | sheets, inputs, phone screen | — |
| `--surface-2` | `#EFEDE8` | skeletons, pressed states, table headers | — |
| `--line` | `#E4E2DD` | 1 px hairlines (decorative separators) | — |
| `--line-strong` | `#8A877F` | input borders, secondary button border | 3.59:1 on surface · 3.32:1 on bg |
| `--ink` | `#141414` | primary text, primary button fill | 17.05:1 on bg · 18.42:1 on surface |
| `--ink-2` | `#5C5C57` | secondary text | 6.22:1 on bg · 6.72:1 on surface |
| `--ink-3` | `#6B6B68` | meta text (timestamps, captions) | 4.95:1 on bg · 4.76:1 on surface · 4.57:1 on surface-2 |
| `--on-ink` | `#FFFFFF` | text on `--ink` and on danger fills | 18.42:1 on ink · 6.57:1 on danger |

### Accent (Swissquote-adjacent orange-red; never body text)

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--accent` | `#FA5B35` | focus ring, active step dot, countdown ring, links on dark bars | 5.80:1 on ink (text) · 3.18:1 on surface (UI mark only) |
| `--accent-text` | `#C8371A` | links and accent words on light | 4.84:1 on bg · 5.23:1 on surface |

### Status (always icon + word)

| Token | Hex | Tint | Contrast on bg / on tint |
|---|---|---|---|
| `--ok` | `#1F7A4D` | `--ok-bg #E8F3EC` | 4.92:1 / 4.67:1 |
| `--pending` | `#9A5B00` | `--pending-bg #FBF1E0` | 5.02:1 / 4.85:1 |
| `--danger` | `#B42318` | `--danger-bg #FBE9E7` | 6.08:1 / 5.61:1 |
| `--danger-bar` | `#B42318` | Thief device bar; white label | 6.57:1 |

### Simulated (honest-mock marking)

| Token | Hex | Contrast |
|---|---|---|
| `--simulated-bg` | `#FFF4E5` | — |
| `--simulated-text` | `#7A4B00` | 6.82:1 on simulated-bg |
| `--simulated-border` | `#B07A1E` (1 px **dashed**) | 3.42:1 on simulated-bg |

Banned: purple/indigo/violet in any form, gradients, backdrop-blur, glows, any shadow outside `--shadow-modal`.

## 3. Type

Fonts: **Hanken Grotesk** (variable, self-hosted in `apps/wallet/app/fonts`, `--font-hanken`) for all UI; **JetBrains Mono** (`--font-jetbrains`, `font-feature-settings: "zero"`) for addresses, hashes, codes. Never Inter, Geist, Roboto, Space Grotesk, Satoshi. Tabular digits (`tnum`) everywhere, by default on `<html>`.

| Class | Size / line | Weight | Use |
|---|---|---|---|
| `text-12` | 12 / 16 | 400 | meta, captions, badge label (600, letter-spacing 0.04em, uppercase only for `SIMULATED` and section eyebrows) |
| `text-14` | 14 / 20 | 400 · 600 | secondary text, table cells, button labels (600) |
| `text-16` | 16 / 24 | 400 · 600 | body, inputs, row labels |
| `text-20` | 20 / 28 | 600 | screen titles inside the phone, row amounts |
| `text-28` | 28 / 32, −0.02em | 600 | page titles, desk headings |
| `text-44` | 44 / 48, −0.02em | 600 | amount display (Home balance, AmountField, Review) |

Weights 400 and 600 only. Numbers are never italic.

## 4. Spacing and layout

4-pt base: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Phone content width 390 px with 16 px gutters (358 px usable). Desk: 12 columns, 24 px gutters, max 1200 px, centred. Vertical rhythm inside a phone screen: title block 24 px below the device bar, 24 px between sections, 12 px between rows inside a section, hairline (`--line`) between statement rows. Tap targets ≥ 44 px (buttons are 48 px, statement rows 56 px).

## 5. Shape and elevation

Radii: **6 px** (buttons, inputs, badges, status chips) · **10 px** (sheets, modals, the phone screen corners, cards that are real objects such as the Emergency card). Nothing else — no pills except the countdown ring which is a circle by nature.
Elevation: one level, `--shadow-modal: 0 8px 24px rgba(20,20,20,.12)`, modals and the Tier-2 laptop approval sheet only. Everything else is separated by 1 px `--line`.

## 6. Motion

120 ms (`--duration-fast`, hover/press) and 200 ms (`--duration-base`, sheet entry, status change), `cubic-bezier(.2,0,0,1)`. One signature animation: the recovery `CountdownRing` arc (CSS `stroke-dashoffset` transition, 1 s linear per tick — the only animation allowed above 300 ms, and it is a progress indicator, not decoration). `prefers-reduced-motion: reduce` sets both durations to 0 and the ring updates without tweening. No skeleton shimmer; skeletons are static `--surface-2` blocks.

## 7. Icons

Phosphor, **regular** weight, 20 px, `currentColor`, one set only. Icons never carry meaning alone: `ok` = `CheckCircle` + word, `pending` = `Clock`, `step-up` = `DeviceMobile` + `Laptop`, `cooling` = `Hourglass`, `block` = `Prohibit`, danger = `WarningCircle`, simulated = none (text badge), copy = `Copy`, external link = `ArrowSquareOut`, print = `Printer`, key = `Key`, card = `IdentificationCard`, bank = `Bank`. No emoji anywhere in UI.

## 8. Primitive catalogue (`@keyline/ui`)

All components are typed React 19 function components, styled by `components.css` classes (`kl-*`) on top of tokens — no runtime CSS-in-JS. Every interactive element has a visible focus ring (`--focus-ring`). Props listed are the public contract.

| Primitive | Props | States |
|---|---|---|
| `Button` | `variant: 'primary' \| 'secondary' \| 'ghost' \| 'danger'`, `size: 'md' (48) \| 'sm' (36)`, `loading`, `disabled`, `full`, `icon`, `type`, `onClick` | default · hover (ink 90 %) · pressed · focus-visible · disabled (40 % opacity, no pointer) · loading (label stays, spinner glyph replaces icon, `aria-busy`). **Exactly one primary per screen.** |
| `TextField` | `label`, `hint`, `error`, `prefix`, `suffix`, `mono`, all `<input>` props | default · focus · error (danger border + `WarningCircle` + message) · disabled · readOnly |
| `AmountField` | `valueChf`, `onChangeChf`, `rate` (USDC per CHF), `max?`, `error?` | CHF-first 44 px tabular right-aligned, USDC secondary line always rendered (reserved height — no layout shift); empty shows `CHF 0.00`; error state |
| `StatementRow` | `label`, `meta`, `amount` (ReactNode), `status?: 'ok' \| 'pending' \| 'danger'`, `href?`, `onClick?`, `icon?` | default · pressable (hover surface-2) · pending (amount in `--pending`, `Clock`) · danger |
| `Address` | `value`, `label?`, `emphasis` (first/last 4), `copy` (default true), `explorerUrl?` | compact (groups of 4, first/last 4 in `--ink`, middle `--ink-3`) · expanded (full, wraps, mono) · copied ("Copied" for 1.5 s) |
| `Stepper` | `current`, `total`, `label` | renders "Step 2 of 6 · Add your Safety key" + dot track (done = ink, current = accent, todo = line) |
| `StatusSequence` | `steps: {label, state: 'done' \| 'active' \| 'todo' \| 'failed', meta?}[]` | vertical, hairline connectors; active has accent dot and `aria-current` |
| `CountdownRing` | `endsAt: Date \| number`, `durationMs`, `size?`, `caption?`, `onDone?` | counting (arc shrinks; shows `mm:ss` remaining + "Finishes at 14:32:10") · done ("Ready to finish") · reduced-motion (no tween) |
| `Panel` | `title`, `rows: {label, value, emphasis?}[]`, `footnote?`, `tone?` | default ("What will happen") · danger tone |
| `PolicyLine` | `verdict: 'ok' \| 'step-up' \| 'cooling' \| 'block'`, `reason`, `detail?` | one line per verdict: icon + word + reason; block gets danger tint |
| `SimulatedBadge` | `label?` (default `SIMULATED`), `tooltip?` | dashed badge, `title`/tooltip "Mocked for the prototype — see README" |
| `KeyCard` | `name`, `where`, `can`, `cannot?`, `icon`, `status?: 'active' \| 'pending' \| 'revoked'`, `action?` | default · pending (dashed) · revoked (struck label, `--ink-3`) |
| `EmergencyCard` | `address`, `privateKeyHex`, `walletAddress`, `onStored`, `onPrint?` | screen · print (`@media print` shows only the card) · confirmed (button disabled, "Stored") |
| `EmptyState` | `title`, `body?`, `action?`, `icon?` | — |
| `Skeleton` | `lines?`, `height?`, `width?`, `kind?: 'row' \| 'amount' \| 'block'` | static blocks, `aria-hidden` |
| `ErrorState` | `title`, `body`, `retry?`, `detail?` | with and without retry; `detail` collapsed under "Technical details" |
| `TestnetStrip` | `network?` | "Test network · Base Sepolia — nothing here is real money." |
| `PhoneFrame` | `children`, `persona?`, `tone?` | ≥ 768 px: 390×844 bezel; < 768 px: full-bleed |
| `DeskLayout` | `title`, `operator`, `nav`, `children`, `legend?` | header (ink) · content · footer "This console cannot move client funds." |
| `DeviceBar` | `persona: 'lea-phone' \| 'lea-laptop' \| 'lea-new-phone' \| 'thief' \| 'desk'` | label per persona; thief = `--danger-bar`; others ink |
| `Disclosure` | `summary`, `children` | "Technical details" pattern; closed by default |
| `Sheet` | `open`, `title`, `onClose`, `children` | bottom sheet in phone, centred modal on desk; the only shadow |
| `Toggle` | `checked`, `onChange`, `label`, `description?` | 44 px tap; ink when on |
| `Note` | `tone: 'info' \| 'warn' \| 'danger'`, `children` | 1 px border, no fill except danger tint |
| helpers | `formatCHF(n)`, `formatUSDC(n)`, `shortAddress(a)`, `groupHex(hex)`, `formatTime(d)`, `formatRelative(d)` | `formatCHF(1234.5) === "CHF 1'234.50"` — apostrophe is **U+2019 (’)** as `Intl.NumberFormat('de-CH')` emits; tests pin it |

Number formats: `CHF 1’234.50` (code first, non-breaking space, 2 decimals, U+2019 grouping), `25.00 USDC` (2 decimals, code after), rates `1 USDC = CHF 0.80`. Never `$`, never `Fr.`, never `CHF1234`.

Dates: `5 Oct 2026, 14:32` (`en-CH`), times inside the countdown `14:32:10`. Relative: "2 minutes ago", "just now".

## 9. Global chrome

### DeviceBar (top of every client screen; also on the desk)
Full-width 28 px bar, `text-12` 600, letter-spacing 0.04em, ink background, white text — except Thief (`--danger-bar`). It exists so judges always know which browser profile they are looking at.

| Persona (`?device=`) | String |
|---|---|
| `lea-phone` | `Lea · phone` |
| `lea-laptop` | `Lea · laptop — Safety key` |
| `lea-new-phone` | `Lea · new phone` |
| `thief` | `Thief · stolen phone` (red bar) |
| `desk` | `Swissquote desk (simulated)` |

### TestnetStrip (bottom of Home and Security; top of desk content)
`Test network · Base Sepolia — nothing here is real money.` 12/16, `--ink-3`, hairline above, link `View on Basescan` (`ArrowSquareOut`).

### SimulatedBadge
Label `SIMULATED`. Tooltip/`title`: `Mocked for the prototype — see README`. Placed inline after the thing it qualifies (never on its own line), e.g. `Identity check SIMULATED`.

### Demo caption (anywhere a waiting period is shown)
`Waiting period accelerated for the demo: 3 min instead of 72 h.` — `text-12` `--ink-3`, below the ring or the timer.

### Loading / empty / error (every route)
- Loading: `Skeleton` in the exact shape of the content (balance block = `kind="amount"`, lists = 3 × `kind="row"`); never a lone spinner. Buttons that wait show `loading` with their label unchanged.
- Empty: `EmptyState` with the strings given per screen.
- Error: `ErrorState` title `Something didn’t work`, body given per screen, button `Try again`, `Technical details` disclosure with the raw error.
- Offline bank: `ErrorState` title `Swissquote isn’t reachable`, body `Your keys and your money are unaffected. The bank service answers policy checks and pays network fees; try again in a moment.`

## 10. Screen-by-screen

Layout sketches are 390 px wide unless marked *desk*. `[P]` = the one primary button on the screen.

### `/onboarding` — 6 steps, `Stepper` on top, one primary per step

**Step 1 · Create your Keyline**
```
┌ Lea · phone ─────────────────────────┐
│ Step 1 of 6 · Create your Keyline     │
│                                       │
│ A wallet only you can spend from.     │  text-28
│ Your phone’s face or fingerprint      │  text-16 ink-2
│ unlocks a key that stays on this      │
│ phone. Swissquote never holds it.     │
│                                       │
│ ─ What you get ──────────────────     │  Panel
│   Spending key      This phone        │
│   Recoverers        3, any 2 restore  │
│   Network fees      Paid by Swissquote│
│                                       │
│ [P] Create with Face ID / fingerprint │
│     Already have a Keyline? Sign in   │  ghost
└───────────────────────────────────────┘
```
- Loading: button `loading`, label unchanged. Error (user cancelled): `Note warn` `The passkey prompt was closed. Nothing was created — try again when you’re ready.` Error (unsupported): `ErrorState` `This browser can’t create a passkey` / `Use Chrome, Safari or Edge on a device with Face ID, Touch ID or a fingerprint reader.`
- Success: proceed to step 2; address shown nowhere yet (counterfactual) except under `Technical details`: `Wallet address (not yet deployed)` + `Address`.

**Step 2 · Add your Safety key**
```
│ Step 2 of 6 · Add your Safety key     │
│ Your second recoverer, on your laptop.│  text-28
│ On your laptop, open keyline.local/pair│ ink-2
│ and type this code:                   │
│                                       │
│      4 8 2  1 3 7                     │  text-44 mono, letter-spacing .2em
│      Code expires in 9:42             │  text-12 ink-3 (tabular)
│                                       │
│ ─ KeyCard (pending, dashed) ──────    │
│   Safety key · Waiting for your laptop│
│                                       │
│ [P] Continue  (disabled until paired) │
│     Skip for now — add it later       │  ghost, text-14
```
- Paired: KeyCard becomes `active`: `Safety key · On your laptop · Can co-approve large transfers and help restore access · Cannot spend alone`. Toast-free: the row simply updates; `Continue` enables.
- Expired: `Code expired` + secondary `Show a new code`.

**Step 3 · Print your Emergency card**
```
│ Step 3 of 6 · Print your Emergency card│
│ Your third recoverer, on paper.       │
│ Print it or write it down, then keep  │
│ it where you keep your passport.      │
│                                       │
│ ┌ EmergencyCard (10 px) ───────────┐  │
│ │ KEYLINE EMERGENCY CARD           │  │
│ │ [QR]  a1b2 c3d4 e5f6 … (groups)  │  │
│ │ For wallet 0x12AB … 9F3C         │  │
│ │ This card cannot spend your      │  │
│ │ money. It can only help restore  │  │
│ │ access after a waiting period    │  │
│ │ you will see.                    │  │
│ └──────────────────────────────────┘  │
│ [secondary] Print                     │
│ [P] I stored it                       │
│ Shown once. Keyline keeps no copy.    │  text-12 ink-3
```
- After `I stored it`: confirm sheet `Have you really stored it?` body `Keyline keeps no copy. If you lose both your phone and your laptop, this card is the only thing that can help.` buttons `Yes, I stored it` [P] · `Go back`.
- Print: `@media print` hides everything but the card.

**Step 4 · Choose how recovery works**
```
│ Step 4 of 6 · Choose how recovery works│
│ Who can help you back in              │  text-28
│                                       │
│ ◉ Default — recommended               │  radio card, 1 px ink border when selected
│   Your Safety key, your Emergency card│
│   and Swissquote. Any 2 of the 3.     │
│   Swissquote can never act alone or   │
│   with another institution.           │
│   Waiting period: 72 h (demo: 3 min)  │
│                                       │
│ ○ Assisted                            │
│   Your Safety key, Swissquote and an  │
│   independent recovery partner. For   │
│   clients who don’t want paper.       │
│   Waiting period: 14 days.            │
│   SIMULATED partner · Not in this     │
│   prototype  (greyed if not built)    │
│                                       │
│ [P] Continue                          │
```

**Step 5 · Protect my wallet**
```
│ Step 5 of 6 · Protect my wallet       │
│ One signature sets everything up      │
│ ─ Panel: What will happen ────────    │
│   Your wallet      Created on Base    │
│   Recoverers       Safety key,        │
│                    Emergency card,    │
│                    Swissquote         │
│   Needed to restore   2 of 3          │
│   Network fee      Paid by Swissquote │
│ [P] Protect my wallet                 │
│ StatusSequence (after tap):           │
│   Signed → Sent → In block 6’812’334 → Confirmed
```
- Confirmed state replaces the panel with:
  `Protected` (text-28) and three lines with `CheckCircle`: `Your phone key signs.` · `Any 2 of your 3 recoverers can restore access.` · `Swissquote can’t move your money, alone or with anyone.` Link `View on Basescan`. [P] `Continue`.
- Error: `ErrorState` `The wallet wasn’t created` / `Nothing was charged. The network didn’t accept the request — try again.`

**Step 6 · Prove ownership to Swissquote**
```
│ Step 6 of 6 · Prove ownership to Swissquote
│ One more signature, no screenshots    │
│ Swiss rules require Swissquote to     │
│ verify who owns a wallet before       │
│ sending to it. Signing this proof     │
│ links the wallet to your Swissquote   │
│ file. Nothing leaves the chain.       │
│ ─ Panel ─────────────────────────     │
│   Wallet        0x12AB … 9F3C         │
│   Client        SQ-48213-LK           │
│   Valid for     Swissquote            │
│ [P] Sign the proof                    │
```
- Done: `Ownership proven — Travel Rule check done.` sub `Deposits from your Swissquote account are accepted instantly.` [P] `Go to my wallet`.

### `/pair` — laptop
```
┌ Lea · laptop — Safety key ───────────┐  (desk width, content max 480 centred-left)
│ Pair this laptop as Lea’s Safety key  │  text-28
│ Type the 6-digit code shown on the    │
│ phone.                                │
│ [ 4 8 2 1 3 7 ]  TextField mono       │
│ [P] Pair                              │
│ ─ KeyCard: Safety key ───────────     │
│   Lives in this browser profile       │
│   Can co-approve transfers above      │
│   CHF 1’000 a day and help restore    │
│   access · Cannot spend alone         │
│ Note: Prototype: a software key in    │
│ this browser. In production this is a │
│ hardware key.                         │
```
- Success: `Paired. This laptop now holds Lea’s Safety key.` [P] `Done`. Wrong code: field error `That code doesn’t match. Check the phone and try again.`

### `/` — Home
```
┌ Lea · phone ─────────────────────────┐
│ Keyline                    Security ⚙│  text-20 600 · ghost icon button (ShieldCheck)
│                                       │
│ Balance                               │  text-12 ink-3 eyebrow
│ CHF 96.00                             │  text-44
│ 120.00 USDC                           │  text-16 ink-2
│ Protected · 2 of 3 recoverers         │  PolicyLine ok style, link to /security
│                                       │
│ [P] Send   [sec] Receive   [sec] Top up  (3 equal 48 px buttons, 8 px gap)
│                                       │
│ Statement                       All → │
│ ── StatementRow ─────────────────     │
│ Lukas Meier            − 25.00 USDC   │
│ 5 Oct, 14:32 · Confirmed   CHF 20.00  │
│ ── StatementRow ─────────────────     │
│ Top up from Swissquote  + 120.00 USDC │
│ 5 Oct, 14:20 · Confirmed   CHF 96.00  │
│ ...                                   │
│ TestnetStrip                          │
```
- Empty statement: `EmptyState` `Nothing yet` / `Your first top-up will appear here.` action `Top up from my Swissquote account`.
- Top up sheet: title `Top up from my Swissquote account`, `AmountField`, note `Accepted instantly: this wallet is verified as yours.` + `SimulatedBadge` after `Swissquote account balance: CHF 4’210.35`. [P] `Top up`. Pending row: `Top up from Swissquote · Sent` (pending).
- Receive sheet: `Address` expanded + QR + `Only send USDC on Base Sepolia to this address.`
- No key on this device (Thief): hero replaced by `Note danger`: `This device has no key for this wallet.` body `Sending is not possible from here. If this is your phone and you lost access, start a recovery.` buttons `I lost my phone` (secondary) — no primary.

### `/send`
```
│ ← Send                                │
│ To                                    │
│ [ Search contacts or paste an address]│
│ Contacts                              │
│ ── Lukas Meier     0x7a1F … 3c9E  ✓   │  ✓ = verified ownership, ink-3 "Known"
│ ── Marta Rossi     0x44b0 … 81aA      │  meta "New — first transfer"
│ Amount                                │
│ AmountField  CHF 20.00 / 25.00 USDC   │
│ Rate 1 USDC = CHF 0.80 SIMULATED      │  text-12
│ [P] Review                            │
```
- New address notice (Note warn): `First transfer to this address. A short waiting period will apply and your laptop will be asked to confirm.`
- Errors: `Enter an amount` · `Not enough USDC. You have 120.00 USDC.` · `This doesn’t look like a Base address.`

### `/send/review` — one screen, four verdicts
```
│ ← Review                              │
│ CHF 20.00                             │  text-44
│ 25.00 USDC to Lukas Meier             │  text-16 ink-2 · Address compact under
│                                       │
│ PolicyLine (verdict, see below)       │
│                                       │
│ ─ Panel: What will happen ────────    │
│   You send          25.00 USDC        │
│   Lukas receives    25.00 USDC        │
│   Your balance      120.00 → 95.00 USDC│
│   Network fee       Paid by Swissquote│
│   Sanctions check   Clear · OFAC, SECO│
│   This can’t be undone.               │  footnote
│ ▸ Technical details                   │  Disclosure: to/data/nonce/userOp hash
│ [P] Confirm with Face ID              │
```
PolicyLine strings (icon + word + reason):
- ok: `Approved · Within your CHF 1’000 daily limit.`
- step-up: `Needs your laptop · Above CHF 1’000 today. Confirm on Lea · laptop.` — below, `StatusSequence`: `Sent to your laptop` (done) → `Waiting for the Safety key` (active) → `Approved` (todo). Primary disabled until approved; secondary `Cancel`.
- cooling: `Waiting period · First transfer to a new address. You can cancel for 0:60.` — `CountdownRing` size 96 with `Finishes at 14:33:10`; secondary `Cancel transfer` as the only button until done; demo caption `Waiting period accelerated for the demo: 60 s instead of 24 h.`
- block: `Blocked · Counterparty appears on the OFAC SDN list — simulated test entry.` + `SimulatedBadge`; body `Swissquote won’t pay the network fee for this transfer and recommends you don’t send it.` No primary; ghost `Back`.
- dApp danger (DemoSwap approve ∞): Panel row `Permission  DemoSwap could spend all your USDC, forever` in `--danger`; Note danger `This lets DemoSwap spend up to an unlimited amount of USDC. We recommend a cap.`; secondary `Approve 100.00 USDC instead` [becomes primary after tap], ghost `Reject`.
- After confirm: `StatusSequence` `Signed → Sent → In block 6’812’334 → Confirmed`, `Address` of tx hash, `View on Basescan`, [P] `Done`.
- Errors: `Approval expired` / `Policy approvals last 5 minutes. Review the transfer again.` [P] `Review again`. Passkey cancelled: `Note warn` `Face ID was cancelled. Nothing was sent.`

### `/approve` — laptop, Tier-2 co-approval
```
┌ Lea · laptop — Safety key ───────────┐  desk width, Sheet-like card centred (the only shadow)
│ Approve CHF 2’000.00 to Lukas Meier?  │  text-28
│ Requested from Lea · phone, 10 s ago. │  ink-2
│ Panel: You send 2’500.00 USDC · Lukas receives 2’500.00 USDC · Balance 5’000.00 → 2’500.00 USDC · Network fee Paid by Swissquote
│ Note: Policy-layer enforcement in this prototype. In production the Safe itself requires this key above the limit.
│ [secondary] Refuse     [P] Approve with Safety key
```
- Empty queue: `EmptyState` `Nothing to approve` / `Transfers above CHF 1’000 a day appear here.`
- Approved: `Approved. The phone can now send.` Refused: `Refused. The phone has been told.`

### `/activity/:hash`
```
│ ← Transfer                            │
│ − 25.00 USDC                          │  text-44
│ CHF 20.00 to Lukas Meier              │
│ StatusSequence                        │
│   Signed            14:32:04          │
│   Sent              14:32:05          │
│   In block 6’812’334 14:32:07         │
│   Confirmed         14:32:09          │
│ Panel: To (Address) · Network fee Paid by Swissquote · Transaction (Address of hash) · Network Base Sepolia
│ View on Basescan ↗                    │
│ ▸ Technical details                   │
```
- Pending: last step active with `Clock`. Failed: step `failed` `Not accepted by the network` + `ErrorState` body `Nothing was sent. Your balance is unchanged.`

### `/dapps`
```
│ ← Apps                                │
│ Apps Swissquote has reviewed can ask  │
│ your wallet for a permission or a     │
│ transfer. You still confirm every one.│
│ Reviewed                              │
│ ── DemoSwap   Swap USDC · reviewed ✓  │  StatementRow, action `Open`
│ Not reviewed                          │
│ ── Unknown dApp   Blocked             │  status danger, action `Request review`
│ Note: Blocked apps can’t ask your wallet for anything through Keyline.
```
- `Request review` → `Note` `Review requested. Swissquote answers within 2 business days.` + `SimulatedBadge`.

### `/security` — Security centre
```
│ ← Security                            │
│ Protected · 2 of 3 recoverers         │
│ Keys                                  │
│   KeyCard Phone key · This phone · Signs every transfer · active
│   KeyCard Safety key · Lea’s laptop · Co-approves above CHF 1’000 · helps restore · active
│   KeyCard Emergency card · On paper, with you · Helps restore after a waiting period · Cannot spend · active
│   KeyCard Swissquote · Swiss data centre · Helps restore after identity check · Cannot spend, cannot act alone · active
│ Limits                                │
│   Daily limit        CHF 1’000 · used CHF 20.00 today
│   Laptop needed above CHF 1’000
│   Waiting period     First transfer to a new address, > CHF 10’000
│   Network fees paid by Swissquote today   3 / 20
│ Recovery mode        Default · waiting period 72 h (demo: 3 min)
│ Trusted addresses    Lukas Meier ✓ · Marta Rossi
│ Devices              Lea · phone (this device) · Lea · laptop
│ ── Prove this wallet is yours         │  row → sheet
│ ── Export Safety key                  │  row (laptop only; phone shows "On your laptop")
│ ── If Swissquote disappears           │  row → sheet
│ Event log                             │
│   StatementRow × n (type · time)      │
│ TestnetStrip                          │
```
Sheets:
- **Prove this wallet is yours**: body `Swiss rules require platforms to verify who owns a wallet before sending to it. Share this proof instead of screenshots.` TextField `Platform (VASP)` default `Swissquote`; [P] `Create proof`; result: QR + mono text + `Copy proof`; meta `Signed by your phone key · valid for Swissquote only`.
- **Export Safety key** (laptop): body `Download your Safety key as an encrypted file. You’ll need it only if this laptop is lost or if Swissquote disappears.` TextField `Password` (type password) + hint `At least 12 characters. Keyline can’t reset it.`; [P] `Download encrypted file`; filename `keyline-safety-key.json`.
- **If Swissquote disappears** (exit hatch): eyebrow `Your wallet doesn’t need Swissquote to exist.`
  rows: `Wallet` Address + `Verify yourself on Basescan ↗` · `Recoverers on-chain` three addresses labelled · `Your phone key keeps signing through any public network relay.` Toggle `Pay my own network fee` (description `Uses ETH in this wallet instead of Swissquote’s sponsorship.`) · `Your Safety key + your Emergency card restore access without Swissquote.` code block `pnpm keyline recover --without-bank --safety-key safety.json --emergency-card <hex>` · caveat (Note info): `Passkeys are tied to this app’s web address. In production the app is open source and the address is held by an independent escrow, so it can’t disappear with the bank.`
- Event log row examples: `Wallet created` · `Safety key added` · `Emergency card added` · `Ownership proven` · `Transfer confirmed · 25.00 USDC` · `Recovery attempt refused`. Empty: `No events yet`.

### `/recover` — new phone (also the Thief’s path until identity fails)
Stepper total 5: `Email · Identity · New key · Recoverers · Waiting period`.
1. **Email** — title `Let’s get you back in` body `Enter the email on your Swissquote file. We’ll send a code.` TextField `Email`, [P] `Send code`; then TextField `6-digit code` + hint `Check /mock/inbox — email delivery is simulated.` + `SimulatedBadge`, [P] `Continue`. Error `That code doesn’t match.`
2. **Identity** — title `Confirm it’s you` + `SimulatedBadge` eyebrow `swiyu e-ID check SIMULATED`. Body `Swissquote checks your identity before its recoverer may act. In production this is the Swiss e-ID (swiyu).` Fields `Name on ID`, `Date of birth`, Toggle `Liveness check passed` (prefilled). [P] `Submit identity check`. Status while desk decides: `StatusSequence` `Sent to Swissquote` done → `Being checked` active. Refused → `/refused`.
3. **New key** — title `Create a key on this phone` body `This phone gets its own key. Nothing from the old phone is reused.` [P] `Create with Face ID / fingerprint`.
4. **Recoverers** — title `Waiting for a second recoverer` body `Swissquote has confirmed. Swissquote cannot finish this alone — one more recoverer is needed.`
   KeyCards: `Swissquote · Confirmed 14:30:12 · View on Basescan` (ok) · `Safety key · Open Keyline on Lea · laptop to confirm` (pending) · `Emergency card · Paste the key from your card` (pending) with TextField mono `Emergency card key` + [secondary] `Use Emergency card`.
   Secondary note: `Either your laptop or your Emergency card will do. You don’t need both.`
5. **Waiting period** — title `Access restores at 14:35:12` `CountdownRing` size 200, inside `02:41` + `remaining`; below `Finishes at 14:35:12 · read from the chain`; caption `Waiting period accelerated for the demo: 3 min instead of 72 h.`; body `During this period the previous owner can still cancel. If nobody cancels, this phone becomes the only key.` Link `Watch on Basescan`. When done: title `Welcome back, Lea` body `This phone is now your only key. The old phone can no longer sign.` [P] `Go to my wallet`.
- Error (bank unreachable) uses the global offline ErrorState. Error (module refuses): `ErrorState` `The recovery couldn’t start` / `The chain rejected the request. Nothing changed.`

### `/alerts` — Lea’s existing devices
- Recovery started (danger Note + ring): title `Recovery started from a new device` body `Recovery started from a new phone in Zürich, 2 minutes ago. If nobody cancels, that device becomes the only key at 14:35:12.` `CountdownRing` size 120. [P danger] `Cancel recovery — it wasn’t me` · ghost `It was me`. After cancel: `Recovery cancelled. Your phone remains the only key.` + `View on Basescan`. Fraudster’s screen (`/recover` step 5) switches to `Recovery cancelled by the owner.` with `ErrorState` tone.
- Recovery refused (info Note): title `Recovery attempt refused` body `Someone tried to recover this wallet from a device labelled “Thief · stolen phone” at 14:28. The identity check failed; Swissquote’s recoverer did not act. Nothing changed.` ghost `See event log`.
- Empty: `EmptyState` `No alerts` / `Recovery attempts and large transfers appear here.`

### `/refused`
```
│ Thief · stolen phone (red bar)        │
│ Prohibit icon  Recovery can’t start   │  text-28
│ The identity check failed. The owner  │
│ has been notified.                    │
│ Panel: Email code Passed · Identity check Failed SIMULATED · Swissquote recoverer Did not act
│ Reasons: ID document name mismatch · liveness check failed
│ ghost: Back to start                  │  no primary
```

### `/desk` — Swissquote recovery desk (desktop, `DeskLayout`)
Header (ink): `Swissquote · Recovery desk` + `SimulatedBadge` + operator `Operator: M. Keller` + `Sign out`. Footer: `This console cannot move client funds.` Legend (top-right): `Real` (solid ink square) `On-chain and signed` · `Simulated` (dashed square) `Mocked for the prototype`.
- **Login**: title `Operator sign-in` body `Single sign-on is simulated for the prototype.` + badge; TextField `Operator token`; [P] `Sign in`; error `That token isn’t valid.`
- **Queue** (left column 4/12): heading `Recovery requests`, filter chips `Open · Refused · Finished`; rows: `Lea Keller · SQ-48213-LK` / `Awaiting recoverers · 2 min ago` status chips: `identity-pending → Identity check` (pending) · `identity-refused → Refused` (danger) · `awaiting-guardians → Waiting for a 2nd recoverer` (pending) · `executed-waiting → Waiting period` (pending) · `finalized → Finished` (ok) · `cancelled → Cancelled by owner` (ink-2). Empty: `No recovery requests` / `New requests appear here within a few seconds.`
- **Request detail** (right 8/12): title `Lea Keller — recovery #R-2041`; eyebrow `Requested from Lea · new phone · Zürich · 5 Oct 2026, 14:28`.
  Section `Identity signals` + badge: rows `Email code Passed` · `ID document Name matches` / `Name mismatch` · `Liveness Passed` / `Failed` · `Verdict Pass, signed by the bank` / `Fail`.
  Section `Recoverer confirmations` (Real): rows `Swissquote Confirmed 14:30:12 · tx 0x9c…41 ↗` · `Safety key Pending` · `Emergency card Not used`.
  Section `On-chain timer` (Real): `Waiting period ends 14:35:12` + small `CountdownRing` 64 + `read from the SocialRecoveryModule`. Not started: `No waiting period yet — the request has 1 of 2 confirmations.`
  Actions: [P] `Approve identity` · secondary `Refuse` (requires note) · danger-text ghost `Override (demo: assume the bank was fooled)` with confirm sheet `Override the identity check?` body `This instructs Swissquote’s recoverer to confirm although the check failed. It demonstrates that one recoverer is never enough.` buttons `Override` (danger) · `Keep refused`. After override: `Note` `Swissquote confirmed. Status stays “Waiting for a 2nd recoverer” — Swissquote cannot finish this alone.`
  Finalize appears only when the timer is done: secondary `Finish recovery` (fee paid by Swissquote).
- **Audit log** (full width, below): heading `Audit log · append-only`; table `Time · Service · Event · Who`; rows mono time; empty `No events yet`.

### `/mock/inbox` — `SimulatedBadge` in title
Title `Inbox · lea.keller@example.ch` + badge. Body `Email delivery is simulated. Codes sent by Keyline appear here.` Rows: `Keyline · Your recovery code is 482137 · 14:28`. Empty `No messages`.

### `/mock/eid` — `SimulatedBadge` in title
Title `swiyu e-ID check` + badge. Body `Stand-in for the Swiss e-ID (live 1 Dec 2026). Persona rules: a device labelled “Thief” or a name that doesn’t match the client fails.` Fields `Name on ID`, `Date of birth`, Toggle `Liveness check passed`. [P] `Submit`. Result Note `Verdict: pass` / `Verdict: fail — ID document name mismatch, liveness check failed`.

## 11. Review checklist (design-system audits every screen against this)

- One primary button per screen; 48 px; label is a verb phrase.
- Every status: icon + word. Every simulation: `SimulatedBadge`. Every waiting period: exact finish time + demo caption.
- Every address: `Address` (full value reachable + copy). Every amount: `formatCHF` / `formatUSDC`.
- No shadow outside `Sheet`; radii only 6/10; no purple; no gradient; no emoji; no "Dashboard/Overview/Welcome back!"; no spinner without a sentence.
- Focus ring visible on every control; tap targets ≥ 44 px; no text clipped at 390 px.
- Vocabulary: recoverer · Safety key · Emergency card · network fee · approver — never guardian/gas/seed/userOp outside `Technical details`.

## Appendix A — `copy.ts` (paste into `apps/wallet/src/copy.ts`)

```ts
// Generated from docs/DESIGN.md §9–10. Do not edit strings here; edit DESIGN.md and re-paste.
export const copy = {
  brand: 'Keyline',
  device: {
    'lea-phone': 'Lea · phone',
    'lea-laptop': 'Lea · laptop — Safety key',
    'lea-new-phone': 'Lea · new phone',
    thief: 'Thief · stolen phone',
    desk: 'Swissquote desk (simulated)',
  },
  testnet: { strip: 'Test network · Base Sepolia — nothing here is real money.', link: 'View on Basescan' },
  simulated: { label: 'SIMULATED', tooltip: 'Mocked for the prototype — see README' },
  demo: {
    gracePeriod: 'Waiting period accelerated for the demo: 3 min instead of 72 h.',
    cooling: 'Waiting period accelerated for the demo: 60 s instead of 24 h.',
  },
  common: {
    continue: 'Continue', back: 'Back', cancel: 'Cancel', done: 'Done', copy: 'Copy', copied: 'Copied',
    tryAgain: 'Try again', technicalDetails: 'Technical details', viewOnBasescan: 'View on Basescan',
    showFull: 'Show full address', hideFull: 'Hide', print: 'Print',
    errorTitle: 'Something didn’t work',
    offlineTitle: 'Swissquote isn’t reachable',
    offlineBody: 'Your keys and your money are unaffected. The bank service answers policy checks and pays network fees; try again in a moment.',
    cantUndo: 'This can’t be undone.',
    networkFeePaid: 'Paid by Swissquote',
  },
  onboarding: {
    stepLabel: (n: number, total: number, title: string) => `Step ${n} of ${total} · ${title}`,
    s1: {
      step: 'Create your Keyline',
      title: 'A wallet only you can spend from.',
      body: 'Your phone’s face or fingerprint unlocks a key that stays on this phone. Swissquote never holds it.',
      panelTitle: 'What you get',
      rows: [['Spending key', 'This phone'], ['Recoverers', '3, any 2 restore'], ['Network fees', 'Paid by Swissquote']],
      primary: 'Create with Face ID / fingerprint',
      signIn: 'Already have a Keyline? Sign in',
      cancelled: 'The passkey prompt was closed. Nothing was created — try again when you’re ready.',
      unsupportedTitle: 'This browser can’t create a passkey',
      unsupportedBody: 'Use Chrome, Safari or Edge on a device with Face ID, Touch ID or a fingerprint reader.',
      techAddress: 'Wallet address (not yet deployed)',
    },
    s2: {
      step: 'Add your Safety key',
      title: 'Your second recoverer, on your laptop.',
      body: (url: string) => `On your laptop, open ${url} and type this code:`,
      expiresIn: (mmss: string) => `Code expires in ${mmss}`,
      expired: 'Code expired', newCode: 'Show a new code',
      waiting: 'Waiting for your laptop',
      keyName: 'Safety key', keyWhere: 'On your laptop',
      keyCan: 'Can co-approve large transfers and help restore access', keyCannot: 'Cannot spend alone',
      skip: 'Skip for now — add it later',
    },
    s3: {
      step: 'Print your Emergency card',
      title: 'Your third recoverer, on paper.',
      body: 'Print it or write it down, then keep it where you keep your passport.',
      cardTitle: 'KEYLINE EMERGENCY CARD',
      forWallet: 'For wallet',
      sentence: 'This card cannot spend your money. It can only help restore access after a waiting period you will see.',
      stored: 'I stored it', storedDone: 'Stored',
      shownOnce: 'Shown once. Keyline keeps no copy.',
      confirmTitle: 'Have you really stored it?',
      confirmBody: 'Keyline keeps no copy. If you lose both your phone and your laptop, this card is the only thing that can help.',
      confirmYes: 'Yes, I stored it', confirmNo: 'Go back',
    },
    s4: {
      step: 'Choose how recovery works',
      title: 'Who can help you back in',
      defaultName: 'Default — recommended',
      defaultBody: 'Your Safety key, your Emergency card and Swissquote. Any 2 of the 3. Swissquote can never act alone or with another institution.',
      defaultWait: 'Waiting period: 72 h (demo: 3 min)',
      assistedName: 'Assisted',
      assistedBody: 'Your Safety key, Swissquote and an independent recovery partner. For clients who don’t want paper.',
      assistedWait: 'Waiting period: 14 days.',
      assistedPartner: 'SIMULATED partner', assistedUnavailable: 'Not in this prototype',
    },
    s5: {
      step: 'Protect my wallet',
      title: 'One signature sets everything up',
      panelTitle: 'What will happen',
      rows: [['Your wallet', 'Created on Base'], ['Recoverers', 'Safety key, Emergency card, Swissquote'], ['Needed to restore', '2 of 3'], ['Network fee', 'Paid by Swissquote']],
      primary: 'Protect my wallet',
      sequence: ['Signed', 'Sent', 'In block', 'Confirmed'],
      protectedTitle: 'Protected',
      protectedLines: ['Your phone key signs.', 'Any 2 of your 3 recoverers can restore access.', 'Swissquote can’t move your money, alone or with anyone.'],
      errorTitle: 'The wallet wasn’t created',
      errorBody: 'Nothing was charged. The network didn’t accept the request — try again.',
    },
    s6: {
      step: 'Prove ownership to Swissquote',
      title: 'One more signature, no screenshots',
      body: 'Swiss rules require Swissquote to verify who owns a wallet before sending to it. Signing this proof links the wallet to your Swissquote file. Nothing leaves the chain.',
      rows: { wallet: 'Wallet', client: 'Client', validFor: 'Valid for' },
      primary: 'Sign the proof',
      doneTitle: 'Ownership proven — Travel Rule check done.',
      doneBody: 'Deposits from your Swissquote account are accepted instantly.',
      goHome: 'Go to my wallet',
    },
  },
  pair: {
    title: 'Pair this laptop as Lea’s Safety key',
    body: 'Type the 6-digit code shown on the phone.',
    field: '6-digit code', primary: 'Pair',
    keyWhere: 'Lives in this browser profile',
    keyCan: 'Can co-approve transfers above CHF 1’000 a day and help restore access', keyCannot: 'Cannot spend alone',
    note: 'Prototype: a software key in this browser. In production this is a hardware key.',
    success: 'Paired. This laptop now holds Lea’s Safety key.',
    wrongCode: 'That code doesn’t match. Check the phone and try again.',
  },
  home: {
    balance: 'Balance',
    protection: 'Protected · 2 of 3 recoverers',
    send: 'Send', receive: 'Receive', topUp: 'Top up',
    statement: 'Statement', all: 'All',
    emptyTitle: 'Nothing yet', emptyBody: 'Your first top-up will appear here.',
    emptyAction: 'Top up from my Swissquote account',
    topUpTitle: 'Top up from my Swissquote account',
    topUpNote: 'Accepted instantly: this wallet is verified as yours.',
    topUpBalance: (chf: string) => `Swissquote account balance: ${chf}`,
    topUpRow: 'Top up from Swissquote',
    receiveNote: 'Only send USDC on Base Sepolia to this address.',
    noKeyTitle: 'This device has no key for this wallet.',
    noKeyBody: 'Sending is not possible from here. If this is your phone and you lost access, start a recovery.',
    lostPhone: 'I lost my phone',
    status: { confirmed: 'Confirmed', sent: 'Sent', failed: 'Failed' },
  },
  send: {
    title: 'Send', to: 'To', search: 'Search contacts or paste an address', contacts: 'Contacts',
    known: 'Known', newContact: 'New — first transfer', amount: 'Amount',
    rate: (r: string) => `Rate 1 USDC = ${r}`,
    review: 'Review',
    newAddressNotice: 'First transfer to this address. A short waiting period will apply and your laptop will be asked to confirm.',
    errAmount: 'Enter an amount',
    errFunds: (usdc: string) => `Not enough USDC. You have ${usdc}.`,
    errAddress: 'This doesn’t look like a Base address.',
  },
  review: {
    title: 'Review',
    toLine: (usdc: string, name: string) => `${usdc} to ${name}`,
    panelTitle: 'What will happen',
    youSend: 'You send', receives: (name: string) => `${name} receives`, yourBalance: 'Your balance',
    networkFee: 'Network fee', sanctions: 'Sanctions check', sanctionsClear: 'Clear · OFAC, SECO',
    permission: 'Permission',
    confirm: 'Confirm with Face ID',
    policy: {
      ok: { word: 'Approved', reason: 'Within your CHF 1’000 daily limit.' },
      stepUp: { word: 'Needs your laptop', reason: 'Above CHF 1’000 today. Confirm on Lea · laptop.' },
      cooling: { word: 'Waiting period', reason: (s: string) => `First transfer to a new address. You can cancel for ${s}.` },
      block: { word: 'Blocked', reason: 'Counterparty appears on the OFAC SDN list — simulated test entry.' },
    },
    stepUpSequence: ['Sent to your laptop', 'Waiting for the Safety key', 'Approved'],
    coolingCancel: 'Cancel transfer',
    blockBody: 'Swissquote won’t pay the network fee for this transfer and recommends you don’t send it.',
    dappDangerRow: (name: string) => `${name} could spend all your USDC, forever`,
    dappDangerNote: (name: string) => `This lets ${name} spend up to an unlimited amount of USDC. We recommend a cap.`,
    dappCap: (usdc: string) => `Approve ${usdc} instead`, dappReject: 'Reject',
    sequence: ['Signed', 'Sent', 'In block', 'Confirmed'],
    inBlock: (n: string) => `In block ${n}`,
    expiredTitle: 'Approval expired',
    expiredBody: 'Policy approvals last 5 minutes. Review the transfer again.', reviewAgain: 'Review again',
    passkeyCancelled: 'Face ID was cancelled. Nothing was sent.',
  },
  approve: {
    title: (chf: string, name: string) => `Approve ${chf} to ${name}?`,
    requested: (device: string, ago: string) => `Requested from ${device}, ${ago}.`,
    note: 'Policy-layer enforcement in this prototype. In production the Safe itself requires this key above the limit.',
    refuse: 'Refuse', approve: 'Approve with Safety key',
    emptyTitle: 'Nothing to approve', emptyBody: 'Transfers above CHF 1’000 a day appear here.',
    approved: 'Approved. The phone can now send.', refused: 'Refused. The phone has been told.',
  },
  activity: {
    title: 'Transfer', to: 'To', transaction: 'Transaction', network: 'Network', networkName: 'Base Sepolia',
    failedStep: 'Not accepted by the network', failedBody: 'Nothing was sent. Your balance is unchanged.',
  },
  dapps: {
    title: 'Apps',
    body: 'Apps Swissquote has reviewed can ask your wallet for a permission or a transfer. You still confirm every one.',
    reviewed: 'Reviewed', notReviewed: 'Not reviewed', reviewedMeta: 'reviewed', blocked: 'Blocked',
    open: 'Open', requestReview: 'Request review',
    note: 'Blocked apps can’t ask your wallet for anything through Keyline.',
    reviewRequested: 'Review requested. Swissquote answers within 2 business days.',
  },
  security: {
    title: 'Security', keys: 'Keys',
    phoneKey: { name: 'Phone key', where: 'This phone', can: 'Signs every transfer' },
    safetyKey: { name: 'Safety key', where: 'Lea’s laptop', can: 'Co-approves above CHF 1’000 · helps restore' },
    emergencyCard: { name: 'Emergency card', where: 'On paper, with you', can: 'Helps restore after a waiting period', cannot: 'Cannot spend' },
    swissquote: { name: 'Swissquote', where: 'Swiss data centre', can: 'Helps restore after identity check', cannot: 'Cannot spend, cannot act alone' },
    limits: 'Limits', dailyLimit: 'Daily limit',
    dailyUsed: (used: string) => `CHF 1’000 · used ${used} today`,
    laptopAbove: 'Laptop needed above CHF 1’000', waitingPeriod: 'Waiting period',
    waitingTrigger: 'First transfer to a new address, > CHF 10’000',
    sponsored: 'Network fees paid by Swissquote today', sponsoredCount: (n: number, max: number) => `${n} / ${max}`,
    recoveryMode: 'Recovery mode', recoveryModeValue: 'Default · waiting period 72 h (demo: 3 min)',
    trusted: 'Trusted addresses', devices: 'Devices', thisDevice: '(this device)',
    prove: 'Prove this wallet is yours', exportKey: 'Export Safety key', exportOnLaptop: 'On your laptop',
    exit: 'If Swissquote disappears', eventLog: 'Event log', noEvents: 'No events yet',
    proveBody: 'Swiss rules require platforms to verify who owns a wallet before sending to it. Share this proof instead of screenshots.',
    proveField: 'Platform (VASP)', proveCreate: 'Create proof', proveCopy: 'Copy proof',
    proveMeta: 'Signed by your phone key · valid for Swissquote only',
    exportBody: 'Download your Safety key as an encrypted file. You’ll need it only if this laptop is lost or if Swissquote disappears.',
    exportPassword: 'Password', exportHint: 'At least 12 characters. Keyline can’t reset it.',
    exportPrimary: 'Download encrypted file', exportFilename: 'keyline-safety-key.json',
    exitEyebrow: 'Your wallet doesn’t need Swissquote to exist.',
    exitWallet: 'Wallet', exitVerify: 'Verify yourself on Basescan', exitRecoverers: 'Recoverers on-chain',
    exitSigning: 'Your phone key keeps signing through any public network relay.',
    exitToggle: 'Pay my own network fee', exitToggleDesc: 'Uses ETH in this wallet instead of Swissquote’s sponsorship.',
    exitRestore: 'Your Safety key + your Emergency card restore access without Swissquote.',
    exitCli: 'pnpm keyline recover --without-bank --safety-key safety.json --emergency-card <hex>',
    exitCaveat: 'Passkeys are tied to this app’s web address. In production the app is open source and the address is held by an independent escrow, so it can’t disappear with the bank.',
    events: { created: 'Wallet created', safetyAdded: 'Safety key added', cardAdded: 'Emergency card added', proven: 'Ownership proven', transfer: (usdc: string) => `Transfer confirmed · ${usdc}`, refused: 'Recovery attempt refused' },
  },
  recover: {
    steps: ['Email', 'Identity', 'New key', 'Recoverers', 'Waiting period'],
    emailTitle: 'Let’s get you back in',
    emailBody: 'Enter the email on your Swissquote file. We’ll send a code.',
    emailField: 'Email', sendCode: 'Send code', codeField: '6-digit code',
    codeHint: 'Check /mock/inbox — email delivery is simulated.', codeWrong: 'That code doesn’t match.',
    idTitle: 'Confirm it’s you', idEyebrow: 'swiyu e-ID check',
    idBody: 'Swissquote checks your identity before its recoverer may act. In production this is the Swiss e-ID (swiyu).',
    idName: 'Name on ID', idDob: 'Date of birth', idLiveness: 'Liveness check passed', idSubmit: 'Submit identity check',
    idSequence: ['Sent to Swissquote', 'Being checked'],
    keyTitle: 'Create a key on this phone',
    keyBody: 'This phone gets its own key. Nothing from the old phone is reused.',
    keyPrimary: 'Create with Face ID / fingerprint',
    recTitle: 'Waiting for a second recoverer',
    recBody: 'Swissquote has confirmed. Swissquote cannot finish this alone — one more recoverer is needed.',
    recSq: (t: string) => `Confirmed ${t}`,
    recSafety: 'Open Keyline on Lea · laptop to confirm',
    recCard: 'Paste the key from your card', recCardField: 'Emergency card key', recCardUse: 'Use Emergency card',
    recEither: 'Either your laptop or your Emergency card will do. You don’t need both.',
    waitTitle: (t: string) => `Access restores at ${t}`,
    waitFinishes: (t: string) => `Finishes at ${t} · read from the chain`,
    waitBody: 'During this period the previous owner can still cancel. If nobody cancels, this phone becomes the only key.',
    watch: 'Watch on Basescan',
    welcome: 'Welcome back, Lea', welcomeBody: 'This phone is now your only key. The old phone can no longer sign.',
    goHome: 'Go to my wallet',
    cancelledByOwner: 'Recovery cancelled by the owner.',
    errTitle: 'The recovery couldn’t start', errBody: 'The chain rejected the request. Nothing changed.',
    laptopPrompt: (ago: string) => `Restore access on a new phone? Requested ${ago} from Zürich.`,
    laptopConfirm: 'Confirm with Safety key', laptopRefuse: 'Not me — refuse',
  },
  alerts: {
    startedTitle: 'Recovery started from a new device',
    startedBody: (where: string, ago: string, t: string) => `Recovery started from a new phone in ${where}, ${ago}. If nobody cancels, that device becomes the only key at ${t}.`,
    cancel: 'Cancel recovery — it wasn’t me', itWasMe: 'It was me',
    cancelled: 'Recovery cancelled. Your phone remains the only key.',
    refusedTitle: 'Recovery attempt refused',
    refusedBody: (device: string, t: string) => `Someone tried to recover this wallet from a device labelled “${device}” at ${t}. The identity check failed; Swissquote’s recoverer did not act. Nothing changed.`,
    seeLog: 'See event log',
    emptyTitle: 'No alerts', emptyBody: 'Recovery attempts and large transfers appear here.',
  },
  refused: {
    title: 'Recovery can’t start',
    body: 'The identity check failed. The owner has been notified.',
    rows: { email: 'Email code', identity: 'Identity check', sq: 'Swissquote recoverer' },
    passed: 'Passed', failed: 'Failed', didNotAct: 'Did not act', reasons: 'Reasons',
    back: 'Back to start',
  },
  desk: {
    header: 'Swissquote · Recovery desk', operator: (n: string) => `Operator: ${n}`, signOut: 'Sign out',
    footer: 'This console cannot move client funds.',
    legend: { real: 'Real', realDesc: 'On-chain and signed', simulated: 'Simulated', simulatedDesc: 'Mocked for the prototype' },
    loginTitle: 'Operator sign-in', loginBody: 'Single sign-on is simulated for the prototype.',
    loginField: 'Operator token', loginPrimary: 'Sign in', loginError: 'That token isn’t valid.',
    queue: 'Recovery requests', filters: ['Open', 'Refused', 'Finished'],
    status: {
      'identity-pending': 'Identity check', 'identity-refused': 'Refused', 'awaiting-guardians': 'Waiting for a 2nd recoverer',
      'executed-waiting': 'Waiting period', finalized: 'Finished', cancelled: 'Cancelled by owner',
    },
    queueEmptyTitle: 'No recovery requests', queueEmptyBody: 'New requests appear here within a few seconds.',
    detailTitle: (name: string, id: string) => `${name} — recovery #${id}`,
    requestedFrom: (device: string, where: string, when: string) => `Requested from ${device} · ${where} · ${when}`,
    identitySignals: 'Identity signals',
    sig: { email: 'Email code', doc: 'ID document', liveness: 'Liveness', verdict: 'Verdict' },
    sigValues: { passed: 'Passed', failed: 'Failed', nameMatch: 'Name matches', nameMismatch: 'Name mismatch', verdictPass: 'Pass, signed by the bank', verdictFail: 'Fail' },
    confirmations: 'Recoverer confirmations',
    conf: { confirmed: (t: string) => `Confirmed ${t}`, pending: 'Pending', notUsed: 'Not used' },
    timer: 'On-chain timer', timerEnds: (t: string) => `Waiting period ends ${t}`, timerSource: 'read from the SocialRecoveryModule',
    timerNone: 'No waiting period yet — the request has 1 of 2 confirmations.',
    approve: 'Approve identity', refuse: 'Refuse', refuseNote: 'Reason (required)',
    override: 'Override (demo: assume the bank was fooled)',
    overrideTitle: 'Override the identity check?',
    overrideBody: 'This instructs Swissquote’s recoverer to confirm although the check failed. It demonstrates that one recoverer is never enough.',
    overrideYes: 'Override', overrideNo: 'Keep refused',
    overrideResult: 'Swissquote confirmed. Status stays “Waiting for a 2nd recoverer” — Swissquote cannot finish this alone.',
    finish: 'Finish recovery',
    audit: 'Audit log · append-only', auditCols: ['Time', 'Service', 'Event', 'Who'], auditEmpty: 'No events yet',
  },
  mock: {
    inboxTitle: (email: string) => `Inbox · ${email}`,
    inboxBody: 'Email delivery is simulated. Codes sent by Keyline appear here.',
    inboxRow: (code: string) => `Your recovery code is ${code}`, inboxEmpty: 'No messages',
    eidTitle: 'swiyu e-ID check',
    eidBody: 'Stand-in for the Swiss e-ID (live 1 Dec 2026). Persona rules: a device labelled “Thief” or a name that doesn’t match the client fails.',
    eidSubmit: 'Submit', eidPass: 'Verdict: pass', eidFail: (reasons: string) => `Verdict: fail — ${reasons}`,
  },
} as const;
```
