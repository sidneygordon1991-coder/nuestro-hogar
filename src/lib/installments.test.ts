import {describe, expect, it} from 'vitest';
import {
  billedThisMonth,
  installmentPayment,
  installmentProgress,
  installmentSchedule,
  unbilledForCard,
  type InstallmentPlan
} from './installments';

const visacuotas: InstallmentPlan = {
  id: 'v',
  account_id: 'card',
  kind: 'visacuotas',
  description: 'Refrigeradora',
  principal: 6000.1,
  months: 12,
  annual_rate: 0,
  first_statement: '2026-09-05'
};
const extra: InstallmentPlan = {
  id: 'e',
  account_id: 'card',
  kind: 'extra',
  description: 'Extrafinanciamiento',
  principal: 10000,
  months: 12,
  annual_rate: 24,
  first_statement: '2026-10-05'
};

describe('visacuotas and extrafinanciamiento', () => {
  it('splits visacuotas evenly and ends at zero', () => {
    expect(installmentPayment(6000.1, 12)).toBe(500.01);
    const rows = installmentSchedule(visacuotas);
    expect(rows).toHaveLength(12);
    expect(rows[0].month).toBe('2026-09');
    expect(rows[11].month).toBe('2027-08');
    expect(rows[11].remaining).toBe(0);
    expect(rows.reduce((s, r) => s + Math.round(r.principal * 100), 0)).toBe(600010);
  });
  it('amortizes extrafinanciamiento with interest (2% monthly)', () => {
    expect(installmentPayment(10000, 12, 24)).toBe(945.6);
    const rows = installmentSchedule(extra);
    expect(rows[0]).toMatchObject({interest: 200, principal: 745.6, remaining: 9254.4});
    expect(rows[11].remaining).toBe(0);
  });
  it('tracks progress and what is still unbilled', () => {
    const p = installmentProgress(visacuotas, '2026-10-20');
    expect(p).toMatchObject({billed: 2, months: 12, done: false});
    expect(p.unbilled).toBe(5000.08);
    expect(p.next?.month).toBe('2026-11');
    expect(installmentProgress(visacuotas, '2027-09-01').done).toBe(true);
  });
  it('subtracts only plans already in the statement balance', () => {
    // Statement of September: the extra (first billed in October) was taken after that cut.
    expect(unbilledForCard([visacuotas, extra], 'card', '2026-09-05')).toBe(5500.09);
    // Without a cut day, everything pending is in the balance.
    expect(unbilledForCard([visacuotas, extra], 'card', '2026-09-20', {statement: false})).toBe(15500.09);
    expect(unbilledForCard([visacuotas], 'other', '2026-09-05')).toBe(0);
    expect(billedThisMonth([visacuotas, extra], 'card', '2026-10')).toBe(1445.61);
  });
});
