import {useEffect, useMemo, useState} from 'react';
import {CalendarDays, ArrowUpRight} from 'lucide-react';
import {Amount} from './ui';
import {formatMoney as money} from './lib/money';
import {halfOf, type FinancePeriod} from './lib/financePeriods';
import {effectiveCycle, type PayCycle} from './lib/payCycles';
import type {IncomePlan} from './lib/monthlyIncome';
import {availabilityWindow, homeBudgetAvailability} from './lib/homeAvailability';
import {scopeSource, type HomeFinance, type FinanceScope, type PrivateEntry} from './lib/homeOverview';
import type {CashFlowSource, CashMovement} from './lib/cashFlow';
import {fetchAllRows} from './lib/paging';
import {supabase} from './lib/supabase';
import './styles/components/home-availability.css';
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('es-GT', {day: 'numeric', month: 'short', timeZone: 'UTC'}).format(
    new Date(date + 'T12:00:00Z')
  );

/** Read-only period view. Account balances are deliberately calculated elsewhere, through today's ledger. */
export default function HomeBudgetAvailability({
  householdId,
  userId,
  finance,
  scope,
  demo = false,
  members = [],
  onNavigate
}: {
  householdId: string;
  userId: string;
  finance: HomeFinance;
  scope: FinanceScope;
  demo?: boolean;
  members?: {user_id: string; full_name: string}[];
  onNavigate: (route: string) => void;
}) {
  const full = finance.source!;
  const [dateChoice, setDateChoice] = useState('auto'),
    [periodChoice, setPeriodChoice] = useState<FinancePeriod | 'current'>('current');
  const [incomeBasis, setIncomeBasis] = useState<'received' | 'expected'>('received');
  const [attempt, setAttempt] = useState(0),
    [detail, setDetail] = useState(false);
  const [meta, setMeta] = useState<{ready: boolean; error: boolean; cycles: Record<string, PayCycle>}>({
    ready: false,
    error: false,
    cycles: {}
  });
  useEffect(() => {
    let live = true;
    if (
      demo ||
      !userId ||
      full.members.every(m =>
        full.plans.some(
          p =>
            p.user_id === m.user_id && p.month === full.month && p.cycle_first_day != null && p.cycle_second_day != null
        )
      )
    ) {
      setMeta({ready: true, error: false, cycles: {}});
      return;
    }
    setMeta({ready: false, error: false, cycles: {}});
    (async () => {
      try {
        const {data, error} = await supabase.rpc('get_finance_cycle_defaults', {
          p_household_id: householdId,
          p_month: full.month
        });
        if (live)
          setMeta({
            ready: true,
            error: Boolean(error),
            cycles: Object.fromEntries((Array.isArray(data) ? data : []).map((p: any) => [p.user_id, p]))
          });
      } catch {
        if (live) setMeta({ready: true, error: true, cycles: {}});
      }
    })();
    return () => {
      live = false;
    };
  }, [householdId, userId, full, attempt, demo]);
  const config = (id: string): PayCycle | undefined => {
    const p = full.plans.find(p => p.user_id === id && p.month === full.month),
      previous = meta.cycles[id];
    if (p?.cycle_first_day != null && p?.cycle_second_day != null) return p;
    if (!meta.ready || meta.error) return undefined;
    return {
      cycle_first_day: p?.cycle_first_day ?? previous?.cycle_first_day ?? 1,
      cycle_second_day: p?.cycle_second_day ?? previous?.cycle_second_day ?? 16
    };
  };
  const own = effectiveCycle(config(userId));
  const dateBasis = dateChoice === 'auto' ? (own.first !== 1 || own.second !== 16 ? userId : 'calendar') : dateChoice;
  const cycle = dateBasis === 'calendar' ? undefined : config(dateBasis);
  const current = cycle
    ? Number(full.today.slice(8)) >= effectiveCycle(cycle).first &&
      Number(full.today.slice(8)) < effectiveCycle(cycle).second
      ? 'first'
      : 'second'
    : halfOf(full.today);
  const period = periodChoice === 'current' ? current : periodChoice;
  const window = availabilityWindow(full.month, full.today, period, cycle);
  const withinMonth =
    window.start >= full.month && (window.end < full.month.slice(0, 7) + '-32' || window.start > full.today);
  const needsRecords = !withinMonth && window.start <= full.today;
  const needsPlans = window.planMonth !== full.month;
  const key = [householdId, userId, scope, window.start, window.end, window.planMonth].join(':');
  const [remote, setRemote] = useState<{key: string; source: CashFlowSource | null; error: boolean} | null>(null);
  const local = useMemo(
    () => scopeSource(full, scope, userId, finance.privateEntries, finance.splits),
    [full, scope, userId, finance.privateEntries, finance.splits]
  );
  useEffect(() => {
    if (demo || (!needsRecords && !needsPlans)) return;
    let live = true;
    setRemote(null);
    (async () => {
      try {
        const end = window.end < full.today ? window.end : full.today;
        const [transactions, plans, privateRows] = await Promise.all([
          needsRecords
            ? fetchAllRows<CashMovement>((a, b) =>
                supabase
                  .from('transactions')
                  .select('id,type,amount,transaction_date,category_id,paid_by,is_shared,budget_included')
                  .eq('household_id', householdId)
                  .gte('transaction_date', window.start)
                  .lte('transaction_date', end)
                  .order('id')
                  .range(a, b)
              )
            : Promise.resolve(full.transactions),
          needsPlans
            ? fetchAllRows<IncomePlan>((a, b) =>
                supabase
                  .from('finance_income_plans')
                  .select(
                    'user_id,month,expected_amount,first_half_amount,second_half_amount,cycle_first_day,cycle_second_day'
                  )
                  .eq('household_id', householdId)
                  .eq('month', window.planMonth)
                  .order('user_id')
                  .range(a, b)
              )
            : Promise.resolve(full.plans),
          needsRecords && scope === 'personal'
            ? fetchAllRows<PrivateEntry>((a, b) =>
                supabase
                  .from('private_transactions')
                  .select('id,description,type,amount,transaction_date,category_id')
                  .eq('household_id', householdId)
                  .gte('transaction_date', window.start)
                  .lte('transaction_date', end)
                  .order('id')
                  .range(a, b)
              )
            : Promise.resolve(finance.privateEntries || [])
        ]);
        let splits = finance.splits || [];
        if (needsRecords && scope === 'personal') {
          splits = [];
          for (let i = 0; i < transactions.length; i += 100)
            splits.push(
              ...(await fetchAllRows<{transaction_id: string; user_id: string; share_amount: number}>((a, b) =>
                supabase
                  .from('transaction_splits')
                  .select('transaction_id,user_id,share_amount')
                  .eq('household_id', householdId)
                  .in(
                    'transaction_id',
                    transactions.slice(i, i + 100).map(t => t.id)
                  )
                  .order('transaction_id')
                  .order('user_id')
                  .range(a, b)
              ))
            );
        }
        if (live)
          setRemote({
            key,
            source: scopeSource({...full, plans, transactions}, scope, userId, privateRows, splits),
            error: false
          });
      } catch {
        if (live) setRemote({key, source: null, error: true});
      }
    })();
    return () => {
      live = false;
    };
  }, [key, full, needsRecords, needsPlans, finance.privateEntries, finance.splits, attempt, demo]);
  const needsRemote = !demo && (needsRecords || needsPlans);
  const read = needsRemote ? (remote?.key === key ? remote : null) : {source: local, error: false};
  const datesUnavailable =
    period !== 'month' && ((dateChoice === 'auto' && !meta.ready) || (dateBasis !== 'calendar' && !cycle));
  const loading = !read || (datesUnavailable && !meta.error);
  const error = Boolean(read?.error || (datesUnavailable && meta.error));
  const summary = read?.source && !datesUnavailable ? homeBudgetAvailability(read.source, period, window) : null;
  const value = incomeBasis === 'received' ? summary?.remaining : summary?.projectedRemaining;
  const income = incomeBasis === 'received' ? summary?.received : summary?.expected;
  return (
    <section className="home-budget-available" aria-label="Presupuesto restante">
      <p className="home-budget-eyebrow">{period === 'month' ? 'Tu mes, con claridad' : 'Tu quincena, con claridad'}</p>
      <div className="home-available-period" role="group" aria-label="Período del presupuesto disponible">
        {(['first', 'second', 'month'] as const).map(p => (
          <button type="button" key={p} aria-pressed={period === p} onClick={() => setPeriodChoice(p)}>
            {p === 'month' ? 'Mes' : p === 'first' ? '1.ª quincena' : '2.ª quincena'}
          </button>
        ))}
      </div>
      <div className="home-available-context">
        <span>
          <CalendarDays size={14} aria-hidden="true" /> {dateLabel(window.start)} – {dateLabel(window.end)}
        </span>
        <label>
          Fechas
          <select aria-label="Fechas del resumen" value={dateBasis} onChange={e => setDateChoice(e.target.value)}>
            <option value="calendar">Calendario</option>
            {full.members
              .filter(m => scope === 'household' || m.user_id === userId)
              .map(m => (
                <option key={m.user_id} value={m.user_id}>
                  Ciclo de {members.find(p => p.user_id === m.user_id)?.full_name || m.full_name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="home-available-title">
        <h3>Presupuesto restante</h3>
        <label>
          Ingresos
          <select
            aria-label="Base de ingresos del presupuesto"
            value={incomeBasis}
            onChange={e => setIncomeBasis(e.target.value as typeof incomeBasis)}
          >
            <option value="received">Recibidos</option>
            <option value="expected">Esperados</option>
          </select>
        </label>
      </div>
      <strong
        className={'home-budget-remaining ' + (value != null && value < 0 ? 'is-deficit' : '')}
        aria-live="polite"
      >
        {loading || error || value == null ? 'Q —' : <Amount value={value} animate />}
      </strong>
      <p className="home-budget-note">
        {incomeBasis === 'received'
          ? 'Lo que queda de los ingresos recibidos tras los gastos del período. No es el saldo de tus cuentas.'
          : 'Estimación con los ingresos que planeas recibir. Ese dinero aún puede no estar en tus cuentas.'}
      </p>
      {loading ? (
        <p role="status">Verificando el período…</p>
      ) : error ? (
        <p role="alert">
          No pudimos verificar este período.{' '}
          <button type="button" onClick={() => setAttempt(a => a + 1)}>
            Reintentar período
          </button>
        </p>
      ) : income == null ? (
        <p>
          Completa los ingresos esperados {period === 'month' ? 'del mes' : 'de esta quincena'} para ver esta
          proyección.{' '}
          <button type="button" onClick={() => onNavigate('presupuesto:income')}>
            Configurar ingresos
          </button>
        </p>
      ) : (
        <p className="home-budget-equation">
          <span>
            Ingresos {incomeBasis === 'received' ? 'recibidos' : 'esperados'} <b>{money(income)}</b>
          </span>
          <span>
            − Gastos del presupuesto <b>{money(summary!.spent)}</b>
          </span>
        </p>
      )}
      {summary && !loading && !error && (
        <>
          {incomeBasis === 'expected' && summary.expected !== null && (
            <p className="home-budget-note">
              Proyección según el plan guardado. Ingresos por recibir:{' '}
              {money(Math.max(0, summary.expected - summary.received))}. Recibido hasta hoy: {money(summary.received)}.
              No suma dinero a tus cuentas.
            </p>
          )}
          {summary.outside > 0 && (
            <p className="home-budget-note">
              Pagado fuera del presupuesto: {money(summary.outside)}. Reduce la cuenta de pago.
            </p>
          )}
          <button
            type="button"
            className="home-available-details"
            aria-expanded={detail}
            onClick={() => setDetail(v => !v)}
          >
            {detail ? 'Ocultar detalle' : 'Cómo se calcula'} <ArrowUpRight size={13} aria-hidden="true" />
          </button>
          {detail && (
            <div className="home-budget-detail">
              <p>
                Ingresos del rango elegido menos gastos incluidos en el presupuesto, registrados hasta hoy. Las
                transferencias entre cuentas propias y los abonos a tarjetas no son gastos nuevos. Los ahorros y pagos
                pendientes se muestran aparte en el margen después de compromisos.
              </p>
              <p>
                Todos los gastos registrados: <b>{money(summary.actualExpenses)}</b>. Ingresos recibidos menos todos los
                gastos: <b>{money(summary.actualResult)}</b>.
              </p>
              {period !== 'month' && dateBasis !== 'calendar' && (
                <p>
                  El rango es el mismo para todo el hogar. Los ingresos esperados usan la distribución guardada de{' '}
                  {new Intl.DateTimeFormat('es-GT', {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(
                    new Date(window.planMonth + 'T12:00:00Z')
                  )}
                  . Mes muestra siempre el mes calendario.
                </p>
              )}
            </div>
          )}
        </>
      )}
      {meta.error && dateBasis === 'calendar' && (
        <p className="home-budget-note">
          No pudimos verificar ciclos anteriores; se muestran fechas de calendario.{' '}
          <button type="button" onClick={() => setAttempt(a => a + 1)}>
            Reintentar fechas
          </button>
        </p>
      )}
    </section>
  );
}
