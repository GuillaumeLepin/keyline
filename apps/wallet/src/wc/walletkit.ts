// SPEC §11 — the wallet side of WalletConnect v2: ONE Reown WalletKit per browser profile (client-only singleton).
// Sessions persist in this profile's storage (WalletKit's default IndexedDB/localStorage store), so a reload keeps
// them. The relay is Reown's (end-to-end encrypted); the project id is public config, not a secret.
// WalletKit is imported dynamically: the relay client stays out of every page's first load.
import type { IWalletKit, WalletKitTypes } from '@reown/walletkit';

export type WalletKit = IWalletKit;
export type { WalletKitTypes };

let instance: Promise<IWalletKit> | null = null;

export function reownProjectId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
  return id && id.length > 0 ? id : undefined;
}

/** The profile's WalletKit; created on first use. Rejects (and resets) when the relay can't be reached. */
export function getWalletKit(): Promise<IWalletKit> {
  if (typeof window === 'undefined') return Promise.reject(new Error('WalletKit runs in the browser only'));
  if (instance) return instance;
  const projectId = reownProjectId();
  if (!projectId)
    return Promise.reject(new Error('Missing NEXT_PUBLIC_REOWN_PROJECT_ID in apps/wallet/.env.local'));
  instance = (async () => {
    const [{ Core }, { WalletKit }] = await Promise.all([
      import('@walletconnect/core'),
      import('@reown/walletkit'),
    ]);
    const core = new Core({ projectId });
    return WalletKit.init({
      core,
      metadata: {
        name: 'Keyline',
        description: 'Self-custody wallet by Swissquote — only your phone can spend.',
        url: window.location.origin,
        icons: [`${window.location.origin}/icon-192.png`],
      },
    }) as Promise<IWalletKit>;
  })();
  instance.catch(() => {
    instance = null;
  });
  return instance;
}
