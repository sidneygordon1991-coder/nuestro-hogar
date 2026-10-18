// Finance section: accounts.
import {useState, type FormEvent} from 'react';
import {ArrowRightLeft, Pencil, Plus, Trash2} from 'lucide-react';
import DebtPlanner from '../../DebtPlanner';
import {Progress, EmptyFinance, accountIcon, accountTypeName, currency} from '../../FinanceParts';
import {useFinance} from '../useFinanceWorkspace';
import {Modal} from '../shared';
import {formatUsd} from '../../lib/currency';
import {installmentPayment, installmentProgress, type InstallmentKind} from '../../lib/installments';
import {localISODate} from '../../lib/localDate';

export default function FinanceAccounts() {
  const {
    connectedEnabled,
    setReconciling,
    tab,
    busy,
    accountDataError,
    accounts,
    transfers,
    setShowAccountForm,
    setEditingAccount,
    setShowTransferForm,
    memberName,
    accountName,
    accountBalances,
    debtAccounts,
    cardStatus,
    installmentsError,
    archiveAccount,
    deleteTransfer,
    installments,
    guatemalaReady,
    installmentCard,
    setInstallmentCard,
    saveInstallment,
    endInstallment,
    readOnly
  } = useFinance();
  const today = localISODate();
  return (
    <>
      {tab === 'accounts' && !accountDataError && (
        <>
          <div className="account-toolbar">
            <div>
              <p className="eyebrow">Cuentas y deudas</p>
              <h3>Dinero, crédito y transferencias</h3>
              <p>Los pagos entre cuentas no se contabilizan como gasto doble.</p>
            </div>
            {!readOnly && (
              <div>
                <button
                  className="secondary-action"
                  onClick={() => setShowTransferForm(true)}
                  disabled={accounts.length < 2}
                >
                  <ArrowRightLeft /> Transferir / pagar deuda
                </button>
                <button
                  className="finance-new"
                  onClick={() => {
                    setEditingAccount(null);
                    setShowAccountForm(true);
                  }}
                >
                  <Plus /> Cuenta
                </button>
              </div>
            )}
          </div>
          {installmentsError && (
            <p className="finance-message" role="alert">
              No pudimos verificar las cuotas de las tarjetas. Actualiza Finanzas para ver los importes de pago
              completos.
            </p>
          )}
          <div className="account-grid advanced">
            {accountBalances.map(a => (
              <article className={'account-card advanced ' + a.account_class} key={a.id}>
                <span className="account-icon">{accountIcon(a.account_type)}</span>
                <div className="account-card-copy">
                  <small>
                    {accountTypeName(a.account_type)}
                    {a.institution ? ' · ' + a.institution : ''}
                  </small>
                  <strong>{a.name}</strong>
                  {a.usd ? (
                    <b
                      title={
                        a.usd.estimated
                          ? 'Estimado: hay movimientos o transferencias sin su importe original en dólares'
                          : 'Saldo en dólares; en quetzales al tipo de cambio guardado'
                      }
                    >
                      {formatUsd(a.account_class === 'liability' ? Math.max(0, a.usd.usd) : a.usd.usd)}
                      <span className="account-usd-q"> ≈ {currency(a.usd.quetzales)}</span>
                    </b>
                  ) : (
                    <b>{currency(a.account_class === 'liability' ? Math.max(0, a.balance) : a.balance)}</b>
                  )}
                  {a.usd?.estimated && <small>Saldo en dólares estimado al cambio guardado</small>}
                  <em>
                    {a.is_shared ? 'Compartida' : 'Personal'}
                    {a.owner_user_id ? ' · ' + memberName(a.owner_user_id) : ''}
                  </em>
                </div>
                {!readOnly && (
                  <div className="account-card-actions">
                    <button
                      type="button"
                      title="Editar"
                      aria-label={'Editar cuenta ' + a.name}
                      onClick={() => {
                        setEditingAccount(a);
                        setShowAccountForm(true);
                      }}
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Archivar"
                      aria-label={'Archivar cuenta ' + a.name}
                      disabled={busy}
                      onClick={() => archiveAccount(a)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                )}
                {connectedEnabled && (
                  <button className="secondary-action account-reconcile-action" onClick={() => setReconciling(a)}>
                    Conciliar {a.name}
                  </button>
                )}
                {a.account_class === 'liability' && (
                  <div className="account-debt-details">
                    {a.credit_limit ? (
                      <div>
                        <span>Límite</span>
                        <b>{currency(Number(a.credit_limit))}</b>
                      </div>
                    ) : null}
                    {a.statement_day ? (
                      <div>
                        <span>Corte</span>
                        <b>Día {a.statement_day}</b>
                      </div>
                    ) : null}
                    {a.payment_due_day ? (
                      <div>
                        <span>Pago</span>
                        <b>Día {a.payment_due_day}</b>
                      </div>
                    ) : null}
                    {a.minimum_payment ? (
                      <div>
                        <span>Mínimo</span>
                        <b>{currency(Number(a.minimum_payment))}</b>
                      </div>
                    ) : null}
                    {a.apr != null ? (
                      <div>
                        <span>Tasa</span>
                        <b>{Number(a.apr).toFixed(2)}%</b>
                      </div>
                    ) : null}
                  </div>
                )}
                {!installmentsError &&
                  cardStatus.has(a.id) &&
                  (() => {
                    const c = cardStatus.get(a.id)!,
                      day = (d: string) =>
                        new Date(d + 'T12:00')
                          .toLocaleDateString('es-GT', {day: 'numeric', month: 'short'})
                          .replace('.', '');
                    return (
                      <p className={'account-card-status ' + c.state}>
                        {c.statementDate && <span>Corte el {day(c.statementDate)}</span>}
                        {c.dueDate && (
                          <span>
                            Pago el {day(c.dueDate)}
                            {c.state === 'overdue' ? ' · vencido' : ''}
                          </span>
                        )}
                        <span>
                          Para no pagar intereses: <b>{currency(c.toAvoidInterest)}</b>
                        </span>
                        {c.minimum !== null && c.toAvoidInterest > 0 && <span>Mínimo: {currency(c.minimum)}</span>}
                        {c.installmentsPending > 0 && (
                          <span>
                            En cuotas, para meses siguientes: <b>{currency(c.installmentsPending)}</b>
                          </span>
                        )}
                      </p>
                    );
                  })()}
                {a.account_type === 'credit' && guatemalaReady && (
                  <div className="account-installments">
                    {installments
                      .filter(p => p.account_id === a.id)
                      .map(p => {
                        const pr = installmentProgress(p, today);
                        return (
                          <div key={p.id} className={pr.done ? 'done' : ''}>
                            <div>
                              <strong>{p.description}</strong>
                              <small>
                                {p.kind === 'extra' ? 'Extrafinanciamiento' : 'Visacuotas'} ·{' '}
                                {pr.done
                                  ? 'pagado'
                                  : 'cuota ' +
                                    Math.min(pr.billed + 1, pr.months) +
                                    ' de ' +
                                    pr.months +
                                    ' · ' +
                                    currency(pr.next?.payment ?? pr.payment) +
                                    ' al mes'}
                                {pr.futureInterest > 0 ? ' · intereses por venir ' + currency(pr.futureInterest) : ''}
                              </small>
                            </div>
                            <b>{pr.done ? currency(0) : currency(pr.unbilled)}</b>
                            {!readOnly && (
                              <button
                                type="button"
                                title="Quitar"
                                aria-label={'Quitar ' + p.description}
                                onClick={() => endInstallment(p)}
                              >
                                <Trash2 aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    {!readOnly && (
                      <button type="button" className="account-installments-add" onClick={() => setInstallmentCard(a)}>
                        <Plus aria-hidden="true" /> Visacuotas o extrafinanciamiento
                      </button>
                    )}
                  </div>
                )}
                {a.account_type === 'credit' && a.credit_limit ? (
                  <div className="account-utilization">
                    <div>
                      <span>Utilización</span>
                      <b>{Math.round((Math.max(0, a.balance) / Number(a.credit_limit)) * 100)}%</b>
                    </div>
                    <Progress value={(Math.max(0, a.balance) / Number(a.credit_limit)) * 100} />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          {!accounts.length && (
            <EmptyFinance
              art="accounts"
              text="Agrega cuentas, tarjetas o préstamos para controlar de dónde sale el dinero y cuánto debes."
            />
          )}
          {debtAccounts.length > 0 && <DebtPlanner debts={debtAccounts} />}
          {installmentCard && (
            <Modal title={'Cuotas en ' + installmentCard.name} close={() => setInstallmentCard(null)}>
              <InstallmentForm busy={busy} today={today} onSubmit={saveInstallment} />
            </Modal>
          )}

          <div className="finance-panel transfer-history">
            <div className="panel-title">
              <div>
                <h3>Transferencias y pagos de deuda</h3>
                <small>Mover dinero entre cuentas no altera tus ingresos o gastos.</small>
              </div>
              {!readOnly && (
                <button onClick={() => setShowTransferForm(true)} disabled={accounts.length < 2}>
                  <Plus size={15} /> Registrar
                </button>
              )}
            </div>
            <div>
              {transfers.slice(0, 10).map(t => (
                <div className="transfer-row" key={t.id}>
                  <span>
                    <ArrowRightLeft />
                  </span>
                  <div>
                    <strong>
                      {accountName(t.from_account_id)} → {accountName(t.to_account_id)}
                    </strong>
                    <small>
                      {t.description || 'Transferencia'} ·{' '}
                      {new Date(t.transfer_date + 'T12:00').toLocaleDateString('es-GT', {
                        day: 'numeric',
                        month: 'short'
                      })}
                    </small>
                  </div>
                  <b>{currency(Number(t.amount))}</b>
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={
                        'Eliminar transferencia de ' +
                        accountName(t.from_account_id) +
                        ' a ' +
                        accountName(t.to_account_id) +
                        ' por ' +
                        currency(Number(t.amount))
                      }
                      title="Eliminar"
                      disabled={busy}
                      onClick={() => deleteTransfer(t)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!transfers.length && (
              <EmptyFinance text="Aquí aparecerán pagos de tarjeta, préstamos y transferencias entre cuentas." />
            )}
          </div>
        </>
      )}
    </>
  );
}

function InstallmentForm({
  busy,
  today,
  onSubmit
}: {
  busy: boolean;
  today: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [kind, setKind] = useState<InstallmentKind>('visacuotas'),
    [principal, setPrincipal] = useState(0),
    [months, setMonths] = useState(12),
    [rate, setRate] = useState(0);
  const payment = principal > 0 && months > 0 ? installmentPayment(principal, months, kind === 'extra' ? rate : 0) : 0;
  const totalInterest = payment > 0 ? Math.max(0, Math.round((payment * months - principal) * 100) / 100) : 0;
  return (
    <form className="finance-form" onSubmit={onSubmit}>
      <div className="installment-kinds" role="radiogroup" aria-label="Tipo">
        {(
          [
            ['visacuotas', 'Visacuotas', 'Una compra en cuotas sin intereses'],
            ['extra', 'Extrafinanciamiento', 'Efectivo de la tarjeta, en cuotas con interés']
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className={kind === value ? 'active' : ''}>
            <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} />
            <strong>{label}</strong>
            <small>{hint}</small>
          </label>
        ))}
      </div>
      <label>
        Descripción
        <input
          name="description"
          required
          maxLength={120}
          placeholder={kind === 'extra' ? 'Extrafinanciamiento para inscripciones' : 'Refrigeradora'}
        />
      </label>
      <div className="two">
        <label>
          {kind === 'extra' ? 'Monto recibido' : 'Monto de la compra'}
          <input
            name="principal"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            onChange={e => setPrincipal(Number(e.target.value) || 0)}
          />
        </label>
        <label>
          Cuotas
          <input
            name="months"
            type="number"
            min="1"
            max="72"
            step="1"
            value={months}
            onChange={e => setMonths(Math.max(1, Math.min(72, Math.round(Number(e.target.value) || 1))))}
          />
        </label>
      </div>
      <div className={kind === 'extra' ? 'two' : undefined}>
        {kind === 'extra' && (
          <label>
            Tasa anual %
            <input
              name="annual_rate"
              type="number"
              min="0"
              max="200"
              step="0.01"
              required
              onChange={e => setRate(Number(e.target.value) || 0)}
            />
          </label>
        )}
        <label>
          Mes de la primera cuota (primer corte después de la compra)
          <input name="first_statement" type="month" required defaultValue={today.slice(0, 7)} />
        </label>
      </div>
      {payment > 0 && (
        <p className="installment-preview">
          {months} cuotas de <b>{currency(payment)}</b>
          {totalInterest > 0 ? ' · pagarás ' + currency(totalInterest) + ' de intereses en total' : ' · sin intereses'}.
          El saldo completo aparece en la tarjeta, pero cada corte solo te cobra una cuota.
        </p>
      )}
      <button className="finance-primary" disabled={busy}>
        Guardar cuotas
      </button>
    </form>
  );
}
