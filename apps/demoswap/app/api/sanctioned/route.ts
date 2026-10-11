import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { BANK_URL, SANCTIONED_LABEL } from '@/src/constants';

export const dynamic = 'force-dynamic';

type Contact = { label: string; address: string };

/**
 * Server-side read of the bank's seeded sanctioned address. Proxied here because the bank's CORS
 * allows only the wallet origin (:3000), not :3100. Uses the DEMO_FAST_MODE device-label auth.
 */
export async function GET() {
  try {
    const res = await fetch(`${BANK_URL}/contacts`, {
      headers: { 'X-Device-Label': 'demoswap' },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Bank answered ${res.status} on GET /contacts` }, { status: 502 });
    }
    const body = (await res.json()) as { contacts?: Contact[] };
    const hit = body.contacts?.find((c) => c.label === SANCTIONED_LABEL);
    if (!hit || !isAddress(hit.address)) {
      return NextResponse.json({ error: `No contact labelled "${SANCTIONED_LABEL}"` }, { status: 404 });
    }
    return NextResponse.json({ address: hit.address, source: `${BANK_URL}/contacts` });
  } catch (e) {
    return NextResponse.json(
      { error: `Bank unreachable at ${BANK_URL} (${e instanceof Error ? e.message : String(e)})` },
      { status: 502 },
    );
  }
}
