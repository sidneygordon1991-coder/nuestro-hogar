import {describe, expect, it} from 'vitest';
import {
  financePeriodSummary,
  halfOf,
  inPeriod,
  periodShares,
  splitCents,
  unallocated,
  validateHalves,
  type ShareContext
} from './financePeriods';
const month = '2026-10-01',
  members = [
    {user_id: 'a', full_name: 'A'},
    {user_id: 'b', full_name: 'B'}
  ];
const context: ShareContext = {
  members,
  month,
  method: 'income',
  references: {a: 1000, b: 1000},
  plans: [
    {user_id: 'a', month, expected_amount: 1000, first_half_amount: 800, second_half_amount: 200},
    {user_id: 'b', month, expected_amount: 1000, first_half_amount: 200, second_half_amount: 800}
  ],
  rules: {},
  custom: {a: 60, b: 40},
  categoryCustom: {}
};
describe('fortnight finance', () => {
  it('isolates months and places 15 and 16 in different halves, including leap February', () => {
    expect(halfOf('2026-10-15')).toBe('first');
    expect(halfOf('2026-10-16')).toBe('second');
    expect(inPeriod('2028-02-29', '2028-02-01', 'second')).toBe(true);
    expect(inPeriod('2028-03-01', '2028-02-01', 'month')).toBe(false);
  });
  it('keeps legacy monthly amounts unallocated, never assumes 50/50', () => {
    expect(unallocated(1000, {})).toBe(1000);
    expect(unallocated(1000, {first_half_amount: 100})).toBe(900);
  });
  it('validates independent halves, explicit zero, null and cents', () => {
    expect(validateHalves(1000, '0', '')).toEqual({first_half_amount: 0, second_half_amount: null});
    expect(validateHalves(0.3, '0.1', '0.2')).toBeDefined();
  });
  it('rejects over-allocation, negative and malformed halves', () => {
    for (const pair of [
      ['600', '401'],
      ['-1', '0'],
      ['NaN', ''],
      ['1.234', ''],
      ['Infinity', '']
    ])
      expect(() => validateHalves(1000, ...(pair as [string, string]))).toThrow();
  });
  it('uses each half’s combined expected income for proportional contributions', () => {
    expect(periodShares(context, 'first').rows.map(r => r.ratio)).toEqual([0.8, 0.2]);
    expect(periodShares(context, 'second').rows.map(r => r.ratio)).toEqual([0.2, 0.8]);
    expect(periodShares(context, 'month').rows.map(r => r.ratio)).toEqual([0.5, 0.5]);
  });
  it('gives category override priority over the household rule', () => {
    const c = {
      ...context,
      rules: {
        equal: {split_method: 'equal'},
        personal: {split_method: 'personal', responsible_user_id: 'b'},
        custom: {split_method: 'custom'}
      },
      categoryCustom: {custom: {a: 25, b: 75}}
    } as ShareContext;
    expect(periodShares(c, 'first', 'equal').rows.map(r => r.ratio)).toEqual([0.5, 0.5]);
    expect(periodShares(c, 'first', 'personal').rows.map(r => r.ratio)).toEqual([0, 1]);
    expect(periodShares(c, 'first', 'custom').rows.map(r => r.ratio)).toEqual([0.25, 0.75]);
    expect(periodShares({...c, method: 'custom'}, 'first').rows.map(r => r.ratio)).toEqual([0.6, 0.4]);
  });
  it('uses a whole-household monthly fallback for incomplete halves, never mixes units', () => {
    const c = {...context, plans: [context.plans[0], {user_id: 'b', month, expected_amount: 3000}]};
    const result = periodShares(c, 'first');
    expect(result.fallback).toBe(true);
    expect(result.source).toBe('monthly');
    expect(result.rows.map(r => r.ratio)).toEqual([0.25, 0.75]);
  });
  it('honors saved zero incomes rather than replacing them with reference income', () => {
    const result = periodShares(
      {
        ...context,
        plans: [
          {user_id: 'a', month, expected_amount: 0},
          {user_id: 'b', month, expected_amount: 1000, first_half_amount: 1000, second_half_amount: 0}
        ]
      },
      'first'
    );
    expect(result.source).toBe('half');
    expect(result.rows.map(r => r.ratio)).toEqual([0, 1]);
  });
  it('uses equal shares when no positive income exists and reports the fallback', () => {
    const result = periodShares({...context, plans: [], references: {}}, 'second');
    expect(result.fallback).toBe(true);
    expect(result.source).toBe('equal');
    expect(result.rows.map(r => r.ratio)).toEqual([0.5, 0.5]);
  });
  it('preserves every cent and never charges a zero-weight person', () => {
    expect(
      splitCents(0.01, [
        {user_id: 'a', ratio: 0.5},
        {user_id: 'b', ratio: 0.5},
        {user_id: 'z', ratio: 0}
      ])
    ).toEqual([
      {user_id: 'a', amount: 0.01},
      {user_id: 'b', amount: 0},
      {user_id: 'z', amount: 0}
    ]);
    expect(
      splitCents(100, [
        {user_id: 'a', ratio: 0.8},
        {user_id: 'b', ratio: 0.2}
      ]).reduce((s, r) => s + r.amount, 0)
    ).toBe(100);
  });
  const allocations = [
      {category_id: 'food', month, planned_amount: 1000, first_half_amount: 600, second_half_amount: 400},
      {category_id: 'saving', month, planned_amount: 100, first_half_amount: 50, second_half_amount: 50}
    ],
    categories = [
      {id: 'food', budget_group: 'variable'},
      {id: 'saving', budget_group: 'saving'}
    ];
  const movements = [
      {
        id: 'i1',
        amount: 500,
        type: 'income',
        transaction_date: '2026-10-15',
        category_id: null,
        paid_by: 'a',
        is_shared: true
      },
      {
        id: 'e1',
        amount: 600,
        type: 'expense',
        transaction_date: '2026-10-15',
        category_id: 'food',
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
        id: 'e2',
        amount: 100,
        type: 'expense',
        transaction_date: '2026-10-16',
        category_id: 'food',
        paid_by: 'b',
        is_shared: false
      }
    ],
    savings = [{amount: 50, contribution_date: '2026-10-15'}],
    splits = [
      {transaction_id: 'e1', user_id: 'a', share_amount: 300},
      {transaction_id: 'e1', user_id: 'b', share_amount: 300}
    ];
  const summarize = (p: 'first' | 'second' | 'month', c = context) =>
    financePeriodSummary(
      month,
      p,
      members,
      c.plans,
      c.references,
      allocations,
      categories,
      movements,
      savings,
      splits,
      c
    );
  it('carries a negative real first-half balance into the second half exactly once', () => {
    expect(summarize('first').balance).toBe(-150);
    expect(summarize('second')).toMatchObject({carry: -150, balance: 750, planCarry: 350});
    expect(summarize('month')).toMatchObject({carry: 0, balance: 750, income: 1500, expense: 700, saving: 50});
    expect(summarize('first').planBalance + summarize('second').planBalance - summarize('second').planCarry).toBe(
      summarize('month').planBalance
    );
  });
  it('adds both earners and compares received income per person and period', () => {
    expect(summarize('first').expected).toBe(1000);
    expect(summarize('second').people[0]).toMatchObject({expected: 200, received: 0, pending: 200});
    expect(summarize('second').people[1]).toMatchObject({expected: 800, received: 1000, pending: 0});
  });
  it('sums period-specific planned shares into the monthly contribution', () => {
    expect(summarize('first').people.map(p => p.planned)).toEqual([480, 120]);
    expect(summarize('second').people.map(p => p.planned)).toEqual([80, 320]);
    expect(summarize('month').people.map(p => p.planned)).toEqual([560, 440]);
  });
  it('keeps actual stored splits unchanged when the income plan or actual income differs', () => {
    expect(summarize('first').people.map(p => p.assigned)).toEqual([300, 300]);
    const changed = {
      ...context,
      plans: context.plans.map(p => ({...p, first_half_amount: 500, second_half_amount: 500}))
    };
    expect(summarize('first', changed).people.map(p => p.assigned)).toEqual([300, 300]);
    expect(summarize('second').people.map(p => p.assigned)).toEqual([0, 0]);
    expect(summarize('first').unassignedSplits).toBe(0);
  });
  it('includes unallocated budget only once in monthly shares', () => {
    const a = [{category_id: 'food', month, planned_amount: 1000, first_half_amount: 500, second_half_amount: 100}];
    const result = financePeriodSummary(
      month,
      'month',
      members,
      context.plans,
      context.references,
      a,
      categories,
      [],
      [],
      [],
      context
    );
    expect(result.unallocatedBudget).toBe(400);
    expect(result.people.map(p => p.planned)).toEqual([620, 380]);
    expect(result.budget).toBe(1000);
  });
});
