/**
 * "Tu semana": what this week cost compared with a normal week, what changed and what is coming. Weeks start on
 * Monday; a normal week is the average of the previous four for the same days (Monday to today).
 */
export type WeeklyTx = {
  amount: number | string;
  type: string;
  transaction_date: string;
  category_id?: string | null;
  description?: string | null;
};
export type WeeklyUpcoming = {date: string; description: string; amount: number};
export type WeeklySummary = {
  start: string;
  spent: number;
  usual: number;
  /** Percent above (+) or below (−) a normal week; null without history. */
  change: number | null;
  topCategory: {id: string | null; amount: number; usual: number} | null;
  biggest: {description: string; amount: number} | null;
  upcoming: WeeklyUpcoming[];
  upcomingTotal: number;
  sentence: string;
};

const toCents = (n: unknown) => Math.round((Number(n) || 0) * 100);
const iso = (d: Date) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

export function weekStart(today: string) {
  const d = new Date(today + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

export function weeklySummary(
  txs: WeeklyTx[],
  today: string,
  upcoming: WeeklyUpcoming[],
  categoryName: (id: string | null) => string,
  format: (n: number) => string
): WeeklySummary {
  const start = weekStart(today);
  const elapsed = Math.round(
    (new Date(today + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000
  );
  const windows = [0, 1, 2, 3, 4].map(w => {
    const s = new Date(start + 'T12:00:00');
    s.setDate(s.getDate() - 7 * w);
    const e = new Date(s);
    e.setDate(e.getDate() + elapsed);
    return {from: iso(s), to: iso(e)};
  });
  const expenses = txs.filter(t => t.type === 'expense');
  const inWindow = (t: WeeklyTx, w: {from: string; to: string}) =>
    t.transaction_date >= w.from && t.transaction_date <= w.to;
  const sum = (rows: WeeklyTx[]) => rows.reduce((n, t) => n + toCents(t.amount), 0);
  const week = expenses.filter(t => inWindow(t, windows[0]));
  const past = windows.slice(1).map(w => expenses.filter(t => inWindow(t, w)));
  const withData = past.filter(rows => rows.length > 0);
  const spent = sum(week),
    usual = withData.length ? Math.round(withData.reduce((n, rows) => n + sum(rows), 0) / withData.length) : 0;
  const change = usual > 0 ? Math.round(((spent - usual) / usual) * 100) : null;

  const byCategory = new Map<string | null, number>();
  for (const t of week)
    byCategory.set(t.category_id ?? null, (byCategory.get(t.category_id ?? null) || 0) + toCents(t.amount));
  let topCategory: WeeklySummary['topCategory'] = null,
    best = -Infinity;
  for (const [id, amount] of byCategory) {
    const usualCat = withData.length
      ? Math.round(
          withData.reduce((n, rows) => n + sum(rows.filter(r => (r.category_id ?? null) === id)), 0) / withData.length
        )
      : 0;
    // The category that moved the most above its own normal explains the week best.
    if (amount - usualCat > best) {
      best = amount - usualCat;
      topCategory = {id, amount: amount / 100, usual: usualCat / 100};
    }
  }
  const biggestTx = week.reduce<WeeklyTx | null>((a, b) => (!a || toCents(b.amount) > toCents(a.amount) ? b : a), null);
  const next = upcoming.filter(u => u.date > today).sort((a, b) => a.date.localeCompare(b.date));
  const upcomingTotal = next.reduce((n, u) => n + toCents(u.amount), 0) / 100;

  let sentence: string;
  if (!week.length) sentence = 'Esta semana aún no hay gastos registrados.';
  else if (change === null) sentence = `Esta semana llevas ${format(spent / 100)} en gastos.`;
  else if (change >= 15)
    sentence =
      `Llevas ${format(spent / 100)}, ${change}% más que una semana normal` +
      (topCategory && topCategory.amount > topCategory.usual
        ? `; sobre todo en ${categoryName(topCategory.id).toLocaleLowerCase('es-GT')}.`
        : '.');
  else if (change <= -15)
    sentence = `Llevas ${format(spent / 100)}, ${-change}% menos que una semana normal. Buen ritmo.`;
  else sentence = `Llevas ${format(spent / 100)}, parecido a una semana normal.`;
  return {
    start,
    spent: spent / 100,
    usual: usual / 100,
    change,
    topCategory,
    biggest: biggestTx
      ? {description: String(biggestTx.description || 'Gasto'), amount: toCents(biggestTx.amount) / 100}
      : null,
    upcoming: next,
    upcomingTotal,
    sentence
  };
}
