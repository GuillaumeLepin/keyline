import { notFound } from 'next/navigation';
import { DevReset } from './DevReset';

// Dev-only tool: it clears this browser profile's Keyline state before a fresh demo run.
export default function DevResetPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevReset rpId={process.env.WALLET_RP_ID ?? 'localhost'} />;
}
