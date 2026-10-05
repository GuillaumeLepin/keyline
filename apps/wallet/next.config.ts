import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @keyline/ui ships TypeScript sources (no build step); Next compiles them.
  transpilePackages: ['@keyline/ui', '@keyline/shared', '@keyline/chain'],
  // Several dev agents may share this machine; keep the dev indicator out of screenshots.
  devIndicators: false,
  // packages/chain uses NodeNext-style `./x.js` specifiers for `.ts` sources; map them for webpack and Turbopack.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
};

export default nextConfig;
