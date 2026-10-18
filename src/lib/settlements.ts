import {toCents} from './financePeriods';

export type Settlement = {from_user_id: string; to_user_id: string; amount: number | string};
export type MemberFlow = {user_id: string; paid: number; assigned: number};
export type SettlementSummary = {
  balances: {user_id: string; balance: number}[];
  suggestions: {from_user_id: string; to_user_id: string; amount: number}[];
};

/**
 * Balance per member for shared expenses: what they paid minus what was assigned to them, adjusted by
 * payments already recorded between members (paying moves your balance up, receiving moves it down).
 * Suggestions settle everything with the fewest transfers (largest debtor pays largest creditor first).
 */
export function settlementSummary(members: MemberFlow[], settlements: Settlement[]): SettlementSummary {
  const cents = new Map(members.map(m => [m.user_id, toCents(m.paid) - toCents(m.assigned)]));
  for (const s of settlements) {
    if (!cents.has(s.from_user_id) || !cents.has(s.to_user_id)) continue;
    cents.set(s.from_user_id, cents.get(s.from_user_id)! + toCents(s.amount));
    cents.set(s.to_user_id, cents.get(s.to_user_id)! - toCents(s.amount));
  }
  const balances = members.map(m => ({user_id: m.user_id, balance: cents.get(m.user_id)! / 100}));
  const debtors = members
    .map(m => ({id: m.user_id, v: -cents.get(m.user_id)!}))
    .filter(x => x.v > 0)
    .sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  const creditors = members
    .map(m => ({id: m.user_id, v: cents.get(m.user_id)!}))
    .filter(x => x.v > 0)
    .sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  const suggestions: SettlementSummary['suggestions'] = [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    if (amount > 0) suggestions.push({from_user_id: debtors[i].id, to_user_id: creditors[j].id, amount: amount / 100});
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return {balances, suggestions};
}

/** Paid and assigned shared expenses per member from stored splits. Only shared expenses take part. */
export function memberFlows(
  memberIds: string[],
  transactions: {
    id: string;
    type: string;
    amount: number | string;
    paid_by: string | null;
    is_shared?: boolean | null;
  }[],
  splits: {transaction_id: string; user_id: string; share_amount: number | string}[]
): MemberFlow[] {
  const shared = new Map(transactions.filter(t => t.type === 'expense' && t.is_shared !== false).map(t => [t.id, t]));
  return memberIds.map(id => ({
    user_id: id,
    paid:
      [...shared.values()]
        .filter(t => t.paid_by === id && splits.some(s => s.transaction_id === t.id))
        .reduce((n, t) => n + toCents(t.amount), 0) / 100,
    assigned:
      splits
        .filter(s => s.user_id === id && shared.has(s.transaction_id))
        .reduce((n, s) => n + toCents(s.share_amount), 0) / 100
  }));
}
