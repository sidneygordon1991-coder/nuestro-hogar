// Finance section: comparison.
import {BarChart3} from 'lucide-react';
import {
  ComparisonKpi,
  MonthlyBars,
  BalanceChart,
  SavingsRateChart,
  CategoryComparison,
  currency
} from '../../FinanceParts';
import {monthLabel} from '../shared';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceComparison() {
  const {
    tab,
    month,
    comparisonRange,
    setComparisonRange,
    monthlyMetrics,
    currentMetric,
    previousMetric,
    metricDelta,
    categoryComparison
  } = useFinance();
  return (
    <>
      {tab === 'comparison' && (
        <>
          <div className="comparison-head">
            <div>
              <p className="eyebrow">Evolución financiera</p>
              <h3>Comparación entre meses</h3>
              <p>Analiza ingresos, gastos, ahorro, balance y presupuesto para detectar tendencias.</p>
            </div>
            <div className="range-switch">
              {([3, 6, 12] as const).map(value => (
                <button
                  className={comparisonRange === value ? 'active' : ''}
                  key={value}
                  onClick={() => setComparisonRange(value)}
                >
                  {value} meses
                </button>
              ))}
            </div>
          </div>

          <div className="comparison-kpis">
            <ComparisonKpi
              label="Ingresos"
              value={currentMetric.income}
              delta={metricDelta(currentMetric.income, previousMetric.income)}
              goodWhenUp
            />
            <ComparisonKpi
              label="Gastos"
              value={currentMetric.expense}
              delta={metricDelta(currentMetric.expense, previousMetric.expense)}
              goodWhenUp={false}
            />
            <ComparisonKpi
              label="Ahorro"
              value={currentMetric.saving}
              delta={metricDelta(currentMetric.saving, previousMetric.saving)}
              goodWhenUp
            />
            <ComparisonKpi
              label="Balance"
              value={currentMetric.balance}
              delta={metricDelta(currentMetric.balance, previousMetric.balance)}
              goodWhenUp
            />
          </div>

          <div className="finance-panel">
            <div className="panel-title">
              <div>
                <h3>Ingresos vs gastos vs ahorro</h3>
                <small>
                  Últimos {comparisonRange} meses, hasta {monthLabel(month).toLowerCase()}.
                </small>
              </div>
              <BarChart3 size={19} />
            </div>
            <MonthlyBars data={monthlyMetrics} />
          </div>

          <div className="finance-columns comparison-columns">
            <div className="finance-panel">
              <div className="panel-title">
                <div>
                  <h3>Balance mensual</h3>
                  <small>Lo que queda después de gastos y ahorro.</small>
                </div>
              </div>
              <BalanceChart data={monthlyMetrics} />
            </div>
            <div className="finance-panel">
              <div className="panel-title">
                <div>
                  <h3>Tasa de ahorro</h3>
                  <small>Porcentaje del ingreso destinado a metas.</small>
                </div>
                <strong>{Math.round(currentMetric.savingRate)}%</strong>
              </div>
              <SavingsRateChart data={monthlyMetrics} />
            </div>
          </div>

          <div className="finance-panel">
            <div className="panel-title">
              <div>
                <h3>Categorías: este mes vs anterior</h3>
                <small>Top categorías con movimiento en cualquiera de los dos meses.</small>
              </div>
            </div>
            <CategoryComparison rows={categoryComparison} />
          </div>

          <div className="finance-panel comparison-table-panel">
            <div className="panel-title">
              <div>
                <h3>Detalle mensual</h3>
                <small>Resumen completo del periodo seleccionado.</small>
              </div>
            </div>
            <div className="comparison-table">
              <div className="comparison-table-head">
                <span>Mes</span>
                <span>Ingresos</span>
                <span>Gastos</span>
                <span>Ahorro</span>
                <span>Balance</span>
                <span>Presupuesto</span>
              </div>
              {monthlyMetrics.map(row => (
                <div className="comparison-table-row" key={row.key}>
                  <strong>{row.label}</strong>
                  <span>{currency(row.income)}</span>
                  <span>{currency(row.expense)}</span>
                  <span>{currency(row.saving)}</span>
                  <span className={row.balance >= 0 ? 'positive' : 'negative'}>{currency(row.balance)}</span>
                  <span>{currency(row.budget)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
