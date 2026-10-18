// Finance section: summary.
import FinanceSimulator from '../../FinanceSimulator';
import BalanceFlow from '../../BalanceFlow';
import {InteractiveTrend, SpendingDonut} from '../../FinancialVisuals';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  PiggyBank,
  Target,
  TrendingUp
} from 'lucide-react';
import {
  Kpi,
  Progress,
  EmptyFinance,
  TransactionRows,
  statusLabel,
  splitMethodLabel,
  currency,
  pct
} from '../../FinanceParts';
import {entryMoney, monthDate, monthLabel} from '../shared';
import {SummaryOptional} from './FinanceOptional';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceSummary() {
  const {
    tab,
    setTab,
    categoryFilter,
    setCategoryFilter,
    setTransactionQuery,
    setTransactionType,
    month,
    summaryError,
    busy,
    txs,
    occurrences,
    members,
    setDetailTx,
    receiptCounts,
    setEditingTx,
    splitMethod,
    settled,
    setSettledVersion,
    settledError,
    settledNet,
    load,
    totals,
    categoryName,
    memberName,
    recurringById,
    occurrenceStatus,
    recurringStats,
    smartBudget,
    monthlyMetrics,
    previousMetric,
    contributionOverview,
    payRecurringOccurrence,
    deleteTransaction,
    openChartMonth,
    spendingRows,
    featuredGoal,
    featuredSaved,
    readOnly
  } = useFinance();
  return (
    <>
      {tab === 'summary' &&
        (summaryError ? (
          <div className="workspace-status error" role="alert">
            <AlertTriangle />
            <p>No se pudo verificar el balance y la proyección. Reintenta antes de usar estos importes.</p>
            <button onClick={() => load()}>Reintentar</button>
          </div>
        ) : (
          <>
            <section className="studio-finance-hero">
              <div>
                <p className="eyebrow">Tu dinero, con claridad</p>
                <small>Balance registrado del mes</small>
                <h3 className={totals.available < 0 ? 'negative' : ''}>{currency(totals.available)}</h3>
                <p>Ingresos − gastos − ahorro registrado</p>
                <span className="studio-previous">
                  Mes anterior <b>{currency(previousMetric.balance)}</b>
                </span>
              </div>
              <BalanceFlow
                income={totals.income}
                expense={totals.expense}
                saving={totals.saving}
                onOpen={() => {
                  setCategoryFilter(null);
                  setTransactionType('all');
                  setTransactionQuery('');
                  setTab('transactions');
                }}
              />
              <div className="studio-finance-hero-foot">
                <span>Balance de {monthLabel(month)}</span>
                <button onClick={() => setTab('accounts')}>
                  Mis cuentas <ArrowUpRight size={16} />
                </button>
              </div>
            </section>
            <div className="finance-kpis studio-finance-kpis">
              <Kpi label="Ingresos" value={currency(totals.income)} icon={<ArrowDownLeft />} tone="good" />
              <Kpi label="Gastado" value={currency(totals.expense)} icon={<ArrowUpRight />} tone="warn" />
              <Kpi label="Ahorrado" value={currency(totals.saving)} icon={<PiggyBank />} tone="save" />
            </div>
            <SummaryOptional />
            <button className="fortnight-shortcut" onClick={() => setTab('fortnight')}>
              <span>
                <CalendarClock size={20} />
              </span>
              <div>
                <strong>Tu mes, quincena a quincena</strong>
                <small>Del 1 al 15 · del 16 al cierre · visión mensual</small>
              </div>
              <ArrowRight size={18} />
            </button>
            <div className="studio-finance-charts">
              <section className="finance-panel">
                <div className="panel-title">
                  <div>
                    <p className="eyebrow">En qué se va</p>
                    <h3>Tu mapa de gastos</h3>
                    <small>Toca una categoría para ver sus movimientos.</small>
                  </div>
                </div>
                <SpendingDonut
                  rows={spendingRows}
                  selected={categoryFilter}
                  onSelect={id => {
                    setCategoryFilter(id);
                    setTransactionType('all');
                    setTransactionQuery('');
                    setTab('transactions');
                  }}
                />
              </section>
              <section className="finance-panel">
                <div className="panel-title">
                  <div>
                    <p className="eyebrow">Paso a paso</p>
                    <h3>Así evoluciona tu hogar</h3>
                    <small>Selecciona un mes para explorar sus cifras.</small>
                  </div>
                </div>
                <InteractiveTrend data={monthlyMetrics.slice(-6)} onMonthSelect={openChartMonth} />
              </section>
            </div>
            <details className={'finance-panel studio-projection ' + smartBudget.health}>
              <summary>
                <span className="studio-projection-icon">
                  {smartBudget.health === 'good' ? <TrendingUp /> : <AlertTriangle />}
                </span>
                <span>
                  <small>Después de tu plan</small>
                  <strong>
                    Cierre estimado{' '}
                    <b className={smartBudget.projectedClose >= 0 ? 'positive' : 'negative'}>
                      {currency(smartBudget.projectedClose)}
                    </b>
                  </strong>
                </span>
                <ChevronRight size={18} />
              </summary>
              <p className="muted">Incluye ingresos esperados, compromisos, ahorro y presupuesto pendiente.</p>
              <div className="projection-grid">
                <div>
                  <small>Disponible hoy</small>
                  <strong>{currency(totals.available)}</strong>
                </div>
                <div>
                  <small>Compromisos por cubrir</small>
                  <strong>{currency(smartBudget.fixedCommitments)}</strong>
                </div>
                <div>
                  <small>Ahorro pendiente</small>
                  <strong>{currency(smartBudget.savingsRemaining)}</strong>
                </div>
                <div>
                  <small>Libre tras compromisos</small>
                  <strong>{currency(smartBudget.availableAfterCommitments)}</strong>
                </div>
              </div>
              <div className="projection-footer">
                <span>
                  Ingreso esperado <b>+{currency(smartBudget.expectedIncomeRemaining)}</b>
                </span>
                <span>
                  Variables por usar <b>−{currency(smartBudget.variableRemaining)}</b>
                </span>
              </div>
              <button className="studio-chart-open" onClick={() => setTab('income')}>
                Ajustar ingresos esperados <ArrowUpRight size={15} />
              </button>
              <button className="studio-chart-open" onClick={() => setTab('budget')}>
                Ajustar mi presupuesto <ArrowUpRight size={15} />
              </button>
            </details>
            <FinanceSimulator
              key={monthDate(month)}
              base={smartBudget.projectedClose}
              verified={!summaryError}
              label={monthLabel(month)}
            />
            <div className="finance-panel studio-budget-used">
              <div className="panel-heading">
                <div>
                  <span>Presupuesto utilizado</span>
                  <strong>
                    {totals.plannedExpense
                      ? Math.round((totals.expense / totals.plannedExpense) * 100) + '%'
                      : 'Sin definir'}
                  </strong>
                </div>
                <small>
                  {totals.plannedExpense
                    ? currency(totals.expense) + ' de ' + currency(totals.plannedExpense)
                    : 'Dale un destino a tu dinero'}
                </small>
              </div>
              <Progress value={pct(totals.expense, totals.plannedExpense)} />
              <button className="studio-chart-open" onClick={() => setTab('budget')}>
                Ver mi presupuesto <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="finance-columns">
              <div className="finance-panel studio-goal-panel">
                <div className="panel-title">
                  <div>
                    <p className="eyebrow">Lo que viene</p>
                    <h3>Un paso más cerca</h3>
                  </div>
                  <button onClick={() => setTab('goals')}>
                    Mis metas <ChevronRight size={16} />
                  </button>
                </div>
                {featuredGoal ? (
                  <button className="studio-featured-goal" onClick={() => setTab('goals')}>
                    <span
                      className="studio-ring"
                      style={
                        {
                          '--ring-progress': pct(featuredSaved, Number(featuredGoal.target_amount)) + '%'
                        } as React.CSSProperties
                      }
                    >
                      <Target size={27} />
                    </span>
                    <div>
                      <strong>{featuredGoal.name}</strong>
                      <b>
                        {currency(featuredSaved)} <small>de {currency(Number(featuredGoal.target_amount))}</small>
                      </b>
                      <span>{pct(featuredSaved, Number(featuredGoal.target_amount))}% completado</span>
                    </div>
                  </button>
                ) : (
                  <div className="studio-chart-empty">
                    <Target size={31} />
                    <strong>Las grandes metas empiezan aquí</strong>
                    <span>Una casa, un viaje o tranquilidad para el futuro.</span>
                    <button className="studio-chart-open" onClick={() => setTab('goals')}>
                      Explorar metas <ArrowUpRight size={15} />
                    </button>
                  </div>
                )}
              </div>
              <div className="finance-panel">
                <div className="panel-title">
                  <div>
                    <p className="eyebrow">En el radar</p>
                    <h3>Próximos pagos</h3>
                    <small>
                      {recurringStats.overdue ? recurringStats.overdue + ' vencido(s)' : 'Tus compromisos del mes'}
                    </small>
                  </div>
                  <button onClick={() => setTab('recurring')}>
                    Ver todos <ChevronRight size={16} />
                  </button>
                </div>
                {occurrences.filter(
                  o => recurringById(o.recurring_transaction_id)?.type === 'expense' && o.status === 'pending'
                ).length ? (
                  occurrences
                    .filter(
                      o => recurringById(o.recurring_transaction_id)?.type === 'expense' && o.status === 'pending'
                    )
                    .slice(0, 4)
                    .map(o => {
                      const r = recurringById(o.recurring_transaction_id)!;
                      const status = occurrenceStatus(o);
                      return (
                        <div className="due-row recurring-summary-row" key={o.id}>
                          <span className="due-day">{new Date(o.due_date + 'T12:00').getDate()}</span>
                          <div>
                            <strong>{r.description}</strong>
                            <small className={'status-text ' + status}>{statusLabel(status)}</small>
                          </div>
                          <div className="due-actions">
                            <b>{entryMoney(Number(r.amount))}</b>
                            {!readOnly && (
                              <button disabled={busy} onClick={() => payRecurringOccurrence(o)}>
                                Pagar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="studio-chart-empty">
                    <CalendarClock size={27} />
                    <strong>Tu calendario de pagos está despejado</strong>
                    <span>No hay gastos recurrentes pendientes este mes.</span>
                  </div>
                )}
              </div>
            </div>
            {members.length > 1 && (
              <div className="finance-panel">
                <div className="panel-title">
                  <div>
                    <h3>Balance entre nosotros</h3>
                    <small>{splitMethodLabel(splitMethod)} · gastos compartidos.</small>
                  </div>
                  <button onClick={() => setTab('contributions')}>
                    Ver aportes <ChevronRight size={16} />
                  </button>
                </div>
                <div className="couple-grid">
                  {contributionOverview
                    .map(row => ({...row, balance: Math.round((row.balance + settledNet(row.user_id)) * 100) / 100}))
                    .map(b => (
                      <div className="couple-card" key={b.user_id}>
                        <span>{b.full_name}</span>
                        <strong className={b.balance >= 0 ? 'positive' : 'negative'}>
                          {b.balance >= 0 ? '+' : ''}
                          {currency(b.balance)}
                        </strong>
                        <small>{b.balance > 0 ? 'A favor' : b.balance < 0 ? 'Por compensar' : 'En equilibrio'}</small>
                      </div>
                    ))}
                </div>
                {settledError ? (
                  <small className="status-text overdue" role="alert">
                    No pudimos verificar los pagos entre ustedes; el balance puede no incluirlos.{' '}
                    <button type="button" className="link" onClick={() => setSettledVersion(v => v + 1)}>
                      Reintentar
                    </button>
                  </small>
                ) : (
                  settled.length > 0 && (
                    <small className="muted">
                      Incluye {settled.length === 1 ? '1 pago registrado' : settled.length + ' pagos registrados'} entre
                      ustedes este mes.
                    </small>
                  )
                )}
              </div>
            )}
            <div className="finance-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">Tu actividad</p>
                  <h3>Movimientos recientes</h3>
                </div>
                <button
                  onClick={() => {
                    setCategoryFilter(null);
                    setTab('transactions');
                  }}
                >
                  Ver todos <ChevronRight size={16} />
                </button>
              </div>
              <TransactionRows
                txs={txs.slice(0, 5)}
                categoryName={categoryName}
                memberName={memberName}
                onEdit={setEditingTx}
                onDelete={deleteTransaction}
                onDetail={setDetailTx}
                receiptCounts={receiptCounts}
                readOnly={readOnly}
              />
              {!txs.length && (
                <EmptyFinance art="movements" text="Registra tu primer movimiento para empezar a ver tu actividad." />
              )}
            </div>
          </>
        ))}
    </>
  );
}
