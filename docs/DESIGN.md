# Keyline — Design specification v2

Owner: `design-system` agent. **Status: Phase C in progress (11 Oct 2026) — v1 primitives dark-ready through tokens (chrome, paper, hover), translatable strings on every primitive, `ActionButton` error state, `useReducedMotion` export; Phase B approved (DECISIONS #26–#28, 10 Oct 2026).** Applied in `packages/ui`: dark `--danger` is a cooler crimson, links are ink + underline everywhere, the 24 px ring uses 10° gaps (pinned by a test). Journey primitives (§10.1) are on `/design#journey` in every state, both themes; the v1 kitchen sink is at `/design/v1`. The copy for the v2 journey is **Appendix V2** (keyed for `copy.ts`, EN; FR/DE in Phase C).

How to read this file: §1–§10 are the v2 rules (§10.1: journey primitives) and replace v1 where they disagree. §11 is the full v2 screen inventory (Phase B builds from it). **Appendix V1** is the previous specification, kept verbatim: its screen specs and its copy (Appendix A → `apps/wallet/src/copy.ts`) remain, except where Appendix V2 replaces a string, the source of truth for every screen until Phase B rebuilds that screen; the parts v2 supersedes are listed at the top of the appendix.

Engineers build screens only from `packages/ui` primitives and the copy in this file. If a string is missing, ask; do not invent it.

## 1. Thesis

**A Swiss bank document that moves like a watch.**

Not a crypto app and not a neo-bank template. Every screen is set like a printed statement: a grid, hairlines, tabular numerals, restraint, one accent. The only decoration is one motif, the **protection ring**: three arcs for the three recoverers (Safety key, Emergency card, Swissquote). It is the onboarding progress, the home protection indicator, the recovery countdown and the receipt's success state. It is drawn once, in SVG, and it moves with the same easing everywhere.

Movement is mechanical, never playful: things travel the shortest honest distance, settle without bouncing, and only move when something actually happened (a screen changed, an amount changed, a key was registered on-chain). Nothing animates for its own sake.

Honesty is part of the beauty: every simulated value carries the same quiet dashed `SIMULATED` chip; every status has an icon and a word; every address can be read in full.

## 2. Type

Fonts unchanged: **Hanken Grotesk** (variable, self-hosted, tabular figures by default on `<html>`) for all UI; **JetBrains Mono** (`"zero"`) for addresses, hashes, codes. Reason to keep: Hanken is a quiet grotesk with true tabular figures and a straight-legged `1`, which is what a statement needs; it is not one of the defaults that make AI-built apps look alike. Never Inter, Geist, Space Grotesk, Roboto, Satoshi.

| Role | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| Amount | 44 / 48 | 600 | −0.025em (`--tracking-44`) | balances, review amount, countdown centre |
| Title | 28 / 32 | 600 | −0.015em (`--tracking-28`) | screen titles, desk headings |
| Heading | 20 / 28 | 600 | 0 | sheet titles, section heads on desk |
| Body | 16 / 24 | 400 · 600 | 0 | body, row labels, inputs, buttons |
| Small | 14 / 20 | 400 · 600 | 0 | secondary text, table cells, status words |
| Meta | 12 / 16 | 400 · 600 | 0 (0.04em uppercase for eyebrows and the chip only) | timestamps, captions |

Rules: weights 400 and 600 only. Tracking tightens as size grows (above). Headings use `text-wrap: balance`. Running text is capped at **65 ch** (`--measure`). Numbers are tabular everywhere and never italic. The 44 px amount is the largest type in the product; nothing competes with it on the same screen.

## 3. Colour

One accent, used for exactly three things: **focus**, **the active thing** (current step, active tab underline on desk) and **the ring**. Links are ink, underlined. Status colours are semantic and separate; each always comes with an icon and a word. Banned: gradients, glassmorphism, backdrop blur, glows (except the one ring glow in dark, below), purple/indigo/violet, emoji, stock imagery, 3D.

**Danger never reads as the accent** (DECISIONS #26.1): in dark, `--danger` is a cooler crimson (hue ≈ 351°) against the orange accent (hue ≈ 12°); the contrast script fails if they come closer than 20° of hue. In light the v1 danger is kept: it is far darker than the accent, so lightness separates them. Destructive states still carry an icon and a word, and the revoked ring is still dashed.

A theme setting offers **System / Light / Dark** (`ThemeSwitch`, stored per device). Tokens: `[data-theme="light"|"dark"|"system"]` on the app root; `system` follows `prefers-color-scheme`. Light values are v1 and unchanged.

### 3.1 Light (v1 values, unchanged) and dark (designed, not inverted)

Ratios measured by `pnpm --filter @keyline/ui contrast` (WCAG 2.x). **123/123 checks pass** (Phase C: every pair the v1 primitives use, in both themes — 60 light + 61 dark pairs + the danger/accent hue check per theme). Text ≥ 4.5:1, marks and UI edges ≥ 3:1.

| Token | Light | Dark | Role | Light ratio | Dark ratio |
|---|---|---|---|---|---|
| `--bg` | `#F7F6F3` | `#141311` | paper — warm white / warm graphite | — | — |
| `--surface` | `#FFFFFF` | `#1C1B18` | sheets, inputs, true objects | — | — |
| `--surface-2` | `#EFEDE8` | `#26241F` | pressed rows, skeletons | — | — |
| `--line` | `#E4E2DD` | `#2E2C28` | hairlines (lifted in dark so they still read) | — | — |
| `--line-strong` | `#8A877F` | `#77736A` | input borders | 3.59 surface · 3.32 bg | 3.65 · 3.93 |
| `--ink` | `#141414` | `#EFEDE8` | text, primary fill | 17.05 bg | 15.87 bg |
| `--ink-2` | `#5C5C57` | `#B8B4AB` | secondary text | 6.22 bg | 8.98 bg |
| `--ink-3` | `#6B6B68` | `#9C988E` | meta text | 4.95 bg · 4.57 surface-2 | 6.45 · 5.39 |
| `--on-ink` | `#FFFFFF` | `#141311` | text on ink | 18.42 | 15.87 |
| `--accent` | `#FA5B35` | `#FF7452` | focus ring (on its 2 px halo), active marks | 3.18 surface | 6.46 surface |
| `--accent-text` | `#C8371A` | `#FF8A6B` | legacy accent words only — **no link uses it** (`.kl-link` is ink since Phase B) | 4.84 bg | 8.05 bg |
| `--ring-arc` *(new)* | `#EC502B` | `#FF7452` | ring arcs, countdown stroke | **3.38 bg** · 3.65 surface | 6.96 · 6.46 |
| `--ring-track` *(new)* | = `--line` | = `--line` | ring at rest | — | — |
| `--ring-glow` *(new)* | `none` | `drop-shadow(0 0 3px rgba(255,116,82,.35))` | the only glow, ring only | — | — |
| `--ok` / `--ok-bg` | `#1F7A4D` / `#E8F3EC` | `#5CC28E` / `#14261C` | success | 4.92 · 4.67 tint | 8.45 · 7.22 |
| `--pending` / `--pending-bg` | `#9A5B00` / `#FBF1E0` | `#E3A548` / `#2A2114` | waiting | 5.02 · 4.85 | 8.61 · 7.35 |
| `--danger` / `--danger-bg` | `#B42318` / `#FBE9E7` | **`#F06B80` / `#2E1419`** (was `#F27A6A` / `#2E1814`) | refusal, irreversible | 6.08 · 5.61 · 6.57 surface | 6.30 · 5.79 · 5.84 surface; on-ink on it 6.30 |
| `--simulated-text` | `#7A4B00` | `#E9B866` | chip label | 6.86 bg · 7.41 surface | 10.18 · 9.44 |
| `--simulated-border` | `#B07A1E` | `#A97B2F` | chip dashed border | 3.42 | 4.19 |
| `--scrim` *(new)* | `rgba(20,20,20,.32)` | `rgba(0,0,0,.56)` | behind sheets (v2 **and** v1 `Sheet` since Phase C) | — | — |
| `--ink-hover` / `--ink-active` *(C)* | `#2A2A2A` / `#000000` | `#FFFFFF` / `#D9D6CF` | primary button hover / pressed (were hard-coded) | on-ink 14.35 · 21.0 | 18.57 · 12.79 |
| `--danger-hover` *(C)* | `#9A1E14` | `#F58D9C` | danger button hover, `ActionButton` error hover | on-ink 8.17 | 8.11 |
| `--bezel` *(C)* | `#141414` | `#050505` | phone bezel — hardware, dark in both themes | — | — |
| `--chrome` / `--on-chrome` / `--on-chrome-2` *(C)* | `#141414` / `#FFFFFF` / `#CFCFCD` | `#0B0A09` / `#EFEDE8` / `#B8B4AB` | DeviceBar (phone, desk), desk header: demo furniture, dark in both themes | 18.42 · 11.81 | 16.91 · 9.57 |
| `--laptop-bar` / `--newphone-bar` / `--danger-bar` | `#5C5C57` / `#1F7A4D` / `#B42318` | **`#46443E` / `#1D5C3C` / `#9B2335`** *(C; were light tints in dark)* | persona bars, `--on-chrome` label | 6.72 · 5.32 · 6.57 | 8.32 · 6.78 · 6.68 |
| `.kl-paper` scope *(C)* | restates the light surface/ink tokens | same (light) | the Emergency card: a printed object stays paper in both themes; print CSS unchanged | light ratios | light ratios |
| `--shadow-modal` | `0 8px 24px rgba(20,20,20,.12)` | `0 8px 24px rgba(0,0,0,.48)` | sheets only | — | — |

Finding while measuring: the v1 accent `#FA5B35` is **2.94:1 on paper**, under the 3:1 a meaningful mark needs. The focus ring is fine (it sits on a 2 px surface halo: 3.18:1), but the ring is drawn directly on paper, so it uses the new `--ring-arc` `#EC502B` — the same hue one step deeper (3.38:1). Visually indistinguishable from the accent at ring stroke widths.

How dark differs from an inversion: paper is warm graphite, not black; surfaces step *up* in luminance (bg → surface → surface-2) instead of down; hairlines are lifted to `#2E2C28` so a 1 px line still reads on graphite; the accent is lifted in luminance (`#FF7452`) so it keeps its weight against dark; status colours are re-picked for ≥ 6:1 on graphite rather than flipped; the ring alone gets a 3 px glow so the accent does not look dull at 6 px stroke. The phone bezel, the persona device bars and the desk header (`--bezel`, `--chrome`), the QR quiet zone and the Emergency card (`.kl-paper`) stay physical in both themes: dark hardware, white paper. Since Phase C no v1 primitive carries a hard-coded colour; the only literal colours left are the QR's white quiet zone and black modules (a device drawing).

Implementation note: a `var()` declared in `:root` is resolved at `:root`. Any token defined as `var(--other)` must be re-declared in the dark blocks (`--ring-track`, `--focus-ring` are). `tokens.test.ts` asserts the `dark` and `system` blocks are identical.

## 4. Layout

- **4-pt grid**: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Nothing off-grid except 1 px hairlines and the 2 px stepper track.
- Phone: 390 px, 16 px gutters (358 usable). Laptop (Swissquote web, desk): 12 columns, 24 px gutters, max 1200 px.
- **Lists, not cards.** Rows have one left edge (the gutter), one right edge, one baseline grid: 56 px minimum, 8 px vertical padding, hairline below, label 16/24 over meta 12/16, value right-aligned and tabular. Every list on every screen uses this row (`StatementRow` or the same metrics).
- **Card styling only for true objects**: the Emergency card, the review panel ("What will happen"), the Keyline tile on Swissquote web, sheets. 10 px radius, hairline border, no shadow (sheets keep the one shadow).
- **One primary per screen**, docked at the bottom of the phone screen above the home indicator when it is the screen's purpose (onboarding, review, recovery), inline otherwise (home's Send).
- Radii 6 (controls, chips) and 10 (true objects, sheets). Circles only for the ring and status dots.
- Nothing clipped at 390 px; long values wrap (`overflow-wrap: anywhere`) rather than truncate; the page never scrolls horizontally (wide tables scroll inside their own container).

## 5. The protection ring

One SVG, three equal arcs, one per recoverer, **clockwise from 12 o'clock: Safety key, Emergency card, Swissquote**. Gaps are centred on 12, 4 and 8 o'clock. Component: `ProtectionRing` (`packages/ui/src/v2/ProtectionRing.tsx`); geometry is pure and tested (`ring-geometry.ts`, `ring-geometry.test.ts`).

### 5.1 Geometry

| Size | Use | Stroke | r (centre line) | Gap | Arc | Inner countdown stroke |
|---|---|---|---|---|---|---|
| 24 | home indicator, row icon | 2.5 | 10.75 | **10°** | 110° | none (< 48 px) |
| 64 | receipt, Swissquote tile | 4 | 30 | 4° | 116° | r 23.25, 1.5 px |
| 200 | onboarding, countdown | 6 | 97 | 4° | 116° | r 85, 2 px |

`gapDeg = max(4°, the angle that leaves ≥ 1.5 px on the arc's inner edge)`. At 24 px a 4° gap is 0.7 px — invisible — so the indicator widens it to 10°; the three recoverers must stay countable at every size. (Refinement of plan item 5.) Caps are butt (square ends read as precise; round caps read as a loading spinner).

The 200 px ring, exactly as rendered (state `registering`, 2 of 3; Safety key and Emergency card lit, Swissquote at rest):

```svg
<svg width="200" height="200" viewBox="0 0 200 200" fill="none" aria-hidden="true">
  <!-- track: the three arcs at rest (--ring-track) -->
  <g stroke="var(--ring-track)" stroke-width="6">
    <path d="M 103.385 3.059 A 97 97 0 0 1 185.646 145.539"/>   <!-- Safety key      2° → 118° -->
    <path d="M 182.261 151.402 A 97 97 0 0 1 17.739 151.402"/>  <!-- Emergency card 122° → 238° -->
    <path d="M 14.354 145.539 A 97 97 0 0 1 96.615 3.059"/>     <!-- Swissquote     242° → 358° -->
  </g>
  <!-- lit arcs (--ring-arc); drawn with pathLength 0 → 1 -->
  <g stroke="var(--ring-arc)" stroke-width="6" style="filter: var(--ring-glow)">
    <path d="M 103.385 3.059 A 97 97 0 0 1 185.646 145.539" pathLength="1"/>
    <path d="M 182.261 151.402 A 97 97 0 0 1 17.739 151.402" pathLength="1"/>
  </g>
  <!-- state counting only: thin inner stroke, starts at 12 o'clock, length = remaining fraction -->
  <!-- <path d="M 100 15 A 85 85 0 1 1 100 185 A 85 85 0 1 1 100 15" stroke="var(--ring-arc)" stroke-width="2"
             pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="{1 - remaining}"/> -->
</svg>
```

### 5.2 States

| `state` | Arcs | Centre (≥ 64 px) | Where |
|---|---|---|---|
| `empty` | three track arcs | `0 of 3` + `recoverers added` | onboarding before Protect; Swissquote tile before setup |
| `registering` + `registered={1\|2\|3}` | first *n* arcs in `--ring-arc`, in order | `n of 3` | onboarding Protect, as each guardian lands on-chain |
| `protected` | gaps close to 0°: one continuous ring in `--ring-arc` | a drawn check (onboarding), nothing (home 24 px) | home indicator, Security header |
| `counting` + `lit` + `progress` | confirmed recoverers in `--ink-3`, others at rest; thin inner stroke in `--ring-arc` = remaining fraction | `mm:ss` 44/48 + `remaining` | recovery waiting period (new phone, alerts, desk 64 px) |
| `success` | closed ring in `--ok` | drawn check in `--ok` | receipt (64 px), restored |
| `revoked` | three **dashed** arcs in `--danger` | — | recovery cancelled, protection removed |

`lit` overrides "first *n*" when the confirmed recoverers are not a prefix (a recovery confirmed by Safety key + Swissquote). Revoked is dashed, not just recoloured: "broken" must read without colour (and in dark `--danger` is now 21° of hue away from the accent, see §3).

Accessible name: a sentence per state (`Protected · 2 of 3 recoverers can restore access`), plus a hidden per-recoverer list (`Safety key: yes, Emergency card: not yet, Swissquote: not yet`). The SVG is `aria-hidden`.

### 5.3 The one orchestrated moment — "Protect my wallet"

1. Tap `Protect my wallet` → button: pressed (scale .98), then loading (label stays, small turning ring). The passkey sheet appears (system UI).
2. The userOp is sponsored, signed, sent. Rows under the ring read `Waiting` → `Adding` (accent dot, 600) → `Added` (ok check).
3. **Each arc draws (240 ms) when its guardian is seen on-chain.** Per SPEC F1 step 5 the three guardians are added by **one batched userOp**, so their guardian-added logs arrive together in one receipt (event name to be confirmed by `account-chain` in `docs/VERIFIED.md`). The arcs therefore start on that receipt and chain one after another through `onDrawn` (Safety key → Emergency card → Swissquote, in log order) — paced by the draw itself, never by a timer. Before the receipt, the status line under the button reads `Signed` → `Sent` → `In block 6’812’334`, so the wait is never silent.
4. When the third arc has drawn and the receipt is confirmed, the **gaps close** (4° → 0° on the spring, ≈ 200 ms) and a check draws in the centre (220 ms). Title becomes `Protected`; the button's label folds and a check draws (220 ms); one short vibration.
5. On the next screen (home) the same ring sits in the header at 24 px, closed. The ring that closed is the ring that lives on home.

On `/design` a 700–800 ms demo timer stands in for the events (labelled on the page).

## 6. Motion

Library: `motion` 12 (`motion/react`), already installed. Constants: `packages/ui/src/v2/motion.ts`.

- **Movement** — one spring: `{ stiffness: 420, damping: 40, mass: 1 }`. Damping ratio ζ = 40 / (2·√420) ≈ **0.98**: settles in ≈ 200 ms, no visible overshoot. A test pins ζ ∈ (0.95, 1].
- **Opacity / colour** — 180 ms, `cubic-bezier(.2,.8,.2,1)` (`--ease-standard`, `--duration-fade`).
- **Strokes** — arcs 240 ms, checks 220 ms, same curve.
- Range 160–240 ms. Nothing loops except the loading indicator inside a button whose label stays visible.
- **Reduced motion** (`prefers-reduced-motion: reduce`, read with `useReducedMotion` and CSS): every movement becomes an instant change or a 180 ms cross-fade; strokes appear drawn; the pulse is skipped; the countdown stroke steps once per second.

| Motion | Trigger | Duration / curve | What moves | Reduced motion |
|---|---|---|---|---|
| Stack push / pop (`StackView`) | navigation to a child screen / back | spring | new screen slides in from 100 %; old one moves −24 % and dims to .6; header stays, title cross-fades 180 ms | content cross-fades 180 ms |
| Sheet (`SheetV2`) | open / close | scrim 180 ms; panel spring | scrim fades; panel rises from 100 %; drag down > 96 px or flick > 600 px/s closes | panel and scrim fade 180 ms; no drag |
| Number ticker (`NumberTicker`) | an amount's value changes | spring | each digit column rolls to its new digit; separators and codes never move; new leading digits fade in | text swaps |
| Cross-fade (`CrossFade`) | skeleton → content, any in-place swap | 180 ms | both layers overlap in one grid cell; no layout jump | instant |
| Button press (`ActionButton`) | pointer down | spring | scale .98 | none |
| Button loading | async action starts | — | label stays; 16 px ring turns (900 ms/turn, linear) beside it; `aria-busy` | static ring at 50 % |
| Button success | action confirmed | label 140 ms fold; check 220 ms | label folds to the centre (scaleX .2, fade), a check draws in its place; one vibration | check appears |
| Arc draw | guardian registered on-chain | 240 ms | one arc, pathLength 0 → 1 | drawn |
| Ring close | protection confirmed | spring | gaps 4° → 0°; seam cover fades in 180 ms after 200 ms | closed |
| Countdown sweep | every animation frame | real time | inner stroke shortens continuously; centre time changes once per second | steps per second |
| Countdown lands | remaining reaches 0 | 240 ms | one soft pulse (scale 1 → 1.04 → 1); centre `00:00` + `Ready to finish`; one vibration | no pulse |
| Theme change | setting | 180 ms | page background colour | instant |

Anything not in this table does not animate.

**Errors never animate** (no shake, no bounce): `ActionButton status="error"` is a 180 ms colour change only (primary → `--danger` fill, secondary → danger text + border), the label stays, and the sentence that says what happened sits next to the button. The countdown's last second is the only pulse.

**Custom motion in the wallet** (anything a primitive does not cover) imports `useReducedMotion()` (always a boolean) and `motionOrInstant(reduce, transition)` from `@keyline/ui`, and uses `SPRING` / `FADE` / `DRAW` / `INSTANT` from the same place — never its own durations.

## 7. Honesty: the `SIMULATED` chip

`<Chip/>` (v2; `SimulatedBadge` stays for v1 screens until Phase B). A quiet, consistent marker: 20 px tall, 0 6 px padding, **1 px dashed** `--simulated-border`, **no fill**, label `SIMULATED` 12 px 600 uppercase 0.04em in `--simulated-text`, radius 6, 4 px after the value it qualifies, on the same line. It is focusable; hover or focus shows the tooltip `Simulated for the prototype. See the README’s Real / Simulated table.` (inverse colours, no shadow). One chip per simulated *group*, at its header (e.g. once after `In your Swissquote account`, once after `Valuation …`), not on every number. What gets a chip: Swissquote account balances and prices, conversion rates, the Swissquote web session, the e-ID, email delivery, the partner guardian. Never on chain data.

## 8. Feel

- Targets ≥ 44 px (buttons 48, rows 56, icon buttons 44, segmented control 44).
- Focus always visible: `--focus-ring` (2 px halo + 2 px accent). Never removed.
- Haptics: `haptic('success')` (12 ms) on a confirmed transfer, protection complete, countdown landed; `haptic('refusal')` (24-60-24) on a policy block or a refused recovery. No-op where unsupported.
- PWA: maskable icon (ring on ink), splash = paper with the 64 px ring, `theme-color` per theme (`#F7F6F3` / `#141311`), status bar `default` / `black-translucent`. Phase B.
- Lighthouse ≥ 95 on Performance, Accessibility, Best Practices for `/`, `/send/review`, `/recover` (Phase B gate).

## 9. Copy

All strings live in `copy.ts` (EN now; FR and DE later — keep strings whole, no concatenated fragments except formatted values). The client's side, second person, specific and calm: what happens, what it costs, what cannot be undone. Never "Oops", "seamless", "unlock", "journey", exclamation marks, "Welcome back". Vocabulary per `CLAUDE.md` (recoverer, network fee, key; never seed phrase, gas, guardian, userOp). Greetings use the first name only: `Hi Lea`.

## 10. Primitives v2 (`@keyline/ui`, additive)

Styles in `@keyline/ui/v2.css` (prefix `kl2-`). v1 primitives are unchanged; in dark they re-theme through tokens only (verified on `/design`: `Panel`, `PolicyLine`, `Address`, `StatementRow`, `Disclosure`).

| Primitive | Props | Notes |
|---|---|---|
| `ProtectionRing` | `state`, `registered?: 0\|1\|2\|3`, `lit?`, `progress?`, `size?`, `onDrawn?(i)`, `pulseKey?`, `children` (centre), `label?` | §5 |
| `ProtectionCountdown` | `endsAt`, `durationMs`, `lit?`, `size?`, `subLabel?`, `doneLabel?`, `srLabel?(remaining, finishAt)`, `onDone?` | ring in `counting`; rAF sweep; pulse + haptic at 0 |
| `DrawnCheck` | `size?` | 220 ms check |
| `StackView` | `screenKey`, `direction: 1\|-1`, `title`, `onBack?`, `backLabel?`, `trailing?` | shared header |
| `SheetV2` | `open`, `title`, `onClose`, `contained?`, `closeLabel?` | spring + scrim, drag to close, focus return; max 560 px wide, centred, on wide viewports |
| `NumberTicker` | `value`, `format` (a package formatter) | digit columns keyed from the right (`tickerCells`, tested) |
| `CrossFade` | `stateKey` | skeleton → content |
| `ActionButton` | `label`, `status: idle\|loading\|success\|error`, `successLabel?`, `errorLabel?`, `variant?: primary\|secondary\|danger` (danger = confirm of a destructive step), `full?`, `icon?` | width never changes; `error` = colour change only |
| `Chip` | `label?`, `tooltip?` | §7 |
| `ThemeSwitch` + `useThemePreference()` | `value`, `onChange` | System / Light / Dark, localStorage guarded |
| `QrCode` | `value`, `size?`, `label` | white quiet zone in both themes |
| `haptic(kind)` | `'success' \| 'refusal'` | §8 |
| `contrastRatio`, `luminance` | — | shared by the contrast script and `/design` |
| motion constants | `SPRING`, `FADE`, `DRAW`, `INSTANT`, `DURATION`, `EASE_STANDARD`, `dampingRatio` | §6 |
| `useReducedMotion()`, `motionOrInstant()` *(C)* | — | hydration-safe boolean hook (`useSyncExternalStore`, server = `false`) used by every primitive + `reduce ? INSTANT : t`; never import motion's own hook in the wallet |

**Translatable strings (Phase C, FR/DE).** No primitive renders English the wallet cannot replace. Every built-in string has an optional prop with the English default: `SheetV2` / `Sheet` `closeLabel`; `StackView` `backLabel`; `Stepper` `stepText` (`Étape 2 sur 6`); `Address` `labels` (`show`, `hide`, `copy`, `copied`, `copyAria`, `explorer`; defaults `ADDRESS_LABELS`); `EmergencyCard` `labels` (`title`, `forWallet`, `recovererAddress`, `sentence`, `print`, `confirm`, `stored`, `footnote`; defaults `EMERGENCY_CARD_LABELS`); `ErrorState` `title`, `retryLabel`, `detailLabel`; `ProtectionRing` `label` + `detail` (the hidden per-recoverer list); `ProtectionCountdown` `subLabel`, `doneLabel`; `ActionButton` `successLabel`, `errorLabel`; `ThemeSwitch` `labels`, `legend`; `Chip` `label`, `tooltip`. Phase D: `DeskLayout` `labels` (`DESK_LABELS`: brand, legend, operator, sign out, chip, nav) + `personaLabel`; `WebShellCopy.chipLabel` / `chipTooltip`; `KeyCard unknown`. Only the persona `DeviceBar` labels (`PERSONA_LABEL`) stay English (identifiers, not prose). German running text hyphenates (`:lang(de) { hyphens: auto }`, never codes, addresses, amounts, inputs, buttons, chips); rows align label and value on the first baseline.

### 10.1 Journey primitives (Phase B, SPEC §10) — `packages/ui/src/v2/journey/`

Strings are always passed in (typed `…Copy` objects); the objects in Appendix V2 match these types exactly. Styles in `v2.css` (the wallet must import `@keyline/ui/v2.css`).

| Primitive | Props | Notes |
|---|---|---|
| `AssetRow` | `name`, `symbol`, `quantity` (formatted, no symbol), `value?` (formatted CHF), `valueChip?`, `action?: RowActionProps`, `loading?` | 56 px statement row; quantity + symbol over CHF value, right-aligned tabular; action on its own right-aligned line |
| `RowAction` | `label`, `onClick?`, `disabledReason?`, `onWhy?`, `whyLabel?` (`Why?`), `ariaLabel?`, `busy?`, `icon?` | ink underlined text button, 44 px; with `disabledReason` the label greys (`aria-disabled`, reason read by screen readers) and `Why?` opens the explanation |
| `PositionsTable` | `groups: {id, label, rows: Position[]}[]`, `copy: PositionsTableCopy`, `total?`, `loading?`; `Position = {id, name, code, quantity, price?, value, action?}` | Swissquote-statement table: uppercase group rows, 56 px rows, hairlines, right-aligned tabular numbers, action slot, total footer. Below 560 px of container width (container query, Phase C) each position collapses to two lines (name \| value, code \| quantity) with the action on its own line; never scrolls the page |
| `WebShell` | `copy: WebShellCopy`, `nav: {label, href, current?}[]`, `client?`, `account?`, `onSignOut?`, `linkAs?` (e.g. `next/link`), `children` | simulated Swissquote web: 32 px strip `Prototype of Swissquote web — simulated` + the one `SIMULATED` chip for the whole area; 64 px header: text wordmark, nav (active = ink underline), client + account right. Renders `<main>`. |
| `HandoffTile` | `state: idle\|starting\|waiting\|expired\|claimed\|protected`, `copy: HandoffTileCopy`, `code?`, `qrValue?`, `expiresAt?` (epoch ms), `onStart?`, `onRenew?`, `onExpire?`, `registered?: 0–3`, `children?` (protected) | true object; 64 px ring (empty → registering mirrors the phone → protected); QR (`QrCode`) + code in two mono groups (`482 137`, read digit by digit) + `Code expires in m:ss` (ticks each second, `onExpire` once) |
| `ConfirmPrompt` | `state: ask\|confirming\|error\|done\|already`, `copy: ConfirmPromptCopy`, `onConfirm`, `onDecline?` | the laptop's one-confirmation panel: key mark, can / can't lists, one primary (`ActionButton`, loading in `confirming`), quiet `Not now` |
| `TravelRuleLine` | `text?` (default `TRAVEL_RULE_OWN_WALLET`) | shield icon in `--ok` + sentence, 14 px ink-2 |
| `BitcoinPolicyDiagram` | `copy: BitcoinPolicyCopy` | Fluid SVG (Phase C): viewBox 358 × 248 (true size on a phone), `width: 100%`, max 400 px, never clips; tick labels start at their tick and `time` sits above the arrow, so FR/DE labels cannot collide: branch 1 `Your key, now` / `pk(owner)` solid from now; `or`; branch 2 `After the waiting period: 2 of 3 recoverers`, ring glyph, `and(older(waiting), thresh(2, …))`, dashed until the waiting period ends then solid; time axis. Tokens only, no gradients; `<title>` + `<desc>` |
| helpers | `splitCode6`, `formatCode6`, `spokenCode6`, `expiryClock` | pure, tested (`handoff.test.ts`) |

## 11. Screen inventory v2 (Phase B builds from this)

**Phase B: where a row below disagrees with Appendix V2, Appendix V2 wins** (notably: no `Top up` on home (D1, D4 removed); A3 uses the human's verbatim text; A5 says *computer*; F6 uses `BitcoinPolicyDiagram`).

`[P]` = the one primary. `SIM` = carries the `SIMULATED` chip. Device: Phone (390 px) or Laptop. EN titles and primary actions are final; body copy marked *draft* is for review. Every screen also has the three global states — **loading** (skeleton in the content's exact shape, cross-fades in), **error** (`Something didn’t work` / screen-specific sentence / `Try again`), **offline bank** (`Swissquote isn’t reachable` / `Your keys and your money are unaffected…`) — not repeated below. Screens marked *v1* keep their v1 spec (Appendix V1 §10) and only take the v2 primitives, theme and motion.

### A. Swissquote web — Laptop, whole area `SIM` (chip in the address bar)

| # | Screen | States | Title · [P] · key copy |
|---|---|---|---|
| A1 | Sign in | default · wrong password · loading | `Sign in to Swissquote` · [P] `Sign in` · error `That doesn’t match our records.` · note `Swissquote web is simulated for the prototype.` |
| A2 | Portfolio | default (Keyline not set up) · handoff (QR + code) · code expired · phone connected · Keyline protected (tile shows 64 px ring closed + wallet balance) | `Portfolio` · `Valuation 10 Oct 2026, 17:30` SIM · columns `Position · Quantity · Price · Value` · groups `Cash · Securities · Crypto` · tile eyebrow `Keyline`, title `A wallet only you can spend from`, body `Your phone holds the key. Any 2 of your 3 recoverers can restore access: your Safety key, your Emergency card and Swissquote. Swissquote can’t move your money, alone or with anyone.` · [P] `Set up Keyline on my phone` → `Scan with your phone’s camera, or open keyline.app/start and type this code:` `482 137` · `Code expires in 4:52` · `Waiting for your phone` · expired: `Code expired` + `Show a new code` |
| A3 | “Why?” sheet (BTC) | open | `Why can’t I move Bitcoin?` · the human's text, verbatim, in Appendix V2 `btcWhy` · `BitcoinPolicyDiagram` · link `Roadmap: Bitcoin` |
| A4 | Move to Keyline (ETH, USDC, EURC rows) | amount · review · moving · moved · policy refused | `Move ETH to Keyline` · `Amount` · `From Swissquote account · To your Keyline wallet (verified as yours)` · [P] `Move to Keyline` · done `Moved. It appears in Keyline within a minute.` · BTC row: action disabled + `Why?` |
| A5 | This computer becomes your Safety key | ask · confirming · error · done · already (`ConfirmPrompt`) | `Make this computer your Safety key?` · [P] `Make this computer my Safety key` · copy: Appendix V2 `sqSafetyKeyCopy` |

### B. Handoff — Phone

| # | Screen | States | Title · [P] · key copy |
|---|---|---|---|
| B1 | `/start` | scanned (code prefilled) · type code · wrong code · expired · matched | `Continue on your phone` · `Type the 6-digit code shown on your laptop.` · [P] `Continue` · `That code doesn’t match. Check your laptop and try again.` · `Code expired. Show a new one on your laptop.` |

### C. Onboarding — Phone (stepper `Step n of 6`)

| # | Screen | States | Title · [P] · key copy |
|---|---|---|---|
| C1 | Hi Lea | default | `Hi Lea` · *draft* `Keyline is a wallet only you can spend from. Swissquote helps you get back in if you lose your phone — it can’t move your money.` · [P] `Create my Keyline` |
| C2 | Create your key (1/6) | idle · prompt open · cancelled · unsupported | `A key that stays on this phone` · [P] `Create with Face ID / fingerprint` · v1 errors |
| C3 | Safety key (2/6) | waiting for laptop · confirmed (via A5) · skipped | `Your laptop becomes your Safety key` · `Confirm on your laptop. Nothing to type.` · [P] `Continue` (enabled when confirmed) · ghost `Skip for now — add it later` |
| C4 | Emergency card (3/6) | card · print · confirm sheet · stored | *v1* · [P] `I stored it` · sheet `Have you really stored it?` |
| C5 | How recovery works (4/6) | default · assisted (greyed, SIM) | *v1* `Who can help you back in` · [P] `Continue` |
| C6 | **Protect (5/6)** | idle · signing · sent · arc 1 · arc 2 · arc 3 · protected · error | `One signature protects your wallet` → `Protected` · body `Your wallet is created on Base and your three recoverers are written into it. Swissquote pays the network fee.` → `Your phone key signs. Any 2 of your 3 recoverers can restore access. Swissquote can’t move your money, alone or with anyone.` · rows `Waiting · Adding · Added` · [P] `Protect my wallet` → `Continue` · `Network fee paid by Swissquote` → `In block 6’812’334` · error `The wallet wasn’t created` / `Nothing was charged. The network didn’t accept the request — try again.` |
| C7 | Prove ownership (6/6) | idle · signing · done | *v1* · [P] `Sign the proof` → `Go to my wallet` |

### D. Home and money — Phone

| # | Screen | States | Title · [P] · key copy |
|---|---|---|---|
| D1 | Home | default · empty statement · amount changing (ticker) · alert banner · no key on this device · not yet protected | header `Keyline` + 24 px ring `Protected` (→ Security) + settings · `Balance` · `CHF 96.00` · `120.00 USDC` · `1 USDC = CHF 0.80` SIM · per-asset `AssetRow`s (USDC, EURC, ETH) · [P] `Send` · `Receive` · `Back to Swissquote` · `Statement` / `All` · section `In your Swissquote account` SIM (read-only rows, `Open`) · `Test network · Base Sepolia — nothing here is real money.` |
| D2 | Protection sheet (tap the ring) | protected · counting (recovery running) | `Protected · 2 of 3 recoverers` · 64 px ring · three recoverer rows · link `Security` |
| D3 | Receive (sheet) | default · copied | `Receive` · QR + `Address` · `Only send USDC on Base Sepolia to this address.` |
| D4 | ~~Top up~~ | removed (DECISIONS #26.6) | money comes in via `Move to Keyline` on Swissquote web |
| D5 | Back to Swissquote | amount · review · sent | `Back to Swissquote` · *draft* `Sends to your own Swissquote account, verified as yours.` · [P] `Review` |
| D6 | Send | recipient · amount · new address · errors | *v1* · [P] `Review` |
| D7 | **Review** | ok · step-up · cooling · block · dApp danger · loading · success | `Review` · `CHF 20.00` · `25.00 USDC to Lukas Meier` · `Approved · Within your CHF 1’000 daily limit.` · panel `What will happen` · `This can’t be undone.` · [P] `Confirm with Face ID` (success morph → D8) · v1 verdict strings |
| D8 | Receipt | confirmed · pending · failed | `Transfer` · 64 px ring `success` · `Sent` · `−25.00 USDC` · `CHF 20.00 to Lukas Meier` · `Signed · Sent · In block 6’812’334 · Confirmed` · [P] `Done` |
| D9 | Activity | list · empty | `Activity` · `Nothing yet` / `Your first top-up will appear here.` |
| D10 | Activity detail | *v1* | `Transfer` |
| D11 | Approve (laptop) | request · approved · refused · empty | *v1* `Approve CHF 2’000.00 to Lukas Meier?` · [P] `Approve with Safety key` |

### E. Contacts, apps — Phone

| # | Screen | States | Title · [P] · key copy |
|---|---|---|---|
| E1 | Contacts | list · empty | `Contacts` · rows with `Verified` (ok) or `New` · empty `No contacts yet` / `People you send to appear here.` |
| E2 | Add contact | form · invalid address · saved | `Add a contact` · `Name` · `Base address` · [P] `Save contact` · `This doesn’t look like a Base address.` |
| E3 | Apps | *v1* | `Apps` |

### F. Security — Phone

| # | Screen | States | Title · [P] · key copy |
|---|---|---|---|
| F1 | Security centre | protected · recovery running · not protected | `Security` · 64 px ring + `Protected · 2 of 3 recoverers` · *v1* sections |
| F2 | Recoverer detail (stack) | active · pending · removed | `Safety key` · `On your laptop` · what it can / cannot do |
| F3 | Prove this wallet is yours (sheet) | *v1* | [P] `Create proof` |
| F4 | Export Safety key (sheet, laptop) | *v1* | [P] `Download encrypted file` |
| F5 | If Swissquote disappears (sheet) | *v1* | — |
| F6 | Roadmap: Bitcoin | default | `Roadmap: Bitcoin` · *draft* `Bitcoin can be protected the same way with a script: your phone key spends; after a waiting period, 2 of your 3 recoverers can move it to a new key.` · diagram (small, hairline, mono): `spend: phone key` · `or after 72 h: 2-of-3 (Safety key, Emergency card, Swissquote)` · `Not in this prototype.` |

### G. Recovery — Phone (new phone, stepper `Step n of 5`)

| # | Screen | States | Title · [P] · key copy |
|---|---|---|---|
| G1 | Email | *v1* | `Let’s get you back in` · [P] `Send code` |
| G2 | Identity | *v1*, SIM | `Confirm it’s you` · [P] `Submit identity check` |
| G3 | New key | *v1* | `Create a key on this phone` |
| G4 | Recoverers | waiting · one confirmed · two confirmed | `Waiting for a second recoverer` · 200 px ring `counting` without stroke, arcs lit as confirmed |
| G5 | **Waiting period** | counting · last second (pulse) · period over · cancelled by owner | `Access restores at 14:35:12` · 200 px `ProtectionCountdown` · `Waiting period accelerated for the demo: 3 min instead of 72 h.` · `During this period the previous owner can still cancel. If nobody cancels, this phone becomes the only key.` · rows `Confirmed 14:30:12` · link `Watch on Basescan` · over: `00:00` `Ready to finish` |
| G6 | Restored | done | `You’re back in, Lea` · ring `success` · [P] `Go to my wallet` |

### H. Alerts and refusal — Phone

| # | Screen | States | Title · [P] · key copy |
|---|---|---|---|
| H1 | Alerts | recovery started (120 px countdown) · period over · finalized · refused · empty | *v1* `Was this you?` · [P danger] `Cancel recovery — it wasn’t me` → after cancel ring `revoked` + `Recovery cancelled. Your phone remains the only key.` (+ refusal vibration on the fraudster's device) |
| H2 | Refused (thief) | default | *v1* `Recovery can’t start` |

### I. Settings and help — Phone

| # | Screen | States | Title · [P] · key copy |
|---|---|---|---|
| I1 | Settings | default | `Settings` · rows `Currency` (`CHF · EUR · USD`), `Language` (`English · Français · Deutsch`), `Appearance` (`System · Light · Dark`) · `Help` · `Security` |
| I2 | Help 1/3 | default | `How is my money protected?` · *draft* `Only your phone can spend. Its key never leaves it, and Swissquote never holds it.` · [P] `Next` |
| I3 | Help 2/3 | default | `If you lose your phone` · *draft* `Any 2 of your 3 recoverers can move access to a new phone, after a waiting period you can see and cancel.` · ring with three arcs labelled · [P] `Next` |
| I4 | Help 3/3 | default | `What Swissquote can’t do` · *draft* `Swissquote is one of your three recoverers. It can’t act alone, can’t move your money, and you can leave without it.` · [P] `Done` |

### J. Desk and stand-ins — Laptop

| # | Screen | States | Notes |
|---|---|---|---|
| J1 | Desk sign-in | *v1*, SIM | — |
| J2 | Desk queue + request detail | *v1* | on-chain timer becomes the 64 px `ProtectionCountdown` |
| J3 | Desk audit log | *v1* | — |
| J4 | `/mock/inbox` | *v1*, SIM | — |
| J5 | `/mock/eid` | *v1*, SIM | — |

Count: 50 screens, ≈ 150 states including the global loading / error / offline states.

## 12. Review checklist v2

- One primary per screen; verb phrase; 48 px; `ActionButton` when async.
- Accent only on focus, the active step and the ring; links in ink, underlined (`.kl-link`, `.kl2-link`, `.kl2-textbtn`); in dark, danger is crimson, never orange.
- Lists use the 56 px row; card styling only on true objects.
- Every simulated group has one `Chip`; every status has icon + word; every waiting period shows its exact end time and the demo caption.
- Amount 44/48 tabular; titles balanced; text ≤ 65 ch.
- Both themes checked; contrast script green; no hard-coded colour outside device drawings.
- Only the motions in §6; each has a reduced-motion fallback.
- No shadow except sheets; radii 6/10; no gradient, blur, purple, emoji, stock imagery.
- Focus visible; targets ≥ 44 px; nothing clipped or horizontally scrolling at 390 px.

## 13. WalletConnect (SPEC §11, VERIFIED §20) — screens, primitives, copy

Keyline as the wallet for any EVM dApp. Every request goes through the same review → sponsor → passkey path as an in-app transfer, so every sheet is a **RequestSheet**: the app's identity on top (who is asking), the request in plain words, one primary, `Not now`. Nothing here may look bolted on: same type scale, same 56 px statement grid, same ring for success, same chip weight. All states on `/design/wc` (light / dark switch at the top).

### 13.1 Primitives (`packages/ui/src/v2/wc/`, styles in `v2.css`)

| Primitive | Props | Notes |
|---|---|---|
| `DappIdentityRow` | `name`, `url`, `iconUrl?`, `verification: verified\|unverified\|flagged`, `copy?`, `badge?` (inline after the name, e.g. the `SIMULATED` chip), `trailing?`, `compact?` (one line each for name and meta at 390 px) | 40 px icon (radius 10; 32 px / radius 6 compact) with a **monogram fallback** (first letter on surface-2) when there is no icon or it fails, even before hydration; name 16/600; **domain = URL host in mono 12** (the part the person can check); verification chip = icon + word, 1 px status border, no fill: `Verified domain` ok + SealCheck · `Unverified` pending + Question · `Flagged` danger + ShieldWarning. Helpers `dappHost`, `dappMonogram`. |
| `DappPermissionsList` | `copy?` | `This app will be able to:` + three check lines; under a hairline, the ok shield line `It can never move money without your approval.` |
| `RequestSheet` | `open`, `onClose`, `title`, `dapp`, `state: review\|pending\|success\|error\|expired\|refused`, `children`, `primaryLabel?`, `primaryVariant?: primary\|danger`, `primaryDisabled?`, `onApprove?`, `onDecline`, `pendingLine?`, `successTitle?`, `successBody?`, `successAnnounce?`, `errorTitle?`, `errorBody?`, `secondaryAction?`, `copy?` | SheetV2 (contained). **review**: content + `[P]` + `Not now`. **pending**: primary loading (label stays), content at .6, `pendingLine` under it (`Signed · Sent · Waiting for the block`), `Not now` disabled. **success**: the receipt treatment — 64 px ring `success` (closed `--ok`) + drawn check, word + one line, `Close`. **error**: danger note (what did and didn't happen), primary becomes `Try again`. **expired** (Clock in a 64 px hairline circle) and **refused** (chain switch, unsupported method, flagged app, SIWE domain mismatch, policy block): one `Close`. |
| `SiweSummary` | `domain`, `address`, `expiresAt?`, `issuedAt?`, `statement?`, `network?`, `nonce?`, `uri?`, `appHost?`, `copy?` | `Sign in to <domain>` (20/600) · `as 0x12AB … 9F3C` (Address) · `Valid until …` · ok shield `This does not move money.` · fields on the statement grid. If `appHost` ≠ `domain` the shield becomes a danger line and the sheet is **refused** (Keyline never signs a sign-in for another site). |
| `MessageBlock` | `text?`, `hex`, `copy?`, `noMoney?` | readable text in a 10 px object (pre-wrap, max 240 px, scrolls); non-text bytes → pending-bordered `This message isn’t readable text…`; optional ok shield line; hex only under `Technical details`. |
| `TypedDataRows` + `typedDataRows(data, copy?, { formatTime? })` | `rows`, `title?`, `domain?`, `addressLabels?` | EIP-712 flattened in type order (pure, tested): nested structs as uppercase group headers indented 16 px per level; addresses as `Address` (compact, expandable); unix deadlines formatted; **2^256−1 / 2^160−1 amounts → `Unlimited`, max-uint48 expirations → `Never`, both `danger` with their reason under the row**. |
| `ConnectPanel` | `state: idle\|invalid\|scanning\|camera-denied\|pairing\|expired`, `value`, `onChange`, `onConnect`, `onPaste?`, `onScan?`, `onStopScan?`, `scanner?`, `copy?` | title 28, one line of how-to, mono `wc:` field, `Paste` + `Scan QR code` as equal secondaries, `[P] Connect` (ActionButton; loading `Connecting…` + `Waiting for the app to answer…`). Camera refused = warn note pointing back to pasting (never a dead end). Invalid / expired = field error. |
| `InboxBadge` | `count`, `label` | ink pill, 20 px, tabular; nothing at 0, `9+` above 9; `label` is the screen-reader sentence. Not accent (accent = focus, active, ring). |

### 13.2 Screens

| # | Screen | Built from | Rules |
|---|---|---|---|
| W1 | **Connect** `/dapps/connect` (also `/wc?uri=` → pre-filled, pairs at once) | `StackView` (title `Connect an app`) + `ConnectPanel` | primary docked; camera denied → note + field; pairing → loading; on proposal the **W2 sheet** opens over it. |
| W2 | **Connection request** | `RequestSheet` title `Connect to this app?` + `DappPermissionsList` + `Panel` (Network `Base Sepolia (test network)`, Wallet `0x12AB…9F3C`) | verified → `[P] Connect` / `Not now`; unverified → warn note above the permissions, same buttons; **flagged / INVALID / isScam / origin ≠ url → `refused`: danger note, no Connect**; success `Connected` + `{app} can now see your address…`. |
| W3 | **Connected apps** (list) `/dapps` | `StackView` + `DappIdentityRow compact` rows (56 px, chevron) with meta `Connected 11 Oct, 14:32`; header count in Security row | empty: `No apps connected` + `Connect an app` button; `InboxBadge` on the Apps tab while requests wait. |
| W4 | **Connected app** (detail) | `DappIdentityRow` · `What it can do` (`DappPermissionsList`) · Network · Last request · `Activity from this app` (StatementRows, the same rows as Home) · `Disconnect` (`kl-btn--danger-text`) → confirm sheet with `ActionButton variant="danger"` | after disconnect: back to the list, toast `{app} disconnected`. |
| W5 | **Transaction** (`eth_sendTransaction`) | `RequestSheet` title `Approve a transaction`: PolicyLine (incl. `First time with this app`) + the `/send/review` Panel (`What will happen`) | `[P] Approve with Face ID`; pending line follows the real steps; success `Sent` / `The app has the result.` (the dApp gets the bundle hash ≈ 4 s after send, VERIFIED §20.3); policy block → `refused` with the PolicyLine and the block sentence. |
| W6 | **Batch** (`wallet_sendCalls`) | same, title `Approve several actions`, lead `{n} actions, approved together. Either all happen or none.`, one Panel per action (`Action 1`…) | `[P] Approve all with Face ID`. |
| W7 | **Sign-in** (SIWE `personal_sign`) | `SiweSummary` | `[P] Sign in with Face ID`; domain mismatch → `refused`; success `Signed in` / `The app has your signature. No money moved.` |
| W8 | **Message** (`personal_sign`, not SIWE) | `MessageBlock` with `noMoney` | `[P] Sign with Face ID`; unreadable bytes → pending-bordered sentence, same buttons. |
| W9 | **Typed data** (`eth_signTypedData_v4`) | `TypedDataRows` (title = primary type, domain line `name · network · contract`) | `[P] Sign with Face ID`. **Permit / Permit2 with an unlimited or never-expiring value**: title `Let another address spend your tokens`, block PolicyLine `Unlimited · {spender} will be able to move these tokens without asking you again.`, primary `Sign anyway` (`primaryVariant="danger"`). |
| W10 | **EOA-only permit** (`permit(v,r,s)` / DAI-style, VERIFIED §20.2) | `RequestSheet` title `This signature isn’t possible`, body sentence + meta `You’ll review an approval transaction instead…` | no sign button: `secondaryAction` = primary `Approve with a transaction instead` (opens W5 with the `approve` call) + `Not now` (answers `USER_REJECTED`). |
| W11 | **Chain-switch refusal** (`wallet_switchEthereumChain` ≠ 84532) | `refused` | `Network not available` + sentence naming the network; `Close`. |
| W12 | **Unsupported method** (`eth_sign`, `eth_signTransaction`, other) | `refused` | `Request not supported` + sentence quoting the method; `Close`. |
| W13 | **Inbox** | `InboxBadge` on the Apps tab; `/alerts` item: `DappIdentityRow compact` + title `{app} is waiting for you` + meta `Transaction to approve · 14:32` + `Review` | opening resumes the exact sheet; past WalletConnect expiry the item reads `Expired` (ink-3 + Clock) and opening it shows the **expired** sheet — never dropped silently. |
| W14 | **Expired** | `RequestSheet state="expired"` | `This request expired` / `The app stopped waiting. Nothing was signed or sent. Ask the app to try again.` |
| W15 | **Security row** | `StatementRow` `Connected apps` · meta `2 apps` · chevron → W3 | dApp events appear in the Security event log with the app name. |

Motion: only M2 (sheet), M5–M8 (button), M13 (success ring), M1 (StackView between list and detail). Nothing else animates.

### 13.3 Copy (EN, keyed for `copy.ts` as `copyWc`; the wallet adds FR/DE with the same keys)

Source of truth: `apps/wallet/app/design/wc/copy.ts` (the `/design/wc` page renders from it). Functions take already-formatted values (`formatDateTime`, `formatShortDateTime`, the app name, the host).

```ts
export const copyWc = {
  nav: { apps: 'Apps', connect: 'Connect an app', connectedApps: 'Connected apps' },

  connect: {
    title: 'Connect to an app',
    body: 'On the app’s website choose WalletConnect, then copy its link or show its QR code.',
    fieldLabel: 'WalletConnect link',
    placeholder: 'wc:…',
    paste: 'Paste',
    scan: 'Scan QR code',
    stopScan: 'Stop scanning',
    connect: 'Connect',
    connecting: 'Connecting…',
    pairingLine: 'Waiting for the app to answer…',
    invalid: 'This isn’t a WalletConnect link. It starts with wc:',
    scanHint: 'Point the camera at the app’s QR code.',
    cameraDeniedTitle: 'Camera access is off',
    cameraDeniedBody: 'Paste the link instead, or allow the camera for this site in your browser settings.',
    expired: 'This link has expired. Ask the app for a new one.',
  },

  identity: { verified: 'Verified domain', unverified: 'Unverified', flagged: 'Flagged' },

  proposal: {
    title: 'Connect to this app?',
    permissions: {
      title: 'This app will be able to:',
      items: ['See your address', 'Ask you to approve transactions', 'Ask you to sign messages'],
      never: 'It can never move money without your approval.',
    },
    network: 'Network',
    networkValue: 'Base Sepolia (test network)',
    account: 'Wallet',
    unverifiedNote: 'Keyline couldn’t confirm this app’s website. Connect only if you opened it yourself.',
    flaggedTitle: 'This app’s identity could not be verified',
    flaggedBody:
      'Its website doesn’t match what it claims, or it is on a list of known scams. Keyline won’t connect to it.',
    connect: 'Connect',
    decline: 'Not now',
    close: 'Close',
    connectedTitle: 'Connected',
    connectedBody: (app: string) => `${app} can now see your address and send you requests.`,
    errorTitle: 'Not connected',
    errorBody: 'The app didn’t answer. Nothing was shared. Try again from the app.',
  },

  apps: {
    title: 'Connected apps',
    empty: 'No apps connected',
    emptyBody: 'Connect to an app from its website with WalletConnect.',
    connectedSince: (date: string) => `Connected ${date}`,
    count: (n: number) => (n === 1 ? '1 app' : `${n} apps`),
    disconnect: 'Disconnect',
    disconnectTitle: (app: string) => `Disconnect ${app}?`,
    disconnectBody:
      'The app can no longer see your address or send you requests. Past transfers stay in your statement.',
    disconnectYes: 'Disconnect',
    keep: 'Keep',
    disconnected: (app: string) => `${app} disconnected`,
    activity: 'Activity from this app',
    activityEmpty: 'Nothing yet.',
    permissionsTitle: 'What it can do',
    network: 'Network',
    lastRequest: 'Last request',
  },

  request: {
    decline: 'Not now',
    close: 'Close',
    retry: 'Try again',
    expiredTitle: 'This request expired',
    expiredBody: 'The app stopped waiting. Nothing was signed or sent. Ask the app to try again.',
    declinedToast: 'Declined. The app was told.',

    tx: {
      title: 'Approve a transaction',
      approve: 'Approve with Face ID',
      pendingLine: (step: string) => step,
      steps: {
        signed: 'Signed',
        sent: 'Sent',
        waiting: 'Waiting for the block',
        included: (block: string) => `In block ${block}`,
      },
      successTitle: 'Sent',
      successBody: 'The app has the result.',
      announce: 'Sent',
      errorTitle: 'Not sent',
      errorBody: 'Nothing left your wallet. The app was told.',
      firstTime: 'First time with this app',
    },
    batch: {
      title: 'Approve several actions',
      lead: (n: number) => `${n} actions, approved together. Either all happen or none.`,
      item: (i: number) => `Action ${i}`,
      approve: 'Approve all with Face ID',
    },
    signIn: {
      title: 'Sign in',
      approve: 'Sign in with Face ID',
      siwe: {
        title: (domain: string) => `Sign in to ${domain}`,
        as: 'as',
        validUntil: (time: string) => `Valid until ${time}`,
        noMoney: 'This does not move money.',
        mismatch: (domain: string, appHost: string) =>
          `This sign-in is for ${domain}, not for the app that asked (${appHost}). Don’t sign it.`,
        fields: {
          statement: 'Statement',
          domain: 'Domain',
          address: 'Address',
          network: 'Network',
          issued: 'Issued',
          expires: 'Expires',
          nonce: 'Nonce',
          uri: 'URI',
        },
      },
      successTitle: 'Signed in',
      successBody: 'The app has your signature. No money moved.',
      announce: 'Signed in',
    },
    message: {
      title: 'Sign a message',
      approve: 'Sign with Face ID',
      block: {
        title: 'Message',
        technical: 'Technical details',
        hexLabel: 'Raw message (hex)',
        unreadable: 'This message isn’t readable text. Only sign it if you know what it is for.',
      },
      noMoney: 'Signing a message does not move money.',
      successTitle: 'Signed',
      successBody: 'The app has your signature.',
      announce: 'Signed',
    },
    typed: {
      title: 'Sign structured data',
      approve: 'Sign with Face ID',
      domain: (name: string, network: string, contract: string) => `${name} · ${network} · ${contract}`,
      rows: {
        unlimited: 'Unlimited',
        unlimitedNote: 'No limit — the spender can take all of it, now and later.',
        never: 'Never',
        neverNote: 'This permission never expires.',
      },
      permitTitle: 'Let another address spend your tokens',
      permitBody: (spender: string) =>
        `${spender} will be able to move these tokens without asking you again.`,
      approveDanger: 'Sign anyway',
      successTitle: 'Signed',
      successBody: 'The app has your signature.',
      announce: 'Signed',
    },
    eoaOnly: {
      title: 'This signature isn’t possible',
      body: 'This token only accepts signatures from a single private key. Your Keyline is a smart account protected by 2 of 3 recoverers, so it can’t produce that kind of signature.',
      alternative: 'Approve with a transaction instead',
      alternativeBody: 'You’ll review an approval transaction instead. Swissquote pays the network fee.',
      decline: 'Not now',
    },
    chainSwitch: {
      title: 'Network not available',
      body: (network: string) =>
        `The app asked to switch to ${network}. This Keyline works on Base Sepolia only. The app was told; you can keep using it on Base Sepolia.`,
    },
    unsupported: {
      title: 'Request not supported',
      body: (method: string) =>
        `The app asked for “${method}”, which Keyline never does: it could sign something you can’t read. Nothing was signed. The app was told.`,
    },
    blocked: {
      title: 'Blocked by your limits',
      body: (reason: string) => `${reason} Nothing was signed or sent. The app was told.`,
    },
  },

  inbox: {
    badge: (n: number) => (n === 1 ? '1 request waiting' : `${n} requests waiting`),
    alertTitle: (app: string) => `${app} is waiting for you`,
    alertBody: (what: string) => `${what}. Open it to review.`,
    open: 'Review',
    expired: 'Expired',
    expiredBody: 'The app stopped waiting. Nothing was signed or sent.',
    kinds: {
      tx: 'Transaction to approve',
      batch: 'Actions to approve',
      signIn: 'Sign-in request',
      message: 'Message to sign',
      typed: 'Data to sign',
    },
  },

  security: { row: 'Connected apps', rowMeta: (n: number) => (n === 1 ? '1 app' : `${n} apps`) },
} as const;
```

---

# Appendix V2 — journey copy (Phase B, keyed for `apps/wallet/src/copy.ts`)

EN only; FR/DE come in Phase C, so every string is whole (no fragments glued together except formatted values passed into functions). This block **supersedes** `copyV2` and closes `copyGapsV2` in `apps/wallet/src/copy.ts` (the wallet-client's gap strings were reviewed: kept as written unless changed below). The five primitive objects (`sqWebShell`, `sqPositionsCopy`, `sqTileCopy`, `sqSafetyKeyCopy`, `btcPolicyCopy`) are typed by `@keyline/ui` (`WebShellCopy`, `PositionsTableCopy`, `HandoffTileCopy`, `ConfirmPromptCopy`, `BitcoinPolicyCopy`) and are mirrored verbatim in `apps/wallet/app/design/copy.ts`.

Changes from the Phase A inventory (§11): the BTC "Why?" text is the human's, verbatim; the laptop prompt says *computer* (`Make this computer your Safety key?`); `The old pairing code no longer works` is gone (`/pair` redirects); home has no `Top up` (DECISIONS #26.6); Roadmap: Bitcoin uses `BitcoinPolicyDiagram`.

```ts
import type {
  BitcoinPolicyCopy, ConfirmPromptCopy, HandoffTileCopy, PositionsTableCopy, WebShellCopy,
} from '@keyline/ui';
import { TRAVEL_RULE_OWN_WALLET } from '@keyline/ui'; // 'No ownership check needed: this wallet is verified as yours.'

// ---------- primitive copy (typed by @keyline/ui) ----------
export const sqWebShell: WebShellCopy = {
  brand: 'Swissquote',
  prototype: 'Prototype of Swissquote web — simulated',
  navLabel: 'Swissquote',
  signOut: 'Sign out',
};

export const sqPositionsCopy: PositionsTableCopy = {
  caption: 'Positions',
  position: 'Position',
  quantity: 'Quantity',
  price: 'Price',
  value: 'Value',
  action: 'Keyline',
  total: 'Total value',
};

export const sqTileCopy: HandoffTileCopy = {
  eyebrow: 'Keyline',
  title: 'A wallet only you can spend from',
  body: 'Your phone holds the key. Any 2 of your 3 recoverers can restore access: your Safety key, your Emergency card and Swissquote. Swissquote can’t move your money, alone or with anyone.',
  start: 'Set up Keyline on my phone',
  scan: 'Scan with your phone’s camera, or open keyline.app/start and type this code:',
  qrLabel: 'QR code to continue on your phone',
  expiresIn: (clock: string) => `Code expires in ${clock}`,
  waiting: 'Waiting for your phone',
  expired: 'Code expired',
  renew: 'Show a new code',
  claimed: 'Phone connected',
  claimedBody: 'Continue on your phone. This page updates by itself.',
  protectedTitle: 'Protected · 2 of 3 recoverers',
};

export const sqSafetyKeyCopy: ConfirmPromptCopy = {
  context: 'Request from your phone',
  title: 'Make this computer your Safety key?',
  body: 'Your phone is setting up Keyline. This computer keeps a second key in this browser. It co-approves large transfers and can help restore access if you lose your phone.',
  canTitle: 'It can',
  can: ['Approve large transfers with your phone', 'Help restore access, with one other recoverer'],
  cannotTitle: 'It can’t',
  cannot: ['Spend on its own', 'Be used from another computer'],
  confirm: 'Make this computer my Safety key',
  decline: 'Not now',
  confirmed: 'Safety key added',
  doneTitle: 'This computer is your Safety key',
  doneBody: 'Continue on your phone. Keep this browser profile: clearing its data removes the key.',
  alreadyTitle: 'This computer is already your Safety key',
  alreadyBody: 'Nothing to do here. Continue on your phone.',
  errorTitle: 'The Safety key wasn’t added.',
  errorBody: 'Nothing changed on your wallet. Try again.',
  retry: 'Try again',
};

export const btcPolicyCopy: BitcoinPolicyCopy = {
  title: 'The same protection, written as a Bitcoin script',
  description:
    'Two ways to spend. Your key can spend at any time. After the waiting period, any 2 of your 3 recoverers (Safety key, Emergency card, Swissquote) can move the Bitcoin to a new key.',
  branch1: 'Your key, now',
  branch1Code: 'pk(owner)',
  or: 'or',
  branch2: 'After the waiting period:',
  branch2Count: '2 of 3 recoverers',
  recoverers: 'Safety key · Emergency card · Swissquote',
  branch2Code: 'and(older(waiting), thresh(2, …))',
  axisNow: 'Now',
  axisWait: 'Waiting period ends',
  axisTime: 'time',
};

// ---------- screens ----------
export const copyV2 = {
  sqWeb: {
    nav: { portfolio: 'Portfolio', trade: 'Trade', payments: 'Payments', documents: 'Documents' },
    account: (n: string) => `Account ${n}`, // 'Account 4821 3307'
    signIn: {
      title: 'Sign in to Swissquote',
      lead: 'Lea’s details are filled in for the prototype. One click signs in.',
      username: 'Username',
      usernameValue: 'lea.keller',
      password: 'Password',
      primary: 'Sign in',
      error: 'That doesn’t match our records.',
      note: 'Swissquote web is simulated for the prototype.',
    },
    signedOut: 'You are signed out.',
    notAvailable: 'Not part of the prototype.', // Trade, Payments, Documents
    portfolio: {
      title: 'Portfolio',
      valuation: (when: string) => `Valuation ${when}`, // + <Chip/>
      cash: 'Cash',
      invested: 'Invested',
      total: 'Total value',
      groups: { cash: 'Cash', securities: 'Securities', crypto: 'Crypto' },
      chf: 'Swiss franc',
      move: 'Move to Keyline',
      moveAria: (asset: string) => `Move ${asset} to Keyline`,
      why: 'Why?',
      btcReason: 'Not movable yet',
    },
    tileProtected: {
      balance: 'In your Keyline wallet',
      note: 'Read from the network. Only your phone can spend it.',
    },
    move: {
      title: (asset: string) => `Move ${asset} to Keyline`,
      amount: 'Amount',
      max: 'Max',
      available: (qty: string) => `Available ${qty}`,
      value: (chf: string) => `Value ${chf}`, // + <Chip/> (simulated price)
      from: 'From',
      fromValue: 'Your Swissquote account',
      to: 'To',
      toValue: 'Your Keyline wallet · verified as yours',
      travelRule: TRAVEL_RULE_OWN_WALLET,
      fee: 'Network fee',
      feeValue: 'Paid by Swissquote',
      primary: 'Move to Keyline',
      moving: 'Moving to your Keyline wallet',
      done: 'Moved. It appears in Keyline within a minute.',
      viewTx: 'View on Basescan',
      errAmount: 'Enter an amount above zero, up to what is available.',
      funderEmpty:
        'Swissquote’s test account has no funds for this asset right now. Nothing was moved and nothing was debited.',
      noWallet: 'Set up Keyline on your phone first. Moves go only to a wallet verified as yours.',
      errorTitle: 'Nothing was moved',
      errorBody: 'The transfer didn’t go through and nothing was debited. Try again.',
    },
    moves: {
      title: 'Moves to Keyline',
      empty: 'No moves yet.',
      status: { pending: 'Pending', sent: 'Sent', confirmed: 'Confirmed', failed: 'Failed' },
    },
    approvals: 'Approvals',
  },

  // A3 — the human's text, verbatim. Shown on Swissquote web (sheet) and linked from Security.
  btcWhy: {
    title: 'Why can’t I move Bitcoin?',
    body: [
      'Keyline moves an asset only when it can give it the same protection: your key, two of three recoverers, a public waiting period. For Bitcoin that needs a different key design (a threshold key or a timelocked script), which is on our roadmap. Until then your Bitcoin stays in your Swissquote account.',
    ],
    link: 'Roadmap: Bitcoin',
    close: 'Close',
  },

  // B1 — /start on the phone
  start: {
    title: 'Continue on your phone',
    body: 'Type the 6-digit code shown on your laptop.',
    field: '6-digit code',
    scanned: 'Code from your laptop',
    primary: 'Continue',
    wrong: 'That code doesn’t match. Check your laptop and try again.',
    expired: 'Code expired. Show a new one on your laptop.',
    noHandoff: 'Start on Swissquote web on your laptop: choose “Set up Keyline on my phone”, then type the code here.',
  },

  onboarding: {
    stepper: (n: number, label: string) => `Step ${n} of 6 · ${label}`,
    hi: {
      title: (first: string) => `Hi ${first}`, // 'Hi Lea' — from the web session, no form
      body: 'Keyline is a wallet only you can spend from. Swissquote helps you get back in if you lose your phone — it can’t move your money.',
      signedInAs: (name: string, account: string) => `Connected to Swissquote as ${name} · ${account}`,
      primary: 'Create my Keyline',
    },
    key: { step: 'Create your key', title: 'A key that stays on this phone', primary: 'Create with Face ID / fingerprint' },
    safetyKey: {
      step: 'Safety key',
      title: 'Your laptop becomes your Safety key',
      body: 'Confirm on your laptop. Nothing to type.',
      waiting: 'Waiting for your laptop',
      confirmed: 'Confirmed on your laptop',
      primary: 'Continue',
      skip: 'Skip for now — add it later',
    },
    emergency: { step: 'Emergency card' },
    recovery: { step: 'How recovery works' },
    protect: {
      step: 'Protect my wallet',
      title: 'One signature protects your wallet',
      titleDone: 'Protected',
      body: 'Your wallet is created on Base and your three recoverers are written into it. Swissquote pays the network fee.',
      bodyDone:
        'Your phone key signs. Any 2 of your 3 recoverers can restore access. Swissquote can’t move your money, alone or with anyone.',
      rows: [
        { name: 'Safety key', where: 'On your laptop' },
        { name: 'Emergency card', where: 'On paper, with you' },
        { name: 'Swissquote', where: 'Swiss data centre' },
      ],
      ringSub: 'recoverers added',
      ringCount: (n: number) => `${n} of 3`,
      waiting: 'Waiting',
      adding: 'Adding',
      added: 'Added',
      primary: 'Protect my wallet',
      continue: 'Continue',
      fee: 'Network fee paid by Swissquote',
      signed: 'Signed',
      sent: 'Sent',
      block: (n: string) => `In block ${n}`,
      errorTitle: 'The wallet wasn’t created',
      errorBody: 'Nothing was charged. The network didn’t accept the request — try again.',
    },
    proof: { step: 'Prove it’s yours', primary: 'Sign the proof', next: 'Continue' },
    firstFunds: {
      title: 'Move your first funds',
      body: 'Open Swissquote on your laptop and choose “Move to Keyline” next to USDC, EURC or ETH. It arrives here within a minute.',
      waiting: 'Waiting for your first funds',
      arrived: (amount: string) => `${amount} arrived`,
      primary: 'Go to my wallet',
    },
  },

  // D1 — no "Top up": money comes in via Move to Keyline, goes out via Back to Swissquote.
  home: {
    protected: 'Protected',
    settings: 'Settings',
    balance: 'Balance',
    totalNote: 'Total in CHF', // + <Chip/> (simulated rates)
    assets: 'Assets',
    assetsEmpty: 'Nothing here yet. Move funds from Swissquote on your laptop.',
    send: 'Send',
    sendOnlyUsdc: 'Send works with USDC in this prototype.',
    receive: 'Receive',
    backToSq: 'Back to Swissquote',
    statement: 'Statement',
    all: 'All',
    sq: 'In your Swissquote account', // + <Chip/> once, at the header
    sqNote: 'Read only. Swissquote web is simulated.',
    sqOpen: 'Open Swissquote',
    protectionTitle: 'Protected · 2 of 3 recoverers',
    testnet: 'Test network · Base Sepolia — nothing here is real money.',
  },

  // D5 — Back to Swissquote → review → receipt. Always Tier 1.
  back: {
    title: 'Back to Swissquote',
    body: 'Sends to your own Swissquote account, verified as yours.',
    asset: 'Asset',
    amount: 'Amount',
    max: 'Max',
    available: (qty: string) => `Available ${qty}`,
    errAmount: 'Enter an amount above zero, up to what is available.',
    primary: 'Review',
    review: {
      title: 'Review',
      to: 'to your Swissquote account',
      recipient: 'Your Swissquote account · verified',
      policy: { word: 'Approved', reason: 'Your own account.' },
      travelRule: 'No ownership check needed: this account is verified as yours.',
      panel: 'What will happen',
      rows: { send: 'You send', to: 'To', fee: 'Network fee', feeValue: 'Paid by Swissquote', balance: 'Your balance' },
      footnote: 'This can’t be undone.',
      cta: 'Confirm with Face ID',
    },
    receipt: {
      title: 'Sent to Swissquote',
      line: (amount: string) => `${amount} to your Swissquote account`,
      steps: ['Signed', 'Sent', 'In block', 'Credited'],
      creditPending: 'Swissquote credits your account when the transfer is in a block.',
      credited: 'Credited to your Swissquote account', // + <Chip/> (simulated ledger)
      done: 'Done',
    },
  },

  // F6 — Security → Roadmap: Bitcoin
  security: {
    roadmapRow: 'Roadmap: Bitcoin',
    roadmapRowMeta: 'Not in this prototype',
    bitcoin: {
      title: 'Roadmap: Bitcoin',
      body: 'Bitcoin can be protected the same way with a script: your key spends at any time; after a public waiting period, 2 of your 3 recoverers can move it to a new key.',
      // diagram: <BitcoinPolicyDiagram copy={btcPolicyCopy} />
      why: 'Keyline moves an asset only when it can give it the same protection: your key, two of three recoverers, a public waiting period. For Bitcoin that needs a different key design (a threshold key or a timelocked script), which is on our roadmap. Until then your Bitcoin stays in your Swissquote account.',
      notHere: 'Not in this prototype.',
    },
  },

  theme: { legend: 'Appearance', system: 'System', light: 'Light', dark: 'Dark' },
} as const;
```


---

# Appendix V1 — the v1 specification (kept; superseded where marked)

Superseded by v2: **§3 Type** (tracking now −0.025em at 44, −0.015em at 28; headings balanced; 65 ch) · **§6 Motion** (whole section → v2 §6; the CountdownRing signature animation becomes the ring's `counting` state) · **§9 CountdownRing rules** (→ `ProtectionCountdown`; the finish-time-once rule still holds) · the **`SimulatedBadge`** look (→ `Chip`, v2 §7; the placement rule still holds) · **§2 accent usage for links** (v2 links are ink) · §11 checklist (→ v2 §12).

Still valid: §1 position, §2 light token values, §4 spacing, §5 shape and elevation, §7 icons, §8 primitive catalogue (v1 primitives are unchanged), §9 chrome and global loading/empty/error strings, **§10 screen-by-screen specs (source of truth for every screen marked *v1* in v2 §11)**, **Appendix A copy (still pasted into `apps/wallet/src/copy.ts`)**, Appendix B implementation notes.


## Keyline — Design specification (v1)

Owner: `design-system` agent. Engineers build screens **only** from the primitives in `packages/ui` and the copy in this file (Appendix A is pasted verbatim into `apps/wallet/src/copy.ts`). If a string is missing here, ask; do not invent it. If a screen disagrees with this file, this file wins until the orchestrator edits it.

### 1. Design position

A Swiss bank statement, not a crypto dashboard: International Typographic Style — strict grid, flush-left, one accent, hairlines instead of shadows, dense where it matters (amounts, status), quiet everywhere else.
Copy is plain, second person, specific and calm: it says what will happen, what it costs, and what cannot be undone. Nothing "unlocks", nothing is "seamless".
Every simulation is marked `SIMULATED`, every status has an icon **and** a word, every address can be read in full. Honesty is part of the aesthetic.

### 2. Tokens (`packages/ui/src/tokens.css`)

Ratios computed by `pnpm --filter @keyline/ui contrast` (WCAG 2.x). All text pairs ≥ 4.5:1; UI edges and large marks ≥ 3:1. 23/23 pass.

#### Surfaces and ink

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

#### Accent (Swissquote-adjacent orange-red; never body text)

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--accent` | `#FA5B35` | focus ring, active step dot, countdown ring, links on dark bars | 5.80:1 on ink (text) · 3.18:1 on surface (UI mark only) |
| `--accent-text` | `#C8371A` | links and accent words on light | 4.84:1 on bg · 5.23:1 on surface |

#### Status (always icon + word)

| Token | Hex | Tint | Contrast on bg / on tint |
|---|---|---|---|
| `--ok` | `#1F7A4D` | `--ok-bg #E8F3EC` | 4.92:1 / 4.67:1 |
| `--pending` | `#9A5B00` | `--pending-bg #FBF1E0` | 5.02:1 / 4.85:1 |
| `--danger` | `#B42318` | `--danger-bg #FBE9E7` | 6.08:1 / 5.61:1 |
| `--danger-bar` | `#B42318` | Thief device bar; white label | 6.57:1 |

#### Simulated (honest-mock marking)

| Token | Hex | Contrast |
|---|---|---|
| `--simulated-bg` | `#FFF4E5` | — |
| `--simulated-text` | `#7A4B00` | 6.82:1 on simulated-bg |
| `--simulated-border` | `#B07A1E` (1 px **dashed**) | 3.42:1 on simulated-bg |

Banned: purple/indigo/violet in any form, gradients, backdrop-blur, glows, any shadow outside `--shadow-modal`.

### 3. Type

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

### 4. Spacing and layout

4-pt base: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Phone content width 390 px with 16 px gutters (358 px usable). Desk: 12 columns, 24 px gutters, max 1200 px, centred. Vertical rhythm inside a phone screen: title block 24 px below the device bar, 24 px between sections, 12 px between rows inside a section, hairline (`--line`) between statement rows. Tap targets ≥ 44 px (buttons are 48 px, statement rows 56 px).

### 5. Shape and elevation

Radii: **6 px** (buttons, inputs, badges, status chips) · **10 px** (sheets, modals, the phone screen corners, cards that are real objects such as the Emergency card). Nothing else — no pills except the countdown ring which is a circle by nature.
Elevation: one level, `--shadow-modal: 0 8px 24px rgba(20,20,20,.12)`, modals and the Tier-2 laptop approval sheet only. Everything else is separated by 1 px `--line`.

### 6. Motion

120 ms (`--duration-fast`, hover/press) and 200 ms (`--duration-base`, sheet entry, status change), `cubic-bezier(.2,0,0,1)`. One signature animation: the recovery `CountdownRing` arc (CSS `stroke-dashoffset` transition, 1 s linear per tick — the only animation allowed above 300 ms, and it is a progress indicator, not decoration). `prefers-reduced-motion: reduce` sets both durations to 0 and the ring updates without tweening. No skeleton shimmer; skeletons are static `--surface-2` blocks.

### 7. Icons

Phosphor, **regular** weight, 20 px, `currentColor`, one set only. Icons never carry meaning alone: `ok` = `CheckCircle` + word, `pending` = `Clock`, `step-up` = `DeviceMobile` + `Laptop`, `cooling` = `Hourglass`, `block` = `Prohibit`, danger = `WarningCircle`, simulated = none (text badge), copy = `Copy`, external link = `ArrowSquareOut`, print = `Printer`, key = `Key`, card = `IdentificationCard`, bank = `Bank`. No emoji anywhere in UI.

### 8. Primitive catalogue (`@keyline/ui`)

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

### 9. Global chrome

#### DeviceBar (top of every client screen; also on the desk)
Full-width 28 px bar, `text-12` 600, letter-spacing 0.04em, white text. **Five personas, five tones** (Wave 2 audit): a judge must tell the bars apart from across the room. The persona label is for judges only — it is **never** sent to the bank as the device label (`getDeviceLabel()` returns a device-ish string such as `iPhone · new device`).

| Persona (`?device=`) | String | Bar |
|---|---|---|
| `lea-phone` | `Lea · phone` | `--ink` |
| `lea-laptop` | `Lea · laptop — Safety key` | `--laptop-bar` (= ink-2) |
| `lea-new-phone` | `Lea · new phone` | `--newphone-bar` (= ok green) |
| `thief` | `Thief · stolen phone` | `--danger-bar` (red) |
| `desk` | `Swissquote desk (simulated)` | `--ink` + 2 px `--accent` rule below |

#### TestnetStrip (bottom of Home and Security; top of desk content)
`Test network · Base Sepolia — nothing here is real money.` 12/16, `--ink-3`, hairline above, link `View on Basescan` (`ArrowSquareOut`).

#### SimulatedBadge
Label `SIMULATED`. Tooltip/`title`: `Mocked for the prototype — see README`. Placed inline after the thing it qualifies (never on its own line), e.g. `Identity check SIMULATED`.

#### Demo caption (anywhere a waiting period is shown)
`Waiting period accelerated for the demo: 3 min instead of 72 h.` — `text-12` `--ink-3`, below the ring or the timer.

#### CountdownRing rules (Wave 2)
The exact finish time appears **once** per screen: in the title when there is one (`Access restores at 14:35:12`, then `showFinish={false}`), otherwise in the ring's own `Finishes at` line. Finished state: centre `00:00`, sub-label `doneLabel` — `Ready to finish` on the new phone, `Period over` on the owner's alert; never `Done`/`Finished` (the *period* is over, not the recovery).

#### Loading / empty / error (every route)
- Loading: `Skeleton` in the exact shape of the content (balance block = `kind="amount"`, lists = 3 × `kind="row"`); never a lone spinner. Buttons that wait show `loading` with their label unchanged.
- Empty: `EmptyState` with the strings given per screen.
- Error: `ErrorState` title `Something didn’t work`, body given per screen — or, when the screen has no specific sentence, `Nothing was changed. Try again in a moment.` (`common.errorBody`). Button `Try again`, `Technical details` disclosure with the raw error. Never pair the generic title with the offline body.
- Endpoint not built yet (HTTP 501): `ErrorState` title `Not available yet`, body `Swissquote is still switching this on. Nothing was changed — try again in a moment.`
- Route stub (later wave): `EmptyState` title `Coming in the next step`, body `This screen is built in the next wave of the prototype.`, secondary `Back`.
- Policy refused outside `/send/review` (e.g. protect): `PolicyLine` reason `Swissquote’s policy check didn’t approve this. Nothing was sent.`; raw backend reasons go under `Technical details`.
- Offline bank: `ErrorState` title `Swissquote isn’t reachable`, body `Your keys and your money are unaffected. The bank service answers policy checks and pays network fees; try again in a moment.`

### 10. Screen-by-screen

Layout sketches are 390 px wide unless marked *desk*. `[P]` = the one primary button on the screen.

#### `/onboarding` — 6 steps, `Stepper` on top, one primary per step

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
│   Client        SQ-48213-LK SIMULATED │  the client file is a mock
│   Valid for     Swissquote            │
│ [P] Sign the proof                    │
```
- Done: `Ownership proven — Travel Rule check done.` sub `Deposits from your Swissquote account are accepted instantly.` [P] `Go to my wallet`.

#### `/pair` — laptop
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

#### `/` — Home
```
┌ Lea · phone ─────────────────────────┐
│ Keyline                    Security ⚙│  text-20 600 · ghost icon button (ShieldCheck)
│                                       │
│ Balance                               │  text-12 ink-3 eyebrow
│ CHF 96.00                             │  text-44 (no badge on the amount — the USDC balance is a chain read)
│ 120.00 USDC                           │  text-16 ink-2
│ Rate 1 USDC = CHF 0.80 SIMULATED      │  text-12 ink-3 — the only mocked thing is the conversion
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

#### `/send`
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

#### `/send/review` — one screen, four verdicts
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

#### `/approve` — laptop, Tier-2 co-approval
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

#### `/activity/:hash`
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

#### `/dapps`
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

#### `/security` — Security centre
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

#### `/recover` — new phone (also the Thief’s path until identity fails)
Stepper total 5: `Email · Identity · New key · Recoverers · Waiting period`.
1. **Email** — title `Let’s get you back in` body `Enter the email on your Swissquote file. We’ll send a code.` TextField `Email`, [P] `Send code`; then TextField `6-digit code` + hint `Email delivery is simulated — the code is in the demo inbox.` + `SimulatedBadge` + quiet link `Show inbox`, [P] `Continue`. Error `That code doesn’t match.`
2. **Identity** — title `Confirm it’s you` + `SimulatedBadge` eyebrow `swiyu e-ID check SIMULATED`. Body `Swissquote checks your identity before its recoverer may act. In production this is the Swiss e-ID (swiyu).` Fields `Name on ID`, `Date of birth` (plain numeric TextField, placeholder `DD.MM.YYYY`, never the browser date picker), `Document number` (mono), Toggle `Liveness check passed` (prefilled). Footer quiet link `Open the e-ID stand-in` (no second badge). [P] `Submit identity check`. Status while desk decides: `StatusSequence` `Sent to Swissquote` done → `Being checked` active. Refused → `/refused`.
3. **New key** — title `Create a key on this phone` body `This phone gets its own key. Nothing from the old phone is reused.` `KeyCard` preview `Phone key · This phone · Signs every transfer once access is restored` (pending). [P] `Create with Face ID / fingerprint`.
4. **Recoverers** — title `Waiting for a second recoverer` body `Swissquote has confirmed. Swissquote cannot finish this alone — one more recoverer is needed.`
   KeyCards: `Swissquote · Swiss data centre · Confirmed 14:30:12 · View on Basescan` (ok) · `Safety key · Your laptop · Open Keyline on your laptop to confirm` (pending) · `Emergency card · On paper, with you · Paste the key printed on the card below` (pending) with TextField mono `Emergency card key` + [secondary] `Use Emergency card`. `where` and `can` never repeat each other; the persona label never appears in client copy.
   Secondary note: `Either your laptop or your Emergency card will do. You don’t need both.`
5. **Waiting period** — title `Access restores at 14:35:12` `CountdownRing` size 200 (`showFinish={false}` — the title carries the time), inside `02:41` + `remaining`; caption `Waiting period accelerated for the demo: 3 min instead of 72 h.`; body `During this period the previous owner can still cancel. If nobody cancels, this phone becomes the only key.` Link `Watch on Basescan`. `read from the SocialRecoveryModule` only under `Technical details`. Period over: ring `00:00` + `Ready to finish`. When finalized: stepper label `Restored`, title `You’re back in, Lea` (not "Welcome back" — ban list) body `This phone is now your only key. The old phone can no longer sign.` Panel `Wallet` · `New key`; link `View the restore transaction on Basescan`; [P] `Go to my wallet`.
- Error (bank unreachable) uses the global offline ErrorState. Error (module refuses): `ErrorState` `The recovery couldn’t start` / `The chain rejected the request. Nothing changed.`

#### `/alerts` — Lea’s existing devices
- Recovery started (danger Note + ring): title `Was this you?` body `Recovery started from a new phone in Zürich, 2 minutes ago. If nobody cancels, that device becomes the only key at 14:35:12.` `CountdownRing` size 120, `doneLabel` `Period over`. [P danger] `Cancel recovery — it wasn’t me` · ghost `It was me`. Period over, not finalized: body `The waiting period ended at 14:35:12. The new phone can finish at any moment; you can still cancel until it does.` Finalized: the started Note disappears; only the finalized Note (`Access moved to a new phone`) remains, no cancel. Home shows a danger Note `Was this you?` + `Open alerts` while a started alert exists, and a `Bell` icon link in the top bar. After cancel: `Recovery cancelled. Your phone remains the only key.` + `View on Basescan`. Fraudster’s screen (`/recover` step 5) switches to `Recovery cancelled by the owner.` with `ErrorState` tone.
- Recovery refused (info Note): title `Recovery attempt refused` body `Someone tried to recover this wallet from a device labelled “Thief · stolen phone” at 14:28. The identity check failed; Swissquote’s recoverer did not act. Nothing changed.` ghost `See event log`.
- Empty: `EmptyState` `No alerts` / `Recovery attempts and large transfers appear here.`

#### `/refused`
```
│ Thief · stolen phone (red bar)        │
│ Prohibit icon  Recovery can’t start   │  text-28
│ The identity check failed. The owner  │
│ has been notified.                    │
│ Panel: Email code Passed · Identity check Failed SIMULATED · Swissquote recoverer Did not act
│ Technical details ▸ (raw reasons, one per line)
│ ghost: Back to start                  │  no primary
```

#### `/desk` — Swissquote recovery desk (desktop, `DeskLayout`)
Header (ink): `Swissquote · Recovery desk` + `SimulatedBadge` + operator `Operator: M. Keller` + `Sign out`. Footer: `This console cannot move client funds.` Legend (top-right): `Real` (solid ink square) `On-chain and signed` · `Simulated` (dashed square) `Mocked for the prototype`.
- **Login**: title `Operator sign-in` body `Single sign-on is simulated for the prototype.` + badge; TextField `Operator token`; [P] `Sign in`; error `That token isn’t valid.`
- **Queue** (left column 4/12): heading `Recovery requests`, filter chips `Open · Refused · Finished` (selected chip = solid ink via `aria-selected`; the id `#48A7BE` is mono ink-2, never a status colour; the `Waiting for` fragment is omitted when it equals the status chip); rows: `Lea Keller · SQ-48213-LK` / `Awaiting recoverers · 2 min ago` status chips: `identity-pending → Identity check` (pending) · `identity-refused → Refused` (danger) · `awaiting-guardians → Waiting for a 2nd recoverer` (pending) · `executed-waiting → Waiting period` (pending) · `finalized → Finished` (ok) · `cancelled → Cancelled by owner` (ink-2). Empty: `No recovery requests` / `New requests appear here within a few seconds.`
- **Request detail** (right 8/12): title `Lea Keller — recovery #R-2041`; eyebrow `Requested from Lea · new phone · Zürich · 5 Oct 2026, 14:28`.
  Section `Identity signals` + badge: rows `Email code Passed` · `ID document Name matches` / `Name mismatch` · `Liveness Passed` / `Failed` · `Verdict Pass, signed by the bank` / `Fail` / after an override `Overridden by operator (demo)` (pending tone; the original failed rows stay) + row `Operator M. Keller · 14:31`. Raw signal strings only under `Technical details`. `Back to queue` flush-left.
  Section `Recoverer confirmations` (Real): rows `Swissquote Confirmed 14:30:12 · tx 0x9c…41 ↗` · `Safety key Pending` · `Emergency card Not used`; footnote `2 of 2 confirmations`.
  Section `On-chain timer` (Real): `Waiting period ends 14:35:12` + small `CountdownRing` 64 + `read from the SocialRecoveryModule`. Not started: `No waiting period yet — the request has 1 of 2 confirmations.`
  Actions: [P] `Approve identity` · secondary `Refuse` (requires note) · danger-text ghost `Override (demo: assume the bank was fooled)` with confirm sheet `Override the identity check?` body `This instructs Swissquote’s recoverer to confirm although the check failed. It demonstrates that one recoverer is never enough.` buttons `Override` (danger) · `Keep refused`. After override: `Note` `Swissquote confirmed. Status stays “Waiting for a 2nd recoverer” — Swissquote cannot finish this alone.`
  Finalize appears only when the timer is done: secondary `Finish recovery` (fee paid by Swissquote).
- **Audit log** (full width, below): heading `Audit log · append-only`; table `Time · Service · Event · Who`; rows mono time; empty `No events yet`.

#### `/mock/inbox` — `SimulatedBadge` in title
Title `Inbox` + badge, lead `lea.keller@example.ch`. Body `Email delivery is simulated. Codes sent by Keyline appear here.` Rows: `Keyline · Your recovery code is 482137 · 14:28`. Empty `No messages`.

#### `/mock/eid` — `SimulatedBadge` in title
Title `swiyu e-ID check` + badge. Body `Stand-in for the Swiss e-ID (live 1 Dec 2026). A name that doesn’t match the client, or a failed liveness check, fails.` (The device label is never an identity signal — the Thief fails because the name on the ID is not the client's.) Fields `Name on ID`, `Date of birth`, Toggle `Liveness check passed`. [P] `Submit`. Result Note `Verdict: pass` / `Verdict: fail — ID document name mismatch, liveness check failed`.

### 11. Review checklist (design-system audits every screen against this)

- One primary button per screen; 48 px; label is a verb phrase.
- Every status: icon + word. Every simulation: `SimulatedBadge`. Every waiting period: exact finish time + demo caption.
- Every address: `Address` (full value reachable + copy). Every amount: `formatCHF` / `formatUSDC`.
- No shadow outside `Sheet`; radii only 6/10; no purple; no gradient; no emoji; no "Dashboard/Overview/Welcome back!"; no spinner without a sentence.
- Focus ring visible on every control; tap targets ≥ 44 px; no text clipped at 390 px.
- Vocabulary: recoverer · Safety key · Emergency card · network fee · approver — never guardian/gas/seed/userOp outside `Technical details`.

### Appendix A — `copy.ts` (paste into `apps/wallet/src/copy.ts`)

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
    errorBody: 'Nothing was changed. Try again in a moment.',
    notAvailableTitle: 'Not available yet',
    notAvailableBody: 'Swissquote is still switching this on. Nothing was changed — try again in a moment.',
    comingSoonTitle: 'Coming in the next step',
    comingSoonBody: 'This screen is built in the next wave of the prototype.',
    policyRefused: 'Swissquote’s policy check didn’t approve this. Nothing was sent.',
    pending: 'Pending',
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
      skip: 'Skip for now',
      retry: 'Sign again',
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
    pairedHere: 'Paired on this laptop',
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
    receiveTitle: 'Receive',
    noWalletTitle: 'No Keyline on this device yet',
    noWalletBody: 'Create a wallet or sign in with the phone key that owns it.',
    createWallet: 'Create a Keyline',
    signIn: 'Sign in',
    signInTitle: 'Sign in with your phone key',
    signInBody: 'Your Face ID or fingerprint unlocks the key that stays on this phone.',
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
    recipient: 'Recipient',
    pasteAddress: 'Paste an address',
    indicativeRate: 'indicative rate',
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
    missingTitle: 'Nothing to review',
    missingBody: 'Choose a recipient and an amount first.',
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
    notFoundTitle: 'Transfer not found', notFoundBody: 'This device has no record of that transfer.',
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
    title: 'Alerts',
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

#### Appendix A.2 — Wave 2 additions (merge into the objects above; replaces the `copyGaps` block in `copy.ts`)

```ts
// demo
demo: { city: 'Zürich' },
// home
home: { restoredRow: 'Access restored on this phone' },
// recover
recover: {
  codeHint: 'Email delivery is simulated — the code is in the demo inbox.',
  idDobPlaceholder: 'DD.MM.YYYY',
  openEid: 'Open the e-ID stand-in',
  keyWhere: 'This phone', keyCan: 'Signs every transfer once access is restored',
  keyDone: 'Key created on this phone.',
  emailUnknown: 'That email isn’t on a Swissquote file with a Keyline.',
  docNumber: 'Document number',
  recSafety: 'Your laptop', recSafetyCan: 'Open Keyline on your laptop to confirm',
  recCard: 'On paper, with you', recCardCan: 'Paste the key printed on the card below',
  sqHeld: 'Signature held by Swissquote — relayed with the second one',
  cardInvalid: 'That doesn’t look like an Emergency card key.',
  cardNotGuardian: 'This key is not one of the wallet’s recoverers.',
  noPending: 'No recovery in progress on this phone.', startOver: 'Start over',
  walletLabel: 'Wallet being restored', newKey: 'New key',
  ready: 'Ready to finish',
  restoredLabel: 'Restored',
  welcome: 'You’re back in, Lea',
  viewRestoreTx: 'View the restore transaction on Basescan',
  cancelledBody: 'Your old phone cancelled this recovery. Nothing changed on the wallet.',
},
// approve
approve: {
  recoveryTitle: 'Restore access on a new phone?',
  recoveryBody: 'A new phone asked to become the only key of this wallet. Confirm only if this is you.',
  confirmedTitle: 'Confirmed on this laptop',
  recoveryConfirmed: 'Confirmed. The waiting period starts once Swissquote’s signature is relayed with yours.',
  waitingBody: (t: string) => `The waiting period has started. It ends at ${t}.`,
  recoveryRefused: 'Not confirmed. Nothing changed; the new phone stays locked out.',
  noSafetyKey: 'This laptop holds no Safety key. Pair it first.', pairLink: 'Pair this laptop',
  requested: 'Requested', signingTitle: 'What you sign',
},
// alerts
alerts: {
  startedTitle: 'Was this you?',
  open: 'Open alerts',
  periodOver: 'Period over',
  periodOverBody: (t: string) => `The waiting period ended at ${t}. The new phone can finish at any moment; you can still cancel until it does.`,
  cancelSequence: ['Signed', 'Sent', 'In block', 'Cancelled'],
  cancelledTitle: 'Recovery cancelled',
  finalizedTitle: 'Access moved to a new phone',
  noWallet: 'No wallet on this device.',
},
// desk
desk: {
  navQueue: 'Queue', navAudit: 'Audit log', operatorName: 'M. Keller',
  client: 'Client', device: 'Device', status: 'Status', waitingFor: 'Waiting for', age: 'Age',
  waitingForValues: { identity: 'Identity check', operator: 'Operator decision', 'second-recoverer': 'Second recoverer', 'grace-period': 'Waiting period' },
  kinds: { 'safety-key': 'Safety key', 'emergency-card': 'Emergency card', swissquote: 'Swissquote', partner: 'Partner' },
  sigValues: { verdictOverridden: 'Overridden by operator (demo)' }, operatorRow: 'Operator',
  confOf: (have: number, need: number) => `${have} of ${need} confirmations`,
  newOwner: 'New key (signer)', wallet: 'Wallet', reasons: 'Reasons', refusals: 'Recoverer refusals',
  heldSignature: 'Signature held by Swissquote', relayedTx: 'Relayed', noteField: 'Note', actionDone: 'Recorded.',
  back: 'Back to queue', sources: 'Feeds', unreachable: 'unreachable', openDetail: 'Open', signedOut: 'Signed out.',
  notFound: 'This request is not in the queue.',
},
// mock
mock: {
  inboxShort: 'Inbox', inboxEmail: 'Email', inboxShow: 'Show inbox',
  eidBody: 'Stand-in for the Swiss e-ID (live 1 Dec 2026). A name that doesn’t match the client, or a failed liveness check, fails.',
  eidIssued: (issuer: string) => `Issued by ${issuer} — forward it from the recovery screen.`,
  eidBack: 'Back to recovery',
  eidNote: 'The verdict is computed by Swissquote when the recovery screen submits this form; this page only shows what the simulated issuer returns.',
},
// security
security: {
  protectedLine: 'Protected · 2 of 3 recoverers',
  pendingWallet: 'Wallet not deployed yet — finish onboarding.',
  attestationNone: 'No proof yet. Finish onboarding step 6 to sign one.',
  proofCopied: 'Proof copied', verifiedAt: 'Verified', method: 'Method',
  proof: { methodValue: 'Signed by your wallet' },
  limitsNewAddress: 'First transfer to a new address, or above CHF 10’000',
  exportLater: 'Available in the next step of the prototype',
  eventFallback: (type: string) => type.replace(/[.-]/g, ' '),
},
```

### Appendix B — Implementation notes for engineers

- **Styling model.** Primitives are styled by `kl-*` classes in `@keyline/ui/components.css` (plain CSS over tokens). Tailwind v4 is loaded **without its default theme** (`preflight.css` + `utilities.css` only); `apps/wallet/app/theme.pcss` maps tokens to utilities with `@theme inline reference` (no default palette exists, so `bg-purple-500` is not a class). Use utilities for layout; never restyle a primitive from outside.
- **Fonts** are self-hosted woff2 in `apps/wallet/app/fonts` via `next/font/local` (`--font-hanken`, `--font-jetbrains`); no Google Fonts request at runtime.
- **Icons**: import from `@phosphor-icons/react/dist/ssr` (works in server and client components).
- **Client components** in the package: `Address`, `CountdownRing`, `EmergencyCard`, `Sheet`. Everything else is server-safe.
- **CountdownRing hydration**: the clock is a `useSyncExternalStore` with a `null` server snapshot, so SSR and hydration render the full ring and the real time arrives on the first client re-render (no hydration mismatch). Pass `endsAt` straight from `executeAfter` on chain.
- **Formatters** (`formatCHF`, `formatUSDC`, `formatSignedUSDC`, `formatInteger`, `formatRate`, `shortAddress`, `groupHex`, `formatClock`, `formatDateTime`, `formatShortDateTime`, `formatRelative`, `formatDuration`) are the only way to print money, addresses and times.
- **Kitchen sink**: `/design` renders every primitive in every state; `pnpm --filter @keyline/ui contrast` verifies every text/background pair.
