'use client';

import {
  ActionButton,
  type ActionStatus,
  Address,
  Disclosure,
  formatCHF,
  formatUSDC,
  Panel,
  PolicyLine,
  ProtectionRing,
  StackView,
  StatusSequence,
} from '@keyline/ui';
import { review } from '../copy';
import { Phone } from '../Device';

const LUKAS = '0x7a1F3b2c4D5e6F708192a3B4c5D6e7F8091a3c9E';
const TX = '0x9c41e2d7f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f506172839a4b';

export type ReviewPhase = 'review' | 'loading' | 'success' | 'receipt';

export function ReviewMock({
  phase,
  onConfirm,
  onBack,
}: {
  phase: ReviewPhase;
  onConfirm?: () => void;
  onBack?: () => void;
}) {
  const status: ActionStatus = phase === 'loading' ? 'loading' : phase === 'success' ? 'success' : 'idle';
  const receipt = phase === 'receipt';
  return (
    <Phone persona={review.device} label={review.title}>
      <StackView
        screenKey={receipt ? 'receipt' : 'review'}
        direction={receipt ? 1 : -1}
        title={receipt ? review.receiptTitle : review.title}
        onBack={onBack}
      >
        {receipt ? (
          <div className="dz-scroll" style={{ height: '100%' }}>
            <div className="dz-receipt">
              <ProtectionRing state="success" size={64} label={review.sent} />
              <div className="dz-amountblock">
                <span className="dz-eyebrow">{review.sent}</span>
                <span className="dz-balance__amount">{formatUSDC(-25)}</span>
                <span className="dz-small">
                  {formatCHF(20)} {review.receiptLine}
                </span>
              </div>
            </div>
            <StatusSequence
              steps={review.steps.map((label, i) => ({
                label,
                state: 'done' as const,
                meta: `14:32:0${4 + i + (i > 1 ? 1 : 0)}`,
              }))}
            />
            <Address value={TX} label="Transaction" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="dz-scroll">
              <div className="dz-amountblock">
                <span className="dz-balance__amount">{formatCHF(20)}</span>
                <span className="dz-small">
                  {formatUSDC(25)} {review.to}
                </span>
                <Address value={LUKAS} />
              </div>
              <PolicyLine verdict="ok" reason={review.policy.reason} />
              <Panel
                title={review.panel}
                rows={[
                  { label: review.rows.send, value: formatUSDC(25) },
                  { label: review.rows.receives, value: formatUSDC(25) },
                  { label: review.rows.balance, value: `${formatUSDC(120)} → ${formatUSDC(95)}` },
                  { label: review.rows.fee, value: review.rows.feeValue },
                  { label: review.rows.screening, value: review.rows.screeningValue, tone: 'ok' },
                ]}
                footnote={review.footnote}
              />
              <Disclosure summary={review.details}>
                <Address value={TX} label="SafeOp hash" />
              </Disclosure>
            </div>
            <div className="dz-dock">
              <ActionButton
                full
                label={review.cta}
                status={status}
                successLabel={review.sent}
                onClick={phase === 'review' ? onConfirm : undefined}
              />
            </div>
          </div>
        )}
      </StackView>
    </Phone>
  );
}
