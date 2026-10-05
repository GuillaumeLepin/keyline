# Business case

Owner: `docs-submission`. Written 6 Oct 2026. Numbers are Swissquote's own published figures where available; third-party figures are named. The revenue arithmetic is illustrative and every assumption behind it is listed in section 6.

## 1. The numbers

| Fact | Value | Source |
|---|---|---|
| Swissquote crypto income, 2024 | CHF 85.5 m | Swissquote FY2025 results presentation (<https://www.swissquote.com/en/api/internal/media/get-media?filename=2026-03%2FPress+conference+Results+FY-2025+vFinal.pdf>) |
| Swissquote crypto income, 2025 | CHF 85.7 m, about 12 % of CHF 723 m net revenue | Same |
| Swissquote crypto income, H1 2026 | CHF 14.6 m, down 66 % year on year; CEO Marc Bürki: "volatility remained very low" | H1 2026 media release (<https://www.swissquote.com/en/api/internal/media/get-media?filename=press-releases%2Fad+hoc_EN_Media_Release_H1_2026.pdf>); earnings call transcript (<https://m.investing.com/news/transcripts/earnings-call-transcript-swissquote-h1-2026-profits-rise-stock-falls-12-93CH-4857037?ampMode=1>) |
| Client assets | CHF 96.3 bn | H1 2026 media release |
| Accounts | 1.22 m, of which about 423 k Yuh | H1 2026 media release |
| Net new money, H1 2026 | CHF 5.1 bn | H1 2026 media release |
| Swiss residents holding crypto | 18 % | HSLU / LUKB 2026 study (<https://www.swissinfo.ch/eng/various/almost-a-fifth-of-all-swiss-people-hold-crypto-assets/91667885>) |
| Trust over price | Doubling fees barely changed respondents' choices; the median respondent preferred a cantonal bank over Coinbase | Same study (<https://cvj.ch/fokus/hintergrund/hslu-und-lukb-studie-18-der-schweizer-bevoelkerung-halten-krypto-assets/>) |
| Self-custody demand | 66 % of crypto users call self-custody important, 33 % use it, 19 % cite complexity as the barrier | Protocol Theory survey, Apr 2026 (<https://www.streetinsider.com/Business+Wire/New+Research:+Crypto+Users+are+Increasingly+Relying+on+Self-Custody+Solutions+to+Send,+Receive,+and+Grow+Assets/26356985.html>) |
| Acquisition effect of crypto | 56 % of PostFinance crypto clients had never used an investment product before | finews interview with Alexander Thoma (<https://www.finews.com/news/english-news/68111-alexander-thoma-interview-crypto-bitcoin-ethereum-staking>) |
| Loss hook | USD 408.9 m lost to private-key compromise and USD 497.7 m to phishing in 2024 | Swissquote Education blog (<https://medium.com/swissquote-education/navigating-the-perilous-waters-of-cryptocurrency-the-case-for-swiss-bank-custody-dbbdad1c9ffe>) |
| Current price points | Crypto trading 1 %; staking reward share 20 %; custody fee CHF 20–50 per quarter | Swissquote pricing (<https://www.swissquote.com/en-ch/private/trade/pricing/cryptocurrencies>) and staking page (<https://www.swissquote.com/en-ch/private/trade/products/crypto-staking>) |
| Competitor swap fee | MetaMask 0.875 % | Vultisig comparison (<https://vultisig.com/articles/crypto-wallet-swap-fees-compared>) |

## 2. The paragraph

Swissquote earned CHF 85.7 m from crypto in 2025 but only CHF 14.6 m in H1 2026, because that income follows trading volatility. Meanwhile 18 % of Swiss residents hold crypto, trust matters more to them than price, and the post-FTX habit is to move coins off platforms. A Swissquote client who wants self-custody or DeFi today has to leave: the wallet FAQ (<https://www.swissquote.com/en-ch/private/trade/products/cryptocurrencies/wallet>) states that withdrawals to exchanges are not supported and that external wallets must be whitelisted with screenshots; Yuh allows no transfers out. Keyline keeps that client one tap from their Swissquote account, with recovery, screening and plain-language transaction review that no stand-alone wallet offers, and without Swissquote taking custody. The revenue it adds does not depend on volatility: an in-wallet swap fee, non-custodial staking at the existing reward share, and a monthly tier that covers gas sponsorship and recovery. The larger value is retention and acquisition: every 1 % of crypto activity that stays in the ecosystem is about CHF 0.86 m a year at 2025 levels, and at PostFinance 56 % of crypto clients were new to investing.

## 3. Revenue lines, illustrative

| Line | Assumption | Arithmetic | Result per year |
|---|---|---|---|
| In-wallet swap fee | 40 k wallets (5 % of the roughly 800 k non-Yuh accounts), CHF 4'000 swap volume each, 0.5 % fee (below MetaMask's 0.875 %) | 40'000 × 4'000 × 0.005 | about CHF 0.8 m |
| Non-custodial staking | CHF 50 m staked, 2.5 % reward, 20 % reward share (existing Swissquote rate) | 50'000'000 × 0.025 × 0.20 | about CHF 0.25 m |
| "Protected" tier | 20 k subscribers at CHF 5 per month (gas sponsorship, assisted recovery, screening) | 20'000 × 5 × 12 | about CHF 1.2 m |
| On/off-ramp | Existing 1 % trading fee on top-ups and withdrawals between the Swissquote account and the wallet | Not estimated separately; already in today's crypto income | — |
| Total direct | | | about CHF 2.25 m |

This is small next to CHF 85.7 m of trading income. It is also non-cyclical, and it is the price of not losing the client who wants to hold their own keys.

## 4. Retention, acquisition, cost

Retention. Each 1 % of 2025 crypto income is CHF 0.86 m. Assets in Keyline stay visible in the client's Swissquote dashboard (the attestation binds the address to the client file), so the client keeps one view of their wealth and the bank keeps the relationship.

Acquisition. The PostFinance figure suggests crypto is an entry product for people who have never invested. A wallet that a non-specialist can recover without a seed phrase lowers the barrier that 19 % of users cite.

Cost. Wallet ownership checks become automatic: no screenshots, no Satoshi test, no manual whitelisting (the ERC-1271 attestation is built and verified live, `docs/LEGAL.md` §4). No custody insurance, no key-theft liability and no segregation bookkeeping for assets the client holds. Gas sponsorship costs Swissquote about USD 0.02 to 0.10 per transaction on an Ethereum L2 at current prices, capped per client per day (20 in the prototype's policy engine, `services/bank/src/policy/engine.ts`). The recovery desk is one operator screen per request, not a 24/7 custody operation.

## 5. Precedents

| Who | What | Why it matters | Source |
|---|---|---|---|
| eToro | Agreed to buy Zengo, a non-custodial 2-of-2 MPC wallet, for about USD 70 m (Apr 2026) | A regulated broker bought self-custody rather than build custody | <https://www.coindesk.com/business/2026/04/15/etoro-to-acquire-crypto-wallet-zengo-in-usd70-million-deal> |
| Revolut | Opened self-custody withdrawals via Trust Wallet to its EEA users (Dec 2025) | A 50 m-user neobank decided clients must be able to leave with their coins | <https://crypto.news/revolut-trust-wallet-integration-brings-instant-self-custody-crypto-buys-to-eea/> |
| Sygnum | Recovery service on Safe RecoveryHub (Oct 2024) | A Swiss bank already runs the guardian pattern Keyline uses | <https://www.sygnum.com/news/sygnum-launches-web3-wallet-recovery-built-on-safe/> |
| Coinbase | Smart Wallet with passkeys and sponsored gas | Passkey-owned smart accounts are a mainstream pattern | public product |
| Kraken | Open-source self-custodial mobile wallet | Exchanges treat self-custody as a retention product | <https://www.theblock.co/post/289448/kraken-launches-self-custodial-mobile-wallet-and-releases-its-open-source-code> |
| PostFinance | Crypto via Sygnum; 56 % of crypto clients new to investing | Acquisition evidence from a Swiss retail bank | <https://www.finews.com/news/english-news/68111-alexander-thoma-interview-crypto-bitcoin-ethereum-staking> |

## 6. Assumptions, stated

1. Adoption of 5 % of non-Yuh accounts is a guess. There is no published Swissquote figure for the share of clients holding crypto; the 18 % national figure is for all Swiss residents.
2. CHF 4'000 of annual swap volume per wallet and CHF 50 m staked are round numbers chosen to show the order of magnitude, not forecasts.
3. The 2.5 % staking reward is a blended assumption; ETH staking yields vary and Swissquote's reward share applies to its current custodial staking, not yet to a non-custodial product.
4. 20 k paying subscribers at CHF 5 per month assumes half of the wallets take the paid tier. No willingness-to-pay data was collected.
5. The CHF 0.86 m per 1 % retention figure uses 2025 income; at H1 2026 run-rate it would be about CHF 0.3 m.
6. Gas cost per transaction is an estimate from current L2 fees and would change with network conditions; the prototype pays nothing because the Candide testnet sponsor is free.
7. "Swissquote clients must leave to self-custody" is based on the public wallet FAQ as of Oct 2026; product terms can change.
8. Legal conclusions in `docs/LEGAL.md` are a team reading; a FINMA no-action letter would be sought before any launch, and the business case assumes that answer is favourable.
9. Nothing in this document was validated with Swissquote staff.
