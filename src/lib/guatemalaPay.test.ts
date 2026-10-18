import {describe, expect, it} from 'vitest';
import {
  daysUntil,
  extraPay,
  isrForYear,
  netPay,
  nextDue,
  normalizeExtraPlan,
  suggestedExtraPlan,
  upcomingExtraPays
} from './guatemalaPay';

describe('Guatemalan net pay (asalariados)', () => {
  it('matches the published 2026 example: Q10,000 + Q250 bonus', () => {
    const r = netPay({salary: 10000, year: 2026});
    expect(r.gross).toBe(10250);
    expect(r.igss).toBe(483);
    expect(r.yearlyTaxable).toBe(66180);
    expect(r.yearlyIsr).toBe(3309);
    expect(r.isr).toBe(275.75);
    expect(r.net).toBe(9491.25);
  });
  it('pays no ISR on a minimum-wage salary and requires the confirmed 2027 allowance', () => {
    expect(netPay({salary: 3973, year: 2026}).isr).toBe(0);
    expect(() => netPay({salary: 10000, year: 2027})).toThrow('deducción anual vigente');
    expect(netPay({salary: 10000, year: 2025}).yearlyTaxable).toBe(69204);
    expect(netPay({salary: 10000, year: 2027, annualAllowance: 60000}).yearlyTaxable).toBe(57204);
  });
  it('applies 7% above Q300,000 and personal deductions', () => {
    expect(isrForYear(300000)).toBe(15000);
    expect(isrForYear(400000)).toBe(22000);
    expect(isrForYear(-5)).toBe(0);
    const base = netPay({salary: 10000, year: 2026}),
      withIva = netPay({salary: 10000, year: 2026, personalDeductions: 12000});
    expect(base.yearlyIsr - withIva.yearlyIsr).toBe(600);
  });
  it('honors no IGSS and no incentive bonus', () => {
    const r = netPay({salary: 8000, incentive: 0, igss: false, year: 2026});
    expect(r.igss).toBe(0);
    expect(r.gross).toBe(8000);
  });
});

describe('Bono 14 and aguinaldo', () => {
  it('pays a full salary for a full period, with legal dates', () => {
    const b = extraPay('bono14', {salary: 6000, startDate: '2020-01-10', payYear: 2026});
    expect(b).toMatchObject({periodStart: '2025-07-01', periodEnd: '2026-06-30', payDate: '2026-07-15', amount: 6000});
    const a = extraPay('aguinaldo', {salary: 6000, payYear: 2026});
    expect(a).toMatchObject({
      periodStart: '2025-12-01',
      periodEnd: '2026-11-30',
      payDate: '2026-12-15',
      secondPayDate: '2027-01-31',
      amount: 6000,
      taxableExcess: 0
    });
  });
  it('is proportional to the days worked when starting mid-period', () => {
    // 2026-04-01 to 2026-06-30 = 91 days of 365
    const b = extraPay('bono14', {salary: 7300, startDate: '2026-04-01', payYear: 2026});
    expect(b.daysWorked).toBe(91);
    expect(b.amount).toBe(1820);
    expect(extraPay('bono14', {salary: 7300, startDate: '2026-08-01', payYear: 2026}).amount).toBe(0);
  });
  it('lists the next payments from today, soonest first', () => {
    const next = upcomingExtraPays(5000, null, '2026-10-18');
    expect(next.map(p => [p.kind, p.payDate])).toEqual([
      ['aguinaldo', '2026-12-15'],
      ['bono14', '2027-07-15']
    ]);
    expect(daysUntil('2026-10-18', '2026-12-15')).toBe(58);
    // From Dec 16 to Jan 31 the January half of the aguinaldo is still ahead.
    const january = upcomingExtraPays(5000, null, '2027-01-10');
    expect(january[0]).toMatchObject({kind: 'aguinaldo', payDate: '2026-12-15', secondPayDate: '2027-01-31'});
    expect(nextDue(january[0], '2027-01-10')).toBe('2027-01-31');
    expect(upcomingExtraPays(5000, null, '2027-02-01').map(p => p.kind)).toEqual(['bono14', 'aguinaldo']);
  });
  it('suggests a plan that never exceeds the amount and keeps a part to enjoy', () => {
    const plan = suggestedExtraPlan('aguinaldo', 5000, true);
    expect(plan).toEqual({debt: 2500, saving: 1000, planned: 1000});
    const n = normalizeExtraPlan({debt: 4000, saving: 4000, planned: 50}, 5000);
    expect(n).toEqual({debt: 4000, saving: 1000, planned: 0, free: 0});
    expect(normalizeExtraPlan(null, 100.5).free).toBe(100.5);
  });
});
