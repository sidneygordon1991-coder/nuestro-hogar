import HomePanorama from './HomePanorama';
import BalanceChart from './BalanceChart';
import MovementList from './MovementList';
import type {CashMovement} from './lib/cashFlow';
import {amountsHidden, formatMoney as money} from './lib/money';
import {useEffect, useId, useMemo, useRef, useState, type ReactNode} from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Coins,
  CreditCard,
  Ellipsis,
  EllipsisVertical,
  FileText,
  HeartPulse,
  Info,
  Landmark,
  Mountain,
  PiggyBank,
  RefreshCw,
  Wallet
} from 'lucide-react';
import {supabase} from './lib/supabase';
import {Amount, Illustration} from './ui';
import {fetchAllRows} from './lib/paging';
import {halfOf, toCents, type FinancePeriod} from './lib/financePeriods';
import {
  balanceTimeline,
  dailyAllowance,
  goalBalance,
  goalPace,
  homeActions,
  homeMargin,
  overviewAccounts,
  overviewGoal,
  overviewPeriod,
  periodBounds,
  scopeAccounts,
  scopeSource,
  type AccountMovement,
  type AccountTransfer,
  type BalanceTimeline,
  type FinanceScope,
  type HomeFinance,
  type OverviewAccount
} from './lib/homeOverview';
import {budgetPercent} from './lib/budgetProgress';
import {categoryIcon} from './BudgetCategoryProgress';
import HomeToday, {type Attention} from './HomeToday';
import FortnightRecap from './FortnightRecap';
import {HomeCards, HomePrivate, HomeSettlements} from './HomeExtras';
import {creditCardStatus, unreservedCardPayments, type CardAccount} from './lib/creditCards';
import type {InstallmentPlan} from './lib/installments';
import type {DailyAgendaItem} from './lib/dailyAgenda';
import HomeBudgetAvailability from './HomeBudgetAvailability';
import {accountAvailability} from './lib/homeAvailability';
import GoalVisual from './GoalVisual';

const shortDate = (date: string) =>
  new Date(date + 'T12:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'short'}).replace('.', '');
const accountNames: Record<string, string> = {
  cash: 'Efectivo',
  checking: 'Cuenta bancaria',
  savings: 'Ahorro',
  credit: 'Tarjeta',
  loan: 'Préstamo',
  mortgage: 'Hipoteca',
  investment: 'Inversión'
};
const tileTones = ['success', 'blue', 'warning', 'purple', 'accent', 'danger'] as const;

type Account = OverviewAccount & {owner_user_id?: string | null; is_shared?: boolean | null};
type Reconciliation = {account_id: string; cutoff: string};
export type AccountData = {
  accounts: Account[];
  movements: AccountMovement[];
  transfers: AccountTransfer[];
  reconciliations: Reconciliation[];
  installments?: InstallmentPlan[];
};
export type TodayInput = {
  notifications: Attention[];
  overdue: DailyAgendaItem[];
  agendaError: string;
  onOpenNotification: (item: Attention) => void;
};

export default function HomeMoneyWorkspace({
  householdName = '',
  householdId,
  userId,
  scope,
  shared,
  members = [],
  canEdit = false,
  demoAccounts,
  finance,
  onNavigate,
  onRefresh,
  agenda,
  agendaFirst = false,
  today,
  canHealth,
  cover,
  essential = true
}: {
  householdName?: string;
  householdId: string;
  userId: string;
  scope: FinanceScope;
  shared: boolean;
  members?: {user_id: string; full_name: string}[];
  canEdit?: boolean;
  demoAccounts?: AccountData;
  finance: HomeFinance;
  onNavigate: (tab: string) => void;
  onRefresh: () => void;
  agenda: ReactNode;
  agendaFirst?: boolean;
  today: TodayInput;
  canHealth: boolean;
  cover: string;
  essential?: boolean;
}) {
  const agendaSlot = <div className="home-agenda-slot">{agenda}</div>;
  const fullSource = finance.source!;
  const source = useMemo(
    () => scopeSource(fullSource, scope, userId, finance.privateEntries || [], finance.splits || []),
    [fullSource, scope, userId, finance.privateEntries, finance.splits]
  );
  const [period, setPeriod] = useState<FinancePeriod>(() => halfOf(fullSource.today));
  const [accountState, setAccountState] = useState<{data: AccountData | null; loading: boolean; error: string}>({
    data: null,
    loading: true,
    error: ''
  });
  const [accountAttempt, setAccountAttempt] = useState(0),
    [showAccounts, setShowAccounts] = useState(false),
    [showBudgets, setShowBudgets] = useState(false),
    [calculation, setCalculation] = useState(false);
  const sequence = useRef(0);
  const [recap, setRecap] = useState<null | 'first' | 'second'>(null);
  useEffect(() => {
    const request = ++sequence.current;
    // The example preview never touches the server.
    if (demoAccounts) {
      setAccountState({data: demoAccounts, loading: false, error: ''});
      return;
    }
    setAccountState(s => ({...s, loading: true, error: ''}));
    (async () => {
      try {
        const [accounts, movements, transfers, reconciliations, installments] = await Promise.all([
          fetchAllRows((a, b) =>
            supabase
              .from('finance_accounts')
              .select(
                'id,name,account_type,account_class,opening_balance,institution,active,owner_user_id,is_shared,statement_day,payment_due_day,minimum_payment,credit_limit,apr'
              )
              .eq('household_id', householdId)
              .eq('active', true)
              .order('id')
              .range(a, b)
          ),
          fetchAllRows((a, b) =>
            supabase
              .from('transactions')
              .select('id,account_id,type,amount,transaction_date')
              .eq('household_id', householdId)
              .lte('transaction_date', fullSource.today)
              .not('account_id', 'is', null)
              .order('id')
              .range(a, b)
          ),
          fetchAllRows((a, b) =>
            supabase
              .from('finance_transfers')
              .select('id,from_account_id,to_account_id,amount,transfer_date')
              .eq('household_id', householdId)
              .lte('transfer_date', fullSource.today)
              .order('id')
              .range(a, b)
          ),
          // Reconciliation history is optional context: an error here never hides balances.
          supabase
            .from('account_reconciliations')
            .select('account_id,cutoff')
            .eq('household_id', householdId)
            .order('cutoff', {ascending: false})
            .limit(500)
            .then((r: any) => (r.error ? [] : r.data || [])),
          // Visacuotas/extrafinanciamiento (v33): optional too; without them a card is due in full, as before.
          fetchAllRows<InstallmentPlan>((from, to) =>
            supabase
              .from('card_installments')
              .select('id,account_id,kind,description,principal,months,annual_rate,first_statement,active')
              .eq('household_id', householdId)
              .eq('active', true)
              .order('id')
              .range(from, to)
          ).catch((error: any) => {
            if (['42P01', 'PGRST205'].includes(String(error?.code))) return [];
            throw error;
          })
        ]);
        if (request === sequence.current)
          setAccountState({
            data: {accounts, movements, transfers, reconciliations, installments},
            loading: false,
            error: ''
          });
      } catch {
        if (request === sequence.current)
          setAccountState({data: null, loading: false, error: 'No pudimos verificar los saldos de las cuentas.'});
      }
    })();
    return () => {
      sequence.current++;
    };
  }, [householdId, fullSource, accountAttempt]);

  const accounts = useMemo(
    () => (accountState.data ? scopeAccounts(accountState.data.accounts, scope, userId) : []),
    [accountState.data, scope, userId]
  );
  const accountRows = useMemo(
    () =>
      accountState.data
        ? overviewAccounts(accounts, accountState.data.movements, accountState.data.transfers, source.today)
        : [],
    [accounts, accountState.data, source.today]
  );
  const liquidRows = accountRows.filter(a => a.liquid);
  const recorded = accountAvailability(accountRows);
  const liquid = liquidRows.length ? liquidRows.reduce((n, a) => n + toCents(a.balance), 0) / 100 : null;
  const monthly = useMemo(() => overviewPeriod(source, 'month'), [source]);
  const timeline = useMemo(
    () =>
      balanceTimeline(
        source,
        period,
        accountState.data
          ? {accounts, movements: accountState.data.movements, transfers: accountState.data.transfers}
          : null
      ),
    [source, period, accounts, accountState.data]
  );
  const cards = useMemo(
    () =>
      accountState.data
        ? creditCardStatus(
            accounts as CardAccount[],
            accountState.data.movements,
            accountState.data.transfers,
            source.today,
            accountState.data.installments || []
          )
        : [],
    [accounts, accountState.data, source.today]
  );
  // Cards due this month (or with no due day configured) are paid from the same liquid money.
  const monthEndDate = periodBounds(fullSource.month, 'month').end;
  // A card already planned as a pending recurring payment ("Pago Visa", "Tarjeta …") is counted there, not twice.
  const cardsDue = unreservedCardPayments(cards, source, monthEndDate);
  // Goals belong to the household: the personal lens does not reserve them from personal accounts.
  const goalSaved =
    scope === 'household' ? goalBalance(finance.goals || [], finance.goalEntries || [], source.today) : 0;
  const margin = homeMargin(monthly.flow, accountState.loading ? null : liquid, {goalSaved, cardsDue});
  // The three figures always add up: registered − pending (payments and cards) − reserved (goals and plan) = margin.
  const dueTotal = (toCents(margin.pending) + toCents(margin.cards)) / 100,
    reservedTotal = (toCents(margin.reserved) + toCents(margin.goals)) / 100;
  const allowance = dailyAllowance(margin.margin, timeline);
  const dayOfMonth = Number(fullSource.today.slice(8)),
    monthEnd = Number(periodBounds(fullSource.month, 'second').end.slice(8));
  // Near the end of a fortnight (or right after the first one closes) the recap is offered as today's action.
  const recapPeriod: 'first' | 'second' | null =
    dayOfMonth >= 13 && dayOfMonth <= 15
      ? 'first'
      : dayOfMonth === 16 || dayOfMonth === 17
        ? 'first'
        : dayOfMonth >= monthEnd - 2
          ? 'second'
          : null;
  const masked = amountsHidden(); // memoized texts embed formatted amounts
  const actions = useMemo(() => {
    const base = homeActions({
      source,
      accounts: accountRows,
      reconciliations: accountState.data?.reconciliations || [],
      today: source.today
    });
    return [
      ...cards
        .filter(c => c.state === 'soon' || c.state === 'overdue')
        .map(c => ({
          id: 'card-' + c.id,
          kind: 'card' as const,
          title: 'Pagar ' + c.name,
          detail:
            money(c.toAvoidInterest) +
            (c.dueDate ? (c.state === 'overdue' ? ' · venció el ' : ' · antes del ') + shortDate(c.dueDate) : ''),
          route: 'presupuesto:accounts'
        })),
      ...base.filter(a => a.kind === 'payment'),
      // The recap goes right after money that is due, ahead of housekeeping (reconcile, review).
      ...(recapPeriod && scope === 'household' && source.transactions.length
        ? [
            {
              id: 'recap',
              kind: 'recap' as const,
              title: 'Tu resumen de quincena está listo',
              detail: 'Mira cómo les fue y compártelo',
              route: 'nh:recap'
            }
          ]
        : []),
      ...base.filter(a => a.kind !== 'payment')
    ];
  }, [source, accountRows, accountState.data, cards, recapPeriod, scope, masked]);
  const goals = useMemo(
    () => (finance.goals || []).map(goal => overviewGoal(goal, finance.goalEntries || [], source.today)),
    [finance.goals, finance.goalEntries, source.today]
  );
  const goal = goals.find(g => g.progress < 100) || goals[0];
  const pace = goal ? goalPace(goal, source.today) : null;
  const reconciledCutoff = useMemo(() => {
    const rec = accountState.data?.reconciliations || [];
    if (!liquidRows.length) return null;
    const latest = liquidRows.map(a => rec.find(r => r.account_id === a.id)?.cutoff || '');
    return latest.every(Boolean) ? latest.sort()[0] : null;
  }, [accountState.data, liquidRows]);
  const half = halfOf(source.today),
    bounds = periodBounds(source.month, half);
  const fortnightLabel = Number(bounds.start.slice(8)) + '–' + shortDate(bounds.end);
  // The budget card always shows the month: plans are saved monthly and the image of each rubro stays stable.
  const budgets = monthly.budgets,
    visibleBudgets = showBudgets ? budgets : budgets.slice(0, 3);
  const pendingLoading = accountState.loading || Boolean(accountState.error);
  const chip = accountState.error
    ? 'No pudimos verificar tus cuentas'
    : pendingLoading
      ? 'Verificando saldos…'
      : margin.basis === 'accounts'
        ? reconciledCutoff
          ? 'Última conciliación al ' + shortDate(reconciledCutoff)
          : 'Saldos registrados al ' + shortDate(source.today)
        : 'Sin cuentas líquidas registradas';
  const baseLabel = accountState.error
    ? 'Dinero por verificar'
    : margin.basis === 'accounts'
      ? 'Dinero en cuentas'
      : 'Dinero en cuentas';
  const personalEmpty = scope === 'personal' && !source.transactions.length && !source.plans.length && !accounts.length;

  return (
    <div className="home-grid" data-scope={scope}>
      <HomePanorama month={source.month} today={source.today} figures={monthly.flow} onNavigate={onNavigate} />
      <div className="home-main">
        {scope === 'personal' && (
          <p className="home-scope-note">
            Personal muestra tus ingresos, tus gastos personales y tu parte de los gastos compartidos. Los integrantes
            con acceso a Finanzas aún pueden consultarlos. Las metas y los avisos siguen siendo del hogar.
          </p>
        )}
        {personalEmpty && (
          <p className="home-scope-note" role="status">
            <Info size={16} aria-hidden="true" /> Aún no tienes movimientos ni cuentas marcados como personales. Al
            registrar, elige <b>Personal</b> para verlos aquí.
          </p>
        )}

        <section className="home-hero" aria-labelledby="home-margin-label">
          <HomeBudgetAvailability
            key={[householdId, userId, scope, fullSource.month].join(':')}
            householdId={householdId}
            userId={userId}
            members={members}
            finance={finance}
            scope={scope}
            demo={Boolean(demoAccounts)}
            onNavigate={onNavigate}
          />
          <div className="home-recorded-money">
            {cover && <img src={cover} alt="" className="home-hero-cover" />}
            <Leaves />
            <div className="home-hero-top">
              <span className="home-hero-icon" aria-hidden="true">
                <Coins />
              </span>
              <span className="home-hero-chip">{chip}</span>
              <MoreMenu
                label="Opciones del margen"
                className="home-hero-more"
                icon={<Ellipsis />}
                items={[
                  ...(!pendingLoading
                    ? [
                        {
                          label: calculation ? 'Ocultar compromisos' : 'Ver compromisos y metas',
                          onSelect: () => setCalculation(v => !v)
                        }
                      ]
                    : []),
                  {label: 'Ver cuentas', onSelect: () => onNavigate('presupuesto:accounts')},
                  {label: 'Ver movimientos', onSelect: () => onNavigate('presupuesto:transactions')}
                ]}
              />
            </div>
            <div className="home-hero-body">
              <p id="home-margin-label" className="home-hero-label">
                Cuentas y efectivo
              </p>
              <h2 className={'home-liquid-total ' + (recorded.total < 0 ? 'is-negative' : '')}>
                {pendingLoading ? (
                  <span className="home-skeleton-text">Q —</span>
                ) : (
                  <Amount value={recorded.total} animate />
                )}
              </h2>
              <p className="home-hero-sub">
                {recorded.count
                  ? 'Saldo registrado hoy, independiente del presupuesto'
                  : 'Agrega tus cuentas y su saldo inicial para ubicar tu dinero'}
              </p>
              <p className="home-hero-sub">No suma ingresos por recibir ni límites de tarjetas.</p>
              {!pendingLoading && (
                <button
                  type="button"
                  className="home-hero-calc-toggle"
                  aria-expanded={calculation}
                  onClick={() => setCalculation(v => !v)}
                >
                  {calculation ? 'Ocultar compromisos' : 'Ver compromisos y metas'}{' '}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </button>
              )}
            </div>
            {calculation && !pendingLoading && (
              <div className="home-hero-calc">
                <div>
                  <span>
                    {margin.basis === 'accounts'
                      ? 'Dinero registrado en efectivo y cuentas'
                      : 'Ingresos − gastos − ahorro del mes'}
                  </span>
                  <b>{money(margin.base)}</b>
                </div>
                {margin.goals > 0 && (
                  <div>
                    <span>Apartado en tus metas de ahorro</span>
                    <b>− {money(margin.goals)}</b>
                  </div>
                )}
                {margin.cards > 0 && (
                  <div>
                    <span>Tarjetas por pagar este mes</span>
                    <b>− {money(margin.cards)}</b>
                  </div>
                )}
                <div>
                  <span>Pagos y fijos pendientes del mes</span>
                  <b>− {money(margin.pending)}</b>
                </div>
                <div>
                  <span>Ahorro del plan aún por apartar</span>
                  <b>− {money(margin.reserved)}</b>
                </div>
                <div className="home-hero-calc-total">
                  <span>Margen después de compromisos</span>
                  <b>{money(margin.margin)}</b>
                </div>
                <p>
                  {margin.basis === 'accounts'
                    ? 'Usa los saldos registrados de tus cuentas líquidas (efectivo, bancos y ahorro), descuenta lo que ya apartaste para metas y lo que debes pagar de tus tarjetas este mes. No incluye inversiones.'
                    : 'Aún no hay cuentas registradas: se usa el resultado registrado del mes.'}{' '}
                  No descuenta el presupuesto variable que todavía podrías usar ni suma ingresos esperados.
                </p>
                <p>
                  Este margen adicional es {money(margin.margin)}.{' '}
                  {allowance.perDay >= 1
                    ? `${money(Math.floor(allowance.perDay))} por día hasta el ${shortDate(allowance.until)}.`
                    : 'Sin margen para gastos variables.'}{' '}
                  No es el presupuesto restante del período.
                </p>
              </div>
            )}
            <div className="home-hero-minis" aria-label="Distribución del dinero registrado">
              <button type="button" onClick={() => onNavigate('presupuesto:accounts')}>
                <Landmark aria-hidden="true" />
                <span>
                  <small>Bancos y ahorro</small>
                  <strong>{pendingLoading ? 'Q —' : money(recorded.bank)}</strong>
                </span>
              </button>
              <button type="button" onClick={() => onNavigate('presupuesto:accounts')}>
                <Wallet aria-hidden="true" />
                <span>
                  <small>Efectivo</small>
                  <strong>{pendingLoading ? 'Q —' : money(recorded.cash)}</strong>
                </span>
              </button>
            </div>
          </div>
        </section>

        <details className="home-overview-details" open={essential ? undefined : true}>
          <summary>
            Pagos y ahorro del mes <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <section className="home-kpis" aria-label="Resumen de tu dinero">
            <Kpi
              tone="accent"
              icon={<Wallet />}
              label={baseLabel}
              value={pendingLoading ? null : recorded.total}
              hint="Saldos de bancos, ahorro y efectivo registrados"
              onClick={() => onNavigate('presupuesto:accounts')}
            />
            <Kpi
              tone="warning"
              icon={<FileText />}
              label="Pagos pendientes"
              value={dueTotal}
              hint={
                margin.cards > 0 ? 'Pagos, fijos y tarjetas por cubrir este mes' : 'Pagos y fijos por cubrir este mes'
              }
              onClick={() => onNavigate('presupuesto:recurring')}
            />
            <Kpi
              tone="success"
              icon={<PiggyBank />}
              label="Ahorro reservado"
              value={reservedTotal}
              hint={margin.goals > 0 ? 'Lo apartado en metas y el ahorro del plan' : 'Ahorro del plan aún por apartar'}
              onClick={() => onNavigate('presupuesto:goals')}
            />
          </section>
        </details>

        <section className="home-card home-fortnight" aria-labelledby="home-fortnight-title">
          <div className="home-card-head">
            <h3 id="home-fortnight-title">{period === 'month' ? 'Tu mes, día a día' : 'Tu quincena'}</h3>
            <div className="home-segmented home-segmented--small" role="group" aria-label="Período de la gráfica">
              <button type="button" aria-pressed={period !== 'month'} onClick={() => setPeriod(half)}>
                {fortnightLabel}
              </button>
              <button type="button" aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>
                Mes
              </button>
            </div>
            <div className="home-legend" aria-hidden="true">
              <span>
                <i className="solid" />
                Registrado
              </span>
              <span>
                <i className="dashed" />
                Proyectado
              </span>
            </div>
            <MoreMenu
              label="Opciones de la gráfica"
              className="home-card-more"
              icon={<Ellipsis />}
              items={[
                {label: 'Abrir quincenas', onSelect: () => onNavigate('presupuesto:fortnight')},
                {label: 'Ver pagos recurrentes', onSelect: () => onNavigate('presupuesto:recurring')},
                {
                  label: 'Resumen de la quincena',
                  onSelect: () => setRecap(halfOf(fullSource.today) as 'first' | 'second')
                }
              ]}
            />
          </div>
          {accountState.loading ? (
            <p className="home-caption" role="status">
              {accountState.error
                ? 'Reintenta la consulta de Tus cuentas para verificar la gráfica y el margen.'
                : 'Verificando saldos para la gráfica…'}
            </p>
          ) : (
            <>
              <p className="home-caption home-chart-purpose">
                {accountState.error
                  ? 'Ingresos y gastos del período. Los saldos de cuentas siguen pendientes de verificar.'
                  : timeline.basis === 'accounts'
                    ? 'Cómo cambian tus saldos registrados y los compromisos que vienen.'
                    : 'Cómo evolucionan tus ingresos, gastos y compromisos del período.'}
              </p>
              <BalanceChart key={source.month + period + scope} timeline={timeline} source={source} />
              <TimelineStatus timeline={timeline} onNavigate={onNavigate} />
            </>
          )}
        </section>

        <section className="home-card home-budget" aria-labelledby="home-budget-title">
          <div className="home-card-head">
            <h3 id="home-budget-title">Así va tu presupuesto</h3>
            <button type="button" className="home-link" onClick={() => onNavigate('presupuesto:budget')}>
              Ver todos
            </button>
          </div>
          {monthly.flow.excludedExpense > 0 && (
            <p className="home-caption">
              Fuera del presupuesto: {money(monthly.flow.excludedExpense)}. Incluido en el saldo real.
            </p>
          )}
          {budgets.length ? (
            <ul className="home-budget-list">
              {visibleBudgets.map((c, i) => (
                <BudgetRow
                  key={c.id}
                  index={i}
                  category={c}
                  onNavigate={onNavigate}
                  movements={source.transactions.filter(
                    t =>
                      t.category_id === c.id &&
                      t.type === 'expense' &&
                      t.transaction_date.slice(0, 7) === source.month.slice(0, 7) &&
                      t.transaction_date <= source.today
                  )}
                />
              ))}
            </ul>
          ) : (
            <div className="home-empty home-empty--art">
              <Illustration name="budget" size={84} />
              <div>
                <strong>
                  {scope === 'personal' ? 'Sin gastos personales en este período' : 'Dale un destino a tu dinero'}
                </strong>
                <p>
                  {scope === 'personal'
                    ? 'Los presupuestos son del hogar; aquí verás tus gastos personales por rubro.'
                    : 'Guarda tu presupuesto para ver cuánto queda en cada rubro.'}
                </p>
              </div>
              {scope !== 'personal' && (
                <button type="button" className="home-link" onClick={() => onNavigate('presupuesto:budget')}>
                  Configurar presupuesto <ArrowRight size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          {budgets.length > 3 && (
            <button
              type="button"
              className="home-link home-more"
              aria-expanded={showBudgets}
              onClick={() => setShowBudgets(v => !v)}
            >
              {showBudgets ? 'Mostrar menos' : 'Ver los ' + budgets.length + ' rubros'}
            </button>
          )}
        </section>

        {!agendaFirst && agendaSlot}
      </div>

      <aside className="home-side" aria-label="Prioridades, metas y cuentas">
        {agendaFirst && agendaSlot}
        <HomeToday
          notifications={today.notifications}
          actions={actions}
          overdue={today.overdue}
          agendaError={today.agendaError}
          onOpenNotification={today.onOpenNotification}
          onNavigate={route =>
            route === 'nh:recap'
              ? setRecap(recapPeriod || (halfOf(fullSource.today) as 'first' | 'second'))
              : onNavigate(route)
          }
        />

        <section className="home-card home-goal" aria-labelledby="home-goal-title">
          <div className="home-card-head">
            <h3 id="home-goal-title">
              {scope === 'personal' ? 'Meta del hogar' : shared ? 'Nuestra próxima meta' : 'Tu próxima meta'}
            </h3>
          </div>
          {goal && (
            <GoalVisual
              key={householdId + ':' + userId + ':' + goal.id}
              userId={userId}
              householdId={householdId}
              goal={goal}
              saved={goal.saved}
              editable={canEdit}
            />
          )}
          {goal ? (
            <button type="button" className="home-goal-body" onClick={() => onNavigate('presupuesto:goals')}>
              <span className="home-goal-icon" aria-hidden="true">
                <Mountain />
              </span>
              <span className="home-goal-copy">
                <strong>{goal.name}</strong>
                <span>
                  <b>{money(goal.saved)}</b> de {money(Number(goal.target_amount))}
                </span>
              </span>
              <span
                className="home-progress"
                role="progressbar"
                aria-label={'Avance de ' + goal.name}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.floor(goal.progress)}
              >
                <i style={{width: goal.progress + '%'}} />
              </span>
              <small>
                {Math.floor(goal.progress)}% completado
                {goal.target_date ? ' · meta al ' + shortDate(goal.target_date) : ''}
              </small>
              {pace && pace.state !== 'done' && (
                <span className="home-goal-pace">
                  {pace.state === 'on-track' ? (
                    <>
                      Aparta <b>{money(Math.ceil(pace.perFortnight!))}</b> por quincena para llegar a tiempo
                    </>
                  ) : pace.state === 'late' ? (
                    <>La fecha ya pasó: faltan {money(pace.remaining)}</>
                  ) : (
                    <>Ponle fecha para saber cuánto apartar por quincena</>
                  )}
                </span>
              )}
            </button>
          ) : (
            <div className="home-empty home-empty--art">
              <Illustration name="goal" size={84} />
              <div>
                <strong>Tu próximo logro empieza aquí</strong>
                <p>Define una meta y registra tus aportes.</p>
              </div>
            </div>
          )}
          <button type="button" className="home-link" onClick={() => onNavigate('presupuesto:goals')}>
            {goal ? 'Ver meta' : 'Crear una meta'} <ArrowRight size={15} aria-hidden="true" />
          </button>
        </section>

        {scope === 'household' && shared && (
          <HomeSettlements
            householdId={householdId}
            userId={userId}
            month={fullSource.month}
            members={members}
            transactions={fullSource.transactions}
            splits={finance.splits || []}
            settlements={finance.settlements || []}
            canEdit={canEdit}
            onSaved={onRefresh}
          />
        )}
        {scope === 'personal' && (
          <HomePrivate entries={finance.privateEntries || []} canEdit={canEdit} onChanged={onRefresh} />
        )}
        <HomeCards cards={cards} onNavigate={onNavigate} />

        {canHealth && (
          <section className="home-card home-health" aria-labelledby="home-health-title">
            <div className="home-health-row">
              <span className="home-goal-icon" aria-hidden="true">
                <HeartPulse />
              </span>
              <div>
                <h3 id="home-health-title">Salud del hogar</h3>
                <p>Consulta qué está cambiando</p>
              </div>
            </div>
            <button type="button" className="home-link" onClick={() => onNavigate('salud')}>
              Ver diagnóstico <ArrowRight size={15} aria-hidden="true" />
            </button>
          </section>
        )}

        <section className="home-card home-accounts" aria-labelledby="home-accounts-title">
          <div className="home-card-head">
            <h3 id="home-accounts-title">Tus cuentas</h3>
            <button
              type="button"
              className="home-icon-button"
              aria-label="Actualizar cuentas"
              onClick={() => setAccountAttempt(v => v + 1)}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {accountState.loading ? (
            <p role="status" className="home-caption">
              Verificando saldos registrados…
            </p>
          ) : accountState.error ? (
            <div role="alert" className="home-empty">
              <AlertTriangle aria-hidden="true" />
              <div>
                <p>{accountState.error}</p>
              </div>
              <button type="button" className="home-link" onClick={() => setAccountAttempt(v => v + 1)}>
                Reintentar cuentas
              </button>
            </div>
          ) : (
            <>
              {accountRows.length > 0 && (
                <ul className="home-account-list">
                  {(showAccounts ? accountRows : accountRows.slice(0, 3)).map(a => (
                    <li key={a.id}>
                      <button type="button" onClick={() => onNavigate('presupuesto:accounts')}>
                        <span className="home-tile home-tile--accent" aria-hidden="true">
                          {a.account_type === 'credit' ? (
                            <CreditCard />
                          ) : a.account_type === 'cash' ? (
                            <Wallet />
                          ) : (
                            <Landmark />
                          )}
                        </span>
                        <span className="home-account-copy">
                          <strong>{a.name}</strong>
                          <small>
                            {accountNames[a.account_type] || 'Cuenta'}
                            {a.account_class === 'liability' ? ' · Deuda' : !a.liquid ? ' · No líquida' : ''}
                          </small>
                        </span>
                        <b className={a.balance < 0 ? 'is-negative' : ''}>{money(a.balance)}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!accountRows.length && (
                <div className="home-empty home-empty--art">
                  <Illustration name="accounts" size={84} />
                  <div>
                    <strong>{scope === 'personal' ? 'Sin cuentas personales' : 'Ubica tu dinero'}</strong>
                    <p>Agrega efectivo, cuentas o tarjetas con su saldo inicial para ver tu dinero registrado.</p>
                  </div>
                </div>
              )}
              {accountRows.length > 3 && (
                <button
                  type="button"
                  className="home-link home-more"
                  aria-expanded={showAccounts}
                  onClick={() => setShowAccounts(v => !v)}
                >
                  {showAccounts ? 'Mostrar menos' : 'Ver las ' + accountRows.length + ' cuentas'}
                </button>
              )}
            </>
          )}
          <button type="button" className="home-link" onClick={() => onNavigate('presupuesto:accounts')}>
            Administrar y conciliar <ArrowRight size={15} aria-hidden="true" />
          </button>
        </section>
        {recap && (
          <FortnightRecap
            source={source}
            period={recap}
            householdId={householdId}
            householdName={householdName}
            goal={goal ? {name: goal.name, progress: goal.progress} : null}
            onClose={() => setRecap(null)}
          />
        )}
        <button type="button" className="home-link home-refresh" onClick={onRefresh}>
          <RefreshCw size={15} aria-hidden="true" /> Actualizar resumen
        </button>
      </aside>
    </div>
  );
}

function Kpi({
  tone,
  icon,
  label,
  value,
  hint,
  onClick
}: {
  tone: string;
  icon: ReactNode;
  label: string;
  value: number | null;
  hint: string;
  onClick: () => void;
}) {
  const text = value === null ? 'Q —' : money(value);
  return (
    <button type="button" className="home-kpi" onClick={onClick} title={hint}>
      <span className={'home-tile home-tile--soft-' + tone} aria-hidden="true">
        {icon}
      </span>
      <span className="home-kpi-copy">
        <small>{label}</small>
        <strong className={text.length > 12 ? 'is-long' : ''}>{text}</strong>
        <span className="sr-only">{hint}</span>
      </span>
    </button>
  );
}

type BudgetCategory = ReturnType<typeof overviewPeriod>['budgets'][number];
function BudgetRow({
  category,
  index,
  onNavigate,
  movements
}: {
  category: BudgetCategory;
  movements: CashMovement[];
  index: number;
  onNavigate: (tab: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const p = category.progress,
    Icon = categoryIcon(category.name, category.icon),
    tone = tileTones[index % tileTones.length];
  const planned = p.planned > 0,
    over = p.excess > 0;
  return (
    <li className={'home-budget-row is-' + p.state}>
      <span
        className="home-tile home-tile--solid"
        style={{['--tile' as string]: 'var(--nh-chart-' + tone + ')'}}
        aria-hidden="true"
      >
        <Icon />
      </span>
      <button
        type="button"
        className="home-budget-name home-budget-explore"
        aria-expanded={expanded}
        onClick={() => setExpanded(v => !v)}
        aria-label={'Explorar gastos de ' + category.name}
      >
        <strong>{category.name}</strong>
        <small>
          {planned ? money(p.planned) + ' en total' : 'Sin presupuesto asignado'} ·{' '}
          <span>{expanded ? 'Ocultar' : 'Ver gastos'}</span>
        </small>
      </button>
      <span
        className="home-budget-bar"
        role="progressbar"
        aria-label={'Uso del presupuesto de ' + category.name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p.fill)}
        aria-valuetext={
          planned
            ? p.usedPercent === null
              ? ''
              : budgetPercent(p.usedPercent) + ' utilizado'
            : money(p.spent) + ' gastados sin presupuesto'
        }
      >
        <i
          style={{
            width: (planned ? p.fill : 100) + '%',
            ['--tile' as string]: over ? 'var(--nh-chart-danger)' : 'var(--nh-chart-' + tone + ')'
          }}
        />
      </span>
      <span className="home-budget-amount">
        {planned ? (
          <>
            <strong className={over ? 'is-negative' : ''}>
              {over ? '− ' + money(p.excess) : money(p.remaining)} <span>{over ? 'excedido' : 'disponibles'}</span>
            </strong>
            <small>
              {over
                ? 'Sobre el presupuesto'
                : (p.availablePercent === null ? '' : budgetPercent(p.availablePercent)) + ' disponible'}
            </small>
          </>
        ) : (
          <>
            <strong>
              {money(p.spent)} <span>gastados</span>
            </strong>
            <small>Sin presupuesto</small>
          </>
        )}
      </span>
      {expanded && (
        <div className="home-category-detail" role="region" aria-label={'Movimientos de ' + category.name}>
          <MovementList rows={movements} empty="Todavía no hay gastos registrados de este rubro en la vista elegida." />
          <button type="button" className="home-link" onClick={() => onNavigate('presupuesto:transactions')}>
            Abrir Movimientos <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      <MoreMenu
        label={'Opciones de ' + category.name}
        className="home-row-more"
        icon={<EllipsisVertical />}
        items={[
          {label: 'Ver movimientos', onSelect: () => onNavigate('presupuesto:transactions')},
          {label: 'Ajustar presupuesto', onSelect: () => onNavigate('presupuesto:budget')}
        ]}
      />
    </li>
  );
}

/** Small accessible overflow menu: closes on outside click, Escape and selection. */
function MoreMenu({
  label,
  icon,
  items,
  className = ''
}: {
  label: string;
  icon: ReactNode;
  items: {label: string; onSelect: () => void}[];
  className?: string;
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', key);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={root} className={'home-more-menu ' + className}>
      <button
        type="button"
        className="home-icon-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(v => !v)}
      >
        {icon}
      </button>
      {open && (
        <div id={id} role="menu" className="home-menu-popover">
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineStatus({timeline, onNavigate}: {timeline: BalanceTimeline; onNavigate: (tab: string) => void}) {
  const [info, setInfo] = useState(false);
  const explore = () => {
    onNavigate('presupuesto:summary');
    focusWhenReady('finance-simulator');
  };
  let tone = 'success',
    icon = <CheckCircle2 size={18} />,
    text = 'Tus pagos del período están cubiertos',
    action = (
      <button type="button" onClick={() => onNavigate('presupuesto:recurring')}>
        Ver pagos <ArrowRight size={14} />
      </button>
    );
  if (timeline.status === 'negative') {
    tone = 'danger';
    icon = <AlertTriangle size={18} />;
    text = 'Tu saldo proyectado quedaría en negativo el ' + shortDate(timeline.lowest!.date);
    action = (
      <button type="button" onClick={explore}>
        Explorar escenario <ArrowRight size={14} />
      </button>
    );
  } else if (timeline.status === 'tight') {
    tone = 'warning';
    icon = <AlertTriangle size={18} />;
    text = 'Revisa tus pagos antes del próximo ingreso';
    action = (
      <button type="button" onClick={explore}>
        Explorar escenario <ArrowRight size={14} />
      </button>
    );
  } else if (timeline.status === 'closed') {
    tone = 'neutral';
    icon = <CalendarDays size={18} />;
    text =
      'Período cerrado · resultado registrado ' +
      money(timeline.registered.length ? timeline.registered[timeline.registered.length - 1].balance : 0);
    action = (
      <button type="button" onClick={() => onNavigate('presupuesto:fortnight')}>
        Ver quincenas <ArrowRight size={14} />
      </button>
    );
  } else if (!timeline.pendingPayments) {
    text = 'No tienes pagos recurrentes pendientes en este período';
  }
  return (
    <>
      <div className={'home-status home-status--' + tone} role="status">
        <span aria-hidden="true">{icon}</span>
        <p>{text}</p>
        {action}
      </div>
      <button type="button" className="home-info-toggle" aria-expanded={info} onClick={() => setInfo(v => !v)}>
        <Info size={14} aria-hidden="true" /> ¿Cómo se calcula?
      </button>
      {info && (
        <p className="home-caption">
          {timeline.basis === 'accounts'
            ? 'La línea registrada usa los saldos de tus cuentas líquidas.'
            : 'La línea registrada usa el resultado del mes (ingresos − gastos − ahorro), porque aún no hay cuentas registradas.'}{' '}
          La proyección descuenta los pagos recurrentes pendientes en su fecha de vencimiento y suma el ingreso esperado
          del período el último día, porque ese ingreso no tiene fecha registrada. No incluye el presupuesto variable
          que aún podrías gastar.
        </p>
      )}
    </>
  );
}

/** Waits for a lazily loaded section to render before scrolling to it. */
function focusWhenReady(id: string, tries = 20) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
    return;
  }
  if (tries > 0) window.setTimeout(() => focusWhenReady(id, tries - 1), 150);
}

function Leaves() {
  return (
    <svg className="home-hero-leaves" viewBox="0 0 220 160" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <path d="M150 160c-6-38 6-79 52-104-8 41-24 77-52 104z" opacity=".55" />
        <path d="M120 160c-24-26-32-62-16-104 24 30 32 66 16 104z" opacity=".4" />
        <path d="M176 160c10-28 30-48 60-58-10 26-32 46-60 58z" opacity=".35" />
        <path d="M92 160c-30-8-52-30-60-62 32 8 52 30 60 62z" opacity=".28" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".55">
        <path d="M150 160c8-36 24-70 52-104" />
        <path d="M120 160c2-36-2-72-16-104" />
        <path d="M176 160c16-24 36-44 60-58" />
      </g>
    </svg>
  );
}
