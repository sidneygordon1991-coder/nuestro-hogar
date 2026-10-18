// Finance section: budget.
import GoalBudgetLinks from '../../GoalBudgetLinks';
import {linkedSavings} from '../../lib/connectedFinance';
import BudgetCategoryProgress from '../../BudgetCategoryProgress';
import {toCents, unallocated} from '../../lib/financePeriods';
import {Check, Copy, Plus} from 'lucide-react';
import {type BudgetGroup, currency} from '../../FinanceParts';
import {monthDate} from '../shared';
import {ZeroBasedPanel} from './FinanceOptional';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceBudget() {
  const {
    connectedEnabled,
    goalLinks,
    setGoalLinks,
    tab,
    month,
    busy,
    categories,
    allocations,
    goals,
    contributions,
    setShowCategoryForm,
    budgetDraft,
    setBudgetDraft,
    budgetHalves,
    setBudgetHalves,
    periodDataError,
    categoryGroupDraft,
    setCategoryGroupDraft,
    cutoff,
    actualByCategory,
    allocationByCategory,
    smartBudget,
    saveBudget,
    copyPreviousBudget,
    household,
    readOnly
  } = useFinance();
  return (
    <>
      {tab === 'budget' && (
        <>
          <ZeroBasedPanel />
          {connectedEnabled && (
            <GoalBudgetLinks
              householdId={household.id}
              month={monthDate(month)}
              goals={goals}
              categories={categories}
              readOnly={readOnly || periodDataError}
              onChanged={setGoalLinks}
            />
          )}
          <div className="budget-group-summary">
            <div className="fixed">
              <small>Gastos fijos</small>
              <strong>{currency(smartBudget.plannedFixed)}</strong>
              <span>{currency(smartBudget.spentFixed)} usados</span>
            </div>
            <div className="variable">
              <small>Gastos variables</small>
              <strong>{currency(smartBudget.plannedVariable)}</strong>
              <span>{currency(smartBudget.spentVariable)} usados</span>
            </div>
            <div className="saving">
              <small>Ahorro</small>
              <strong>{currency(smartBudget.plannedSaving)}</strong>
              <span>{currency(smartBudget.actualSaving)} aportados</span>
            </div>
          </div>
          <div className="finance-panel">
            <div className="panel-title budget-plan-head">
              <div>
                <h3>Plan mensual</h3>
                <small>Asigna cada monto al 1–15 o al 16 al cierre. Lo que falte queda por distribuir.</small>
              </div>
              <div className="budget-head-actions">
                {!readOnly && (
                  <>
                    <button className="secondary-action" onClick={() => setShowCategoryForm(true)}>
                      <Plus size={15} /> Categoría
                    </button>
                    <button className="secondary-action" disabled={busy} onClick={copyPreviousBudget}>
                      <Copy size={15} /> Copiar mes anterior
                    </button>
                  </>
                )}
                <b>{currency(categories.reduce((sum, cat) => sum + toCents(budgetDraft[cat.id]), 0) / 100)}</b>
              </div>
            </div>
            <div className="budget-editor">
              {categories.map(cat => {
                const actual = actualByCategory.get(cat.id) || 0,
                  saved = allocationByCategory.get(cat.id) || 0,
                  group = categoryGroupDraft[cat.id] || cat.budget_group || 'variable',
                  allocation = allocations.find(a => a.category_id === cat.id),
                  pending =
                    toCents(budgetDraft[cat.id]) !== toCents(saved) ||
                    group !== cat.budget_group ||
                    (budgetHalves[cat.id]?.first ?? '') !==
                      (allocation?.first_half_amount == null ? '' : String(allocation.first_half_amount)) ||
                    (budgetHalves[cat.id]?.second ?? '') !==
                      (allocation?.second_half_amount == null ? '' : String(allocation.second_half_amount));
                return (
                  <div className={'budget-edit-row smart ' + group} key={cat.id}>
                    <BudgetCategoryProgress
                      name={cat.name}
                      icon={cat.icon}
                      planned={saved}
                      spent={actual}
                      saving={cat.budget_group === 'saving'}
                      savings={
                        connectedEnabled
                          ? goalLinks
                            ? linkedSavings(cat.id, monthDate(month), goalLinks, contributions, cutoff)
                            : null
                          : undefined
                      }
                      unavailable={periodDataError}
                      pending={pending}
                    />
                    <div className="budget-controls">
                      <label>
                        Tipo de rubro
                        <select
                          aria-label={'Tipo de rubro de ' + cat.name}
                          disabled={readOnly || busy || periodDataError}
                          value={group}
                          onChange={e =>
                            setCategoryGroupDraft({...categoryGroupDraft, [cat.id]: e.target.value as BudgetGroup})
                          }
                        >
                          <option value="fixed">Fijo</option>
                          <option value="variable">Variable</option>
                          <option value="saving">Ahorro</option>
                        </select>
                      </label>
                      <label>
                        Monto mensual (Q)
                        <input
                          aria-label={'Presupuesto mensual de ' + cat.name}
                          disabled={readOnly || busy || periodDataError}
                          type="number"
                          min="0"
                          step="0.01"
                          value={budgetDraft[cat.id] ?? '0'}
                          onChange={e => setBudgetDraft({...budgetDraft, [cat.id]: e.target.value})}
                        />
                      </label>
                    </div>
                    <div className="fortnight-inputs">
                      {(['first', 'second'] as const).map(half => (
                        <label key={half}>
                          {half === 'first' ? 'Primera quincena · 1–15' : 'Segunda quincena · 16 al cierre'}
                          <input
                            aria-label={
                              'Presupuesto ' + (half === 'first' ? 'primera' : 'segunda') + ' quincena de ' + cat.name
                            }
                            type="number"
                            inputMode="decimal"
                            min="0"
                            max="9999999999.99"
                            step="0.01"
                            placeholder="Por distribuir"
                            disabled={readOnly || busy || periodDataError}
                            value={budgetHalves[cat.id]?.[half] ?? ''}
                            onChange={e =>
                              setBudgetHalves(current => ({
                                ...current,
                                [cat.id]: {
                                  first: current[cat.id]?.first ?? '',
                                  second: current[cat.id]?.second ?? '',
                                  [half]: e.target.value
                                }
                              }))
                            }
                          />
                        </label>
                      ))}
                      <small>
                        Por distribuir:{' '}
                        {currency(
                          unallocated(budgetDraft[cat.id] || 0, {
                            first_half_amount: budgetHalves[cat.id]?.first,
                            second_half_amount: budgetHalves[cat.id]?.second
                          })
                        )}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="finance-primary" disabled={busy || readOnly || periodDataError} onClick={saveBudget}>
              <Check size={17} />
              {busy ? 'Guardando...' : 'Guardar presupuesto'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
