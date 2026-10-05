# partner-guardian — independent partner's recovery key holder (port 4002, assisted mode only, mock organisation)

The same binary as `sq-guardian` (`@keyline/guardian-core`) started with a different `.env`: its own key (`GUARDIAN_PRIVATE_KEY`, in memory only), its own SQLite file (`./data/partner-guardian.sqlite`), its own port. It refuses to start if any `BANK_*` secret or `WALLET_*` variable is present.

## What it can and cannot do

**It can:** on `POST /recoveries` for a wallet whose **on-chain** guardian set includes its address (assisted mode: `{Safety key, Swissquote, Partner}`), apply the same rules as sq-guardian — bank-signed `pass` verdict for this exact request, on-chain guardian membership, one *executed* recovery per wallet per 24 h — and then **sign a confirmation** (the module's EIP-712 `ExecuteRecovery` hash at the live nonce, viem `signTypedData`) that the module attributes to its address once the bank relayer submits it in a `multiConfirmRecovery`. `GUARDIAN_CONFIRM_MODE=onchain` makes it send `confirmRecovery` itself instead (needs ETH). Every decision is logged with reasons in `events`; `POST /recoveries/:id/executed` lets the bank report the on-chain execution (verified against `status(wallet)`), which is what arms the 24 h rule.

**It cannot:** finalize (`POST /recoveries/:id/finalize` → 403, only Swissquote finalizes, and even Swissquote never before the on-chain delay), move funds, build any Safe transaction other than a recovery confirmation, **reach the threshold alone** (one approval of the module's 2-of-3), or touch a default-mode wallet at all: it is not in that wallet's on-chain guardian list, so "Swissquote + partner" against a default-mode client is impossible by the module's state, not by this code. SPEC §4 says the partner should run its own simulated identity check and sign its own verdict; it still trusts the bank's verdict (open item, Wave 3).

Same HTTP surface as `services/sq-guardian/README.md` (`/identity`, `/health`, `/events`, `POST /recoveries`, `GET /recoveries/:id`, `POST /recoveries/:id/executed`; finalize refused). The chain port is the real `@keyline/chain` adapter whenever `RPC_URL` is set.

Run: `pnpm --filter @keyline/partner-guardian dev` · identity: `curl localhost:4002/identity`.
