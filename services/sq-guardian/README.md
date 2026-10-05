# sq-guardian — Swissquote's recovery key holder (port 4001)

A separate process with its own `.env`, its own key (`GUARDIAN_PRIVATE_KEY`, in memory only, never logged or returned) and its own SQLite file (`./data/sq-guardian.sqlite`). It refuses to start if any `BANK_*` secret or `WALLET_*` variable is in its environment.

**What it can do:** on `POST /recoveries`, verify that the identity verdict is EIP-712-signed by the bank's verdict key (viem `verifyTypedData`), that it says `pass` for this exact request/wallet/new owner, that this process is an on-chain guardian of the wallet, and that no recovery was *executed* for that wallet in the last 24 h; then send one `confirmRecovery` to the SocialRecoveryModule (`execute=true` only when its confirmation reaches the 2-of-3 threshold). After the on-chain grace period, `POST /recoveries/:id/finalize`. Every decision, with reasons, is appended to `events` (`GET /events`).

**What it cannot do:** move funds, build any Safe transaction other than recovery confirm/finalize (the chain port exposes nothing else), recover a wallet alone (threshold 2 is enforced by the module on-chain, not by this code), or act with the partner guardian on a default-mode wallet (the partner is simply not in that wallet's on-chain guardian list). Wave 0 ships a SIMULATED chain stub; `GET /health` reports `chainPort: 'stub' | 'real'`.

Run: `pnpm --filter @keyline/sq-guardian dev` · identity: `curl localhost:4001/identity`.
