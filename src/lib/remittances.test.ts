import {describe, expect, it} from 'vitest';
import {isRemittance, remittanceInsight, remittanceSummary} from './remittances';

const cats = [
  {id: 'r', name: 'Remesas'},
  {id: 's', name: 'Salario'}
];
const tx = (date: string, amount: number, extra: Record<string, unknown> = {}) => ({
  type: 'income',
  transaction_date: date,
  amount,
  ...extra
});

describe('remittances', () => {
  it('detects them by category or by sender service', () => {
    const ids = new Set(['r']);
    expect(isRemittance(tx('2026-10-01', 1, {category_id: 'r'}), ids)).toBe(true);
    expect(isRemittance(tx('2026-10-01', 1, {description: 'Western Union de mi hermano'}), ids)).toBe(true);
    expect(isRemittance(tx('2026-10-01', 1, {description: 'Remitly'}), ids)).toBe(true);
    expect(isRemittance(tx('2026-10-01', 1, {description: 'Salario octubre'}), ids)).toBe(false);
    expect(isRemittance({...tx('2026-10-01', 1, {category_id: 'r'}), type: 'expense'}, ids)).toBe(false);
  });
  it('summarizes the month, its share of income and the recent average', () => {
    const rows = [
      tx('2026-07-10', 3000, {category_id: 'r'}),
      tx('2026-08-10', 3100, {category_id: 'r'}),
      tx('2026-09-10', 2900, {category_id: 'r'}),
      tx('2026-10-05', 1550, {category_id: 'r', original_currency: 'USD', original_amount: 200}),
      tx('2026-10-15', 4650, {category_id: 's'}),
      {type: 'expense', transaction_date: '2026-10-02', amount: 500, description: 'remesa enviada'}
    ];
    const s = remittanceSummary(rows, cats, '2026-10');
    expect(s).toMatchObject({month: 1550, monthUsd: 200, count: 1, share: 25, average: 3000, activeMonths: 4});
    expect(s.trend).toHaveLength(6);
    expect(remittanceInsight(s, n => 'Q' + n)).toContain('menos que de costumbre');
    expect(remittanceInsight(remittanceSummary([], cats, '2026-10'), String)).toBeNull();
    const old = remittanceSummary([tx('2026-05-10', 3000, {category_id: 'r'})], cats, '2026-10');
    expect(remittanceInsight(old, String)).not.toContain('promedio');
    expect(remittanceInsight(old, String, false)).toBe('Ese mes no se registraron remesas.');
  });
  it('warns when the month depends heavily on remittances', () => {
    const s = remittanceSummary([tx('2026-10-05', 3000, {category_id: 'r'}), tx('2026-10-15', 2000)], cats, '2026-10');
    expect(remittanceInsight(s, String)).toContain('60%');
  });
});
