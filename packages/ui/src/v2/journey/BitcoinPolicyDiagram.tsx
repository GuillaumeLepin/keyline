import { useId } from 'react';
import { arcAngles, arcPath, ringSpec } from '../ring-geometry';

export type BitcoinPolicyCopy = {
  /** Accessible name, e.g. "The same protection as a Bitcoin script" */
  title: string;
  /** Accessible description: the whole diagram in one or two sentences. */
  description: string;
  /** "Your key, now" */
  branch1: string;
  /** "pk(owner)" */
  branch1Code: string;
  /** "or" */
  or: string;
  /** "After the waiting period:" */
  branch2: string;
  /** "2 of 3 recoverers" */
  branch2Count: string;
  /** "Safety key · Emergency card · Swissquote" */
  recoverers: string;
  /** "and(older(waiting), thresh(2, …))" */
  branch2Code: string;
  /** "Now" */
  axisNow: string;
  /** "Waiting period ends" */
  axisWait: string;
  /** "time" */
  axisTime: string;
};

export type BitcoinPolicyDiagramProps = { copy: BitcoinPolicyCopy };

const W = 358;
const H = 248;
const WAIT_X = 150;

/**
 * The Keyline policy written as a Bitcoin script (Security → Roadmap: Bitcoin; the "Why?" sheet).
 * Two spending branches over one time axis: branch 1 (the owner's key) is usable from now; branch 2
 * (2 of 3 recoverers) only after the waiting period — dashed while it cannot be used. Drawn at
 * 358 px (the phone's content width) so the 12–14 px labels render at their true size. Hairlines,
 * ink, one ring glyph; no gradients. Colours come from tokens, so it follows the theme.
 */
export function BitcoinPolicyDiagram({ copy }: BitcoinPolicyDiagramProps) {
  const titleId = useId();
  const descId = useId();
  const glyph = ringSpec(24);
  const arcs = arcAngles(glyph.gapDeg);
  return (
    <svg
      className="kl2-bpd"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
    >
      <title id={titleId}>{copy.title}</title>
      <desc id={descId}>{copy.description}</desc>

      {/* guide: where the waiting period ends, from branch 2’s bar down to the axis */}
      <line className="kl2-bpd__guide" x1={WAIT_X} y1={186} x2={WAIT_X} y2={216} />

      {/* Branch 1 — the owner's key, any time */}
      <text className="kl2-bpd__t" x={0} y={16}>
        {copy.branch1}
      </text>
      <text className="kl2-bpd__mono" x={0} y={34}>
        {copy.branch1Code}
      </text>
      <line className="kl2-bpd__bar" x1={0} y1={52} x2={W} y2={52} />

      {/* or */}
      <text className="kl2-bpd__mono kl2-bpd__or" x={0} y={78}>
        {copy.or}
      </text>
      <line className="kl2-bpd__hair" x1={24} y1={74} x2={W} y2={74} />

      {/* Branch 2 — 2 of 3 recoverers, only after the waiting period */}
      <text className="kl2-bpd__t" x={0} y={106}>
        {copy.branch2}
      </text>
      <text className="kl2-bpd__t" x={0} y={124}>
        {copy.branch2Count}
      </text>
      <g transform="translate(0 134)">
        {arcs.map((a, i) => (
          <path
            key={a.recoverer}
            className={i < 2 ? 'kl2-bpd__arc' : 'kl2-bpd__track'}
            d={arcPath(glyph.centre, glyph.r, a.start, a.end)}
            strokeWidth={glyph.stroke}
            fill="none"
          />
        ))}
      </g>
      <text className="kl2-bpd__s" x={32} y={150}>
        {copy.recoverers}
      </text>
      <text className="kl2-bpd__mono" x={0} y={178}>
        {copy.branch2Code}
      </text>
      <line className="kl2-bpd__wait" x1={0} y1={194} x2={WAIT_X} y2={194} />
      <line className="kl2-bpd__bar" x1={WAIT_X} y1={194} x2={W} y2={194} />

      {/* time axis */}
      <line className="kl2-bpd__axis" x1={0} y1={216} x2={W - 1} y2={216} />
      <path className="kl2-bpd__arrow" d={`M ${W - 7} 212 L ${W - 1} 216 L ${W - 7} 220`} fill="none" />
      <line className="kl2-bpd__axis" x1={0.5} y1={211} x2={0.5} y2={221} />
      <line className="kl2-bpd__axis" x1={WAIT_X} y1={211} x2={WAIT_X} y2={221} />
      <text className="kl2-bpd__s" x={0} y={240}>
        {copy.axisNow}
      </text>
      <text className="kl2-bpd__s" x={WAIT_X} y={240} textAnchor="middle">
        {copy.axisWait}
      </text>
      <text className="kl2-bpd__s" x={W} y={240} textAnchor="end">
        {copy.axisTime}
      </text>
    </svg>
  );
}
