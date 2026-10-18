import {describe, it, expect} from 'vitest';
import {buildFinancialDiagnosis, type DiagnosisData} from './financialDiagnosis';
import {financeSection} from './financeNavigation';
const month = '2026-10-01';
function fixture(): DiagnosisData {
  return {
    month,
    server_date: '2026-10-17',
    generated_at: '2026-10-17T12:00:00Z',
    source: {
      members: [
        {user_id: 'a', full_name: 'A'},
        {user_id: 'b', full_name: 'B'}
      ],
      income_plans: [
        {user_id: 'a', month, expected_amount: 1000, first_half_amount: 500, second_half_amount: 500},
        {user_id: 'b', month, expected_amount: 1000, first_half_amount: 500, second_half_amount: 500}
      ],
      allocations: [
        {category_id: 'food', month, planned_amount: 1000, first_half_amount: 500, second_half_amount: 500}
      ],
      categories: [{id: 'food', name: 'Alimentos', budget_group: 'variable'}],
      transactions: [
        {
          id: 'i',
          type: 'income',
          amount: 500,
          transaction_date: '2026-10-05',
          category_id: null,
          paid_by: 'a',
          is_shared: false
        },
        {
          id: 'e',
          type: 'expense',
          amount: 200,
          transaction_date: '2026-10-06',
          category_id: 'food',
          paid_by: 'a',
          is_shared: false
        }
      ],
      savings: [],
      splits: [],
      member_settings: [],
      settings: {split_method: 'income'},
      category_settings: [],
      category_member_settings: [],
      recurring: [{id: 'r', description: 'Compra', type: 'expense', amount: 600, category_id: 'food'}],
      occurrences: [
        {id: 'o', recurring_transaction_id: 'r', due_date: '2026-10-20', status: 'pending', transaction_id: null}
      ]
    },
    accounts: [],
    history: [
      {month: '2026-07-01', income: 1000, expense: 500, saving: 100, transaction_count: 5},
      {month: '2026-08-01', income: 2000, expense: 1000, saving: 200, transaction_count: 5},
      {month: '2026-09-01', income: 0, expense: 0, saving: 0, transaction_count: 0}
    ],
    reserve: null
  };
}
describe('transparent financial diagnosis', () => {
  it('keeps pending expected income person-specific and does not let extra receipts cancel another person', () => {
    const d = fixture();
    d.source.transactions[0].amount = 1500;
    const r = buildFinancialDiagnosis(d, 'month');
    expect(r.pendingIncome).toBe(1000);
    expect(r.projection.income).toBe(1500);
  });
  it('deducts the larger of category budget remainder and pending bills without duplication', () => {
    const d = fixture();
    let r = buildFinancialDiagnosis(d, 'month');
    expect(r.remainingExpenses).toBe(800);
    expect(r.forecast).toBe(1000);
    d.source.recurring[0].amount = 900;
    r = buildFinancialDiagnosis(d, 'month');
    expect(r.remainingExpenses).toBe(900);
    expect(r.forecast).toBe(900);
  });
  it('does not let budget in a different category hide an uncovered bill', () => {
    const d = fixture();
    d.source.recurring[0].category_id = null;
    expect(buildFinancialDiagnosis(d, 'month').remainingExpenses).toBe(1400);
  });
  it('carries actual first-half amounts only once while preserving earlier unpaid commitments at month end', () => {
    const d = fixture();
    d.source.occurrences[0].due_date = '2026-10-10';
    const r = buildFinancialDiagnosis(d, 'second');
    expect(r.selected.carry).toBe(300);
    expect(r.projection.balance).toBe(300);
    expect(r.forecast).toBe(1000);
    expect(r.overdueAmount).toBe(600);
  });
  it('uses only first-half assignments and movements for its mid-month projection', () => {
    const r = buildFinancialDiagnosis(fixture(), 'first');
    expect(r.projection.balance).toBe(300);
    expect(r.pendingIncome).toBe(500);
    expect(r.remainingExpenses).toBe(300);
    expect(r.forecast).toBe(500);
  });
  it('excludes future-dated income, expenses and saving from actuals and warns about them', () => {
    const d = fixture();
    d.source.transactions.push({
      ...d.source.transactions[0],
      id: 'future',
      amount: 9999,
      transaction_date: '2026-10-30'
    });
    d.source.savings.push({amount: 9999, contribution_date: '2026-10-30'});
    const r = buildFinancialDiagnosis(d, 'month');
    expect(r.monthly.income).toBe(500);
    expect(r.monthly.saving).toBe(0);
    expect(r.warnings.join()).toContain('fecha futura');
  });
  it('does not invent an emergency reserve from cash balances, even when plentiful', () => {
    const d = fixture();
    d.accounts = [
      {
        id: 'bank',
        name: 'Bank',
        account_type: 'checking',
        account_class: 'asset',
        balance: 90000,
        minimum_payment: null
      }
    ];
    const r = buildFinancialDiagnosis(d, 'month');
    expect(r.liquid).toBe(90000);
    expect(r.reserve).toBeNull();
    expect(r.coverage).toBeNull();
    expect(r.forecast).toBe(1000);
  });
  it('honors a confirmed zero reserve, computes the explicit personal target and detects stale confirmations', () => {
    const d = fixture();
    d.reserve = {amount: 0, target_months: 4, confirmed_on: '2026-09-01'};
    const r = buildFinancialDiagnosis(d, 'month');
    expect(r.baseline).toBe(750);
    expect(r.baselineMonths).toBe(2);
    expect(r.coverage).toBe(0);
    expect(r.shortfall).toBe(3000);
    expect(r.age).toBe(46);
    expect(r.actions.some(a => a.id === 'reserve')).toBe(true);
  });
  it('uses labeled planned expense baseline only when completed historical expenses are unavailable', () => {
    const d = fixture();
    d.history = [];
    d.reserve = {amount: 3000, target_months: 3, confirmed_on: '2026-10-17'};
    let r = buildFinancialDiagnosis(d, 'month');
    expect(r.baseline).toBe(1000);
    expect(r.baselineMonths).toBe(0);
    expect(r.coverage).toBe(3);
    d.source.allocations = [];
    r = buildFinancialDiagnosis(d, 'month');
    expect(r.coverage).toBeNull();
    expect(r.shortfall).toBeNull();
  });
  it('shows incomplete debt service without deducting minima a second time', () => {
    const d = fixture();
    d.accounts = [
      {id: 'loan', name: 'Loan', account_class: 'liability', account_type: 'loan', balance: 5000, minimum_payment: 400},
      {
        id: 'credit',
        name: 'Credit',
        account_class: 'liability',
        account_type: 'credit',
        balance: 300,
        minimum_payment: null
      },
      {id: 'paid', name: 'Paid', account_class: 'liability', account_type: 'loan', balance: 0, minimum_payment: 999}
    ];
    const r = buildFinancialDiagnosis(d, 'month');
    expect(r.debt).toBe(5300);
    expect(r.debtRatio).toBe(20);
    expect(r.missingMinima).toBe(1);
    expect(r.forecast).toBe(1000);
  });
  it('does not divide debt service by zero expected income', () => {
    const d = fixture();
    d.source.income_plans = d.source.income_plans.map(p => ({
      ...p,
      expected_amount: 0,
      first_half_amount: 0,
      second_half_amount: 0
    }));
    expect(buildFinancialDiagnosis(d, 'month').debtRatio).toBeNull();
  });
  it('retains negative liquid balances and prioritizes specific obligations over reserve advice', () => {
    const d = fixture();
    d.accounts = [
      {id: 'cash', name: 'Cash', account_class: 'asset', account_type: 'cash', balance: -10, minimum_payment: null}
    ];
    d.source.occurrences[0].due_date = '2026-10-01';
    d.source.recurring[0].amount = 9000;
    const r = buildFinancialDiagnosis(d, 'month');
    expect(r.actions.map(a => a.id)).toEqual(['overdue', 'liquidity', 'deficit']);
    expect(r.liquid).toBe(-10);
    expect(r.tone).toBe('danger');
  });
  it('honors explicit zero plans over reference income and flags missing half allocations', () => {
    const d = fixture();
    d.source.income_plans[0] = {user_id: 'a', month, expected_amount: 0};
    d.source.member_settings = [{user_id: 'a', monthly_income: 9000, custom_share_percent: 50}];
    const r = buildFinancialDiagnosis(d, 'first');
    expect(r.monthly.expected).toBe(1000);
    expect(r.selected.expected).toBe(500);
  });
  it('does not call an unconfigured household healthy and never mutates the ledger, plans or allocations', () => {
    const d = fixture();
    d.source.income_plans = [];
    d.source.allocations = [];
    d.source.transactions = [];
    d.source.recurring = [];
    d.source.occurrences = [];
    const before = JSON.stringify(d),
      r = buildFinancialDiagnosis(d, 'month');
    expect(r.status).toBe('Completa tu diagnóstico');
    expect(r.tone).toBe('warning');
    expect(r.coverage).toBeNull();
    expect(JSON.stringify(d)).toBe(before);
  });
  it('keeps existing proportional and custom contribution rules in the period summary', () => {
    const d = fixture();
    d.source.income_plans[0].first_half_amount = 250;
    d.source.income_plans[1].first_half_amount = 750;
    expect(buildFinancialDiagnosis(d, 'first').selected.people.map(p => p.planned)).toEqual([125, 375]);
    d.source.settings = {split_method: 'custom'};
    d.source.member_settings = [
      {user_id: 'a', monthly_income: 1000, custom_share_percent: 80},
      {user_id: 'b', monthly_income: 1000, custom_share_percent: 20}
    ];
    expect(buildFinancialDiagnosis(d, 'first').selected.people.map(p => p.planned)).toEqual([400, 100]);
  });
  it('flags debt service above expected monthly income without silently subtracting it', () => {
    const d = fixture();
    d.accounts = [
      {
        id: 'loan',
        name: 'Loan',
        account_class: 'liability',
        account_type: 'loan',
        balance: 90000,
        minimum_payment: 2500
      }
    ];
    const r = buildFinancialDiagnosis(d, 'month');
    expect(r.forecast).toBe(1000);
    expect(r.debtRatio).toBe(125);
    expect(r.actions[0].id).toBe('debt-pressure');
    expect(r.actions[0].amount).toBe(500);
    expect(r.tone).toBe('warning');
  });
  it('avoids counting a linked actual movement twice if its occurrence still says pending', () => {
    const d = fixture();
    d.source.occurrences[0].transaction_id = 'e';
    d.source.recurring[0].amount = 9000;
    const r = buildFinancialDiagnosis(d, 'month');
    expect(r.remainingExpenses).toBe(800);
    expect(r.warnings.join()).toContain('movimiento ya registrado');
  });
  it('only accepts known Finance destinations', () => {
    expect(financeSection('income')).toBe('income');
    expect(financeSection('admin')).toBe('summary');
    expect(financeSection(null)).toBe('summary');
  });
  it('explains extra saving capacity as an estimated margin and never suggests it with missing plans', () => {
    const d = fixture();
    d.reserve = {amount: 3000, target_months: 3, confirmed_on: '2026-10-17'};
    const r = buildFinancialDiagnosis(d, 'month');
    const action = r.actions.find(a => a.id === 'margin');
    expect(action?.amount).toBe(r.forecast);
    expect(action?.why).toContain('tras recibir');
    d.source.income_plans = [];
    expect(buildFinancialDiagnosis(d, 'month').actions.some(a => a.id === 'margin')).toBe(false);
  });
  it('reports net saving rate without treating a withdrawal as income', () => {
    const d = fixture();
    d.source.savings = [{amount: -50, contribution_date: '2026-10-10'}];
    const r = buildFinancialDiagnosis(d, 'month');
    expect(r.savingRate).toBe(-10);
    expect(r.monthly.income).toBe(500);
  });
});
