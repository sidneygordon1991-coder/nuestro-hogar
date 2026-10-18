import {describe, expect, it} from 'vitest';
import {expandMonthOccurrences} from './calendarOccurrences';
import {localISODate, localISODateIn} from './localDate';
const ev = (event_date: string, recurrence: string, recurrence_until: string | null = null) => ({
  id: 'e',
  event_date,
  recurrence,
  recurrence_until
});
const dates = (e: ReturnType<typeof ev>, y: number, m0: number) => expandMonthOccurrences([e], y, m0).map(o => o.date);
describe('calendar occurrence expansion', () => {
  it('shows one-off events on the first and last day of the month', () => {
    expect(dates(ev('2026-10-31', 'none'), 2026, 9)).toEqual(['2026-10-31']);
    expect(dates(ev('2026-10-01', 'none'), 2026, 9)).toEqual(['2026-10-01']);
    expect(dates(ev('2026-11-01', 'none'), 2026, 9)).toEqual([]);
  });
  it('includes the start date of monthly and yearly events in their first month', () => {
    expect(dates(ev('2026-10-17', 'monthly'), 2026, 9)).toEqual(['2026-10-17']);
    expect(dates(ev('2026-10-17', 'yearly'), 2026, 9)).toEqual(['2026-10-17']);
    expect(dates(ev('2026-10-17', 'monthly'), 2026, 8)).toEqual([]);
    expect(dates(ev('2026-10-17', 'yearly'), 2027, 9)).toEqual(['2027-10-17']);
    expect(dates(ev('2026-10-17', 'yearly'), 2027, 10)).toEqual([]);
  });
  it('clamps monthly events on the 29–31 to the end of short months', () => {
    expect(dates(ev('2026-01-31', 'monthly'), 2026, 1)).toEqual(['2026-02-28']);
    expect(dates(ev('2026-01-31', 'monthly'), 2028, 1)).toEqual(['2028-02-29']);
    expect(dates(ev('2026-01-31', 'monthly'), 2026, 3)).toEqual(['2026-04-30']);
    expect(dates(ev('2026-01-30', 'monthly'), 2026, 2)).toEqual(['2026-03-30']);
  });
  it('moves yearly Feb 29 to Feb 28 in common years', () => {
    expect(dates(ev('2028-02-29', 'yearly'), 2029, 1)).toEqual(['2029-02-28']);
    expect(dates(ev('2028-02-29', 'yearly'), 2032, 1)).toEqual(['2032-02-29']);
  });
  it('expands weekly events from old start dates and respects the end date', () => {
    expect(dates(ev('2020-01-05', 'weekly'), 2026, 9)).toEqual([
      '2026-10-04',
      '2026-10-11',
      '2026-10-18',
      '2026-10-25'
    ]);
    expect(dates(ev('2026-10-25', 'weekly'), 2026, 9)).toEqual(['2026-10-25']);
    expect(dates(ev('2026-10-03', 'weekly', '2026-10-17'), 2026, 9)).toEqual([
      '2026-10-03',
      '2026-10-10',
      '2026-10-17'
    ]);
    expect(dates(ev('2026-10-03', 'monthly', '2026-10-02'), 2026, 9)).toEqual([]);
    expect(dates(ev('2026-09-30', 'weekly'), 2026, 9)).toEqual([
      '2026-10-07',
      '2026-10-14',
      '2026-10-21',
      '2026-10-28'
    ]);
  });
  it('uses local calendar dates, never UTC', () => {
    expect(localISODate(new Date(2026, 9, 17, 23, 30))).toBe('2026-10-17');
    expect(localISODate(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
    expect(localISODateIn(30, new Date(2026, 9, 17, 22))).toBe('2026-11-16');
  });
});
