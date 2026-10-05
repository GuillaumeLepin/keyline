# partner-guardian — independent partner's recovery key holder (port 4002, assisted mode only, mock organisation)

The same binary as `sq-guardian` (`@keyline/guardian-core`) started with a different `.env`: its own key (`GUARDIAN_PRIVATE_KEY`, in memory only), its own SQLite file (`./data/partner-guardian.sqlite`), its own port. It refuses to start if any `BANK_*` secret or `WALLET_*` variable is present.

**What it can do:** confirm a recovery on a wallet whose on-chain guardian set includes its address (assisted mode: `{Safety key, Swissquote, Partner}`), under the same rules as sq-guardian: bank-signed `pass` verdict for this exact request, on-chain guardian membership, one *executed* recovery per wallet per 24 h, `execute=true` only when the threshold is reached. Every decision is logged with reasons in `events`.

**What it cannot do:** finalize (`POST /recoveries/:id/finalize` returns 403 — only Swissquote finalizes), move funds, build any other Safe transaction, or touch a default-mode wallet at all: it is not in that wallet's on-chain guardian list, so "Swissquote + partner" against a default-mode client is impossible by the module's state, not by this code. SPEC §4 says the partner should run its own simulated identity check and sign its own verdict; Wave 0 still trusts the bank's verdict (open item, Wave 3).

Run: `pnpm --filter @keyline/partner-guardian dev` · identity: `curl localhost:4002/identity`.
