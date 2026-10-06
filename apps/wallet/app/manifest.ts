import type { MetadataRoute } from 'next';

/** Installable PWA (SPEC §3 F1): icons come from packages/ui/assets, copied to /public. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Keyline',
    short_name: 'Keyline',
    description: 'Self-custody wallet with 2 of 3 recoverers. Prototype on Base Sepolia.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F6F3',
    theme_color: '#F7F6F3',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
