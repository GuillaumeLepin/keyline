'use client';

import { Fingerprint, LinkSimple } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { StackPage } from '@/src/components/StackPage';
import { useCopy } from '@/src/copy';
import { Button, ProtectionRing } from '@/src/ui';

/** I2–I4 "How is my money protected?" — three short screens in one StackView (slide on next / back). */
export default function HelpPage() {
  const t = useCopy();
  const h = t.copyC.help;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const go = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };
  const leave = () => router.push('/settings');
  const titles = [h.s1.title, h.s2.title, h.s3.title];

  return (
    <StackPage
      testId="help"
      screenKey={`help-${step}`}
      direction={dir}
      title={titles[step] ?? h.title}
      onBack={step === 0 ? leave : () => go(step - 1)}
      trailing={<span className="text-12 text-ink-3">{h.counter(step + 1)}</span>}
      actions={
        <>
          {step < 2 ? (
            <Button variant="primary" full onClick={() => go(step + 1)}>
              {h.next}
            </Button>
          ) : (
            <Button variant="primary" full onClick={leave}>
              {h.done}
            </Button>
          )}
          {step > 0 ? (
            <Button variant="ghost" full onClick={() => go(step - 1)}>
              {h.back}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="kl-stack gap-6">
        {step === 0 ? (
          <>
            <div className="flex justify-center py-4" aria-hidden="true">
              <span className="grid size-16 place-items-center rounded-full border border-line">
                <Fingerprint size={32} />
              </span>
            </div>
            <p className="m-0 text-16 text-ink">{h.s1.body}</p>
            <ul className="m-0 grid list-none gap-3 p-0">
              {h.s1.points.map((p) => (
                <li key={p} className="border-line border-t pt-3 text-14 text-ink-2">
                  {p}
                </li>
              ))}
            </ul>
          </>
        ) : step === 1 ? (
          <>
            <div className="flex justify-center py-2">
              <ProtectionRing state="registering" registered={3} size={200} label={h.s2.ringLabel}>
                <span className="text-14 font-semibold">{t.copyV2.onboarding.protect.ringCount(2)}</span>
              </ProtectionRing>
            </div>
            <p className="m-0 text-16 text-ink">{h.s2.body}</p>
            <ol className="m-0 grid list-none gap-3 p-0" aria-label={h.s2.ringLabel}>
              {h.s2.points.map((p, i) => (
                <li key={p} className="flex items-start gap-3 border-line border-t pt-3 text-14 text-ink-2">
                  <span className="font-semibold text-ink">{i + 1}</span>
                  {p}
                </li>
              ))}
            </ol>
            <p className="m-0 text-12 text-ink-3">{h.s2.wait}</p>
          </>
        ) : (
          <>
            <div className="flex justify-center py-2">
              <ProtectionRing state="protected" size={64} label={t.copyV2.home.protectionTitle} />
            </div>
            <p className="m-0 text-16 text-ink">{h.s3.body}</p>
            <section className="kl-stack gap-2 border-line border-t pt-4" aria-labelledby="help-gone">
              <h3 id="help-gone" className="m-0 flex items-center gap-2 text-16 font-semibold">
                <LinkSimple size={18} aria-hidden="true" />
                {h.s3.goneTitle}
              </h3>
              <p className="m-0 text-14 text-ink-2">{h.s3.goneBody}</p>
              <Link className="kl2-link text-14" href="/security">
                {h.s3.details}
              </Link>
            </section>
          </>
        )}
      </div>
    </StackPage>
  );
}
