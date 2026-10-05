import { ArrowLeft } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** `← Title` top bar (DESIGN.md §10) with an optional right-side action. */
export function ScreenHeader({
  title,
  backHref,
  aside,
}: {
  title: string;
  backHref?: string;
  aside?: ReactNode;
}) {
  return (
    <header className="kl-topbar">
      <div className="flex items-center gap-2">
        {backHref ? (
          <Link href={backHref} className="kl-btn kl-btn--ghost kl-btn--sm kl-btn--icon" aria-label="Back">
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
        ) : null}
        <h1 className="kl-topbar__title">{title}</h1>
      </div>
      {aside}
    </header>
  );
}
