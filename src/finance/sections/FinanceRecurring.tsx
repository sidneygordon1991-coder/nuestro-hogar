// Finance section: recurring.
import {CalendarClock, Check, Pencil, Trash2} from 'lucide-react';
import {EmptyFinance, statusLabel} from '../../FinanceParts';
import {entryMoney} from '../shared';
import {SubscriptionsPanel} from './FinanceOptional';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceRecurring() {
  const {
    tab,
    setEditingRecurring,
    setRemoving,
    setManagementError,
    busy,
    categoryName,
    accountName,
    activeRecurring,
    visibleOccurrences,
    occurrenceRecurring,
    recurringById,
    occurrenceStatus,
    recurringStats,
    payRecurringOccurrence,
    skipRecurringOccurrence,
    readOnly
  } = useFinance();
  return (
    <>
      {tab === 'recurring' && (
        <>
          <SubscriptionsPanel />
          <section className="finance-panel recurring-management" aria-label="Programación de recurrentes">
            <div className="panel-title">
              <div>
                <p className="eyebrow">A tu medida</p>
                <h3>Tu programación recurrente</h3>
                <small>
                  Edita el monto, día y otros datos, o elimina una repetición conservando sus pagos realizados.
                </small>
              </div>
              <CalendarClock size={21} />
            </div>
            {activeRecurring.length ? (
              <div>
                {activeRecurring.map(r => (
                  <div key={r.id} className="recurring-management-row">
                    <span className="savings-history-icon">
                      <CalendarClock size={20} />
                    </span>
                    <div className="savings-history-copy">
                      <strong>{r.description}</strong>
                      <small>
                        {r.type === 'income' ? 'Ingreso' : 'Gasto'} · día {r.due_day} de cada mes
                      </small>
                    </div>
                    <b>{entryMoney(Number(r.amount))}</b>
                    {!readOnly && (
                      <div className="finance-entry-actions">
                        <button
                          type="button"
                          aria-label={'Editar recurrente ' + r.description}
                          disabled={busy}
                          onClick={() => {
                            setManagementError('');
                            setEditingRecurring(r);
                          }}
                        >
                          <Pencil size={15} />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          className="entry-delete"
                          aria-label={'Eliminar recurrente ' + r.description}
                          disabled={busy}
                          onClick={() => {
                            setManagementError('');
                            setRemoving({kind: 'recurring', row: r});
                          }}
                        >
                          <Trash2 size={15} />
                          <span>Eliminar</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyFinance
                art="calendar"
                text="No tienes repeticiones activas. Puedes crear una al registrar un movimiento y elegir repetir cada mes."
              />
            )}
          </section>
          <div className="recurring-kpis">
            <div>
              <small>Pendientes</small>
              <strong>{recurringStats.pending}</strong>
            </div>
            <div>
              <small>Pagados</small>
              <strong>{recurringStats.paid}</strong>
            </div>
            <div>
              <small>Vencidos</small>
              <strong>{recurringStats.overdue}</strong>
            </div>
          </div>
          <div className="finance-panel recurring-panel">
            <div className="panel-title">
              <div>
                <h3>Pagos recurrentes</h3>
                <small>Marca cada compromiso como pagado y el movimiento se crea automáticamente.</small>
              </div>
              <CalendarClock size={20} />
            </div>
            <div className="recurring-list">
              {visibleOccurrences.map(o => {
                const r = occurrenceRecurring(o);
                if (!r) return null;
                const status = occurrenceStatus(o);
                return (
                  <div className="recurring-row" key={o.id}>
                    <div className={'recurring-date ' + status}>
                      <span>{new Date(o.due_date + 'T12:00').toLocaleDateString('es-GT', {day: '2-digit'})}</span>
                      <small>{new Date(o.due_date + 'T12:00').toLocaleDateString('es-GT', {month: 'short'})}</small>
                    </div>
                    <div className="recurring-main">
                      <div>
                        <strong>{r.description}</strong>
                        <small>
                          {categoryName(r.category_id)} · {r.is_shared ? 'Compartido' : 'Personal'} ·{' '}
                          {accountName(r.account_id)}
                        </small>
                      </div>
                      <span className={'status-pill ' + status}>{statusLabel(status)}</span>
                    </div>
                    <div className="recurring-amount">
                      <strong>
                        {r.type === 'income' ? '+' : '−'}
                        {entryMoney(Number(r.amount))}
                      </strong>
                      <small>{r.type === 'income' ? 'Ingreso' : 'Gasto'}</small>
                    </div>
                    <div className="recurring-actions">
                      {!readOnly && recurringById(o.recurring_transaction_id)?.active !== false && (
                        <button
                          className="recurring-edit"
                          disabled={busy}
                          aria-label={'Editar programación de ' + r.description}
                          onClick={() => {
                            setManagementError('');
                            setEditingRecurring(recurringById(o.recurring_transaction_id)!);
                          }}
                        >
                          <Pencil size={15} /> Editar
                        </button>
                      )}
                      {!readOnly && (status === 'pending' || status === 'overdue') && (
                        <>
                          <button className="pay" disabled={busy} onClick={() => payRecurringOccurrence(o)}>
                            <Check size={15} /> Pagado
                          </button>
                          <button className="skip" disabled={busy} onClick={() => skipRecurringOccurrence(o)}>
                            Omitir
                          </button>
                        </>
                      )}
                      {status === 'paid' && (
                        <span className="paid-note">
                          <Check size={15} /> Registrado
                        </span>
                      )}
                      {status === 'skipped' && <span className="skipped-note">Omitido</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {!visibleOccurrences.length && (
              <EmptyFinance text="Todavía no hay compromisos recurrentes para este mes." />
            )}
          </div>
        </>
      )}
    </>
  );
}
