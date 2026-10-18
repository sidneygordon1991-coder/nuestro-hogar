/**
 * Mesada: a regular allowance for children and teens, split into three jars (gastar, ahorrar, compartir) so it
 * teaches the same habits the household uses. Pure date and money rules; quetzales rounded to cents.
 */
export type AllowanceFrequency = 'weekly' | 'fortnight' | 'monthly';
export type Allowance = {
  id: string;
  child_name: string;
  child_user_id?: string | null;
  amount: number | string;
  frequency: AllowanceFrequency;
  /** First payday (YYYY-MM-DD); later paydays follow the frequency from it. */
  start_date: string;
  save_percent: number;
  give_percent: number;
  goal_name?: string | null;
  goal_amount?: number | string | null;
  active?: boolean | null;
};
export type AllowancePayment = {
  allowance_id: string;
  kind: 'payment' | 'withdrawal';
  /** Payday this payment covers (payments only). */
  for_date?: string | null;
  paid_on: string;
  spend_amount: number | string;
  save_amount: number | string;
  give_amount: number | string;
};

export const FREQUENCY_LABELS: Record<AllowanceFrequency, string> = {
  weekly: 'Cada semana',
  fortnight: 'Cada quincena (15 y fin de mes)',
  monthly: 'Cada mes'
};

const toCents = (n: unknown) => Math.round((Number(n) || 0) * 100);
const utc = (s: string) => new Date(s + 'T00:00:00Z');
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Jars for one payment: saving and giving are rounded down; spending keeps every remaining cent. */
export function splitAllowance(amount: number | string, savePercent: number, givePercent: number) {
  const total = Math.max(0, toCents(amount));
  const savePct = Math.min(100, Math.max(0, Math.round(savePercent) || 0));
  const givePct = Math.min(100 - savePct, Math.max(0, Math.round(givePercent) || 0));
  const save = Math.floor((total * savePct) / 100),
    give = Math.floor((total * givePct) / 100);
  return {spend: (total - save - give) / 100, save: save / 100, give: give / 100};
}

const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** Fortnight paydays are the 15th and the month's last day; the first one is on or after the start date. */
const fortnightBase = (start: Date) => (start.getUTCDate() <= 15 ? 0 : 1);

/**
 * The k-th payday (k = 0 is the first). Weekly: every 7 days from the start. Fortnight: the 15th and the last
 * day of each month. Monthly: the start's day, clamped to short months.
 */
export function payday(a: Pick<Allowance, 'frequency' | 'start_date'>, k: number) {
  const start = utc(a.start_date);
  const y = start.getUTCFullYear(),
    m0 = start.getUTCMonth();
  if (a.frequency === 'weekly') {
    start.setUTCDate(start.getUTCDate() + k * 7);
    return iso(start);
  }
  if (a.frequency === 'fortnight') {
    const idx = fortnightBase(start) + k,
      m = m0 + Math.floor(idx / 2);
    return iso(new Date(Date.UTC(y, m, idx % 2 === 0 ? 15 : lastDayOf(y, m))));
  }
  const m = m0 + k;
  return iso(new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDayOf(y, m)))));
}

/** Index of the last payday on or before `date` (-1 before the first). */
function lastIndex(a: Allowance, date: string) {
  const s = utc(a.start_date),
    d = utc(date);
  const months = (d.getUTCFullYear() - s.getUTCFullYear()) * 12 + d.getUTCMonth() - s.getUTCMonth();
  let k: number;
  if (a.frequency === 'weekly') k = Math.floor(Math.round((d.getTime() - s.getTime()) / 86400000) / 7);
  else if (a.frequency === 'fortnight') {
    const day = d.getUTCDate(),
      within = day >= lastDayOf(d.getUTCFullYear(), d.getUTCMonth()) ? 1 : day >= 15 ? 0 : -1;
    k = months * 2 + within - fortnightBase(s);
  } else {
    k = months;
    if (k >= 0 && payday(a, k) > date) k--;
  }
  return date < a.start_date || k < 0 ? -1 : k;
}

export function nextPayday(a: Allowance, today: string) {
  const k = lastIndex(a, today);
  return k >= 0 && payday(a, k) === today ? today : payday(a, k + 1);
}

/** Paydays up to today without a payment, most recent first (at most `limit`, so a long pause is not a debt). */
export function pendingPaydays(a: Allowance, payments: AllowancePayment[], today: string, limit = 3) {
  if (a.active === false) return [];
  const paid = new Set(
    payments.filter(p => p.allowance_id === a.id && p.kind === 'payment' && p.for_date).map(p => p.for_date)
  );
  // Everything up to the last paid payday is settled, even if the schedule changed since.
  const lastPaid = [...paid].sort().pop() || '';
  const out: string[] = [];
  for (let k = lastIndex(a, today); k >= 0 && out.length < limit; k--) {
    const d = payday(a, k);
    if (d <= lastPaid) break;
    out.push(d);
  }
  return out;
}

export type Jars = {spend: number; save: number; give: number; paidTotal: number; payments: number};
/** Running jar totals; a withdrawal takes money out of the saving jar (to buy the goal, for example). */
export function jarTotals(allowanceId: string, payments: AllowancePayment[]): Jars {
  let spend = 0,
    save = 0,
    give = 0,
    paid = 0,
    count = 0;
  for (const p of payments) {
    if (p.allowance_id !== allowanceId) continue;
    if (p.kind === 'withdrawal') {
      save -= toCents(p.save_amount);
      continue;
    }
    count++;
    paid += toCents(p.spend_amount) + toCents(p.save_amount) + toCents(p.give_amount);
    spend += toCents(p.spend_amount);
    save += toCents(p.save_amount);
    give += toCents(p.give_amount);
  }
  return {spend: spend / 100, save: save / 100, give: give / 100, paidTotal: paid / 100, payments: count};
}

/** Saving goal progress and, at the current pace, how many more paydays it takes. */
export function allowanceGoal(a: Allowance, saved: number) {
  const target = toCents(a.goal_amount);
  if (!target) return null;
  const perPayday = toCents(splitAllowance(a.amount, a.save_percent, a.give_percent).save);
  const left = Math.max(0, target - toCents(saved));
  return {
    target: target / 100,
    left: left / 100,
    percent: Math.min(100, Math.floor((toCents(saved) / target) * 100)),
    paydaysLeft: left === 0 ? 0 : perPayday > 0 ? Math.ceil(left / perPayday) : null
  };
}

/** What the allowance costs the household per month, for the budget. */
export function monthlyCost(a: Pick<Allowance, 'amount' | 'frequency'>) {
  const c = toCents(a.amount);
  return Math.round(a.frequency === 'weekly' ? (c * 52) / 12 : a.frequency === 'fortnight' ? c * 2 : c) / 100;
}
