import {describe, it, expect} from 'vitest';
import {buildCashFlow, type CashFlowSource} from './cashFlow';
const source = (): CashFlowSource => ({
  month: '2026-10-01',
  today: '2026-10-15',
  transactions: [
    {id: 'i', type: 'income', amount: 1000, paid_by: 'a', transaction_date: '2026-10-05', category_id: null}
  ],
  savings: [],
  categories: [{id: 'food', budget_group: 'variable'}],
  allocations: [{month: '2026-10-01', category_id: 'food', planned_amount: 500}],
  members: [{user_id: 'a', full_name: 'A'}],
  plans: [{user_id: 'a', month: '2026-10-01', expected_amount: 1000}],
  recurring: [
    {
      id: 'r',
      description: 'Compra',
      amount: 200,
      type: 'expense',
      due_day: 20,
      category_id: 'food',
      account_id: null,
      paid_by: 'a',
      is_shared: true
    }
  ],
  occurrences: [{id: 'o', recurring_transaction_id: 'r', due_date: '2026-10-20', status: 'pending'}]
});
describe('shared recorded cash flow and forecast', () => {
  it('counts a variable recurring expense within its budget once', () => {
    const r = buildCashFlow(source());
    expect(r.fixedCommitments).toBe(200);
    expect(r.variableRemaining).toBe(300);
    expect(r.projectedClose).toBe(500);
  });
  it('keeps the larger recurrence when it exceeds the remaining budget', () => {
    const s = source();
    s.recurring[0].amount = 700;
    expect(buildCashFlow(s).projectedClose).toBe(300);
  });
  it('subtracts spending before comparing budget and pending', () => {
    const s = source();
    s.transactions.push({
      id: 'e',
      type: 'expense',
      amount: 400,
      category_id: 'food',
      transaction_date: '2026-10-10',
      paid_by: 'a'
    });
    const r = buildCashFlow(s);
    expect(r.remainingExpenses).toBe(200);
    expect(r.projectedClose).toBe(400);
  });
  it('excludes future income, expenses and savings from actuals while preserving their source', () => {
    const s = source();
    s.transactions.push({
      id: 'f',
      type: 'income',
      amount: 5000,
      transaction_date: '2026-10-16',
      paid_by: 'a',
      category_id: null
    });
    s.savings = [{amount: 100, contribution_date: '2026-10-16'}];
    const r = buildCashFlow(s);
    expect(r.income).toBe(1000);
    expect(r.saving).toBe(0);
    expect(r.futureCount).toBe(2);
    expect(s.transactions).toHaveLength(2);
  });
  it('preserves explicit zero and pending per person instead of offsetting with another extra', () => {
    const s = source();
    s.members.push({user_id: 'b', full_name: 'B'});
    s.plans = [
      {user_id: 'a', month: s.month, expected_amount: 0},
      {user_id: 'b', month: s.month, expected_amount: 300}
    ];
    s.references = {a: 5000, b: 4000};
    expect(buildCashFlow(s).expectedIncomeRemaining).toBe(300);
  });
  it('uses historical occurrence terms and ignores duplicate paid links and retired templates', () => {
    const s = source();
    s.occurrences[0].details_snapshot = {...s.recurring[0], amount: 600};
    expect(buildCashFlow(s).remainingExpenses).toBe(600);
    s.occurrences[0].transaction_id = 'i';
    expect(buildCashFlow(s).pendingRecurringAmount).toBe(0);
    s.occurrences[0].transaction_id = null;
    s.recurring[0].active = false;
    expect(buildCashFlow(s).pendingRecurringAmount).toBe(0);
  });
  it('uses cents, ignores other months and handles uncategorized pending', () => {
    const s = source();
    s.recurring[0].category_id = null;
    s.recurring[0].amount = '0.10';
    s.allocations[0].planned_amount = '0.20';
    s.transactions[0].amount = '0.30';
    s.occurrences.push({...s.occurrences[0], id: 'other', due_date: '2026-11-01'});
    expect(buildCashFlow(s).projectedClose).toBe(999.7);
  });
  it('keeps planned saving separate from expenses', () => {
    const s = source();
    s.categories.push({id: 'save', budget_group: 'saving'});
    s.allocations.push({month: s.month, category_id: 'save', planned_amount: 200});
    s.savings.push({amount: 50, contribution_date: '2026-10-10'});
    const r = buildCashFlow(s);
    expect(r.remainingExpenses).toBe(500);
    expect(r.savingsRemaining).toBe(150);
    expect(r.projectedClose).toBe(300);
  });
  it('works for a single person and an empty household without NaN or made-up income', () => {
    const s = source();
    s.transactions = [];
    s.plans = [];
    s.members = [];
    s.allocations = [];
    s.recurring = [];
    s.occurrences = [];
    expect(buildCashFlow(s).projectedClose).toBe(0);
  });
  it('releases a withdrawal without inventing a replenishment plan when no saving budget exists', () => {
    const s = source();
    s.savings = [{amount: -100, contribution_date: '2026-10-10'}];
    const r = buildCashFlow(s);
    expect(r.income).toBe(1000);
    expect(r.available).toBe(1100);
    expect(r.savingsRemaining).toBe(0);
    expect(r.projectedClose).toBe(600);
  });
});
