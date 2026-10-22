type Choice = {category: string; account: string};
type Preferences = Partial<Record<'expense' | 'income', Choice>>;
const key = (user: string, household: string) => 'nh:quick-choices:' + user + ':' + household;

/** Remember only successful choices, scoped to both the user and the household. */
export function readQuickChoices(user: string, household: string): Preferences {
  if (!user || !household) return {};
  try {
    const raw = JSON.parse(localStorage.getItem(key(user, household)) || '{}');
    const result: Preferences = {};
    for (const type of ['expense', 'income'] as const) {
      const value = raw?.[type];
      if (value && typeof value.category === 'string' && typeof value.account === 'string')
        result[type] = {category: value.category, account: value.account};
    }
    return result;
  } catch {
    return {};
  }
}

export function rememberQuickChoices(user: string, household: string, type: 'expense' | 'income', choice: Choice) {
  if (!user || !household) return;
  try {
    localStorage.setItem(key(user, household), JSON.stringify({...readQuickChoices(user, household), [type]: choice}));
  } catch {
    // Preferences cannot make a confirmed transaction appear to fail.
  }
}
