# Keyline

Self-custody for Swissquote clients: the phone key moves the money, two of three recoverers restore it, and Swissquote can never act alone.

Repository: https://github.com/GuillaumeLepin/keyline (local git at submission: 25 commits, 5 Oct 15:08 to 6 Oct 09:05 CEST)
Video: `docs/demo.webm` in the repository (5 min 16 s, full recovery from the new phone; hosted link added at submission)
Track: Swissquote. Chain: Base Sepolia. Application code frozen 6 Oct 09:15 CEST (commit `ae4f253`).

## Custody decision

One Safe 1.4.1 smart account per client, owned only by the phone passkey (P-256). A Candide SocialRecoveryModule holds three guardians, threshold 2: the client's Safety key (laptop), the Emergency card (shown once, cannot spend) and Swissquote's recovery key (own process and database). Swissquote, the only institution in the list, cannot sign transactions or complete a recovery alone; every recovery is a public on-chain delay the owner can cancel. Under the power-of-disposal test (Art. 16 no. 1bis BankA, Art. 242a DEBA, FINMA Guidance 01/2026) this is software plus a recovery service, not custody. Assisted mode with a partner guardian is the grey zone.

## What is real

Real on Base Sepolia: passkeys, Safe deployment, sponsored userOps, ERC-1271 attestation, `eth_simulateV1`, OFAC SDN screening (live list, snapshot fallback), EIP-712 guardian, verdict and step-up signatures, recovery execute, 180 s delay, finalize and cancel. SIMULATED on screen: identity/e-ID check, recovery inbox, balance and CHF rate, notifications, operator login, pairing channel, one seeded sanctioned address. Tier 2 and 3 limits are policy-layer, not on-chain. Not built: assisted mode, "Pay my own fee", Bitcoin (roadmap: miniscript or TSS). The USDC transfer was pending a faucet top-up at submission; no hash is claimed.

## Wallet creation

Passkey in the platform authenticator, Safety key on the laptop, Emergency card shown once on the phone. One sponsored userOp deploys the Safe, enables recovery and adds the three guardians; an ERC-1271 attestation then binds the Safe to the KYC file.

## Authentication

Tier 1 (up to CHF 1'000 a day, known recipient): passkey. Tier 2: plus a Safety-key EIP-712 signature from the laptop, verified by the bank; run on-chain at Gate 3 (wallet `0x3cfC…D7E2`). Tier 3 (new recipient or above CHF 10'000): 60 s cooling with cancel (24 h in production). Paying own gas bypasses this policy layer (on-chain roadmap: AllowanceModule, delay module).

## Recovery

Lost phone: new passkey, identity check (simulated), signed bank verdict; the Swissquote guardian verifies it and signs one approval, the laptop Safety key the second; one relayed `multiConfirmRecovery`, 180 s later finalize. Proven from the UI on Safe `0xeF2c271d40d72bc5Dc4fef277846CA66886E2cce`. Swissquote gone: `keyline recover --without-bank` with the two client keys, proven on-chain with no Keyline server. Attacker with phone and e-mail: OTP passes, identity fails, refused; even the desk's "override" stops at 1 of 2.

## Custody and Travel Rule

FINMA Guidance 02/2019 requires proof that an external wallet belongs to the client, with no threshold. Swissquote asks for screenshots today; Keyline's ERC-1271 attestation automates the proof in both directions. For transfers to third parties Swissquote is not the ordering institution; co-signing stays optional.

## Business case

Swissquote's crypto income fell from CHF 85.7 m (2025) to CHF 14.6 m in H1 2026. 18 % of Swiss residents hold crypto; self-custody clients must leave today. Keyline keeps them (Swissquote positions, "Move to Keyline" and "Back to Swissquote" in the wallet), captures ETH, stablecoin and DeFi activity, adds non-cyclical revenue (swap fee, staking, Protected tier; about CHF 2.25 m, illustrative) and removes custody insurance, key-theft liability and manual ownership checks. Bitcoin stays visible but not movable until it can get the same protection (roadmap: threshold key or timelocked script).

## Bonus topics tackled

Gasless: bank-gated paymaster sponsorship with callData verification, daily cap, screening and simulation first. Compliant dApp interaction: Keyline is a WalletConnect v2 wallet for any Base Sepolia dApp; dApp transactions run the same policy, simulation, OFAC screening, review and sponsorship as a transfer, plus Reown Verify identity checks, the Safety key for unreviewed apps and a suggested cap on `approve(∞)`; DemoSwap is the test dApp.

## Tests and AI tools

289 unit tests passing, lint clean, 22 Playwright tests checked on-chain. One person with Claude Code (Claude Fable 5.1) as orchestrator plus seven subagents; the human decided, funded wallets, reviewed each gate and presents.

## Where the evidence is

| Rubric line or required topic | Evidence |
|---|---|
| Technical implementation (create → sign → recover) | README §4, §6, §12 tx table: protect `0xa40c04…d425`; recovery execute `0xe56ca7…d7f5`, finalize `0xad898b…3e53`; `e2e/story.spec.ts`; USDC transfer pending faucet, stated |
| Security and custody design | README §2 threat table, `docs/THREAT-MODEL.md` §3–§4; screens `w2-refused.png`, `w2-desk-request.png`; `cast call getGuardians/threshold` on Safe `0x291A…4482` |
| Legal feasibility | README §7, `docs/LEGAL.md`; screen `story-06-onboarding-prove.png` (ERC-1271 attestation, Safe `0x2eac…0dea`) |
| Business case | README §8, `docs/BUSINESS.md` (sources and assumptions §6) |
| UX and pitch | Screenshot strip at the top of README; `docs/DESIGN.md`, `docs/DESIGN-AUDIT.md`; `03-DEMO-SCRIPT.md` |
| Bonus: gasless | README §9; screen `w3-review-stepup.png` ("Network fee: paid by Swissquote"); `POST /userops/sponsor` callData check, `services/bank/src/routes` |
| Bonus: compliant dApp interaction | README §9 (WalletConnect, DemoSwap `apps/demoswap`); screens `wc-proposal-light.png`, `wc-approve-unlimited-offer-light.png`, `wc-apps-light.png`, `w3-review-block.png`, `w3-review-dapp-danger.png`, `w3-review-dapp-unknown.png`, `w3-dapps.png`; `services/bank/src/screening/`, `policy/allowlist.json` |
| Topic: custody model decision | README §2 (table of rejected models, who holds what), `docs/THREAT-MODEL.md` §1 |
| Topic: wallet creation | README §4; screens `story-03-onboarding-emergency-card.png`, `story-05-onboarding-protected.png` |
| Topic: authentication | README §5; screens `w3-approve-pending.png`, `w3-review-stepup.png`; Gate 3 wallet `0x3cfC…D7E2` |
| Topic: recovery | README §6; screens `w2-recover-waiting.png`, `w2-recover-welcome.png`, `w3-security-exit.png`; `docs/VERIFIED.md` §12, §14, §15 |
| Topic: custody and Travel Rule | README §7, `docs/LEGAL.md` §3–§5 |
| Topic: business case | README §8, `docs/BUSINESS.md` |
| Honest mocks | README §3 Real / Simulated table and one-paragraph answer; `docs/MOCKS.md`; SIMULATED badge on every mock |
| AI tools | README §13, `docs/AI-TOOLS.md` |
