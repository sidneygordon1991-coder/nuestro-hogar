import {incomeAmount} from './lib/monthlyIncome';
import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {AlertTriangle, Check, RefreshCw, X} from 'lucide-react';
import {supabase} from './lib/supabase';
import {localDay, money} from './lib/connectedFinance';
type State = {balance: number; fingerprint: string; transaction_count: number; transfer_count: number};
type Snapshot = {
  id: string;
  cutoff: string;
  confirmed_balance: number;
  book_balance: number;
  fingerprint: string;
  notes: string;
  created_at: string;
  source?: string;
};
export default function AccountReconciliation({
  householdId,
  account,
  readOnly,
  onClose
}: {
  householdId: string;
  account: {id: string; name: string; account_class: string};
  readOnly: boolean;
  onClose: () => void;
}) {
  const [cutoff, setCutoff] = useState(localDay),
    [state, setState] = useState<State | null>(null),
    [history, setHistory] = useState<Snapshot[]>([]),
    [amount, setAmount] = useState(''),
    [notes, setNotes] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [attempt, setAttempt] = useState(0);
  const version = useRef(0),
    request = useRef({fingerprint: '', id: ''}),
    titleId = useId(),
    closeRef = useRef(onClose),
    busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) {
        e.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const v = ++version.current;
    setState(null);
    setLoading(true);
    setError('');
    (async () => {
      try {
        const [s, h] = await Promise.all([
          supabase.rpc('get_account_book_state', {
            p_household_id: householdId,
            p_account_id: account.id,
            p_cutoff: cutoff
          }),
          supabase
            .from('account_reconciliations')
            .select('id,cutoff,confirmed_balance,book_balance,fingerprint,notes,created_at,source')
            .eq('household_id', householdId)
            .eq('account_id', account.id)
            .order('cutoff', {ascending: false})
            .order('created_at', {ascending: false})
            .limit(20)
        ]);
        if (s.error) throw s.error;
        if (h.error) throw h.error;
        if (!s.data || !Number.isFinite(Number(s.data.balance)) || typeof s.data.fingerprint !== 'string')
          throw new Error('No se pudo verificar el saldo.');
        if (v === version.current) {
          setState({...s.data, balance: Number(s.data.balance)});
          setHistory(h.data || []);
        }
      } catch (e) {
        if (v === version.current) setError((e as {message?: string}).message || 'No se pudo cargar la conciliación.');
      } finally {
        if (v === version.current) setLoading(false);
      }
    })();
    return () => {
      version.current++;
    };
  }, [householdId, account.id, cutoff, attempt]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!state || busy || readOnly) return;
    let value: number;
    try {
      const text = amount.trim();
      value = incomeAmount(text.startsWith('-') ? text.slice(1) : text) * (text.startsWith('-') ? -1 : 1);
    } catch {
      setError('Ingresa un saldo válido con un máximo de dos decimales.');
      return;
    }
    const payload = {
      p_household_id: householdId,
      p_account_id: account.id,
      p_cutoff: cutoff,
      p_confirmed_balance: value,
      p_fingerprint: state.fingerprint,
      p_notes: notes
    };
    const fp = JSON.stringify(payload);
    if (request.current.fingerprint !== fp) request.current = {fingerprint: fp, id: crypto.randomUUID()};
    setBusy(true);
    setError('');
    try {
      const {data, error} = await supabase.rpc('confirm_account_reconciliation', {
        ...payload,
        p_request_id: request.current.id
      });
      if (error) throw error;
      if (typeof data !== 'string') throw new Error('No se pudo confirmar la comparación.');
      setSuccess('Comparación guardada. No se creó ningún ajuste ni movimiento.');
      setAmount('');
      setNotes('');
      setAttempt(x => x + 1);
    } catch (e) {
      setError(
        (e as {message?: string}).message ||
          'No pudimos confirmar el guardado. Reintenta sin cambiar los datos para evitar duplicarlo.'
      );
    } finally {
      setBusy(false);
    }
  }
  const matching = history.find(h => h.cutoff === cutoff),
    stale = matching && state && matching.fingerprint !== state.fingerprint,
    difference =
      state && amount.trim() && Number.isFinite(Number(amount))
        ? (Math.round(Number(amount) * 100) - Math.round(state.balance * 100)) / 100
        : null;
  return (
    <div className="modal-backdrop">
      <section className="finance-modal connected-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head">
          <h3 id={titleId}>Conciliar cuenta</h3>
          <button type="button" disabled={busy} aria-label="Cerrar conciliación" onClick={onClose}>
            <X />
          </button>
        </div>
        <p className="muted">
          {account.name}. Compara el saldo registrado con el de tu extracto o efectivo contado.{' '}
          {account.account_class === 'liability'
            ? 'En deudas, ingresa lo que debes como positivo y un saldo a favor como negativo.'
            : ''}
        </p>
        <label className="connected-date">
          Fecha de corte
          <input
            aria-label="Fecha de corte de conciliación"
            type="date"
            required
            max={localDay()}
            value={cutoff}
            disabled={busy}
            onChange={e => {
              if (e.target.value) setCutoff(e.target.value);
            }}
          />
        </label>
        {loading ? (
          <p role="status">Verificando movimientos y transferencias…</p>
        ) : (
          state && (
            <>
              <div className="connected-balance">
                <small>Saldo calculado al corte</small>
                <strong>{money(state.balance)}</strong>
                <span>
                  {state.transaction_count} movimientos · {state.transfer_count} transferencias
                </span>
              </div>
              {stale && (
                <p className="connected-warning">
                  <AlertTriangle size={17} />
                  Los registros de este corte cambiaron después de la última comparación. La confirmación anterior se
                  conserva como historial.
                </p>
              )}
              {!readOnly && (
                <form className="finance-form" onSubmit={save}>
                  <label>
                    Saldo confirmado (Q)
                    <input
                      required
                      inputMode="decimal"
                      value={amount}
                      disabled={busy}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="Saldo de tu extracto o efectivo"
                    />
                  </label>
                  {difference !== null && (
                    <p className={difference ? 'connected-warning' : 'connected-success'}>
                      {difference ? `Diferencia por revisar: ${money(difference)}` : 'Los saldos coinciden.'}
                    </p>
                  )}
                  <label>
                    Nota de la comparación
                    <textarea maxLength={1000} value={notes} disabled={busy} onChange={e => setNotes(e.target.value)} />
                  </label>
                  <button className="finance-primary" disabled={busy}>
                    {busy ? 'Guardando…' : 'Confirmar comparación'}
                  </button>
                </form>
              )}
              <h4>Últimas comparaciones</h4>
              <div className="reconciliation-history">
                {history.map(h => (
                  <article key={h.id}>
                    <strong>{new Date(h.cutoff + 'T12:00').toLocaleDateString('es-GT')}</strong>
                    <span>
                      Registrado {money(Number(h.book_balance))} · Confirmado {money(Number(h.confirmed_balance))}
                    </span>
                    <small>
                      {h.source === 'restored' ? 'Historial importado · ' : ''}Diferencia{' '}
                      {money(
                        (Math.round(Number(h.confirmed_balance) * 100) - Math.round(Number(h.book_balance) * 100)) / 100
                      )}
                      {h.notes ? ' · ' + h.notes : ''}
                    </small>
                  </article>
                ))}
                {!history.length && <p className="muted">Todavía no hay comparaciones guardadas para esta cuenta.</p>}
              </div>
            </>
          )
        )}
        {success && (
          <p className="connected-success" role="status">
            <Check size={17} />
            {success}
          </p>
        )}
        {error && (
          <p className="sharing-error" role="alert">
            {error}
          </p>
        )}
        <button className="secondary-action" disabled={busy || loading} onClick={() => setAttempt(x => x + 1)}>
          <RefreshCw size={16} />
          Actualizar cálculo
        </button>
      </section>
    </div>
  );
}
