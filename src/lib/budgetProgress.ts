import {inPeriod, toCents, type FinancePeriod} from './financePeriods';

/** All comparisons use cents; a zero allocation has no meaningful percentage. */
export function budgetProgress(planned: number, spent: number) {
  if (!Number.isFinite(planned) || !Number.isFinite(spent) || planned < 0 || spent < 0) return null;
  const budget = toCents(planned),
    used = toCents(spent),
    remaining = Math.max(0, budget - used),
    excess = Math.max(0, used - budget);
  return {
    planned: budget / 100,
    spent: used / 100,
    remaining: remaining / 100,
    excess: excess / 100,
    usedPercent: budget > 0 ? (used / budget) * 100 : null,
    availablePercent: budget > 0 ? (remaining / budget) * 100 : null,
    fill: budget > 0 ? Math.min(100, (used / budget) * 100) : 0,
    state:
      budget === 0
        ? 'unplanned'
        : excess > 0
          ? 'exceeded'
          : remaining === 0
            ? 'reached'
            : used / budget >= 0.8
              ? 'near'
              : 'available'
  } as const;
}

export function categorySpending(
  rows: {type: string; category_id: string | null; transaction_date: string; amount: number | string}[],
  categoryId: string,
  month: string,
  period: FinancePeriod,
  cutoff: string
) {
  return (
    rows
      .filter(
        t =>
          t.type === 'expense' &&
          t.category_id === categoryId &&
          t.transaction_date <= cutoff &&
          inPeriod(t.transaction_date, month, period)
      )
      .reduce((sum, t) => sum + toCents(t.amount), 0) / 100
  );
}

const percentNumber = new Intl.NumberFormat('es-GT', {maximumFractionDigits: 2});
export function budgetPercent(value: number) {
  if (value > 0 && value < 0.01) return '<0.01%';
  if (value > 99.99 && value < 100) return '>99.99%';
  return percentNumber.format(value) + '%';
}
