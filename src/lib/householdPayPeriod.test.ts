import {describe, expect, it} from 'vitest';
import {
  DEFAULT_HOUSEHOLD_CUTOFFS,
  normalizedHouseholdCutoffs,
  payWindow,
  payWindowAt,
  validateHouseholdCutoffs
} from './householdPayPeriod';

describe('configurable household pay cutoffs', () => {
  const dates = {first_cutoff_day: 13, second_cutoff_day: 28};
  it('treats the 29th through next 13th as the same paycheck window', () => {
    expect(payWindow('2026-11-01', 'first', dates)).toMatchObject({
      start: '2026-10-29',
      end: '2026-11-13'
    });
    expect(payWindowAt('2026-10-29', dates)).toEqual(payWindow('2026-11-01', 'first', dates));
    expect(payWindowAt('2026-11-13', dates)).toEqual(payWindow('2026-11-01', 'first', dates));
    expect(payWindowAt('2026-11-14', dates)).toEqual(payWindow('2026-11-01', 'second', dates));
    expect(payWindowAt('2026-10-19', dates)).toMatchObject({
      start: '2026-10-14',
      end: '2026-10-28',
      period: 'second'
    });
    expect(payWindowAt('2027-01-01', dates)).toMatchObject({
      start: '2026-12-29',
      end: '2027-01-13',
      period: 'first'
    });
  });
  it('preserves the calendar default for households without a saved preference', () => {
    expect(normalizedHouseholdCutoffs()).toEqual(DEFAULT_HOUSEHOLD_CUTOFFS);
    expect(payWindowAt('2026-10-19')).toMatchObject({start: '2026-10-16', end: '2026-10-31'});
    expect(payWindowAt('2026-11-01')).toMatchObject({start: '2026-11-01', end: '2026-11-15'});
  });
  it('supports February and leap years without omitted or double-counted dates', () => {
    for (const year of [2026, 2027, 2028])
      for (let month = 1; month <= 12; month++)
        for (let day = 1; day <= new Date(Date.UTC(year, month, 0)).getUTCDate(); day++) {
          const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const period = payWindowAt(date, dates);
          expect(period.start <= date && period.end >= date).toBe(true);
        }
    expect(payWindowAt('2027-03-01', dates)).toMatchObject({start: '2027-03-01', end: '2027-03-13'});
    expect(payWindowAt('2028-02-29', dates)).toMatchObject({start: '2028-02-29', end: '2028-03-13'});
  });
  it('validates each household independently', () => {
    expect(validateHouseholdCutoffs(13, 28)).toEqual(dates);
    expect(validateHouseholdCutoffs(10, 25)).toEqual({first_cutoff_day: 10, second_cutoff_day: 25});
    for (const [first, second] of [
      [0, 28],
      [28, 31],
      [13, 13],
      [13, 32],
      [13.5, 28]
    ])
      expect(() => validateHouseholdCutoffs(first, second)).toThrow();
  });
});
