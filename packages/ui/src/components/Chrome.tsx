import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';
import { SimulatedBadge } from './SimulatedBadge';

/* ---------- DeviceBar ---------- */

export type Persona = 'lea-phone' | 'lea-laptop' | 'lea-new-phone' | 'thief' | 'desk';

export const PERSONA_LABEL: Record<Persona, string> = {
  'lea-phone': 'Lea · phone',
  'lea-laptop': 'Lea · laptop — Safety key',
  'lea-new-phone': 'Lea · new phone',
  thief: 'Thief · stolen phone',
  desk: 'Swissquote desk (simulated)',
};

export type DeviceBarProps = {
  persona: Persona;
  /** Override the label (tests, custom personas). */
  label?: string;
};

const PERSONA_TONE: Record<Persona, string> = {
  'lea-phone': '',
  'lea-laptop': 'kl-devicebar--laptop',
  'lea-new-phone': 'kl-devicebar--new',
  thief: 'kl-devicebar--danger',
  desk: 'kl-devicebar--desk',
};

/** 28 px persona label bar so judges always know which browser profile they see. Each persona has its own tone; Thief is red. */
export function DeviceBar({ persona, label }: DeviceBarProps) {
  return (
    <div className={['kl-devicebar', PERSONA_TONE[persona]].filter(Boolean).join(' ')} role="note">
      {label ?? PERSONA_LABEL[persona]}
    </div>
  );
}

/* ---------- TestnetStrip ---------- */

export type TestnetStripProps = {
  network?: string;
  explorerUrl?: string;
  /** Translated sentence (whole, with the network name in it); defaults to the English one. */
  text?: string;
  /** Translated link label (default "View on Basescan"). */
  linkLabel?: string;
};

export function TestnetStrip({
  network = 'Base Sepolia',
  explorerUrl = 'https://sepolia.basescan.org',
  text,
  linkLabel = 'View on Basescan',
}: TestnetStripProps) {
  return (
    <div className="kl-testnet">
      <span>{text ?? `Test network · ${network} — nothing here is real money.`}</span>
      <a className="kl-link kl-link--quiet" href={explorerUrl} target="_blank" rel="noreferrer">
        {linkLabel}
        <ArrowSquareOut size={14} aria-hidden="true" />
      </a>
    </div>
  );
}

/* ---------- PhoneFrame ---------- */

export type PhoneFrameProps = {
  children: ReactNode;
  /** Renders the DeviceBar at the top of the screen. */
  persona?: Persona;
  personaLabel?: string;
  /** Padding-less content (for full-bleed screens). */
  bare?: boolean;
  className?: string;
};

/**
 * 390×844 phone drawn with CSS at ≥ 768 px; full-bleed below. Content scrolls inside the screen.
 */
export function PhoneFrame({ children, persona, personaLabel, bare = false, className }: PhoneFrameProps) {
  return (
    <div className="kl-phone-stage">
      <div className={['kl-phone', className ?? ''].filter(Boolean).join(' ')}>
        <div className="kl-phone__screen">
          {persona ? <DeviceBar persona={persona} label={personaLabel} /> : null}
          {bare ? children : <div className="kl-phone__content">{children}</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------- DeskLayout ---------- */

export type DeskNavItem = { label: string; href: string; current?: boolean };

export type DeskLayoutProps = {
  children: ReactNode;
  title?: string;
  operator?: string;
  onSignOut?: () => void;
  nav?: DeskNavItem[];
  /** Right side of the title bar (legend, filters…). */
  titleAside?: ReactNode;
  showLegend?: boolean;
  footer?: string;
};

export function DeskLegend() {
  return (
    <section className="kl-legend" aria-label="Legend">
      <span className="kl-legend__item">
        <span className="kl-legend__swatch" aria-hidden="true" />
        Real · On-chain and signed
      </span>
      <span className="kl-legend__item">
        <span className="kl-legend__swatch kl-legend__swatch--simulated" aria-hidden="true" />
        Simulated · Mocked for the prototype
      </span>
    </section>
  );
}

/** Swissquote recovery desk chrome. The footer sentence is not optional. */
export function DeskLayout({
  children,
  title,
  operator,
  onSignOut,
  nav,
  titleAside,
  showLegend = true,
  footer = 'This console cannot move client funds.',
}: DeskLayoutProps) {
  return (
    <div className="kl-desk">
      <DeviceBar persona="desk" />
      <header className="kl-desk__header">
        <div className="kl-desk__header-inner">
          <div className="kl-desk__brand">
            Swissquote · Recovery desk
            <SimulatedBadge />
          </div>
          {nav ? (
            <nav className="kl-desk__nav" aria-label="Desk">
              {nav.map((n) => (
                <a key={n.href} href={n.href} aria-current={n.current ? 'page' : undefined}>
                  {n.label}
                </a>
              ))}
            </nav>
          ) : null}
          {operator ? (
            <div className="kl-desk__operator">
              <span>Operator: {operator}</span>
              {onSignOut ? (
                <button type="button" onClick={onSignOut}>
                  Sign out
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      <main className="kl-desk__body">
        {title || titleAside || showLegend ? (
          <div className="kl-desk__titlebar">
            {title ? <h1 className="kl-desk__title">{title}</h1> : <span />}
            <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
              {titleAside}
              {showLegend ? <DeskLegend /> : null}
            </div>
          </div>
        ) : null}
        {children}
      </main>
      <footer className="kl-desk__footer">{footer}</footer>
    </div>
  );
}
