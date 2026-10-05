import type { ReactNode } from 'react';
import { LaptopShell } from '@/src/components/LaptopShell';
import { Providers } from '@/src/components/Providers';

export default function LaptopLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <LaptopShell>{children}</LaptopShell>
    </Providers>
  );
}
