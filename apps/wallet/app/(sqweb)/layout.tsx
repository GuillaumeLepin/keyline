import type { ReactNode } from 'react';
import { Providers } from '@/src/components/Providers';
import { SqWebShell } from '@/src/components/SqWebShell';

export default function SqWebLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <SqWebShell>{children}</SqWebShell>
    </Providers>
  );
}
