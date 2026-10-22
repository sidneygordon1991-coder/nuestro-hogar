import {countsInBudget} from './budgetTreatment';
import {toCents, periodAmount, type FinancePeriod} from './financePeriods';
import {cycleBounds, currentCycleMonth, type PayCycle} from './payCycles';
import type {CashFlowSource} from './cashFlow';
import type {overviewAccounts} from './homeOverview';

export function accountAvailability(rows: ReturnType<typeof overviewAccounts>) {
  const liquid = rows.filter(a => a.liquid);
  const sum = (type: 'cash' | 'bank') =>
    liquid
      .filter(a => (type === 'cash' ? a.account_type === 'cash' : a.account_type !== 'cash'))
      .reduce((s, a) => s + toCents(a.balance), 0);
  const bank = sum('bank'),
    cash = sum('cash');
  return {total: (bank + cash) / 100, bank: bank / 100, cash: cash / 100, count: liquid.length};
}

export function availabilityWindow(month: string, today: string, period: FinancePeriod, cycle?: PayCycle) {
  // Mes always means the calendar month. Personal fortnight cycles may cross its boundary.
  let anchor = month;
  if (period !== 'month' && cycle && today.slice(0, 7) === month.slice(0, 7)) anchor = currentCycleMonth(today, cycle);
  const bounds = cycleBounds(anchor, period, period === 'month' ? undefined : cycle);
  return {...bounds, planMonth: period === 'month' ? month : anchor};
}

/** A period's remaining income budget is NOT the balance of a bank account. All amounts use integer cents. */
export function homeBudgetAvailability(
  source: CashFlowSource,
  period: FinancePeriod,
  window: {start: string; end: string; planMonth: string}
) {
  const rows = source.transactions.filter(
    t => t.transaction_date >= window.start && t.transaction_date <= window.end && t.transaction_date <= source.today
  );
  const savingCategories = new Set(source.categories.filter(c => c.budget_group === 'saving').map(c => c.id));
  const expenses = rows.filter(t => t.type === 'expense' && !savingCategories.has(t.category_id || ''));
  const sum = (entries: typeof rows) => entries.reduce((s, t) => s + toCents(t.amount), 0);
  const received = sum(rows.filter(t => t.type === 'income'));
  const spent = sum(expenses.filter(countsInBudget));
  const actualExpenses = sum(expenses),
    outside = actualExpenses - spent;
  const plans = new Map(source.plans.filter(p => p.month === window.planMonth).map(p => [p.user_id, p]));
  const missing = source.members.filter(m => {
    const p = plans.get(m.user_id);
    return (
      !p ||
      (period !== 'month' &&
        toCents(p.expected_amount) !== 0 &&
        (period === 'first' ? p.first_half_amount : p.second_half_amount) == null)
    );
  });
  const complete = source.members.length > 0 && !missing.length;
  const expected = complete
    ? source.members.reduce((s, m) => {
        const p = plans.get(m.user_id)!;
        return s + toCents(periodAmount(p.expected_amount, p, period));
      }, 0)
    : null;
  return {
    received: received / 100,
    spent: spent / 100,
    actualExpenses: actualExpenses / 100,
    outside: outside / 100,
    remaining: (received - spent) / 100,
    actualResult: (received - actualExpenses) / 100,
    expected: expected === null ? null : expected / 100,
    projectedRemaining: expected === null ? null : (expected - spent) / 100,
    complete,
    missing: missing.map(m => m.full_name)
  };
}
