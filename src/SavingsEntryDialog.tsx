import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {ArrowUpRight, PiggyBank, X} from 'lucide-react';
import {incomeAmount} from './lib/monthlyIncome';
import {supabase} from './lib/supabase';

export default function SavingsEntryDialog({
  householdId,
  goal,
  direction,
  onClose,
  onSaved
}: {
  householdId: string;
  goal: {id: string; name: string};
  direction: 'deposit' | 'withdrawal';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(''),
    [date, setDate] = useState(localDate),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useRef({fingerprint: '', id: ''}),
    submitting = useRef(false);
  const withdrawal = direction === 'withdrawal',
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
  async function save(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    let value: number;
    try {
      value = incomeAmount(amount);
      if (value <= 0) throw new Error('Ingresa un monto mayor que cero.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > localDate())
        throw new Error('Elige la fecha en que realizaste el movimiento, hasta hoy.');
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const fingerprint = [householdId, goal.id, direction, value, date].join(':');
    if (request.current.fingerprint !== fingerprint) request.current = {fingerprint, id: crypto.randomUUID()};
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const {error: failure} = await supabase.rpc('save_savings_entry', {
        p_household_id: householdId,
        p_goal_id: goal.id,
        p_entry_id: request.current.id,
        p_amount: value,
        p_direction: direction,
        p_date: date
      });
      if (failure) {
        setError(failure.message);
        return;
      }
      onSaved();
    } catch {
      setError('No pudimos confirmar el movimiento. Conservamos tus datos; reintenta para comprobarlo sin duplicarlo.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head">
          <h3 id={titleId}>{withdrawal ? 'Retirar de la meta' : 'Aportar a la meta'}</h3>
          <button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar movimiento de ahorro">
            <X />
          </button>
        </div>
        <form className="finance-form" onSubmit={save}>
          <p className="finance-management-note">
            {withdrawal ? <ArrowUpRight size={18} /> : <PiggyBank size={18} />} {goal.name}.{' '}
            {withdrawal
              ? 'Libera dinero de esta meta; no crea un ingreso ni una transferencia bancaria. Si realizaste una compra, registra su gasto por separado.'
              : 'Separa dinero para esta meta; no crea otro ingreso.'}
          </p>
          <label>
            Monto (Q)
            <input
              type="text"
              inputMode="decimal"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={busy}
              placeholder="0.00"
            />
          </label>
          <label>
            Fecha del movimiento
            <input
              type="date"
              required
              max={localDate()}
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={busy}
            />
          </label>
          {error && (
            <p role="alert" className="finance-management-error">
              {error}
            </p>
          )}
          <button type="submit" className="finance-primary" disabled={busy}>
            {busy ? 'Guardando…' : withdrawal ? 'Confirmar retiro' : 'Guardar aporte'}
          </button>
        </form>
      </section>
    </div>
  );
}
function localDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
