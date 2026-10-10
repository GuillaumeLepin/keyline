import { QRCodeSVG } from 'qrcode.react';

export type QrCodeProps = { value: string; size?: number; label: string };

/** QR on its own white quiet zone in both themes (scanners need dark-on-light). */
export function QrCode({ value, size = 112, label }: QrCodeProps) {
  return (
    <span className="kl2-qr" role="img" aria-label={label}>
      <QRCodeSVG value={value} size={size} level="M" bgColor="#ffffff" fgColor="#141414" />
    </span>
  );
}
