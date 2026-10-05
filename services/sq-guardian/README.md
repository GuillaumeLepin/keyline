# sq-guardian — Swissquote's recovery key holder (port 4001)

A separate process with its own `.env`, its own key (`GUARDIAN_PRIVATE_KEY`, in memory only, never logged or returned) and its own SQLite file (`./data/sq-guardian.sqlite`). It refuses to start if any `BANK_*` secret or `WALLET_*` variable is in its environment (`BANK_VERDICT_ADDRESS`, a public address, is the one exception).

## What it can and cannot do

**It can:** on `POST /recoveries`, check that the identity verdict is EIP-712-signed by the bank's verdict key (viem `verifyTypedData`), that it says `pass` for this exact request / wallet / new owner, that this process is an **on-chain** guardian of the wallet (`SocialRecoveryModule.isGuardian`), and that no recovery was *executed* for that wallet in the last 24 h. If every rule passes it **signs a confirmation** — the module's own EIP-712 `ExecuteRecovery(wallet, newOwners, newThreshold, nonce)` hash at the live `nonce(wallet)`, signed with viem `signTypedData` — which the module attributes to this guardian's address when the bank relayer submits it inside one `multiConfirmRecovery` next to the client guardian's signature (docs/DECISIONS.md #15, Option A). After the bank reports the execution (`POST /recoveries/:id/executed`, verified against `status(wallet)`) and the on-chain delay has passed, it sends `finalizeRecovery` (`POST /recoveries/:id/finalize`) from its own EOA when funded, otherwise from its own Candide-sponsored relayer Safe. Every decision, with reasons, goes to `events`.

**It cannot:** move funds or build any Safe transaction — the chain port exposes nothing but recovery reads, `confirmRecovery` and `finalizeRecovery`; **it can never finalize before the on-chain delay** (`executeAfter` is read from the module, and the module enforces it again); and **it can never reach the threshold alone** — its signature is one approval out of the 2-of-3 the module requires, and a guardian that is not in the wallet's on-chain guardian list is refused by the module whatever this code says. It also cannot act together with the partner guardian on a default-mode wallet, because the partner is simply not in that wallet's guardian set.

## Modes

| `GUARDIAN_CONFIRM_MODE` | `POST /recoveries` does | Needs ETH on the guardian EOA |
|---|---|---|
| `signature` (default) | returns `{ mode:'signature', guardianAddress, signature, nonce }`; the bank relayer submits | no |
| `onchain` | sends `confirmRecovery(execute = approvals+1 ≥ threshold)` itself (`msg.sender` must be the guardian) | yes |

The chain port is the real `@keyline/chain` adapter whenever `RPC_URL` is set (`GET /health` → `chainPort: 'real'`); the SIMULATED stub exists only for tests. Finalize picks its submitter per call: the guardian EOA if its balance is ≥ 0.002 ETH (`submitter: 'eoa'`), else the guardian's own sponsored Safe through `GUARDIAN_CANDIDE_URL` (`submitter: 'sponsored-safe'`). Both are real transactions.

## HTTP

```
GET  /identity                → { kind:'swissquote', guardianAddress, chainId }
GET  /health                  → { ok, service, guardianAddress, dbPath, chainPort:'real'|'stub', confirmMode,
                                  submitter:'eoa'|'sponsored-safe'|'stub'|'none', submitterAddress }
GET  /events?limit=200        → { events:[{ id, service, type, walletAddress, payload, at }] }

POST /recoveries              { recoveryRequestId, wallet, newOwners:[newOwner], newThreshold:1, identityVerdict }
     200 { confirmed:true, mode:'signature', guardianAddress, signature, nonce:'<uint256>', executed:false }
     200 { confirmed:true, mode:'onchain', txHash, executed }                       (GUARDIAN_CONFIRM_MODE=onchain)
     400 | 403 (rule failed) | 409 (executed < 24 h ago) | 502 (chain unreachable, retry) → { confirmed:false, reasons[] }
     Idempotent per recoveryRequestId: a repeat returns the stored answer.

GET  /recoveries/:id          → { recoveryRequestId, confirmation | null, decision | null, events[] }

POST /recoveries/:id/executed { txHash, executeAfter }        // bank: "my multiConfirmRecovery(execute=true) landed"
     200 { recoveryRequestId, wallet, executed:true, txHash, executeAfter, executedAt, alreadyRecorded }
     404 unknown id · 409 chain disagrees (nothing pending / executeAfter mismatch / other new owner / other tx already recorded)
     Recording this is what arms the one-executed-recovery-per-wallet-per-24 h rule in signature mode.

POST /recoveries/:id/finalize → 200 { txHash, submitter:'eoa'|'sponsored-safe' }
     409 until status(wallet).executeAfter has passed · 404 unknown id · 403 on the partner guardian · 502 chain error
```

Bank relayer recipe (signature mode): `signatures = sortGuardianSignatures([{ signer: guardianAddress, signature }, { signer: safetyKey, signature }])` → `recovery.confirmWithSignatures({ ..., signatures, execute: true })` — the nonce in the response is the one the signature is bound to; it is bumped at execute, so collect both signatures before submitting.

## Run and prove

`pnpm --filter @keyline/sq-guardian dev` · `curl localhost:4001/identity`

Live proof without touching the chain state (uses the Gate 1 Safe whose guardians include this process):
```
cd services/guardian-core
pnpm exec tsx scripts/live-proof.ts gen /tmp/throwaway.json                   # prints a throwaway verdict address
(cd ../sq-guardian && BANK_VERDICT_ADDRESS=<that address> pnpm start &)       # env on the command line, .env untouched
pnpm exec tsx scripts/live-proof.ts check /tmp/throwaway.json                 # signature recovers to the guardian, hash == getRecoveryHash
```
