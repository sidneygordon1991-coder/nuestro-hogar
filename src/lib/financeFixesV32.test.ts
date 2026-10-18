import {describe, expect, it} from 'vitest';
import {buildCashFlow, type CashFlowSource} from './cashFlow';
import {balanceTimeline, goalBalance, homeMargin} from './homeOverview';
import {unreservedCardPayments} from './creditCards';

const base: CashFlowSource = {
  month: '2026-10-01',
  today: '2026-10-16',
  transactions: [
    {id: 'pay', type: 'income', amount: 10000, transaction_date: '2026-10-01', category_id: null, paid_by: 'a'},
    {id: 'food', type: 'expense', amount: 2000, transaction_date: '2026-10-05', category_id: 'food', paid_by: 'a'}
  ],
  savings: [],
  categories: [
    {id: 'food', budget_group: 'variable'},
    {id: 'save', budget_group: 'saving'}
  ],
  allocations: [{category_id: 'save', planned_amount: 1000, month: '2026-10-01'}],
  members: [{user_id: 'a', full_name: 'A'}],
  plans: [],
  recurring: [],
  occurrences: []
};

describe('v32 · savings recorded as an expense in a savings category', () => {
  it('counts it once, as saving, and reduces what is still to set aside', () => {
    const viaExpense = buildCashFlow({
      ...base,
      transactions: [
        ...base.transactions,
        {id: 's', type: 'expense', amount: 1000, transaction_date: '2026-10-10', category_id: 'save', paid_by: 'a'}
      ]
    });
    const viaGoal = buildCashFlow({...base, savings: [{amount: 1000, contribution_date: '2026-10-10'}]});
    expect(viaExpense.expense).toBe(2000);
    expect(viaExpense.saving).toBe(1000);
    expect(viaExpense.savingsRemaining).toBe(0);
    expect(viaExpense.projectedClose).toBe(viaGoal.projectedClose);
    expect(viaExpense.available).toBe(viaGoal.available);
  });
  it('a pending recurring saving covered by the plan is not also a commitment', () => {
    const flow = buildCashFlow({
      ...base,
      recurring: [
        {
          id: 'r',
          description: 'Ahorro',
          amount: 1000,
          type: 'expense',
          category_id: 'save',
          paid_by: 'a',
          is_shared: true
        }
      ],
      occurrences: [{id: 'o', recurring_transaction_id: 'r', due_date: '2026-10-25', status: 'pending'}]
    });
    expect(flow.fixedCommitments).toBe(0);
    expect(flow.savingsRemaining).toBe(1000);
  });
});

describe('v32 · overdue recurring payments from an earlier month', () => {
  const src = {
    ...base,
    recurring: [
      {id: 'r', description: 'Luz', amount: 300, type: 'expense', category_id: 'food', paid_by: 'a', is_shared: true}
    ],
    occurrences: [{id: 'old', recurring_transaction_id: 'r', due_date: '2026-09-30', status: 'pending'}]
  } as CashFlowSource;
  it('stay pending and overdue instead of disappearing on the 1st', () => {
    const month = buildCashFlow(src);
    expect(month.overdue).toBe(1);
    expect(month.pendingRecurringAmount).toBe(300);
    expect(buildCashFlow({...src, period: 'second'}).overdue).toBe(1);
    expect(buildCashFlow({...src, period: 'first'}).overdue).toBe(0);
  });
  it('are applied today in the projection', () => {
    const t = balanceTimeline(src, 'second');
    expect(t.marks.find(m => m.kind === 'payment')).toMatchObject({date: '2026-10-16', amount: 300});
  });
});

describe('v32 · safe-to-spend margin with accounts', () => {
  const flow = {available: 0, fixedCommitments: 500, savingsRemaining: 250};
  it('reserves money already saved for goals and card balances due', () => {
    const m = homeMargin(flow, 25000, {goalSaved: 16000, cardsDue: 1200});
    expect(m.goals).toBe(16000);
    expect(m.cards).toBe(1200);
    expect(m.margin).toBe(25000 - 16000 - 1200 - 500 - 250);
  });
  it('never reserves more for goals than the liquid balance, and ignores reserves without accounts', () => {
    expect(homeMargin(flow, 1000, {goalSaved: 5000}).goals).toBe(1000);
    expect(homeMargin(flow, null, {goalSaved: 5000, cardsDue: 900})).toMatchObject({goals: 0, cards: 0, margin: -750});
  });
  it('goal balance includes withdrawals and ignores inactive goals and future entries', () => {
    expect(
      goalBalance(
        [{id: 'g'}],
        [
          {goal_id: 'g', amount: 500, contribution_date: '2026-10-01'},
          {goal_id: 'g', amount: -200, contribution_date: '2026-10-02'},
          {goal_id: 'g', amount: 999, contribution_date: '2026-10-30'},
          {goal_id: 'x', amount: 50, contribution_date: '2026-10-01'}
        ],
        '2026-10-16'
      )
    ).toBe(300);
  });
});

import {scopeSource} from './homeOverview';
describe('v32 · personal lens', () => {
  it('includes my saved share of shared expenses, whoever paid', () => {
    const src = {
      ...base,
      transactions: [
        ...base.transactions,
        {
          id: 'rent',
          type: 'expense',
          amount: 4000,
          transaction_date: '2026-10-02',
          category_id: 'food',
          paid_by: 'b',
          is_shared: true
        }
      ]
    } as CashFlowSource;
    const mine = scopeSource(
      src,
      'personal',
      'a',
      [],
      [
        {transaction_id: 'rent', user_id: 'a', share_amount: 2000},
        {transaction_id: 'rent', user_id: 'b', share_amount: 2000}
      ]
    );
    expect(mine.transactions.find(t => t.id === 'share-rent')).toMatchObject({
      amount: 2000,
      paid_by: 'a',
      is_shared: false
    });
    expect(buildCashFlow(mine).expense).toBe(2000);
  });
});

describe('v32 · review follow-ups', () => {
  it('a pending recurring saving still counts when the plan was already met by other savings', () => {
    const flow = buildCashFlow({
      ...base,
      savings: [{amount: 1000, contribution_date: '2026-10-05'}],
      recurring: [
        {
          id: 'r',
          description: 'Ahorro',
          amount: 1000,
          type: 'expense',
          category_id: 'save',
          paid_by: 'a',
          is_shared: true
        }
      ],
      occurrences: [{id: 'o', recurring_transaction_id: 'r', due_date: '2026-10-25', status: 'pending'}]
    });
    expect(flow.savingsRemaining).toBe(0);
    expect(flow.fixedCommitments).toBe(1000);
  });
});

describe('v32 · card payment reservations', () => {
  const cards = [
    {id: 'visa', name: 'Visa Oro', toAvoidInterest: 1000, dueDate: '2026-10-25'},
    {id: 'master', name: 'Mastercard', toAvoidInterest: 500, dueDate: '2026-10-28'}
  ];
  const source = (description: string, amount = 200, extra = {}) => ({
    ...base,
    recurring: [{id: 'r', type: 'expense', description, amount, ...extra}],
    occurrences: [{id: 'o', recurring_transaction_id: 'r', status: 'pending', due_date: '2026-10-20'}]
  });
  it('subtracts just the reserved partial payment, preserving the rest of that card and other cards', () => {
    expect(unreservedCardPayments(cards, source('Pago Visa Oro'), '2026-10-31')).toBe(1300);
    expect(unreservedCardPayments(cards, source('Pago Visa Oro', 2000), '2026-10-31')).toBe(500);
  });
  it('never removes all card obligations for a generic, ambiguous or unrelated recurring description', () => {
    for (const text of ['Pago tarjeta', 'Abono Visa Oro y Mastercard', 'Seguro Visa Oro'])
      expect(unreservedCardPayments(cards, source(text), '2026-10-31')).toBe(1500);
  });
  it('ignores income and purchases charged to the same credit card', () => {
    expect(unreservedCardPayments(cards, source('Pago Visa Oro', 200, {type: 'income'}), '2026-10-31')).toBe(1500);
    expect(unreservedCardPayments(cards, source('Pago Visa Oro', 200, {account_id: 'visa'}), '2026-10-31')).toBe(1500);
  });
  it('honors occurrence snapshots, skips next-month recurrences and already-paid transactions', () => {
    const s = source('Pago Visa Oro');
    expect(
      unreservedCardPayments(
        cards,
        {
          ...s,
          occurrences: [
            {...s.occurrences[0], details_snapshot: {type: 'expense', description: 'Pago Visa Oro', amount: 50}}
          ]
        },
        '2026-10-31'
      )
    ).toBe(1450);
    expect(
      unreservedCardPayments(cards, {...s, occurrences: [{...s.occurrences[0], due_date: '2026-11-01'}]}, '2026-10-31')
    ).toBe(1500);
    expect(
      unreservedCardPayments(cards, {...s, occurrences: [{...s.occurrences[0], transaction_id: 'pay'}]}, '2026-10-31')
    ).toBe(1500);
  });
});
