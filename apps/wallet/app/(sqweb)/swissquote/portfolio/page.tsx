import { SqPositionsResponseSchema } from '@keyline/shared';
import { cookies } from 'next/headers';
import { PortfolioView } from './PortfolioView';

/**
 * Server shell of A2 · Portfolio: reads the positions with the visitor's Swissquote web session cookie (same
 * `/sq/positions` the client polls, same zod schema) so the figures are in the HTML. Any failure → the client
 * fetches as before (skeleton, error state, sign-in redirect).
 */
export default async function PortfolioPage() {
  return <PortfolioView initial={await prefetchPositions()} />;
}

async function prefetchPositions() {
  try {
    const jar = await cookies();
    if (jar.size === 0) return undefined;
    const res = await fetch(`${process.env.NEXT_PUBLIC_BANK_URL}/sq/positions`, {
      headers: { cookie: jar.toString() },
      cache: 'no-store',
      signal: AbortSignal.timeout(1_500),
    });
    if (!res.ok) return undefined;
    return SqPositionsResponseSchema.parse(await res.json());
  } catch {
    return undefined;
  }
}
