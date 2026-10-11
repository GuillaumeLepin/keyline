'use client';

import { createAppKit } from '@reown/appkit/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { APP_ORIGIN, PROJECT_ID } from '@/src/constants';
import { networks, wagmiAdapter, wagmiConfig } from '@/src/wagmi';

// One AppKit instance per page load. WalletConnect only: no injected/EIP-6963/Coinbase connectors,
// no email/social login, no swaps/onramp — the modal shows the QR and "Copy link".
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: networks[0],
  projectId: PROJECT_ID,
  metadata: {
    name: 'DemoSwap',
    description: 'Test dApp for Keyline (Base Sepolia)',
    url: APP_ORIGIN,
    icons: [`${APP_ORIGIN}/demoswap.svg`],
  },
  enableWalletConnect: true,
  enableInjected: false,
  enableEIP6963: false,
  enableCoinbase: false,
  enableBaseAccount: false,
  enableWalletGuide: false,
  allWallets: 'HIDE',
  // No recommended wallets from the Reown explorer either: the only way in is the WalletConnect QR / link.
  featuredWalletIds: [],
  includeWalletIds: ['none'],
  allowUnsupportedChain: false,
  features: {
    analytics: false,
    email: false,
    socials: false,
    swaps: false,
    onramp: false,
    send: false,
    receive: false,
    history: false,
    pay: false,
    reownAuthentication: false,
  },
  themeMode: 'light',
  themeVariables: {
    '--w3m-font-family': 'var(--font-hanken), Helvetica Neue, Arial, sans-serif',
    '--w3m-accent': '#141414',
    '--w3m-border-radius-master': '2px',
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
