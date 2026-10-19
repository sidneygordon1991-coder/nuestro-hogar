/** Household pay-cycle cutoffs, independent from each member's individual salary days. */
export type HouseholdCutoffs = {first_cutoff_day: number; second_cutoff_day: number};
export type CyclePeriod = 'first' | 'second';
export const DEFAULT_HOUSEHOLD_CUTOFFS: HouseholdCutoffs = {first_cutoff_day: 15, second_cutoff_day: 31};

export function validateHouseholdCutoffs(first: number, second: number): HouseholdCutoffs {
  if (!Number.isInteger(first) || first < 1 || first > 27)
    throw new Error('El primer corte debe estar entre los días 1 y 27.');
  if (!Number.isInteger(second) || second <= first || second > 31)
    throw new Error('El segundo corte debe ser posterior al primero y como máximo el 31.');
  return {first_cutoff_day: first, second_cutoff_day: second};
}

export function normalizedHouseholdCutoffs(value?: Partial<HouseholdCutoffs> | null) {
  try {
    return validateHouseholdCutoffs(
      Number(value?.first_cutoff_day ?? DEFAULT_HOUSEHOLD_CUTOFFS.first_cutoff_day),
      Number(value?.second_cutoff_day ?? DEFAULT_HOUSEHOLD_CUTOFFS.second_cutoff_day)
    );
  } catch {
    return {...DEFAULT_HOUSEHOLD_CUTOFFS};
  }
}
const pad = (n: number) => String(n).padStart(2, '0');
const civil = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const cutoff = (year: number, month: number, nominal: number) =>
  civil(year, month, Math.min(nominal, lastDay(year, month)));
const shift = (date: string, diff: number) => {
  const dateValue = new Date(date + 'T12:00:00Z');
  dateValue.setUTCDate(dateValue.getUTCDate() + diff);
  return dateValue.toISOString().slice(0, 10);
};
/**
 * A cycle is named for the calendar month in which it closes:
 * first: previous second cutoff + 1 through current first cutoff;
 * second: current first cutoff + 1 through current second cutoff.
 * For 13/28, the 29th through the next 13th is one continuous first period.
 */
export function payWindow(closingMonth: string, period: CyclePeriod, saved?: Partial<HouseholdCutoffs> | null) {
  const conf = normalizedHouseholdCutoffs(saved);
  const year = Number(closingMonth.slice(0, 4));
  const month = Number(closingMonth.slice(5, 7)) - 1;
  const firstEnd = cutoff(year, month, conf.first_cutoff_day);
  const secondEnd = cutoff(year, month, conf.second_cutoff_day);
  const start = period === 'first' ? shift(cutoff(year, month - 1, conf.second_cutoff_day), 1) : shift(firstEnd, 1);
  return {
    period,
    month: `${year}-${pad(month + 1)}-01`,
    start,
    end: period === 'first' ? firstEnd : secondEnd
  };
}
export function payWindowAt(date: string, saved?: Partial<HouseholdCutoffs> | null) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1;
  // Search adjacent closing months: the end of one month belongs to the next first cutoff.
  for (const offset of [-1, 0, 1]) {
    const next = civil(year, month + offset, 1);
    for (const period of ['first', 'second'] as const) {
      const window = payWindow(next, period, saved);
      if (window.start <= date && date <= window.end) return window;
    }
  }
  throw new Error('No se pudo calcular la quincena para esta fecha.');
}
export function payWindowLabel(window: {start: string; end: string}) {
  const fmt = (date: string) =>
    new Date(date + 'T12:00:00Z')
      .toLocaleDateString('es-GT', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC'
      })
      .replace('.', '');
  return fmt(window.start) + ' – ' + fmt(window.end);
}
