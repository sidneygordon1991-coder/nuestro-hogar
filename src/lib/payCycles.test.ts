import {describe, expect, it} from 'vitest';
import {cycleBounds, currentCycleMonth, currentCyclePeriod, effectiveCycle, validateCycle} from './payCycles';
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
          {cycle_first_day: 29, cycle_second_day: 14},
          {cycle_first_day: 30, cycle_second_day: 14},
          {cycle_first_day: 31, cycle_second_day: 16},
          {cycle_first_day: 16, cycle_second_day: 1},
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
    expect(validateCycle('29', '14')).toEqual({cycle_first_day: 29, cycle_second_day: 14});
    expect(validateCycle('16', '1')).toEqual({cycle_first_day: 16, cycle_second_day: 1});
    for (const pair of [
      ['29', '30'],
      ['14', '14'],
      ['31', '30'],
      ['32', '14'],
      ['14', '0'],
      ['0', '15'],
      ['1', '32'],
      ['1.5', '16'],
      ['', '16']
    ])
      expect(() => validateCycle(...(pair as [string, string]))).toThrow();
    expect(effectiveCycle({cycle_first_day: Infinity, cycle_second_day: 0})).toEqual({first: 1, second: 16});
  });
  it('keeps the first fortnight as 29–13 and the second as 14–28 in the following month', () => {
    const reversed = validateCycle('29', '14');
    expect(cycleBounds('2026-10-01', 'first', reversed)).toEqual({start: '2026-10-29', end: '2026-11-13'});
    expect(cycleBounds('2026-10-01', 'second', reversed)).toEqual({start: '2026-11-14', end: '2026-11-28'});
    expect(cycleBounds('2026-12-01', 'month', reversed)).toEqual({start: '2026-12-29', end: '2027-01-28'});
    expect(cycleBounds('2027-02-01', 'first', reversed)).toEqual({start: '2027-03-01', end: '2027-03-13'});
    expect(cycleBounds('2028-02-01', 'first', reversed)).toEqual({start: '2028-02-29', end: '2028-03-13'});
  });
  it('selects the current half before, on and after both starts, including a deferred start', () => {
    const reversed = validateCycle('29', '14');
    for (const [date, month, half] of [
      ['2026-10-01', '2026-09-01', 'first'],
      ['2026-10-13', '2026-09-01', 'first'],
      ['2026-10-14', '2026-09-01', 'second'],
      ['2026-10-28', '2026-09-01', 'second'],
      ['2026-10-29', '2026-10-01', 'first'],
      ['2026-10-31', '2026-10-01', 'first'],
      ['2027-03-01', '2027-02-01', 'first'],
      ['2028-02-29', '2028-02-01', 'first']
    ]) {
      expect(currentCycleMonth(date, reversed)).toBe(month);
      expect(currentCyclePeriod(date, reversed)).toBe(half);
    }
    expect(currentCyclePeriod('2026-10-13', cycle)).toBe('second');
    expect(currentCyclePeriod('2026-10-14', cycle)).toBe('first');
    expect(currentCyclePeriod('2026-10-29', cycle)).toBe('second');
    expect(currentCyclePeriod('2026-10-16')).toBe('second');
    expect(currentCycleMonth('2027-03-01', validateCycle('31', '16'))).toBe('2027-02-01');
  });
  it('preserves money and carry between reversed halves without counting adjacent dates', () => {
    const reversed = validateCycle('29', '14'),
      month = '2026-10-01';
    const context: ShareContext = {
      month,
      members: [],
      plans: [],
      references: {},
      method: 'equal',
      custom: {},
      rules: {},
      categoryCustom: {}
    };
    const movements = [
      ['2026-10-28', 999, 'income'],
      ['2026-10-29', 100, 'income'],
      ['2026-11-13', 10, 'expense'],
      ['2026-11-14', 200, 'income'],
      ['2026-11-28', 20, 'expense'],
      ['2026-11-29', 999, 'income']
    ].map(([date, amount, type], i) => ({
      id: String(i),
      transaction_date: String(date),
      amount: Number(amount),
      type: String(type),
      paid_by: null,
      category_id: null,
      is_shared: true
    }));
    const sum = (half: 'month' | 'first' | 'second') =>
      financePeriodSummary(month, half, [], [], {}, [], [], movements, [], [], context, reversed);
    expect(sum('first')).toMatchObject({income: 100, expense: 10, carry: 0, balance: 90});
    expect(sum('second')).toMatchObject({income: 200, expense: 20, carry: 90, balance: 270});
    expect(sum('month')).toMatchObject({income: 300, expense: 30, balance: 270});
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
