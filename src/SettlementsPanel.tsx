import {useEffect, useMemo, useState, type FormEvent} from 'react';
import {Check, HandCoins, Plus, RefreshCw, Trash2} from 'lucide-react';
import {supabase} from './lib/supabase';
import {formatMoney} from './lib/money';
import {incomeAmount} from './lib/monthlyIncome';
import {memberFlows, settlementSummary} from './lib/settlements';
import './styles/modules/finance-tools.css';

type Member = {user_id: string; full_name: string};
type Movement = {id: string; type: string; amount: number | string; paid_by: string | null; is_shared?: boolean | null};
type Split = {transaction_id: string; user_id: string; share_amount: number | string};
type SettlementRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number | string;
  settled_on: string;
  period_month: string;
  note: string | null;
  created_at: string;
};
type Props = {
  householdId: string;
  month: string;
  label: string;
  members: Member[];
  transactions: Movement[];
  splits: Split[];
  currentUser: string;
  readOnly: boolean;
  onChanged?: () => void;
};

const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const shortDate = (date: string) =>
  new Date(date + 'T12:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'short'});
const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : String((err as {message?: string})?.message || fallback);

/**
 * "Liquidar entre ustedes": balances from the month's shared expenses net of the payments already recorded,
 * the fewest transfers that settle them, and the month's payment history.
 */
export default function SettlementsPanel({
  householdId,
  month,
  label,
  members,
  transactions,
  splits,
  currentUser,
  readOnly,
  onChanged
}: Props) {
  const [rows, setRows] = useState<SettlementRow[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({from: '', to: '', amount: '', date: today(), note: ''});

  async function load() {
    setLoading(true);
    setLoadError('');
    const {data, error} = await supabase
      .from('finance_settlements')
      .select('id,from_user_id,to_user_id,amount,settled_on,period_month,note,created_at')
      .eq('household_id', householdId)
      .eq('period_month', month)
      .order('settled_on')
      .order('created_at');
    if (error) {
      setLoadError(error.message || 'No se pudieron cargar los pagos entre ustedes.');
      setRows([]);
    } else setRows((data || []) as SettlementRow[]);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [householdId, month]);

  const name = (id: string) => members.find(m => m.user_id === id)?.full_name || 'Integrante';
  const summary = useMemo(
    () =>
      settlementSummary(
        memberFlows(
          members.map(m => m.user_id),
          transactions,
          splits
        ),
        rows
      ),
    [members, transactions, splits, rows]
  );

  useEffect(() => {
    if (members.length < 2) return;
    const first = summary.suggestions[0];
    setForm(f => ({
      ...f,
      from: f.from || first?.from_user_id || members[0].user_id,
      to: f.to || first?.to_user_id || members[1].user_id
    }));
  }, [members, summary]);

  async function record(values: {
    from_user_id: string;
    to_user_id: string;
    amount: number;
    settled_on: string;
    note: string | null;
  }) {
    if (readOnly || busy) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const {error} = await supabase
        .from('finance_settlements')
        .insert({household_id: householdId, ...values, period_month: month, created_by: currentUser || null});
      if (error) throw error;
      setNotice(
        `Pago registrado: ${name(values.from_user_id)} le pagó ${formatMoney(values.amount)} a ${name(values.to_user_id)}.`
      );
      await load();
      onChanged?.();
      return true;
    } catch (err) {
      setError(errorText(err, 'No se pudo registrar el pago.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (readOnly || busy) return;
    setError('');
    let amount: number;
    try {
      amount = incomeAmount(form.amount.replace(',', '.'));
      if (amount <= 0) throw new Error('El monto debe ser mayor que cero.');
    } catch (err) {
      setError(errorText(err, 'Revisa el monto.'));
      return;
    }
    if (!form.from || !form.to || form.from === form.to) {
      setError('Elige dos personas diferentes: quien paga y quien recibe.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setError('Elige la fecha del pago.');
      return;
    }
    const note = form.note.trim();
    if (note.length > 200) {
      setError('La nota puede tener hasta 200 caracteres.');
      return;
    }
    if (
      await record({from_user_id: form.from, to_user_id: form.to, amount, settled_on: form.date, note: note || null})
    ) {
      setForm(f => ({...f, amount: '', note: ''}));
      setShowForm(false);
    }
  }

  async function remove(row: SettlementRow) {
    if (readOnly || busy) return;
    if (
      !window.confirm(
        `¿Eliminar el pago de ${name(row.from_user_id)} a ${name(row.to_user_id)} por ${formatMoney(Number(row.amount))}? El balance del mes volverá a contarlo como pendiente.`
      )
    )
      return;
    setBusy(true);
    setError('');
    setNotice('');
    const {error} = await supabase
      .from('finance_settlements')
      .delete()
      .eq('id', row.id)
      .eq('household_id', householdId);
    setBusy(false);
    if (error) {
      setError(error.message || 'No se pudo eliminar el pago.');
      return;
    }
    setNotice('Pago eliminado. El balance se recalculó.');
    await load();
    onChanged?.();
  }

  if (members.length < 2) return null;
  return (
    <section className="finance-panel settlements-panel" aria-labelledby="settlements-title">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Cuentas claras · {label}</p>
          <h3 id="settlements-title">Liquidar entre ustedes</h3>
          <small>
            Gastos compartidos del mes: lo que cada quien pagó menos lo que le tocaba, descontando los pagos ya
            registrados.
          </small>
        </div>
        <HandCoins size={20} aria-hidden="true" />
      </div>
      {loading ? (
        <p className="tools-note" role="status">
          Cargando los pagos registrados…
        </p>
      ) : loadError ? (
        <div className="tools-error" role="alert">
          {loadError}{' '}
          <button type="button" className="tools-link" onClick={() => void load()}>
            <RefreshCw size={14} /> Reintentar
          </button>
        </div>
      ) : (
        <>
          <div className="settlement-balances">
            {summary.balances.map(b => (
              <div className="settlement-balance" key={b.user_id}>
                <span>{name(b.user_id)}</span>
                <strong className={b.balance > 0 ? 'positive' : b.balance < 0 ? 'negative' : ''}>
                  {b.balance > 0 ? '+' : ''}
                  {formatMoney(b.balance)}
                </strong>
                <small>{b.balance > 0 ? 'Le deben' : b.balance < 0 ? 'Debe' : 'A mano'}</small>
              </div>
            ))}
          </div>
          {summary.suggestions.length ? (
            summary.suggestions.map(s => (
              <div className="settlement-suggestion" key={s.from_user_id + '>' + s.to_user_id}>
                <p>
                  <b>{name(s.from_user_id)}</b> le paga <b>{formatMoney(s.amount)}</b> a <b>{name(s.to_user_id)}</b>
                </p>
                {!readOnly && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Marcar como pagado: ${name(s.from_user_id)} le paga ${formatMoney(s.amount)} a ${name(s.to_user_id)}`}
                    onClick={() =>
                      void record({
                        from_user_id: s.from_user_id,
                        to_user_id: s.to_user_id,
                        amount: s.amount,
                        settled_on: today(),
                        note: null
                      })
                    }
                  >
                    <Check size={15} /> Marcar como pagado
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="settlement-settled">
              <Check size={16} /> Están a mano en {label}. No hay pagos pendientes entre ustedes.
            </p>
          )}
          {!readOnly &&
            (showForm ? (
              <form className="settlement-form finance-form" onSubmit={submit} noValidate>
                <h4>Registrar otro monto</h4>
                <div className="tools-grid">
                  <label>
                    Paga
                    <select value={form.from} onChange={e => setForm({...form, from: e.target.value})}>
                      {members.map(m => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Recibe
                    <select value={form.to} onChange={e => setForm({...form, to: e.target.value})}>
                      {members.map(m => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Monto (Q)
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      max="9999999999.99"
                      step="0.01"
                      required
                      value={form.amount}
                      onChange={e => setForm({...form, amount: e.target.value})}
                    />
                  </label>
                  <label>
                    Fecha del pago
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={e => setForm({...form, date: e.target.value})}
                    />
                  </label>
                </div>
                <label>
                  Nota
                  <input
                    maxLength={200}
                    placeholder="Opcional, por ejemplo: transferencia"
                    value={form.note}
                    onChange={e => setForm({...form, note: e.target.value})}
                  />
                </label>
                <div className="tools-actions">
                  <button className="finance-primary" type="submit" disabled={busy}>
                    <Check size={16} />
                    {busy ? 'Guardando…' : 'Registrar pago'}
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={busy}
                    onClick={() => {
                      setShowForm(false);
                      setError('');
                    }}
                  >
                    Cancelar
                  </button>
                </div>
                <p className="tools-note">
                  Se registra en {label}. No cambia presupuestos, ingresos ni saldos de cuentas.
                </p>
              </form>
            ) : (
              <button
                type="button"
                className="secondary-action"
                onClick={() => {
                  setShowForm(true);
                  setNotice('');
                }}
              >
                <Plus size={15} /> Registrar otro monto
              </button>
            ))}
          {error && (
            <p className="tools-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="tools-success" role="status">
              {notice}
            </p>
          )}
          <div className="settlement-history">
            <h4>Pagos registrados en {label}</h4>
            {rows.length ? (
              rows.map(row => (
                <div className="settlement-history-row" key={row.id}>
                  <div>
                    <strong>
                      {name(row.from_user_id)} → {name(row.to_user_id)}
                    </strong>
                    <small>
                      {shortDate(row.settled_on)}
                      {row.note ? ' · ' + row.note : ''}
                    </small>
                  </div>
                  <b>{formatMoney(Number(row.amount))}</b>
                  {!readOnly && (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Eliminar pago de ${name(row.from_user_id)} a ${name(row.to_user_id)} por ${formatMoney(Number(row.amount))}`}
                      title="Eliminar"
                      onClick={() => void remove(row)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="tools-note">Todavía no hay pagos registrados este mes.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
