import {buildCashFlow, type CashFlowSource} from './cashFlow';
import {halfOf, toCents, type FinancePeriod} from './financePeriods';

export type SplitRow = {key: 'spent' | 'fixed' | 'variable' | 'saving'; label: string; amount: number};
export type FortnightSplit = {
  period: Exclude<FinancePeriod, 'month'>;
  start: string;
  end: string;
  /** Income registered in the fortnight up to today. */
  received: number;
  /** Planned income for the fortnight that has not arrived yet. */
  toReceive: number;
  /** received + toReceive: the money this fortnight has to cover. */
  income: number;
  rows: SplitRow[];
  /** What is left after everything already spent and everything the plan still commits. Negative = short. */
  free: number;
  /** Whether there is enough plan to make the split meaningful (income and at least one commitment or budget). */
  ready: boolean;
};

const monthDay = (month: string, day: number) => month.slice(0, 8) + String(day).padStart(2, '0');

/**
 * «Llegó tu quincena»: where this fortnight's money goes, with the same engine as Inicio and Salud del hogar.
 * received + to receive − spent and saved − fixed payments pending − rest of the budget − saving to set aside = free.
 * Recurring payments inside a budgeted category are counted once (buildCashFlow takes the larger of the two).
 */
export function fortnightSplit(source: CashFlowSource): FortnightSplit {
  const period = halfOf(source.today) as 'first' | 'second';
  const last = new Date(Number(source.month.slice(0, 4)), Number(source.month.slice(5, 7)), 0).getDate();
  const flow = buildCashFlow({...source, period});
  const received = toCents(flow.income),
    toReceive = toCents(flow.expectedIncomeRemaining),
    spent = toCents(flow.expense) + toCents(flow.saving),
    fixed = toCents(flow.fixedCommitments),
    variable = toCents(flow.variableRemaining),
    saving = toCents(flow.savingsRemaining);
  const income = received + toReceive;
  const rows: SplitRow[] = [
    {key: 'spent' as const, label: 'Ya gastado y ahorrado', amount: spent / 100},
    {key: 'fixed' as const, label: 'Pagos fijos pendientes', amount: fixed / 100},
    {key: 'variable' as const, label: 'Resto del presupuesto', amount: variable / 100},
    {key: 'saving' as const, label: 'Ahorro por apartar', amount: saving / 100}
  ].filter(r => r.amount > 0);
  return {
    period,
    start: monthDay(source.month, period === 'first' ? 1 : 16),
    end: monthDay(source.month, period === 'first' ? 15 : last),
    received: received / 100,
    toReceive: toReceive / 100,
    income: income / 100,
    rows,
    free: (income - spent - fixed - variable - saving) / 100,
    ready: income > 0 && fixed + variable + saving + spent > 0
  };
}
