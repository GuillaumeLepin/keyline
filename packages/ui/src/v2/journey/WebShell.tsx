import type { ComponentType, ReactNode } from 'react';
import { Chip } from '../Chip';

export type WebNavItem = { label: string; href: string; current?: boolean };

export type WebShellCopy = {
  /** Text wordmark. No logo (DECISIONS #26.5). "Swissquote" */
  brand: string;
  /** "Prototype of Swissquote web — simulated" */
  prototype: string;
  /** Accessible name of the nav, e.g. "Swissquote". */
  navLabel: string;
  /** "Sign out" */
  signOut?: string;
  /** Translated chip label (FR `SIMULÉ`, DE `SIMULIERT`); default `SIMULATED`. */
  chipLabel?: string;
  /** Translated chip tooltip; default `CHIP_SIMULATED_TOOLTIP`. */
  chipTooltip?: string;
};

export type WebLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  'aria-current'?: 'page';
};

export type WebShellProps = {
  copy: WebShellCopy;
  /** Portfolio · Trade · Payments · Documents */
  nav: WebNavItem[];
  /** "Lea Keller". Omit on the sign-in page. */
  client?: string;
  /** "Account 4821 3307" */
  account?: string;
  onSignOut?: () => void;
  /** e.g. next/link. Defaults to a plain <a>. */
  linkAs?: ComponentType<WebLinkProps>;
  children: ReactNode;
};

function PlainLink({ href, className, children, ...rest }: WebLinkProps) {
  return (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  );
}

/**
 * The simulated Swissquote web chrome (laptop). A quiet strip states that this is a prototype and
 * carries the one SIMULATED chip for the whole area; under it the header: text wordmark, the four
 * sections (active = ink underline, never accent), client and account at the right.
 */
export function WebShell({ copy, nav, client, account, onSignOut, linkAs, children }: WebShellProps) {
  const Link = linkAs ?? PlainLink;
  return (
    <div className="kl2-web">
      <div className="kl2-web__proto">
        <div className="kl2-web__inner kl2-web__proto-inner">
          <span>{copy.prototype}</span>
          <Chip label={copy.chipLabel} tooltip={copy.chipTooltip} />
        </div>
      </div>
      <header className="kl2-web__head">
        <div className="kl2-web__inner kl2-web__head-inner">
          <span className="kl2-web__brand">{copy.brand}</span>
          {nav.length > 0 ? (
            <nav className="kl2-web__nav" aria-label={copy.navLabel}>
              {nav.map((n) => (
                <Link
                  key={n.label}
                  href={n.href}
                  className="kl2-web__navlink"
                  aria-current={n.current ? 'page' : undefined}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          ) : (
            <span className="kl2-web__spacer" />
          )}
          {client ? (
            <div className="kl2-web__client">
              <span className="kl2-web__who">
                <span className="kl2-web__name">{client}</span>
                {account ? <span className="kl2-web__acct">{account}</span> : null}
              </span>
              {onSignOut && copy.signOut ? (
                <button type="button" className="kl2-textbtn" onClick={onSignOut}>
                  {copy.signOut}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      <main className="kl2-web__inner kl2-web__main">{children}</main>
    </div>
  );
}
