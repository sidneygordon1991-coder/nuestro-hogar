import type {buildCashFlow} from './cashFlow';
import {toCents} from './financePeriods';

type BudgetFlow = ReturnType<typeof buildCashFlow>;
type BalancedAccount = {account_type: string; account_class: string; balance: number; liquid?: boolean};

/**
 * A budget is a spending plan, not a bank balance.
 * Planned income is an estimate; income already received can replace an outdated, lower plan.
 * Credit-card purchases count as spending when recorded. Paying their debt by a transfer
 * does not create another budget expense.
 */
export function budgetAvailability(flow: BudgetFlow) {
  const received = toCents(flow.income);
  const expected = toCents(flow.incomePlan.expected);
  const income = Math.max(expected, received);
  const expenses = toCents(flow.budgetExpense);
  const savings = toCents(flow.saving);
  const commitments = Math.max(0, toCents(flow.fixedCommitments));
  const savingsPending = Math.max(0, toCents(flow.savingsRemaining));
  const available = income - expenses - savings - commitments - savingsPending;

  return {
    income: income / 100,
    received: received / 100,
    expected: expected / 100,
    incomePending: Math.max(0, income - received) / 100,
    expenses: expenses / 100,
    savings: savings / 100,
    commitments: commitments / 100,
    savingsPending: savingsPending / 100,
    spentOrReserved: (expenses + savings + commitments + savingsPending) / 100,
    available: available / 100,
    estimated: expected > received
  };
}

/**
 * Actual money location is determined only from account ledger balances.
 * Bank and cash balances must not be reduced by budget allocations or unpaid card charges.
 */
export function accountLiquidity(rows: BalancedAccount[]) {
  const active = rows.filter(a => a.account_class === 'asset' && a.liquid !== false);
  const banks = active
    .filter(a => a.account_type === 'checking' || a.account_type === 'savings')
    .reduce((sum, a) => sum + toCents(a.balance), 0);
  const cash = active.filter(a => a.account_type === 'cash').reduce((sum, a) => sum + toCents(a.balance), 0);
  return {banks: banks / 100, cash: cash / 100, total: (banks + cash) / 100};
}
