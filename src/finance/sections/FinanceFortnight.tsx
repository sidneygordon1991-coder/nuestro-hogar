// Calendar budgets and personal cycles share the same financial rules and household RLS.
import {useEffect, useState} from 'react';
import FortnightBudget from '../../FortnightBudget';
import {cycleBounds, cycleRangeLabel} from '../../lib/payCycles';
import {supabase} from '../../lib/supabase';
import {fetchAllRows} from '../../lib/paging';
import {isoDate, type Tx, type Contribution, type Split} from '../../FinanceParts';
import {monthDate, monthLabel} from '../shared';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceFortnight() {
  const w = useFinance();
  const preference = 'nh-cycle-view:' + w.household.id + ':' + w.currentUser;
  const [basis, setBasis] = useState(() => {
      try {
        return sessionStorage.getItem(preference) || 'calendar';
      } catch {
        return 'calendar';
      }
    }),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (basis !== 'calendar' && !w.members.some(m => m.user_id === basis)) {
      setBasis('calendar');
      return;
    }
    try {
      sessionStorage.setItem(preference, basis);
    } catch {
      /* A blocked preference never prevents access to finance. */
    }
  }, [basis, preference, w.members]);
  const plan = w.incomeSummary.rows.find(p => p.user_id === basis);
  const cycle =
    basis === 'calendar'
      ? undefined
      : {cycle_first_day: plan?.cycle_first_day ?? 1, cycle_second_day: plan?.cycle_second_day ?? 16};
  const bounds = cycleBounds(monthDate(w.month), 'month', cycle);
  const scope = [w.household.id, monthDate(w.month), basis, bounds.start, bounds.end].join(':');
  const [state, setState] = useState<{
    scope: string;
    transactions: Tx[];
    savings: Contribution[];
    splits: Split[];
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (basis === 'calendar' || w.tab !== 'fortnight') return;
    let live = true;
    setState(null);
    (async () => {
      try {
        const [transactions, savings] = await Promise.all([
          fetchAllRows<Tx>((from, to) =>
            supabase
              .from('transactions')
              .select(
                'id,description,amount,type,transaction_date,category_id,paid_by,account_id,is_shared,notes,recurring_transaction_id,budget_included'
              )
              .eq('household_id', w.household.id)
              .gte('transaction_date', bounds.start)
              .lte('transaction_date', bounds.end)
              .order('id')
              .range(from, to)
          ),
          fetchAllRows<Contribution>((from, to) =>
            supabase
              .from('goal_contributions')
              .select('id,goal_id,amount,contribution_date,created_by')
              .eq('household_id', w.household.id)
              .gte('contribution_date', bounds.start)
              .lte('contribution_date', bounds.end)
              .order('id')
              .range(from, to)
          )
        ]);
        const splits: Split[] = [];
        for (let i = 0; i < transactions.length; i += 100) {
          splits.push(
            ...(await fetchAllRows<Split>((from, to) =>
              supabase
                .from('transaction_splits')
                .select('transaction_id,user_id,share_amount')
                .eq('household_id', w.household.id)
                .in(
                  'transaction_id',
                  transactions.slice(i, i + 100).map(t => t.id)
                )
                .order('transaction_id')
                .order('user_id')
                .range(from, to)
            ))
          );
        }
        if (live) setState({scope, transactions, savings, splits, error: false});
      } catch {
        if (live) setState({scope, transactions: [], savings: [], splits: [], error: true});
      }
    })();
    return () => {
      live = false;
    };
  }, [scope, attempt, w.tab, w.actualTxs, w.actualContributions]);
  if (w.tab !== 'fortnight') return null;
  const loaded = basis === 'calendar' || state?.scope === scope;
  return (
    <>
      <section className="finance-panel cycle-view-picker">
        <label>
          Fechas para comparar
          <select aria-label="Fechas del presupuesto" value={basis} onChange={e => setBasis(e.target.value)}>
            <option value="calendar">Mes calendario · 1 al cierre</option>
            {w.members.map(m => (
              <option key={m.user_id} value={m.user_id}>
                Ciclo de {m.full_name}
              </option>
            ))}
          </select>
        </label>
        <p>
          {cycle
            ? `${cycleRangeLabel(monthDate(w.month), 'month', cycle)}. El mes seleccionado indica el inicio del ciclo. Todos los integrantes se comparan en este mismo rango, sin sumar períodos superpuestos. El plan usa la distribución guardada del mes de inicio. Los repartos registrados y el cierre mensual conservan sus reglas.`
            : 'El mes y sus quincenas habituales. Elige una persona para consultar el ciclo que tiene guardado en su plan.'}
        </p>
        <button className="secondary-action" onClick={() => w.setTab('income')}>
          Configurar mis quincenas
        </button>
      </section>
      {!loaded ? (
        <p className="finance-panel" role="status">
          Cargando movimientos del ciclo…
        </p>
      ) : (
        <>
          {cycle && state?.error && (
            <div role="alert" className="monthly-income-alert">
              No pudimos verificar los movimientos del ciclo.{' '}
              <button onClick={() => setAttempt(n => n + 1)}>Reintentar</button>
            </div>
          )}
          <FortnightBudget
            key={scope}
            householdId={w.household.id}
            householdName={w.household.name}
            readOnly={w.readOnly}
            onPayments={() => w.setTab('recurring')}
            onMovements={() => {
              w.setTransactionQuery('');
              w.setCategoryFilter(null);
              w.setTransactionType('all');
              w.setTab('transactions');
            }}
            month={monthDate(w.month)}
            label={monthLabel(w.month)}
            context={w.shareContext}
            allocations={w.allocations}
            categories={w.categories}
            movements={cycle ? (state?.transactions || []).filter(t => t.transaction_date <= isoDate()) : w.actualTxs}
            savings={
              cycle ? (state?.savings || []).filter(t => t.contribution_date <= isoDate()) : w.actualContributions
            }
            splits={cycle ? state?.splits || [] : w.splits}
            loadError={w.incomePlanError || w.periodDataError || Boolean(cycle && state?.error)}
            onIncome={() => w.setTab('income')}
            onBudget={() => w.setTab('budget')}
            onRules={() => w.setTab('contributions')}
            payDays={w.payDays}
            cycle={cycle}
          />
        </>
      )}
    </>
  );
}
