// Finance section: income.
import MonthlyIncomePlan from '../../MonthlyIncomePlan';
import HouseholdCutoffSettings from '../../HouseholdCutoffSettings';
import {monthDate, monthLabel} from '../shared';
import {useFinance} from '../useFinanceWorkspace';
import {useMemo} from 'react';
import {remittanceInsight, remittanceSummary} from '../../lib/remittances';
import {formatMoney} from '../../lib/money';
import {formatUsd} from '../../lib/currency';
import {Amount} from '../../ui';
import {localISODate} from '../../lib/localDate';

export default function FinanceIncome() {
  const {
    tab,
    setTab,
    setCategoryFilter,
    setTransactionQuery,
    setTransactionType,
    month,
    periodDataError,
    setIncomePlans,
    incomePlanError,
    payDays,
    setPayDays,
    usdRateSetting,
    setUsdRateSetting,
    incomeScope,
    load,
    incomeSummary,
    household,
    readOnly,
    historyTxs,
    categories
  } = useFinance();
  const remittances = useMemo(
    () => remittanceSummary(historyTxs, categories, monthDate(month).slice(0, 7)),
    [historyTxs, categories, month]
  );
  const insight = remittanceInsight(
    remittances,
    formatMoney,
    monthDate(month).slice(0, 7) === localISODate().slice(0, 7)
  );
  return (
    <>
      {tab === 'income' && insight && (
        <section className="finance-panel remittance-panel" aria-labelledby="remittance-title">
          <div className="remittance-copy">
            <h3 id="remittance-title">Remesas</h3>
            <strong>
              <Amount value={remittances.month} />
              {remittances.monthUsd > 0 && <small> {formatUsd(remittances.monthUsd)}</small>}
            </strong>
            <p>{insight}</p>
          </div>
          <div className="remittance-trend" role="img" aria-label="Remesas de los últimos seis meses">
            {remittances.trend.map(t => {
              const max = Math.max(...remittances.trend.map(x => x.amount), 1);
              return (
                <span key={t.month} className={t.month === monthDate(month).slice(0, 7) ? 'current' : ''}>
                  <i style={{height: Math.max(t.amount > 0 ? 8 : 2, (t.amount / max) * 100) + '%'}} />
                  <small>
                    {new Date(t.month + '-15T12:00:00').toLocaleDateString('es-GT', {month: 'short'}).replace('.', '')}
                  </small>
                </span>
              );
            })}
          </div>
        </section>
      )}
      {tab === 'income' && (
        <HouseholdCutoffSettings householdId={household.id} month={monthDate(month)} readOnly={readOnly} />
      )}
      {tab === 'income' && (
        <MonthlyIncomePlan
          key={household.id + ':' + monthDate(month)}
          householdId={household.id}
          month={monthDate(month)}
          label={monthLabel(month)}
          summary={incomeSummary}
          readOnly={readOnly}
          loadError={incomePlanError || periodDataError}
          onReload={() => load()}
          onSaved={plans => {
            if (incomeScope.current === household.id + ':' + monthDate(month)) setIncomePlans(plans);
          }}
          onMovements={() => {
            setCategoryFilter(null);
            setTransactionQuery('');
            setTransactionType('income');
            setTab('transactions');
          }}
          payDays={payDays}
          usdRate={usdRateSetting}
          onSettingsSaved={(days, rate) => {
            setPayDays(current => ({...current, ...days}));
            setUsdRateSetting(rate);
          }}
        />
      )}
    </>
  );
}
