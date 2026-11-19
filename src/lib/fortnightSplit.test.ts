import {describe, expect, it} from 'vitest';
import type {CashFlowSource} from './cashFlow';
import {fortnightSplit} from './fortnightSplit';

const month = '2026-11-01';
const base: CashFlowSource = {
  month,
  today: '2026-11-17',
  members: [{user_id: 'a', full_name: 'A'}],
  plans: [
    {
      user_id: 'a',
      month,
      expected_amount: 8000,
      first_half_amount: 4000,
      second_half_amount: 4000
    } as CashFlowSource['plans'][number]
  ],
  categories: [
    {id: 'food', budget_group: 'variable'},
    {id: 'home', budget_group: 'fixed'},
    {id: 'save', budget_group: 'saving'}
  ],
  allocations: [
    {category_id: 'food', month, planned_amount: 2000, first_half_amount: 1000, second_half_amount: 1000},
    {category_id: 'home', month, planned_amount: 1200, first_half_amount: 0, second_half_amount: 1200},
    {category_id: 'save', month, planned_amount: 1000, first_half_amount: 500, second_half_amount: 500}
  ],
  savings: [],
  recurring: [{id: 'r', description: 'Luz', amount: 385, type: 'expense', category_id: 'home', active: true}],
  occurrences: [{id: 'o', recurring_transaction_id: 'r', due_date: '2026-11-21', status: 'pending'}],
  transactions: [
    {id: 'i', type: 'income', amount: 4000, paid_by: 'a', category_id: null, transaction_date: '2026-11-16'},
    {id: 'e', type: 'expense', amount: 300, paid_by: 'a', category_id: 'food', transaction_date: '2026-11-16'}
  ]
};

describe('«Llegó tu quincena»', () => {
  it('uses the current fortnight and its dates', () => {
    const s = fortnightSplit(base);
    expect(s).toMatchObject({period: 'second', start: '2026-11-16', end: '2026-11-30'});
  });

  it('splits the fortnight income without counting a budgeted recurring payment twice', () => {
    const s = fortnightSplit(base);
    expect(s.received).toBe(4000);
    expect(s.toReceive).toBe(0);
    // The Q385 bill lives inside the Q1,200 «home» plan: the plan, not plan + bill, is reserved.
    const total = s.rows.reduce((n, r) => n + Math.round(r.amount * 100), 0) / 100;
    expect(s.rows.find(r => r.key === 'spent')?.amount).toBe(300);
    expect(s.rows.find(r => r.key === 'saving')?.amount).toBe(500);
    expect(total).toBe(300 + 1200 + 700 + 500);
    expect(s.free).toBe(4000 - total);
    expect(s.ready).toBe(true);
  });

  it('counts income still to come and can be short', () => {
    const s = fortnightSplit({...base, transactions: base.transactions.filter(t => t.type !== 'income')});
    expect(s.received).toBe(0);
    expect(s.toReceive).toBe(4000);
    expect(s.income).toBe(4000);
    const short = fortnightSplit({
      ...base,
      allocations: base.allocations.map(a => (a.category_id === 'food' ? {...a, second_half_amount: 5000} : a))
    });
    expect(short.free).toBeLessThan(0);
  });

  it('is not ready without any plan or income', () => {
    const s = fortnightSplit({...base, plans: [], allocations: [], recurring: [], occurrences: [], transactions: []});
    expect(s.ready).toBe(false);
    expect(s.rows).toEqual([]);
  });
});
