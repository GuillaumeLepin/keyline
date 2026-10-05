# Sources

Kit list collected 5 Oct 2026 (research assistants, secondary sources unless stated), kept in full. Additions by `docs-submission` on 6 Oct 2026 are in sections 5 and 6. Section 7 says which facts were verified during the build against a primary source or the live chain (`docs/VERIFIED.md`) and which were not.

## 1. Technical

- Candide abstractionkit — passkeys: https://docs.candide.dev/wallet/plugins/passkeys · recovery module reference: https://docs.candide.dev/wallet/plugins/recovery-module-reference · deployments (SocialRecoveryModule, 3-minute instance on Sepolia): https://docs.candide.dev/wallet/technical-reference/deployments · pricing (free Starter, no card): https://docs.candide.dev/wallet/pricing · supported networks: https://docs.candide.dev/wallet/api/supported-networks · EntryPoint v0.9 note: https://docs.candide.dev/blog/entrypoint-v09-support/
- Safe passkeys: https://docs.safe.global/home/passkeys-safe · React tutorial: https://docs.safe.global/advanced/passkeys/tutorials/react
- Candide SocialRecoveryModule audit (Ackee, 2024): https://ackee.xyz/blog/safe-social-recovery-module/
- EIP-7951 / Fusaka (P-256 precompile on Sepolia 14 Oct 2025, mainnet 3 Dec 2025): https://blog.ethereum.org/2025/09/26/fusaka-testnet-announcement · gas spec: https://eest.ethereum.org/main/tests/osaka/eip7951_p256verify_precompiles/spec
- RIP-7212 on OP Stack (Fjord): https://docs.optimism.io/op-stack/protocol/hardforks/fjord · Arbitrum (ArbOS 31): https://forum.arbitrum.foundation/t/aip-arbos-31-bianca-activation-of-arbitrum-stylus-rip-7212-support-nova-fee-router-proposal/25904
- ZeroDev passkey gas without precompile (~300–400k): https://docs.zerodev.app/sdk/advanced/passkeys
- Alchemy Gas Manager FAQ (free testnet sponsorship): https://www.alchemy.com/docs/wallets/reference/gas-manager-faqs · Alchemy simulate methods deprecated 30 Sep 2026: https://support.alchemy.com/articles/8324617353-what-to-use-instead-of-the-deprecated-alchemy-simulate-methods
- Coinbase CDP paymaster (Base only): https://docs.cdp.coinbase.com/paymaster/guides/quickstart · CDP faucet: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/faucets/request-funds-on-evm-test-networks
- Pimlico pricing (card required): https://www.pimlico.io/pricing · EIP-7702 demo: https://docs.pimlico.io/guides/eip7702/demo · pimlico_simulateAssetChanges: https://docs.pimlico.io/infra/bundler/endpoints/pimlico_simulateAssetChanges
- Base eth_simulateV1 (Flashblocks endpoint): https://docs.base.org/base-chain/api-reference/flashblocks-api/eth_simulateV1
- Circle testnet faucet (USDC, 20/2h): https://faucet.circle.com/
- Safe RecoveryHub (Sygnum, Coincover): https://help.safe.global/articles/9622260218-account-recovery-with-saferecoveryhub · Sygnum launch: https://www.sygnum.com/news/sygnum-launches-web3-wallet-recovery-built-on-safe/ · Safe blog: https://safe.global/blog/safe-launches-safe-recoveryhub-joining-forces-with-sygnum-bank-and-coincover
- Zodiac Delay / Gnosis Pay exploit post-mortem (1 Jun 2026): https://www.gnosis.io/blog/post-mortem-gnosis-pay-vulnerability-exploit
- ZK Email account recovery: https://docs.zk.email/account-recovery/setup · Rhinestone modules audit: https://ackee.xyz/blog/rhinestone-core-modules-audit-summary/ · ZeroDev recovery: https://docs.zerodev.app/advanced/account-recovery/sdk-recovery
- MPC libraries: cggmp21 advisories (Dfns): https://dfns.co/article/cggmp21-vulnerabilities-patched-and-explained · Coinbase cb-mpc: https://github.com/coinbase/cb-mpc · Taurus multi-party-sig unfixed advisory: https://pkg.go.dev/vuln/GO-2024-3288
- OFAC sanctioned ETH addresses (nightly): https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses
- ERC-7730 clear signing registry (EF, May 2026): https://www.theblock.co/post/401001/ethereum-foundation-rolls-out-support-for-clear-signing-crypto-security-solution · Trail of Bits on EIP-7730: https://blog.trailofbits.com/2025/08/27/implement-eip-7730-today/
- Passkeys on localhost/ngrok (rpId binding): https://www.corbado.com/blog/test-passkeys-localhost-ngrok
- Bitkey 2-of-3 model: https://bitkey.world/how-it-works
- Swiss e-ID (swiyu) live 1 Dec 2026: https://www.iamexpat.ch/expat-info/swiss-news/e-id-coming-switzerland-december-1 · public beta: https://www.eid.admin.ch/en/public-beta-e

## 2. Legal (Switzerland)

- FINMA Guidance 02/2019 "Payments on the blockchain": https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20190826-finma-aufsichtsmitteilung-02-2019.pdf
- FINMA Guidance 01/2026 on crypto custody (12 Jan 2026): https://www.finma.ch/en/news/2026/01/20260112-mm-am-01-26/ · Homburger analysis (800 % risk weight for balance-sheet crypto): https://www.homburger.ch/en/insights/finma-guidance-01-2026 · Mondaq summary: https://webiis08.mondaq.com/fintech/1744860/finma-guidance-012026-new-requirements-for-the-custody-of-cryptobased-assets
- FINMA Guidance 03/2025 (reporting custody assets): https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20250905-finma-aufsichtsmitteilung-03-2025.pdf
- DLT Act insolvency aspects (Art. 242a DEBA, power of disposal): https://caplaw.ch/2020/dlt-draft-law-insolvency-law-aspects/ · MME (German): https://www.mme.ch/de-ch/magazin/artikel/aussonderung-kryptobasierter-vermoegenswerte-und-zugang-zu-daten-im-konkurs · MME custody services under Swiss law: https://www.mme.ch/en/magazine/articles/provision-of-custody-services-for-digital-assets-under-swiss-law · IFLR: https://www.iflr.com/article/2a63733ixysbvclr19i1c/switzerland-enabling-bankruptcy-remote-custody-of-crypto-assets
- Non-custodial wallet providers and AMLA (Schellenberg Wittmer 2025): https://www.swlegal.com/media/filer_public/4d/de/4dde3fde-6886-40f4-b8e9-3ab1887a247c/20250506_-_lexology_-_legal_technology.pdf
- FATF Oct 2021 guidance, multi-sig and control (§73 via Notabene): https://notabene.id/post/12-outcomes-from-fatfs-oct-2021-updated-guidance-for-virtual-assets-and-vasps
- Swiss Travel Rule overview, no threshold for unhosted wallets (21 Analytics): https://www.21analytics.co/travel-rule-regulations/switzerland-travel-rule-regulation/ · self-hosted wallets: https://www.21analytics.co/blog/transacting-with-self-hosted-wallets/ · Satoshi test: https://www.21analytics.co/blog/everything-about-the-satoshi-test/ · AOPP limitations (Notabene): https://notabene.id/post/aopp-constraints-and-limitations
- CHF 1'000 threshold for exchange transactions (FINMA, 2020/2022): https://www.finma.ch/en/news/2020/11/20201112-medienmitteilung-folgeregulierung-fidleg-finig/ · https://www.finma.ch/news/2022/11/20221102-mm-gwv-finma/
- EU TFR / EBA travel-rule guidelines (EUR 1'000): https://notabene.id/post/key-takeaways-from-the-ebas-consultation-on-travel-rule-guidelines
- Crypto-institution licence draft (2027 at the earliest): https://www.velaw.ch/en/crypto-institution-license-under-finig-the-next-regulatory-stage-for-the-swiss-crypto-market-federal-council-moves-forward-with-stablecoins-and-cryptos-consultation-opened/
- Revised FADP (1 Sep 2023): https://kellerhals-carrard.ch/en/news/newsletter-2-9-2022-completion-of-the-total-revision-of-the-federal-act-on-data-protection-fadp · FINMA Circular 2023/1 operational risks: https://www.grantthornton.ch/en/insights/finma-circular-operational-risks-resilience/
- Wallet ownership verification by jurisdiction (MeshPay, Jul 2026): https://www.meshpay.com/blog/wallet-ownership-verification-requirements-by-jurisdiction

## 3. Swissquote and market

- Swissquote crypto wallet FAQ (whitelisting, screenshots, "sole owner of the private key", no withdrawals to exchanges): https://www.swissquote.com/en-ch/private/trade/products/cryptocurrencies/wallet
- Swissquote crypto products: https://www.swissquote.com/en-ch/private/trade/products/cryptocurrencies · pricing: https://www.swissquote.com/en-ch/private/trade/pricing/cryptocurrencies · staking (20 % reward share): https://www.swissquote.com/en-ch/private/trade/products/crypto-staking
- Swissquote FY2025 results presentation: https://www.swissquote.com/en/api/internal/media/get-media?filename=2026-03%2FPress+conference+Results+FY-2025+vFinal.pdf · H1 2026 media release: https://www.swissquote.com/en/api/internal/media/get-media?filename=press-releases%2Fad+hoc_EN_Media_Release_H1_2026.pdf · AR 2024: https://www.swissquote.com/en/group/annual-report/2024/main-chapters/shareholders
- H1 2026 earnings call transcript (Bürki on crypto volatility): https://m.investing.com/news/transcripts/earnings-call-transcript-swissquote-h1-2026-profits-rise-stock-falls-12-93CH-4857037?ampMode=1
- Swissquote blog: the case for bank custody (USD 497.7 m phishing, USD 408.9 m key compromise in 2024): https://medium.com/swissquote-education/navigating-the-perilous-waters-of-cryptocurrency-the-case-for-swiss-bank-custody-dbbdad1c9ffe
- Swissquote Innovation Days 2025 (what their jury rewards): https://www.swissquote.com/en/group/annual-report/2025/business-cases/dare-to-make-a-difference · GitHub org: https://github.com/swissquote
- Taurus × Swissquote partnership (2021): https://www.taurushq.com/blog/taurus-partners-with-swissquote/ · 2019 bunker custody: https://www.coindesk.com/markets/2019/03/08/swissquote-bank-launching-nuke-proof-crypto-custody
- HSLU/LUKB 2026 study (18 % of Swiss hold crypto; trust beats price): https://www.swissinfo.ch/eng/various/almost-a-fifth-of-all-swiss-people-hold-crypto-assets/91667885 · https://cvj.ch/fokus/hintergrund/hslu-und-lukb-studie-18-der-schweizer-bevoelkerung-halten-krypto-assets/
- Self-custody survey (Protocol Theory, Apr 2026): https://www.streetinsider.com/Business+Wire/New+Research:+Crypto+Users+are+Increasingly+Relying+on+Self-Custody+Solutions+to+Send,+Receive,+and+Grow+Assets/26356985.html
- eToro acquires Zengo (~USD 70 m, Apr 2026): https://www.coindesk.com/business/2026/04/15/etoro-to-acquire-crypto-wallet-zengo-in-usd70-million-deal · Zengo security model: https://help.zengo.com/en/articles/2603678-how-zengo-security-model-works
- Revolut self-custody (Dec 2025): https://crypto.news/revolut-trust-wallet-integration-brings-instant-self-custody-crypto-buys-to-eea/
- PostFinance × Sygnum (56 % new to investing): https://www.finews.com/news/english-news/68111-alexander-thoma-interview-crypto-bitcoin-ethereum-staking
- Wallet swap fees compared (MetaMask 0.875 %): https://vultisig.com/articles/crypto-wallet-swap-fees-compared
- Kraken self-custody wallet: https://www.theblock.co/post/289448/kraken-launches-self-custodial-mobile-wallet-and-releases-its-open-source-code
- Cactus Swiss custody (keys stay in Switzerland): https://www.theblock.co/sponsored/2026-09-30-cactus-custody-launches-swiss-custody-service-with-keys-and-client-data-held-in-switzerland-417299

## 4. Hackathon craft and design

- What judges score (year of judging): https://dev.to/kurbaitaev/what-judges-actually-score-notes-from-a-year-of-hackathon-judging-3p4l · AngelHack demo tips: https://angelhack.com/blog/10-tips-to-help-you-rock-your-next-hackathon-demo/ · ETHGlobal demo format: https://ethglobal.com/events/cannes/info/details
- LauzHack 2023 projects (Swissquote challenge winners): https://2023.lauzhack.com/projects · https://lauzhack-2023.devpost.com/
- Julius Baer SwissHacks judging mindset: https://www.juliusbaer.com/en/insights/company-insights/behind-the-scenes/jbswisshacks-2024-making-it-to-show-whos-faking-it/
- Swiss style principles: https://www.jotform.com/blog/josef-muller-brockmann-principal-of-the-swiss-school/ · spotting AI UI defaults: https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c · https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p
- Swissquote brand colour (third-party, verify with eyedropper): https://logotyp.us/logo/swissquote/

## 5. Added during the build (6 Oct 2026)

- Candide authenticated endpoints (one URL for bundler and paymaster): https://docs.candide.dev/wallet/api/authenticated-endpoints · public testnet endpoint used by the prototype: https://api.candide.dev/public/v3/84532 (DECISIONS #11)
- Candide SocialRecoveryModule deployed source: Sourcify exact match for `0x949d01d424bE050D09C16025dd007CB59b3A8c66` on Ethereum Sepolia, OP Sepolia and Arbitrum Sepolia (https://sourcify.dev/). The module's GitHub `main` branch is version 0.2.0 with a `_nonce` parameter; the deployed testnet instances are version 0.0.1 (VERIFIED §3).
- Safe smart account contracts 1.4.1 and Safe4337Module v0.3.0: https://github.com/safe-global/safe-smart-account · https://github.com/safe-global/safe-modules/tree/main/modules/4337 · Safe passkey contracts (SafeWebAuthnSignerFactory, SharedSigner, FCLP256Verifier): https://github.com/safe-global/safe-modules/tree/main/modules/passkey
- OpenZeppelin `SignatureChecker.isValidSignatureNow` (what the module uses to accept EOA or ERC-1271 guardian signatures): https://docs.openzeppelin.com/contracts/5.x/api/utils#SignatureChecker
- ERC-1271 (contract signature validation): https://eips.ethereum.org/EIPS/eip-1271 · ERC-6492 (counterfactual signatures, not needed here): https://eips.ethereum.org/EIPS/eip-6492 · ERC-4337 (EntryPoint v0.7): https://eips.ethereum.org/EIPS/eip-4337 · EIP-712: https://eips.ethereum.org/EIPS/eip-712
- RIP-7212 (P-256 precompile at `0x100`): https://github.com/ethereum/RIPs/blob/master/RIPS/rip-7212.md
- viem (`signTypedData`, `verifyTypedData`, `simulateCalls`): https://viem.sh/ · abstractionkit 0.4.2 on npm: https://www.npmjs.com/package/abstractionkit · SimpleWebAuthn: https://simplewebauthn.dev/
- 0xB10C OFAC list, ETH branch consumed by the bank's screening snapshot: https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses/blob/lists/sanctioned_addresses_ETH.txt
- Base Sepolia explorer: https://sepolia.basescan.org/ · public RPC used: https://sepolia.base.org

## 6. Our proofs on Base Sepolia (from `docs/VERIFIED.md` and `docs/DECISIONS.md`)

| What | Address or transaction |
|---|---|
| SocialRecoveryModule, 3-minute instance | https://sepolia.basescan.org/address/0x949d01d424bE050D09C16025dd007CB59b3A8c66 |
| SocialRecoveryModule, 3-day instance | https://sepolia.basescan.org/address/0x38275826E1933303E508433dD5f289315Da2541c |
| EntryPoint v0.7 | https://sepolia.basescan.org/address/0x0000000071727De22E5E9d8BAf0edAc6f37da032 |
| Safe4337Module v0.3.0 | https://sepolia.basescan.org/address/0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226 |
| Swissquote recoverer EOA | https://sepolia.basescan.org/address/0x01Bbd43cd140a7BfcA7836e577470Af2B1d04dE8 |
| Safe created from the UI (passkey, sponsored, 3 guardians, threshold 2) | https://sepolia.basescan.org/address/0x291A6d162dc3bfa2c7a5B623d676cFeF4CEc4482 · protect tx https://sepolia.basescan.org/tx/0xa40c042a5774cd1fec93c9832d00311611fd6bd34896ef0b3a21be7e1850d425 |
| First sponsored deploy + protect (spike) | https://sepolia.basescan.org/tx/0x61a472d198e026cb4d3dd1f1b8f02803ccf8cc105002593c9b7de4f8c5cff4d5 |
| ERC-1271 attestation Safe | https://sepolia.basescan.org/address/0x2eac8081f2c00f526369AabB7492abE2ec280dea · create https://sepolia.basescan.org/tx/0xf317b51d0f9b3932eb2ddcc1f113ae0e3e3e90de6ea3309cdee7a5d9637785c3 |
| Recovery execute → finalize (0 ETH on every EOA) | https://sepolia.basescan.org/tx/0xb53f58a60c2202e499d9ed130b2fe56a328f2a6b885ee15f9190a5c0a2ef26e5 · https://sepolia.basescan.org/tx/0xcad741a3c66c039b28b41696492026839921ff5d13d7358207126cbecd51b874 |
| Recovery execute → owner cancel | https://sepolia.basescan.org/tx/0xc612a175a1e03f0cfee7de3a028a3e4c2112cddb8486c0a9fc89f618ff78ebc1 · https://sepolia.basescan.org/tx/0x5ba3e0db186f726f04c14c46211a52d37eec486d79418a1880ab3ceef0a931f9 |
| Recovery without Swissquote (`keyline recover --without-bank`) | https://sepolia.basescan.org/tx/0x7f7254b7ca8b5ced992d042052aeadb0d9302b9616bc588e7be1570dc3ae75cd · https://sepolia.basescan.org/tx/0xfad34f525dd19f01862aa581c0227c9ee7673288b9ae8d81e490c90cb28a16c8 |
| Sponsored relayer Safe (bank relayer key) | https://sepolia.basescan.org/address/0x8Fadb595e6f3b59123c7A20c2c895C697816361a |

## 7. Verification status

The kit's header said items marked `(verify)` came from secondary sources. The strategy text itself carries one such mark; the table below covers it and the other facts the submission leans on.

| Claim | Status | Where |
|---|---|---|
| `eth_simulateV1` works on `https://sepolia.base.org` (the one explicit `(verify)` in STRATEGY §13) | Verified live, 5 Oct | VERIFIED §4, DECISIONS #4 |
| 3-minute SocialRecoveryModule at `0x949d…8c66` on Base Sepolia, grace 180 s | Verified: bytecode present, immutable `180` read from bytecode, identical bytecode on Ethereum Sepolia, Sourcify exact match | VERIFIED §2 |
| `multiConfirmRecovery` accepts EOA signatures from any submitter | Verified from deployed source and live transactions | VERIFIED §3, §12 |
| Candide public endpoint sponsors on Base Sepolia without a key | Verified live (paymaster Trilema) | VERIFIED §5, DECISIONS #11 |
| EntryPoint v0.7 supported by Candide alongside v0.8/v0.9 | Verified (`eth_supportedEntryPoints`) | VERIFIED §5 |
| ERC-1271 attestation verifies against a passkey-owned Safe | Verified live, including two negative cases | VERIFIED §10 |
| SafeWebAuthn signer contracts: v0.2.0 set used by `SafeAccountV0_3_0` | Verified; SPEC's v0.2.1 labels corrected | VERIFIED §1–2, DECISIONS #12 |
| P-256 precompile at `0x100` handles our signatures | Partly: the signer is configured with `0x100` and all userOps validated on-chain; whether the precompile or the FCLP256Verifier fallback did the work was not measured separately | VERIFIED §2, §6 |
| Ackee audit of the SocialRecoveryModule | Not re-read during the build; the deployed bytecode matches the published source | kit source |
| Sygnum recovery on Safe RecoveryHub | Secondary sources only (Safe help centre, Sygnum press release); not independently checked | kit source |
| swiyu e-ID live 1 Dec 2026 | Secondary source (iamexpat.ch); not checked against eid.admin.ch during the build | kit source |
| Swissquote figures (CHF 85.7 m, CHF 14.6 m, 1.22 m accounts, CHF 96.3 bn) | Taken from the kit's reading of the FY2025 presentation and H1 2026 release; the PDFs were not re-opened during the build | BUSINESS §1 |
| HSLU/LUKB 18 %, Protocol Theory 66/33/19 %, PostFinance 56 %, eToro–Zengo USD 70 m | Secondary sources as listed; not re-checked | BUSINESS §1, §5 |
| FINMA Guidance 01/2026 content, 800 % risk weight | From Homburger's and Mondaq's summaries; the FINMA text itself not re-read | LEGAL §1 |
| MetaMask swap fee 0.875 % | Third-party comparison | BUSINESS §1 |
| Swissquote wallet FAQ: screenshots, no exchange withdrawals | Public page as read on 5 Oct 2026 | LEGAL §4, BUSINESS §2 |
