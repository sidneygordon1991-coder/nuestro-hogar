import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Check, ReceiptText, X} from 'lucide-react';
import {supabase} from './lib/supabase';
import {incomeAmount} from './lib/monthlyIncome';
import TransactionReceipts from './TransactionReceipts';
import {localDay, money} from './lib/connectedFinance';
type Item = {id: string; text: string; quantity: string | null};
export default function ShoppingCheckoutDialog({
  householdId,
  list,
  items,
  onClose,
  onSaved
}: {
  householdId: string;
  list: {id: string; title: string};
  items: Item[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState(items.map(i => i.id)),
    [amount, setAmount] = useState(''),
    [date, setDate] = useState(localDay),
    [description, setDescription] = useState('Compra · ' + list.title),
    [category, setCategory] = useState(''),
    [account, setAccount] = useState(''),
    [payer, setPayer] = useState(''),
    [shared, setShared] = useState(true);
  const [categories, setCategories] = useState<{id: string; name: string}[]>([]),
    [accounts, setAccounts] = useState<{id: string; name: string}[]>([]),
    [members, setMembers] = useState<{id: string; name: string}[]>([]),
    [loading, setLoading] = useState(true),
    [verified, setVerified] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [transactionId, setTransactionId] = useState('');
  const request = useRef({fingerprint: '', id: ''}),
    submitting = useRef(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const [c, a, m, u] = await Promise.all([
        supabase
          .from('budget_categories')
          .select('id,name')
          .eq('household_id', householdId)
          .neq('budget_group', 'saving'),
        supabase.from('finance_accounts').select('id,name').eq('household_id', householdId).eq('active', true),
        supabase.from('household_members').select('user_id').eq('household_id', householdId),
        supabase.auth.getUser()
      ]);
      const ids = (m.data || []).map(x => x.user_id);
      const p = ids.length
        ? await supabase.from('profiles').select('id,full_name').in('id', ids)
        : {data: [], error: null};
      if (!live) return;
      if (c.error || a.error || m.error || p.error) {
        setError('No se pudo verificar la configuración. Cierra y vuelve a abrir la compra.');
        setLoading(false);
        return;
      }
      setVerified(true);
      setCategories(c.data || []);
      setAccounts(a.data || []);
      setMembers(ids.map(id => ({id, name: p.data?.find(x => x.id === id)?.full_name || 'Integrante'})));
      setPayer(u.data.user?.id || '');
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [householdId]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || !verified) return;
    let value: number;
    try {
      value = incomeAmount(amount);
      if (value <= 0 || !selected.length) throw new Error('Selecciona lo comprado e ingresa el total pagado.');
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const payload = {
      p_household_id: householdId,
      p_list_id: list.id,
      p_item_ids: [...selected].sort(),
      p_amount: value,
      p_date: date,
      p_category_id: category || null,
      p_account_id: account || null,
      p_paid_by: payer,
      p_is_shared: shared,
      p_description: description.trim()
    };
    const fingerprint = JSON.stringify(payload);
    if (request.current.fingerprint !== fingerprint) request.current = {fingerprint, id: crypto.randomUUID()};
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const {data, error} = await supabase.rpc('checkout_shopping_purchase', {
        ...payload,
        p_request_id: request.current.id
      });
      if (error) throw error;
      if (typeof data !== 'string')
        throw new Error('No se pudo confirmar el gasto. Reintenta para comprobarlo sin duplicarlo.');
      setTransactionId(data);
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : (e as {message?: string})?.message ||
              'No pudimos confirmar la compra. Conservamos los datos para reintentar.'
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section className="finance-modal connected-dialog">
        <div className="modal-head">
          <h3>{transactionId ? 'Compra registrada' : 'Registrar gasto de compra'}</h3>
          <button disabled={busy} aria-label="Cerrar registro de compra" onClick={onClose}>
            <X />
          </button>
        </div>
        {transactionId ? (
          <>
            <p className="connected-success" role="status">
              <Check size={19} />
              El gasto quedó guardado una sola vez. Puedes adjuntar la factura o comprobante.
            </p>
            <TransactionReceipts householdId={householdId} transactionId={transactionId} />
            <button className="finance-primary" onClick={onClose}>
              Finalizar
            </button>
          </>
        ) : (
          <form className="finance-form" onSubmit={save}>
            <p className="muted">
              {list.title}. Elige los elementos que cubre este pago. Completar una casilla de la lista por sí solo no
              registra dinero.
            </p>
            <fieldset className="checkout-items">
              <legend>Elementos comprados incluidos</legend>
              {items.map(i => (
                <label key={i.id}>
                  <input
                    type="checkbox"
                    disabled={busy || loading}
                    checked={selected.includes(i.id)}
                    onChange={e =>
                      setSelected(old => (e.target.checked ? [...old, i.id] : old.filter(id => id !== i.id)))
                    }
                  />
                  <span>
                    {i.text}
                    {i.quantity ? ' · ' + i.quantity : ''}
                  </span>
                </label>
              ))}
            </fieldset>
            <label>
              Total pagado (Q)
              <input
                required
                inputMode="decimal"
                value={amount}
                disabled={busy || loading}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <label>
              Descripción
              <input
                required
                maxLength={250}
                value={description}
                disabled={busy}
                onChange={e => setDescription(e.target.value)}
              />
            </label>
            <label>
              Fecha de compra
              <input
                type="date"
                required
                value={date}
                max={localDay()}
                disabled={busy}
                onChange={e => setDate(e.target.value)}
              />
            </label>
            <label>
              Rubro
              <select
                aria-label="Rubro de la compra"
                value={category}
                disabled={busy || loading}
                onChange={e => setCategory(e.target.value)}
              >
                <option value="">Sin categoría</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cuenta
              <select
                aria-label="Cuenta de la compra"
                value={account}
                disabled={busy || loading}
                onChange={e => setAccount(e.target.value)}
              >
                <option value="">Sin cuenta</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pagado por
              <select
                aria-label="Quién pagó la compra"
                required
                value={payer}
                disabled={busy || loading}
                onChange={e => setPayer(e.target.value)}
              >
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-line">
              <input type="checkbox" checked={shared} disabled={busy} onChange={e => setShared(e.target.checked)} />
              Compartido según las reglas del hogar
            </label>
            {error && (
              <p role="alert" className="sharing-error">
                {error}
              </p>
            )}
            <button className="finance-primary" disabled={busy || loading || !verified || !selected.length}>
              <ReceiptText size={18} />
              {busy ? 'Confirmando…' : loading ? 'Cargando…' : 'Confirmar gasto y adjuntar comprobante'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
