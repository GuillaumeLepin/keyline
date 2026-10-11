'use client';

import { Question, SealCheck, ShieldWarning } from '@phosphor-icons/react/dist/ssr';
import { useCallback, useState } from 'react';

export type DappVerification = 'verified' | 'unverified' | 'flagged';

export type DappIdentityCopy = {
  /** "Verified domain" */
  verified: string;
  /** "Unverified" */
  unverified: string;
  /** "Flagged" */
  flagged: string;
};

export const DAPP_IDENTITY_COPY: DappIdentityCopy = {
  verified: 'Verified domain',
  unverified: 'Unverified',
  flagged: 'Flagged',
};

export type DappIdentityRowProps = {
  name: string;
  /** The app's URL as reported by WalletConnect (metadata.url); shown as its host, in mono. */
  url: string;
  iconUrl?: string;
  verification: DappVerification;
  copy?: Partial<DappIdentityCopy>;
  /** Inline after the name, same line (e.g. the `SIMULATED` chip for a demo app). */
  badge?: React.ReactNode;
  /** Right side (e.g. a chevron or `Disconnect` in a list). */
  trailing?: React.ReactNode;
  /** `compact`: 32 px icon (lists); default 40 px (sheets). */
  compact?: boolean;
};

/** `https://app.example.org/path` → `app.example.org`. Never throws. */
export function dappHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url.replace(/^[a-z]+:\/\//i, '').split('/')[0] ?? url;
  }
}

/** First letter of the name (or host), uppercased — the fallback icon. */
export function dappMonogram(name: string, url: string): string {
  const src = name.trim() || dappHost(url);
  const ch = [...src].find((c) => /\p{L}|\p{N}/u.test(c));
  return (ch ?? '?').toLocaleUpperCase();
}

const ICON = {
  verified: <SealCheck size={14} weight="fill" aria-hidden="true" />,
  unverified: <Question size={14} weight="bold" aria-hidden="true" />,
  flagged: <ShieldWarning size={14} weight="fill" aria-hidden="true" />,
} as const;

/**
 * Who is asking: the app's icon (monogram when it has none or it fails to load), its name, its domain
 * in mono — the part the user can check — and the verification chip from WalletConnect Verify
 * (icon + word, never colour alone). The same row heads every connection and request sheet.
 */
export function DappIdentityRow({
  name,
  url,
  iconUrl,
  verification,
  copy,
  badge,
  trailing,
  compact = false,
}: DappIdentityRowProps) {
  const t = { ...DAPP_IDENTITY_COPY, ...copy };
  const [broken, setBroken] = useState(false);
  // An icon that failed before hydration never fires onError again: check it when the node mounts.
  const probe = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setBroken(true);
  }, []);
  const host = dappHost(url);
  return (
    <div className={['kl2-dapp', compact ? 'kl2-dapp--compact' : ''].filter(Boolean).join(' ')}>
      <span className="kl2-dapp__icon" aria-hidden="true">
        {iconUrl && !broken ? (
          <img
            ref={probe}
            src={iconUrl}
            alt=""
            onError={() => setBroken(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="kl2-dapp__mono">{dappMonogram(name, url)}</span>
        )}
      </span>
      <span className="kl2-dapp__text">
        <span className="kl2-dapp__line">
          <span className="kl2-dapp__name">{name || host}</span>
          {badge}
        </span>
        <span className="kl2-dapp__meta">
          <span className="kl2-dapp__host">{host}</span>
          <span className={`kl2-verif kl2-verif--${verification}`}>
            {ICON[verification]}
            {t[verification]}
          </span>
        </span>
      </span>
      {trailing ? <span className="kl2-dapp__trail">{trailing}</span> : null}
    </div>
  );
}
