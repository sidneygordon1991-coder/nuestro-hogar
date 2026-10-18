/**
 * Zero-based budget with rollover: every quetzal of expected income gets a job ("por asignar" reaches zero), and
 * what a category did not use in a month is added to the next one. Overspending is not carried as debt: it
 * shows as over budget in its own month.
 */
export type MonthSlice = {
  month: string;
  planned: Record<string, number | undefined>;
  spent: Record<string, number | undefined>;
};

const toCents = (n: unknown) => Math.round((Number(n) || 0) * 100);

/** Carry into `months[months.length - 1]`, chaining every earlier month (oldest first). */
export function rolloverCarry(months: MonthSlice[], categoryIds: string[]) {
  const carry: Record<string, number> = Object.fromEntries(categoryIds.map(id => [id, 0]));
  for (const m of months.slice(0, -1)) {
    for (const id of categoryIds) {
      const available = toCents(m.planned[id]) + carry[id];
      // A month with no plan for the category ends its chain: nothing was set aside there.
      carry[id] = m.planned[id] === undefined ? 0 : Math.max(0, available - toCents(m.spent[id]));
    }
  }
  return Object.fromEntries(categoryIds.map(id => [id, carry[id] / 100])) as Record<string, number>;
}

export function zeroBased(expectedIncome: number, planned: Record<string, number>, carry: Record<string, number> = {}) {
  const assigned = Object.values(planned).reduce((n, v) => n + toCents(v), 0);
  const toAssign = toCents(expectedIncome) - assigned;
  return {
    assigned: assigned / 100,
    toAssign: toAssign / 100,
    carried: Object.values(carry).reduce((n, v) => n + toCents(v), 0) / 100,
    state: toAssign === 0 ? 'balanced' : toAssign > 0 ? 'unassigned' : 'over'
  } as const;
}
