import {describe, expect, it} from 'vitest';
import {accountAvailability, availabilityWindow, homeBudgetAvailability} from './homeAvailability';
import {overviewAccounts, scopeSource} from './homeOverview';
import type {CashFlowSource} from './cashFlow';
const month = '2026-10-01',
  today = '2026-10-20';
const s: CashFlowSource = {
  month,
  today,
  members: [
    {user_id: 'a', full_name: 'A'},
    {user_id: 'b', full_name: 'B'}
  ],
  plans: [
    {user_id: 'a', month, expected_amount: 6000, first_half_amount: 3000, second_half_amount: 3000},
    {user_id: 'b', month, expected_amount: 4000, first_half_amount: 2000, second_half_amount: 2000}
  ],
  categories: [
    {id: 'food', budget_group: 'variable'},
    {id: 'saving', budget_group: 'saving'}
  ],
  allocations: [],
  savings: [{amount: 500, contribution_date: '2026-10-16'}],
  recurring: [],
  occurrences: [],
  transactions: [
    {id: 'i1', type: 'income', amount: 3000, paid_by: 'a', category_id: null, transaction_date: '2026-10-14'},
    {id: 'i2', type: 'income', amount: 2000, paid_by: 'b', category_id: null, transaction_date: '2026-10-16'},
    {
      id: 'card',
      type: 'expense',
      amount: 600,
      paid_by: 'a',
      category_id: 'food',
      transaction_date: '2026-10-18',
      budget_included: true,
      is_shared: true
    },
    {
      id: 'cash',
      type: 'expense',
      amount: 100,
      paid_by: 'a',
      category_id: 'food',
      transaction_date: '2026-10-18',
      budget_included: false,
      is_shared: true
    },
    {id: 'goal', type: 'expense', amount: 200, paid_by: 'a', category_id: 'saving', transaction_date: '2026-10-18'},
    {id: 'future', type: 'income', amount: 9999, paid_by: 'a', category_id: null, transaction_date: '2026-10-29'},
    {id: 'old', type: 'expense', amount: 9999, paid_by: 'a', category_id: 'food', transaction_date: '2026-09-30'}
  ]
};
describe('separate registered accounts and remaining income budget', () => {
  it('totals cash, current and savings accounts once, with transfers and debt kept separate', () => {
    const rows = overviewAccounts(
      [
        {id: 'bank', name: 'Bank', account_class: 'asset', account_type: 'checking', opening_balance: 1000},
        {id: 'saving', name: 'Saving', account_class: 'asset', account_type: 'savings', opening_balance: 300},
        {id: 'cash', name: 'Cash', account_class: 'asset', account_type: 'cash', opening_balance: 100},
        {id: 'card', name: 'Card', account_class: 'liability', account_type: 'credit', opening_balance: 200},
        {id: 'invest', name: 'Invest', account_class: 'asset', account_type: 'investment', opening_balance: 9000},
        {
          id: 'old',
          name: 'Archived',
          account_class: 'asset',
          account_type: 'checking',
          opening_balance: 9000,
          active: false
        }
      ],
      [],
      [
        {from_account_id: 'bank', to_account_id: 'cash', amount: 50, transfer_date: today},
        {from_account_id: 'bank', to_account_id: 'card', amount: 200, transfer_date: today}
      ],
      today
    );
    expect(accountAvailability(rows)).toEqual({total: 1200, bank: 1050, cash: 150, count: 3});
  });
  it('preserves negative balances and distinguishes no accounts from missing network data', () => {
    const rows = overviewAccounts(
      [
        {id: 'bank', name: 'Bank', account_class: 'asset', account_type: 'checking', opening_balance: -0.2},
        {id: 'cash', name: 'Cash', account_class: 'asset', account_type: 'cash', opening_balance: 0.1}
      ],
      [],
      [],
      today
    );
    expect(accountAvailability(rows).total).toBe(-0.1);
    expect(accountAvailability([])).toEqual({total: 0, bank: 0, cash: 0, count: 0});
  });
  it('shows received income minus included expenses, without inventing income or deducting savings twice', () => {
    expect(homeBudgetAvailability(s, 'month', availabilityWindow(month, today, 'month'))).toMatchObject({
      received: 5000,
      spent: 600,
      remaining: 4400,
      outside: 100,
      actualExpenses: 700,
      actualResult: 4300,
      expected: 10000,
      projectedRemaining: 9400
    });
    expect(homeBudgetAvailability(s, 'first', availabilityWindow(month, today, 'first')).remaining).toBe(3000);
    expect(homeBudgetAvailability(s, 'second', availabilityWindow(month, today, 'second')).remaining).toBe(1400);
  });
  it('keeps received and expected income separate and requires every saved fortnight amount', () => {
    const partial = {...s, plans: [s.plans[0], {...s.plans[1], second_half_amount: null}]};
    expect(homeBudgetAvailability(partial, 'second', availabilityWindow(month, today, 'second'))).toMatchObject({
      received: 2000,
      remaining: 1400,
      expected: null,
      projectedRemaining: null,
      missing: ['B']
    });
    expect(
      homeBudgetAvailability({...s, plans: []}, 'month', availabilityWindow(month, today, 'month')).expected
    ).toBeNull();
    expect(
      homeBudgetAvailability(
        {
          ...s,
          plans: s.plans.map(p => ({...p, expected_amount: 0, first_half_amount: null, second_half_amount: null}))
        },
        'first',
        availabilityWindow(month, today, 'first')
      ).expected
    ).toBe(0);
  });
  it('uses a single personal cycle window for everyone and calendar dates for the month', () => {
    const cycle = {cycle_first_day: 14, cycle_second_day: 29};
    expect(availabilityWindow(month, today, 'first', cycle)).toEqual({
      start: '2026-10-14',
      end: '2026-10-28',
      planMonth: month
    });
    expect(availabilityWindow(month, today, 'second', cycle)).toEqual({
      start: '2026-10-29',
      end: '2026-11-13',
      planMonth: month
    });
    expect(availabilityWindow(month, '2026-10-02', 'second', cycle)).toEqual({
      start: '2026-09-29',
      end: '2026-10-13',
      planMonth: '2026-09-01'
    });
    expect(availabilityWindow(month, today, 'month', cycle)).toEqual({
      start: month,
      end: '2026-10-31',
      planMonth: month
    });
    expect(homeBudgetAvailability(s, 'first', availabilityWindow(month, today, 'first', cycle)).remaining).toBe(4400);
  });
  it('handles February and year boundaries without skipping or overlapping days', () => {
    const cycle = {cycle_first_day: 14, cycle_second_day: 29};
    expect(availabilityWindow('2026-03-01', '2026-03-02', 'second', cycle)).toEqual({
      start: '2026-03-01',
      end: '2026-03-13',
      planMonth: '2026-02-01'
    });
    expect(availabilityWindow('2027-01-01', '2027-01-02', 'second', cycle)).toEqual({
      start: '2026-12-29',
      end: '2027-01-13',
      planMonth: '2026-12-01'
    });
  });
  it('anchors 29–13 and 14–28 to the saved plan month without changing calendar totals', () => {
    const reversed = {cycle_first_day: 29, cycle_second_day: 14};
    expect(availabilityWindow(month, '2026-10-16', 'second', reversed)).toEqual({
      start: '2026-10-14',
      end: '2026-10-28',
      planMonth: '2026-09-01'
    });
    expect(availabilityWindow(month, '2026-10-29', 'first', reversed)).toEqual({
      start: '2026-10-29',
      end: '2026-11-13',
      planMonth: month
    });
    expect(availabilityWindow(month, '2026-10-29', 'month', reversed)).toEqual({
      start: month,
      end: '2026-10-31',
      planMonth: month
    });
    expect(
      availabilityWindow('2027-03-01', '2027-03-01', 'first', {cycle_first_day: 31, cycle_second_day: 16})
    ).toEqual({start: '2027-03-01', end: '2027-03-15', planMonth: '2027-02-01'});
  });
  it('does not turn personal shares of excluded household expenses back into budget spending', () => {
    const personal = scopeSource(
      s,
      'personal',
      'a',
      [],
      [
        {transaction_id: 'card', user_id: 'a', share_amount: 300},
        {transaction_id: 'cash', user_id: 'a', share_amount: 50}
      ]
    );
    expect(homeBudgetAvailability(personal, 'month', availabilityWindow(month, today, 'month'))).toMatchObject({
      received: 3000,
      spent: 300,
      outside: 50,
      remaining: 2700,
      actualResult: 2650
    });
  });
  it('keeps cents and deficits instead of flooring available budget to zero', () => {
    const rows = {
      ...s,
      transactions: [
        {...s.transactions[0], amount: 0.1},
        {...s.transactions[2], amount: 0.3}
      ]
    };
    expect(homeBudgetAvailability(rows, 'month', availabilityWindow(month, today, 'month')).remaining).toBe(-0.2);
  });
});
