import {describe, expect, it} from 'vitest';
import {comparableMonthRange, registeredLedger} from './registeredLedger';
import {buildCashFlow, type CashFlowSource} from './cashFlow';
import {homeBudgetAvailability} from './homeAvailability';
const source: CashFlowSource = {
  month: '2026-10-01',
  today: '2026-10-16',
  categories: [{id: 'saving', budget_group: 'saving'}],
  members: [],
  plans: [],
  allocations: [],
  recurring: [],
  occurrences: [],
  transactions: [
    {id: 'i', type: 'income', amount: '1000.10', transaction_date: '2026-10-01', category_id: null, paid_by: null},
    {id: 'e', type: 'expense', amount: '100.05', transaction_date: '2026-10-02', category_id: null, paid_by: null},
    {
      id: 'o',
      type: 'expense',
      amount: '50.02',
      budget_included: false,
      transaction_date: '2026-10-03',
      category_id: null,
      paid_by: null
    },
    {
      id: 's',
      type: 'expense',
      amount: '80.03',
      budget_included: false,
      transaction_date: '2026-10-04',
      category_id: 'saving',
      paid_by: null
    },
    {id: 'future', type: 'income', amount: 9999, transaction_date: '2026-10-30', category_id: null, paid_by: null},
    {id: 'before', type: 'expense', amount: 500, transaction_date: '2026-09-30', category_id: null, paid_by: null}
  ],
  savings: [
    {amount: 40.07, contribution_date: '2026-10-05'},
    {amount: -10.02, contribution_date: '2026-10-06'},
    {amount: 800, contribution_date: '2026-10-31'}
  ]
};
const range = {start: source.month, end: '2026-10-31', today: source.today};
describe('registered figures across views', () => {
  it('counts cent amounts, expenses outside the budget, savings categories and withdrawals once', () => {
    expect(registeredLedger(source.transactions, source.savings, source.categories, range)).toMatchObject({
      income: 1000.1,
      expense: 150.07,
      saving: 110.08,
      budgetExpense: 100.05,
      excludedExpense: 50.02,
      available: 739.95,
      transactionCount: 4,
      savingCount: 2
    });
  });
  it('agrees with the forecasting engine without adding future income or commitments to actual figures', () => {
    const ledger = registeredLedger(source.transactions, source.savings, source.categories, range),
      flow = buildCashFlow(source);
    for (const key of ['income', 'expense', 'saving', 'available', 'budgetExpense', 'excludedExpense'] as const)
      expect(flow[key]).toBe(ledger[key]);
    expect(flow.futureCount).toBe(2);
    const budget = homeBudgetAvailability(source, 'month', {...range, planMonth: source.month});
    expect(budget.actualResult).toBe(850.03);
    expect(budget.remaining).toBe(900.05);
    expect(Math.round((budget.actualResult - ledger.saving) * 100) / 100).toBe(ledger.available);
  });
  it('supports a cross-month review window and excludes records outside the exact dates', () => {
    const ledger = registeredLedger(source.transactions, source.savings, source.categories, {
      start: '2026-09-29',
      end: '2026-10-03',
      today: source.today
    });
    expect(ledger).toMatchObject({income: 1000.1, expense: 650.07, saving: 0, available: 350.03});
  });
  it('a withdrawal can release more savings than were deposited in the selected window without inventing income', () => {
    expect(
      registeredLedger([], source.savings, [], {start: '2026-10-06', end: '2026-10-06', today: source.today})
    ).toMatchObject({income: 0, saving: -10.02, available: 10.02});
  });
});
describe('equivalent month comparisons', () => {
  it('compares the same elapsed days rather than a partial month with a complete month', () => {
    expect(comparableMonthRange('2026-10-01', '2026-10-16')).toEqual({
      current: {start: '2026-10-01', end: '2026-10-16'},
      previous: {start: '2026-09-01', end: '2026-09-16'},
      partial: true
    });
  });
  it('compares complete historical months with their real ends and handles year boundaries', () => {
    expect(comparableMonthRange('2026-01-01', '2026-10-16')).toEqual({
      current: {start: '2026-01-01', end: '2026-01-31'},
      previous: {start: '2025-12-01', end: '2025-12-31'},
      partial: false
    });
  });
  it('clamps the previous month at its last real day, including leap February', () => {
    expect(comparableMonthRange('2028-03-01', '2028-03-30').previous.end).toBe('2028-02-29');
    expect(comparableMonthRange('2027-03-01', '2027-03-30').previous.end).toBe('2027-02-28');
  });
  it('compares complete months even when February is shorter than January', () => {
    expect(comparableMonthRange('2026-02-01', '2026-10-16').previous.end).toBe('2026-01-31');
    expect(comparableMonthRange('2026-02-01', '2026-02-28')).toMatchObject({
      previous: {end: '2026-01-31'},
      partial: false
    });
  });
});
