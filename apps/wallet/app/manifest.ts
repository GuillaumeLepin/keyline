import type { MetadataRoute } from 'next';

/**
 * Installable PWA (SPEC §3 F1, DESIGN.md v2 §8). Icons: `any` = the key-line mark on paper
 * (packages/ui/assets, copied to /public); `maskable` = the protection ring on ink, full bleed, ring inside the
 * 80 % safe zone (rendered from public/icon-maskable.svg). A manifest has one theme/background colour, so it
 * carries the light values; per-theme colours come from the media-query `theme-color` metas in app/layout.tsx
 * (and `applyThemeColor` for an explicit Light/Dark choice).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Keyline — Swissquote self-custody wallet',
    short_name: 'Keyline',
    description: 'Self-custody wallet with 2 of 3 recoverers. Prototype on Base Sepolia.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F6F3',
    theme_color: '#F7F6F3',
    categories: ['finance'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
