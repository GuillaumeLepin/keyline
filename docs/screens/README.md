# Screenshots — what is demo-ready

Captured by `pnpm screenshots` (Playwright, 1280/1400 px desktop with the 390×844 phone frame). Audited in `docs/DESIGN-AUDIT.md`. "Ready" = can go in the README strip as is; "re-shoot" = the source has changed since the capture or the capture shows a known defect.

## README strip (8 frames, in story order)

| Frame | Use now | Re-shoot after Wave 3 because |
|---|---|---|
| Onboarding summary ("Protected") | `story-05-onboarding-protected.png` ✓ | — (also `w1-onboarding-protected.png`) |
| Review with "What will happen" | `story-05-onboarding-protect.png` ✓ (protect step) — for the *send* review use `w1-send-review.png` only after re-shoot | `w1-send-review.png` shows the pre-fix error block above the panel (W1-19/20) |
| Receipt (`/activity/:hash`) | none yet | no capture exists; shoot after a real transfer (`story-09-*`) |
| Recovery countdown | `w2-recover-waiting.png` ✓ (acceptable) | re-shoot after W2-4 (finish time once, no module line) |
| Attacker refused | `w2-refused.png` ✓ | re-shoot after W2-N4 (reasons under Technical details) and W2-1 (reason text) |
| Desk request | `w2-desk-request.png` ✓ (Lea, correct layout) | re-shoot after W2-13/14 (back link flush-left, raw signals hidden); never use `w2-desk-request-thief.png` / `w2-desk-override.png` (collapsed grid, W2-3) |
| Security centre | `w2-security.png` ✓ | — (`w2-security-prove.png` after W2-17) |
| Exit hatch (Emergency card) | `story-03-onboarding-emergency-card.png` ✓ (full addresses printed) | — |

## Demo-ready now (no known defect in the capture)

`story-01-onboarding-create`, `story-03-onboarding-emergency-card`, `story-03-onboarding-emergency-card-confirm`, `story-05-onboarding-protect`, `story-05-onboarding-protected`, `w2-recover-key`, `w2-recover-recoverers` (copy nits only), `w2-refused`, `w2-thief-identity` (focus ring visible), `w2-desk-login`, `w2-desk-queue` (chip state nit), `w2-desk-request`, `w2-desk-audit`, `w2-security`, `w2-approve-recovery`, `w2-mock-inbox`, `w2-mock-eid` (body text changes with W2-1).

## Re-shoot after Wave 3 (capture predates a fix or shows a defect)

- Wave 1 fixes not yet captured: `story-02-onboarding-pairing-code`, `story-02-onboarding-paired` (badge line, code after pairing), `story-02-laptop-paired` (`PROTOTYPE: SOFTWARE KEY` badge), `story-04-onboarding-mode` (`· Not in this prototype` orphan), `story-06-onboarding-prove`, `story-06-onboarding-proven` (Client row badge), `story-07-home-protected`, `story-08-home-topup-sheet`, `story-08-home-topup-error-funder-empty` (`All` link, balance badge, Next.js `1 Issue` overlay), all `w1-*`.
- Wave 2 fixes: `w2-recover-waiting` (W2-4), `w2-recover-welcome` (W2-5, W2-20), `w2-recover-code` (W2-N3), `w2-recover-identity` / `w2-thief-identity` / `w2-thief-code` (W2-7, W2-N2), `w2-alerts` (W2-8), `w2-fail-lea-phone` (W2-9), `w2-home` (W2-10), `w2-home-newphone` (W2-11), `w2-desk-request-thief`, `w2-desk-override` (W2-2, W2-3, W2-15), `w2-approve-confirmed`, `w2-fail-lea-laptop` (W2-16), `w2-security-prove` (W2-17), every screen with a device bar (W2-18 — bars now differ per persona).
- Missing captures for the story: Home with a balance and a statement row, `/send` → review → receipt (`/activity/:hash`), `/alerts` after a successful cancel, `/recover` finalized on a funded twin, desk `Finish recovery`.

## Rules for the next capture pass (`qa-demo`)

Fail the run when a `nextjs-portal` overlay is present; capture the phone personas at 1280×1000 and the desk at 1400×1000; name files `w3-<route>-<state>.png`; keep the `story-NN-*` series in story order so the README strip can be regenerated from it.
