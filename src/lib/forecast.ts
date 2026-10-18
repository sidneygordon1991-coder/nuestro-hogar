/**
 * Next 90 days of available money, without AI: today's liquid balance, plus the fixed payments and incomes on
 * their dates, plus the household's usual variable spending and other income spread over time.
 * "If things keep going as they have been" — a guide, not a promise.
 */
export type ForecastRecurring = {
  id: string;
  description: string;
  amount: number | string;
  type: string;
  due_day: number | null;
  active?: boolean | null;
};
export type ForecastHistory = {amount: number | string; type: string; transaction_date: string};
export type ForecastPoint = {date: string; balance: number};
export type ForecastEvent = {date: string; description: string; amount: number};
export type Forecast = {
  points: ForecastPoint[];
  events: ForecastEvent[];
  low: ForecastPoint;
  end: ForecastPoint;
  firstNegative: string | null;
  dailyVariable: number;
  monthlyOtherIncome: number;
};

const toCents = (n: unknown) => Math.round((Number(n) || 0) * 100);
const iso = (d: Date) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/**
 * Usual variable spending per day and other income per month, from the last three full months, minus what the
 * fixed (recurring) items already explain.
 */
export function usualFlows(history: ForecastHistory[], recurring: ForecastRecurring[], today: string) {
  const t = new Date(today + 'T12:00:00');
  const from = iso(new Date(t.getFullYear(), t.getMonth() - 3, 1)),
    to = iso(new Date(t.getFullYear(), t.getMonth(), 0));
  const span =
    Math.round((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86400000) + 1;
  let spent = 0,
    earned = 0;
  for (const h of history) {
    if (h.transaction_date < from || h.transaction_date > to) continue;
    if (h.type === 'expense') spent += toCents(h.amount);
    else if (h.type === 'income') earned += toCents(h.amount);
  }
  const active = recurring.filter(r => r.active !== false && r.due_day);
  const fixedOut = active.filter(r => r.type === 'expense').reduce((n, r) => n + toCents(r.amount), 0),
    fixedIn = active.filter(r => r.type === 'income').reduce((n, r) => n + toCents(r.amount), 0);
  return {
    dailyVariable: Math.max(0, Math.round((spent - fixedOut * 3) / span)) / 100,
    monthlyOtherIncome: Math.max(0, Math.round((earned - fixedIn * 3) / 3)) / 100
  };
}

export function forecast90(
  startBalance: number,
  today: string,
  {
    recurring,
    paidThisMonth,
    dailyVariable,
    monthlyOtherIncome,
    days = 90
  }: {
    recurring: ForecastRecurring[];
    /** Recurring ids already paid (or received) this month. */
    paidThisMonth: Set<string>;
    dailyVariable: number;
    monthlyOtherIncome: number;
    days?: number;
  }
): Forecast {
  const t = new Date(today + 'T12:00:00');
  let balance = toCents(startBalance);
  const points: ForecastPoint[] = [{date: today, balance: balance / 100}],
    events: ForecastEvent[] = [];
  const variable = toCents(dailyVariable),
    halfIncome = Math.round(toCents(monthlyOtherIncome) / 2);
  for (let i = 1; i <= days; i++) {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i, 12);
    const date = iso(d),
      day = d.getDate(),
      end = lastDay(d.getFullYear(), d.getMonth());
    const sameMonth = d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
    for (const r of recurring) {
      if (r.active === false || !r.due_day) continue;
      // An unpaid item whose day already passed this month is still owed: it counts tomorrow.
      const overdue = i === 1 && Number(r.due_day) <= t.getDate() && !paidThisMonth.has(r.id);
      if (!overdue && Math.min(Number(r.due_day), end) !== day) continue;
      if (sameMonth && paidThisMonth.has(r.id)) continue;
      const amount = toCents(r.amount) * (r.type === 'income' ? 1 : -1);
      balance += amount;
      events.push({date, description: r.description, amount: amount / 100});
    }
    // Other income usually arrives on the quincenas (15th and month end).
    if (halfIncome && (day === 15 || day === end)) balance += halfIncome;
    balance -= variable;
    points.push({date, balance: balance / 100});
  }
  const low = points.reduce((a, b) => (b.balance < a.balance ? b : a), points[0]);
  return {
    points,
    events,
    low,
    end: points[points.length - 1],
    firstNegative: points.find(p => p.balance < 0)?.date ?? null,
    dailyVariable,
    monthlyOtherIncome
  };
}
