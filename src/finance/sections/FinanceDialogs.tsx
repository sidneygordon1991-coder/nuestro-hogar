import TransactionImpact from '../../TransactionImpact';
import PaymentBudgetField from '../../PaymentBudgetField';
// Finance: every form and dialog of the module.
import EntityComments from '../../EntityComments';
import DraftForm from '../../DraftForm';
import AccountReconciliation from '../../AccountReconciliation';
import SavingsEntryDialog from '../../SavingsEntryDialog';
import TransactionReceipts from '../../TransactionReceipts';
import {ArrowRightLeft, Check, Trash2} from 'lucide-react';
import {formatEntryAmount, usdRate} from '../../lib/currency';
import ImportStatement from '../../ImportStatement';
import {AmountField, splitMethodLabel, accountTypeName, isoDate} from '../../FinanceParts';
import {entryMoney, Modal} from '../shared';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceDialogs() {
  const {
    setTab,
    cutoff,
    reconciling,
    setReconciling,
    editingContribution,
    setEditingContribution,
    editingRecurring,
    setEditingRecurring,
    removing,
    setRemoving,
    managementError,
    savingsEntry,
    setSavingsEntry,
    busy,
    message,
    categories,
    goals,
    accounts,
    members,
    currentUser,
    detailTx,
    setDetailTx,
    showTxForm,
    setShowTxForm,
    editingTx,
    setEditingTx,
    showGoalForm,
    setShowGoalForm,
    showAccountForm,
    setShowAccountForm,
    editingAccount,
    setEditingAccount,
    showAssetForm,
    setShowAssetForm,
    editingAsset,
    setEditingAsset,
    showTransferForm,
    setShowTransferForm,
    showCategoryForm,
    setShowCategoryForm,
    splitMethod,
    usdRateSetting,
    showImport,
    setShowImport,
    importBusy,
    refreshReceiptCounts,
    load,
    categoryName,
    memberName,
    accountBalances,
    recurringById,
    addTransaction,
    addCategory,
    editTransaction,
    addGoal,
    saveContribution,
    saveRecurring,
    removeEntry,
    saveAccount,
    accountCurrency,
    guatemalaReady,
    currencyReady,
    saveAsset,
    addTransfer,
    goalName,
    household,
    readOnly
  } = useFinance();
  return (
    <>
      {reconciling && (
        <AccountReconciliation
          householdId={household.id}
          account={reconciling}
          readOnly={readOnly}
          onClose={() => setReconciling(null)}
        />
      )}
      {detailTx && (
        <Modal title="Detalle del movimiento" close={() => setDetailTx(null)}>
          <div className="transaction-detail-summary">
            <strong>{detailTx.description}</strong>
            <b className={detailTx.type}>{formatEntryAmount(Number(detailTx.amount), detailTx)}</b>
            <dl>
              {detailTx.original_currency === 'USD' && detailTx.exchange_rate ? (
                <div>
                  <dt>Tipo de cambio</dt>
                  <dd>Q {Number(detailTx.exchange_rate)} por US$</dd>
                </div>
              ) : null}
              <div>
                <dt>Fecha</dt>
                <dd>{new Date(detailTx.transaction_date + 'T12:00').toLocaleDateString('es-GT')}</dd>
              </div>
              <div>
                <dt>Categoría</dt>
                <dd>{categoryName(detailTx.category_id)}</dd>
              </div>
              <div>
                <dt>Pagado por</dt>
                <dd>{memberName(detailTx.paid_by)}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{detailTx.is_shared ? 'Compartido' : 'Personal'}</dd>
                {detailTx.type === 'expense' && (
                  <>
                    <dt>Presupuesto</dt>
                    <dd>{detailTx.budget_included === false ? 'Fuera del presupuesto' : 'Incluido'}</dd>
                  </>
                )}
              </div>
            </dl>
            {detailTx.notes && <p>{detailTx.notes}</p>}
          </div>
          <TransactionImpact
            key={household.id + ':' + detailTx.id}
            transaction={detailTx}
            account={accounts.find(a => a.id === detailTx.account_id)}
            category={categories.find(c => c.id === detailTx.category_id)}
            today={cutoff}
            householdId={household.id}
            memberName={memberName}
          />
          <div className="evidence-actions transaction-next-actions">
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  setEditingTx(detailTx);
                  setDetailTx(null);
                }}
              >
                Editar este movimiento
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDetailTx(null);
                setTab('accounts');
              }}
            >
              Revisar cuentas
            </button>
          </div>
          <TransactionReceipts
            key={detailTx.id}
            householdId={household.id}
            transactionId={detailTx.id}
            readOnly={readOnly}
            onChanged={refreshReceiptCounts}
          />
          <EntityComments
            key={'comments-' + detailTx.id}
            householdId={household.id}
            transactionId={detailTx.id}
            readOnly={readOnly}
          />
        </Modal>
      )}
      {showImport && !readOnly && (
        <Modal
          title="Importar estado de cuenta"
          close={() => {
            if (
              importBusy.current &&
              !window.confirm(
                'La importación sigue en curso. Si cierras, se terminará de guardar pero no verás el resumen. ¿Cerrar de todos modos?'
              )
            )
              return;
            setShowImport(false);
          }}
        >
          <ImportStatement
            onBusy={busy => {
              importBusy.current = busy;
            }}
            householdId={household.id}
            currentUser={currentUser}
            accounts={accounts}
            categories={categories}
            memberCount={members.length}
            onImported={() => void load()}
            onClose={() => setShowImport(false)}
          />
        </Modal>
      )}
      {showTxForm && !readOnly && (
        <Modal title="Nuevo movimiento" close={() => setShowTxForm(false)}>
          <DraftForm
            key={household.id + currentUser}
            userId={currentUser}
            householdId={household.id}
            kind="movement"
            errorMessage={message}
            onSubmit={addTransaction}
            onSaved={() => setShowTxForm(false)}
          >
            <label>
              Tipo
              <select name="type" defaultValue="expense">
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
              </select>
            </label>
            <AmountField householdRate={usdRate(usdRateSetting)} />
            <label>
              Descripción
              <input name="description" placeholder="Ej. Supermercado" required />
            </label>
            <div className="two">
              <label>
                Categoría
                <select name="category_id">
                  <option value="">Sin categoría</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha
                <input name="date" type="date" defaultValue={isoDate()} required />
              </label>
            </div>
            <div className="two">
              <label>
                Pagado por
                <select name="paid_by" defaultValue={currentUser}>
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cuenta
                <select name="account_id">
                  <option value="">Sin cuenta</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              ¿De quién es?
              <select name="share_mode" defaultValue="shared">
                <option value="shared">Compartido · {splitMethodLabel(splitMethod)}</option>
                <option value="personal">Personal de quien pagó</option>
              </select>
              <small>Define el reparto. Los integrantes con acceso a Finanzas pueden consultar este registro.</small>
            </label>
            <PaymentBudgetField accounts={accounts} disabled={busy} />
            <small className="tools-note">
              Si repites este movimiento, los próximos pagos usarán la regla automática de su cuenta. Podrás editar cada
              pago registrado.
            </small>
            <label>
              Notas
              <input name="notes" placeholder="Opcional" />
            </label>
            <label className="check-line">
              <input type="checkbox" name="recurring" /> Repetir todos los meses
            </label>
            <label>
              Día de pago recurrente
              <input name="due_day" type="number" min="1" max="31" placeholder="Ej. 5" />
            </label>
            <button className="finance-primary" disabled={busy}>
              {busy ? 'Guardando...' : 'Guardar movimiento'}
            </button>
          </DraftForm>
        </Modal>
      )}
      {editingTx && !readOnly && (
        <Modal title="Editar movimiento" close={() => setEditingTx(null)}>
          <form className="finance-form" onSubmit={editTransaction}>
            <label>
              Tipo
              <select name="type" defaultValue={editingTx.type}>
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
              </select>
            </label>
            <AmountField householdRate={usdRate(usdRateSetting)} initial={editingTx} />
            <label>
              Descripción
              <input name="description" defaultValue={editingTx.description} required />
            </label>
            <div className="two">
              <label>
                Categoría
                <select name="category_id" defaultValue={editingTx.category_id || ''}>
                  <option value="">Sin categoría</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha
                <input name="date" type="date" defaultValue={editingTx.transaction_date} required />
              </label>
            </div>
            <div className="two">
              <label>
                Pagado por
                <select name="paid_by" defaultValue={editingTx.paid_by || currentUser}>
                  {members.map(member => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cuenta
                <select name="account_id" defaultValue={editingTx.account_id || ''}>
                  <option value="">Sin cuenta</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              ¿De quién es?
              <select name="share_mode" defaultValue={editingTx.is_shared ? 'shared' : 'personal'}>
                <option value="shared">Compartido · {splitMethodLabel(splitMethod)}</option>
                <option value="personal">Personal de quien pagó</option>
              </select>
              <small>Define el reparto. Los integrantes con acceso a Finanzas pueden consultar este registro.</small>
            </label>
            <PaymentBudgetField
              accounts={accounts}
              disabled={busy}
              initial={editingTx.budget_included === false ? 'false' : 'true'}
            />
            <label>
              Notas
              <input name="notes" defaultValue={editingTx.notes || ''} placeholder="Opcional" />
            </label>
            {editingTx.recurring_transaction_id && (
              <div className="linked-recurring-edit">
                <label className="check-line">
                  <input type="checkbox" name="update_recurring" defaultChecked /> Actualizar también los próximos pagos
                  recurrentes
                </label>
                <label>
                  Día de vencimiento
                  <input
                    name="due_day"
                    type="number"
                    min="1"
                    max="31"
                    defaultValue={
                      recurringById(editingTx.recurring_transaction_id)?.due_day ||
                      new Date(editingTx.transaction_date + 'T12:00').getDate()
                    }
                  />
                </label>
              </div>
            )}
            <button className="finance-primary" disabled={busy}>
              <Check size={17} />
              {busy ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </form>
        </Modal>
      )}
      {savingsEntry && !readOnly && (
        <SavingsEntryDialog
          householdId={household.id}
          goal={savingsEntry.goal}
          direction={savingsEntry.direction}
          onClose={() => setSavingsEntry(null)}
          onSaved={() => {
            setSavingsEntry(null);
            void load();
          }}
        />
      )}
      {editingContribution && !readOnly && (
        <Modal
          title={Number(editingContribution.amount) < 0 ? 'Editar retiro de ahorro' : 'Editar aporte de ahorro'}
          close={() => {
            if (!busy) setEditingContribution(null);
          }}
        >
          <form className="finance-form finance-management-form" onSubmit={saveContribution}>
            <p className="finance-management-note">
              El cambio actualizará el avance de la meta y el ahorro del período correspondiente.
            </p>
            <label>
              Meta de ahorro
              <select name="goal_id" defaultValue={editingContribution.goal_id} required>
                {goals
                  .filter(g => g.active || g.id === editingContribution.goal_id)
                  .map(g => (
                    <option value={g.id} key={g.id}>
                      {g.name}
                      {g.active ? '' : ' · archivada'}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Monto del movimiento (Q)
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                max="9999999999.99"
                step="0.01"
                defaultValue={Math.abs(Number(editingContribution.amount))}
                required
              />
            </label>
            <label>
              Fecha del aporte
              <input name="date" type="date" defaultValue={editingContribution.contribution_date} required />
            </label>
            {managementError && (
              <p role="alert" className="finance-management-error">
                {managementError}
              </p>
            )}
            <button type="submit" className="finance-primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar aporte'}
            </button>
          </form>
        </Modal>
      )}
      {editingRecurring && !readOnly && (
        <Modal
          title="Editar recurrente"
          close={() => {
            if (!busy) setEditingRecurring(null);
          }}
        >
          <form className="finance-form finance-management-form" onSubmit={saveRecurring}>
            <p className="finance-management-note">
              Se actualizarán la programación y los vencimientos pendientes. Los pagos realizados y los vencimientos
              omitidos conservan sus datos.
            </p>
            <label>
              Descripción
              <input name="description" maxLength={250} defaultValue={editingRecurring.description} required />
            </label>
            <div className="finance-two">
              <label>
                Tipo
                <select name="type" defaultValue={editingRecurring.type}>
                  <option value="expense">Gasto</option>
                  <option value="income">Ingreso</option>
                </select>
              </label>
              <label>
                Monto (Q)
                <input
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                  defaultValue={editingRecurring.amount}
                  required
                />
              </label>
            </div>
            <label>
              Día de vencimiento
              <input
                name="due_day"
                type="number"
                min="1"
                max="31"
                step="1"
                defaultValue={editingRecurring.due_day}
                required
              />
            </label>
            <label>
              Categoría
              <select name="category_id" defaultValue={editingRecurring.category_id || ''}>
                <option value="">Sin categoría</option>
                {categories.map(c => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cuenta
              <select name="account_id" defaultValue={editingRecurring.account_id || ''}>
                <option value="">Sin cuenta</option>
                {accounts.map(a => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Responsable
              <select name="paid_by" defaultValue={editingRecurring.paid_by || ''}>
                <option value="">Quien registre el pago</option>
                {members.map(m => (
                  <option value={m.user_id} key={m.user_id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reparto
              <select name="share_mode" defaultValue={editingRecurring.is_shared ? 'shared' : 'personal'}>
                <option value="shared">Compartido · {splitMethodLabel(splitMethod)}</option>
                <option value="personal">Personal</option>
              </select>
            </label>
            {managementError && (
              <p role="alert" className="finance-management-error">
                {managementError}
              </p>
            )}
            <button type="submit" className="finance-primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar recurrente'}
            </button>
          </form>
        </Modal>
      )}
      {removing && !readOnly && (
        <Modal
          title={removing.kind === 'contribution' ? 'Eliminar aporte de ahorro' : 'Eliminar recurrente'}
          close={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <div className="finance-management-confirm">
            <span className="entry-delete-symbol">
              <Trash2 size={26} />
            </span>
            <strong>
              {removing.kind === 'contribution' ? goalName(removing.row.goal_id) : removing.row.description}
            </strong>
            <b>{entryMoney(Number(removing.row.amount))}</b>
            <p>
              {removing.kind === 'contribution'
                ? 'Este aporte se eliminará del historial y se recalcularán el avance de la meta y el ahorro del período.'
                : 'Se eliminará la repetición de la programación y se cancelarán sus vencimientos pendientes. Los movimientos ya pagados seguirán en tu historial.'}
            </p>
            {managementError && (
              <p role="alert" className="finance-management-error">
                {managementError}
              </p>
            )}
            <div>
              <button type="button" disabled={busy} onClick={() => setRemoving(null)}>
                Cancelar
              </button>
              <button type="button" className="finance-entry-delete-confirm" disabled={busy} onClick={removeEntry}>
                {busy ? 'Eliminando…' : 'Confirmar eliminación'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showCategoryForm && !readOnly && (
        <Modal title="Nueva categoría" close={() => setShowCategoryForm(false)}>
          <form className="finance-form" onSubmit={addCategory}>
            <label>
              Nombre
              <input name="name" placeholder="Ej. Mascotas" required />
            </label>
            <label>
              Tipo
              <select name="budget_group" defaultValue="variable">
                <option value="fixed">Gasto fijo</option>
                <option value="variable">Gasto variable</option>
                <option value="saving">Ahorro</option>
              </select>
            </label>
            <button className="finance-primary" disabled={busy}>
              {busy ? 'Guardando...' : 'Crear categoría'}
            </button>
          </form>
        </Modal>
      )}
      {showGoalForm && !readOnly && (
        <Modal title="Nueva meta" close={() => setShowGoalForm(false)}>
          <form className="finance-form" onSubmit={addGoal}>
            <label>
              Nombre
              <input name="name" placeholder="Ej. Fondo de emergencia" required />
            </label>
            <label>
              Meta
              <input name="target_amount" type="number" min="1" step=".01" placeholder="50000" required />
            </label>
            <label>
              Fecha objetivo
              <input name="target_date" type="date" />
            </label>
            <button className="finance-primary" disabled={busy}>
              Crear meta
            </button>
          </form>
        </Modal>
      )}
      {showAccountForm && !readOnly && (
        <Modal
          title={editingAccount ? 'Editar cuenta o deuda' : 'Nueva cuenta o deuda'}
          close={() => {
            setShowAccountForm(false);
            setEditingAccount(null);
          }}
        >
          <form className="finance-form" onSubmit={saveAccount}>
            <label>
              Nombre
              <input
                name="name"
                defaultValue={editingAccount?.name || ''}
                placeholder="Ej. Cuenta BI o Visa"
                required
              />
            </label>
            <div className="two">
              <label>
                Tipo
                <select name="account_type" defaultValue={editingAccount?.account_type || 'checking'}>
                  <option value="checking">Cuenta bancaria</option>
                  <option value="savings">Ahorro</option>
                  <option value="cash">Efectivo</option>
                  <option value="investment">Inversión</option>
                  <option value="credit">Tarjeta de crédito</option>
                  <option value="loan">Préstamo</option>
                  <option value="mortgage">Hipoteca</option>
                  <option value="other">Otra</option>
                </select>
              </label>
              <label>
                Clase
                <select name="account_class" defaultValue={editingAccount?.account_class || 'asset'}>
                  <option value="asset">Activo / dinero que tengo</option>
                  <option value="liability">Deuda / dinero que debo</option>
                </select>
              </label>
            </div>
            <div className="two">
              <label>
                Institución
                <input
                  name="institution"
                  defaultValue={editingAccount?.institution || ''}
                  placeholder="Ej. Banco Industrial"
                />
              </label>
              <label>
                Saldo inicial / deuda actual
                <input
                  name="opening_balance"
                  type="number"
                  min="0"
                  step=".01"
                  defaultValue={
                    editingAccount
                      ? accountCurrency[editingAccount.id]?.currency === 'USD' &&
                        accountCurrency[editingAccount.id]?.opening_balance_usd != null
                        ? Number(accountCurrency[editingAccount.id]?.opening_balance_usd)
                        : Number(editingAccount.opening_balance)
                      : 0
                  }
                />
              </label>
            </div>
            {currencyReady && (
              <label>
                Moneda
                <select
                  name="currency"
                  defaultValue={(editingAccount && accountCurrency[editingAccount.id]?.currency) || 'GTQ'}
                >
                  <option value="GTQ">Quetzales</option>
                  <option value="USD">Dólares (el saldo inicial va en dólares)</option>
                </select>
              </label>
            )}
            <div className="account-credit-fields">
              <p>Datos opcionales para tarjetas y deudas</p>
              <div className="two">
                <label>
                  Límite de crédito
                  <input
                    name="credit_limit"
                    type="number"
                    min="0"
                    step=".01"
                    defaultValue={editingAccount?.credit_limit ?? ''}
                    placeholder="12000"
                  />
                </label>
                <label>
                  Tasa anual %
                  <input
                    name="apr"
                    type="number"
                    min="0"
                    step=".01"
                    defaultValue={editingAccount?.apr ?? ''}
                    placeholder="0.00"
                  />
                </label>
              </div>
              <div className="three">
                <label>
                  Día de corte
                  <input
                    name="statement_day"
                    type="number"
                    min="1"
                    max="31"
                    defaultValue={editingAccount?.statement_day ?? ''}
                  />
                </label>
                <label>
                  Día de pago
                  <input
                    name="payment_due_day"
                    type="number"
                    min="1"
                    max="31"
                    defaultValue={editingAccount?.payment_due_day ?? ''}
                  />
                </label>
                <label>
                  Pago mínimo
                  <input
                    name="minimum_payment"
                    type="number"
                    min="0"
                    step=".01"
                    defaultValue={editingAccount?.minimum_payment ?? ''}
                  />
                </label>
              </div>
            </div>
            <label>
              Propietario
              <select
                name="owner_user_id"
                defaultValue={editingAccount ? (editingAccount.owner_user_id ?? '') : currentUser}
              >
                <option value="">Del hogar</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notas
              <input name="notes" defaultValue={editingAccount?.notes || ''} placeholder="Opcional" />
            </label>
            <label className="check-line">
              <input type="checkbox" name="is_shared" defaultChecked={editingAccount?.is_shared ?? true} /> Compartida
              con el hogar
            </label>
            <button className="finance-primary" disabled={busy}>
              <Check size={17} />
              {busy ? 'Guardando...' : editingAccount ? 'Guardar cambios' : 'Agregar cuenta'}
            </button>
          </form>
        </Modal>
      )}
      {showAssetForm && !readOnly && (
        <Modal
          title={editingAsset ? 'Editar activo' : 'Nuevo activo'}
          close={() => {
            setShowAssetForm(false);
            setEditingAsset(null);
          }}
        >
          <form className="finance-form" onSubmit={saveAsset}>
            <label>
              Nombre
              <input name="name" defaultValue={editingAsset?.name || ''} placeholder="Ej. Vehículo familiar" required />
            </label>
            <div className="two">
              <label>
                Tipo
                <select name="asset_type" defaultValue={editingAsset?.asset_type || 'vehicle'}>
                  <option value="property">Propiedad</option>
                  <option value="vehicle">Vehículo</option>
                  <option value="investment">Inversión externa</option>
                  <option value="valuable">Objeto de valor</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <label>
                Valor estimado actual
                <input
                  name="estimated_value"
                  type="number"
                  min="0"
                  step=".01"
                  defaultValue={editingAsset ? Number(editingAsset.estimated_value) : ''}
                  required
                />
              </label>
            </div>
            <div className="two">
              <label>
                Valor de compra
                <input
                  name="purchase_value"
                  type="number"
                  min="0"
                  step=".01"
                  defaultValue={editingAsset?.purchase_value ?? ''}
                  placeholder="Opcional"
                />
              </label>
              <label>
                Propietario
                <select
                  name="owner_user_id"
                  defaultValue={editingAsset ? (editingAsset.owner_user_id ?? '') : currentUser}
                >
                  <option value="">Del hogar</option>
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Notas
              <input name="notes" defaultValue={editingAsset?.notes || ''} placeholder="Ej. Modelo, año, referencia" />
            </label>
            <label className="check-line">
              <input type="checkbox" name="is_shared" defaultChecked={editingAsset?.is_shared ?? true} /> Activo
              compartido
            </label>
            <button className="finance-primary" disabled={busy}>
              <Check size={17} />
              {busy ? 'Guardando...' : editingAsset ? 'Guardar cambios' : 'Agregar activo'}
            </button>
          </form>
        </Modal>
      )}
      {showTransferForm && !readOnly && (
        <Modal title="Transferir / pagar deuda" close={() => setShowTransferForm(false)}>
          <form className="finance-form" onSubmit={addTransfer}>
            <div className="transfer-explainer">
              <ArrowRightLeft />
              <div>
                <strong>Movimiento entre cuentas</strong>
                <small>
                  No se registra como ingreso ni gasto. Si el destino es una tarjeta o préstamo, reduce la deuda.
                </small>
              </div>
            </div>
            <label>
              Desde
              <select
                name="from_account_id"
                defaultValue={accountBalances.find(a => a.account_class === 'asset')?.id || ''}
                required
              >
                <option value="">Seleccionar cuenta</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {accountTypeName(a.account_type)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Hacia
              <select
                name="to_account_id"
                defaultValue={accountBalances.find(a => a.account_class === 'liability')?.id || ''}
                required
              >
                <option value="">Seleccionar cuenta</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {accountTypeName(a.account_type)}
                  </option>
                ))}
              </select>
            </label>
            <div className="two">
              <label>
                Monto
                <input name="amount" type="number" min=".01" step=".01" placeholder="0.00" required />
              </label>
              <label>
                Fecha
                <input name="transfer_date" type="date" defaultValue={isoDate()} required />
              </label>
            </div>
            <label>
              Descripción
              <input name="description" placeholder="Ej. Pago tarjeta" />
            </label>
            <button className="finance-primary" disabled={busy}>
              <ArrowRightLeft />
              {busy ? 'Guardando...' : 'Registrar transferencia'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
