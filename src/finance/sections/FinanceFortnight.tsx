// Finance section: fortnight.
import FortnightBudget from '../../FortnightBudget';
import {monthDate, monthLabel} from '../shared';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceFortnight() {
  const {
    tab,
    setTab,
    setCategoryFilter,
    setTransactionQuery,
    setTransactionType,
    month,
    categories,
    allocations,
    splits,
    periodDataError,
    incomePlanError,
    payDays,
    actualTxs,
    actualContributions,
    shareContext,
    household,
    readOnly
  } = useFinance();
  return (
    <>
      {tab === 'fortnight' && (
        <FortnightBudget
          key={household.id + ':' + monthDate(month)}
          householdId={household.id}
          householdName={household.name}
          readOnly={readOnly}
          onPayments={() => setTab('recurring')}
          onMovements={() => {
            setTransactionQuery('');
            setCategoryFilter(null);
            setTransactionType('all');
            setTab('transactions');
          }}
          month={monthDate(month)}
          label={monthLabel(month)}
          context={shareContext}
          allocations={allocations}
          categories={categories}
          movements={actualTxs}
          savings={actualContributions}
          splits={splits}
          loadError={incomePlanError || periodDataError}
          onIncome={() => setTab('income')}
          onBudget={() => setTab('budget')}
          onRules={() => setTab('contributions')}
          payDays={payDays}
        />
      )}
    </>
  );
}
