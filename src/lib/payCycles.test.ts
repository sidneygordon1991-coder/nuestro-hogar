import {describe, expect, it} from 'vitest';
import {cycleBounds, effectiveCycle, validateCycle} from './payCycles';
import {inPeriod, financePeriodSummary, type ShareContext} from './financePeriods';
import {monthlyIncomeSummary} from './monthlyIncome';
const cycle = {cycle_first_day: 14, cycle_second_day: 29};
describe('personal fortnight cycles', () => {
  it('covers 14–28 and 29–13 across months and years', () => {
    expect(cycleBounds('2026-10-01', 'first', cycle)).toEqual({start: '2026-10-14', end: '2026-10-28'});
    expect(cycleBounds('2026-10-01', 'second', cycle)).toEqual({start: '2026-10-29', end: '2026-11-13'});
    expect(cycleBounds('2026-12-01', 'second', cycle)).toEqual({start: '2026-12-29', end: '2027-01-13'});
  });
  it('handles missing days and leap February without gaps or duplicated dates', () => {
    expect(cycleBounds('2027-02-01', 'first', cycle)).toEqual({start: '2027-02-14', end: '2027-02-28'});
    expect(cycleBounds('2027-02-01', 'second', cycle)).toEqual({start: '2027-03-01', end: '2027-03-13'});
    expect(cycleBounds('2028-02-01', 'second', cycle)).toEqual({start: '2028-02-29', end: '2028-03-13'});
    for (const year of [2026, 2027, 2028])
      for (let m = 1; m <= 12; m++)
        for (const days of [
          cycle,
          {cycle_first_day: 28, cycle_second_day: 31},
          {cycle_first_day: 1, cycle_second_day: 16}
        ]) {
          const month = `${year}-${String(m).padStart(2, '0')}-01`;
          const full = cycleBounds(month, 'month', days),
            first = cycleBounds(month, 'first', days),
            second = cycleBounds(month, 'second', days);
          expect(first.start).toBe(full.start);
          expect(second.end).toBe(full.end);
          expect(Date.parse(second.start) - Date.parse(first.end)).toBe(86400000);
          expect(first.start <= first.end && second.start <= second.end).toBe(true);
          for (let t = Date.parse(full.start); t <= Date.parse(full.end); t += 86400000) {
            const d = new Date(t).toISOString().slice(0, 10);
            expect(Number(inPeriod(d, month, 'first', days)) + Number(inPeriod(d, month, 'second', days))).toBe(1);
          }
        }
  });
  it('rejects invalid boundaries and keeps incomplete drafts renderable', () => {
    expect(validateCycle('14', '29')).toEqual(cycle);
    for (const pair of [
      ['29', '30'],
      ['14', '14'],
      ['16', '1'],
      ['0', '15'],
      ['1', '32'],
      ['1.5', '16'],
      ['', '16']
    ])
      expect(() => validateCycle(...(pair as [string, string]))).toThrow();
    expect(effectiveCycle({cycle_first_day: Infinity, cycle_second_day: 0})).toEqual({first: 1, second: 16});
  });
  it('keeps calendar months separate and preserves per-person plan snapshots', () => {
    expect(inPeriod('2026-11-10', '2026-10-01', 'second', cycle)).toBe(true);
    expect(inPeriod('2026-11-10', '2026-10-01', 'month')).toBe(false);
    const s = monthlyIncomeSummary(
      '2026-10-01',
      [
        {user_id: 'a', full_name: 'A'},
        {user_id: 'b', full_name: 'B'}
      ],
      [{user_id: 'a', month: '2026-10-01', expected_amount: 100, ...cycle}],
      [],
      {},
      {a: {cycle_first_day: 1, cycle_second_day: 16}, b: {cycle_first_day: 5, cycle_second_day: 20}}
    );
    expect(s.rows[0].cycle_first_day).toBe(14);
    expect(s.rows[1].cycle_first_day).toBe(5);
  });
  it('uses the same date range for family totals, excludes future and adjacent cycles in the caller', () => {
    const month = '2026-10-01';
    const context: ShareContext = {
      month,
      members: [
        {user_id: 'a', full_name: 'A'},
        {user_id: 'b', full_name: 'B'}
      ],
      plans: [],
      references: {},
      method: 'equal',
      custom: {},
      rules: {},
      categoryCustom: {}
    };
    const tx = (id: string, date: string, amount: number, paid_by: string) => ({
      id,
      transaction_date: date,
      amount,
      paid_by,
      type: 'income',
      category_id: null,
      is_shared: true
    });
    const rows = [
      tx('1', '2026-10-14', 100, 'a'),
      tx('2', '2026-10-29', 200, 'b'),
      tx('3', '2026-11-13', 300, 'a'),
      tx('4', '2026-11-14', 999, 'b')
    ];
    const sum = (p: 'first' | 'second' | 'month') =>
      financePeriodSummary(month, p, context.members, [], {}, [], [], rows, [], [], context, cycle);
    expect(sum('month').income).toBe(600);
    expect(sum('first').income + sum('second').income).toBe(600);
    expect(sum('second').people.find(p => p.user_id === 'a')?.received).toBe(300);
  });
});
