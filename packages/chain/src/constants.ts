/**
 * Chain constants, all taken from the installed abstractionkit (0.4.x) defaults so the initializer,
 * the gas-estimation dummy signature and the real signature agree on the same contracts.
 * Every address is verified on Base Sepolia in docs/VERIFIED.md.
 */
import { DEFAULT_SECP256R1_PRECOMPILE_ADDRESS, SafeAccountV0_3_0, SocialRecoveryModuleGracePeriodSelector } from 'abstractionkit';
import type { Address } from 'viem';

export const BASE_SEPOLIA_CHAIN_ID = 84532n;
export const ETHEREUM_SEPOLIA_CHAIN_ID = 11155111n;

export const ENTRYPOINT_V07 = SafeAccountV0_3_0.DEFAULT_ENTRYPOINT_ADDRESS as Address;
export const SAFE_4337_MODULE_V030 = SafeAccountV0_3_0.DEFAULT_SAFE_4337_MODULE_ADDRESS as Address;
export const SAFE_MODULE_SETUP = SafeAccountV0_3_0.DEFAULT_SAFE_MODULE_SETUP_ADDRESS as Address;

/** RIP-7212 / EIP-7951 P-256 precompile. abstractionkit's SafeAccountV0_3_0 default is 0x0 (none), so we pass it everywhere. */
export const P256_PRECOMPILE = DEFAULT_SECP256R1_PRECOMPILE_ADDRESS as Address;

/** Safe passkeys v0.2.0 set — the SafeAccountV0_3_0 defaults (shared signer owns the Safe only during the first userOp). */
export const WEBAUTHN_SHARED_SIGNER = SafeAccountV0_3_0.DEFAULT_WEB_AUTHN_SHARED_SIGNER as Address;
export const WEBAUTHN_SIGNER_FACTORY = SafeAccountV0_3_0.DEFAULT_WEB_AUTHN_SIGNER_FACTORY as Address;
export const WEBAUTHN_SIGNER_SINGLETON = SafeAccountV0_3_0.DEFAULT_WEB_AUTHN_SIGNER_SINGLETON as Address;
/** FCLP256Verifier — fallback used only when the precompile is absent. */
export const WEBAUTHN_CONTRACT_VERIFIER = SafeAccountV0_3_0.DEFAULT_WEB_AUTHN_CONTRACT_VERIFIER as Address;

/** Candide SocialRecoveryModule instances (same address on every supported network). */
export const RECOVERY_MODULE_3_MINUTES = SocialRecoveryModuleGracePeriodSelector.After3Minutes as Address;
export const RECOVERY_MODULE_3_DAYS = SocialRecoveryModuleGracePeriodSelector.After3Days as Address;
export const RECOVERY_MODULE_7_DAYS = SocialRecoveryModuleGracePeriodSelector.After7Days as Address;
export const RECOVERY_MODULE_14_DAYS = SocialRecoveryModuleGracePeriodSelector.After14Days as Address;

/**
 * The module stores its grace period as an `internal immutable` with no getter. These values were read
 * from the deployed runtime bytecode (PUSH32 immutable) — see docs/VERIFIED.md. `recovery.status()` also
 * exposes the live `executeAfter`, which is the only on-chain readable form once a recovery is executed.
 */
export const KNOWN_GRACE_PERIODS_SECONDS: Readonly<Record<string, number>> = {
  [RECOVERY_MODULE_3_MINUTES.toLowerCase()]: 180,
  [RECOVERY_MODULE_3_DAYS.toLowerCase()]: 259_200,
  [RECOVERY_MODULE_7_DAYS.toLowerCase()]: 604_800,
  [RECOVERY_MODULE_14_DAYS.toLowerCase()]: 1_209_600,
};

/** Overrides passed to every abstractionkit call that touches WebAuthn so the signer address never drifts. */
export const WEBAUTHN_OVERRIDES = {
  eip7212WebAuthnPrecompileVerifier: P256_PRECOMPILE,
  eip7212WebAuthnContractVerifier: WEBAUTHN_CONTRACT_VERIFIER,
  webAuthnSharedSigner: WEBAUTHN_SHARED_SIGNER,
  webAuthnSignerFactory: WEBAUTHN_SIGNER_FACTORY,
  webAuthnSignerSingleton: WEBAUTHN_SIGNER_SINGLETON,
} as const;

/**
 * Candide endpoints. One URL serves bundler and paymaster. The authenticated form needs the dashboard API key;
 * the public form is rate-limited per IP and meant for development only.
 */
export function candideEndpoint(chainId: bigint | number, apiKey?: string): string {
  const id = chainId.toString();
  return apiKey && apiKey.length > 0
    ? `https://api.candide.dev/api/v3/${id}/${apiKey}`
    : `https://api.candide.dev/public/v3/${id}`;
}

export function explorerTxUrl(chainId: bigint | number, txHash: string): string {
  const base = BigInt(chainId) === ETHEREUM_SEPOLIA_CHAIN_ID ? 'https://sepolia.etherscan.io' : 'https://sepolia.basescan.org';
  return `${base}/tx/${txHash}`;
}

export function explorerAddressUrl(chainId: bigint | number, address: string): string {
  const base = BigInt(chainId) === ETHEREUM_SEPOLIA_CHAIN_ID ? 'https://sepolia.etherscan.io' : 'https://sepolia.basescan.org';
  return `${base}/address/${address}`;
}
