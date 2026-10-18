import {normalizeDescription} from './quickEntry';

/**
 * Finds charges that repeat every month with about the same amount (streaming, gym, phone plans) and are not
 * yet a recurring payment, and notices when one went up.
 */
export type SubscriptionTx = {
  description?: string | null;
  amount: number | string;
  type: string;
  transaction_date: string;
};
export type Subscription = {
  key: string;
  description: string;
  amount: number;
  yearly: number;
  occurrences: number;
  lastDate: string;
  nextDate: string;
  dueDay: number;
  /** Percent change of the last charge versus the one before (null when it did not change). */
  priceChange: number | null;
  known: boolean;
};

export const KNOWN_SUBSCRIPTIONS =
  /netflix|spotify|disney|hbo|\bmax\b|prime video|amazon prime|youtube|apple|icloud|google one|xbox|playstation|crunchyroll|paramount|star\+|chatgpt|canva|microsoft|office 365|adobe|gimnasio|gym|smart fit|claro|tigo|internet|cable|seguro/;

const days = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
const addMonth = (d: string) => {
  const x = new Date(d + 'T12:00:00'),
    day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + 1);
  x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
};

export function detectSubscriptions(
  transactions: SubscriptionTx[],
  recurringDescriptions: (string | null)[],
  today: string
): Subscription[] {
  const planned = recurringDescriptions.map(normalizeDescription).filter(Boolean);
  const groups = new Map<string, SubscriptionTx[]>();
  for (const t of transactions) {
    if (t.type !== 'expense' || !(Number(t.amount) > 0) || t.transaction_date > today) continue;
    const key = normalizeDescription(t.description)
      .replace(/\b\d+\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (key.length < 3) continue;
    groups.set(key, [...(groups.get(key) || []), t]);
  }
  const found: Subscription[] = [];
  for (const [key, rows] of groups) {
    if (planned.some(p => p === key || p.includes(key) || key.includes(p))) continue;
    // One charge per month: keep the latest of each month.
    const byMonth = new Map<string, SubscriptionTx>();
    for (const r of rows.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date)))
      byMonth.set(r.transaction_date.slice(0, 7), r);
    const charges = [...byMonth.values()];
    const known = KNOWN_SUBSCRIPTIONS.test(key);
    if (charges.length < (known ? 2 : 3)) continue;
    const recent = charges.slice(-4);
    const gaps = recent.slice(1).map((r, i) => days(recent[i].transaction_date, r.transaction_date));
    if (!gaps.every(g => g >= 24 && g <= 38)) continue;
    const amounts = recent.map(r => Math.round(Number(r.amount) * 100));
    const last = amounts[amounts.length - 1];
    // Same price, or one price change kept since (a raise): subscriptions move in steps, not at random.
    const steps = amounts.slice(1).filter((a, i) => Math.abs(a - amounts[i]) > amounts[i] * 0.05).length;
    if (steps > 1) continue;
    const lastDate = recent[recent.length - 1].transaction_date;
    if (days(lastDate, today) > 45) continue; // cancelled or paused
    const before = amounts[0];
    const change = steps === 1 && before > 0 ? Math.round(((last - before) / before) * 100) : null;
    found.push({
      key,
      description: String(recent[recent.length - 1].description || key).trim(),
      amount: last / 100,
      yearly: (last * 12) / 100,
      occurrences: charges.length,
      lastDate,
      nextDate: addMonth(lastDate),
      dueDay: Number(lastDate.slice(8, 10)),
      priceChange: change,
      known
    });
  }
  return found.sort((a, b) => b.amount - a.amount);
}
