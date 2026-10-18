export const financeSections = [
  'summary',
  'fortnight',
  'income',
  'budget',
  'transactions',
  'recurring',
  'comparison',
  'contributions',
  'goals',
  'networth',
  'accounts'
] as const;
export type FinanceSection = (typeof financeSections)[number];
export function financeSection(value: string | null | undefined): FinanceSection {
  return financeSections.includes(value as FinanceSection) ? (value as FinanceSection) : 'summary';
}
