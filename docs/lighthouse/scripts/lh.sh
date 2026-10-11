#!/bin/sh
# usage: lh.sh <route> <name>
SP=/private/tmp/claude-501/-Users-guillaume-Documents/4fb526ec-06c7-4b02-9a2b-0694a262dcf5/scratchpad
CHROME="$HOME/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
PROFILE=$SP/phd/lh-profile
cd $SP/phd
CHROME_PATH="$CHROME" pnpm dlx lighthouse@12 "http://localhost:3000$1" --form-factor=mobile --only-categories=performance,accessibility,best-practices \
  --disable-storage-reset --chrome-flags="--headless=new --user-data-dir=$PROFILE" --output=json --output-path=$SP/phd/lh-$2.json --quiet
node -e "const r=require('$SP/phd/lh-$2.json');console.log('$2',Object.values(r.categories).map(c=>c.id+'='+Math.round(c.score*100)).join(' '))"
