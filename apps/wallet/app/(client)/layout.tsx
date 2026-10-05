import type { ReactNode } from 'react';
import { ClientShell } from '@/src/components/ClientShell';
import { Providers } from '@/src/components/Providers';

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <ClientShell>{children}</ClientShell>
    </Providers>
  );
}
