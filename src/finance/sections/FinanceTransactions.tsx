// Finance section: transactions.
import {toCents} from '../../lib/financePeriods';
import {FileSpreadsheet, Plus, X} from 'lucide-react';
import {EmptyFinance, TransactionRows, currency} from '../../FinanceParts';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceTransactions() {
  const {
    tab,
    categoryFilter,
    setCategoryFilter,
    transactionQuery,
    setTransactionQuery,
    transactionType,
    setTransactionType,
    categories,
    txs,
    setDetailTx,
    receiptCounts,
    setShowTxForm,
    setEditingTx,
    setShowImport,
    categoryName,
    memberName,
    deleteTransaction,
    filteredTransactions,
    readOnly
  } = useFinance();
  return (
    <>
      {tab === 'transactions' && (
        <div className="finance-panel">
          <div className="panel-title">
            <div>
              <h3>Movimientos del mes</h3>
              <small>
                {filteredTransactions.length} de {txs.length} registros ·{' '}
                {currency(
                  filteredTransactions.reduce((sum, t) => sum + (t.type === 'income' ? 1 : -1) * toCents(t.amount), 0) /
                    100
                )}{' '}
                netos
              </small>
            </div>
            {!readOnly && (
              <div className="tools-actions">
                <button className="secondary-action" onClick={() => setShowImport(true)}>
                  <FileSpreadsheet size={15} /> Importar estado de cuenta
                </button>
                <button className="mini-add" onClick={() => setShowTxForm(true)}>
                  <Plus size={16} /> Agregar
                </button>
              </div>
            )}
          </div>
          <div className="studio-transaction-filters">
            <label>
              Buscar movimiento
              <input
                value={transactionQuery}
                onChange={e => setTransactionQuery(e.target.value)}
                placeholder="Nombre, categoría o nota"
              />
            </label>
            <label>
              Tipo
              <select
                aria-label="Tipo de movimiento"
                value={transactionType}
                onChange={e => setTransactionType(e.target.value)}
              >
                <option value="all">Todos los movimientos</option>
                <option value="expense">Gastos</option>
                <option value="income">Ingresos</option>
              </select>
            </label>
            <label>
              Categoría de gasto
              <select
                aria-label="Categoría de gasto"
                value={categoryFilter || 'all'}
                onChange={e => setCategoryFilter(e.target.value === 'all' ? null : e.target.value)}
              >
                <option value="all">Todas las categorías</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="uncategorized">Sin categoría</option>
              </select>
            </label>
          </div>
          {categoryFilter && (
            <button className="studio-filter-chip" onClick={() => setCategoryFilter(null)}>
              {categoryFilter === 'uncategorized' ? 'Sin categoría' : categoryName(categoryFilter)} <X size={14} />{' '}
              Quitar filtro
            </button>
          )}
          <TransactionRows
            txs={filteredTransactions}
            categoryName={categoryName}
            memberName={memberName}
            onEdit={setEditingTx}
            onDelete={deleteTransaction}
            onDetail={setDetailTx}
            receiptCounts={receiptCounts}
            readOnly={readOnly}
            groupByDay
          />
          {!filteredTransactions.length && (
            <EmptyFinance
              art="movements"
              text={txs.length ? 'No hay movimientos con estos filtros.' : 'Todavía no hay movimientos en este mes.'}
            />
          )}
        </div>
      )}
    </>
  );
}
