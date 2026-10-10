'use client';

import { type ReactNode, useEffect } from 'react';
import { DeviceBar } from '@/src/ui';
import { bootstrapPersona, personaLabel, usePersona } from '../lib/device';
import { OfflineBanner } from './OfflineBanner';

/** Desk-width layout for the laptop persona (/pair, /approve): DeviceBar + content max 480 px, left-aligned. */
export function LaptopShell({ children }: { children: ReactNode }) {
  const persona = usePersona();
  useEffect(() => {
    bootstrapPersona('lea-laptop');
  }, []);
  const effective = persona ?? 'lea-laptop';
  return (
    <div className="min-h-dvh bg-bg">
      <DeviceBar persona={effective} label={personaLabel(effective)} />
      <main className="mx-auto w-full max-w-[1200px] px-6 py-12">
        <div className="kl-stack max-w-[480px] gap-6">
          <OfflineBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
