// SPEC §11.3 — who is this WalletConnect dApp? Pure: Reown Verify context + metadata url + the bank allowlist.
//  - INVALID, isScam, or the attested origin's host ≠ the metadata url's host → blocked ("could not be verified");
//  - allowlisted by url host (policy/allowlist.json) → reviewed by Swissquote, tier by amount;
//  - VALID, not allowlisted → Tier 2 "First time with this app";
//  - UNKNOWN, not allowlisted → Tier 2 "This app's domain isn't verified".
import type { Dapp, DappVerify } from '@keyline/shared';

export const REASON_DAPP_IDENTITY = "This app's identity could not be verified";
export const REASON_DAPP_FIRST_TIME = 'First time with this app';
export const REASON_DAPP_UNVERIFIED = "This app's domain isn't verified";

export type DappIdentityLevel = 'allowlisted' | 'verified' | 'unverified' | 'blocked';
export type DappIdentity = {
  level: DappIdentityLevel;
  verdict: 'allow' | 'block';
  /** Client copy, first line is the headline. */
  reasons: string[];
  dappId?: string;
  allowlisted: boolean;
};

/** Lowercase `host` (with port) of a URL or bare origin; null when unparseable. */
export const hostOf = (value: string): string | null => {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return url.host.toLowerCase() || null;
  } catch {
    return null;
  }
};

export const dappIdentity = (
  meta: { name: string; url: string; verify: DappVerify },
  allowlist: readonly Dapp[],
): DappIdentity => {
  const urlHost = hostOf(meta.url);
  const originHost = hostOf(meta.verify.origin);
  const blockedBecause: string[] = [];
  if (meta.verify.isScam) blockedBecause.push('WalletConnect Verify reports this domain as a scam');
  if (meta.verify.validation === 'INVALID')
    blockedBecause.push("WalletConnect Verify says the page doesn't match the domain this app claims");
  if (!urlHost || !originHost) blockedBecause.push("The app's web address is not valid");
  else if (urlHost !== originHost)
    blockedBecause.push(`The request comes from ${originHost}, not from ${urlHost} as the app claims`);
  if (blockedBecause.length > 0)
    return {
      level: 'blocked',
      verdict: 'block',
      reasons: [REASON_DAPP_IDENTITY, ...blockedBecause],
      allowlisted: false,
    };

  const entry = allowlist.find((d) => d.allowlisted && hostOf(d.url) === urlHost);
  if (entry)
    return {
      level: 'allowlisted',
      verdict: 'allow',
      reasons: [`${meta.name} is reviewed by Swissquote`],
      dappId: entry.id,
      allowlisted: true,
    };
  if (meta.verify.validation === 'VALID')
    return { level: 'verified', verdict: 'allow', reasons: [REASON_DAPP_FIRST_TIME], allowlisted: false };
  return { level: 'unverified', verdict: 'allow', reasons: [REASON_DAPP_UNVERIFIED], allowlisted: false };
};
