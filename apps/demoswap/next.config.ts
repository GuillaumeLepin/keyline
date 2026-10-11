import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { NextConfig } from 'next';

// @reown/appkit-adapter-wagmi peers on `@wagmi/connectors >=5.9.9`; pnpm resolved that to 8.x, which
// targets @wagmi/core 3 (`@wagmi/core/tempo`) and breaks the build next to wagmi 2.19. Pin the adapter to
// the connectors version wagmi 2.19 itself depends on (6.x) — no install needed, it is already in the store.
const fromWagmi = createRequire(
  createRequire(join(process.cwd(), 'package.json')).resolve('wagmi/package.json'),
);
const wagmiConnectorsDir = dirname(fromWagmi.resolve('@wagmi/connectors/package.json'));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @keyline/ui ships TypeScript sources (no build step); Next compiles them.
  transpilePackages: ['@keyline/ui'],
  devIndicators: false,
  // Same NodeNext-style `./x.js` → `.ts` mapping as apps/wallet, in case a workspace package needs it.
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@wagmi/connectors$': wagmiConnectorsDir,
      // Optional peers of @coinbase/cdp-sdk (reached via the Base Account connector, which DemoSwap
      // disables) that are not installed; stub them (empty modules) so the bundle builds.
      '@x402': false,
      // React Native storage that @metamask/sdk probes for; irrelevant in a browser.
      '@react-native-async-storage/async-storage': false,
    };
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    // WalletConnect pulls optional Node-only deps (pino-pretty, lokijs, encoding); keep them out of the bundle.
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      'pino-pretty',
      'lokijs',
      'encoding',
    ];
    return config;
  },
};

export default nextConfig;
