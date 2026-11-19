import {toCents} from './financePeriods';

export type SpendSummary = {
  /** Budget planned for the period across the categories that count in the budget. */
  planned: number;
  /** Expenses registered inside the budget, unplanned categories included. */
  spent: number;
  /** planned − spent. Negative when the month is over budget. */
  remaining: number;
  /** Days left in the period, today included. */
  daysLeft: number;
  /** Remaining divided by the days left, rounded down to cents. Zero when nothing remains. */
  perDay: number;
  /** Last day of the period (ISO date). */
  until: string;
  /** Share of the plan already used, 0–100 (capped). */
  usedPercent: number;
  /** Budget still held for fixed payments and bills of the period, already left out of `remaining`. */
  reserved: number;
};

/**
 * Headline for Inicio: how much of the period's budget is left and what that means per day.
 * Pure arithmetic on the rows `overviewPeriod(source, period).budgets` already produces, summed in cents.
 * `until` is the last day of the period (end of the fortnight or the month). Returns null when the period has
 * no positive plan, so the screen can invite the person to create one.
 */
export function spendSummary(
  budgets: readonly {planned: number; spent: number}[],
  today: string,
  until: string,
  /**
   * Money of the plan still free after the period's pending fixed payments (buildCashFlow's variableRemaining).
   * When given, the headline never offers money that a bill or a fixed category is waiting for.
   */
  free?: number
): SpendSummary | null {
  const plannedCents = budgets.reduce((n, b) => n + Math.max(0, toCents(b.planned)), 0);
  if (plannedCents <= 0) return null;
  const spentCents = budgets.reduce((n, b) => n + Math.max(0, toCents(b.spent)), 0);
  const leftCents = plannedCents - spentCents;
  // Over budget stays visible as a negative; otherwise the free part of what is left leads.
  const freeCents = free === undefined ? leftCents : Math.max(0, Math.min(leftCents, toCents(free)));
  const remainingCents = leftCents < 0 ? leftCents : freeCents;
  const day = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  // Today included; a period already over still divides by one day, a future one by its full length.
  const daysLeft = Math.max(1, Math.round((day(until) - day(today)) / 86400000) + 1);
  return {
    planned: plannedCents / 100,
    spent: spentCents / 100,
    remaining: remainingCents / 100,
    daysLeft,
    perDay: remainingCents > 0 ? Math.floor(remainingCents / daysLeft) / 100 : 0,
    until,
    usedPercent: Math.min(100, Math.round((spentCents * 100) / plannedCents)),
    reserved: leftCents > 0 ? (leftCents - freeCents) / 100 : 0
  };
}
