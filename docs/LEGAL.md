# Legal analysis: custody, AML, Travel Rule, data protection

Owner: `docs-submission`. Written 6 Oct 2026 for the Swissquote track. This is a hackathon team's reading of public sources, not legal advice. Every source is named inline; URLs are in `docs/SOURCES.md` and repeated here. Where the prototype does not implement something, it says "not built".

## 1. Is this custody, and why not

The Swiss test is power of disposal. Since the DLT Act (in force 1 Feb 2021 for the insolvency part, 1 Aug 2021 for the rest), Art. 16 no. 1bis of the Banking Act (BankA) treats crypto-based assets as custody assets if the bank holds them "ready at all times for the client", and Art. 242a of the Debt Enforcement and Bankruptcy Act (DEBA) lets a client reclaim them from the bankrupt estate when they are attributable to that client. FINMA Guidance 01/2026 (12 Jan 2026) restates what the supervisor expects of an institution that has power of disposal: segregation, reporting, operational controls.

Swiss doctrine draws the boundary where the provider cannot act alone. MME, "Provision of custody services for digital assets under Swiss law" (<https://www.mme.ch/en/magazine/articles/provision-of-custody-services-for-digital-assets-under-swiss-law>), caplaw on the DLT draft law's insolvency aspects (<https://caplaw.ch/2020/dlt-draft-law-insolvency-law-aspects/>) and IFLR on bankruptcy-remote custody (<https://www.iflr.com/article/2a63733ixysbvclr19i1c/switzerland-enabling-bankruptcy-remote-custody-of-crypto-assets>) say the same thing: where the client can dispose of the assets alone, or where several keys are needed and the provider does not hold enough of them to act, the assets are never part of the provider's estate, because the provider never had power of disposal.

Keyline against that test:

| Question | Answer | Where it is enforced |
|---|---|---|
| Who can move funds? | The client's phone key, alone | Safe owner list: one `SafeWebAuthnSignerProxy` |
| Can Swissquote move funds? | No. Its key is a recovery guardian, not an owner; the module cannot transfer assets | `SocialRecoveryModule` has no transfer function; `getOwners()` excludes Swissquote |
| Can Swissquote change the owner? | Not alone. Threshold 2 of 3; the other two guardians are client-held | `threshold(safe) = 2`, `getGuardians(safe)` |
| Can a change happen silently? | No. Execution starts an on-chain grace period; the owner can cancel | `executeAfter`, `cancelRecovery()` by the Safe |
| Does Swissquote hold the assets "ready for the client"? | No. It holds nothing; the client holds them | On-chain |

Conclusion. Swissquote has no power of disposal and has undertaken nothing resembling safekeeping. Keyline is software plus a recovery service, not custody and not a public deposit under the Banking Act. Consequences for the bank: no segregation booking, no custody-asset reporting under FINMA Guidance 03/2025, no custody insurance, no key-theft liability for assets the client holds. We do not claim a capital saving: segregated custody assets are already off the balance sheet, and the 800 % risk weight discussed by Homburger for FINMA Guidance 01/2026 (<https://www.homburger.ch/en/insights/finma-guidance-01-2026>) concerns crypto held on the bank's own balance sheet, which a custodian does not do either. The gain is operational risk, liability and compliance cost.

## 2. Could Swissquote, alone or with a partner, move the funds?

### Default mode (the only mode built)

No. The guardian list on every Safe the prototype creates is `[Swissquote, Emergency card, Safety key]` with threshold 2. Swissquote is the only institution in it. There is no second institution with which to reach 2. This is verifiable on Base Sepolia for the Safe created from the UI, `0x291A6d162dc3bfa2c7a5B623d676cFeF4CEc4482`:

```sh
cast call 0x949d01d424bE050D09C16025dd007CB59b3A8c66 "getGuardians(address)(address[])" 0x291A6d162dc3bfa2c7a5B623d676cFeF4CEc4482 --rpc-url https://sepolia.base.org
cast call 0x949d01d424bE050D09C16025dd007CB59b3A8c66 "threshold(address)(uint256)" 0x291A6d162dc3bfa2c7a5B623d676cFeF4CEc4482 --rpc-url https://sepolia.base.org
```

Expected: three addresses, of which exactly one is Swissquote's recoverer `0x01Bbd43cd140a7BfcA7836e577470Af2B1d04dE8`, and `2`. The guardian service itself checks this list before signing anything (`services/guardian-core/src/rules.ts`, rule 4).

The one honest qualification is vendor trust: the wallet application generates the Emergency card and the Safety key in the client's browser. A malicious release could capture them. That is a software-integrity risk shared by every non-custodial wallet; it does not give Swissquote power of disposal through the recovery key, and legally it does not convert software into custody. See `docs/THREAT-MODEL.md` §3.12.

### Assisted mode (the grey zone, not built)

The strategy describes an opt-in mode for clients who refuse any offline material: guardians would be `[Swissquote, independent partner, Safety key]`, threshold 2, on a 14-day module instance. There, Swissquote and the partner together could complete a recovery without the client after 14 public days, if the owner did not cancel. FATF's October 2021 guidance (§73, summarised by Notabene, <https://notabene.id/post/12-outcomes-from-fatfs-oct-2021-updated-guidance-for-virtual-assets-and-vasps>) warns that a multi-signature arrangement does not by itself exclude control. Our planned answer: the partner runs its own identity check and signs its own verdict, is contractually barred from cooperating with Swissquote outside a client-initiated request, and the 14-day on-chain delay with owner veto makes any joint action public and reversible. Whether that is enough to keep the bank out of custody is exactly what we would ask FINMA (section 7). In the prototype, a `partner-guardian` process skeleton exists but is never added to a guardian set. Not built. The claim in section 1 therefore applies to what is deployed.

## 3. AML still applies

Swissquote is a bank under the Anti-Money Laundering Act. Every Keyline client is an existing, fully identified client; the wallet is created inside an authenticated Swissquote session. Non-custodial does not mean unregulated: the bank keeps its client due diligence, transaction monitoring on the flows it orders or receives, and sanctions screening on the counterparties it sees. Schellenberg Wittmer's 2025 note on non-custodial wallet providers and the AMLA (<https://www.swlegal.com/media/filer_public/4d/de/4dde3fde-6886-40f4-b8e9-3ab1887a247c/20250506_-_lexology_-_legal_technology.pdf>) confirms that pure software provision is outside the AMLA, but Swissquote's own obligations as a bank do not change because it also provides software. Screening in the prototype: a pass-through stub that flags one seeded test address, with the OFAC SDN list snapshot vendored but not yet loaded (`services/bank/src/screening/index.ts`, labelled simulated).

## 4. Travel Rule and automatic ownership verification

FINMA Guidance 02/2019 "Payments on the blockchain" (<https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20190826-finma-aufsichtsmitteilung-02-2019.pdf>) together with Art. 10 AMLO-FINMA: a Swiss supervised institution may send to, or receive from, an external wallet only if that wallet belongs to its own client and ownership is proven by "suitable technical means". There is no amount threshold for this rule (21 Analytics, <https://www.21analytics.co/travel-rule-regulations/switzerland-travel-rule-regulation/>). The CHF 1'000 figure that circulates is the identification threshold for exchange transactions in FINMA's 2020 and 2022 AMLO-FINMA revisions, a different rule.

Today, Swissquote's wallet FAQ (<https://www.swissquote.com/en-ch/private/trade/products/cryptocurrencies/wallet>) asks clients to whitelist addresses and prove ownership with screenshots. The industry alternatives are the Satoshi test (<https://www.21analytics.co/blog/everything-about-the-satoshi-test/>) and AOPP, the Swiss address-ownership proof protocol from 21 Analytics, whose limits Notabene lists (<https://notabene.id/post/aopp-constraints-and-limitations>).

Keyline makes the proof cryptographic and automatic, and this part is built and proven. Right after deployment the Safe signs an EIP-712 `Attestation { clientId, address, chainId, nonce }` inside the authenticated session (`packages/chain/src/attestation.ts`). The nonce is a 32-byte single-use challenge issued by the bank (`GET /attestations/:wallet/challenge`, 10 minutes). The bank verifies with ERC-1271 against the deployed Safe (viem `verifyTypedData`), which makes the Safe call the passkey signer proxy. Live result on Safe `0x2eac8081f2c00f526369AabB7492abE2ec280dea`: `isValidSignature` returned `0x1626ba7e`; another passkey over the same challenge and the same signature over a tampered nonce both failed (`docs/VERIFIED.md` §10). The UI-created Safe `0x291A6d162dc3bfa2c7a5B623d676cFeF4CEc4482` passed the same check through the bank (DECISIONS #18). ERC-6492 would extend this to counterfactual accounts; not needed, because the attestation is signed after deployment. The bank then binds the address to the KYC file and whitelists it in both directions; top-ups from the (simulated) Swissquote account are only allowed to attested wallets (`services/bank/src/routes/topups.ts`).

Who is the sending institution:

| Case | Flow | Swissquote's role | Obligation |
|---|---|---|---|
| 1 | Swissquote account → Keyline wallet | Orders a transfer to its own client's verified external wallet | Exactly the FINMA 02/2019 case; satisfied by the ERC-1271 attestation |
| 2 | Keyline wallet → Swissquote account | Beneficiary institution; the sender is its own verified client | Same proof, same whitelist |
| 3 | Keyline wallet → third party | Swissquote's key is not required and it does not order the transfer; sponsoring gas and screening a transaction is not ordering it | Swissquote is not the ordering institution. The receiving VASP carries the obligation and can request a one-tap signed proof from the wallet (same attestation scheme); with consent, a Swissquote-signed "identified client" statement could accompany it. Not built |

If co-signing by the bank were mandatory for every transfer, a conservative reading could make Swissquote a payment service provider that orders the transaction. That is why co-signing stays optional in the design and why the Tier-2 Safety key is the client's own key, not the bank's.

## 5. Data protection

The link between a blockchain address and a client is bank-client confidential data under Art. 47 BankA and personal data under the revised Federal Act on Data Protection in force since 1 Sep 2023 (Kellerhals Carrard summary, <https://kellerhals-carrard.ch/en/news/newsletter-2-9-2022-completion-of-the-total-revision-of-the-federal-act-on-data-protection-fadp>). The attestation registry and the recovery desk hold that link and must be treated as such. The guardian service is part of a critical process under FINMA Circular 2023/1 on operational risks and resilience (Grant Thornton summary, <https://www.grantthornton.ch/en/insights/finma-circular-operational-risks-resilience/>). In production the Swissquote recovery key, the verdict key and the relayer key would sit in HSMs in Switzerland; in the prototype they are EOA keys in per-process `.env` files, never shared between processes (`docs/ADDRESSES.md`). What leaves Switzerland in default mode: nothing about the client's identity; the chain only sees addresses.

## 6. What the client is told

Onboarding states, in plain words, that the client holds the keys, that Swissquote can only help restore access together with one of the client's own recoverers, that recovery takes a waiting period during which the current phone can cancel, and that losing both the Safety key and the Emergency card with the phone means no recovery. Vocabulary follows CLAUDE.md: "recoverer", "Safety key", "Emergency card", "network fee". These disclosures are part of the custody argument: control, and the risk of control, sit visibly with the client.

## 7. What we would ask FINMA

Before launch, a no-action request under the usual enquiry procedure, with three questions:

1. Confirmation that a bank holding one of three recovery guardian keys, with threshold 2 and the other two keys client-held, has no power of disposal within the meaning of Art. 16 no. 1bis BankA and Art. 242a DEBA, and therefore provides no custody.
2. Whether the ERC-1271 attestation described in section 4 qualifies as "suitable technical means" under FINMA Guidance 02/2019 for both inbound and outbound transfers to the client's own wallet.
3. Whether an assisted mode with an independent second institution, a 14-day on-chain delay and an owner veto remains outside custody, and under which contractual conditions.

FINMA has not published a position on multi-party or threshold key arrangements; the crypto-institution licence under the FinIA revision is expected 2027 at the earliest (velaw.ch, <https://www.velaw.ch/en/crypto-institution-license-under-finig-the-next-regulatory-stage-for-the-swiss-crypto-market-federal-council-moves-forward-with-stablecoins-and-cryptos-consultation-opened/>). Until then the default mode is the one we would ship.
