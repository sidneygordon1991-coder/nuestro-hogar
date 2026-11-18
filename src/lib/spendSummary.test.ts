import {describe, expect, it} from 'vitest';
import {spendSummary} from './spendSummary';

describe('spend summary for Inicio', () => {
  it('returns null without a positive monthly plan', () => {
    expect(spendSummary([], '2026-11-18', '2026-11-30')).toBeNull();
    expect(spendSummary([{planned: 0, spent: 250}], '2026-11-18', '2026-11-30')).toBeNull();
  });

  it('subtracts budget spending, unplanned categories included, in cents', () => {
    const s = spendSummary(
      [
        {planned: 3000, spent: 1200.1},
        {planned: 2000, spent: 1979.9},
        {planned: 0, spent: 0.2}
      ],
      '2026-11-18',
      '2026-11-30'
    )!;
    expect(s.planned).toBe(5000);
    expect(s.spent).toBe(3180.2);
    expect(s.remaining).toBe(1819.8);
    expect(s.usedPercent).toBe(64);
  });

  it('spreads what remains over the days left, today included', () => {
    const s = spendSummary([{planned: 5000, spent: 3180}], '2026-11-18', '2026-11-30')!;
    expect(s.daysLeft).toBe(13);
    expect(s.until).toBe('2026-11-30');
    expect(s.perDay).toBe(140);
  });

  it('works for a fortnight', () => {
    const s = spendSummary([{planned: 2500, spent: 1000}], '2026-11-03', '2026-11-15')!;
    expect(s.daysLeft).toBe(13);
    expect(s.perDay).toBe(115.38);
    expect(s.until).toBe('2026-11-15');
  });

  it('handles February and the last day of the month', () => {
    const s = spendSummary([{planned: 280, spent: 0}], '2028-02-29', '2028-02-29')!;
    expect(s.until).toBe('2028-02-29');
    expect(s.daysLeft).toBe(1);
    expect(s.perDay).toBe(280);
  });

  it('never offers a daily amount when the month is over budget', () => {
    const s = spendSummary([{planned: 1000, spent: 1250}], '2026-11-10', '2026-11-30')!;
    expect(s.remaining).toBe(-250);
    expect(s.perDay).toBe(0);
    expect(s.usedPercent).toBe(100);
  });
});
