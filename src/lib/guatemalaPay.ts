/**
 * Guatemalan payroll for employees (asalariados): net monthly pay, ISR withholding, Bono 14 and aguinaldo.
 * Pure functions, quetzales, rounded to cents. Sources and rules:
 * - IGSS employee share 4.83% of the ordinary salary; the Q250 incentive bonus (Decreto 78-89) is exempt from IGSS
 *   but IS taxable income for ISR.
 * - ISR (Decreto 10-2012, arts. 70-73): taxable = yearly income - IGSS - Q48,000 standard deduction - other personal
 *   deductions (IVA invoices up to Q12,000, donations, insurance). 5% up to Q300,000; Q15,000 + 7% on the excess.
 *   2026 only: an extra Q3,024 deduction (Decreto 13-2026).
 * - Bono 14 (Decreto 42-92): one ordinary monthly salary for July 1 - June 30, paid by July 15; proportional to the
 *   days worked in that period.
 * - Aguinaldo (Decreto 76-78): one ordinary monthly salary for December 1 - November 30; by law 50% in the first
 *   half of December and 50% in the second half of January (many employers pay it all in December).
 * - Both bonuses are free of IGSS and exempt from ISR up to one ordinary monthly salary each.
 * These are estimates: the employer's payroll is the final word.
 */
export const IGSS_EMPLOYEE_RATE = 0.0483;
export const INCENTIVE_BONUS = 250;
export const ISR_STANDARD_DEDUCTION = 48000;
/** The 2027 reform depends on that year's official minimum wage; never silently reuse the old allowance. */
export const VERIFIED_PAYROLL_YEAR = 2026;
export const ISR_PERSONAL_DEDUCTIONS_CAP = 12000;
const ISR_BRACKET = 300000;
/** One-off deductions that apply only to a given tax year. */
const EXTRA_DEDUCTION: Record<number, number> = {2026: 3024};

const cents = (n: number) => Math.round(n * 100) / 100;
const positive = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

export type PayInput = {
  /** Ordinary monthly salary, without the incentive bonus. */
  salary: number;
  /** Incentive bonus per month (Q250 by law; 0 if the employer includes it in the salary). */
  incentive?: number;
  /** Other monthly taxable pay (commissions, overtime) that is subject to IGSS. */
  otherTaxable?: number;
  /** Personal deductions per year (IVA invoices, donations, life insurance), capped at Q12,000 for IVA. */
  personalDeductions?: number;
  /** Most workers contribute; some contracts (e.g. professional services) do not. */
  igss?: boolean;
  year: number;
  /** Confirmed annual personal allowance for the 2027+ rules; required until configured for that year. */
  annualAllowance?: number;
};
export type PayResult = {
  gross: number;
  igss: number;
  isr: number;
  net: number;
  yearlyTaxable: number;
  yearlyIsr: number;
  /** ISR as a share of gross pay, 0-1. */
  effectiveRate: number;
};

export function isrForYear(taxable: number) {
  const base = Math.max(0, taxable);
  return cents(base <= ISR_BRACKET ? base * 0.05 : 15000 + (base - ISR_BRACKET) * 0.07);
}

/** Net monthly pay: gross - IGSS - 1/12 of the year's ISR, the way the employer withholds it. */
export function netPay(input: PayInput): PayResult {
  if (input.year > VERIFIED_PAYROLL_YEAR && !(Number.isFinite(input.annualAllowance) && input.annualAllowance! > 0)) {
    throw new Error('Confirma la deducción anual vigente para calcular ISR desde 2027.');
  }
  const salary = positive(input.salary),
    incentive = input.incentive === undefined ? INCENTIVE_BONUS : positive(input.incentive),
    other = positive(input.otherTaxable);
  const igssBase = salary + other;
  const igss = input.igss === false ? 0 : cents(igssBase * IGSS_EMPLOYEE_RATE);
  const gross = cents(salary + incentive + other);
  const deductions =
    (input.year > VERIFIED_PAYROLL_YEAR ? input.annualAllowance! : ISR_STANDARD_DEDUCTION) +
    (EXTRA_DEDUCTION[input.year] || 0) +
    positive(input.personalDeductions);
  const yearlyTaxable = cents(Math.max(0, gross * 12 - igss * 12 - deductions));
  const yearlyIsr = isrForYear(yearlyTaxable);
  const isr = cents(yearlyIsr / 12);
  return {
    gross,
    igss,
    isr,
    net: cents(gross - igss - isr),
    yearlyTaxable,
    yearlyIsr,
    effectiveRate: gross > 0 ? isr / gross : 0
  };
}

export type ExtraPayKind = 'bono14' | 'aguinaldo';
export type ExtraPay = {
  kind: ExtraPayKind;
  label: string;
  /** Period that earns it (inclusive ISO dates). */
  periodStart: string;
  periodEnd: string;
  /** Legal payment deadline (aguinaldo: the December half). */
  payDate: string;
  /** Second half of the aguinaldo, due in January, when paid as the law splits it. */
  secondPayDate: string | null;
  daysWorked: number;
  periodDays: number;
  amount: number;
  /** Amount above one monthly salary, which is subject to ISR. */
  taxableExcess: number;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(s + 'T00:00:00Z');
const daysBetween = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000) + 1;

/** Period, dates and amount of one Bono 14 or aguinaldo, paid in `payYear`. */
export function extraPay(
  kind: ExtraPayKind,
  {salary, startDate, payYear}: {salary: number; startDate?: string | null; payYear: number}
): ExtraPay {
  const periodStart = kind === 'bono14' ? payYear - 1 + '-07-01' : payYear - 1 + '-12-01';
  const periodEnd = kind === 'bono14' ? payYear + '-06-30' : payYear + '-11-30';
  const periodDays = daysBetween(periodStart, periodEnd);
  const from = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && startDate > periodStart ? startDate : periodStart;
  const daysWorked = from > periodEnd ? 0 : daysBetween(from, periodEnd);
  const monthly = positive(salary);
  const amount = cents((monthly * daysWorked) / periodDays);
  return {
    kind,
    label: kind === 'bono14' ? 'Bono 14' : 'Aguinaldo',
    periodStart,
    periodEnd,
    payDate: kind === 'bono14' ? payYear + '-07-15' : payYear + '-12-15',
    secondPayDate: kind === 'aguinaldo' ? payYear + 1 + '-01-31' : null,
    daysWorked,
    periodDays,
    amount,
    taxableExcess: cents(Math.max(0, amount - monthly))
  };
}

/** The next Bono 14 and aguinaldo on or after `today`, soonest first. */
export function upcomingExtraPays(salary: number, startDate: string | null | undefined, today: string) {
  const year = Number(today.slice(0, 4));
  // The aguinaldo stays until its January half is due (by law, the second half of January).
  const lastDue = (p: ExtraPay) => p.secondPayDate || p.payDate;
  return (['bono14', 'aguinaldo'] as const)
    .map(
      kind =>
        [year - 1, year, year + 1]
          .map(payYear => extraPay(kind, {salary, startDate, payYear}))
          .find(p => lastDue(p) >= today)!
    )
    .sort((a, b) => nextDue(a, today).localeCompare(nextDue(b, today)));
}

/** The next date money arrives for this payment: the December half, or the January half once December passed. */
export function nextDue(p: ExtraPay, today: string) {
  return p.payDate >= today || !p.secondPayDate ? p.payDate : p.secondPayDate;
}

export function daysUntil(today: string, date: string) {
  return daysBetween(today, date) - 1;
}

/** Where an extra payment goes. Amounts in quetzales; `free` is whatever is left. */
export type ExtraPlan = {debt: number; saving: number; planned: number};
export const EXTRA_PLAN_LABELS: Record<keyof ExtraPlan | 'free', string> = {
  debt: 'Pagar deudas',
  saving: 'Ahorro o meta',
  planned: 'Gastos de temporada',
  free: 'Libre para disfrutar'
};

/**
 * A sensible first split: with debts, half goes to them; then saving and the season's known expenses
 * (school in January, end-of-year in December). Always leaves a part to enjoy.
 */
export function suggestedExtraPlan(kind: ExtraPayKind, amount: number, hasDebt: boolean): ExtraPlan {
  const total = Math.round(positive(amount) * 100);
  const shares = hasDebt
    ? {debt: 0.5, saving: 0.2, planned: kind === 'aguinaldo' ? 0.2 : 0.15}
    : {debt: 0, saving: 0.45, planned: kind === 'aguinaldo' ? 0.3 : 0.25};
  return {
    debt: Math.floor(total * shares.debt) / 100,
    saving: Math.floor(total * shares.saving) / 100,
    planned: Math.floor(total * shares.planned) / 100
  };
}

export function normalizeExtraPlan(raw: unknown, amount: number): ExtraPlan & {free: number} {
  const x = (raw && typeof raw === 'object' ? raw : {}) as Partial<ExtraPlan>;
  const total = Math.round(positive(amount) * 100);
  let left = total;
  const take = (v: unknown) => {
    const c = Math.min(left, Math.round(positive(v) * 100));
    left -= c;
    return c / 100;
  };
  const debt = take(x.debt),
    saving = take(x.saving),
    planned = take(x.planned);
  return {debt, saving, planned, free: left / 100};
}
