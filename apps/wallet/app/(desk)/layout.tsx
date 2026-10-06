import type { ReactNode } from 'react';
import { DeskShell } from '@/src/components/DeskShell';
import { Providers } from '@/src/components/Providers';

export default function DeskRouteLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <DeskShell>{children}</DeskShell>
    </Providers>
  );
}
