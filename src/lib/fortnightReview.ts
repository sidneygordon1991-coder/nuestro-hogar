import {occurrenceDetails, type OccurrenceDetails} from './recurringDetails';
import {financePeriodSummary, inPeriod, toCents, type PeriodAllocation, type ShareContext} from './financePeriods';
import type {IncomePlan, IncomeMember} from './monthlyIncome';
import {formatMoney} from './money';

export type ReviewHalf = 'first' | 'second';
type Movement = Parameters<typeof financePeriodSummary>[7][number] & {description?: string};
type Occurrence = {
  id: string;
  recurring_transaction_id: string;
  due_date: string;
  status: 'pending' | 'paid' | 'skipped';
  transaction_id: string | null;
  details_snapshot?: OccurrenceDetails;
};
type Recurring = {
  id: string;
  description: string;
  amount: number | string;
  type: 'income' | 'expense';
  active?: boolean;
  due_day?: number;
  created_at?: string;
};
export type ReviewSource = {
  members: IncomeMember[];
  income_plans: IncomePlan[];
  allocations: PeriodAllocation[];
  categories: {id: string; name: string; budget_group: string}[];
  transactions: Movement[];
  savings: Parameters<typeof financePeriodSummary>[8];
  splits: Parameters<typeof financePeriodSummary>[9];
  settings: {split_method: ShareContext['method']} | null;
  member_settings: {user_id: string; monthly_income: number | string; custom_share_percent: number | string}[];
  category_settings: {
    category_id: string;
    split_method: ShareContext['rules'][string]['split_method'];
    responsible_user_id?: string;
  }[];
  category_member_settings: {category_id: string; user_id: string; custom_share_percent: number | string}[];
  recurring: Recurring[];
  occurrences: Occurrence[];
};
export type ReviewRecord = {
  household_id: string;
  month: string;
  period: ReviewHalf;
  source_fingerprint: string;
  snapshot: ReviewSnapshot;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string;
};
export type ReviewEnvelope = {
  source: ReviewSource;
  fingerprint: string;
  server_date: string;
  review: ReviewRecord | null;
};
export type ReviewIssue = {
  id: string;
  text: string;
  action: 'income' | 'payments' | 'movements' | 'budget' | 'rules' | null;
};
export type ReviewSnapshot = {
  schema_version: 1;
  month: string;
  period: ReviewHalf;
  start: string;
  end: string;
  financial: {
    expected: number;
    income: number;
    budget: number;
    expense: number;
    saving_plan: number;
    saving: number;
    carry: number;
    balance: number;
    pending_income: number;
    pending_payments: number;
  };
  people: {
    user_id: string;
    full_name: string;
    expected: number;
    received: number;
    pending: number;
    planned: number;
    paid: number;
    assigned: number;
    balance: number;
  }[];
  payments: {id: string; description: string; amount: number; due_date: string; type: string; status: string}[];
  settlements: {from_id: string; from: string; to_id: string; to: string; amount: number}[];
  issues: ReviewIssue[];
};
export function reviewBounds(month: string, period: ReviewHalf) {
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return {
    start: month.slice(0, 7) + (period === 'first' ? '-01' : '-16'),
    end: month.slice(0, 7) + (period === 'first' ? '-15' : '-' + last)
  };
}
export function reviewIsEnded(month: string, period: ReviewHalf, today: string) {
  return reviewBounds(month, period).end < today;
}

export function buildFortnightReview(month: string, period: ReviewHalf, source: ReviewSource): ReviewSnapshot {
  const refs = Object.fromEntries(source.member_settings.map(r => [r.user_id, Number(r.monthly_income)]));
  const custom = Object.fromEntries(source.member_settings.map(r => [r.user_id, Number(r.custom_share_percent)]));
  const categoryCustom: ShareContext['categoryCustom'] = {};
  for (const row of source.category_member_settings) {
    (categoryCustom[row.category_id] ??= {})[row.user_id] = Number(row.custom_share_percent);
  }
  const context: ShareContext = {
    month,
    members: source.members,
    plans: source.income_plans,
    references: refs,
    method: source.settings?.split_method || 'equal',
    custom,
    rules: Object.fromEntries(source.category_settings.map(r => [r.category_id, r])),
    categoryCustom
  };
  const summary = financePeriodSummary(
    month,
    period,
    source.members,
    source.income_plans,
    refs,
    source.allocations,
    source.categories,
    source.transactions,
    source.savings,
    source.splits,
    context
  );
  const txs = source.transactions.filter(t => inPeriod(t.transaction_date, month, period)),
    memberIds = new Set(source.members.map(m => m.user_id));
  const payments = source.occurrences
    .filter(o => inPeriod(o.due_date, month, period))
    .map(o => {
      const template = source.recurring.find(r => r.id === o.recurring_transaction_id),
        r = template ? occurrenceDetails(template, o.details_snapshot) : undefined;
      return {
        id: o.id,
        description: r?.description || 'Compromiso sin detalle disponible',
        amount: Number(r?.amount || 0),
        due_date: o.due_date,
        type: r?.type || 'unknown',
        status: o.status
      };
    });
  const pending = payments.filter(p => p.status === 'pending' && p.type === 'expense');
  const pendingIncome = summary.people.reduce((s, p) => s + toCents(p.pending), 0) / 100;
  const issues: ReviewIssue[] = [];
  const last = Number(reviewBounds(month, 'second').end.slice(8, 10));
  const missingOccurrences = source.recurring.some(r => {
    if (!r.active || !r.due_day) return false;
    const due = month.slice(0, 7) + '-' + String(Math.min(last, Math.max(1, r.due_day))).padStart(2, '0');
    return (
      inPeriod(due, month, period) &&
      (!r.created_at || r.created_at.slice(0, 10) <= due) &&
      !source.occurrences.some(o => o.recurring_transaction_id === r.id && inPeriod(o.due_date, month, period))
    );
  });
  if (missingOccurrences)
    issues.push({
      id: 'missing-occurrences',
      text: 'Hay pagos recurrentes configurados sin un vencimiento generado para esta quincena. Su importe no se incluye en los pendientes hasta verificarlo.',
      action: 'payments'
    });
  if (pendingIncome > 0)
    issues.push({id: 'income-pending', text: 'Quedan ingresos esperados sin registrar por persona.', action: 'income'});
  if (pending.length)
    issues.push({
      id: 'payments-pending',
      text: 'Quedan pagos recurrentes pendientes en esta quincena.',
      action: 'payments'
    });
  if (payments.some(p => p.type === 'unknown'))
    issues.push({id: 'payments-unknown', text: 'Hay compromisos cuyo detalle no está disponible.', action: 'payments'});
  if (payments.some(p => p.status === 'pending' && p.type === 'income'))
    issues.push({
      id: 'recurring-income-pending',
      text: 'Hay cobros recurrentes pendientes. Revisa si corresponden al ingreso esperado para evitar registrarlos dos veces.',
      action: 'payments'
    });
  if (summary.unallocatedIncome > 0 || summary.unallocatedBudget > 0)
    issues.push({
      id: 'unallocated',
      text: 'Hay ingresos o presupuesto mensual pendientes de distribuir entre quincenas.',
      action: 'budget'
    });
  const unattributed = txs.some(t => t.type === 'income' && (!t.paid_by || !memberIds.has(t.paid_by)));
  if (unattributed)
    issues.push({
      id: 'unattributed-income',
      text: 'Hay ingresos sin un integrante actual asociado. El total recibido sí los incluye.',
      action: 'movements'
    });
  // Check each transaction: two opposite allocation errors must not cancel out.
  const shared = txs.filter(t => t.type === 'expense' && t.is_shared);
  const invalidSplits = shared.some(t => {
    const splits = source.splits.filter(s => s.transaction_id === t.id);
    return (
      toCents(t.amount) !== splits.reduce((s, r) => s + toCents(r.share_amount), 0) ||
      splits.some(s => !memberIds.has(s.user_id) || toCents(s.share_amount) < 0) ||
      !t.paid_by ||
      !memberIds.has(t.paid_by)
    );
  });
  if (invalidSplits)
    issues.push({
      id: 'splits-incomplete',
      text: 'Hay gastos compartidos con repartos incompletos o personas que ya no están en el hogar. Revisa los movimientos antes de equilibrar aportes.',
      action: 'movements'
    });
  if (summary.balance < 0)
    issues.push({
      id: 'negative-balance',
      text: 'El saldo real es negativo; se necesita cubrir la diferencia.',
      action: null
    });
  if (summary.expense > summary.budget)
    issues.push({
      id: 'over-budget',
      text: 'El gasto registrado supera el presupuesto asignado a esta quincena.',
      action: 'budget'
    });
  const settlements: ReviewSnapshot['settlements'] = [];
  if (!invalidSplits) {
    const debtors = summary.people
      .filter(p => toCents(p.balance) < 0)
      .map(p => ({...p, left: -toCents(p.balance)}))
      .sort((a, b) => a.user_id.localeCompare(b.user_id));
    const creditors = summary.people
      .filter(p => toCents(p.balance) > 0)
      .map(p => ({...p, left: toCents(p.balance)}))
      .sort((a, b) => a.user_id.localeCompare(b.user_id));
    for (const debtor of debtors)
      for (const creditor of creditors) {
        const amount = Math.min(debtor.left, creditor.left);
        if (amount > 0) {
          settlements.push({
            from_id: debtor.user_id,
            from: debtor.full_name,
            to_id: creditor.user_id,
            to: creditor.full_name,
            amount: amount / 100
          });
          debtor.left -= amount;
          creditor.left -= amount;
        }
      }
  }
  return {
    schema_version: 1,
    month,
    period,
    ...reviewBounds(month, period),
    financial: {
      expected: summary.expected,
      income: summary.income,
      budget: summary.budget,
      expense: summary.expense,
      saving_plan: summary.savingPlan,
      saving: summary.saving,
      carry: summary.carry,
      balance: summary.balance,
      pending_income: pendingIncome,
      pending_payments: pending.reduce((s, p) => s + toCents(p.amount), 0) / 100
    },
    people: summary.people,
    payments,
    settlements,
    issues
  };
}
export const reviewMoney = formatMoney;
export function reviewText(snapshot: ReviewSnapshot, householdName: string, notes: string, reviewed: boolean) {
  const f = snapshot.financial;
  return [
    `${reviewed ? 'Revisión guardada' : 'Vista previa'} · ${householdName}`,
    `${snapshot.period === 'first' ? 'Primera' : 'Segunda'} quincena · ${snapshot.start} al ${snapshot.end}`,
    `Esperado: ${reviewMoney(f.expected)} | Recibido: ${reviewMoney(f.income)}`,
    `Presupuesto de gastos: ${reviewMoney(f.budget)} | Gastado: ${reviewMoney(f.expense)}`,
    `Ahorro: ${reviewMoney(f.saving)} | Arrastre real: ${reviewMoney(f.carry)} | Saldo real: ${reviewMoney(f.balance)}`,
    `Ingreso esperado pendiente: ${reviewMoney(f.pending_income)} | Pagos pendientes: ${reviewMoney(f.pending_payments)}`,
    ...snapshot.people.map(
      p =>
        `${p.full_name}: pagó ${reviewMoney(p.paid)} | asignado ${reviewMoney(p.assigned)} | balance ${reviewMoney(p.balance)}`
    ),
    ...(snapshot.settlements.length
      ? [
          'Para equilibrar gastos compartidos (sugerencias, sin registrar pagos):',
          ...snapshot.settlements.map(s => `${s.from} → ${s.to}: ${reviewMoney(s.amount)}`)
        ]
      : []),
    ...(snapshot.issues.length
      ? ['Puntos por atender:', ...snapshot.issues.map(i => '• ' + i.text)]
      : ['Sin diferencias detectadas en los datos revisados.']),
    ...(notes.trim() ? ['Nota para el siguiente período: ' + notes.trim()] : [])
  ].join('\n');
}
