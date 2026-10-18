/**
 * Visacuotas and extrafinanciamiento on Guatemalan credit cards.
 * - Visacuotas: a purchase split into equal interest-free monthly installments. The whole amount uses the card's
 *   limit (and shows in its balance) but each statement only bills one installment.
 * - Extrafinanciamiento: cash lent against the card, repaid in fixed monthly installments that include interest
 *   (French amortization on the monthly rate).
 * In both, the part not yet billed is part of the card's balance but is NOT due on the current statement.
 */
export type InstallmentKind = 'visacuotas' | 'extra';
export type InstallmentPlan = {
  id: string;
  account_id: string;
  kind: InstallmentKind;
  description: string;
  principal: number | string;
  months: number;
  /** Yearly interest rate in percent (0 for visacuotas). */
  annual_rate?: number | string | null;
  /** First statement (YYYY-MM-DD, any day of that month) that bills installment #1. */
  first_statement: string;
  active?: boolean | null;
};
export type InstallmentRow = {
  n: number;
  month: string;
  payment: number;
  interest: number;
  principal: number;
  remaining: number;
};

const toCents = (n: unknown) => Math.round((Number(n) || 0) * 100);
const monthKey = (date: string) => date.slice(0, 7);
function addMonths(month: string, k: number) {
  let y = Number(month.slice(0, 4)),
    m = Number(month.slice(5, 7)) + k;
  y += Math.floor((m - 1) / 12);
  m = ((((m - 1) % 12) + 12) % 12) + 1;
  return y + '-' + String(m).padStart(2, '0');
}

/** Fixed monthly payment in cents. Zero rate: principal / months, with the cents remainder in the first payment. */
export function installmentPayment(principal: number | string, months: number, annualRate: number | string | null = 0) {
  const p = toCents(principal),
    n = Math.max(1, Math.floor(months)),
    r = Math.max(0, Number(annualRate) || 0) / 100 / 12;
  if (r === 0) return Math.ceil(p / n) / 100;
  return Math.round((p * r) / (1 - Math.pow(1 + r, -n))) / 100;
}

/** Full schedule; the last payment absorbs rounding so the balance ends at exactly zero. */
export function installmentSchedule(plan: InstallmentPlan): InstallmentRow[] {
  const n = Math.max(1, Math.floor(plan.months)),
    r = Math.max(0, Number(plan.annual_rate) || 0) / 100 / 12,
    pay = toCents(installmentPayment(plan.principal, n, plan.annual_rate));
  let left = toCents(plan.principal);
  const start = monthKey(plan.first_statement);
  const rows: InstallmentRow[] = [];
  for (let i = 1; i <= n; i++) {
    const interest = Math.round(left * r);
    let principal = Math.min(left, pay - interest);
    if (i === n) principal = left;
    left -= principal;
    rows.push({
      n: i,
      month: addMonths(start, i - 1),
      payment: (principal + interest) / 100,
      interest: interest / 100,
      principal: principal / 100,
      remaining: left / 100
    });
  }
  return rows;
}

export type InstallmentProgress = {
  billed: number;
  months: number;
  payment: number;
  /** Principal still to be billed after the given statement month. */
  unbilled: number;
  /** Interest still to come (extrafinanciamiento). */
  futureInterest: number;
  next: InstallmentRow | null;
  done: boolean;
};

/** Where a plan stands for the statement of `asOf`'s month: installments billed so far and what is still pending. */
export function installmentProgress(plan: InstallmentPlan, asOf: string): InstallmentProgress {
  const rows = installmentSchedule(plan),
    month = monthKey(asOf);
  const billedRows = rows.filter(r => r.month <= month);
  const pending = rows.filter(r => r.month > month);
  return {
    billed: billedRows.length,
    months: rows.length,
    payment: rows[0]?.payment ?? 0,
    unbilled: billedRows.length ? billedRows[billedRows.length - 1].remaining : toCents(plan.principal) / 100,
    futureInterest: pending.reduce((s, r) => s + toCents(r.interest), 0) / 100,
    next: pending[0] ?? null,
    done: pending.length === 0
  };
}

/**
 * Principal that a card's balance carries but is not billed yet. `first_statement` is the first cut after the
 * purchase, so on a statement cut, plans that start later were bought after it and are not in that balance.
 * Without a statement (cards with no cut day) every pending installment is in the current balance.
 */
export function unbilledForCard(
  plans: InstallmentPlan[],
  accountId: string,
  asOf: string,
  {statement = true}: {statement?: boolean} = {}
) {
  return (
    plans
      .filter(
        p =>
          p.account_id === accountId &&
          p.active !== false &&
          (!statement || p.first_statement.slice(0, 7) <= asOf.slice(0, 7))
      )
      .reduce((s, p) => s + toCents(installmentProgress(p, asOf).unbilled), 0) / 100
  );
}

/** Installments billed on a card in `month` (YYYY-MM), principal plus interest. */
export function billedThisMonth(plans: InstallmentPlan[], accountId: string, month: string) {
  return (
    plans
      .filter(p => p.account_id === accountId && p.active !== false)
      .flatMap(p => installmentSchedule(p).filter(r => r.month === month.slice(0, 7)))
      .reduce((s, r) => s + toCents(r.payment), 0) / 100
  );
}
