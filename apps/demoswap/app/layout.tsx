import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import '@keyline/ui/v2.css';
import './globals.css';

const hanken = localFont({
  src: [{ path: './fonts/HankenGrotesk-latin.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-hanken',
  display: 'swap',
});

const jetbrains = localFont({
  src: [{ path: './fonts/JetBrainsMono-latin.woff2', weight: '100 800', style: 'normal' }],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DemoSwap — test dApp for Keyline',
  description:
    'A test dApp on Base Sepolia that talks to any wallet over WalletConnect. Not a real exchange.',
  icons: { icon: '/demoswap.svg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${hanken.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
