import { baseSepolia } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { http } from 'wagmi';
import { PROJECT_ID, RPC_URL } from './constants';

export const networks = [baseSepolia] as [typeof baseSepolia];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId: PROJECT_ID,
  ssr: true,
  transports: { [baseSepolia.id]: http(RPC_URL) },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
