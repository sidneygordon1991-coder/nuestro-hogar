import {countsInBudget, type BudgetTreatment} from './budgetTreatment';
import {toCents} from './financePeriods';

type Movement = BudgetTreatment & {
  type: string;
  amount: number | string;
  transaction_date: string;
  category_id: string | null;
};
type Saving = {amount: number | string; contribution_date: string};
type Category = {id: string; budget_group?: string};

/** Shared accounting rule for actual figures. Plans, transfers and credit limits never enter this ledger. */
export function registeredLedger(
  transactions: Movement[],
  savings: Saving[],
  categories: Category[],
  range: {start: string; end: string; today: string}
) {
  const cutoff = range.end < range.today ? range.end : range.today;
  const rows = transactions.filter(t => t.transaction_date >= range.start && t.transaction_date <= cutoff);
  const deposits = savings.filter(s => s.contribution_date >= range.start && s.contribution_date <= cutoff);
  const savingIds = new Set(categories.filter(c => c.budget_group === 'saving').map(c => c.id));
  const isSaving = (t: Movement) => t.type === 'expense' && savingIds.has(t.category_id || '');
  const sum = (entries: {amount: number | string}[]) => entries.reduce((n, r) => n + toCents(r.amount), 0);
  const income = sum(rows.filter(t => t.type === 'income'));
  const expenses = rows.filter(t => t.type === 'expense' && !isSaving(t));
  const expense = sum(expenses);
  const saving = sum(deposits) + sum(rows.filter(isSaving));
  const budgetExpense = sum(expenses.filter(countsInBudget));
  return {
    income: income / 100,
    expense: expense / 100,
    saving: saving / 100,
    savingRate: income > 0 ? (saving / income) * 100 : 0,
    available: (income - expense - saving) / 100,
    balance: (income - expense - saving) / 100,
    budgetExpense: budgetExpense / 100,
    excludedExpense: (expense - budgetExpense) / 100,
    transactionCount: rows.length,
    savingCount: deposits.length,
    cutoff,
    transactions: rows,
    savings: deposits
  };
}

/** Compare equal elapsed days. A short month ends on its real last day. */
export function comparableMonthRange(month: string, today: string) {
  const year = Number(month.slice(0, 4)),
    index = Number(month.slice(5, 7)) - 1;
  const last = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const elapsed = month.slice(0, 7) === today.slice(0, 7) ? Number(today.slice(8, 10)) : last;
  const previous = new Date(Date.UTC(year, index, 0));
  const prefix = previous.toISOString().slice(0, 7);
  const partial = month.slice(0, 7) === today.slice(0, 7) && elapsed < last;
  return {
    current: {
      start: month.slice(0, 7) + '-01',
      end: month.slice(0, 7) + '-' + String(Math.min(last, elapsed)).padStart(2, '0')
    },
    previous: {
      start: prefix + '-01',
      end:
        prefix +
        '-' +
        String(partial ? Math.min(previous.getUTCDate(), elapsed) : previous.getUTCDate()).padStart(2, '0')
    },
    partial
  };
}
