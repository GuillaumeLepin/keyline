# Keyline

Self-custody for Swissquote clients: your phone key moves the money, two of three recoverers restore it, and Swissquote can never act alone.

Repository: `TODO-FINAL: repo URL`
Video (3 min): `TODO-FINAL: video link`
Track: Swissquote. Chain: Base Sepolia.

## Custody decision

One Safe 1.4.1 smart account per client (ERC-4337, EntryPoint v0.7), owned only by the client's phone passkey (P-256). A Candide SocialRecoveryModule holds three guardians, threshold 2: the client's Safety key (laptop), the client's Emergency card (shown once, never stored, cannot spend) and Swissquote's recovery key (a separate process, own key, own database). Swissquote is the only institution in the list: it cannot sign transactions or complete a recovery alone, and every recovery starts a public on-chain delay the owner can cancel. Under the Swiss power-of-disposal test (Art. 16 no. 1bis BankA, Art. 242a DEBA, FINMA Guidance 01/2026) this is software plus a recovery service, not custody. An assisted mode with a partner guardian would be the grey zone; it is not built, and we say so.

## What is real

Passkeys, Safe deployment, sponsored userOps, ERC-1271 attestation, OFAC screening, `eth_simulateV1`, EIP-712 guardian and verdict signatures, recovery execute, finalize and cancel: all real on Base Sepolia. Labelled SIMULATED: identity and e-ID check, recovery inbox, account balance and CHF rate, notifications, operator SSO, one seeded sanctioned address. Tier 2 and 3 limits are policy-layer only. Bitcoin is out of scope (roadmap: miniscript timelocks or 2-of-3 TSS).

## Wallet creation

Passkey in the platform authenticator; Safety key generated with viem on the laptop; Emergency card generated on the phone, displayed once, dropped. One sponsored userOp deploys the Safe, enables recovery and adds the three guardians; the Safe then signs an ERC-1271 attestation bound to the KYC file.

## Authentication

Tier 1 (up to CHF 1'000 a day, known recipient): passkey. Tier 2: passkey plus a Safety-key EIP-712 signature verified by the bank. Tier 3 (new recipient or above CHF 10'000): plus a cooling period with cancel. Enforcement is at the policy layer; a client paying their own gas bypasses it. The on-chain path (AllowanceModule, delay module) is the roadmap.

## Recovery

Lost phone: new passkey, identity check (simulated), signed bank verdict, the Swissquote guardian verifies it and signs one approval, the laptop Safety key signs the second, the bank relayer submits one `multiConfirmRecovery`, 180 s later finalize. Proven from the UI on Safe `0xeF2c271d40d72bc5Dc4fef277846CA66886E2cce`. Swissquote gone: `keyline recover --without-bank` with the two client keys, proven on-chain with no Keyline server. Attacker with phone and e-mail: passes the OTP, fails identity, refused; even with the desk's "override" the request stops at 1 of 2. Verify with `cast call`: `getGuardians`, `threshold`, `getOwners`.

## Custody and Travel Rule

FINMA Guidance 02/2019 requires proof that an external wallet belongs to the client, with no amount threshold. Swissquote asks for screenshots today; Keyline's ERC-1271 attestation makes the proof automatic in both directions. For transfers to third parties Swissquote does not order the transaction, so it is not the ordering institution; co-signing stays optional.

## Business case

Swissquote's crypto income fell from CHF 85.7 m (2025) to CHF 14.6 m in H1 2026 with volatility. 18 % of Swiss residents hold crypto; those who want self-custody must leave today. Keyline keeps them, adds non-cyclical revenue (swap fee, staking, a Protected tier: about CHF 2.25 m illustrative) and removes custody insurance, key-theft liability and manual ownership checks.

## Bonus topics tackled

Gasless: bank-gated paymaster sponsorship with callData verification, a daily cap, screening and simulation first. Compliant dApp interaction: plain-language `eth_simulateV1` results, decoded approvals with a suggested cap, OFAC screening, a dApp allowlist that blocks unknown dApps.

## AI tools used

Claude Code (Claude Fable 5.1) as orchestrator plus seven subagents, each owning a directory, with no homemade cryptography and labelled mocks. The human made the design and product decisions, funded wallets, reviewed each gate and presents. Details: `docs/AI-TOOLS.md`.
