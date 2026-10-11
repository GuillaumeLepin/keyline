#!/usr/bin/env bash
# Opens the five demo personas as five SEPARATE Chrome instances (one user-data-dir each → nothing is signed in to
# Google, nothing syncs, each has its own passkeys/localStorage/IndexedDB), tiled on the screen, each with its
# `?device=` label so the DeviceBar and the bank's X-Device-Label match the window.
#
#   pnpm demo:open                 # wallet on :3000
#   WALLET_URL=http://localhost:3100 pnpm demo:open
#   pnpm demo:open --reset         # wipe the five Chrome profiles first (fresh passkeys, fresh localStorage)
#
# Zoom: Chrome remembers per-site zoom per profile. Set 125 % once per window (⌘ +) or keep the
# --force-device-scale-factor=1.25 flag below (applies to the whole window, including the DeviceBar — looks right
# on a 13" screen; drop it on a projector that already scales).
#
# Real platform passkeys live in the OS (Touch ID / iCloud Keychain) and are keyed by rpId `localhost` — all five
# profiles see the same keychain. That is fine: the *thief* never registers one and "losing the phone" is played by
# switching to the *Lea · new phone* window, which registers a brand-new credential during recovery.
set -euo pipefail

WALLET_URL="${WALLET_URL:-http://localhost:3000}"
PROFILES_ROOT="${KEYLINE_CHROME_PROFILES:-$HOME/.keyline-chrome}"
SCALE="${KEYLINE_CHROME_SCALE:-1.25}"
CHROME_APP="${CHROME_APP:-Google Chrome}"

if [[ "${1:-}" == "--reset" ]]; then
  echo "Removing Chrome profiles under $PROFILES_ROOT (passkeys registered in the OS keychain are NOT removed)"
  rm -rf "$PROFILES_ROOT"
fi
mkdir -p "$PROFILES_ROOT"

# v2 journey (SPEC §10): the story opens on Swissquote web on the laptop. Screen 1 (the 1440×900 laptop) is the
# laptop persona at full width; the phones and the desk go on the second screen / projector, which starts at
# x = SECOND_SCREEN_X (default 1440, i.e. the second screen sits to the right of the laptop).
X2="${SECOND_SCREEN_X:-1440}"
# persona | path | x | y | w | h
LAYOUT=(
  "lea-laptop|/swissquote|0|0|1440|900"
  "lea-phone|/|$((X2))|0|520|900"
  "lea-new-phone|/|$((X2 + 520))|0|460|450"
  "thief|/|$((X2 + 520))|450|460|450"
  "desk|/desk|$((X2 + 980))|0|940|900"
)

open_persona() {
  local persona="$1" path="$2" x="$3" y="$4" w="$5" h="$6"
  local url="${WALLET_URL}${path}?device=${persona}"
  echo "→ ${persona}: ${url}  (${w}×${h} at ${x},${y})"
  open -na "$CHROME_APP" --args \
    --user-data-dir="${PROFILES_ROOT}/${persona}" \
    --no-first-run --no-default-browser-check \
    --disable-sync --disable-features=ChromeSignin,SyncPromo \
    --force-device-scale-factor="$SCALE" \
    --window-size="${w},${h}" --window-position="${x},${y}" \
    --new-window "$url"
  sleep 0.6
}

for entry in "${LAYOUT[@]}"; do
  IFS='|' read -r persona path x y w h <<<"$entry"
  open_persona "$persona" "$path" "$x" "$y" "$w" "$h"
done

cat <<EOF

Five Chrome windows opened from ${WALLET_URL}.
  Lea · laptop         screen 1, full width (/swissquote: sign in → portfolio → Keyline tile → Safety key prompt;
                                             later /approve for the recovery confirmation)
  Lea · phone          screen 2, left       (phone frame: /start → onboarding → home)
  Lea · new phone      screen 2, top middle (used at 1:40 of the pitch)
  Thief · stolen phone screen 2, bottom     (red bar, no key)
  Swissquote desk      screen 2, right      (/desk, operator token from services/bank/.env)
Notifications off (macOS Focus), zoom ${SCALE}×, pnpm demo:reset done, demo-state.json present.
EOF
