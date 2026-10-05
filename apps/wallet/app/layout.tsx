import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';

// Self-hosted (apps/wallet/app/fonts) so the demo never depends on Google Fonts being reachable.
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
  title: 'Keyline',
  description: 'Self-custody wallet with 2 of 3 recoverers. Prototype on Base Sepolia.',
  applicationName: 'Keyline',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F7F6F3',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-CH" className={`${hanken.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
