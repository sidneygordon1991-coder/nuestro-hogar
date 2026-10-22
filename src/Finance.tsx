// Finance module shell: header, month switch and navigation; each section lives in ./finance/sections.
import './styles/modules/finance-management.css';
import './styles/modules/finance-tools.css';
import WorkspaceHeading from './WorkspaceHeading';
import WorkspaceTitle from './WorkspaceTitle';
import FinanceNavigation from './FinanceNavigation';
import ModuleLoading from './ModuleLoading';
import {ArrowLeft, ArrowRight, Plus, X} from 'lucide-react';
import {monthLabel} from './finance/shared';
import {FinanceContext, useFinanceWorkspace} from './finance/useFinanceWorkspace';
import FinanceFortnight from './finance/sections/FinanceFortnight';
import FinanceIncome from './finance/sections/FinanceIncome';
import FinanceSummary from './finance/sections/FinanceSummary';
import FinanceBudget from './finance/sections/FinanceBudget';
import FinanceTransactions from './finance/sections/FinanceTransactions';
import FinanceGoals from './finance/sections/FinanceGoals';
import FinanceRecurring from './finance/sections/FinanceRecurring';
import FinanceComparison from './finance/sections/FinanceComparison';
import FinanceContributions from './finance/sections/FinanceContributions';
import FinanceAccountsError from './finance/sections/FinanceAccountsError';
import FinanceNetworth from './finance/sections/FinanceNetworth';
import FinanceAccounts from './finance/sections/FinanceAccounts';
import FinanceDialogs from './finance/sections/FinanceDialogs';
import type {Household} from './FinanceParts';

export default function Finance({
  household,
  readOnly = false,
  essential = true
}: {
  household: Household;
  readOnly?: boolean;
  essential?: boolean;
}) {
  const workspace = useFinanceWorkspace({household, readOnly});
  const {tab, setTab, month, message, setMessage, setShowTxForm, cutoff, smartBudget, moveMonth, loading} = workspace;
  if (loading) return <ModuleLoading />;
  return (
    <FinanceContext.Provider value={workspace}>
      <section className={'finance-v2 ' + (readOnly ? 'read-only' : '')}>
        <WorkspaceHeading className="finance-top">
          <WorkspaceTitle
            module="finance"
            eyebrow="Finanzas del hogar"
            title="Finanzas"
            description="Tu dinero, a tu manera: individual, en pareja o en familia."
          />
          {!readOnly && (
            <button className="finance-new" onClick={() => setShowTxForm(true)}>
              <Plus size={18} /> Movimiento
            </button>
          )}
        </WorkspaceHeading>
        <div className="month-switch">
          <button aria-label="Mes anterior" onClick={() => moveMonth(-1)}>
            <ArrowLeft size={18} />
          </button>
          <strong>{monthLabel(month)}</strong>
          <button aria-label="Mes siguiente" onClick={() => moveMonth(1)}>
            <ArrowRight size={18} />
          </button>
        </div>
        <FinanceNavigation active={tab} onSelect={setTab} essential={essential} />
        <p className="finance-cutoff-note">
          Cifras registradas hasta el{' '}
          {new Date(cutoff + 'T12:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'long'})}. El presupuesto y
          los ingresos esperados son planes.
          {smartBudget.futureCount > 0 && (
            <>
              {' '}
              Hay {smartBudget.futureCount} registro(s) con fecha futura, excluidos de los importes reales.{' '}
              <button type="button" onClick={() => setTab('transactions')}>
                Revisar movimientos
              </button>
            </>
          )}
        </p>
        {message && (
          <div className="finance-message" role="status">
            {message}
            <button type="button" aria-label="Cerrar mensaje" onClick={() => setMessage('')}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}
        <FinanceFortnight />
        <FinanceIncome />
        <FinanceSummary />
        <FinanceBudget />
        <FinanceTransactions />
        <FinanceGoals />
        <FinanceRecurring />
        <FinanceComparison />
        <FinanceContributions />
        <FinanceAccountsError />
        <FinanceNetworth />
        <FinanceAccounts />
        <FinanceDialogs />
      </section>
    </FinanceContext.Provider>
  );
}
