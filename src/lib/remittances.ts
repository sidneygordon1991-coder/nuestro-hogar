/**
 * Remittances (remesas): money sent by family abroad, usually in dollars. They are income, but irregular and
 * outside the household's control, so the app shows how much of the month depends on them.
 */
export type RemittanceTx = {
  amount: number | string;
  type: string;
  transaction_date: string;
  description?: string | null;
  category_id?: string | null;
  original_currency?: string | null;
  original_amount?: number | string | null;
};
export type RemittanceCategory = {id: string; name: string};

export const REMITTANCE_PATTERN =
  /\bremesas?\b|western\s*union|remitly|moneygram|\bxoom\b|viamericas|\bria\b|intermex|\bwise\b|env[ií]o de (dinero|d[oó]lares)/i;

export function remittanceCategoryIds(categories: RemittanceCategory[]) {
  return new Set(categories.filter(c => /\bremesas?\b/i.test(c.name)).map(c => c.id));
}
export function isRemittance(tx: RemittanceTx, categoryIds: Set<string>) {
  if (tx.type !== 'income') return false;
  return (tx.category_id != null && categoryIds.has(tx.category_id)) || REMITTANCE_PATTERN.test(tx.description || '');
}

const toCents = (n: unknown) => Math.round((Number(n) || 0) * 100);
const addMonths = (month: string, k: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + k, 1));
  return d.toISOString().slice(0, 7);
};

export type RemittanceSummary = {
  month: number;
  monthUsd: number;
  count: number;
  /** Share of the month's income that came from remittances, 0-100 (null without income). */
  share: number | null;
  /** Average of the previous three months that had any income (0 when there is no history). */
  average: number;
  /** Months with a remittance among the last six, including this one. */
  activeMonths: number;
  trend: {month: string; amount: number}[];
};

/**
 * Remittances for `month` (YYYY-MM) and the five months before it. `transactions` may span any range; only
 * income rows count.
 */
export function remittanceSummary(
  transactions: RemittanceTx[],
  categories: RemittanceCategory[],
  month: string
): RemittanceSummary {
  const ids = remittanceCategoryIds(categories);
  const months = Array.from({length: 6}, (_, i) => addMonths(month, i - 5));
  const sums = new Map(months.map(m => [m, 0]));
  let monthUsd = 0,
    count = 0,
    income = 0;
  for (const tx of transactions) {
    const m = tx.transaction_date.slice(0, 7);
    if (!sums.has(m) || tx.type !== 'income') continue;
    if (m === month) income += toCents(tx.amount);
    if (!isRemittance(tx, ids)) continue;
    sums.set(m, (sums.get(m) || 0) + toCents(tx.amount));
    if (m === month) {
      count++;
      if (tx.original_currency === 'USD') monthUsd += toCents(tx.original_amount);
    }
  }
  const current = sums.get(month) || 0;
  const previous = months.slice(2, 5).map(m => sums.get(m) || 0);
  const withHistory = previous.filter(v => v > 0);
  return {
    month: current / 100,
    monthUsd: monthUsd / 100,
    count,
    share: income > 0 ? Math.round((current / income) * 100) : null,
    average: withHistory.length ? Math.round(withHistory.reduce((a, b) => a + b, 0) / withHistory.length) / 100 : 0,
    activeMonths: months.filter(m => (sums.get(m) || 0) > 0).length,
    trend: months.map(m => ({month: m, amount: (sums.get(m) || 0) / 100}))
  };
}

/** One sentence for the household, or null when there is nothing to say. */
export function remittanceInsight(s: RemittanceSummary, format: (n: number) => string, current = true) {
  if (s.month === 0 && s.activeMonths === 0) return null;
  if (s.month === 0) {
    if (!current) return 'Ese mes no se registraron remesas.';
    return s.average > 0
      ? `Este mes aún no llega la remesa. En promedio reciben ${format(s.average)}; planifiquen sin contar con ella hasta que llegue.`
      : 'Este mes aún no llega la remesa; planifiquen sin contar con ella hasta que llegue.';
  }
  if (s.share !== null && s.share >= 40)
    return `Las remesas son el ${s.share}% de sus ingresos del mes. Conviene que los gastos fijos no dependan de ellas: si un mes no llega, el hogar sigue en pie.`;
  if (s.average > 0 && s.month < s.average * 0.8)
    return `Llegó menos que de costumbre (${format(s.month)} frente a ${format(s.average)} en promedio).`;
  return `Llegaron ${format(s.month)} en remesas este mes${s.share !== null ? `, el ${s.share}% de sus ingresos` : ''}.`;
}
