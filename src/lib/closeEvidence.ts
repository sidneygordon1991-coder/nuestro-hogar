import {toCents} from './financePeriods';
export type CloseFinancial = {income: number; expense: number; saving: number; balance: number};
export function closeDifferences(saved: CloseFinancial, current: CloseFinancial) {
  return (['income', 'expense', 'saving', 'balance'] as const).flatMap(field => {
    const delta = toCents(current[field]) - toCents(saved[field]);
    return delta ? [{field, saved: saved[field], current: current[field], delta: delta / 100}] : [];
  });
}
/** Ignores generation timestamps; a fresh calculation is expected to have a new timestamp. */
export function closeReviewKey(snapshot: {
  financial: CloseFinancial & Record<string, unknown>;
  operations: Record<string, number>;
  period_end: string;
}) {
  return JSON.stringify({
    end: snapshot.period_end,
    financial: Object.entries(snapshot.financial).sort(([a], [b]) => a.localeCompare(b)),
    operations: Object.entries(snapshot.operations).sort(([a], [b]) => a.localeCompare(b))
  });
}
