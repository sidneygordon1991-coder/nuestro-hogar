import {incomeAmount, type IncomePlan, type IncomeMember} from './monthlyIncome';

export type FinancePeriod = 'month' | 'first' | 'second';
export type HalfAmounts = {first_half_amount?: number | string | null; second_half_amount?: number | string | null};
export type PeriodAllocation = HalfAmounts & {category_id: string; planned_amount: number | string; month: string};
export type ShareRule = {
  split_method: 'inherit' | 'equal' | 'income' | 'custom' | 'personal';
  responsible_user_id?: string;
};
export type ShareContext = {
  members: IncomeMember[];
  plans: IncomePlan[];
  references: Record<string, number>;
  method: 'equal' | 'income' | 'custom';
  custom: Record<string, number>;
  rules: Record<string, ShareRule>;
  categoryCustom: Record<string, Record<string, number>>;
  month: string;
};
export const toCents = (value: number | string | null | undefined) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const halfOf = (date: string): FinancePeriod => (Number(date.slice(8, 10)) <= 15 ? 'first' : 'second');
export const inPeriod = (date: string, month: string, period: FinancePeriod) =>
  date.slice(0, 7) === month.slice(0, 7) && (period === 'month' || halfOf(date) === period);
export function periodAmount(total: number | string, halves: HalfAmounts, period: FinancePeriod) {
  return period === 'month'
    ? toCents(total) / 100
    : toCents(period === 'first' ? halves.first_half_amount : halves.second_half_amount) / 100;
}
export function unallocated(total: number | string, halves: HalfAmounts) {
  return Math.max(0, toCents(total) - toCents(halves.first_half_amount) - toCents(halves.second_half_amount)) / 100;
}
export function validateHalves(total: number, first: string, second: string) {
  const a = first.trim() === '' ? null : incomeAmount(first),
    b = second.trim() === '' ? null : incomeAmount(second);
  if (toCents(a) + toCents(b) > toCents(total))
    throw new Error('Las dos quincenas no pueden superar el total mensual.');
  return {first_half_amount: a, second_half_amount: b};
}

// A partial plan never mixes fortnight salaries with monthly salaries in one ratio.
// Until all positive earners allocate this half, use the saved monthly plan/reference.
export function periodShares(context: ShareContext, period: FinancePeriod, categoryId: string | null = null) {
  const {members, plans, references, month} = context;
  const saved = new Map(plans.filter(p => p.month === month).map(p => [p.user_id, p]));
  const monthly = members.map(m => toCents(saved.get(m.user_id)?.expected_amount ?? references[m.user_id] ?? 0));
  const half = members.map(m => {
    const p = saved.get(m.user_id);
    return p ? (period === 'first' ? p.first_half_amount : p.second_half_amount) : null;
  });
  const complete = period !== 'month' && members.every((_, i) => monthly[i] === 0 || half[i] != null);
  const halfTotal = half.reduce<number>((sum, n) => sum + toCents(n), 0);
  const useHalf = complete && halfTotal > 0;
  const rule = categoryId ? context.rules[categoryId] : undefined;
  const method = rule && rule.split_method !== 'inherit' ? rule.split_method : context.method;
  let source: 'equal' | 'half' | 'monthly' | 'custom' | 'personal' =
    method === 'income' ? (useHalf ? 'half' : 'monthly') : method;
  let weights = members.map((m, i) =>
    method === 'income'
      ? useHalf
        ? toCents(half[i])
        : monthly[i]
      : method === 'custom'
        ? Math.max(
            0,
            Number(
              rule?.split_method === 'custom'
                ? context.categoryCustom[categoryId!]?.[m.user_id] || 0
                : context.custom[m.user_id] || 0
            )
          )
        : method === 'personal'
          ? m.user_id === (rule?.responsible_user_id || members[0]?.user_id)
            ? 1
            : 0
          : 1
  );
  let total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    weights = members.map(() => 1);
    total = members.length;
    source = 'equal';
  }
  return {
    method,
    source,
    fallback: method === 'income' && period !== 'month' && !useHalf,
    rows: members.map((m, i) => ({user_id: m.user_id, ratio: total ? weights[i] / total : 0}))
  };
}

// Largest remainder preserves every cent and never charges a zero-weight member.
export function splitCents(amount: number, ratios: {user_id: string; ratio: number}[]) {
  const cents = toCents(amount),
    rows = ratios.map((r, index) => ({
      ...r,
      index,
      cents: Math.floor(cents * r.ratio),
      fraction: cents * r.ratio - Math.floor(cents * r.ratio)
    }));
  let left = cents - rows.reduce((s, r) => s + r.cents, 0);
  for (const row of [...rows].sort((a, b) => b.fraction - a.fraction || a.user_id.localeCompare(b.user_id))) {
    if (left <= 0) break;
    if (row.ratio > 0) {
      row.cents++;
      left--;
    }
  }
  return rows.map(r => ({user_id: r.user_id, amount: r.cents / 100}));
}

type Movement = {
  id: string;
  amount: number | string;
  type: string;
  transaction_date: string;
  category_id: string | null;
  paid_by: string | null;
  is_shared: boolean;
};
type Saving = {amount: number | string; contribution_date: string};
type StoredSplit = {transaction_id: string; user_id: string; share_amount: number | string};
export function financePeriodSummary(
  month: string,
  period: FinancePeriod,
  members: IncomeMember[],
  plans: IncomePlan[],
  references: Record<string, number>,
  allocations: PeriodAllocation[],
  categories: {id: string; budget_group: string}[],
  movements: Movement[],
  savings: Saving[],
  splits: StoredSplit[],
  shares: ShareContext
) {
  const savedPlans = new Map(plans.filter(p => p.month === month).map(p => [p.user_id, p]));
  const txs = movements.filter(t => inPeriod(t.transaction_date, month, period)),
    savingRows = savings.filter(s => inPeriod(s.contribution_date, month, period));
  const personIncome = members.map(m => {
    const p = savedPlans.get(m.user_id),
      total = Number(p?.expected_amount ?? references[m.user_id] ?? 0);
    const expected = periodAmount(total, p || {}, period),
      received =
        txs.filter(t => t.type === 'income' && t.paid_by === m.user_id).reduce((s, t) => s + toCents(t.amount), 0) /
        100;
    return {...m, expected, received, pending: Math.max(0, toCents(expected) - toCents(received)) / 100};
  });
  const rows = allocations
    .filter(a => a.month === month)
    .map(a => {
      const group = categories.find(c => c.id === a.category_id)?.budget_group || 'variable',
        planned = periodAmount(a.planned_amount, a, period),
        actual =
          group === 'saving'
            ? 0
            : txs
                .filter(t => t.type === 'expense' && t.category_id === a.category_id)
                .reduce((s, t) => s + toCents(t.amount), 0) / 100;
      return {...a, group, planned, actual};
    });
  // An expense in a savings category is saving (same rule as the Home cash flow); the balance is unchanged.
  const savingCategory = new Set(categories.filter(c => c.budget_group === 'saving').map(c => c.id)),
    savedAsExpense = (t: Movement) =>
      t.type === 'expense' && Boolean(t.category_id) && savingCategory.has(t.category_id!);
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + toCents(t.amount), 0) / 100,
    expense =
      txs.filter(t => t.type === 'expense' && !savedAsExpense(t)).reduce((s, t) => s + toCents(t.amount), 0) / 100,
    saving =
      (savingRows.reduce((s, t) => s + toCents(t.amount), 0) +
        txs.filter(savedAsExpense).reduce((s, t) => s + toCents(t.amount), 0)) /
      100;
  const expected = personIncome.reduce((s, r) => s + toCents(r.expected), 0) / 100,
    budget = rows.filter(r => r.group !== 'saving').reduce((s, r) => s + toCents(r.planned), 0) / 100,
    savingPlan = rows.filter(r => r.group === 'saving').reduce((s, r) => s + toCents(r.planned), 0) / 100;
  const firstTx = movements.filter(t => inPeriod(t.transaction_date, month, 'first'));
  const carry =
    period === 'second'
      ? (firstTx.reduce((s, t) => s + (t.type === 'income' ? 1 : -1) * toCents(t.amount), 0) -
          savings
            .filter(s => inPeriod(s.contribution_date, month, 'first'))
            .reduce((s, r) => s + toCents(r.amount), 0)) /
        100
      : 0;
  const firstExpected = members.reduce((s, m) => s + toCents(savedPlans.get(m.user_id)?.first_half_amount), 0);
  const firstBudget = allocations.filter(a => a.month === month).reduce((s, a) => s + toCents(a.first_half_amount), 0);
  const planCarry = period === 'second' ? (firstExpected - firstBudget) / 100 : 0;
  const sharedIds = new Set(txs.filter(t => t.type === 'expense' && t.is_shared).map(t => t.id));
  const plannedShares = new Map(members.map(m => [m.user_id, 0]));
  // Monthly contributions equal the sum of both halves plus the unallocated remainder.
  for (const row of rows.filter(r => r.group !== 'saving')) {
    const portions = period === 'month' ? (['first', 'second', 'month'] as FinancePeriod[]) : [period];
    for (const part of portions) {
      const amount =
        period === 'month' && part === 'month'
          ? unallocated(row.planned_amount, row)
          : periodAmount(row.planned_amount, row, part);
      for (const share of splitCents(amount, periodShares(shares, part, row.category_id).rows))
        plannedShares.set(share.user_id, (plannedShares.get(share.user_id) || 0) + toCents(share.amount));
    }
  }
  const people = personIncome.map(m => {
    const paid =
        txs.filter(t => sharedIds.has(t.id) && t.paid_by === m.user_id).reduce((s, t) => s + toCents(t.amount), 0) /
        100,
      assigned =
        splits
          .filter(s => sharedIds.has(s.transaction_id) && s.user_id === m.user_id)
          .reduce((s, r) => s + toCents(r.share_amount), 0) / 100;
    return {
      ...m,
      planned: (plannedShares.get(m.user_id) || 0) / 100,
      paid,
      assigned,
      balance: (toCents(paid) - toCents(assigned)) / 100
    };
  });
  const assignedTotal = splits
      .filter(s => sharedIds.has(s.transaction_id))
      .reduce((s, r) => s + toCents(r.share_amount), 0),
    sharedExpense = txs.filter(t => sharedIds.has(t.id)).reduce((s, t) => s + toCents(t.amount), 0);
  return {
    income,
    expense,
    saving,
    expected,
    budget,
    savingPlan,
    carry,
    planCarry,
    balance: (toCents(income) - toCents(expense) - toCents(saving) + toCents(carry)) / 100,
    planBalance: (toCents(expected) - toCents(budget) - toCents(savingPlan) + toCents(planCarry)) / 100,
    people,
    rows,
    unassignedSplits: (sharedExpense - assignedTotal) / 100,
    unallocatedIncome:
      members.reduce((s, m) => {
        const p = savedPlans.get(m.user_id);
        return s + toCents(unallocated(p?.expected_amount ?? references[m.user_id] ?? 0, p || {}));
      }, 0) / 100,
    unallocatedBudget:
      allocations.filter(a => a.month === month).reduce((s, a) => s + toCents(unallocated(a.planned_amount, a)), 0) /
      100
  };
}
