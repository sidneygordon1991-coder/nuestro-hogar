import {registeredLedger} from './registeredLedger';
import {countsInBudget, type BudgetTreatment} from './budgetTreatment';
import {monthlyIncomeSummary, type IncomeMember, type IncomePlan} from './monthlyIncome';
import {inPeriod, toCents, type FinancePeriod, type PeriodAllocation} from './financePeriods';
import {occurrenceDetails, type RecurringTerms} from './recurringDetails';

export type CashMovement = BudgetTreatment & {
  id: string;
  description?: string;
  type: string;
  amount: number | string;
  transaction_date: string;
  category_id: string | null;
  paid_by: string | null;
  is_shared?: boolean | null;
};
export type CashSaving = {amount: number | string; contribution_date: string; created_by?: string | null};
export type CashRecurring = RecurringTerms & {id: string; active?: boolean};
export type CashOccurrence = {
  id: string;
  recurring_transaction_id: string;
  due_date: string;
  status: string;
  transaction_id?: string | null;
  details_snapshot?: Partial<RecurringTerms> | null;
};
export type CashFlowSource = {
  month: string;
  today: string;
  period?: FinancePeriod;
  transactions: CashMovement[];
  savings: CashSaving[];
  categories: {id: string; name?: string; budget_group?: string}[];
  allocations: PeriodAllocation[];
  members: IncomeMember[];
  plans: IncomePlan[];
  references?: Record<string, number>;
  recurring: CashRecurring[];
  occurrences: CashOccurrence[];
  paydays?: Record<string, Payday>;
};
/** Day of the month each member gets paid in each fortnight (second: 31 means the month's last day). */
export type Payday = {first: number; second: number};

/** One budget and one recurrence describe the same commitment, not two expenses. */
export function buildCashFlow(s: CashFlowSource) {
  const period = s.period || 'month';
  const transactions = s.transactions.filter(
    t => t.transaction_date <= s.today && inPeriod(t.transaction_date, s.month, period)
  );
  const savings = s.savings.filter(
    t => t.contribution_date <= s.today && inPeriod(t.contribution_date, s.month, period)
  );
  const sum = <T>(rows: T[], get: (r: T) => number | string) => rows.reduce((n, r) => n + toCents(get(r)), 0);
  const groups = new Map(s.categories.map(c => [c.id, c.budget_group || 'variable']));
  const ledger = registeredLedger(transactions, savings, s.categories, {
    start: s.month.slice(0, 7) + '-01',
    end: s.month.slice(0, 7) + '-31',
    today: s.today
  });
  const income = toCents(ledger.income),
    expense = toCents(ledger.expense),
    saving = toCents(ledger.saving);
  const periodPlans =
    period === 'month'
      ? s.plans
      : s.plans.map(p => ({
          ...p,
          expected_amount: toCents(period === 'first' ? p.first_half_amount : p.second_half_amount) / 100
        }));
  const incomePlan = monthlyIncomeSummary(
    s.month,
    s.members,
    periodPlans,
    transactions,
    period === 'month' ? s.references : {}
  );
  const recurring = new Map(s.recurring.map(r => [r.id, r]));
  const actualIds = new Set(transactions.map(t => t.id));
  const pending = s.occurrences.flatMap(o => {
    const r = recurring.get(o.recurring_transaction_id);
    // A payment still pending from an earlier month stays overdue in the period that contains today.
    const due =
      inPeriod(o.due_date, s.month, period) ||
      (o.due_date < s.month.slice(0, 7) + '-01' && inPeriod(s.today, s.month, period));
    if (
      !r ||
      r.active === false ||
      o.status !== 'pending' ||
      !due ||
      (o.transaction_id && actualIds.has(o.transaction_id))
    )
      return [];
    const terms = occurrenceDetails(r, o.details_snapshot);
    return terms.type === 'expense' ? [{...o, terms}] : [];
  });
  const spent = new Map<string, number>(),
    commitments = new Map<string, number>();
  for (const t of transactions)
    if (t.type === 'expense' && countsInBudget(t))
      spent.set(t.category_id || '', (spent.get(t.category_id || '') || 0) + toCents(t.amount));
  for (const o of pending)
    commitments.set(
      o.terms.category_id || '',
      (commitments.get(o.terms.category_id || '') || 0) + toCents(o.terms.amount)
    );
  const planned = new Map<string, number>();
  for (const a of s.allocations.filter(a => a.month === s.month)) {
    const value =
      period === 'month' ? a.planned_amount : period === 'first' ? a.first_half_amount : a.second_half_amount;
    planned.set(a.category_id, (planned.get(a.category_id) || 0) + toCents(value));
  }
  let pendingSaving = 0,
    plannedFixed = 0,
    plannedVariable = 0,
    plannedSaving = 0,
    spentFixed = 0,
    spentVariable = 0,
    fixedCommitments = 0,
    variableRemaining = 0;
  for (const id of new Set([...planned.keys(), ...commitments.keys(), ...groups.keys()])) {
    const group = groups.get(id) || 'variable',
      plan = planned.get(id) || 0,
      actual = spent.get(id) || 0,
      pendingAmount = commitments.get(id) || 0;
    // A pending recurring saving is part of the savings plan: only what exceeds the plan is an extra commitment.
    if (group === 'saving') {
      plannedSaving += plan;
      pendingSaving += pendingAmount;
      continue;
    }
    if (group === 'fixed') {
      plannedFixed += plan;
      spentFixed += actual;
      fixedCommitments += Math.max(0, plan - actual, pendingAmount);
    } else {
      plannedVariable += plan;
      spentVariable += actual;
      fixedCommitments += pendingAmount;
      variableRemaining += Math.max(0, plan - actual - pendingAmount);
    }
  }
  const savingsRemaining = plannedSaving > 0 ? Math.max(0, plannedSaving - saving) : 0;
  // A pending recurring saving is covered by what the plan still reserves; only the excess is an extra commitment.
  fixedCommitments += Math.max(0, pendingSaving - savingsRemaining);
  const available = income - expense - saving,
    remainingExpenses = fixedCommitments + variableRemaining;
  const pendingIncome = toCents(incomePlan.pending),
    forecast = available + pendingIncome - remainingExpenses - savingsRemaining;
  return {
    income: income / 100,
    expense: expense / 100,
    budgetExpense: ledger.budgetExpense,
    excludedExpense: ledger.excludedExpense,
    saving: saving / 100,
    available: available / 100,
    plannedFixed: plannedFixed / 100,
    plannedVariable: plannedVariable / 100,
    plannedSaving: plannedSaving / 100,
    spentFixed: spentFixed / 100,
    spentVariable: spentVariable / 100,
    fixedCommitments: fixedCommitments / 100,
    variableRemaining: variableRemaining / 100,
    remainingExpenses: remainingExpenses / 100,
    savingsRemaining: savingsRemaining / 100,
    expectedIncomeRemaining: pendingIncome / 100,
    projectedClose: forecast / 100,
    availableAfterCommitments: (available - fixedCommitments - savingsRemaining) / 100,
    pendingRecurringAmount: sum(pending, o => o.terms.amount) / 100,
    overdue: pending.filter(o => o.due_date < s.today).length,
    nextPayment: pending.slice().sort((a, b) => a.due_date.localeCompare(b.due_date))[0] || null,
    futureCount:
      s.transactions.filter(t => t.transaction_date > s.today && inPeriod(t.transaction_date, s.month, period)).length +
      s.savings.filter(t => t.contribution_date > s.today && inPeriod(t.contribution_date, s.month, period)).length,
    incomePlan,
    transactions,
    savings
  };
}
