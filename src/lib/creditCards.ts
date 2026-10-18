import {toCents} from './financePeriods';
import {
  dayDiff,
  overviewAccounts,
  type AccountMovement,
  type AccountTransfer,
  type OverviewAccount
} from './homeOverview';
import {occurrenceDetails} from './recurringDetails';
import type {CashFlowSource} from './cashFlow';
import {billedThisMonth, unbilledForCard, type InstallmentPlan} from './installments';

export type CardAccount = OverviewAccount & {
  statement_day?: number | null;
  payment_due_day?: number | null;
  minimum_payment?: number | string | null;
  credit_limit?: number | string | null;
  apr?: number | string | null;
};
export type CardStatus = {
  id: string;
  name: string;
  balance: number;
  statementDate: string | null;
  statementBalance: number | null;
  paidSinceStatement: number;
  toAvoidInterest: number;
  minimum: number | null;
  dueDate: string | null;
  daysToDue: number | null;
  available: number | null;
  utilization: number | null;
  /** Visacuotas/extrafinanciamiento in the balance that later statements will bill. */
  installmentsPending: number;
  /** Installments billed this month (principal plus interest). */
  installmentsThisMonth: number;
  state: 'clear' | 'due' | 'soon' | 'overdue';
};

/** Only the amount of a named, pending card payment is already reserved. A generic "Pago tarjeta" cannot clear every card. */
export function unreservedCardPayments(
  cards: Pick<CardStatus, 'id' | 'name' | 'toAvoidInterest' | 'dueDate'>[],
  source: CashFlowSource,
  monthEnd: string
) {
  const due = cards.filter(c => c.toAvoidInterest > 0 && (!c.dueDate || c.dueDate <= monthEnd));
  const remaining = new Map(due.map(c => [c.id, toCents(c.toAvoidInterest)]));
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const recurring = new Map(source.recurring.map(r => [r.id, r])),
    actual = new Set(source.transactions.map(t => t.id));
  for (const o of source.occurrences) {
    const r = recurring.get(o.recurring_transaction_id);
    if (
      !r ||
      r.active === false ||
      o.status !== 'pending' ||
      o.due_date > monthEnd ||
      (o.transaction_id && actual.has(o.transaction_id))
    )
      continue;
    const terms = occurrenceDetails(r, o.details_snapshot),
      text = normalize(terms.description);
    if (terms.type !== 'expense' || !/(^| )(pago|abono)( |$)/.test(text)) continue;
    const matches = due.filter(
      c =>
        terms.account_id !== c.id &&
        normalize(c.name).length > 2 &&
        (' ' + text + ' ').includes(' ' + normalize(c.name) + ' ')
    );
    // Ambiguous descriptions have no reliable account link: leave the card commitment visible.
    if (matches.length !== 1) continue;
    const id = matches[0].id;
    remaining.set(id, Math.max(0, remaining.get(id)! - Math.max(0, toCents(terms.amount))));
  }
  return [...remaining.values()].reduce((sum, n) => sum + n, 0) / 100;
}

const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
const dateOf = (y: number, m: number, day: number) => {
  while (m < 1) {
    m += 12;
    y--;
  }
  while (m > 12) {
    m -= 12;
    y++;
  }
  return y + '-' + String(m).padStart(2, '0') + '-' + String(Math.min(day, lastDay(y, m))).padStart(2, '0');
};

/** Most recent statement cut on or before today (days beyond the month's end fall on its last day). */
export function lastStatementDate(statementDay: number, today: string) {
  const y = Number(today.slice(0, 4)),
    m = Number(today.slice(5, 7));
  const thisMonth = dateOf(y, m, statementDay);
  return thisMonth <= today ? thisMonth : dateOf(y, m - 1, statementDay);
}
/** First payment due date strictly after a statement cut. */
export function dueAfter(statement: string, dueDay: number) {
  const y = Number(statement.slice(0, 4)),
    m = Number(statement.slice(5, 7));
  const same = dateOf(y, m, dueDay);
  return same > statement ? same : dateOf(y, m + 1, dueDay);
}
/** Next due date on or after today when no statement day is configured. */
export function nextDue(dueDay: number, today: string) {
  const y = Number(today.slice(0, 4)),
    m = Number(today.slice(5, 7));
  const d = dateOf(y, m, dueDay);
  return d >= today ? d : dateOf(y, m + 1, dueDay);
}

/**
 * What to pay on each credit card. With a statement day: the statement balance minus payments made since the cut
 * avoids interest. Without it, the whole current balance is the safe amount. Never invents a minimum payment.
 * Visacuotas and extrafinanciamiento sit in the balance in full, but each statement bills only its installment:
 * the part not billed yet is not due.
 */
export function creditCardStatus(
  cards: CardAccount[],
  movements: AccountMovement[],
  transfers: AccountTransfer[],
  today: string,
  installments: InstallmentPlan[] = []
): CardStatus[] {
  return cards
    .filter(c => c.account_type === 'credit' && c.account_class === 'liability' && c.active !== false)
    .map(card => {
      const balance = overviewAccounts([card], movements, transfers, today)[0].balance;
      const statementDate = card.statement_day ? lastStatementDate(Number(card.statement_day), today) : null;
      const statementBalance = statementDate
        ? overviewAccounts([card], movements, transfers, statementDate)[0].balance
        : null;
      let paid = 0;
      if (statementDate) {
        for (const t of transfers)
          if (t.to_account_id === card.id && t.transfer_date > statementDate && t.transfer_date <= today)
            paid += toCents(t.amount);
        for (const t of movements)
          if (
            t.account_id === card.id &&
            t.type === 'income' &&
            t.transaction_date > statementDate &&
            t.transaction_date <= today
          )
            paid += toCents(t.amount);
      }
      const deferred = toCents(
        statementDate
          ? unbilledForCard(installments, card.id, statementDate)
          : unbilledForCard(installments, card.id, today, {statement: false})
      );
      const owed =
        statementBalance === null
          ? Math.max(0, toCents(balance) - deferred)
          : Math.max(0, toCents(statementBalance) - deferred - paid);
      const dueDate = card.payment_due_day
        ? statementDate
          ? dueAfter(statementDate, Number(card.payment_due_day))
          : nextDue(Number(card.payment_due_day), today)
        : null;
      // A due date already passed with money still owed for that statement is overdue.
      const daysToDue = dueDate ? dayDiff(today, dueDate) : null;
      const limit = Number(card.credit_limit) > 0 ? Number(card.credit_limit) : null;
      const state: CardStatus['state'] =
        owed === 0
          ? 'clear'
          : daysToDue !== null && daysToDue < 0
            ? 'overdue'
            : daysToDue !== null && daysToDue <= 3
              ? 'soon'
              : 'due';
      const minimum = Number(card.minimum_payment) > 0 ? Math.min(Number(card.minimum_payment), owed / 100) : null;
      return {
        id: card.id,
        name: card.name,
        balance,
        statementDate,
        statementBalance,
        paidSinceStatement: paid / 100,
        toAvoidInterest: owed / 100,
        minimum,
        dueDate,
        daysToDue,
        available: limit === null ? null : Math.max(0, toCents(limit) - Math.max(0, toCents(balance))) / 100,
        utilization: limit === null ? null : Math.round(Math.max(0, Math.min(100, (balance / limit) * 100)) * 10) / 10,
        installmentsPending: unbilledForCard(installments, card.id, today, {statement: false}),
        installmentsThisMonth: billedThisMonth(installments, card.id, today.slice(0, 7)),
        state
      };
    });
}
