'use client';
// @keyline/ui with the wallet's language applied. Every wallet screen imports primitives from here, so a
// primitive's built-in English defaults (close buttons, "Try again", "Step n of 6", the SIMULATED chip …) follow
// the language chosen in Settings. Anything not overridden below is re-exported unchanged.
import * as UI from '@keyline/ui';
import { type ComponentProps, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCopy } from './i18n/PrefsRoot';

export * from '@keyline/ui';

export function Address(props: ComponentProps<typeof UI.Address>) {
  const t = useCopy();
  return (
    <UI.Address
      {...props}
      labels={{
        show: t.copy.common.showFull,
        hide: t.copy.common.hideFull,
        copy: t.copy.common.copy,
        copied: t.copy.common.copied,
        copyAria: t.copyC.receive.copy,
        explorer: t.copy.common.viewOnBasescan,
        ...props.labels,
      }}
    />
  );
}

export function Chip(props: ComponentProps<typeof UI.Chip>) {
  const t = useCopy();
  return <UI.Chip label={t.copy.simulated.label} tooltip={t.copy.simulated.tooltip} {...props} />;
}

export function SimulatedBadge(props: ComponentProps<typeof UI.SimulatedBadge>) {
  const t = useCopy();
  return (
    <UI.Chip label={t.copy.simulated.label} tooltip={t.copy.simulated.tooltip} className={props.className} />
  );
}

export function ErrorState(props: ComponentProps<typeof UI.ErrorState>) {
  const t = useCopy();
  return (
    <UI.ErrorState
      title={t.copy.common.errorTitle}
      retryLabel={t.copy.common.tryAgain}
      detailLabel={t.copy.common.technicalDetails}
      {...props}
    />
  );
}

export function Stepper(props: ComponentProps<typeof UI.Stepper>) {
  const t = useCopy();
  const step = t.copy.onboarding.stepLabel(props.current, props.total, '').replace(/ · $/, '');
  return <UI.Stepper stepText={step} {...props} />;
}

/**
 * A `contained` sheet is portalled to the phone screen, so it always covers the whole phone (scrim over the
 * header too) even when the screen that opens it lives inside a StackView viewport (audit C-23).
 */
export function SheetV2(props: ComponentProps<typeof UI.SheetV2>) {
  const t = useCopy();
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    if (props.contained) setHost(document.querySelector('.kl-phone__screen'));
  }, [props.contained]);
  const sheet = <UI.SheetV2 closeLabel={t.copyC.nav.close} {...props} />;
  return props.contained && host ? createPortal(sheet, host) : sheet;
}

export function Sheet(props: ComponentProps<typeof UI.Sheet>) {
  const t = useCopy();
  return <UI.Sheet closeLabel={t.copyC.nav.close} {...props} />;
}

export function StackView(props: ComponentProps<typeof UI.StackView>) {
  const t = useCopy();
  return <UI.StackView backLabel={t.copyC.nav.back} {...props} />;
}

export function ActionButton(props: ComponentProps<typeof UI.ActionButton>) {
  const t = useCopy();
  return <UI.ActionButton successLabel={t.copy.common.done} {...props} />;
}

export function AmountField(props: ComponentProps<typeof UI.AmountField>) {
  const t = useCopy();
  return <UI.AmountField label={t.copy.send.amount} {...props} />;
}

export function ProtectionCountdown(props: ComponentProps<typeof UI.ProtectionCountdown>) {
  const t = useCopy();
  return <UI.ProtectionCountdown doneLabel={t.copy.recover.ready} {...props} />;
}

export function RowAction(props: ComponentProps<typeof UI.RowAction>) {
  const t = useCopy();
  return <UI.RowAction whyLabel={t.copyV2.sqWeb.portfolio.why} {...props} />;
}

export function TravelRuleLine(props: ComponentProps<typeof UI.TravelRuleLine>) {
  const t = useCopy();
  return <UI.TravelRuleLine text={t.copyV2.sqWeb.move.travelRule} {...props} />;
}

export function ThemeSwitch(props: ComponentProps<typeof UI.ThemeSwitch>) {
  const t = useCopy();
  return <UI.ThemeSwitch labels={t.copyC.settings.theme} legend={t.copyC.settings.appearance} {...props} />;
}

export function TestnetStrip(props: UI.TestnetStripProps) {
  const t = useCopy();
  return <UI.TestnetStrip text={t.copy.testnet.strip} linkLabel={t.copy.testnet.link} {...props} />;
}

export function CountdownRing(props: ComponentProps<typeof UI.CountdownRing>) {
  const t = useCopy();
  const u = t.copyC.ui;
  return (
    <UI.CountdownRing
      subLabel={u.remaining}
      doneLabel={t.copy.recover.ready}
      finishText={(clock, done) => (done ? u.finishedAt(clock) : u.finishesAt(clock))}
      {...props}
    />
  );
}

export function EmergencyCard(props: ComponentProps<typeof UI.EmergencyCard>) {
  const t = useCopy();
  const s3 = t.copy.onboarding.s3;
  return (
    <UI.EmergencyCard
      {...props}
      labels={{
        title: s3.cardTitle,
        forWallet: s3.forWallet,
        recovererAddress: t.copyC.ui.recovererAddress,
        sentence: s3.sentence,
        print: t.copy.common.print,
        confirm: s3.stored,
        stored: s3.storedDone,
        footnote: s3.shownOnce,
        ...props.labels,
      }}
    />
  );
}

/** The ring's hidden per-recoverer list ("Safety key: yes, …") in the active language. */
export function ProtectionRing(props: ComponentProps<typeof UI.ProtectionRing>) {
  const t = useCopy();
  const u = t.copyC.ui;
  const names = [
    t.copy.security.safetyKey.name,
    t.copy.security.emergencyCard.name,
    t.copy.security.swissquote.name,
  ];
  const on = (i: number): boolean => {
    switch (props.state) {
      case 'protected':
      case 'success':
        return true;
      case 'registering':
        return i < (props.registered ?? 0);
      case 'counting':
        return Boolean(props.lit?.[i]);
      default:
        return false;
    }
  };
  const detail = names.map((n, i) => u.ringItem(n, on(i) ? u.ringYes : u.ringNotYet)).join(', ');
  return <UI.ProtectionRing detail={detail} {...props} />;
}

export function KeyCard(props: ComponentProps<typeof UI.KeyCard>) {
  const t = useCopy();
  const sec = t.copyC.security;
  const word = { active: sec.statusActive, pending: sec.statusPending, revoked: sec.statusRemoved } as const;
  return <UI.KeyCard statusWord={props.status ? word[props.status] : undefined} {...props} />;
}
