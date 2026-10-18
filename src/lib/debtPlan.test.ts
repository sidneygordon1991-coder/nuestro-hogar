import {describe, expect, it} from 'vitest';
import {
  addMonths,
  compareDebtPlans,
  estimatedMinimum,
  MAX_MONTHS,
  orderDebts,
  prepareDebts,
  simulateDebtPlan
} from './debtPlan';

describe('debt plan inputs', () => {
  it('estimates a missing minimum as 3% of the balance with a Q 50 floor, never above the balance', () => {
    expect(estimatedMinimum(1000)).toBe(50);
    expect(estimatedMinimum(5000)).toBe(150);
    expect(estimatedMinimum(12345.67)).toBe(370.37);
    expect(estimatedMinimum(30)).toBe(30);
    expect(estimatedMinimum(0)).toBe(0);
    expect(estimatedMinimum(20000, 42)).toBe(900); // Q 700 interest + Q 200 principal
    expect(estimatedMinimum(20000, 12)).toBe(600); // 3% already exceeds interest + 1%
  });
  it('keeps only debts with a positive balance and flags estimates and missing rates', () => {
    const debts = prepareDebts([
      {id: 'a', name: 'Visa', balance: '2000', apr: '36', minimum_payment: null},
      {id: 'b', name: 'Préstamo', balance: 5000, apr: null, minimum_payment: 400},
      {id: 'c', name: 'Pagada', balance: 0, apr: 20, minimum_payment: 100},
      {id: 'd', name: 'A favor', balance: -150, apr: 20, minimum_payment: 100},
      {id: 'e', name: 'Cero mínimo', balance: 3000, apr: 12, minimum_payment: 0}
    ]);
    expect(debts.map(d => d.id)).toEqual(['a', 'b', 'e']);
    // At 36% a year, 3% of the balance only pays the interest: the estimate adds 1% of principal so the debt goes down.
    expect(debts[0]).toMatchObject({
      balance: 2000,
      apr: 36,
      aprMissing: false,
      minimum: 80,
      minimumEstimated: true,
      monthlyInterest: 60,
      minimumCoversInterest: true
    });
    expect(debts[1]).toMatchObject({
      apr: 0,
      aprMissing: true,
      minimum: 400,
      minimumEstimated: false,
      monthlyInterest: 0,
      minimumCoversInterest: true
    });
    expect(debts[2]).toMatchObject({
      minimum: 90,
      minimumEstimated: true,
      monthlyInterest: 30,
      minimumCoversInterest: true
    });
  });
  it('flags a minimum that does not cover the monthly interest (or only matches it)', () => {
    const [stalled, even, fine] = prepareDebts([
      {id: 'x', name: 'X', balance: 10000, apr: 36, minimum_payment: 200},
      {id: 'y', name: 'Y', balance: 10000, apr: 12, minimum_payment: 100},
      {id: 'z', name: 'Z', balance: 10000, apr: 12, minimum_payment: 100.01}
    ]);
    expect(stalled.minimumCoversInterest).toBe(false);
    expect(stalled.monthlyInterest).toBe(300);
    expect(even.minimumCoversInterest).toBe(false);
    expect(fine.minimumCoversInterest).toBe(true);
  });
  it('orders by highest rate (avalanche) or smallest balance (snowball) with stable tie-breaks', () => {
    const debts = [
      {name: 'B', balance: 500, apr: 10},
      {name: 'A', balance: 3000, apr: 30},
      {name: 'C', balance: 500, apr: 25},
      {name: 'D', balance: 3000, apr: 30}
    ];
    expect(orderDebts(debts, 'avalanche').map(d => d.name)).toEqual(['A', 'D', 'C', 'B']);
    expect(orderDebts(debts, 'snowball').map(d => d.name)).toEqual(['C', 'B', 'A', 'D']);
    expect(debts.map(d => d.name)).toEqual(['B', 'A', 'C', 'D']);
  });
  it('adds months across year boundaries', () => {
    expect(addMonths('2026-11', 0)).toBe('2026-11');
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', 600)).toBe('2076-10');
  });
});

describe('monthly simulation', () => {
  it('accrues apr/12 in cents before paying and reports months, date and total interest', () => {
    const debts = prepareDebts([{id: 'a', name: 'Tarjeta', balance: 1000, apr: 12, minimum_payment: 100}]);
    const plan = simulateDebtPlan(debts, 0, 'avalanche', '2026-11');
    expect(plan.months).toBe(11);
    expect(plan.totalInterest).toBe(58.98);
    expect(plan.totalPaid).toBe(1058.98);
    expect(plan.debtFreeDate).toBe('2027-09');
    expect(plan.payoffs).toEqual([{id: 'a', name: 'Tarjeta', month: 11, date: '2027-09'}]);
    expect(plan).toMatchObject({capped: false, remaining: 0, monthlyBudget: 100});
  });
  it('rolls a paid-off minimum and the extra into the next debt', () => {
    const debts = prepareDebts([
      {id: 'a', name: 'A', balance: 300, apr: 0, minimum_payment: 50},
      {id: 'b', name: 'B', balance: 1000, apr: 0, minimum_payment: 100}
    ]);
    const plan = simulateDebtPlan(debts, 50, 'snowball', '2026-11');
    expect(plan.monthlyBudget).toBe(200);
    expect(plan.payoffs.map(p => [p.id, p.month])).toEqual([
      ['a', 3],
      ['b', 7]
    ]);
    expect(plan.months).toBe(7);
    expect(plan.totalInterest).toBe(0);
    expect(plan.totalPaid).toBe(1300);
    // Without the rollover B alone would need 10 months at Q 100.
    const noExtra = simulateDebtPlan(debts, 0, 'snowball', '2026-11');
    expect(noExtra.payoffs.map(p => [p.id, p.month])).toEqual([
      ['a', 6],
      ['b', 9]
    ]);
  });
  it('sends what a small minimum does not use to the next debt in the same month', () => {
    const debts = prepareDebts([
      {id: 's', name: 'Pequeña', balance: 30, apr: 0, minimum_payment: 100},
      {id: 'l', name: 'Grande', balance: 500, apr: 0, minimum_payment: 100}
    ]);
    const plan = simulateDebtPlan(debts, 0, 'snowball', '2026-11');
    // Month 1: 30 to the small one, 100 + 70 to the large one.
    expect(plan.payoffs.map(p => [p.id, p.month])).toEqual([
      ['s', 1],
      ['l', 3]
    ]);
    expect(plan.totalPaid).toBe(530);
  });
  it('avalanche never pays more interest than snowball and targets the highest rate first', () => {
    const accounts = [
      {id: 'hi', name: 'Tarjeta cara', balance: 4000, apr: 48, minimum_payment: 150},
      {id: 'lo', name: 'Préstamo barato', balance: 900, apr: 9, minimum_payment: 60},
      {id: 'mid', name: 'Otra tarjeta', balance: 2500, apr: 24, minimum_payment: 100}
    ];
    const result = compareDebtPlans(accounts, 500, '2026-11');
    expect(result.avalanche.priority.map(d => d.id)).toEqual(['hi', 'mid', 'lo']);
    expect(result.snowball.priority.map(d => d.id)).toEqual(['lo', 'mid', 'hi']);
    expect(result.snowball.payoffs[0].id).toBe('lo');
    expect(result.avalanche.payoffs[0].id).toBe('hi');
    expect(result.avalanche.totalInterest).toBeLessThan(result.snowball.totalInterest);
    expect(result.interestSaved).toBeCloseTo(result.snowball.totalInterest - result.avalanche.totalInterest, 2);
    expect(result.interestSaved).toBeGreaterThan(0);
    for (const plan of [result.avalanche, result.snowball]) {
      expect(plan.capped).toBe(false);
      expect(plan.totalPaid).toBeCloseTo(7400 + plan.totalInterest, 2);
      expect(plan.payoffs).toHaveLength(3);
      expect(plan.debtFreeDate).toBe(addMonths('2026-11', plan.months! - 1));
    }
  });
  it('a larger extra payment finishes sooner and with less interest', () => {
    const accounts = [{id: 'a', name: 'A', balance: 8000, apr: 30, minimum_payment: 300}];
    const slow = compareDebtPlans(accounts, 0, '2026-11').avalanche,
      fast = compareDebtPlans(accounts, 700, '2026-11').avalanche;
    expect(fast.months!).toBeLessThan(slow.months!);
    expect(fast.totalInterest).toBeLessThan(slow.totalInterest);
  });
  it('stops at 600 months when the payment never covers the interest', () => {
    const result = compareDebtPlans(
      [{id: 'x', name: 'Tarjeta', balance: 10000, apr: 36, minimum_payment: 200}],
      0,
      '2026-11'
    );
    expect(result.stalled.map(d => d.id)).toEqual(['x']);
    for (const plan of [result.avalanche, result.snowball]) {
      expect(plan).toMatchObject({capped: true, months: null, debtFreeDate: null, payoffs: []});
      expect(plan.remaining).toBeGreaterThan(10000);
      expect(plan.totalPaid).toBe(200 * MAX_MONTHS);
    }
    // An extra payment that beats the interest gets it paid.
    const fixed = compareDebtPlans(
      [{id: 'x', name: 'Tarjeta', balance: 10000, apr: 36, minimum_payment: 200}],
      500,
      '2026-11'
    );
    expect(fixed.avalanche.capped).toBe(false);
    expect(fixed.avalanche.months).toBeGreaterThan(0);
    expect(fixed.stalled).toHaveLength(1);
  });
  it('honours a custom cap and treats a negative extra as zero', () => {
    const debts = prepareDebts([{id: 'a', name: 'A', balance: 1000, apr: 0, minimum_payment: 100}]);
    expect(simulateDebtPlan(debts, 0, 'avalanche', '2026-11', 5)).toMatchObject({
      capped: true,
      months: null,
      remaining: 500
    });
    expect(simulateDebtPlan(debts, -300, 'avalanche', '2026-11').months).toBe(10);
  });
  it('returns an empty, finished plan when nothing is owed', () => {
    const result = compareDebtPlans([{id: 'a', name: 'A', balance: 0}], 100, '2026-11');
    expect(result.debts).toEqual([]);
    expect(result.avalanche).toMatchObject({months: 0, totalInterest: 0, totalPaid: 0, payoffs: [], capped: false});
    expect(result.estimatedMinimums).toBe(false);
  });
  it('reports when any minimum was estimated', () => {
    expect(compareDebtPlans([{id: 'a', name: 'A', balance: 1000, apr: 20}], 0, '2026-11').estimatedMinimums).toBe(true);
    expect(
      compareDebtPlans([{id: 'a', name: 'A', balance: 1000, apr: 20, minimum_payment: 80}], 0, '2026-11')
        .estimatedMinimums
    ).toBe(false);
  });
});
