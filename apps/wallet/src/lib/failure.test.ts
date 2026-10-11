import { describe, expect, it } from 'vitest';
import { bundleFor } from '../copy';
import { failureSentence, sendRejection, statusFailure } from './failure';

const en = bundleFor('en');
const fr = bundleFor('fr');

describe('bank failure sentences', () => {
  it('keeps the bank English in English and translates known codes', () => {
    expect(failureSentence(en, 'AA21', 'anything')).toBe(en.copyC.receipt.reasons.AA21);
    expect(failureSentence(fr, 'ERC20InsufficientBalance', 'x')).toBe(
      fr.copyC.receipt.reasons.ERC20InsufficientBalance,
    );
    expect(failureSentence(fr, 'AA41', 'x')).toBe(fr.copyC.receipt.reasons.feeLimits);
    expect(failureSentence(fr, 'ERC20InvalidReceiver', 'x')).toBe(fr.copyC.receipt.reasons.ERC20Invalid);
  });
  it('matches code-less sentences by text, else shows the English sentence', () => {
    expect(failureSentence(fr, undefined, 'The transfer reverted on-chain')).toBe(
      fr.copyC.receipt.reasons.reverted,
    );
    expect(failureSentence(fr, 'Error(foo)', 'Something new.')).toBe('Something new.');
    expect(failureSentence(fr, undefined, undefined)).toBeUndefined();
  });
  it('reads status payloads and 502 send rejections', () => {
    expect(statusFailure({ status: 'failed', reason: 'R', code: 'AA25' })).toEqual({
      reason: 'R',
      code: 'AA25',
    });
    const err = {
      status: 502,
      message: 'The network refused this transaction.',
      details: {
        reason: 'The network refused this transaction.',
        code: 'AA33',
        bundlerMessage: 'AA33 reverted',
      },
    };
    expect(sendRejection(fr, err)).toBe(fr.copyC.receipt.reasons.AA33);
    expect(sendRejection(fr, new Error('x'))).toBeUndefined();
  });
});
