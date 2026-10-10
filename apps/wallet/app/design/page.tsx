'use client';

import { ThemeSwitch, useThemePreference } from '@keyline/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { journeyLab, page } from './copy';
import { JourneyLab } from './JourneyLab';
import { MotionLab } from './MotionLab';
import { CountdownMock } from './mocks/Countdown';
import { HomeMock } from './mocks/Home';
import { PortfolioMock } from './mocks/Portfolio';
import { ProtectMock, type ProtectPhase } from './mocks/Protect';
import { ReviewMock, type ReviewPhase } from './mocks/Review';
import { RingLab, useProtectSequence } from './RingLab';
import { TokensLab } from './TokensLab';

const PHASES: ProtectPhase[] = ['idle', 'signing', 1, 2, 3, 'protected'];
const GRACE_MS = 180_000;

export default function DesignV2Page() {
  const root = useRef<HTMLDivElement>(null);
  const target = useCallback(() => root.current, []);
  const [theme, setTheme] = useThemePreference(target);

  const protect = useProtectSequence(800);

  const [reviewPhase, setReviewPhase] = useState<ReviewPhase>('review');
  const reviewTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => reviewTimers.current.forEach(clearTimeout), []);
  const confirm = () => {
    setReviewPhase('loading');
    reviewTimers.current.push(setTimeout(() => setReviewPhase('success'), 1100));
    reviewTimers.current.push(setTimeout(() => setReviewPhase('receipt'), 1800));
  };

  // Set on the client only, so the server render and hydration agree.
  const [endsAt, setEndsAt] = useState<number | null>(null);
  useEffect(() => setEndsAt(Date.now() + 161_000), []);

  return (
    <div ref={root} className="dz">
      <header className="dz-top">
        <div className="dz-top__inner">
          <span className="dz-top__brand">{page.title}</span>
          <nav className="dz-top__nav" aria-label="Sections">
            <a href="#ring">{page.nav.ring}</a>
            <a href="#screens">{page.nav.screens}</a>
            <a href="#journey">{page.nav.journey}</a>
            <a href="#motion">{page.nav.motion}</a>
            <a href="#tokens">{page.nav.tokens}</a>
          </nav>
          <ThemeSwitch value={theme} onChange={setTheme} legend={page.theme} />
        </div>
      </header>
      <main className="dz-wrap">
        <section className="dz-hero">
          <h1 className="dz-h1">{page.thesis}</h1>
          <p className="dz-lead">{page.status}</p>
        </section>

        <section id="ring" className="dz-sec" aria-labelledby="ring-h">
          <h2 id="ring-h" className="dz-h2">
            {page.ring.title}
          </h2>
          <p className="dz-lead">{page.ring.lead}</p>
          <RingLab />
        </section>

        <section id="screens" className="dz-sec" aria-labelledby="screens-h">
          <h2 id="screens-h" className="dz-h2">
            {page.screens.title}
          </h2>
          <p className="dz-lead">{page.screens.lead}</p>
          <div className="dz-screens">
            <div className="dz-shot" data-testid="hero-portfolio">
              <div className="dz-shot__head">
                <h3 className="dz-h3">{page.screens.portfolio}</h3>
              </div>
              <PortfolioMock />
            </div>
            <div className="dz-phones">
              <div className="dz-shot" data-testid="hero-protect">
                <div className="dz-shot__head">
                  <h3 className="dz-h3">{page.screens.protect}</h3>
                  <button
                    type="button"
                    className="kl-btn kl-btn--secondary kl-btn--sm"
                    onClick={protect.play}
                    data-testid="protect-play"
                  >
                    {page.screens.playProtect}
                  </button>
                </div>
                <ProtectMock phase={PHASES[protect.step] ?? 'idle'} onProtect={protect.play} />
              </div>
              <div className="dz-shot" data-testid="hero-home">
                <div className="dz-shot__head">
                  <h3 className="dz-h3">{page.screens.home}</h3>
                </div>
                <HomeMock />
              </div>
              <div className="dz-shot" data-testid="hero-review">
                <div className="dz-shot__head">
                  <h3 className="dz-h3">{page.screens.review}</h3>
                  <button
                    type="button"
                    className="kl-btn kl-btn--secondary kl-btn--sm"
                    onClick={() => setReviewPhase('review')}
                  >
                    {page.screens.resetReview}
                  </button>
                </div>
                <ReviewMock phase={reviewPhase} onConfirm={confirm} onBack={() => setReviewPhase('review')} />
              </div>
              <div className="dz-shot" data-testid="hero-countdown">
                <div className="dz-shot__head">
                  <h3 className="dz-h3">{page.screens.countdown}</h3>
                  <button
                    type="button"
                    className="kl-btn kl-btn--secondary kl-btn--sm"
                    onClick={() => setEndsAt(Date.now() + 5_000)}
                    data-testid="countdown-last"
                  >
                    {page.screens.lastSeconds}
                  </button>
                </div>
                {endsAt !== null ? <CountdownMock endsAt={endsAt} durationMs={GRACE_MS} /> : null}
              </div>
            </div>
          </div>
        </section>

        <section id="journey" className="dz-sec" aria-labelledby="journey-h">
          <h2 id="journey-h" className="dz-h2">
            {journeyLab.title}
          </h2>
          <p className="dz-lead">{journeyLab.lead}</p>
          <JourneyLab />
        </section>

        <section id="motion" className="dz-sec" aria-labelledby="motion-h">
          <h2 id="motion-h" className="dz-h2">
            {page.motion.title}
          </h2>
          <p className="dz-lead">{page.motion.lead}</p>
          <MotionLab />
        </section>

        <section id="tokens" className="dz-sec" aria-labelledby="tokens-h">
          <h2 id="tokens-h" className="dz-h2">
            {page.tokens.title}
          </h2>
          <p className="dz-lead">{page.tokens.lead}</p>
          <TokensLab scope={root} themeKey={theme} />
        </section>
      </main>
    </div>
  );
}
