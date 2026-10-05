import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @keyline/ui ships TypeScript sources (no build step); Next compiles them.
  transpilePackages: ['@keyline/ui', '@keyline/shared', '@keyline/chain'],
  // Several dev agents may share this machine; keep the dev indicator out of screenshots.
  devIndicators: false,
};

export default nextConfig;
