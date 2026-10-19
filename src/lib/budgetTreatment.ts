/** Historical rows without this flag remain included. Funding source never silently changes a budget. */
export type BudgetTreatment = {budget_included?: boolean | null};
export const countsInBudget = (row: BudgetTreatment) => row.budget_included !== false;
