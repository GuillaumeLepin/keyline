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
}: EmergencyCardProps) {
  const [confirmed, setConfirmed] = useState(stored);
  const groups = groupHex(privateKeyHex);

  function print() {
    onPrint?.();
    if (typeof window !== 'undefined') window.print();
  }

  return (
    <div className="kl-stack">
      <section className="kl-ecard" aria-label="Keyline Emergency card">
        <div className="kl-ecard__head">
          <span className="kl-ecard__title">Keyline Emergency card</span>
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
            <dt>For wallet</dt>
            <dd>{walletAddress}</dd>
          </div>
          <div>
            <dt>Recoverer address</dt>
            <dd>{address}</dd>
          </div>
        </dl>
        <p className="kl-ecard__sentence">{EMERGENCY_CARD_SENTENCE}</p>
      </section>
      {hideActions ? null : (
        <div className="kl-ecard__actions">
          <Button variant="secondary" full icon={<Printer size={20} aria-hidden="true" />} onClick={print}>
            Print
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
            {confirmed ? 'Stored' : 'I stored it'}
          </Button>
          <p className="kl-ecard__footnote">Shown once. Keyline keeps no copy.</p>
        </div>
      )}
    </div>
  );
}
