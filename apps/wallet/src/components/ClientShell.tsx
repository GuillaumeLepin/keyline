'use client';

import { PhoneFrame } from '@keyline/ui';
import { type ReactNode, useEffect } from 'react';
import { bootstrapPersona, personaLabel, usePersona } from '../lib/device';

/** Phone frame + DeviceBar for the client route group; applies `?device=` once per profile. */
export function ClientShell({ children }: { children: ReactNode }) {
  const persona = usePersona();
  useEffect(() => {
    bootstrapPersona('lea-phone');
  }, []);
  // Until the persona is known (first client render) we still render the phone so there is no layout jump;
  // the bar text arrives with hydration.
  const effective = persona ?? 'lea-phone';
  return (
    <PhoneFrame persona={effective} personaLabel={personaLabel(effective)}>
      {children}
    </PhoneFrame>
  );
}
