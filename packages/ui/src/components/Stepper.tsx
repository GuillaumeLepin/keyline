export type StepperProps = {
  current: number;
  total: number;
  /** Title of the current step, e.g. "Add your Safety key". */
  label: string;
  /** The translated "Step 2 of 6" part (FR: "Étape 2 sur 6"); defaults to English. */
  stepText?: string;
};

/** "Step 2 of 6 · Add your Safety key" with a segmented track (done = ink, current = accent, todo = line). */
export function Stepper({ current, total, label, stepText }: StepperProps) {
  const step = stepText ?? `Step ${current} of ${total}`;
  return (
    <section className="kl-stepper" aria-label={`${step}: ${label}`}>
      <p className="kl-stepper__label">
        {step} · {label}
      </p>
      <div className="kl-stepper__track" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const state = n < current ? 'done' : n === current ? 'current' : 'todo';
          return <span key={n} className={`kl-stepper__dot kl-stepper__dot--${state}`} />;
        })}
      </div>
    </section>
  );
}
