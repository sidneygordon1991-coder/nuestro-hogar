import {describe, expect, it} from 'vitest';
import {countsInBudget} from './budgetTreatment';
import {buildCashFlow, type CashFlowSource} from './cashFlow';
import {categorySpending} from './budgetProgress';
import {financePeriodSummary, type ShareContext} from './financePeriods';
import {overviewPeriod, overviewAccounts} from './homeOverview';
describe('special funding is separate from the budget, never from the ledger', () => {
  const context: ShareContext = {
    month: '2026-10-01',
    members: [{user_id: 'a', full_name: 'A'}],
    plans: [],
    references: {},
    method: 'equal',
    custom: {},
    rules: {},
    categoryCustom: {}
  };
  const expense = {
    id: 'e',
    type: 'expense',
    amount: 200,
    category_id: 'food',
    paid_by: 'a',
    transaction_date: '2026-10-15',
    is_shared: true,
    budget_included: false
  };
  const source: CashFlowSource = {
    month: context.month,
    today: '2026-10-20',
    members: context.members,
    plans: [],
    categories: [{id: 'food', budget_group: 'variable'}],
    allocations: [{category_id: 'food', month: context.month, planned_amount: 500}],
    savings: [],
    recurring: [],
    occurrences: [],
    transactions: [
      {id: 'i', type: 'income', amount: 1000, paid_by: 'a', category_id: null, transaction_date: '2026-10-01'},
      expense
    ]
  };
  it('retains included behavior for all legacy rows', () => {
    expect(countsInBudget({})).toBe(true);
    expect(countsInBudget({budget_included: null})).toBe(true);
  });
  it('keeps all real spending in the balance but preserves the ordinary budget', () => {
    const result = buildCashFlow(source);
    expect(result).toMatchObject({
      expense: 200,
      budgetExpense: 0,
      excludedExpense: 200,
      available: 800,
      variableRemaining: 500,
      projectedClose: 300
    });
    expect(categorySpending(source.transactions, 'food', source.month, 'month', source.today)).toBe(0);
    expect(overviewPeriod(source, 'month').budgets[0]).toMatchObject({spent: 0, planned: 500});
    const summary = financePeriodSummary(
      source.month,
      'month',
      context.members,
      [],
      {},
      source.allocations,
      source.categories as {id: string; budget_group: string}[],
      source.transactions.map(t => ({...t, is_shared: true})),
      [],
      [{transaction_id: 'e', user_id: 'a', share_amount: 200}],
      context
    );
    expect(summary).toMatchObject({expense: 200, budgetExpense: 0, excludedExpense: 200, balance: 800});
    expect(summary.people[0]).toMatchObject({paid: 200, assigned: 200});
    expect(summary.rows[0].actual).toBe(0);
    expect(
      overviewAccounts(
        [{id: 'savings', name: 'Ahorro', account_type: 'savings', account_class: 'asset', opening_balance: 1000}],
        [{...expense, account_id: 'savings'}],
        [],
        source.today
      )[0].balance
    ).toBe(800);
  });
  it('restores the budget immediately when a payment is included again', () => {
    const updated = {...source, transactions: source.transactions.map(t => ({...t, budget_included: true}))};
    expect(buildCashFlow(updated)).toMatchObject({
      expense: 200,
      budgetExpense: 200,
      excludedExpense: 0,
      available: 800,
      variableRemaining: 300
    });
    expect(categorySpending(updated.transactions, 'food', source.month, 'month', source.today)).toBe(200);
  });
});
