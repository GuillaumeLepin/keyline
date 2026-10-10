'use client';

import { Printer } from '@phosphor-icons/react/dist/ssr';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { groupHex } from '../format';
import { Button } from './Button';

export const EMERGENCY_CARD_SENTENCE =
  'This card cannot spend your money. It can only help restore access after a waiting period you will see.';

export type EmergencyCardProps = {
  /** The card’s key (hex, 0x-prefixed). Shown once; the app never persists it. */
  privateKeyHex: string;
  /** The card’s address (the recoverer registered on-chain). */
  address: string;
  /** The wallet it protects. */
  walletAddress: string;
  /** Called after the user confirms "I stored it". The parent then drops the key from memory. */
  onStored: () => void;
  onPrint?: () => void;
  /** When true the confirm button reads "Stored" and is disabled. */
  stored?: boolean;
  /** Hide the action buttons (e.g. when rendering a preview in /design). */
  hideActions?: boolean;
  /** Translated strings (FR/DE); every key defaults to the English copy. */
  labels?: Partial<EmergencyCardLabels>;
};

export type EmergencyCardLabels = {
  title: string;
  forWallet: string;
  recovererAddress: string;
  sentence: string;
  print: string;
  confirm: string;
  stored: string;
  footnote: string;
};

export const EMERGENCY_CARD_LABELS: EmergencyCardLabels = {
  title: 'Keyline Emergency card',
  forWallet: 'For wallet',
  recovererAddress: 'Recoverer address',
  sentence: EMERGENCY_CARD_SENTENCE,
  print: 'Print',
  confirm: 'I stored it',
  stored: 'Stored',
  footnote: 'Shown once. Keyline keeps no copy.',
};

/**
 * Printable recoverer card: QR + grouped hex + the sentence. `@media print` isolates the card.
 */
export function EmergencyCard({
  privateKeyHex,
  address,
  walletAddress,
  onStored,
  onPrint,
  stored = false,
  hideActions = false,
  labels,
}: EmergencyCardProps) {
  const t = { ...EMERGENCY_CARD_LABELS, ...labels };
  const [confirmed, setConfirmed] = useState(stored);
  const groups = groupHex(privateKeyHex);

  function print() {
    onPrint?.();
    if (typeof window !== 'undefined') window.print();
  }

  return (
    <div className="kl-stack">
      {/* kl-paper: the card is a printed object, so it stays light paper in both themes. */}
      <section className="kl-ecard kl-paper" aria-label={t.title}>
        <div className="kl-ecard__head">
          <span className="kl-ecard__title">{t.title}</span>
        </div>
        <div className="kl-ecard__body">
          <QRCodeSVG value={privateKeyHex} size={112} level="M" className="kl-ecard__qr" marginSize={0} />
          <div className="kl-stack kl-stack--tight">
            <div className="kl-ecard__hex">
              {groups.map((g, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional hex groups
                  key={i}
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>
        {/* Full addresses: a printed card must be verifiable on Basescan without the app. */}
        <dl className="kl-ecard__ids">
          <div>
            <dt>{t.forWallet}</dt>
            <dd>{walletAddress}</dd>
          </div>
          <div>
            <dt>{t.recovererAddress}</dt>
            <dd>{address}</dd>
          </div>
        </dl>
        <p className="kl-ecard__sentence">{t.sentence}</p>
      </section>
      {hideActions ? null : (
        <div className="kl-ecard__actions">
          <Button variant="secondary" full icon={<Printer size={20} aria-hidden="true" />} onClick={print}>
            {t.print}
          </Button>
          <Button
            variant="primary"
            full
            disabled={confirmed}
            onClick={() => {
              setConfirmed(true);
              onStored();
            }}
          >
            {confirmed ? t.stored : t.confirm}
          </Button>
          <p className="kl-ecard__footnote">{t.footnote}</p>
        </div>
      )}
    </div>
  );
}
