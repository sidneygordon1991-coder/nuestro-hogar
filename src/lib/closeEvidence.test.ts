import {describe, expect, it} from 'vitest';
import {closeDifferences, closeReviewKey} from './closeEvidence';
describe('monthly close evidence', () => {
  const financial = {income: 1000, expense: 500, saving: 200, balance: 300};
  it('detects a cent difference and keeps the historical figure intact', () => {
    const saved = {...financial},
      current = {...financial, expense: 500.01, balance: 299.99};
    expect(closeDifferences(saved, current)).toEqual([
      {field: 'expense', saved: 500, current: 500.01, delta: 0.01},
      {field: 'balance', saved: 300, current: 299.99, delta: -0.01}
    ]);
    expect(saved).toEqual(financial);
  });
  it('ignores generation time and property ordering, while detecting changed figures and pending work', () => {
    const a = {financial, operations: {pending: 1, paid: 2}, period_end: '2026-09-30', generated_at: 'old'};
    const b = {
      ...a,
      financial: {balance: 300, saving: 200, expense: 500, income: 1000},
      operations: {paid: 2, pending: 1},
      generated_at: 'new'
    };
    expect(closeReviewKey(a)).toBe(closeReviewKey(b));
    expect(closeReviewKey(a)).not.toBe(closeReviewKey({...b, operations: {paid: 2, pending: 0}}));
    expect(closeReviewKey(a)).not.toBe(closeReviewKey({...b, financial: {...financial, income: 1000.01}}));
  });
});
