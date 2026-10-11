import { getAddress, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';

export const CHAIN = baseSepolia;
export const CHAIN_ID = 84532 as const;

/** The app's own origin; SIWE `domain`/`uri` and the WalletConnect metadata url must match it. */
export const APP_ORIGIN = 'http://localhost:3100';
export const APP_DOMAIN = 'localhost:3100';

export const PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? '';
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org';

/** Circle USDC on Base Sepolia (SPEC §0), 6 decimals. */
export const USDC = getAddress(
  process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
);
export const USDC_DECIMALS = 6;

/**
 * Approval spender: the placeholder "DemoSwap router" already on the bank allowlist
 * (services/bank/policy/allowlist.json). No contract is deployed there; approving it moves no money.
 */
export const DEMO_SPENDER = getAddress('0xde305aa9000000000000000000000000000000de');

/**
 * The DemoSwap vault for the test "swap": a fresh random address generated once for this app; its
 * private key was discarded, so USDC sent here is gone (testnet only).
 */
export const DEMO_VAULT = getAddress('0x27AFbB361fEF28df20Da52e5905d1823E5570138');

/** Bank API (DEMO_FAST_MODE device-label auth) — read server-side by app/api/sanctioned. */
export const BANK_URL = process.env.BANK_URL || 'http://localhost:4000';
export const SANCTIONED_LABEL = 'Sanctioned test address';

export const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
]);

export const txUrl = (hash: string) => `${CHAIN.blockExplorers.default.url}/tx/${hash}`;
export const addressUrl = (address: string) => `${CHAIN.blockExplorers.default.url}/address/${address}`;
