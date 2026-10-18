import {useMemo, useState} from 'react';
import {ArrowRight, Check, CreditCard, HandCoins, Lock, Trash2} from 'lucide-react';
import {supabase} from './lib/supabase';
import {formatMoney as money} from './lib/money';
import {formatEntryAmount} from './lib/currency';
import {memberFlows, settlementSummary} from './lib/settlements';
import type {CardStatus} from './lib/creditCards';
import type {PrivateEntry} from './lib/homeOverview';

const shortDate = (date: string) =>
  new Date(date + 'T12:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'short'}).replace('.', '');
const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'Integrante';

/** Credit cards: what to pay before the due date so no interest is charged. */
export function HomeCards({cards, onNavigate}: {cards: CardStatus[]; onNavigate: (tab: string) => void}) {
  if (!cards.length) return null;
  return (
    <section className="home-card home-cards" aria-labelledby="home-cards-title">
      <div className="home-card-head">
        <h3 id="home-cards-title">Tus tarjetas</h3>
      </div>
      <ul className="home-card-list">
        {cards.map(card => (
          <li key={card.id} className={'is-' + card.state}>
            <button type="button" onClick={() => onNavigate('presupuesto:accounts')}>
              <span
                className={
                  'home-tile ' +
                  (card.state === 'overdue'
                    ? 'home-tile--danger'
                    : card.state === 'soon'
                      ? 'home-tile--warning'
                      : 'home-tile--accent')
                }
                aria-hidden="true"
              >
                <CreditCard />
              </span>
              <span className="home-card-copy">
                <strong>{card.name}</strong>
                <small>
                  {card.state === 'clear'
                    ? 'Sin saldo por pagar del último corte'
                    : card.dueDate
                      ? (card.state === 'overdue' ? 'Venció el ' : 'Paga antes del ') +
                        shortDate(card.dueDate) +
                        (card.daysToDue !== null && card.daysToDue >= 0
                          ? ' · ' +
                            (card.daysToDue === 0
                              ? 'hoy'
                              : card.daysToDue === 1
                                ? 'mañana'
                                : 'en ' + card.daysToDue + ' días')
                          : '')
                      : 'Configura el día de pago en Cuentas'}
                </small>
              </span>
              <span className="home-card-amount">
                <b>{money(card.toAvoidInterest)}</b>
                <small>{card.state === 'clear' ? 'al día' : 'para no pagar intereses'}</small>
              </span>
            </button>
            {card.utilization !== null && (
              <span
                className="home-card-usage"
                role="progressbar"
                aria-label={'Uso del límite de ' + card.name}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(card.utilization)}
              >
                <i style={{width: card.utilization + '%'}} />
              </span>
            )}
            {card.minimum !== null && card.state !== 'clear' && (
              <p className="home-card-note">
                Pago mínimo {money(card.minimum)}. Pagar solo el mínimo genera intereses sobre el resto.
              </p>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="home-link" onClick={() => onNavigate('presupuesto:accounts')}>
        Ver cuentas y deudas <ArrowRight size={15} aria-hidden="true" />
      </button>
    </section>
  );
}

type Member = {user_id: string; full_name: string};
type Settlement = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number | string;
  settled_on: string;
  note?: string | null;
};

/** Shared expenses between members: who owes whom this month, with one tap to record the payment. */
export function HomeSettlements({
  householdId,
  userId,
  month,
  members,
  transactions,
  splits,
  settlements,
  canEdit,
  onSaved
}: {
  householdId: string;
  userId: string;
  month: string;
  members: Member[];
  transactions: {
    id: string;
    type: string;
    amount: number | string;
    paid_by: string | null;
    is_shared?: boolean | null;
  }[];
  splits: {transaction_id: string; user_id: string; share_amount: number | string}[];
  settlements: Settlement[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [done, setDone] = useState('');
  const summary = useMemo(
    () =>
      settlementSummary(
        memberFlows(
          members.map(m => m.user_id),
          transactions,
          splits
        ),
        settlements
      ),
    [members, transactions, splits, settlements]
  );
  if (members.length < 2 || (!splits.length && !settlements.length)) return null;
  const person = (id: string) => firstName(members.find(m => m.user_id === id)?.full_name || '');
  const sentence = (from: string, to: string, amount: number) =>
    from === userId
      ? 'Le pagas ' + money(amount) + ' a ' + person(to)
      : to === userId
        ? person(from) + ' te paga ' + money(amount)
        : person(from) + ' le paga ' + money(amount) + ' a ' + person(to);
  async function settle(s: {from_user_id: string; to_user_id: string; amount: number}) {
    const key = s.from_user_id + s.to_user_id;
    setBusy(key);
    setError('');
    setDone('');
    const {error} = await supabase.from('finance_settlements').insert({
      household_id: householdId,
      from_user_id: s.from_user_id,
      to_user_id: s.to_user_id,
      amount: s.amount,
      period_month: month,
      created_by: userId
    });
    setBusy('');
    if (error) {
      setError('No pudimos registrar el pago. Revisa tu conexión e inténtalo de nuevo.');
      return;
    }
    try {
      navigator.vibrate?.(12);
    } catch {
      /* not supported */
    }
    setDone('Pago registrado: ' + money(s.amount));
    onSaved();
  }
  return (
    <section className="home-card home-settle" aria-labelledby="home-settle-title">
      <div className="home-card-head">
        <h3 id="home-settle-title">Entre ustedes este mes</h3>
      </div>
      {summary.suggestions.length ? (
        <ul className="home-settle-list">
          {summary.suggestions.map(s => (
            <li key={s.from_user_id + s.to_user_id}>
              <span className="home-tile home-tile--accent" aria-hidden="true">
                <HandCoins />
              </span>
              <p>
                <strong>{sentence(s.from_user_id, s.to_user_id, s.amount)}</strong>
                <small>Por gastos compartidos registrados</small>
              </p>
              {canEdit && (
                <button
                  type="button"
                  className="home-settle-button"
                  disabled={busy === s.from_user_id + s.to_user_id}
                  onClick={() => settle(s)}
                >
                  {busy === s.from_user_id + s.to_user_id ? 'Guardando…' : 'Marcar como pagado'}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-settle-even">
          <Check size={16} aria-hidden="true" /> Están a mano este mes.
        </p>
      )}
      {settlements.length > 0 && (
        <p className="home-caption">
          Pagos registrados:{' '}
          {settlements
            .map(s => person(s.from_user_id) + ' → ' + person(s.to_user_id) + ' ' + money(Number(s.amount)))
            .join(' · ')}
        </p>
      )}
      {done && (
        <p className="home-caption" role="status">
          {done}
        </p>
      )}
      {error && (
        <p className="home-caption is-negative" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** "Solo yo": private movements, visible only to their owner and kept out of the household finances. */
export function HomePrivate({
  entries,
  canEdit,
  onChanged
}: {
  entries: PrivateEntry[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  async function remove(id: string) {
    if (!window.confirm('¿Eliminar este movimiento privado?')) return;
    setBusy(id);
    setError('');
    const {error} = await supabase.from('private_transactions').delete().eq('id', id);
    setBusy('');
    if (error) setError('No pudimos eliminarlo. Inténtalo de nuevo.');
    else onChanged();
  }
  return (
    <section className="home-card home-private" aria-labelledby="home-private-title">
      <div className="home-card-head">
        <h3 id="home-private-title">Solo para ti</h3>
        <Lock size={17} aria-hidden="true" />
      </div>
      {entries.length ? (
        <ul className="home-private-list">
          {entries.slice(0, 6).map(e => (
            <li key={e.id}>
              <span className="home-private-copy">
                <strong>{e.description}</strong>
                <small>
                  {shortDate(e.transaction_date)} · {e.type === 'income' ? 'Ingreso' : 'Gasto'}
                </small>
              </span>
              <b className={e.type === 'income' ? '' : 'is-expense'}>
                {e.type === 'income' ? '+' : '−'}
                {formatEntryAmount(Number(e.amount), e)}
              </b>
              {canEdit && (
                <button
                  type="button"
                  className="home-icon-button"
                  aria-label={'Eliminar ' + e.description}
                  disabled={busy === e.id}
                  onClick={() => remove(e.id)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-caption">
          Aún no tienes movimientos privados este mes. Al registrar, elige <b>Solo yo</b>.
        </p>
      )}
      <p className="home-caption">Solo tú los ves. No cuentan en las finanzas del hogar ni en sus respaldos.</p>
      {error && (
        <p className="home-caption is-negative" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
