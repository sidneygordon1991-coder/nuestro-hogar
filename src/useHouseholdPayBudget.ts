import {useEffect, useMemo, useState} from 'react';
import {supabase} from './lib/supabase';
import {fetchAllRows} from './lib/paging';
import {
  payWindowAt,
  DEFAULT_HOUSEHOLD_CUTOFFS,
  normalizedHouseholdCutoffs,
  type HouseholdCutoffs
} from './lib/householdPayPeriod';
import {scopeSource, type FinanceScope, type HomeFinance} from './lib/homeOverview';
import type {CashFlowSource} from './lib/cashFlow';

type CycleData = {
  scope: string;
  source: CashFlowSource;
  splits: {transaction_id: string; user_id: string; share_amount: number}[];
};
/** Read only; no changes to financial data. This hook never assumes an incomplete cycle is a zero balance. */
export function useHouseholdPayBudget({
  householdId,
  userId,
  scope,
  finance
}: {
  householdId: string;
  userId: string;
  scope: FinanceScope;
  finance: HomeFinance;
}) {
  const fullSource = finance.source!;
  const [settings, setSettings] = useState<{
    householdId: string;
    cutoffs: HouseholdCutoffs;
    loading: boolean;
    error: string;
  }>({
    householdId,
    cutoffs: DEFAULT_HOUSEHOLD_CUTOFFS,
    loading: true,
    error: ''
  });
  useEffect(() => {
    let active = true;
    setSettings({householdId, cutoffs: DEFAULT_HOUSEHOLD_CUTOFFS, loading: true, error: ''});
    supabase
      .from('finance_household_settings')
      .select('first_cutoff_day,second_cutoff_day')
      .eq('household_id', householdId)
      .maybeSingle()
      .then(({data, error}) => {
        if (!active) return;
        setSettings({
          householdId,
          cutoffs: normalizedHouseholdCutoffs(error ? null : data),
          loading: false,
          error: error ? 'No se pudo leer la configuración de quincenas.' : ''
        });
      });
    return () => {
      active = false;
    };
  }, [householdId]);

  const cutoffs = settings.householdId === householdId ? settings.cutoffs : DEFAULT_HOUSEHOLD_CUTOFFS;
  const loadingSettings = settings.householdId !== householdId || settings.loading;
  const window = useMemo(
    () => payWindowAt(fullSource.today, cutoffs),
    [fullSource.today, cutoffs.first_cutoff_day, cutoffs.second_cutoff_day]
  );
  const needsCrossMonth =
    window.month !== fullSource.month || window.start.slice(0, 7) !== fullSource.month.slice(0, 7);
  const cycleScope = [householdId, window.month, window.start, fullSource.today].join(':');
  const [data, setData] = useState<CycleData | null>(null);
  const [crossLoading, setCrossLoading] = useState(false);
  const [crossError, setCrossError] = useState('');

  useEffect(() => {
    if (loadingSettings || !needsCrossMonth) return;
    let active = true;
    setData(null);
    setCrossError('');
    setCrossLoading(true);
    (async () => {
      try {
        const [transactions, savings, allocationsResult, plansResult, occurrencesResult] = await Promise.all([
          fetchAllRows((from, to) =>
            supabase
              .from('transactions')
              .select(
                'id,description,amount,type,transaction_date,category_id,paid_by,account_id,is_shared,budget_included'
              )
              .eq('household_id', householdId)
              .gte('transaction_date', window.start)
              .lte('transaction_date', fullSource.today)
              .order('id')
              .range(from, to)
          ),
          fetchAllRows((from, to) =>
            supabase
              .from('goal_contributions')
              .select('amount,contribution_date,created_by')
              .eq('household_id', householdId)
              .gte('contribution_date', window.start)
              .lte('contribution_date', fullSource.today)
              .order('id')
              .range(from, to)
          ),
          supabase
            .from('budget_allocations')
            .select('category_id,planned_amount,month,first_half_amount,second_half_amount')
            .eq('household_id', householdId)
            .eq('month', window.month),
          supabase
            .from('finance_income_plans')
            .select('user_id,month,expected_amount,first_half_amount,second_half_amount')
            .eq('household_id', householdId)
            .eq('month', window.month),
          supabase
            .from('recurring_transaction_occurrences')
            .select('id,recurring_transaction_id,due_date,status,transaction_id,details_snapshot')
            .eq('household_id', householdId)
            .gte('due_date', window.start)
            .lte('due_date', window.end)
        ]);
        if (allocationsResult.error || plansResult.error || occurrencesResult.error)
          throw allocationsResult.error || plansResult.error || occurrencesResult.error;
        const splits: CycleData['splits'] = [];
        for (let i = 0; i < transactions.length; i += 100) {
          const ids = transactions.slice(i, i + 100).map(t => t.id);
          if (!ids.length) continue;
          const chunk = await fetchAllRows<CycleData['splits'][number]>((from, to) =>
            supabase
              .from('transaction_splits')
              .select('transaction_id,user_id,share_amount')
              .eq('household_id', householdId)
              .in('transaction_id', ids)
              .order('transaction_id')
              .range(from, to)
          );
          splits.push(...chunk);
        }
        if (!active) return;
        setData({
          scope: cycleScope,
          source: {
            ...fullSource,
            month: window.month,
            periodRange: {start: window.start, end: window.end},
            transactions,
            savings,
            allocations: allocationsResult.data || [],
            plans: plansResult.data || [],
            occurrences: occurrencesResult.data || []
          },
          splits
        });
        setCrossError('');
      } catch {
        if (active) setCrossError('No pudimos verificar los movimientos de la quincena que cruza de mes.');
      } finally {
        if (active) setCrossLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [householdId, cycleScope, needsCrossMonth, loadingSettings, fullSource]);

  const available = !loadingSettings && (!needsCrossMonth || (data?.scope === cycleScope && !crossLoading));
  const periodSource = available
    ? scopeSource(
        needsCrossMonth ? data!.source : {...fullSource, periodRange: {start: window.start, end: window.end}},
        scope,
        userId,
        finance.privateEntries || [],
        needsCrossMonth ? data!.splits : finance.splits || []
      )
    : null;
  return {
    cutoffs,
    window,
    source: periodSource,
    loading: loadingSettings || (needsCrossMonth && !available && !crossError),
    error: settings.error || crossError,
    customized: cutoffs.first_cutoff_day !== 15 || cutoffs.second_cutoff_day !== 31
  };
}
