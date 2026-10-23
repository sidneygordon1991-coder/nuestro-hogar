import {useEffect, useRef, useState} from 'react';
import {ArrowRight, Clock3, GitBranch, RefreshCw} from 'lucide-react';
import type {Tx, Account, Category} from './FinanceParts';
import {formatMoney as money} from './lib/money';
import {supabase} from './lib/supabase';

export default function TransactionImpact({
  transaction: t,
  account,
  category,
  today,
  householdId,
  memberName
}: {
  transaction: Tx;
  account?: Account;
  category?: Category;
  today: string;
  householdId: string;
  memberName: (id: string | null) => string;
}) {
  const future = t.transaction_date > today;
  const saving = t.type === 'expense' && category?.budget_group === 'saving';
  const effect =
    t.type === 'income'
      ? 'Suma al ingreso recibido'
      : saving
        ? 'Se clasifica como ahorro'
        : t.budget_included === false
          ? 'Gasto fuera del presupuesto'
          : 'Consume presupuesto';
  return (
    <section className="transaction-impact" aria-label="Impacto del movimiento">
      <h4>
        <GitBranch size={17} aria-hidden="true" /> Así se refleja
      </h4>
      {future && (
        <p className="impact-future">
          <Clock3 size={16} aria-hidden="true" /> Fecha futura: todavía no forma parte de los importes reales.
        </p>
      )}
      <ol>
        <li>
          <span>Registro</span>
          <strong>{effect}</strong>
          <p>
            {money(Number(t.amount))}
            {saving
              ? ' reduce el resultado después de ahorro una sola vez.'
              : t.type === 'income'
                ? ' de ingreso registrado.'
                : ' reduce el resultado real, aunque quede fuera del presupuesto.'}
          </p>
        </li>
        <li>
          <span>Cuenta</span>
          <strong>{account?.name || (t.account_id ? 'Cuenta no disponible' : 'Sin cuenta vinculada')}</strong>
          <p>
            {account
              ? (account.account_class === 'liability'
                  ? t.type === 'expense'
                    ? 'Aumenta la deuda'
                    : 'Reduce la deuda'
                  : t.type === 'expense'
                    ? 'Reduce el saldo'
                    : 'Aumenta el saldo') +
                ' en ' +
                money(Number(t.amount)) +
                (future ? ' cuando llegue la fecha del registro.' : '.')
              : 'No podemos atribuir este importe a una cuenta visible. Revisa su origen si necesitas conciliarlo.'}
          </p>
        </li>
        <li>
          <span>Seguimiento</span>
          <strong>{t.recurring_transaction_id ? 'Vinculado a un pago recurrente' : 'Movimiento individual'}</strong>
          <p>
            {t.recurring_transaction_id
              ? 'La programación conserva su historial; este registro representa el movimiento realizado.'
              : 'El comprobante y los comentarios quedan asociados a este registro.'}
          </p>
        </li>
      </ol>
      <p className="impact-caption">
        Una compra con tarjeta aumenta la deuda. Pagarla mediante una transferencia no vuelve a contar la compra como
        gasto.
      </p>
      <TransactionHistory
        key={householdId + ':' + t.id}
        householdId={householdId}
        transactionId={t.id}
        memberName={memberName}
      />
    </section>
  );
}

type Audit = {id: number; actor_user_id: string | null; action: string; created_at: string};
function TransactionHistory({
  householdId,
  transactionId,
  memberName
}: {
  householdId: string;
  transactionId: string;
  memberName: (id: string | null) => string;
}) {
  const [opened, setOpened] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{loading: boolean; denied: boolean; error: boolean; rows: Audit[]}>({
    loading: true,
    denied: false,
    error: false,
    rows: []
  });
  const generation = useRef(0);
  useEffect(() => {
    if (!opened) return;
    const current = ++generation.current;
    setState({loading: true, denied: false, error: false, rows: []});
    (async () => {
      try {
        const access = await supabase.rpc('get_my_household_access', {p_household_id: householdId});
        if (access.error || !access.data || typeof access.data.can_view_audit !== 'boolean') throw new Error();
        if (!access.data.can_view_audit) {
          if (current === generation.current) setState({loading: false, denied: true, error: false, rows: []});
          return;
        }
        const result = await supabase
          .from('household_audit_log')
          .select('id,actor_user_id,action,created_at')
          .eq('household_id', householdId)
          .eq('entity_type', 'transactions')
          .eq('entity_id', transactionId)
          .order('created_at', {ascending: false})
          .order('id', {ascending: false})
          .limit(20);
        if (result.error || !Array.isArray(result.data)) throw new Error();
        if (current === generation.current) setState({loading: false, denied: false, error: false, rows: result.data});
      } catch {
        if (current === generation.current) setState({loading: false, denied: false, error: true, rows: []});
      }
    })();
    return () => {
      generation.current++;
    };
  }, [opened, householdId, transactionId, attempt]);
  return (
    <details className="transaction-history" onToggle={e => setOpened(e.currentTarget.open)}>
      <summary>
        <Clock3 size={16} aria-hidden="true" /> Historial del registro <ArrowRight size={15} aria-hidden="true" />
      </summary>
      {state.loading ? (
        <p role="status">Consultando historial…</p>
      ) : state.denied ? (
        <p>Tu permiso no permite consultar la auditoría del hogar.</p>
      ) : state.error ? (
        <p role="alert">
          No pudimos verificar el historial.{' '}
          <button type="button" onClick={() => setAttempt(a => a + 1)}>
            <RefreshCw size={14} aria-hidden="true" /> Reintentar
          </button>
        </p>
      ) : (
        <>
          {state.rows.length ? (
            <ul>
              {state.rows.map(row => (
                <li key={row.id}>
                  <strong>
                    {row.action === 'create'
                      ? 'Creado'
                      : row.action === 'update'
                        ? 'Actualizado'
                        : row.action === 'delete'
                          ? 'Eliminado'
                          : 'Cambio registrado'}
                  </strong>
                  <span>
                    {row.actor_user_id ? memberName(row.actor_user_id) : 'Sistema'} ·{' '}
                    {new Date(row.created_at).toLocaleString('es-GT')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No hay eventos disponibles para este registro.</p>
          )}
          <p className="impact-caption">
            Últimos 20 eventos autorizados. La auditoría disponible registra autor y fecha; no conserva el motivo ni el
            detalle de cada campo modificado.
          </p>
        </>
      )}
    </details>
  );
}
