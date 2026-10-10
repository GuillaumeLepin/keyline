'use client';

import { Copy, ShareNetwork, Warning } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useState } from 'react';
import { useCopy } from '../copy';
import { addressUrl } from '../lib/chain';
import { ActionButton, Address, Button, haptic, Note, QrCode, SheetV2 } from '../ui';

/** D3 Receive: QR, the address in full (grouped), Copy (with a confirmation state) and Share. */
export function ReceiveSheet({
  open,
  address,
  onClose,
}: {
  open: boolean;
  address: string;
  onClose: () => void;
}) {
  const t = useCopy();
  const r = t.copyC.receive;
  const [copied, setCopied] = useState<'idle' | 'success' | 'error'>('idle');
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);
  useEffect(() => {
    if (copied !== 'success') return;
    const id = setTimeout(() => setCopied('idle'), 2000);
    return () => clearTimeout(id);
  }, [copied]);
  useEffect(() => {
    if (!open) setCopied('idle');
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied('success');
      haptic('success');
    } catch {
      setCopied('error');
    }
  }

  async function share() {
    try {
      await navigator.share({ title: r.shareTitle, text: r.shareText(address) });
    } catch {
      // The person closed the share sheet: nothing to do.
    }
  }

  return (
    <SheetV2 open={open} title={r.title} onClose={onClose} contained>
      <div className="grid justify-items-center gap-4" data-testid="receive-sheet">
        <QrCode value={address} size={176} label={r.qrLabel} />
        <div className="w-full">
          <p className="kl-eyebrow m-0">
            {r.address} · {r.network}
          </p>
          <Address value={address} expanded copy={false} explorerUrl={addressUrl(address)} />
        </div>
        <Note tone="warn" icon={<Warning size={20} aria-hidden="true" />} className="w-full">
          {r.warning}
        </Note>
        <div className={`grid w-full gap-2 ${canShare ? 'grid-cols-2' : ''}`}>
          <ActionButton
            label={copied === 'success' ? r.copied : r.copy}
            status={copied === 'success' ? 'success' : 'idle'}
            successLabel={r.copied}
            icon={<Copy size={18} aria-hidden="true" />}
            variant="primary"
            full
            onClick={copy}
            data-testid="receive-copy"
          />
          {canShare ? (
            <Button
              variant="secondary"
              full
              icon={<ShareNetwork size={18} aria-hidden="true" />}
              onClick={share}
            >
              {r.share}
            </Button>
          ) : null}
        </div>
        {copied === 'error' ? (
          <p className="m-0 text-14 text-danger" role="alert">
            {r.copyFailed}
          </p>
        ) : copied === 'success' ? (
          <p className="kl2-sr" role="status">
            {r.copied}
          </p>
        ) : null}
      </div>
    </SheetV2>
  );
}
