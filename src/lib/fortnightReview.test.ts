import {describe, expect, it} from 'vitest';
import {buildFortnightReview, reviewBounds, reviewIsEnded, reviewText, type ReviewSource} from './fortnightReview';
const month = '2026-10-01';
function fixture(): ReviewSource {
  return {
    members: [
      {user_id: 'a', full_name: 'A'},
      {user_id: 'b', full_name: 'B'}
    ],
    income_plans: [
      {user_id: 'a', month, expected_amount: 1000, first_half_amount: 600, second_half_amount: 400},
      {user_id: 'b', month, expected_amount: 1000, first_half_amount: 400, second_half_amount: 600}
    ],
    allocations: [{category_id: 'food', month, planned_amount: 1000, first_half_amount: 700, second_half_amount: 300}],
    categories: [{id: 'food', name: 'Alimentos', budget_group: 'variable'}],
    transactions: [
      {
        id: 'i1',
        amount: 600,
        type: 'income',
        transaction_date: '2026-10-15',
        category_id: null,
        paid_by: 'a',
        is_shared: true
      },
      {
        id: 'i2',
        amount: 1000,
        type: 'income',
        transaction_date: '2026-10-16',
        category_id: null,
        paid_by: 'b',
        is_shared: true
      },
      {
        id: 'e1',
        amount: 700,
        type: 'expense',
        transaction_date: '2026-10-15',
        category_id: 'food',
        paid_by: 'a',
        is_shared: true
      },
      {
        id: 'e2',
        amount: 300,
        type: 'expense',
        transaction_date: '2026-10-16',
        category_id: 'food',
        paid_by: 'b',
        is_shared: true
      }
    ],
    savings: [],
    splits: [
      {transaction_id: 'e1', user_id: 'a', share_amount: 350},
      {transaction_id: 'e1', user_id: 'b', share_amount: 350},
      {transaction_id: 'e2', user_id: 'a', share_amount: 150},
      {transaction_id: 'e2', user_id: 'b', share_amount: 150}
    ],
    settings: {split_method: 'income'},
    member_settings: [],
    category_settings: [],
    category_member_settings: [],
    recurring: [{id: 'r', description: 'Servicios', amount: 100, type: 'expense'}],
    occurrences: [
      {id: 'o', recurring_transaction_id: 'r', due_date: '2026-10-15', status: 'pending', transaction_id: null}
    ]
  };
}
describe('guided fortnight review', () => {
  it('ends on the 15th or actual last day, and only permits review after the last day', () => {
    expect(reviewBounds('2028-02-01', 'second')).toEqual({start: '2028-02-16', end: '2028-02-29'});
    expect(reviewIsEnded(month, 'first', '2026-10-15')).toBe(false);
    expect(reviewIsEnded(month, 'first', '2026-10-16')).toBe(true);
    expect(reviewIsEnded(month, 'second', '2026-10-31')).toBe(false);
    expect(reviewIsEnded(month, 'second', '2026-11-01')).toBe(true);
  });
  it('compares actual income per person without letting an overpayment erase someone else’s pending income', () => {
    const result = buildFortnightReview(month, 'second', fixture());
    expect(result.financial).toMatchObject({expected: 1000, income: 1000, pending_income: 400});
    expect(result.people[1].pending).toBe(0);
  });
  it('counts pending obligations without creating or subtracting them as real expenses', () => {
    const s = fixture(),
      before = JSON.stringify(s),
      result = buildFortnightReview(month, 'first', s);
    expect(result.financial).toMatchObject({expense: 700, pending_payments: 100, balance: -100});
    expect(result.issues.some(i => i.id === 'payments-pending')).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('excludes paid, skipped and other-half commitments from pending totals', () => {
    const s = fixture();
    s.occurrences.push({
      id: 'o2',
      recurring_transaction_id: 'r',
      due_date: '2026-10-16',
      status: 'pending',
      transaction_id: null
    });
    s.occurrences[0].status = 'paid';
    expect(buildFortnightReview(month, 'first', s).financial.pending_payments).toBe(0);
    s.occurrences[0].status = 'skipped';
    expect(buildFortnightReview(month, 'first', s).financial.pending_payments).toBe(0);
    expect(buildFortnightReview(month, 'second', s).financial.pending_payments).toBe(100);
  });
  it('warns about ungenerated recurring dates, clamps February due days and excludes templates created after their due date', () => {
    const s = fixture();
    s.recurring = [
      {
        id: 'missing',
        description: 'Pago',
        amount: 100,
        type: 'expense',
        active: true,
        due_day: 31,
        created_at: '2026-01-01'
      }
    ];
    s.occurrences = [];
    expect(buildFortnightReview('2026-02-01', 'second', s).issues.some(i => i.id === 'missing-occurrences')).toBe(true);
    s.recurring[0].created_at = '2026-03-01';
    expect(buildFortnightReview('2026-02-01', 'second', s).issues.some(i => i.id === 'missing-occurrences')).toBe(
      false
    );
  });
  it('suggests cent-exact transfers from stored shared balances without touching records', () => {
    const result = buildFortnightReview(month, 'first', fixture());
    expect(result.settlements).toEqual([{from_id: 'b', from: 'B', to_id: 'a', to: 'A', amount: 350}]);
    expect(result.people.map(p => p.assigned)).toEqual([350, 350]);
  });
  it('does not treat personal expenses as household settlements', () => {
    const s = fixture();
    s.transactions.find(t => t.id === 'e1')!.is_shared = false;
    expect(buildFortnightReview(month, 'first', s).settlements).toEqual([]);
  });
  it('detects split errors per transaction even when opposite errors cancel in the total', () => {
    const s = fixture();
    s.transactions.push({...s.transactions[2], id: 'e3', amount: 700});
    s.splits[0].share_amount = 300;
    s.splits.push(
      {transaction_id: 'e3', user_id: 'a', share_amount: 400},
      {transaction_id: 'e3', user_id: 'b', share_amount: 350}
    );
    const result = buildFortnightReview(month, 'first', s);
    expect(result.issues.some(i => i.id === 'splits-incomplete')).toBe(true);
    expect(result.settlements).toEqual([]);
  });
  it('blocks settlement suggestions involving former members', () => {
    const s = fixture();
    s.splits[1].user_id = 'former';
    expect(buildFortnightReview(month, 'first', s).settlements).toEqual([]);
    expect(buildFortnightReview(month, 'first', s).issues.some(i => i.id === 'splits-incomplete')).toBe(true);
  });
  it('includes unattributed actual income and flags it for review', () => {
    const s = fixture();
    s.transactions[0].paid_by = null;
    const result = buildFortnightReview(month, 'first', s);
    expect(result.financial.income).toBe(600);
    expect(result.issues.some(i => i.id === 'unattributed-income')).toBe(true);
  });
  it('carries the first half’s deficit once and keeps income receipt differences separate from saved expense splits', () => {
    const result = buildFortnightReview(month, 'second', fixture());
    expect(result.financial).toMatchObject({carry: -100, balance: 600});
    expect(result.settlements[0]).toMatchObject({from_id: 'a', to_id: 'b', amount: 150});
  });
  it('copies an explicitly labelled summary with notes and pending items, without claiming a suggested payment happened', () => {
    const text = reviewText(buildFortnightReview(month, 'first', fixture()), 'Casa', 'Esperar ingreso.', false);
    expect(text).toContain('Vista previa');
    expect(text).toContain('sin registrar pagos');
    expect(text).toContain('Esperar ingreso.');
    expect(text).toContain('Puntos por atender:');
  });
  it('makes an empty period a truthful zero summary with no invented obligations or transfers', () => {
    const s = fixture();
    s.income_plans = [];
    s.allocations = [];
    s.transactions = [];
    s.savings = [];
    s.splits = [];
    s.recurring = [];
    s.occurrences = [];
    const result = buildFortnightReview(month, 'first', s);
    expect(result.financial.balance).toBe(0);
    expect(result.settlements).toEqual([]);
    expect(result.issues).toEqual([]);
  });
});
