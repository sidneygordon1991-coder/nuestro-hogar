// Finance section: comparison.
import {BarChart3, AlertTriangle} from 'lucide-react';
import {
  ComparisonKpi,
  MonthlyBars,
  BalanceChart,
  SavingsRateChart,
  CategoryComparison,
  currency
} from '../../FinanceParts';
import {monthDate, monthLabel} from '../shared';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceComparison() {
  const {
    tab,
    comparisonError,
    cutoff,
    load,
    month,
    comparisonRange,
    setComparisonRange,
    monthlyMetrics,
    currentMetric,
    previousMetric,
    metricDelta,
    comparisonWindow,
    categoryComparison
  } = useFinance();
  const futurePeriod = monthDate(month) > cutoff;
  return (
    <>
      {tab === 'comparison' && comparisonError && (
        <div className="workspace-status error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <p>No pudimos verificar el historial para comparar. Reintenta antes de usar estas cifras.</p>
          <button type="button" onClick={() => load()}>
            Reintentar
          </button>
        </div>
      )}
      {tab === 'comparison' && !comparisonError && (
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

          <p className="comparison-period-note">
            {futurePeriod
              ? 'Este mes aún no comienza. No hay variaciones reales que comparar; consulta el historial registrado en las gráficas y la tabla'
              : comparisonWindow.partial
                ? `Comparación de los primeros ${Number(comparisonWindow.current.end.slice(8))} días con el mismo tramo del mes anterior`
                : 'Comparación con el mes anterior completo'}
            . Si el mes tiene menos días, se usa su último día real. Las gráficas y la tabla conservan el total de cada
            mes; el mes en curso es parcial.
          </p>
          {!futurePeriod && (
            <>
              <div className="comparison-kpis">
                <ComparisonKpi
                  label="Ingresos"
                  value={currentMetric.income}
                  previous={previousMetric.income}
                  delta={metricDelta(currentMetric.income, previousMetric.income)}
                  goodWhenUp
                />
                <ComparisonKpi
                  label="Gastos"
                  value={currentMetric.expense}
                  previous={previousMetric.expense}
                  delta={metricDelta(currentMetric.expense, previousMetric.expense)}
                  goodWhenUp={false}
                />
                <ComparisonKpi
                  label="Ahorro"
                  value={currentMetric.saving}
                  previous={previousMetric.saving}
                  delta={metricDelta(currentMetric.saving, previousMetric.saving)}
                  goodWhenUp
                />
                <ComparisonKpi
                  label="Balance"
                  value={currentMetric.balance}
                  previous={previousMetric.balance}
                  delta={metricDelta(currentMetric.balance, previousMetric.balance)}
                  goodWhenUp
                />
              </div>
            </>
          )}

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

          {!futurePeriod && (
            <>
              <div className="finance-panel">
                <div className="panel-title">
                  <div>
                    <h3>Categorías: este mes vs anterior</h3>
                    <small>Top categorías con movimiento en cualquiera de los dos meses.</small>
                  </div>
                </div>
                <CategoryComparison rows={categoryComparison} />
              </div>
            </>
          )}

          <div className="finance-panel comparison-table-panel">
            <div className="panel-title">
              <div>
                <h3>Detalle mensual</h3>
                <small>Resumen completo del periodo seleccionado.</small>
              </div>
            </div>
            <div className="comparison-table" role="region" aria-label="Detalle mensual comparado" tabIndex={0}>
              <div role="table" aria-label="Totales por mes">
                <div className="comparison-table-head" role="row">
                  <span role="columnheader">Mes</span>
                  <span role="columnheader">Ingresos</span>
                  <span role="columnheader">Gastos</span>
                  <span role="columnheader">Ahorro</span>
                  <span role="columnheader">Balance</span>
                  <span role="columnheader">Presupuesto</span>
                </div>
                {monthlyMetrics.map(row => (
                  <div className="comparison-table-row" role="row" key={row.key}>
                    <strong role="rowheader">{row.label}</strong>
                    <span role="cell">{currency(row.income)}</span>
                    <span role="cell">{currency(row.expense)}</span>
                    <span role="cell">{currency(row.saving)}</span>
                    <span role="cell" className={row.balance >= 0 ? 'positive' : 'negative'}>
                      {currency(row.balance)}
                    </span>
                    <span role="cell">{currency(row.budget)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
