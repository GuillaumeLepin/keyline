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

# persona | path | x | y | w | h  (1440×900 laptop layout; the desk goes on the second screen / a tab)
LAYOUT=(
  "lea-phone|/|0|0|520|900"
  "lea-laptop|/approve|520|0|920|440"
  "thief|/|520|440|460|460"
  "lea-new-phone|/|980|440|460|460"
  "desk|/desk|1440|0|1440|900"
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
  Lea · phone          left         (phone frame, onboarding / home)
  Lea · laptop         top right    (/approve: Safety key pairing + co-approvals + recovery confirm)
  Thief · stolen phone bottom right (red bar, no key)
  Lea · new phone      bottom right (opened now, used at 1:40 of the pitch)
  Swissquote desk      second screen (/desk, operator token from services/bank/.env)
Notifications off (macOS Focus), zoom ${SCALE}×, pnpm demo:reset done, demo-state.json present.
EOF
