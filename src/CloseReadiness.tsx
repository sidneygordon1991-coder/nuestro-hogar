import {useEffect, useState} from 'react';
import {reportFinancialCheck} from './AppDiagnostics';
import {ArrowUpRight, CheckCircle2, ClipboardCheck, RefreshCw, TriangleAlert} from 'lucide-react';
import {supabase} from './lib/supabase';
import {fetchAllRows} from './lib/paging';
import {registeredLedger} from './lib/registeredLedger';
import {closeDifferences, type CloseFinancial} from './lib/closeEvidence';
import {formatMoney as money} from './lib/money';
import {toCents} from './lib/financePeriods';
import type {CashMovement, CashSaving} from './lib/cashFlow';

type Reconciliation = {
  account_id: string;
  cutoff: string;
  confirmed_balance: number;
  book_balance: number;
  created_at: string;
};
type Evidence = {
  financial: CloseFinancial;
  missingAccount: number;
  accounts: number;
  exactCutoff: number;
  differences: number;
  pending: number;
};
const labels = {income: 'Ingresos', expense: 'Gastos', saving: 'Ahorro', balance: 'Resultado'};

export default function CloseReadiness({
  householdId,
  month,
  end,
  financial,
  pending,
  closed,
  onNavigate
}: {
  householdId: string;
  month: string;
  end: string;
  financial: CloseFinancial;
  pending: number;
  closed: boolean;
  onNavigate: (route: string) => void;
}) {
  const [opened, setOpened] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{loading: boolean; denied: boolean; error: boolean; evidence: Evidence | null}>({
    loading: true,
    denied: false,
    error: false,
    evidence: null
  });
  useEffect(() => {
    if (!opened) return;
    let live = true;
    setState({loading: true, denied: false, error: false, evidence: null});
    (async () => {
      try {
        const access = await supabase.rpc('get_my_household_access', {p_household_id: householdId});
        if (access.error || !['none', 'view', 'edit'].includes(access.data?.modules?.finance)) throw new Error();
        if (access.data.modules.finance === 'none') {
          if (live) setState({loading: false, denied: true, error: false, evidence: null});
          return;
        }
        const [transactions, savings, categories, accounts, reconciliations] = await Promise.all([
          fetchAllRows<CashMovement & {account_id: string | null}>((a, b) =>
            supabase
              .from('transactions')
              .select('id,type,amount,transaction_date,category_id,paid_by,budget_included,account_id')
              .eq('household_id', householdId)
              .gte('transaction_date', month)
              .lte('transaction_date', end)
              .order('id')
              .range(a, b)
          ),
          fetchAllRows<CashSaving>((a, b) =>
            supabase
              .from('goal_contributions')
              .select('id,amount,contribution_date')
              .eq('household_id', householdId)
              .gte('contribution_date', month)
              .lte('contribution_date', end)
              .order('id')
              .range(a, b)
          ),
          fetchAllRows<{id: string; budget_group?: string}>((a, b) =>
            supabase
              .from('budget_categories')
              .select('id,budget_group')
              .eq('household_id', householdId)
              .order('id')
              .range(a, b)
          ),
          fetchAllRows<{id: string}>((a, b) =>
            supabase
              .from('finance_accounts')
              .select('id')
              .eq('household_id', householdId)
              .eq('active', true)
              .order('id')
              .range(a, b)
          ),
          fetchAllRows<Reconciliation>((a, b) =>
            supabase
              .from('account_reconciliations')
              .select('id,account_id,cutoff,confirmed_balance,book_balance,created_at')
              .eq('household_id', householdId)
              .eq('cutoff', end)
              .order('created_at', {ascending: false})
              .order('id', {ascending: false})
              .range(a, b)
          )
        ]);
        const ledger = registeredLedger(transactions, savings, categories, {start: month, end, today: end});
        const latest = new Map<string, Reconciliation>();
        for (const row of reconciliations) if (!latest.has(row.account_id)) latest.set(row.account_id, row);
        const active = accounts.flatMap(a => (latest.has(a.id) ? [latest.get(a.id)!] : []));
        if (live)
          setState({
            loading: false,
            denied: false,
            error: false,
            evidence: {
              financial: {...ledger, balance: ledger.available},
              missingAccount: transactions.filter(t => !t.account_id).length,
              accounts: accounts.length,
              exactCutoff: active.length,
              differences: active.filter(r => toCents(r.confirmed_balance) !== toCents(r.book_balance)).length,
              pending
            }
          });
      } catch {
        if (live) reportFinancialCheck(householdId, 'close-evidence');
        if (live) setState({loading: false, denied: false, error: true, evidence: null});
      }
    })();
    return () => {
      live = false;
    };
  }, [opened, householdId, month, end, attempt, pending]);
  const differences = state.evidence ? closeDifferences(financial, state.evidence.financial) : [];
  return (
    <section className="close-readiness" aria-label="Comprobación del cierre">
      <details open={opened} onToggle={e => setOpened(e.currentTarget.open)}>
        <summary>
          <ClipboardCheck size={21} aria-hidden="true" />
          <span>
            <strong>{closed ? 'Contrastar la fotografía guardada' : 'Antes de cerrar, comprueba'}</strong>
            <small>Movimientos, cuentas y cifras del período</small>
          </span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </summary>
        {opened && (
          <div className="close-readiness-content">
            {state.loading ? (
              <p role="status">Verificando registros y conciliaciones…</p>
            ) : state.denied ? (
              <p>
                Necesitas acceso a Finanzas para contrastar los registros. Un integrante autorizado puede revisarlos
                contigo.
              </p>
            ) : state.error ? (
              <p role="alert">
                No pudimos completar la comprobación. No se confirma que las cifras coincidan.{' '}
                <button type="button" onClick={() => setAttempt(a => a + 1)}>
                  <RefreshCw size={15} aria-hidden="true" /> Reintentar
                </button>
              </p>
            ) : (
              state.evidence && (
                <>
                  <div className={'close-check-result ' + (differences.length ? 'has-differences' : '')}>
                    {differences.length ? <TriangleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                    <div>
                      <strong>
                        {differences.length
                          ? 'Hay cifras que revisar'
                          : 'Las cifras coinciden con los registros consultados'}
                      </strong>
                      <p>
                        {closed
                          ? 'La fotografía guardada se conserva. Las diferencias pueden deberse a cambios posteriores o a criterios de cálculo.'
                          : 'Esta comprobación compara ingresos, gastos, ahorro y resultado. Revisa cualquier diferencia antes de cerrar.'}
                      </p>
                    </div>
                  </div>
                  {differences.length > 0 && (
                    <dl className="close-differences">
                      {differences.map(d => (
                        <div key={d.field}>
                          <dt>{labels[d.field]}</dt>
                          <dd>
                            Resumen: {money(d.saved)}
                            <br />
                            Registros: {money(d.current)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <ul className="close-check-list">
                    <li>
                      <strong>{state.evidence.missingAccount} movimiento(s) sin cuenta</strong>
                      <span>Se incluyen en el resultado; no se pueden atribuir a una cuenta para conciliar.</span>
                    </li>
                    <li>
                      <strong>
                        {state.evidence.exactCutoff} de {state.evidence.accounts} cuentas activas comparadas al corte
                      </strong>
                      <span>
                        {state.evidence.differences} comparación(es) con diferencia. El historial no comprueba si
                        después se editaron registros; abre Cuentas para verificarlo.
                      </span>
                    </li>
                    <li>
                      <strong>{pending} pago(s) pendiente(s) en el resumen</strong>
                      <span>Cerrar el mes no paga compromisos ni bloquea la edición del libro financiero.</span>
                    </li>
                  </ul>
                  <div className="evidence-actions">
                    <button type="button" onClick={() => onNavigate('presupuesto:transactions')}>
                      Revisar movimientos <ArrowUpRight size={15} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onNavigate('presupuesto:accounts')}>
                      Conciliar cuentas <ArrowUpRight size={15} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setAttempt(a => a + 1)}>
                      Comprobar de nuevo <RefreshCw size={15} aria-hidden="true" />
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        )}
      </details>
    </section>
  );
}
