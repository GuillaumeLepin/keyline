import { BitcoinPolicyDiagram } from '@/src/ui';
import { copyJourney, copyV2 } from '../copy';

/** F6 · Roadmap: Bitcoin — the same 2-of-3 + waiting-period policy, written as a script. Not in this prototype. */
export function BitcoinRoadmap() {
  const s = copyV2.security.bitcoin;
  return (
    <div className="grid gap-6" data-testid="bitcoin-roadmap">
      <p className="kl-lead max-w-[65ch]">{s.body}</p>
      <div className="overflow-x-auto">
        <BitcoinPolicyDiagram copy={copyJourney.btcPolicy} />
      </div>
      <p className="max-w-[65ch] text-14 text-ink-2">{s.why}</p>
      <p className="text-14 text-ink-3">{s.notHere}</p>
    </div>
  );
}
