/** Cycle dates are civil dates, independent of the device timezone. */
export type PayCycle = {cycle_first_day?: number | null; cycle_second_day?: number | null};
export function effectiveCycle(cycle?: PayCycle | null) {
  const first = cycle?.cycle_first_day ?? 1,
    second = cycle?.cycle_second_day ?? 16;
  return Number.isInteger(first) &&
    Number.isInteger(second) &&
    first >= 1 &&
    first <= 31 &&
    second >= 1 &&
    second <= 31 &&
    first !== second &&
    Math.min(first, second) <= 28
    ? {first, second}
    : {first: 1, second: 16};
}
export function validateCycle(first: string, second: string) {
  if (
    !/^\d{1,2}$/.test(first) ||
    !/^\d{1,2}$/.test(second) ||
    Number(first) < 1 ||
    Number(first) > 31 ||
    Number(second) < 1 ||
    Number(second) > 31
  )
    throw new Error('Cada inicio debe ser un día entero entre 1 y 31.');
  if (Number(first) === Number(second)) throw new Error('Las dos quincenas deben comenzar en días distintos.');
  if (Math.min(Number(first), Number(second)) > 28)
    throw new Error('Al menos uno de los inicios debe ser del 1 al 28 para funcionar también en febrero.');
  return {cycle_first_day: Number(first), cycle_second_day: Number(second)};
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const onDay = (year: number, month: number, day: number) => {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // A missing start moves to the first of the following month, never several days into it.
  return new Date(Date.UTC(year, month, Math.min(day, last + 1)));
};
export function cycleBounds(month: string, period: 'month' | 'first' | 'second', cycle?: PayCycle) {
  const {first, second} = effectiveCycle(cycle);
  const year = Number(month.slice(0, 4)),
    m = Number(month.slice(5, 7)) - 1;
  const start = onDay(year, m, first);
  const middle = onDay(year, m + (second < first ? 1 : 0), second);
  const next = onDay(year, m + 1, first);
  const from = period === 'second' ? middle : start;
  const until = period === 'first' ? middle : next;
  return {start: iso(from), end: iso(new Date(until.getTime() - 86400000))};
}
/** The selected month names the start of the cycle, including a start deferred by February. */
export function currentCycleMonth(today: string, cycle?: PayCycle) {
  const month = today.slice(0, 7) + '-01';
  if (today >= cycleBounds(month, 'month', cycle).start) return month;
  return iso(new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)));
}
export function currentCyclePeriod(today: string, cycle?: PayCycle): 'first' | 'second' {
  const month = currentCycleMonth(today, cycle);
  return today <= cycleBounds(month, 'first', cycle).end ? 'first' : 'second';
}
export function cycleRangeLabel(month: string, period: 'month' | 'first' | 'second', cycle?: PayCycle) {
  const b = cycleBounds(month, period, cycle);
  const fmt = (date: string) =>
    new Intl.DateTimeFormat('es-GT', {day: 'numeric', month: 'short', timeZone: 'UTC'}).format(
      new Date(date + 'T12:00:00Z')
    );
  return fmt(b.start) + ' – ' + fmt(b.end);
}
