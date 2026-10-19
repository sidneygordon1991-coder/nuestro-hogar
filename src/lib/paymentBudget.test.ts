import {describe, it, expect} from 'vitest';
import {defaultPaymentBudget, paymentBudgetIncluded, paymentEffect, type PaymentAccount} from './paymentBudget';
import {countsInBudget} from './budgetTreatment';
import {overviewAccounts, overviewPeriod, homeMargin} from './homeOverview';
import {buildCashFlow, type CashFlowSource} from './cashFlow';
const bank: PaymentAccount = {id: 'bank', name: 'Débito', account_type: 'checking', account_class: 'asset'};
const credit: PaymentAccount = {id: 'card', name: 'Visa', account_type: 'credit', account_class: 'liability'};
const form = (account: string, mode = 'auto', type = 'expense') => {
  const f = new FormData();
  f.set('account_id', account);
  f.set('budget_included', mode);
  f.set('type', type);
  return f;
};
describe('payment source defaults and recorded classification', () => {
  it('counts purchases paid with cash, debit, savings or credit in the budget', () => {
    for (const type of ['cash', 'checking', 'savings'])
      expect(defaultPaymentBudget({...bank, account_type: type})).toBe(true);
    expect(defaultPaymentBudget(credit)).toBe(true);
    expect(defaultPaymentBudget()).toBe(true);
    expect(defaultPaymentBudget({...bank, name: 'Tarjeta de crédito', account_type: 'checking'})).toBe(true);
    expect(defaultPaymentBudget({...bank, account_type: 'other'})).toBe(true);
    expect(defaultPaymentBudget({...credit, account_type: 'loan'})).toBe(true);
  });
  it('allows explicit exceptions on either funding source', () => {
    expect(paymentBudgetIncluded(form('bank'), [bank, credit])).toBe(true);
    expect(paymentBudgetIncluded(form('card'), [bank, credit])).toBe(true);
    expect(paymentBudgetIncluded(form('bank', 'true'), [bank, credit])).toBe(true);
    expect(paymentBudgetIncluded(form('card', 'false'), [bank, credit])).toBe(false);
    expect(paymentBudgetIncluded(form('bank', 'false'), [bank, credit])).toBe(false);
    expect(paymentBudgetIncluded(form('bank', 'false', 'income'), [bank, credit])).toBe(true);
  });
  it('blocks unverified accounts instead of inventing their type', () => {
    expect(() => paymentBudgetIncluded(form('missing'), [bank])).toThrow('no está disponible');
    expect(() => paymentBudgetIncluded(form('unknown'), [{id: 'unknown', name: 'Cuenta'}])).toThrow('tipo de cuenta');
    expect(() => paymentBudgetIncluded(form('bank', 'invalid'), [bank])).toThrow('Selecciona');
  });
  it('never reclassifies a historical payment after the account changes', () => {
    const recorded = {budget_included: false};
    expect(defaultPaymentBudget(credit)).toBe(true);
    expect(countsInBudget(recorded)).toBe(false);
    expect(countsInBudget({budget_included: true})).toBe(true);
  });
  it('explains debt, cash and card repayments separately', () => {
    expect(paymentEffect(credit, 'expense', true)).toContain('dinero disponible no sale');
    expect(paymentEffect(credit, 'expense', false)).toContain('fuera del presupuesto');
    expect(paymentEffect(bank, 'expense', true)).toContain('También consume el presupuesto');
    expect(paymentEffect(bank, 'expense', false)).toContain('excluido manualmente');
    expect(paymentEffect(credit, 'income', true)).toContain('Transferir / pagar deuda');
    expect(paymentEffect(undefined, 'expense', true)).toContain('no se ajusta ningún saldo');
  });
  it('counts the card purchase once and keeps repayments and own-account transfers neutral', () => {
    const accounts = [
      {...bank, account_class: 'asset', account_type: 'checking', opening_balance: 0},
      {...credit, account_class: 'liability', account_type: 'credit', opening_balance: 0},
      {id: 'cash', name: 'Efectivo', account_class: 'asset', account_type: 'cash', opening_balance: 0}
    ];
    const income = {
      id: 'income',
      account_id: 'bank',
      type: 'income',
      amount: 1000,
      transaction_date: '2026-10-14',
      category_id: null,
      paid_by: 'a'
    };
    const purchase = {
      id: 'purchase',
      account_id: 'card',
      type: 'expense',
      amount: 500,
      transaction_date: '2026-10-15',
      category_id: 'food',
      paid_by: 'a',
      budget_included: true
    };
    const cashPurchase = {
      id: 'cash-purchase',
      account_id: 'bank',
      type: 'expense',
      amount: 100,
      transaction_date: '2026-10-15',
      category_id: 'food',
      paid_by: 'a',
      budget_included: true
    };
    const movements = [income, purchase, cashPurchase];
    const source: CashFlowSource = {
      month: '2026-10-01',
      today: '2026-10-20',
      transactions: movements,
      savings: [],
      allocations: [{month: '2026-10-01', category_id: 'food', planned_amount: 1000}],
      categories: [{id: 'food', budget_group: 'variable'}],
      members: [{user_id: 'a', full_name: 'A'}],
      plans: [],
      recurring: [],
      occurrences: []
    };
    const flow = buildCashFlow(source);
    const before = overviewAccounts(accounts, movements, [], source.today);
    expect(before.find(a => a.id === 'bank')?.balance).toBe(900);
    expect(before.find(a => a.id === 'card')?.balance).toBe(500);
    expect(flow).toMatchObject({income: 1000, expense: 600, budgetExpense: 600, excludedExpense: 0, available: 400});
    expect(overviewPeriod(source, 'month').budgets[0].spent).toBe(600);
    const transfers = [
      {from_account_id: 'bank', to_account_id: 'card', amount: 500, transfer_date: '2026-10-16'},
      {from_account_id: 'bank', to_account_id: 'cash', amount: 100, transfer_date: '2026-10-17'}
    ];
    const after = overviewAccounts(accounts, movements, transfers, source.today);
    expect(after.find(a => a.id === 'bank')?.balance).toBe(300);
    expect(after.find(a => a.id === 'cash')?.balance).toBe(100);
    expect(after.find(a => a.id === 'card')?.balance).toBe(0);
    expect(homeMargin(flow, 900, {cardsDue: 500}).margin).toBe(400);
    expect(homeMargin(flow, 400, {cardsDue: 0}).margin).toBe(400);
    expect(overviewPeriod(source, 'month').budgets[0].spent).toBe(600);
  });
});
