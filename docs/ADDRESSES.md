# Demo EOAs (public addresses only — generated 5 Oct 2026 with viem generatePrivateKey; keys live in the per-process .env files, never committed)

| Role | Process / file | Address | Needs |
|---|---|---|---|
| Swissquote guardian | services/sq-guardian/.env | 0x01Bbd43cd140a7BfcA7836e577470Af2B1d04dE8 | >= 0.05 Base Sepolia ETH |
| Partner guardian (assisted mode, Wave 3 stretch) | services/partner-guardian/.env | 0x36973EC20a91B5D16bA861564DC4a49F0cC924f6 | >= 0.05 Base Sepolia ETH (optional) |
| Bank relayer | services/bank/.env | 0x11a2170B2fA64944F3b6ffB9De9Fb3246330F8a9 | >= 0.05 Base Sepolia ETH |
| Bank funder ("Top up from my Swissquote account") | services/bank/.env | 0x482B512e50e6FB886A70D027DF20b1D55369458A | >= 0.02 ETH + USDC from faucet.circle.com |
| Bank verdict signer | services/bank/.env | 0xba9a649F248BCBCF098680d9EA6E952F342BA23b | nothing (signs EIP-712 verdicts only) |
