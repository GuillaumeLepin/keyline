'use client';

import { type ReactNode, useEffect } from 'react';
import { PhoneFrame } from '@/src/ui';
import { bootstrapPersona, personaLabel, usePersona } from '../lib/device';
import { WcProvider } from '../wc/WcProvider';
import { WcSheets } from '../wc/WcSheets';
import { OfflineBanner } from './OfflineBanner';

/** Phone frame + DeviceBar for the client route group; applies `?device=` once per profile; hosts WalletConnect. */
export function ClientShell({ children }: { children: ReactNode }) {
  const persona = usePersona();
  useEffect(() => {
    bootstrapPersona('lea-phone');
  }, []);
  // Until the persona is known (first client render) we still render the phone so there is no layout jump;
  // the bar text arrives with hydration.
  const effective = persona ?? 'lea-phone';
  return (
    <WcProvider>
      <PhoneFrame persona={effective} personaLabel={personaLabel(effective)}>
        <OfflineBanner />
        {children}
        {/* SPEC §11: WalletConnect connection / request sheets, over whichever screen is open. */}
        <WcSheets />
      </PhoneFrame>
    </WcProvider>
  );
}
