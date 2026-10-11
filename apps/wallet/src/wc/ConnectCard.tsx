'use client';

// SPEC §11.4 Connect: paste a `wc:` link or scan the app's QR (qr-scanner, loaded on demand); camera refusal is a calm
// note that points back to pasting. Pairing hands the link to WalletKit; the app's proposal then opens its sheet.
import { useEffect, useRef, useState } from 'react';
import { copyWc } from '../copy';
import { ConnectPanel, type ConnectPanelState, Note } from '../ui';
import { useWc } from './context';

/** A WalletConnect v2 pairing URI: `wc:<topic>@2?…symKey=…`. */
export function isWcUri(value: string): boolean {
  const v = value.trim();
  return /^wc:[0-9a-f]{64}@2\?/i.test(v) && /[?&]symKey=/.test(v);
}

function expiredUri(value: string): boolean {
  const m = /[?&]expiryTimestamp=(\d+)/.exec(value);
  return Boolean(m?.[1] && Number(m[1]) * 1000 < Date.now());
}

export function ConnectCard({ initialUri }: { initialUri?: string }) {
  const wc = useWc();
  const [value, setValue] = useState(initialUri ?? '');
  const [state, setState] = useState<ConnectPanelState>('idle');
  const [failure, setFailure] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<{ stop(): void; destroy(): void } | null>(null);
  const autoTried = useRef(false);

  const connect = async (raw: string = value) => {
    const uri = raw.trim();
    setFailure(null);
    if (!isWcUri(uri)) {
      setState('invalid');
      return;
    }
    if (expiredUri(uri)) {
      setState('expired');
      return;
    }
    if (!wc) return;
    setState('pairing');
    try {
      await wc.pair(uri);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState(/expired/i.test(message) ? 'expired' : 'idle');
      if (!/expired/i.test(message)) setFailure(copyWc.proposal.unreachable);
    }
  };

  // /wc?uri=… (deep link): connect once, as soon as WalletConnect is available.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once for the deep link
  useEffect(() => {
    if (!initialUri || autoTried.current || !wc) return;
    autoTried.current = true;
    connect(initialUri);
  }, [initialUri, wc]);

  // The proposal sheet took over: the panel is ready for the next link.
  useEffect(() => {
    if (state === 'pairing' && wc?.proposal) {
      setState('idle');
      setValue('');
    }
  }, [state, wc?.proposal]);

  const stopScan = () => {
    scanner.current?.stop();
    scanner.current?.destroy();
    scanner.current = null;
    setState('idle');
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: start once per scanning session
  useEffect(() => {
    if (state !== 'scanning') return;
    let cancelled = false;
    (async () => {
      const el = video.current;
      if (!el) return;
      const { default: QrScanner } = await import('qr-scanner');
      if (cancelled) return;
      const s = new QrScanner(
        el,
        (result) => {
          if (isWcUri(result.data)) {
            s.stop();
            s.destroy();
            scanner.current = null;
            setValue(result.data);
            connect(result.data);
          }
        },
        { returnDetailedScanResult: true, preferredCamera: 'environment' },
      );
      scanner.current = s;
      try {
        await s.start();
      } catch {
        s.destroy();
        scanner.current = null;
        if (!cancelled) setState('camera-denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => () => scanner.current?.destroy(), []);

  return (
    <div className="kl-stack" data-testid="wc-connect" data-state={state}>
      <ConnectPanel
        state={state}
        value={value}
        onChange={(v) => {
          setValue(v);
          if (state === 'invalid' || state === 'expired' || state === 'camera-denied') setState('idle');
        }}
        onConnect={() => {
          connect();
        }}
        onPaste={async () => {
          try {
            const text = await navigator.clipboard.readText();
            setValue(text);
            if (isWcUri(text)) connect(text);
          } catch {
            // Clipboard refused: the field stays editable (long-press paste).
          }
        }}
        onScan={() => setState('scanning')}
        onStopScan={stopScan}
        scanner={<video ref={video} className="h-full w-full object-cover" muted playsInline />}
        copy={copyWc.connect}
      />
      {failure ? <Note tone="danger">{failure}</Note> : null}
    </div>
  );
}
