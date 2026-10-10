import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { PrefsRoot } from '@/src/i18n/PrefsRoot';
import { COOKIE, DEFAULT_PREFS, isCurrency, isLang } from '@/src/i18n/prefs';
import '@keyline/ui/v2.css';
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
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F6F3' },
    { media: '(prefers-color-scheme: dark)', color: '#141311' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Language, display currency and theme are per-profile settings mirrored into cookies, so the first paint
  // already matches what the client will render (no hydration mismatch, no theme flash).
  const jar = await cookies();
  const lang = jar.get(COOKIE.lang)?.value;
  const currency = jar.get(COOKIE.currency)?.value;
  const theme = jar.get(COOKIE.theme)?.value;
  const initial = {
    lang: isLang(lang) ? lang : DEFAULT_PREFS.lang,
    currency: isCurrency(currency) ? currency : DEFAULT_PREFS.currency,
  };
  return (
    <html
      lang={`${initial.lang}-CH`}
      data-theme={theme === 'light' || theme === 'dark' ? theme : 'system'}
      className={`${hanken.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body>
        <PrefsRoot initial={initial}>{children}</PrefsRoot>
      </body>
    </html>
  );
}
