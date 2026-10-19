/** Cycle dates are civil dates, independent of the device timezone. */
export type PayCycle = {cycle_first_day?: number | null; cycle_second_day?: number | null};
export function effectiveCycle(cycle?: PayCycle | null) {
  const first = cycle?.cycle_first_day ?? 1,
    second = cycle?.cycle_second_day ?? 16;
  return Number.isInteger(first) &&
    Number.isInteger(second) &&
    first >= 1 &&
    first <= 28 &&
    second > first &&
    second <= 31
    ? {first, second}
    : {first: 1, second: 16};
}
export function validateCycle(first: string, second: string) {
  if (
    !/^\d{1,2}$/.test(first) ||
    !/^\d{1,2}$/.test(second) ||
    Number(first) < 1 ||
    Number(first) > 28 ||
    Number(second) <= Number(first) ||
    Number(second) > 31
  )
    throw new Error('El primer inicio debe ser del 1 al 28; el segundo debe ser posterior y como máximo el 31.');
  return {cycle_first_day: Number(first), cycle_second_day: Number(second)};
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function cycleBounds(month: string, period: 'month' | 'first' | 'second', cycle?: PayCycle) {
  const {first, second} = effectiveCycle(cycle);
  const year = Number(month.slice(0, 4)),
    m = Number(month.slice(5, 7)) - 1;
  const start = new Date(Date.UTC(year, m, first));
  // A nonexistent 29/30/31 starts on the first of the following month.
  const last = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
  const middle = new Date(Date.UTC(year, m, Math.min(second, last + 1)));
  const next = new Date(Date.UTC(year, m + 1, first));
  const from = period === 'second' ? middle : start;
  const until = period === 'first' ? middle : next;
  return {start: iso(from), end: iso(new Date(until.getTime() - 86400000))};
}
export function cycleRangeLabel(month: string, period: 'month' | 'first' | 'second', cycle?: PayCycle) {
  const b = cycleBounds(month, period, cycle);
  const fmt = (date: string) =>
    new Intl.DateTimeFormat('es-GT', {day: 'numeric', month: 'short', timeZone: 'UTC'}).format(
      new Date(date + 'T12:00:00Z')
    );
  return fmt(b.start) + ' – ' + fmt(b.end);
}
