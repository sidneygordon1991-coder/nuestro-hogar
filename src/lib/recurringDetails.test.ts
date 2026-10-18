import {describe, it, expect} from 'vitest';
import {occurrenceDetails, recurringTerms} from './recurringDetails';
import {buildFortnightReview, type ReviewSource} from './fortnightReview';
describe('recurring occurrence history', () => {
  const template = {
    description: 'Current rent',
    amount: 1200,
    type: 'expense' as const,
    due_day: 15,
    category_id: 'rent',
    account_id: null,
    paid_by: null,
    is_shared: true
  };
  it('preserves the historical paid description and cents after a template changes', () => {
    const result = occurrenceDetails(template, {
      description: 'Old rent',
      amount: 900.25,
      type: 'expense',
      category_id: 'old'
    });
    expect(result).toMatchObject({description: 'Old rent', amount: 900.25, category_id: 'old'});
    expect(template.amount).toBe(1200);
  });
  it('uses legacy template data for old backups and rejects incomplete/malformed snapshots', () => {
    expect(occurrenceDetails(template, null)).toBe(template);
    expect(occurrenceDetails(template, {amount: -1})).toBe(template);
    expect(occurrenceDetails(template, {amount: 50, description: 'Incomplete'})).toBe(template);
  });
  it('normalizes a complete expected form for stale-write detection, including nullable fields', () => {
    expect(recurringTerms({...template, amount: '1200.00'})).toEqual(template);
  });
  it('carries occurrence details into the guided review without counting a paid bill again', () => {
    const source: ReviewSource = {
      members: [],
      income_plans: [],
      allocations: [],
      categories: [],
      transactions: [],
      savings: [],
      splits: [],
      settings: null,
      member_settings: [],
      category_settings: [],
      category_member_settings: [],
      recurring: [{id: 'rent', ...template}],
      occurrences: [
        {
          id: 'paid',
          recurring_transaction_id: 'rent',
          due_date: '2026-10-15',
          status: 'paid',
          transaction_id: 'tx',
          details_snapshot: {description: 'Old rent', amount: 900.25, type: 'expense'}
        }
      ]
    };
    const result = buildFortnightReview('2026-10-01', 'first', source);
    expect(result.payments[0]).toMatchObject({description: 'Old rent', amount: 900.25, status: 'paid'});
    expect(result.financial.pending_payments).toBe(0);
  });
});
