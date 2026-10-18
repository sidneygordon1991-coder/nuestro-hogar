import {describe, expect, it} from 'vitest';
import {
  allowanceGoal,
  jarTotals,
  monthlyCost,
  nextPayday,
  payday,
  pendingPaydays,
  splitAllowance,
  type Allowance
} from './allowance';

const base: Allowance = {
  id: 'a',
  child_name: 'Sofía',
  amount: 100,
  frequency: 'weekly',
  start_date: '2026-10-03',
  save_percent: 30,
  give_percent: 10
};

describe('mesada', () => {
  it('splits into jars without losing cents', () => {
    expect(splitAllowance(100, 30, 10)).toEqual({spend: 60, save: 30, give: 10});
    expect(splitAllowance(33.33, 33, 33)).toEqual({spend: 11.35, save: 10.99, give: 10.99});
    expect(splitAllowance(50, 80, 50)).toEqual({spend: 0, save: 40, give: 10});
  });
  it('follows weekly, fortnight (15 and month end) and monthly paydays', () => {
    expect(payday(base, 2)).toBe('2026-10-17');
    expect(nextPayday(base, '2026-10-18')).toBe('2026-10-24');
    expect(nextPayday(base, '2026-10-17')).toBe('2026-10-17');
    const q = {...base, frequency: 'fortnight' as const, start_date: '2026-10-10'};
    expect([0, 1, 2, 3, 4].map(k => payday(q, k))).toEqual([
      '2026-10-15',
      '2026-10-31',
      '2026-11-15',
      '2026-11-30',
      '2026-12-15'
    ]);
    expect(nextPayday(q, '2026-11-16')).toBe('2026-11-30');
    expect(nextPayday(q, '2026-10-01')).toBe('2026-10-15');
    const m = {...base, frequency: 'monthly' as const, start_date: '2026-01-31'};
    expect(payday(m, 1)).toBe('2026-02-28');
    expect(nextPayday(m, '2026-03-01')).toBe('2026-03-31');
  });
  it('lists unpaid paydays up to the last paid one', () => {
    const paid = [
      {
        allowance_id: 'a',
        kind: 'payment' as const,
        for_date: '2026-10-03',
        paid_on: '2026-10-03',
        spend_amount: 60,
        save_amount: 30,
        give_amount: 10
      }
    ];
    expect(pendingPaydays(base, paid, '2026-10-18')).toEqual(['2026-10-17', '2026-10-10']);
    expect(pendingPaydays(base, [], '2026-12-31')).toHaveLength(3);
    expect(pendingPaydays({...base, active: false}, [], '2026-12-31')).toEqual([]);
    // Switching a paid-up weekly mesada to fortnight does not bring old paydays back.
    const paidUp = ['2026-10-03', '2026-10-10'].map(d => ({...paid[0], for_date: d, paid_on: d}));
    expect(pendingPaydays({...base, frequency: 'fortnight'}, paidUp, '2026-10-18')).toEqual(['2026-10-15']);
  });
  it('keeps jar totals and goal pace', () => {
    const rows = [
      {
        allowance_id: 'a',
        kind: 'payment' as const,
        for_date: '2026-10-03',
        paid_on: '2026-10-03',
        spend_amount: 60,
        save_amount: 30,
        give_amount: 10
      },
      {
        allowance_id: 'a',
        kind: 'payment' as const,
        for_date: '2026-10-10',
        paid_on: '2026-10-10',
        spend_amount: 60,
        save_amount: 30,
        give_amount: 10
      },
      {
        allowance_id: 'a',
        kind: 'withdrawal' as const,
        paid_on: '2026-10-12',
        spend_amount: 0,
        save_amount: 15,
        give_amount: 0
      }
    ];
    const jars = jarTotals('a', rows);
    expect(jars).toEqual({spend: 120, save: 45, give: 20, paidTotal: 200, payments: 2});
    expect(allowanceGoal({...base, goal_amount: 300}, jars.save)).toEqual({
      target: 300,
      left: 255,
      percent: 15,
      paydaysLeft: 9
    });
    expect(allowanceGoal(base, 10)).toBeNull();
    expect(monthlyCost(base)).toBe(433.33);
    expect(monthlyCost({amount: 100, frequency: 'fortnight'})).toBe(200);
  });
});
