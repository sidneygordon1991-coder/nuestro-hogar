import {describe, expect, it} from 'vitest';
import {buildCashFlow, type CashFlowSource} from './cashFlow';
import {budgetAvailability} from './budgetAvailability';

const source: CashFlowSource = {
  month: '2026-11-01',
  today: '2026-11-10',
  period: 'first',
  periodRange: {start: '2026-10-29', end: '2026-11-13'},
  categories: [
    {id: 'food', budget_group: 'variable'},
    {id: 'rent', budget_group: 'fixed'},
    {id: 'saving', budget_group: 'saving'}
  ],
  allocations: [
    {month: '2026-11-01', category_id: 'food', planned_amount: 1500, first_half_amount: 500, second_half_amount: 1000},
    {month: '2026-11-01', category_id: 'rent', planned_amount: 1000, first_half_amount: 1000, second_half_amount: 0},
    {month: '2026-11-01', category_id: 'saving', planned_amount: 500, first_half_amount: 500, second_half_amount: 0}
  ],
  members: [{user_id: 'person', full_name: 'Integrante'}],
  plans: [
    {
      user_id: 'person',
      month: '2026-11-01',
      expected_amount: 9000,
      first_half_amount: 5000,
      second_half_amount: 4000
    }
  ],
  transactions: [
    {
      id: 'before-cycle',
      type: 'expense',
      amount: 100,
      transaction_date: '2026-10-28',
      category_id: 'food',
      paid_by: 'person'
    },
    {
      id: 'credit',
      type: 'expense',
      amount: 300,
      transaction_date: '2026-10-29',
      category_id: 'food',
      paid_by: 'person'
    },
    {
      id: 'bank',
      type: 'expense',
      amount: 200,
      transaction_date: '2026-11-03',
      category_id: 'food',
      paid_by: 'person'
    },
    {
      id: 'salary',
      type: 'income',
      amount: 5000,
      transaction_date: '2026-11-10',
      category_id: null,
      paid_by: 'person'
    }
  ],
  savings: [{amount: 100, contribution_date: '2026-10-31'}],
  recurring: [],
  occurrences: []
};

describe('cross-month household budget flow', () => {
  it('includes the 29th and next-month activity once in the payday window', () => {
    const flow = buildCashFlow(source);
    expect(flow.income).toBe(5000);
    expect(flow.expense).toBe(500);
    expect(flow.saving).toBe(100);
    expect(flow.incomePlan.received).toBe(5000);
    expect(flow.incomePlan.pending).toBe(0);
    expect(flow.transactions.map(t => t.id)).toEqual(['credit', 'bank', 'salary']);
    expect(budgetAvailability(flow).available).toBe(3000);
  });

  it('preserves calendar monthly reporting even with a selected pay window', () => {
    const flow = buildCashFlow({...source, period: 'month'});
    expect(flow.income).toBe(5000);
    expect(flow.expense).toBe(200);
    expect(flow.saving).toBe(0);
  });
});
