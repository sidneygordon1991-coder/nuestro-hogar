// Finance workspace: all data, derived values and actions of the Finance module, shared with its sections by context.
import {type GoalLink} from '../lib/connectedFinance';
import {buildCashFlow} from '../lib/cashFlow';
import {occurrenceDetails, recurringTerms} from '../lib/recurringDetails';
import {financeSection, type FinanceSection} from '../lib/financeNavigation';
import {
  toCents,
  financePeriodSummary,
  periodShares,
  splitCents,
  validateHalves,
  type ShareContext
} from '../lib/financePeriods';
import {incomeAmount, monthlyIncomeSummary, type IncomePlan, type PayDays} from '../lib/monthlyIncome';
import {FormEvent, useEffect, useMemo, useRef, useState} from 'react';
import {supabase} from '../lib/supabase';
import {formatMoney} from '../lib/money';
import {fetchAllRows, pagedResult} from '../lib/paging';
import {usdAccountBalance, usdRate, usdToQuetzales} from '../lib/currency';
import {installmentPayment, type InstallmentKind, type InstallmentPlan} from '../lib/installments';
import {creditCardStatus} from '../lib/creditCards';
import {
  type BudgetGroup,
  type Category,
  type Tx,
  type Allocation,
  type Goal,
  type Contribution,
  type Recurring,
  type RecurringOccurrence,
  type AccountClass,
  type Account,
  type Transfer,
  type FinanceAsset,
  type NetWorthSnapshot,
  type Member,
  type Split,
  type SplitMethod,
  type MemberFinanceDraft,
  type CategoryRuleMethod,
  type CategoryRuleDraft,
  type HistoryTx,
  type HistoryContribution,
  type HistoryAllocation,
  type MonthMetric,
  isoDate
} from '../FinanceParts';
import {monthDate, monthBounds, monthLabel, LOAD_ERROR, entryAmount} from './shared';
import type {Household} from '../FinanceParts';
import {createContext, useContext} from 'react';

export function useFinanceWorkspace({household, readOnly = false}: {household: Household; readOnly?: boolean}) {
  const [connectedEnabled, setConnectedEnabled] = useState(false),
    [goalLinks, setGoalLinks] = useState<GoalLink[] | null>(null),
    [reconciling, setReconciling] = useState<Account | null>(null);
  useEffect(() => {
    let live = true;
    setConnectedEnabled(false);
    setGoalLinks(null);
    supabase.rpc('get_connected_finance_capability', {p_household_id: household.id}).then(({data, error}) => {
      if (live) setConnectedEnabled(!error && data === true);
    });
    return () => {
      live = false;
    };
  }, [household.id]);
  const [tab, setTabState] = useState<FinanceSection>(() =>
    financeSection(new URLSearchParams(window.location.search).get('finance'))
  );
  function setTab(next: FinanceSection) {
    setTabState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('finance', next);
    window.history.replaceState({}, '', url);
    window.dispatchEvent(new Event('nh:finance-section'));
  }
  useEffect(() => {
    const restore = () => setTabState(financeSection(new URLSearchParams(window.location.search).get('finance')));
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const [editingContribution, setEditingContribution] = useState<Contribution | null>(null),
    [editingRecurring, setEditingRecurring] = useState<Recurring | null>(null),
    [removing, setRemoving] = useState<
      {kind: 'contribution'; row: Contribution} | {kind: 'recurring'; row: Recurring} | null
    >(null),
    [managementError, setManagementError] = useState('');
  const [contributionGoal, setContributionGoal] = useState('all'),
    [contributionPeriod, setContributionPeriod] = useState('month'),
    [contributionLimit, setContributionLimit] = useState(20);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null),
    [transactionQuery, setTransactionQuery] = useState(''),
    [transactionType, setTransactionType] = useState('all');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [summaryError, setSummaryError] = useState(false),
    [ledgerEnabled, setLedgerEnabled] = useState(false),
    [savingsEntry, setSavingsEntry] = useState<{goal: Goal; direction: 'deposit' | 'withdrawal'} | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [accountDataError, setAccountDataError] = useState(false),
    [assetDataError, setAssetDataError] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]),
    [txs, setTxs] = useState<Tx[]>([]),
    [allocations, setAllocations] = useState<Allocation[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]),
    [contributions, setContributions] = useState<Contribution[]>([]),
    [recurring, setRecurring] = useState<Recurring[]>([]),
    [occurrences, setOccurrences] = useState<RecurringOccurrence[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]),
    [accountTxs, setAccountTxs] = useState<
      {
        account_id: string | null;
        type: string;
        amount: number;
        transaction_date: string;
        original_currency?: string | null;
        original_amount?: number | null;
      }[]
    >([]);
  // v33 Guatemala: dollar accounts and card installments load on their own, so a server without the
  // 20261018140000 migration keeps every other finance screen working.
  const [accountCurrency, setAccountCurrency] = useState<
      Record<string, {currency: string; opening_balance_usd: number | null}>
    >({}),
    [installments, setInstallments] = useState<InstallmentPlan[]>([]),
    [guatemalaReady, setGuatemalaReady] = useState(false),
    [currencyReady, setCurrencyReady] = useState(false),
    [installmentsError, setInstallmentsError] = useState(false),
    [currencyLoading, setCurrencyLoading] = useState(true),
    [currencyError, setCurrencyError] = useState(false),
    [extrasVersion, setExtrasVersion] = useState(0),
    [installmentCard, setInstallmentCard] = useState<Account | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]),
    [assets, setAssets] = useState<FinanceAsset[]>([]),
    [netWorthSnapshots, setNetWorthSnapshots] = useState<NetWorthSnapshot[]>([]);
  const [members, setMembers] = useState<Member[]>([]),
    [splits, setSplits] = useState<Split[]>([]),
    [currentUser, setCurrentUser] = useState('');
  const [detailTx, setDetailTx] = useState<Tx | null>(null),
    [receiptCounts, setReceiptCounts] = useState<Record<string, number>>({});
  const [showTxForm, setShowTxForm] = useState(false),
    [editingTx, setEditingTx] = useState<Tx | null>(null),
    [showGoalForm, setShowGoalForm] = useState(false),
    [showAccountForm, setShowAccountForm] = useState(false),
    [editingAccount, setEditingAccount] = useState<Account | null>(null),
    [showAssetForm, setShowAssetForm] = useState(false),
    [editingAsset, setEditingAsset] = useState<FinanceAsset | null>(null),
    [showTransferForm, setShowTransferForm] = useState(false),
    [showCategoryForm, setShowCategoryForm] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({});
  const [budgetHalves, setBudgetHalves] = useState<Record<string, {first: string; second: string}>>({}),
    [periodDataError, setPeriodDataError] = useState(false);
  const [categoryGroupDraft, setCategoryGroupDraft] = useState<Record<string, BudgetGroup>>({});
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [memberFinance, setMemberFinance] = useState<Record<string, MemberFinanceDraft>>({});
  const [incomePlans, setIncomePlans] = useState<IncomePlan[]>([]),
    [incomePlanError, setIncomePlanError] = useState(false);
  const [payDays, setPayDays] = useState<Record<string, PayDays>>({}),
    [usdRateSetting, setUsdRateSetting] = useState<number | null>(null),
    [showImport, setShowImport] = useState(false);
  const loadSequence = useRef(0),
    loadedFor = useRef(''),
    incomeScope = useRef('');
  incomeScope.current = household.id + ':' + monthDate(month);
  const [categoryRules, setCategoryRules] = useState<Record<string, CategoryRuleDraft>>({});
  const [categoryCustom, setCategoryCustom] = useState<Record<string, Record<string, string>>>({});
  const [historyTxs, setHistoryTxs] = useState<HistoryTx[]>([]),
    [historyContributions, setHistoryContributions] = useState<HistoryContribution[]>([]),
    [historyAllocations, setHistoryAllocations] = useState<HistoryAllocation[]>([]),
    [comparisonRange, setComparisonRange] = useState<3 | 6 | 12>(6);
  useEffect(() => {
    load();
  }, [household.id, month.getFullYear(), month.getMonth()]);
  const importBusy = useRef(false);
  const [settled, setSettled] = useState<{from_user_id: string; to_user_id: string; amount: number}[]>([]),
    [settledVersion, setSettledVersion] = useState(0),
    [settledError, setSettledError] = useState(false);
  useEffect(() => {
    let live = true;
    supabase
      .from('finance_settlements')
      .select('from_user_id,to_user_id,amount')
      .eq('household_id', household.id)
      .eq('period_month', monthDate(month))
      .then(({data, error}) => {
        if (!live) return;
        setSettledError(Boolean(error && !['42P01', 'PGRST205'].includes(String((error as any).code))));
        setSettled(error ? [] : ((data || []) as {from_user_id: string; to_user_id: string; amount: number}[]));
      });
    return () => {
      live = false;
    };
  }, [household.id, month.getFullYear(), month.getMonth(), settledVersion]);
  useEffect(() => {
    if (!extrasVersion) return;
    let live = true;
    setCurrencyLoading(true);
    Promise.all([
      pagedResult(() =>
        fetchAllRows((from, to) =>
          supabase
            .from('finance_accounts')
            .select('id,currency,opening_balance_usd')
            .eq('household_id', household.id)
            .order('id')
            .range(from, to)
        )
      ),
      pagedResult(() =>
        fetchAllRows<InstallmentPlan>((from, to) =>
          supabase
            .from('card_installments')
            .select('id,account_id,kind,description,principal,months,annual_rate,first_statement,active')
            .eq('household_id', household.id)
            .eq('active', true)
            .order('created_at')
            .order('id')
            .range(from, to)
        )
      )
    ]).then(([cur, inst]) => {
      if (!live) return;
      setGuatemalaReady(!cur.error && !inst.error);
      setCurrencyReady(!cur.error);
      setInstallmentsError(Boolean(inst.error && !['42P01', 'PGRST205'].includes(String(inst.error.code))));
      setCurrencyError(Boolean(cur.error && !['42703', 'PGRST204'].includes(String((cur.error as any).code))));
      setCurrencyLoading(false);
      setAccountCurrency(
        cur.error
          ? {}
          : Object.fromEntries(
              ((cur.data || []) as {id: string; currency: string; opening_balance_usd: number | null}[]).map(r => [
                r.id,
                {
                  currency: r.currency || 'GTQ',
                  opening_balance_usd: r.opening_balance_usd == null ? null : Number(r.opening_balance_usd)
                }
              ])
            )
      );
      setInstallments(inst.error ? [] : ((inst.data || []) as InstallmentPlan[]));
    });
    return () => {
      live = false;
    };
  }, [household.id, extrasVersion]);
  const settledNet = (id: string) =>
    settled.reduce(
      (n, r) => n + (r.from_user_id === id ? toCents(r.amount) : 0) - (r.to_user_id === id ? toCents(r.amount) : 0),
      0
    ) / 100;
  useEffect(() => {
    let active = true;
    setLedgerEnabled(false);
    supabase.rpc('get_savings_ledger_capability', {p_household_id: household.id}).then(({data}) => {
      if (active) setLedgerEnabled(data === true);
    });
    return () => {
      active = false;
    };
  }, [household.id]);
  useEffect(() => {
    setDetailTx(null);
    setEditingContribution(null);
    setEditingRecurring(null);
    setRemoving(null);
    setManagementError('');
    setContributionGoal('all');
    setContributionLimit(20);
  }, [household.id]);
  useEffect(() => {
    setContributionLimit(20);
  }, [contributionGoal, contributionPeriod, month]);
  useEffect(() => {
    let active = true;
    if (!txs.length) {
      setReceiptCounts({});
      return;
    }
    supabase
      .from('finance_receipts')
      .select('transaction_id')
      .eq('household_id', household.id)
      .in(
        'transaction_id',
        txs.map(tx => tx.id)
      )
      .then(({data, error}) => {
        if (!active) return;
        const counts: Record<string, number> = {};
        if (!error) for (const row of data || []) counts[row.transaction_id] = (counts[row.transaction_id] || 0) + 1;
        setReceiptCounts(counts);
      });
    return () => {
      active = false;
    };
  }, [household.id, txs]);
  async function refreshReceiptCounts() {
    if (!txs.length) return;
    const {data, error} = await supabase
      .from('finance_receipts')
      .select('transaction_id')
      .eq('household_id', household.id)
      .in(
        'transaction_id',
        txs.map(tx => tx.id)
      );
    if (error) return;
    const counts: Record<string, number> = {};
    for (const row of data || []) counts[row.transaction_id] = (counts[row.transaction_id] || 0) + 1;
    setReceiptCounts(counts);
  }
  async function load() {
    const sequence = ++loadSequence.current;
    const scope = household.id + ':' + monthDate(month);
    if (loadedFor.current !== scope) setLoading(true);
    if (!readOnly) {
      await supabase.rpc('seed_finance_categories', {p_household_id: household.id});
      await supabase.rpc('refresh_my_net_worth_snapshot', {p_household_id: household.id});
    }
    const bounds = monthBounds(month),
      m = monthDate(month);
    const historyStartDate = new Date(month.getFullYear(), month.getMonth() - 11, 1),
      historyStart = isoDate(historyStartDate),
      historyStartMonth = monthDate(historyStartDate);
    const userPromise = supabase.auth.getUser();
    const [
      catR,
      txR,
      allocR,
      goalR,
      contR,
      recR,
      accR,
      accTxR,
      transferR,
      assetR,
      netWorthR,
      memberR,
      financeSettingsR,
      memberFinanceR,
      categorySettingsR,
      categoryMemberR,
      historyTxR,
      historyContR,
      historyAllocR,
      incomePlanR,
      userR
    ] = await Promise.all([
      supabase
        .from('budget_categories')
        .select('id,name,icon,budget_group')
        .eq('household_id', household.id)
        .order('created_at'),
      pagedResult(() =>
        fetchAllRows((from, to) =>
          supabase
            .from('transactions')
            .select(
              'id,description,amount,type,transaction_date,category_id,paid_by,account_id,is_shared,notes,recurring_transaction_id,original_currency,original_amount,exchange_rate'
            )
            .eq('household_id', household.id)
            .gte('transaction_date', bounds.start)
            .lte('transaction_date', bounds.end)
            .order('transaction_date', {ascending: false})
            .order('created_at', {ascending: false})
            .order('id')
            .range(from, to)
        )
      ),
      supabase
        .from('budget_allocations')
        .select('id,category_id,planned_amount,month,first_half_amount,second_half_amount')
        .eq('household_id', household.id)
        .eq('month', m),
      supabase
        .from('savings_goals')
        .select('id,name,target_amount,target_date,icon,active')
        .eq('household_id', household.id)
        .order('created_at'),
      pagedResult(() =>
        fetchAllRows((from, to) =>
          supabase
            .from('goal_contributions')
            .select('id,goal_id,amount,contribution_date,created_by')
            .eq('household_id', household.id)
            .order('contribution_date', {ascending: false})
            .order('created_at', {ascending: false})
            .order('id')
            .range(from, to)
        )
      ),
      supabase
        .from('recurring_transactions')
        .select('id,description,amount,type,due_day,category_id,account_id,paid_by,is_shared,active,created_at')
        .eq('household_id', household.id)
        .order('due_day'),
      supabase
        .from('finance_accounts')
        .select(
          'id,name,account_type,account_class,opening_balance,owner_user_id,is_shared,active,institution,credit_limit,statement_day,payment_due_day,apr,minimum_payment,notes'
        )
        .eq('household_id', household.id)
        .eq('active', true)
        .order('created_at'),
      pagedResult(() =>
        fetchAllRows((from, to) =>
          supabase
            .from('transactions')
            .select('account_id,type,amount,transaction_date,original_currency,original_amount')
            .eq('household_id', household.id)
            .lte('transaction_date', isoDate())
            .not('account_id', 'is', null)
            .order('id')
            .range(from, to)
        )
      ),
      pagedResult(() =>
        fetchAllRows((from, to) =>
          supabase
            .from('finance_transfers')
            .select('id,from_account_id,to_account_id,amount,transfer_date,description')
            .eq('household_id', household.id)
            .lte('transfer_date', isoDate())
            .order('transfer_date', {ascending: false})
            .order('created_at', {ascending: false})
            .order('id')
            .range(from, to)
        )
      ),
      supabase
        .from('finance_assets')
        .select('id,name,asset_type,estimated_value,purchase_value,owner_user_id,is_shared,notes,active')
        .eq('household_id', household.id)
        .eq('active', true)
        .order('created_at'),
      supabase
        .from('finance_net_worth_snapshots')
        .select('snapshot_date,account_assets,manual_assets,liabilities,net_worth')
        .eq('household_id', household.id)
        .order('snapshot_date', {ascending: false})
        .limit(365),
      supabase.from('household_members').select('user_id,role').eq('household_id', household.id),
      supabase
        .from('finance_household_settings')
        .select('household_id,split_method,usd_rate')
        .eq('household_id', household.id)
        .maybeSingle(),
      supabase
        .from('finance_member_settings')
        .select('user_id,monthly_income,custom_share_percent,first_pay_day,second_pay_day')
        .eq('household_id', household.id),
      supabase
        .from('finance_category_settings')
        .select('category_id,split_method,responsible_user_id')
        .eq('household_id', household.id),
      supabase
        .from('finance_category_member_settings')
        .select('category_id,user_id,custom_share_percent')
        .eq('household_id', household.id),
      pagedResult(() =>
        fetchAllRows((from, to) =>
          supabase
            .from('transactions')
            .select('amount,type,transaction_date,category_id,description,original_currency,original_amount')
            .eq('household_id', household.id)
            .gte('transaction_date', historyStart)
            .lte('transaction_date', bounds.end)
            .order('id')
            .range(from, to)
        )
      ),
      pagedResult(() =>
        fetchAllRows((from, to) =>
          supabase
            .from('goal_contributions')
            .select('amount,contribution_date')
            .eq('household_id', household.id)
            .gte('contribution_date', historyStart)
            .lte('contribution_date', bounds.end)
            .order('id')
            .range(from, to)
        )
      ),
      pagedResult(() =>
        fetchAllRows((from, to) =>
          supabase
            .from('budget_allocations')
            .select('planned_amount,month,category_id')
            .eq('household_id', household.id)
            .gte('month', historyStartMonth)
            .lte('month', m)
            .order('id')
            .range(from, to)
        )
      ),
      supabase
        .from('finance_income_plans')
        .select('user_id,month,expected_amount,first_half_amount,second_half_amount')
        .eq('household_id', household.id)
        .eq('month', m),
      userPromise
    ]);
    if (sequence !== loadSequence.current) return;
    const memberRows = (memberR.data || []) as {user_id: string; role: string}[];
    const ids = memberRows.map(x => x.user_id);
    const profileR = ids.length
      ? await supabase.from('profiles').select('id,full_name').in('id', ids)
      : {data: [] as any[]};
    const names = new Map((profileR.data || []).map((p: any) => [p.id, p.full_name || 'Miembro']));
    const memberData = memberRows.map(x => ({...x, full_name: String(names.get(x.user_id) || 'Miembro')}));
    if (!readOnly && !financeSettingsR.data)
      await supabase
        .from('finance_household_settings')
        .insert({household_id: household.id, split_method: 'equal', updated_by: userR.data.user?.id || null});
    const financeRows = (memberFinanceR.data || []) as any[];
    const missingMembers = memberRows.filter(m => !financeRows.some(x => x.user_id === m.user_id));
    if (!readOnly && missingMembers.length)
      await supabase
        .from('finance_member_settings')
        .insert(missingMembers.map(m => ({household_id: household.id, user_id: m.user_id})));
    const financeDraft: Record<string, MemberFinanceDraft> = {};
    for (const m of memberRows) {
      const row = financeRows.find(x => x.user_id === m.user_id);
      financeDraft[m.user_id] = {
        monthly_income: String(Number(row?.monthly_income || 0)),
        custom_share_percent: String(Number(row?.custom_share_percent || 0))
      };
    }
    const categoryRuleDraft: Record<string, CategoryRuleDraft> = {};
    for (const cat of (catR.data || []) as Category[]) {
      const row = ((categorySettingsR.data || []) as any[]).find(x => x.category_id === cat.id);
      categoryRuleDraft[cat.id] = {
        split_method: (row?.split_method || 'inherit') as CategoryRuleMethod,
        responsible_user_id: String(row?.responsible_user_id || '')
      };
    }
    const categoryCustomDraft: Record<string, Record<string, string>> = {};
    for (const cat of (catR.data || []) as Category[]) {
      categoryCustomDraft[cat.id] = {};
      for (const m of memberRows) {
        const row = ((categoryMemberR.data || []) as any[]).find(
          x => x.category_id === cat.id && x.user_id === m.user_id
        );
        categoryCustomDraft[cat.id][m.user_id] = String(Number(row?.custom_share_percent || 0));
      }
    }
    const txData = (txR.data || []) as unknown as Tx[];
    const txIds = txData.map(t => t.id);
    const splitR = await pagedResult(async () => {
      const rows: Split[] = [];
      for (let i = 0; i < txIds.length; i += 100)
        rows.push(
          ...(await fetchAllRows<Split>((from, to) =>
            supabase
              .from('transaction_splits')
              .select('transaction_id,user_id,share_amount')
              .eq('household_id', household.id)
              .in('transaction_id', txIds.slice(i, i + 100))
              .order('id')
              .range(from, to)
          ))
        );
      return rows;
    });
    const occurrenceR = await supabase
      .from('recurring_transaction_occurrences')
      .select('id,recurring_transaction_id,period_month,due_date,status,paid_at,transaction_id,details_snapshot')
      .eq('household_id', household.id)
      .eq('period_month', m)
      .order('due_date');
    // In the current month, payments still pending from earlier months are listed as overdue so they can be paid or skipped.
    const earlierR =
      m === monthDate(new Date())
        ? await supabase
            .from('recurring_transaction_occurrences')
            .select('id,recurring_transaction_id,period_month,due_date,status,paid_at,transaction_id,details_snapshot')
            .eq('household_id', household.id)
            .eq('status', 'pending')
            .lt('due_date', m)
            .gte('due_date', monthDate(new Date(month.getFullYear(), month.getMonth() - 2, 1)))
            .order('due_date')
            .limit(60)
        : {data: [] as any[], error: null};
    if (!earlierR.error && earlierR.data?.length && occurrenceR.data)
      (occurrenceR.data as any[]).unshift(
        ...(earlierR.data as any[]).filter(e => !(occurrenceR.data as any[]).some(o => o.id === e.id))
      );
    if (sequence !== loadSequence.current) return;
    setIncomePlans((incomePlanR.data || []) as IncomePlan[]);
    setIncomePlanError(Boolean(incomePlanR.error));
    setCategories((catR.data || []) as Category[]);
    setTxs(txData);
    setAllocations((allocR.data || []) as unknown as Allocation[]);
    setGoals((goalR.data || []) as unknown as Goal[]);
    setContributions((contR.data || []) as unknown as Contribution[]);
    setRecurring((recR.data || []) as unknown as Recurring[]);
    setOccurrences((occurrenceR.data || []) as unknown as RecurringOccurrence[]);
    setAccounts((accR.data || []) as unknown as Account[]);
    setExtrasVersion(v => v + 1);
    setAccountTxs((accTxR.data || []) as unknown as any[]);
    setTransfers((transferR.data || []) as unknown as Transfer[]);
    setAssets((assetR.data || []) as unknown as FinanceAsset[]);
    setNetWorthSnapshots(((netWorthR.data || []) as unknown as NetWorthSnapshot[]).slice().reverse());
    setMembers(memberData);
    setSplits((splitR.data || []) as unknown as Split[]);
    setSplitMethod(((financeSettingsR.data as any)?.split_method || 'equal') as SplitMethod);
    setMemberFinance(financeDraft);
    setUsdRateSetting(
      (financeSettingsR.data as any)?.usd_rate == null ? null : Number((financeSettingsR.data as any).usd_rate)
    );
    setPayDays(
      Object.fromEntries(
        financeRows.map(x => [
          x.user_id,
          {first_pay_day: x.first_pay_day ?? null, second_pay_day: x.second_pay_day ?? null}
        ])
      )
    );
    setCategoryRules(categoryRuleDraft);
    setCategoryCustom(categoryCustomDraft);
    setCurrentUser(userR.data.user?.id || '');
    setHistoryTxs((historyTxR.data || []) as unknown as HistoryTx[]);
    setHistoryContributions((historyContR.data || []) as unknown as HistoryContribution[]);
    setHistoryAllocations((historyAllocR.data || []) as unknown as HistoryAllocation[]);
    const draft: Record<string, string> = {};
    const groupDraft: Record<string, BudgetGroup> = {};
    for (const c of (catR.data || []) as Category[]) {
      const a = ((allocR.data || []) as any[]).find(x => x.category_id === c.id);
      draft[c.id] = a ? String(Number(a.planned_amount)) : '0';
      groupDraft[c.id] = (c.budget_group || 'variable') as BudgetGroup;
    }
    setBudgetDraft(draft);
    setCategoryGroupDraft(groupDraft);
    setBudgetHalves(
      Object.fromEntries(
        ((allocR.data || []) as Allocation[]).map(a => [
          a.category_id,
          {
            first: a.first_half_amount == null ? '' : String(a.first_half_amount),
            second: a.second_half_amount == null ? '' : String(a.second_half_amount)
          }
        ])
      )
    );
    setPeriodDataError(
      Boolean(
        occurrenceR.error ||
        recR.error ||
        catR.error ||
        allocR.error ||
        txR.error ||
        contR.error ||
        memberR.error ||
        memberFinanceR.error ||
        financeSettingsR.error ||
        categorySettingsR.error ||
        categoryMemberR.error ||
        ('error' in splitR && splitR.error)
      )
    );
    const errors = [
      catR.error,
      txR.error,
      allocR.error,
      goalR.error,
      contR.error,
      recR.error,
      accR.error,
      accTxR.error,
      transferR.error,
      assetR.error,
      netWorthR.error,
      memberR.error,
      financeSettingsR.error,
      memberFinanceR.error,
      categorySettingsR.error,
      categoryMemberR.error,
      historyTxR.error,
      historyContR.error,
      historyAllocR.error,
      occurrenceR.error,
      incomePlanR.error
    ].filter(Boolean);
    setSummaryError(
      Boolean(
        txR.error ||
        allocR.error ||
        contR.error ||
        catR.error ||
        recR.error ||
        occurrenceR.error ||
        memberR.error ||
        memberFinanceR.error ||
        incomePlanR.error
      )
    );
    setAccountDataError(Boolean(accR.error || accTxR.error || transferR.error));
    setAssetDataError(Boolean(assetR.error));
    if (errors.length) setMessage(LOAD_ERROR);
    else setMessage(current => (current === LOAD_ERROR ? '' : current));
    loadedFor.current = scope;
    setLoading(false);
  }
  const cutoff = isoDate();
  const actualTxs = useMemo(() => txs.filter(t => t.transaction_date <= cutoff), [txs, cutoff]);
  const actualContributions = useMemo(
    () => contributions.filter(c => c.contribution_date <= cutoff),
    [contributions, cutoff]
  );
  const totals = useMemo(() => {
    const sum = (rows: {amount: number}[]) => rows.reduce((n, r) => n + toCents(r.amount), 0) / 100;
    // Same rule as Home and Quincenas: an expense in a savings category is saving, not spending.
    const savingIds = new Set(categories.filter(c => c.budget_group === 'saving').map(c => c.id)),
      savedAsExpense = (t: {type: string; category_id: string | null}) =>
        t.type === 'expense' && Boolean(t.category_id) && savingIds.has(t.category_id!);
    const income = sum(actualTxs.filter(t => t.type === 'income')),
      expense = sum(actualTxs.filter(t => t.type === 'expense' && !savedAsExpense(t)));
    const saving =
      (toCents(
        sum(
          actualContributions.filter(
            c => c.contribution_date >= monthBounds(month).start && c.contribution_date <= monthBounds(month).end
          )
        )
      ) +
        toCents(sum(actualTxs.filter(savedAsExpense)))) /
      100;
    const planned = allocations.reduce((n, a) => n + toCents(a.planned_amount), 0) / 100;
    const plannedExpense =
      allocations
        .filter(a => categories.find(c => c.id === a.category_id)?.budget_group !== 'saving')
        .reduce((n, a) => n + toCents(a.planned_amount), 0) / 100;
    return {
      income,
      expense,
      saving,
      planned,
      plannedExpense,
      available: (toCents(income) - toCents(expense) - toCents(saving)) / 100
    };
  }, [actualTxs, actualContributions, allocations, categories, month]);
  const actualByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of actualTxs) {
      if (t.type === 'expense' && t.category_id)
        map.set(t.category_id, (toCents(map.get(t.category_id)) + toCents(t.amount)) / 100);
    }
    return map;
  }, [actualTxs]);
  const allocationByCategory = useMemo(
    () => new Map(allocations.map(a => [a.category_id, Number(a.planned_amount)])),
    [allocations]
  );
  const categoryName = (id: string | null) => categories.find(c => c.id === id)?.name || 'Sin categoría';
  const memberName = (id: string | null) =>
    members.find(m => m.user_id === id)?.full_name || (id === currentUser ? 'Yo' : 'Miembro');
  const accountName = (id: string | null) => accounts.find(a => a.id === id)?.name || 'Sin cuenta';
  const accountBalances = useMemo(
    () =>
      accounts.map(a => {
        let cents = toCents(a.opening_balance);
        for (const t of accountTxs.filter(x => x.account_id === a.id)) {
          const amount = toCents(t.amount);
          if (a.account_class === 'asset') cents += t.type === 'income' ? amount : -amount;
          else cents += t.type === 'expense' ? amount : -amount;
        }
        for (const transfer of transfers) {
          const amount = toCents(transfer.amount);
          if (transfer.from_account_id === a.id) cents += a.account_class === 'asset' ? -amount : amount;
          if (transfer.to_account_id === a.id) cents += a.account_class === 'asset' ? amount : -amount;
        }
        const extra = accountCurrency[a.id];
        const usd =
          extra?.currency === 'USD'
            ? usdAccountBalance(
                {...a, opening_balance_usd: extra.opening_balance_usd},
                accountTxs,
                transfers,
                usdRate(usdRateSetting),
                isoDate()
              )
            : null;
        return {...a, balance: cents / 100, currency: extra?.currency || 'GTQ', usd};
      }),
    [accounts, accountTxs, transfers, accountCurrency, usdRateSetting]
  );
  const patrimony = useMemo(() => {
    const cents = (values: number[]) => values.reduce((sum, n) => sum + toCents(n), 0) / 100;
    const accountAssets = cents(accountBalances.filter(a => a.account_class === 'asset').map(a => Number(a.balance)));
    const manualAssets = cents(assets.map(a => Number(a.estimated_value)));
    // An overpaid card (negative liability) is money in your favour, not a smaller debt elsewhere.
    const liabilities = cents(
      accountBalances.filter(a => a.account_class === 'liability').map(a => Math.max(0, Number(a.balance)))
    );
    const overpaid = cents(
      accountBalances.filter(a => a.account_class === 'liability').map(a => Math.max(0, -Number(a.balance)))
    );
    const liquidAssets = cents(
      accountBalances
        .filter(a => a.account_class === 'asset' && ['cash', 'checking', 'savings'].includes(a.account_type))
        .map(a => Number(a.balance))
    );
    const totalAssets = (toCents(accountAssets) + toCents(manualAssets) + toCents(overpaid)) / 100;
    const netWorth = (toCents(totalAssets) - toCents(liabilities)) / 100;
    const debtRatio = totalAssets > 0 ? (liabilities / totalAssets) * 100 : liabilities > 0 ? 100 : 0;
    // Utilization only compares cards that have a limit: a card without one would inflate the percentage.
    const limited = accountBalances.filter(a => a.account_type === 'credit' && Number(a.credit_limit) > 0);
    const creditUsed = cents(limited.map(a => Math.max(0, Number(a.balance))));
    const creditLimit = cents(limited.map(a => Number(a.credit_limit || 0)));
    return {
      accountAssets,
      manualAssets,
      totalAssets,
      liabilities,
      liquidAssets,
      netWorth,
      debtRatio,
      creditUsed,
      creditLimit,
      creditUtilization: creditLimit > 0 ? (creditUsed / creditLimit) * 100 : 0
    };
  }, [accountBalances, assets]);
  const debtAccounts = useMemo(
    () =>
      accountBalances
        .filter(a => a.account_class === 'liability' && a.balance > 0)
        .map(a => ({id: a.id, name: a.name, balance: a.balance, apr: a.apr, minimum_payment: a.minimum_payment})),
    [accountBalances]
  );
  const cardStatus = useMemo(
    () => new Map(creditCardStatus(accounts, accountTxs, transfers, isoDate(), installments).map(c => [c.id, c])),
    [accounts, accountTxs, transfers, installments]
  );
  const shareContext: ShareContext = useMemo(
    () => ({
      members,
      plans: incomePlanError ? [] : incomePlans,
      references: Object.fromEntries(
        members.map(m => [m.user_id, Number(memberFinance[m.user_id]?.monthly_income || 0)])
      ),
      method: splitMethod,
      custom: Object.fromEntries(
        members.map(m => [m.user_id, Number(memberFinance[m.user_id]?.custom_share_percent || 0)])
      ),
      rules: categoryRules,
      categoryCustom: Object.fromEntries(
        Object.entries(categoryCustom).map(([cat, values]) => [
          cat,
          Object.fromEntries(Object.entries(values).map(([id, value]) => [id, Number(value)]))
        ])
      ),
      month: monthDate(month)
    }),
    [members, incomePlans, incomePlanError, memberFinance, splitMethod, categoryRules, categoryCustom, month]
  );
  const contributionRatios = useMemo(() => periodShares(shareContext, 'month').rows, [shareContext]);
  async function makeSplitRows(
    transactionId: string,
    amount: number,
    paidBy: string,
    shared: boolean,
    categoryId: string | null,
    date: string
  ) {
    if (!shared || members.length <= 1)
      return paidBy
        ? [{transaction_id: transactionId, household_id: household.id, user_id: paidBy, share_amount: amount}]
        : [];
    const {data, error} = await supabase.rpc('finance_split_weights', {
      p_household_id: household.id,
      p_date: date,
      p_category_id: categoryId
    });
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('No se pudo calcular el reparto. Vuelve a cargar Finanzas.');
    return splitCents(
      amount,
      data.map((r: {user_id: string; ratio: number | string}) => ({user_id: r.user_id, ratio: Number(r.ratio)}))
    ).map(r => ({
      transaction_id: transactionId,
      household_id: household.id,
      user_id: r.user_id,
      share_amount: r.amount
    }));
  }
  const activeRecurring = recurring.filter(r => r.active !== false);
  const visibleOccurrences = occurrences.filter(
    o => recurring.find(r => r.id === o.recurring_transaction_id)?.active !== false || o.status === 'paid'
  );
  const occurrenceRecurring = (o: RecurringOccurrence) => {
    const r = recurring.find(r => r.id === o.recurring_transaction_id);
    return r ? occurrenceDetails(r, o.details_snapshot) : undefined;
  };
  const recurringById = (id: string) => recurring.find(r => r.id === id);
  const occurrenceStatus = (o: RecurringOccurrence) =>
    o.status === 'pending' && o.due_date < isoDate() ? 'overdue' : o.status;
  const recurringStats = useMemo(
    () =>
      visibleOccurrences.reduce(
        (acc, o) => {
          const s = occurrenceStatus(o);
          if (s === 'paid') acc.paid++;
          else if (s === 'skipped') acc.skipped++;
          else if (s === 'overdue') acc.overdue++;
          else acc.pending++;
          return acc;
        },
        {pending: 0, paid: 0, overdue: 0, skipped: 0}
      ),
    [occurrences, recurring]
  );
  const incomeSummary = useMemo(
    () =>
      monthlyIncomeSummary(
        monthDate(month),
        members,
        incomePlans,
        actualTxs,
        Object.fromEntries(members.map(m => [m.user_id, Number(memberFinance[m.user_id]?.monthly_income || 0)]))
      ),
    [month, members, incomePlans, actualTxs, memberFinance]
  );
  const smartBudget = useMemo(() => {
    const flow = buildCashFlow({
      month: monthDate(month),
      today: cutoff,
      transactions: txs,
      savings: contributions,
      categories,
      allocations,
      members,
      plans: incomePlans,
      references: Object.fromEntries(
        members.map(m => [m.user_id, Number(memberFinance[m.user_id]?.monthly_income || 0)])
      ),
      recurring,
      occurrences
    });
    const plannedIncome = flow.incomePlan.expected;
    const health =
      flow.projectedClose < 0 ? 'risk' : flow.projectedClose < Math.max(plannedIncome * 0.08, 500) ? 'watch' : 'good';
    return {...flow, plannedIncome, actualSaving: flow.saving, health};
  }, [
    month,
    cutoff,
    txs,
    contributions,
    categories,
    allocations,
    members,
    incomePlans,
    memberFinance,
    recurring,
    occurrences
  ]);
  const monthlyMetrics = useMemo(() => {
    const rows: MonthMetric[] = [];
    for (let offset = comparisonRange - 1; offset >= 0; offset--) {
      const d = new Date(month.getFullYear(), month.getMonth() - offset, 1),
        key = monthDate(d),
        bounds = monthBounds(d);
      const income =
        historyTxs
          .filter(
            t =>
              t.transaction_date <= cutoff &&
              t.transaction_date >= bounds.start &&
              t.transaction_date <= bounds.end &&
              t.type === 'income'
          )
          .reduce((s, t) => s + toCents(t.amount), 0) / 100;
      const expense =
        historyTxs
          .filter(
            t =>
              t.transaction_date <= cutoff &&
              t.transaction_date >= bounds.start &&
              t.transaction_date <= bounds.end &&
              t.type === 'expense'
          )
          .reduce((s, t) => s + toCents(t.amount), 0) / 100;
      const saving =
        historyContributions
          .filter(
            x =>
              x.contribution_date <= cutoff && x.contribution_date >= bounds.start && x.contribution_date <= bounds.end
          )
          .reduce((s, x) => s + toCents(x.amount), 0) / 100;
      const budget =
        historyAllocations.filter(x => x.month === key).reduce((s, x) => s + toCents(x.planned_amount), 0) / 100;
      rows.push({
        key,
        label: d.toLocaleDateString('es-GT', {month: 'short'}).replace('.', ''),
        income,
        expense,
        saving,
        budget,
        balance: (toCents(income) - toCents(expense) - toCents(saving)) / 100,
        savingRate: income > 0 ? (saving / income) * 100 : 0
      });
    }
    return rows;
  }, [historyTxs, historyContributions, historyAllocations, month, comparisonRange, cutoff]);
  const currentMetric =
    monthlyMetrics[monthlyMetrics.length - 1] ||
    ({income: 0, expense: 0, saving: 0, budget: 0, balance: 0, savingRate: 0} as MonthMetric);
  const previousMetric =
    monthlyMetrics[monthlyMetrics.length - 2] ||
    ({income: 0, expense: 0, saving: 0, budget: 0, balance: 0, savingRate: 0} as MonthMetric);
  const metricDelta = (current: number, previous: number) =>
    previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / Math.abs(previous)) * 100;
  const categoryComparison = useMemo(() => {
    const currentBounds = monthBounds(month),
      previousDate = new Date(month.getFullYear(), month.getMonth() - 1, 1),
      previousBounds = monthBounds(previousDate);
    return categories
      .map(cat => {
        const current =
          historyTxs
            .filter(
              t =>
                t.transaction_date <= cutoff &&
                t.type === 'expense' &&
                t.category_id === cat.id &&
                t.transaction_date >= currentBounds.start &&
                t.transaction_date <= currentBounds.end
            )
            .reduce((s, t) => s + toCents(t.amount), 0) / 100;
        const previous =
          historyTxs
            .filter(
              t =>
                t.transaction_date <= cutoff &&
                t.type === 'expense' &&
                t.category_id === cat.id &&
                t.transaction_date >= previousBounds.start &&
                t.transaction_date <= previousBounds.end
            )
            .reduce((s, t) => s + toCents(t.amount), 0) / 100;
        return {id: cat.id, name: cat.name, current, previous, delta: metricDelta(current, previous)};
      })
      .filter(x => x.current > 0 || x.previous > 0)
      .sort((a, b) => Math.max(b.current, b.previous) - Math.max(a.current, a.previous))
      .slice(0, 8);
  }, [categories, historyTxs, month]);
  const contributionOverview = useMemo(
    () =>
      financePeriodSummary(
        monthDate(month),
        'month',
        members,
        incomePlans,
        shareContext.references,
        allocations,
        categories,
        actualTxs,
        actualContributions,
        splits,
        shareContext
      ).people.map(m => ({...m, ratio: contributionRatios.find(r => r.user_id === m.user_id)?.ratio || 0})),
    [
      month,
      members,
      incomePlans,
      shareContext,
      allocations,
      categories,
      actualTxs,
      actualContributions,
      splits,
      contributionRatios
    ]
  );
  async function saveContributionSettings() {
    try {
      if (readOnly) {
        setMessage('Modo solo lectura.');
        return;
      }
      setBusy(true);
      setMessage('');
      for (const m of members) {
        const income = Number(memberFinance[m.user_id]?.monthly_income || 0),
          share = Number(memberFinance[m.user_id]?.custom_share_percent || 0);
        if (!Number.isFinite(income) || income < 0) {
          setBusy(false);
          setMessage(`${m.full_name}: el ingreso de referencia debe ser un número mayor o igual a cero.`);
          return;
        }
        if (!Number.isFinite(share) || share < 0 || share > 100) {
          setBusy(false);
          setMessage(`${m.full_name}: el porcentaje debe estar entre 0 y 100.`);
          return;
        }
      }
      const totalIncome = members.reduce((s, m) => s + Number(memberFinance[m.user_id]?.monthly_income || 0), 0);
      const customTotal = members.reduce((s, m) => s + Number(memberFinance[m.user_id]?.custom_share_percent || 0), 0);
      if (splitMethod === 'income' && totalIncome <= 0 && incomeSummary.expected <= 0) {
        setBusy(false);
        setMessage('Ingresa al menos un ingreso mensual para usar reparto proporcional.');
        return;
      }
      if (splitMethod === 'custom' && Math.abs(customTotal - 100) > 0.01) {
        setBusy(false);
        setMessage('Los porcentajes personalizados deben sumar exactamente 100%.');
        return;
      }
      const user = await supabase.auth.getUser();
      const {error: settingsError} = await supabase.from('finance_household_settings').upsert(
        {
          household_id: household.id,
          split_method: splitMethod,
          updated_by: user.data.user?.id || null,
          updated_at: new Date().toISOString()
        },
        {onConflict: 'household_id'}
      );
      const memberRows = members.map(m => ({
        household_id: household.id,
        user_id: m.user_id,
        monthly_income: Number(memberFinance[m.user_id]?.monthly_income || 0),
        custom_share_percent: Number(memberFinance[m.user_id]?.custom_share_percent || 0),
        updated_at: new Date().toISOString()
      }));
      const {error: memberError} = await supabase
        .from('finance_member_settings')
        .upsert(memberRows, {onConflict: 'household_id,user_id'});
      if (settingsError || memberError) {
        setBusy(false);
        setMessage(settingsError?.message || memberError?.message || 'No se pudo guardar la distribución.');
        return;
      }
      const sharedExpenses = txs.filter(t => t.type === 'expense' && t.is_shared);
      if (sharedExpenses.length) {
        const rows = (
          await Promise.all(
            sharedExpenses.map(t =>
              makeSplitRows(t.id, Number(t.amount), t.paid_by || '', true, t.category_id, t.transaction_date)
            )
          )
        ).flat();
        const ids = sharedExpenses.map(t => t.id);
        const {error: deleteError} = await supabase.from('transaction_splits').delete().in('transaction_id', ids);
        if (deleteError) {
          setBusy(false);
          setMessage(deleteError.message);
          return;
        }
        if (rows.length) {
          const {error: insertError} = await supabase.from('transaction_splits').insert(rows);
          if (insertError) {
            setBusy(false);
            setMessage(
              'La regla se guardó, pero no se pudo recalcular el reparto de los gastos compartidos del mes: ' +
                insertError.message +
                ' Vuelve a guardar para reintentar.'
            );
            await load();
            return;
          }
        }
      }
      setBusy(false);
      setMessage('Regla de aportes guardada y gastos compartidos del mes recalculados.');
      await load();
    } catch (err) {
      setBusy(false);
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar el reparto.');
    }
  }
  async function saveCategoryRules() {
    try {
      if (readOnly) {
        setMessage('Modo solo lectura.');
        return;
      }
      setBusy(true);
      setMessage('');
      for (const cat of categories) {
        const rule = categoryRules[cat.id] || {split_method: 'inherit' as CategoryRuleMethod, responsible_user_id: ''};
        const invalid = members.find(m => {
          const value = Number(categoryCustom[cat.id]?.[m.user_id] || 0);
          return !Number.isFinite(value) || value < 0 || value > 100;
        });
        if (invalid) {
          setBusy(false);
          setMessage(`${cat.name}: el porcentaje de ${invalid.full_name} debe estar entre 0 y 100.`);
          return;
        }
        if (rule.split_method === 'custom') {
          const total = members.reduce((s, m) => s + Number(categoryCustom[cat.id]?.[m.user_id] || 0), 0);
          if (Math.abs(total - 100) > 0.01) {
            setBusy(false);
            setMessage(`${cat.name}: los porcentajes personalizados deben sumar 100%.`);
            return;
          }
        }
        if (rule.split_method === 'personal' && !rule.responsible_user_id) {
          setBusy(false);
          setMessage(`${cat.name}: selecciona quién cubre esta categoría.`);
          return;
        }
      }
      const user = await supabase.auth.getUser();
      const ruleRows = categories.map(cat => ({
        household_id: household.id,
        category_id: cat.id,
        split_method: categoryRules[cat.id]?.split_method || 'inherit',
        responsible_user_id:
          categoryRules[cat.id]?.split_method === 'personal'
            ? categoryRules[cat.id]?.responsible_user_id || null
            : null,
        updated_by: user.data.user?.id || null,
        updated_at: new Date().toISOString()
      }));
      const {error: ruleError} = await supabase
        .from('finance_category_settings')
        .upsert(ruleRows, {onConflict: 'household_id,category_id'});
      if (ruleError) {
        setBusy(false);
        setMessage(ruleError.message);
        return;
      }
      const customRows = categories.flatMap(cat =>
        members.map(m => ({
          household_id: household.id,
          category_id: cat.id,
          user_id: m.user_id,
          custom_share_percent: Number(categoryCustom[cat.id]?.[m.user_id] || 0),
          updated_at: new Date().toISOString()
        }))
      );
      if (customRows.length) {
        const {error: customError} = await supabase
          .from('finance_category_member_settings')
          .upsert(customRows, {onConflict: 'household_id,category_id,user_id'});
        if (customError) {
          setBusy(false);
          setMessage(customError.message);
          return;
        }
      }
      const sharedExpenses = txs.filter(t => t.type === 'expense' && t.is_shared);
      if (sharedExpenses.length) {
        const rows = (
          await Promise.all(
            sharedExpenses.map(t =>
              makeSplitRows(t.id, Number(t.amount), t.paid_by || '', true, t.category_id, t.transaction_date)
            )
          )
        ).flat();
        const ids = sharedExpenses.map(t => t.id);
        const {error: deleteError} = await supabase.from('transaction_splits').delete().in('transaction_id', ids);
        if (deleteError) {
          setBusy(false);
          setMessage(deleteError.message);
          return;
        }
        if (rows.length) {
          const {error: insertError} = await supabase.from('transaction_splits').insert(rows);
          if (insertError) {
            setBusy(false);
            setMessage(
              'La regla se guardó, pero no se pudo recalcular el reparto de los gastos compartidos del mes: ' +
                insertError.message +
                ' Vuelve a guardar para reintentar.'
            );
            await load();
            return;
          }
        }
      }
      setBusy(false);
      setMessage('Reglas por categoría guardadas y gastos compartidos del mes recalculados.');
      await load();
    } catch (err) {
      setBusy(false);
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar el reparto.');
    }
  }
  async function payRecurringOccurrence(occurrence: RecurringOccurrence) {
    if (readOnly || busy) return;
    const r = occurrenceRecurring(occurrence);
    if (!r || occurrence.status === 'paid') return;
    setBusy(true);
    setMessage('');
    const {error} = await supabase.rpc('pay_finance_recurring_occurrence', {
      p_household_id: household.id,
      p_occurrence_id: occurrence.id,
      p_expected_amount: Number(r.amount),
      p_expected_due_date: occurrence.due_date
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
    setMessage('Pago recurrente registrado.');
  }
  async function skipRecurringOccurrence(occurrence: RecurringOccurrence) {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return;
    }
    if (occurrence.status === 'paid') return;
    setBusy(true);
    const {error} = await supabase
      .from('recurring_transaction_occurrences')
      .update({status: 'skipped', updated_at: new Date().toISOString()})
      .eq('id', occurrence.id);
    setBusy(false);
    setMessage(error ? error.message : 'Pago omitido para este mes.');
    if (!error) await load();
  }
  async function addTransaction(form: HTMLFormElement, requestId: string): Promise<boolean> {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return false;
    }
    setBusy(true);
    setMessage('');
    const f = new FormData(form);
    let entry: ReturnType<typeof entryAmount>;
    try {
      entry = entryAmount(f, usdRate(usdRateSetting));
    } catch (err) {
      setBusy(false);
      setMessage((err as Error).message);
      return false;
    }
    const values = {
      description: String(f.get('description') || '').trim(),
      amount: entry.amount,
      type: String(f.get('type')),
      date: String(f.get('date')),
      category_id: String(f.get('category_id') || '') || null,
      account_id: String(f.get('account_id') || '') || null,
      paid_by: String(f.get('paid_by') || currentUser) || null,
      is_shared: String(f.get('share_mode') || 'shared') === 'shared',
      notes: String(f.get('notes') || '').trim() || null,
      recurring: f.get('recurring') === 'on',
      due_day: String(f.get('due_day') || '') || null,
      ...(entry.original.original_currency ? entry.original : {})
    };
    try {
      const {data, error} = await supabase.rpc('save_transaction_once', {
        p_household_id: household.id,
        p_request_id: requestId,
        p_values: values
      });
      if (error || !data) {
        setMessage(error?.message || 'No se pudo confirmar el movimiento.');
        return false;
      }
      setMessage(values.recurring ? 'Movimiento y recurrente guardados.' : 'Movimiento guardado.');
      void load();
      return true;
    } catch {
      setMessage('No se confirmó el guardado. Reintenta con este borrador para evitar duplicados.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function saveBudget() {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return;
    }
    setBusy(true);
    setMessage('');
    let rows;
    try {
      rows = categories.map(cat => {
        const planned_amount = incomeAmount(budgetDraft[cat.id] || '0');
        try {
          return {
            household_id: household.id,
            category_id: cat.id,
            month: monthDate(month),
            planned_amount,
            ...validateHalves(planned_amount, budgetHalves[cat.id]?.first ?? '', budgetHalves[cat.id]?.second ?? '')
          };
        } catch (err) {
          throw new Error(cat.name + ': ' + (err instanceof Error ? err.message : 'Revisa el presupuesto.'));
        }
      });
    } catch (err) {
      setBusy(false);
      setMessage(err instanceof Error ? err.message : 'Revisa los montos.');
      return;
    }
    const {error} = await supabase
      .from('budget_allocations')
      .upsert(rows, {onConflict: 'household_id,category_id,month'});
    const groupResults = await Promise.all(
      categories.map(cat =>
        supabase
          .from('budget_categories')
          .update({budget_group: categoryGroupDraft[cat.id] || cat.budget_group || 'variable'})
          .eq('id', cat.id)
          .eq('household_id', household.id)
      )
    );
    const groupError = groupResults.find(result => result.error)?.error;
    setBusy(false);
    if (!error && !groupError) await load();
    setMessage(
      error || groupError
        ? error?.message || groupError?.message || 'No se pudo guardar el presupuesto.'
        : 'Presupuesto mensual actualizado.'
    );
  }
  async function copyPreviousBudget() {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return;
    }
    setBusy(true);
    setMessage('');
    const previous = new Date(month.getFullYear(), month.getMonth() - 1, 1);
    const {data, error} = await supabase
      .from('budget_allocations')
      .select('category_id,planned_amount,first_half_amount,second_half_amount')
      .eq('household_id', household.id)
      .eq('month', monthDate(previous));
    if (error) {
      setBusy(false);
      setMessage(error.message);
      return;
    }
    if (!data?.length) {
      setBusy(false);
      setMessage('El mes anterior no tiene un presupuesto guardado para copiar.');
      return;
    }
    const {data: existing, error: existingError} = await supabase
      .from('budget_allocations')
      .select('id')
      .eq('household_id', household.id)
      .eq('month', monthDate(month))
      .limit(1);
    if (existingError) {
      setBusy(false);
      setMessage(existingError.message);
      return;
    }
    if (
      existing?.length &&
      !window.confirm(
        `${monthLabel(month)} ya tiene un presupuesto guardado. ¿Reemplazarlo con el del mes anterior? Los montos actuales se sobrescribirán.`
      )
    ) {
      setBusy(false);
      return;
    }
    const rows = data.map(a => ({
      household_id: household.id,
      category_id: a.category_id,
      month: monthDate(month),
      planned_amount: Number(a.planned_amount),
      first_half_amount: a.first_half_amount,
      second_half_amount: a.second_half_amount
    }));
    const {error: upsertError} = await supabase
      .from('budget_allocations')
      .upsert(rows, {onConflict: 'household_id,category_id,month'});
    setBusy(false);
    setMessage(upsertError ? upsertError.message : 'Presupuesto del mes anterior copiado.');
    if (!upsertError) await load();
  }
  async function addCategory(e: FormEvent<HTMLFormElement>) {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return;
    }
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') || '').trim(),
      group = String(f.get('budget_group') || 'variable') as BudgetGroup;
    const {error} = await supabase
      .from('budget_categories')
      .insert({household_id: household.id, name, icon: 'wallet', monthly_limit: 0, budget_group: group});
    setBusy(false);
    setMessage(error ? error.message : 'Categoría creada.');
    if (!error) {
      setShowCategoryForm(false);
      await load();
    }
  }
  async function editTransaction(e: FormEvent<HTMLFormElement>) {
    try {
      if (readOnly) {
        setMessage('Modo solo lectura.');
        return;
      }
      e.preventDefault();
      if (!editingTx) return;
      setBusy(true);
      setMessage('');
      const f = new FormData(e.currentTarget);
      let entry: ReturnType<typeof entryAmount>;
      try {
        entry = entryAmount(f, usdRate(usdRateSetting));
      } catch (err) {
        setBusy(false);
        setMessage((err as Error).message);
        return;
      }
      const type = String(f.get('type')) as 'income' | 'expense',
        amount = entry.amount,
        paidBy = String(f.get('paid_by') || currentUser),
        shareMode = String(f.get('share_mode') || 'shared');
      const payload = {
        description: String(f.get('description')).trim(),
        amount,
        type,
        transaction_date: String(f.get('date')),
        category_id: String(f.get('category_id') || '') || null,
        account_id: String(f.get('account_id') || '') || null,
        paid_by: paidBy || null,
        is_shared: shareMode === 'shared',
        notes: String(f.get('notes') || '') || null,
        ...entry.original
      };
      const newSplits =
        type === 'expense'
          ? await makeSplitRows(
              editingTx.id,
              amount,
              paidBy,
              shareMode === 'shared',
              payload.category_id,
              payload.transaction_date
            )
          : [];
      const {error} = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', editingTx.id)
        .eq('household_id', household.id);
      if (error) {
        setBusy(false);
        setMessage(error.message);
        return;
      }
      const {error: clearSplitError} = await supabase
        .from('transaction_splits')
        .delete()
        .eq('transaction_id', editingTx.id);
      if (clearSplitError) {
        setBusy(false);
        setMessage(
          'El movimiento se actualizó, pero no se pudo recalcular su reparto: ' +
            clearSplitError.message +
            ' Vuelve a guardar para reintentar.'
        );
        await load();
        return;
      }
      if (type === 'expense') {
        const rows = newSplits;
        if (rows.length) {
          const {error: splitError} = await supabase.from('transaction_splits').insert(rows);
          if (splitError) {
            setBusy(false);
            setMessage(
              'El movimiento se actualizó, pero su reparto quedó incompleto: ' +
                splitError.message +
                ' Vuelve a guardar para reintentar.'
            );
            await load();
            return;
          }
        }
      }
      if (editingTx.recurring_transaction_id && f.get('update_recurring') === 'on') {
        const linked = recurringById(editingTx.recurring_transaction_id);
        const dueDay = Number(
          f.get('due_day') || linked?.due_day || new Date(payload.transaction_date + 'T12:00').getDate()
        );
        const {error: recurringError} = await supabase
          .from('recurring_transactions')
          .update({
            category_id: payload.category_id,
            account_id: payload.account_id,
            type,
            description: payload.description,
            amount,
            due_day: dueDay,
            paid_by: paidBy || null,
            is_shared: shareMode === 'shared'
          })
          .eq('id', editingTx.recurring_transaction_id)
          .eq('household_id', household.id);
        if (recurringError) {
          setBusy(false);
          setMessage(recurringError.message);
          return;
        }
      }
      setBusy(false);
      setEditingTx(null);
      setMessage(
        editingTx.recurring_transaction_id && f.get('update_recurring') === 'on'
          ? 'Movimiento y recurrencia actualizados.'
          : 'Movimiento actualizado.'
      );
      await load();
    } catch (err) {
      setBusy(false);
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar el reparto.');
    }
  }
  async function deleteTransaction(tx: Tx) {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return;
    }
    if (!window.confirm('¿Eliminar este movimiento? Esta acción actualizará los saldos y el presupuesto.')) return;
    setBusy(true);
    setMessage('');
    let occurrenceIds: string[] = [];
    if (tx.recurring_transaction_id) {
      const {data: linked, error: linkedError} = await supabase
        .from('recurring_transaction_occurrences')
        .select('id')
        .eq('household_id', household.id)
        .eq('transaction_id', tx.id);
      if (linkedError) {
        setBusy(false);
        setMessage(
          'No se pudo verificar el pago recurrente vinculado. El movimiento no se eliminó: ' + linkedError.message
        );
        return;
      }
      occurrenceIds = ((linked || []) as {id: string}[]).map(o => o.id);
    }
    const {error} = await supabase.from('transactions').delete().eq('id', tx.id).eq('household_id', household.id);
    if (error) {
      setBusy(false);
      setMessage(error.message);
      return;
    }
    if (occurrenceIds.length) {
      const {error: resetError} = await supabase
        .from('recurring_transaction_occurrences')
        .update({status: 'pending', paid_at: null, transaction_id: null, updated_at: new Date().toISOString()})
        .in('id', occurrenceIds);
      if (resetError) {
        setBusy(false);
        setMessage(
          'Movimiento eliminado, pero no se pudo devolver el pago recurrente a pendiente: ' + resetError.message
        );
        await load();
        return;
      }
    }
    setBusy(false);
    setMessage('Movimiento eliminado.');
    await load();
  }
  async function addGoal(e: FormEvent<HTMLFormElement>) {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return;
    }
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const {error} = await supabase.from('savings_goals').insert({
      household_id: household.id,
      name: String(f.get('name')).trim(),
      target_amount: Number(f.get('target_amount')),
      target_date: String(f.get('target_date') || '') || null
    });
    setBusy(false);
    setMessage(error ? error.message : 'Meta creada.');
    if (!error) {
      setShowGoalForm(false);
      await load();
    }
  }
  async function contribute(goalId: string, amount: number) {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return false;
    }
    if (readOnly || busy) return false;
    try {
      amount = incomeAmount(String(amount));
      if (amount <= 0) throw new Error('El aporte debe ser mayor que cero.');
    } catch (err) {
      setMessage((err as Error).message);
      return false;
    }
    setBusy(true);
    const {error} = await supabase
      .from('goal_contributions')
      .insert({goal_id: goalId, household_id: household.id, amount, contribution_date: isoDate()});
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return false;
    }
    await load();
    setMessage('Aporte registrado.');
    return true;
  }
  async function saveContribution(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly || busy || !editingContribution) return;
    const row = editingContribution,
      f = new FormData(e.currentTarget);
    let amount: number;
    try {
      amount = incomeAmount(String(f.get('amount')));
      if (amount <= 0) throw new Error('El aporte debe ser mayor que cero.');
    } catch (err) {
      setManagementError((err as Error).message);
      return;
    }
    const date = String(f.get('date')),
      goal = String(f.get('goal_id'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !goals.some(g => g.id === goal)) {
      setManagementError('Revisa la fecha y la meta de ahorro.');
      return;
    }
    amount = Number(row.amount) < 0 ? -amount : amount;
    setBusy(true);
    setManagementError('');
    const {error} = await supabase
      .from('goal_contributions')
      .update({amount, contribution_date: date, goal_id: goal})
      .eq('id', row.id)
      .eq('household_id', household.id)
      .eq('amount', row.amount)
      .eq('contribution_date', row.contribution_date)
      .eq('goal_id', row.goal_id)
      .select('id')
      .single();
    setBusy(false);
    if (error) {
      setManagementError(
        error.code === 'PGRST116'
          ? 'El aporte cambió o ya no tienes permiso. Actualiza antes de guardar.'
          : error.message
      );
      return;
    }
    setEditingContribution(null);
    await load();
    setMessage('Aporte actualizado. El ahorro y los balances se recalcularon.');
  }
  async function saveRecurring(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly || busy || !editingRecurring) return;
    const f = new FormData(e.currentTarget);
    let amount: number;
    try {
      amount = incomeAmount(String(f.get('amount')));
      if (amount <= 0) throw new Error('El monto debe ser mayor que cero.');
    } catch (err) {
      setManagementError((err as Error).message);
      return;
    }
    const values = {
      description: String(f.get('description')).trim(),
      amount,
      type: String(f.get('type')),
      due_day: Number(f.get('due_day')),
      category_id: String(f.get('category_id') || '') || null,
      account_id: String(f.get('account_id') || '') || null,
      paid_by: String(f.get('paid_by') || '') || null,
      is_shared: f.get('share_mode') === 'shared'
    };
    setBusy(true);
    setManagementError('');
    const {error} = await supabase.rpc('manage_finance_recurring', {
      p_household_id: household.id,
      p_recurring_id: editingRecurring.id,
      p_values: values,
      p_expected: recurringTerms(editingRecurring),
      p_delete: false
    });
    setBusy(false);
    if (error) {
      setManagementError(error.message);
      return;
    }
    setEditingRecurring(null);
    await load();
    setMessage('Recurrente actualizado. Los pendientes se ajustaron; los pagos realizados se conservan.');
  }
  async function removeEntry() {
    if (readOnly || busy || !removing) return;
    setBusy(true);
    setManagementError('');
    let error;
    if (removing.kind === 'contribution') {
      const r = removing.row;
      ({error} = await supabase
        .from('goal_contributions')
        .delete()
        .eq('id', r.id)
        .eq('household_id', household.id)
        .eq('amount', r.amount)
        .eq('contribution_date', r.contribution_date)
        .eq('goal_id', r.goal_id)
        .select('id')
        .single());
    } else
      ({error} = await supabase.rpc('manage_finance_recurring', {
        p_household_id: household.id,
        p_recurring_id: removing.row.id,
        p_values: {},
        p_expected: recurringTerms(removing.row),
        p_delete: true
      }));
    setBusy(false);
    if (error) {
      setManagementError(
        error.code === 'PGRST116' ? 'El registro cambió o ya no tienes permiso. Actualiza la vista.' : error.message
      );
      return;
    }
    const kind = removing.kind;
    setRemoving(null);
    await load();
    setMessage(
      kind === 'contribution'
        ? 'Aporte eliminado. El ahorro y los balances se recalcularon.'
        : 'Recurrente eliminado de la programación. Los pagos registrados se conservan.'
    );
  }
  async function saveAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (currencyLoading || currencyError) {
      setMessage(
        'No pudimos verificar la moneda de las cuentas. Actualiza Finanzas antes de guardar. Tus datos no se modificaron.'
      );
      return;
    }
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return;
    }
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(e.currentTarget);
    const accountType = String(form.get('account_type') || 'checking');
    const forcedClass: AccountClass = ['credit', 'loan', 'mortgage'].includes(accountType)
      ? 'liability'
      : ['cash', 'checking', 'savings', 'investment'].includes(accountType)
        ? 'asset'
        : (String(form.get('account_class') || 'asset') as AccountClass);
    const dollars = currencyReady && form.get('currency') === 'USD',
      entered = Number(form.get('opening_balance') || 0),
      rate = usdRate(usdRateSetting);
    // Quetzal book value of the opening balance: kept as it was unless the amount or the currency really changed,
    // so renaming a dollar account never revalues its history at today's rate.
    const before = editingAccount ? accountCurrency[editingAccount.id] : undefined,
      wasUsd = before?.currency === 'USD' && before.opening_balance_usd != null,
      oldQ = editingAccount ? Number(editingAccount.opening_balance) : 0;
    let openingQ = entered,
      openingUsd: number | null = null;
    if (dollars) {
      if (wasUsd && entered === Number(before!.opening_balance_usd)) [openingQ, openingUsd] = [oldQ, entered];
      else if (editingAccount && !wasUsd && entered === oldQ)
        // A quetzal account switched to dollars: the field still shows quetzales.
        [openingQ, openingUsd] = [oldQ, Math.round((oldQ / rate) * 100) / 100];
      else [openingQ, openingUsd] = [usdToQuetzales(entered, rate), entered];
    } else if (wasUsd && entered === Number(before!.opening_balance_usd)) openingQ = oldQ;
    const payload = {
      household_id: household.id,
      name: String(form.get('name') || '').trim(),
      account_type: accountType,
      account_class: forcedClass,
      // Dollar accounts: the opening balance is typed in dollars and kept in quetzales at today's rate too.
      opening_balance: openingQ,
      ...(currencyReady ? {currency: dollars ? 'USD' : 'GTQ', opening_balance_usd: openingUsd} : {}),
      owner_user_id: String(form.get('owner_user_id') || '') || null,
      is_shared: form.get('is_shared') === 'on',
      institution: String(form.get('institution') || '').trim() || null,
      credit_limit: String(form.get('credit_limit') || '') ? Number(form.get('credit_limit')) : null,
      statement_day: String(form.get('statement_day') || '') ? Number(form.get('statement_day')) : null,
      payment_due_day: String(form.get('payment_due_day') || '') ? Number(form.get('payment_due_day')) : null,
      apr: String(form.get('apr') || '') ? Number(form.get('apr')) : null,
      minimum_payment: String(form.get('minimum_payment') || '') ? Number(form.get('minimum_payment')) : null,
      notes: String(form.get('notes') || '').trim() || null,
      updated_at: new Date().toISOString()
    };
    const result = editingAccount
      ? await supabase
          .from('finance_accounts')
          .update(payload)
          .eq('id', editingAccount.id)
          .eq('household_id', household.id)
      : await supabase.from('finance_accounts').insert(payload);
    setBusy(false);
    setMessage(result.error ? result.error.message : editingAccount ? 'Cuenta actualizada.' : 'Cuenta agregada.');
    if (!result.error) {
      setShowAccountForm(false);
      setEditingAccount(null);
      await supabase.rpc('refresh_my_net_worth_snapshot', {p_household_id: household.id});
      await load();
    }
  }
  async function saveInstallment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly || !installmentCard) return;
    const form = new FormData(e.currentTarget);
    const kind = (form.get('kind') === 'extra' ? 'extra' : 'visacuotas') as InstallmentKind;
    const row = {
      household_id: household.id,
      account_id: installmentCard.id,
      kind,
      description: String(form.get('description') || '').trim(),
      principal: Math.round(Number(form.get('principal')) * 100) / 100,
      months: Math.round(Number(form.get('months'))),
      annual_rate: kind === 'extra' ? Math.max(0, Number(form.get('annual_rate')) || 0) : 0,
      first_statement: String(form.get('first_statement') || '') + '-01'
    };
    if (
      !row.description ||
      !(row.principal > 0) ||
      !(row.months >= 1 && row.months <= 72) ||
      row.first_statement.length !== 10
    ) {
      setMessage('Revisa la descripción, el monto, las cuotas y el primer mes.');
      return;
    }
    setBusy(true);
    const {error} = await supabase.from('card_installments').insert(row);
    setBusy(false);
    if (error) {
      setMessage('No se pudieron guardar las cuotas. Inténtalo de nuevo.');
      return;
    }
    setInstallmentCard(null);
    setMessage(
      (kind === 'extra' ? 'Extrafinanciamiento' : 'Visacuotas') +
        ' guardado: ' +
        row.months +
        ' cuotas de ' +
        formatMoney(installmentPayment(row.principal, row.months, row.annual_rate)) +
        '.'
    );
    setExtrasVersion(v => v + 1);
  }
  async function endInstallment(plan: InstallmentPlan) {
    if (readOnly) return;
    if (!window.confirm('¿Quitar "' + plan.description + '"? Úsalo si ya lo terminaste de pagar o lo cancelaste.'))
      return;
    const {error} = await supabase.from('card_installments').update({active: false}).eq('id', plan.id);
    if (error) setMessage('No se pudo quitar. Inténtalo de nuevo.');
    else setExtrasVersion(v => v + 1);
  }
  async function archiveAccount(account: Account) {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return;
    }
    if (!window.confirm('¿Archivar esta cuenta? Los movimientos históricos se conservarán.')) return;
    setBusy(true);
    const {error} = await supabase
      .from('finance_accounts')
      .update({active: false, updated_at: new Date().toISOString()})
      .eq('id', account.id)
      .eq('household_id', household.id);
    setBusy(false);
    setMessage(error ? error.message : 'Cuenta archivada.');
    if (!error) {
      await supabase.rpc('refresh_my_net_worth_snapshot', {p_household_id: household.id});
      await load();
    }
  }
  async function saveAsset(e: FormEvent<HTMLFormElement>) {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return;
    }
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(e.currentTarget);
    const payload = {
      household_id: household.id,
      name: String(form.get('name') || '').trim(),
      asset_type: String(form.get('asset_type') || 'other'),
      estimated_value: Number(form.get('estimated_value') || 0),
      purchase_value: String(form.get('purchase_value') || '') ? Number(form.get('purchase_value')) : null,
      owner_user_id: String(form.get('owner_user_id') || '') || null,
      is_shared: form.get('is_shared') === 'on',
      notes: String(form.get('notes') || '').trim() || null,
      updated_at: new Date().toISOString()
    };
    const result = editingAsset
      ? await supabase.from('finance_assets').update(payload).eq('id', editingAsset.id).eq('household_id', household.id)
      : await supabase.from('finance_assets').insert(payload);
    setBusy(false);
    setMessage(result.error ? result.error.message : editingAsset ? 'Activo actualizado.' : 'Activo agregado.');
    if (!result.error) {
      setShowAssetForm(false);
      setEditingAsset(null);
      await supabase.rpc('refresh_my_net_worth_snapshot', {p_household_id: household.id});
      await load();
    }
  }
  async function deleteAsset(asset: FinanceAsset) {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return;
    }
    if (!window.confirm('¿Eliminar este activo del patrimonio?')) return;
    setBusy(true);
    const {error} = await supabase.from('finance_assets').delete().eq('id', asset.id).eq('household_id', household.id);
    setBusy(false);
    setMessage(error ? error.message : 'Activo eliminado.');
    if (!error) {
      await supabase.rpc('refresh_my_net_worth_snapshot', {p_household_id: household.id});
      await load();
    }
  }
  async function addTransfer(e: FormEvent<HTMLFormElement>) {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return;
    }
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(e.currentTarget);
    const from = String(form.get('from_account_id') || ''),
      to = String(form.get('to_account_id') || '');
    if (!from || !to || from === to) {
      setBusy(false);
      setMessage('Selecciona dos cuentas diferentes.');
      return;
    }
    const {error} = await supabase.from('finance_transfers').insert({
      household_id: household.id,
      from_account_id: from,
      to_account_id: to,
      amount: Number(form.get('amount') || 0),
      transfer_date: String(form.get('transfer_date') || isoDate()),
      description: String(form.get('description') || '').trim() || null
    });
    setBusy(false);
    setMessage(error ? error.message : 'Transferencia registrada.');
    if (!error) {
      setShowTransferForm(false);
      await supabase.rpc('refresh_my_net_worth_snapshot', {p_household_id: household.id});
      await load();
    }
  }
  async function deleteTransfer(transfer: Transfer) {
    if (readOnly) {
      setMessage('Modo solo lectura.');
      return;
    }
    if (!window.confirm('¿Eliminar esta transferencia?')) return;
    setBusy(true);
    const {error} = await supabase
      .from('finance_transfers')
      .delete()
      .eq('id', transfer.id)
      .eq('household_id', household.id);
    setBusy(false);
    setMessage(error ? error.message : 'Transferencia eliminada.');
    if (!error) {
      await supabase.rpc('refresh_my_net_worth_snapshot', {p_household_id: household.id});
      await load();
    }
  }
  function moveMonth(delta: number) {
    setCategoryFilter(null);
    setMessage('');
    setMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }
  function openChartMonth(key: string) {
    setCategoryFilter(null);
    setTransactionQuery('');
    setTransactionType('all');
    setMonth(new Date(key + 'T12:00'));
    setTab('transactions');
  }
  const spendingRows = useMemo(() => {
    const sums = new Map<string, number>();
    for (const t of actualTxs)
      if (t.type === 'expense') {
        const id = t.category_id || 'uncategorized';
        sums.set(id, (sums.get(id) || 0) + toCents(t.amount));
      }
    return Array.from(sums, ([id, cents]) => ({
      id,
      amount: cents / 100,
      name: id === 'uncategorized' ? 'Sin categoría' : categoryName(id)
    })).sort((a, b) => b.amount - a.amount);
  }, [actualTxs, categories]);
  const filteredTransactions = txs.filter(
    t =>
      (categoryFilter === null || (t.type === 'expense' && (t.category_id || 'uncategorized') === categoryFilter)) &&
      (transactionType === 'all' || t.type === transactionType) &&
      (!transactionQuery.trim() ||
        [t.description, categoryName(t.category_id), t.notes || '']
          .join(' ')
          .toLocaleLowerCase('es-GT')
          .includes(transactionQuery.trim().toLocaleLowerCase('es-GT')))
  );
  const contributionRows = contributions.filter(
    c =>
      (contributionGoal === 'all' || c.goal_id === contributionGoal) &&
      (contributionPeriod === 'all' || c.contribution_date.slice(0, 7) === monthDate(month).slice(0, 7))
  );
  const goalName = (id: string) => goals.find(g => g.id === id)?.name || 'Meta de ahorro';
  const featuredGoal = goals.find(g => g.active),
    featuredSaved = featuredGoal
      ? actualContributions.filter(c => c.goal_id === featuredGoal.id).reduce((sum, c) => sum + toCents(c.amount), 0) /
        100
      : 0;
  return {
    household,
    readOnly,
    connectedEnabled,
    setConnectedEnabled,
    goalLinks,
    setGoalLinks,
    reconciling,
    setReconciling,
    tab,
    setTabState,
    setTab,
    editingContribution,
    setEditingContribution,
    editingRecurring,
    setEditingRecurring,
    removing,
    setRemoving,
    managementError,
    setManagementError,
    contributionGoal,
    setContributionGoal,
    contributionPeriod,
    setContributionPeriod,
    contributionLimit,
    setContributionLimit,
    categoryFilter,
    setCategoryFilter,
    transactionQuery,
    setTransactionQuery,
    transactionType,
    setTransactionType,
    month,
    setMonth,
    summaryError,
    setSummaryError,
    ledgerEnabled,
    setLedgerEnabled,
    savingsEntry,
    setSavingsEntry,
    loading,
    setLoading,
    busy,
    setBusy,
    message,
    setMessage,
    accountDataError,
    setAccountDataError,
    assetDataError,
    setAssetDataError,
    categories,
    setCategories,
    txs,
    setTxs,
    allocations,
    setAllocations,
    goals,
    setGoals,
    contributions,
    setContributions,
    recurring,
    setRecurring,
    occurrences,
    setOccurrences,
    accounts,
    setAccounts,
    accountTxs,
    setAccountTxs,
    accountCurrency,
    installments,
    guatemalaReady,
    currencyReady,
    installmentsError,
    currencyLoading,
    currencyError,
    installmentCard,
    setInstallmentCard,
    saveInstallment,
    endInstallment,
    transfers,
    setTransfers,
    assets,
    setAssets,
    netWorthSnapshots,
    setNetWorthSnapshots,
    members,
    setMembers,
    splits,
    setSplits,
    currentUser,
    setCurrentUser,
    detailTx,
    setDetailTx,
    receiptCounts,
    setReceiptCounts,
    showTxForm,
    setShowTxForm,
    editingTx,
    setEditingTx,
    showGoalForm,
    setShowGoalForm,
    showAccountForm,
    setShowAccountForm,
    editingAccount,
    setEditingAccount,
    showAssetForm,
    setShowAssetForm,
    editingAsset,
    setEditingAsset,
    showTransferForm,
    setShowTransferForm,
    showCategoryForm,
    setShowCategoryForm,
    budgetDraft,
    setBudgetDraft,
    budgetHalves,
    setBudgetHalves,
    periodDataError,
    setPeriodDataError,
    categoryGroupDraft,
    setCategoryGroupDraft,
    splitMethod,
    setSplitMethod,
    memberFinance,
    setMemberFinance,
    incomePlans,
    setIncomePlans,
    incomePlanError,
    setIncomePlanError,
    payDays,
    setPayDays,
    usdRateSetting,
    setUsdRateSetting,
    showImport,
    setShowImport,
    loadSequence,
    loadedFor,
    incomeScope,
    categoryRules,
    setCategoryRules,
    categoryCustom,
    setCategoryCustom,
    historyTxs,
    setHistoryTxs,
    historyContributions,
    setHistoryContributions,
    historyAllocations,
    setHistoryAllocations,
    comparisonRange,
    setComparisonRange,
    importBusy,
    settled,
    setSettled,
    settledVersion,
    setSettledVersion,
    settledError,
    setSettledError,
    settledNet,
    refreshReceiptCounts,
    load,
    cutoff,
    actualTxs,
    actualContributions,
    totals,
    actualByCategory,
    allocationByCategory,
    categoryName,
    memberName,
    accountName,
    accountBalances,
    patrimony,
    debtAccounts,
    cardStatus,
    shareContext,
    contributionRatios,
    makeSplitRows,
    activeRecurring,
    visibleOccurrences,
    occurrenceRecurring,
    recurringById,
    occurrenceStatus,
    recurringStats,
    incomeSummary,
    smartBudget,
    monthlyMetrics,
    currentMetric,
    previousMetric,
    metricDelta,
    categoryComparison,
    contributionOverview,
    saveContributionSettings,
    saveCategoryRules,
    payRecurringOccurrence,
    skipRecurringOccurrence,
    addTransaction,
    saveBudget,
    copyPreviousBudget,
    addCategory,
    editTransaction,
    deleteTransaction,
    addGoal,
    contribute,
    saveContribution,
    saveRecurring,
    removeEntry,
    saveAccount,
    archiveAccount,
    saveAsset,
    deleteAsset,
    addTransfer,
    deleteTransfer,
    moveMonth,
    openChartMonth,
    spendingRows,
    filteredTransactions,
    contributionRows,
    goalName,
    featuredGoal,
    featuredSaved
  };
}

export type FinanceWorkspace = ReturnType<typeof useFinanceWorkspace>;
export const FinanceContext = createContext<FinanceWorkspace | null>(null);
export function useFinance() {
  const value = useContext(FinanceContext);
  if (!value) throw new Error('useFinance must be used inside FinanceContext');
  return value;
}
