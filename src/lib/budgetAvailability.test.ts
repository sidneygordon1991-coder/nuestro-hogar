import {describe, expect, it} from 'vitest';
import {budgetAvailability, accountLiquidity} from './budgetAvailability';
import {buildCashFlow, type CashFlowSource} from './cashFlow';
import {overviewAccounts} from './homeOverview';

const source: CashFlowSource = {
  month: '2026-10-01',
  today: '2026-10-19',
  categories: [
    {id: 'food', budget_group: 'variable'},
    {id: 'rent', budget_group: 'fixed'},
    {id: 'reserve', budget_group: 'saving'}
  ],
  allocations: [
    {month: '2026-10-01', category_id: 'food', planned_amount: 2000, first_half_amount: 1000, second_half_amount: 1000},
    {month: '2026-10-01', category_id: 'rent', planned_amount: 2000, first_half_amount: 0, second_half_amount: 2000},
    {month: '2026-10-01', category_id: 'reserve', planned_amount: 500, first_half_amount: 0, second_half_amount: 500}
  ],
  members: [{user_id: 'member', full_name: 'Persona'}],
  plans: [
    {
      month: '2026-10-01',
      user_id: 'member',
      expected_amount: 10000,
      first_half_amount: 4000,
      second_half_amount: 6000
    }
  ],
  transactions: [
    {
      id: 'income-1',
      type: 'income',
      amount: 4000,
      transaction_date: '2026-10-02',
      category_id: null,
      paid_by: 'member'
    },
    {
      id: 'expense-1',
      type: 'expense',
      amount: 1000,
      transaction_date: '2026-10-10',
      category_id: 'food',
      paid_by: 'member'
    },
    {
      id: 'income-2',
      type: 'income',
      amount: 6000,
      transaction_date: '2026-10-16',
      category_id: null,
      paid_by: 'member'
    },
    {
      id: 'card-purchase',
      type: 'expense',
      amount: 300,
      transaction_date: '2026-10-17',
      category_id: 'food',
      paid_by: 'member'
    },
    {
      id: 'bank-purchase',
      type: 'expense',
      amount: 200,
      transaction_date: '2026-10-17',
      category_id: 'food',
      paid_by: 'member'
    },
    {
      id: 'cash-purchase',
      type: 'expense',
      amount: 100,
      transaction_date: '2026-10-17',
      category_id: 'food',
      paid_by: 'member'
    }
  ],
  savings: [],
  recurring: [],
  occurrences: []
};

describe('independent budget and liquidity', () => {
  it('shows different second-fortnight and monthly spending margins', () => {
    const monthly = budgetAvailability(buildCashFlow({...source, period: 'month'}));
    const fortnight = budgetAvailability(buildCashFlow({...source, period: 'second'}));
    expect(monthly.available).toBe(5900);
    expect(fortnight.available).toBe(2900);
    expect(monthly.income).toBe(10000);
    expect(monthly.expenses).toBe(1600);
    expect(monthly.commitments).toBe(2000);
    expect(monthly.savingsPending).toBe(500);
  });

  it('does not present planned but unreceived salary as money in the bank', () => {
    const partlyReceived = {
      ...source,
      transactions: source.transactions.filter(t => t.id !== 'income-2')
    };
    const forecast = budgetAvailability(buildCashFlow(partlyReceived));
    expect(forecast.income).toBe(10000);
    expect(forecast.received).toBe(4000);
    expect(forecast.incomePending).toBe(6000);
    expect(forecast.estimated).toBe(true);
  });

  it('counts card purchases against the budget, without reducing bank or cash balances', () => {
    const accounts = [
      {
        id: 'bank',
        name: 'Banco',
        opening_balance: 5000,
        active: true,
        account_type: 'checking',
        account_class: 'asset'
      },
      {id: 'cash', name: 'Efectivo', opening_balance: 800, active: true, account_type: 'cash', account_class: 'asset'},
      {
        id: 'card',
        name: 'Crédito',
        opening_balance: 0,
        active: true,
        account_type: 'credit',
        account_class: 'liability'
      }
    ];
    const movements = [
      {account_id: 'card', type: 'expense', amount: 300, transaction_date: '2026-10-17'},
      {account_id: 'bank', type: 'expense', amount: 200, transaction_date: '2026-10-17'},
      {account_id: 'cash', type: 'expense', amount: 100, transaction_date: '2026-10-17'}
    ];
    const accountRows = overviewAccounts(accounts, movements, [], '2026-10-19');
    expect(accountLiquidity(accountRows)).toEqual({banks: 4800, cash: 700, total: 5500});
    expect(accountRows.find(a => a.id === 'card')?.balance).toBe(300);
    expect(budgetAvailability(buildCashFlow(source)).expenses).toBe(1600);

    const debtPayment = [{from_account_id: 'bank', to_account_id: 'card', amount: 300, transfer_date: '2026-10-19'}];
    const afterPayment = overviewAccounts(accounts, movements, debtPayment, '2026-10-19');
    expect(accountLiquidity(afterPayment)).toEqual({banks: 4500, cash: 700, total: 5200});
    expect(afterPayment.find(a => a.id === 'card')?.balance).toBe(0);
    expect(budgetAvailability(buildCashFlow(source)).expenses).toBe(1600);
  });

  it('does not change total liquidity on a transfer between owned asset accounts', () => {
    const accounts = [
      {id: 'a', name: 'A', opening_balance: 600, active: true, account_type: 'checking', account_class: 'asset'},
      {id: 'b', name: 'B', opening_balance: 200, active: true, account_type: 'savings', account_class: 'asset'}
    ];
    const transfer = [{from_account_id: 'a', to_account_id: 'b', amount: 150, transfer_date: '2026-10-19'}];
    expect(accountLiquidity(overviewAccounts(accounts, [], transfer, '2026-10-19'))).toEqual({
      banks: 800,
      cash: 0,
      total: 800
    });
  });
});
