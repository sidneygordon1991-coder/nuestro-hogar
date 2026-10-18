// Finance section: contributions.
import {toCents} from '../../lib/financePeriods';
import ModuleIcon from '../../ModuleIcon';
import {Check, Target} from 'lucide-react';
import SettlementsPanel from '../../SettlementsPanel';
import {categoryRuleLabel, type CategoryRuleMethod, currency} from '../../FinanceParts';
import {monthDate, monthLabel} from '../shared';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceContributions() {
  const {
    tab,
    setTab,
    month,
    busy,
    categories,
    members,
    splits,
    currentUser,
    periodDataError,
    splitMethod,
    setSplitMethod,
    memberFinance,
    setMemberFinance,
    categoryRules,
    setCategoryRules,
    categoryCustom,
    setCategoryCustom,
    setSettledVersion,
    actualTxs,
    totals,
    contributionRatios,
    contributionOverview,
    saveContributionSettings,
    saveCategoryRules,
    household,
    readOnly
  } = useFinance();
  return (
    <>
      {tab === 'contributions' && (
        <div className="contribution-layout">
          <div className="finance-panel">
            <div className="panel-title">
              <div>
                <h3>Cómo dividimos los gastos</h3>
                <small>Esta regla se usa automáticamente en cada gasto marcado como compartido.</small>
              </div>
              <ModuleIcon name="family" size={20} />
            </div>
            <div className="split-methods">
              <button className={splitMethod === 'equal' ? 'active' : ''} onClick={() => setSplitMethod('equal')}>
                <strong>Partes iguales</strong>
                <span>{members.length === 2 ? '50 / 50' : 'Mismo porcentaje para todos'}</span>
              </button>
              <button className={splitMethod === 'income' ? 'active' : ''} onClick={() => setSplitMethod('income')}>
                <strong>Según ingresos</strong>
                <span>Quien gana más aporta proporcionalmente más</span>
              </button>
              <button className={splitMethod === 'custom' ? 'active' : ''} onClick={() => setSplitMethod('custom')}>
                <strong>Personalizado</strong>
                <span>Ustedes deciden el porcentaje de cada uno</span>
              </button>
            </div>
          </div>

          <div className="finance-panel">
            <div className="panel-title">
              <div>
                <h3>Integrantes y aportes</h3>
                <small>
                  {splitMethod === 'income'
                    ? 'Usa el ingreso esperado de la quincena del gasto. Si falta distribuirlo, usa el plan mensual o esta referencia.'
                    : splitMethod === 'custom'
                      ? 'Los porcentajes deben sumar 100%.'
                      : 'La división se calcula automáticamente.'}
                </small>
              </div>
              <b>{Math.round(contributionRatios.reduce((s, r) => s + r.ratio, 0) * 100)}%</b>
            </div>
            <div className="member-contribution-editor">
              {members.map(m => {
                const ratio = contributionRatios.find(r => r.user_id === m.user_id)?.ratio || 0;
                return (
                  <div className="member-contribution-row" key={m.user_id}>
                    <div className="member-ident">
                      <span>{m.full_name.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <strong>{m.full_name}</strong>
                        <small>
                          {Math.round(ratio * 1000) / 10}% base mensual · puede variar por quincena y categoría
                        </small>
                      </div>
                    </div>
                    {splitMethod === 'income' && (
                      <label>
                        Ingreso de referencia
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={memberFinance[m.user_id]?.monthly_income || '0'}
                          onChange={e =>
                            setMemberFinance({
                              ...memberFinance,
                              [m.user_id]: {
                                ...(memberFinance[m.user_id] || {monthly_income: '0', custom_share_percent: '0'}),
                                monthly_income: e.target.value
                              }
                            })
                          }
                        />
                      </label>
                    )}
                    {splitMethod === 'custom' && (
                      <label>
                        Porcentaje
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step=".1"
                          value={memberFinance[m.user_id]?.custom_share_percent || '0'}
                          onChange={e =>
                            setMemberFinance({
                              ...memberFinance,
                              [m.user_id]: {
                                ...(memberFinance[m.user_id] || {monthly_income: '0', custom_share_percent: '0'}),
                                custom_share_percent: e.target.value
                              }
                            })
                          }
                        />
                      </label>
                    )}
                    {splitMethod === 'equal' && <div className="equal-share">{Math.round(ratio * 1000) / 10}%</div>}
                  </div>
                );
              })}
            </div>
            {!readOnly && (
              <button
                className="finance-primary"
                disabled={busy || members.length < 1}
                onClick={saveContributionSettings}
              >
                <Check size={17} />
                {busy ? 'Guardando...' : 'Guardar regla de aportes'}
              </button>
            )}
          </div>

          <button className="secondary-action" onClick={() => setTab('income')}>
            <Target size={17} /> Planificar ingresos de este mes
          </button>

          <div className="finance-panel contribution-plan">
            <div className="contribution-plan-title">
              <h3>Plan de aportes del mes</h3>
              <small>
                Suma las quincenas y lo pendiente de distribuir según cada regla. Cubre gastos; el ahorro se muestra
                aparte en Quincenas. Guardar reglas recalcula los gastos compartidos de este mes.
              </small>
              <strong>{currency(contributionOverview.reduce((sum, m) => sum + toCents(m.planned), 0) / 100)}</strong>
            </div>
            <div className="contribution-table-head">
              <span>Persona</span>
              <span>% base</span>
              <span>Plan</span>
              <span>Pagó</span>
              <span>Balance</span>
            </div>
            {contributionOverview.map(m => (
              <div className="contribution-table-row" key={m.user_id}>
                <span>{m.full_name}</span>
                <b>{Math.round(m.ratio * 1000) / 10}%</b>
                <b>{currency(m.planned)}</b>
                <b>{currency(m.paid)}</b>
                <b className={m.balance >= 0 ? 'positive' : 'negative'}>
                  {m.balance >= 0 ? '+' : ''}
                  {currency(m.balance)}
                </b>
              </div>
            ))}
            {!totals.planned && (
              <div className="finance-note">
                Configura el presupuesto del mes para ver cuánto debería aportar cada persona al plan.
              </div>
            )}
          </div>

          {members.length > 1 && !periodDataError && (
            <SettlementsPanel
              key={household.id + ':' + monthDate(month)}
              householdId={household.id}
              month={monthDate(month)}
              label={monthLabel(month)}
              members={members}
              transactions={actualTxs}
              splits={splits}
              currentUser={currentUser}
              readOnly={readOnly}
              onChanged={() => setSettledVersion(v => v + 1)}
            />
          )}

          <div className="finance-panel category-rule-panel">
            <div className="panel-title">
              <div>
                <h3>Reglas por categoría</h3>
                <small>Una categoría puede usar la regla general o tener su propia distribución.</small>
              </div>
            </div>
            <div className="category-rule-list">
              {categories.map(cat => {
                const rule = categoryRules[cat.id] || {
                  split_method: 'inherit' as CategoryRuleMethod,
                  responsible_user_id: ''
                };
                return (
                  <div className="category-rule-card" key={cat.id}>
                    <div className="category-rule-main">
                      <div>
                        <strong>{cat.name}</strong>
                        <small>{categoryRuleLabel(rule.split_method, splitMethod)}</small>
                      </div>
                      <select
                        value={rule.split_method}
                        onChange={e =>
                          setCategoryRules({
                            ...categoryRules,
                            [cat.id]: {...rule, split_method: e.target.value as CategoryRuleMethod}
                          })
                        }
                      >
                        <option value="inherit">Usar regla general</option>
                        <option value="equal">Partes iguales</option>
                        <option value="income">Según ingresos</option>
                        <option value="custom">Personalizado</option>
                        <option value="personal">Una persona cubre 100%</option>
                      </select>
                    </div>
                    {rule.split_method === 'personal' && (
                      <div className="category-rule-detail">
                        <label>
                          Responsable
                          <select
                            value={rule.responsible_user_id}
                            onChange={e =>
                              setCategoryRules({
                                ...categoryRules,
                                [cat.id]: {...rule, responsible_user_id: e.target.value}
                              })
                            }
                          >
                            <option value="">Seleccionar</option>
                            {members.map(m => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.full_name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                    {rule.split_method === 'custom' && (
                      <div className="category-custom-grid">
                        {members.map(m => (
                          <label key={m.user_id}>
                            {m.full_name}
                            <div>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step=".1"
                                value={categoryCustom[cat.id]?.[m.user_id] || '0'}
                                onChange={e =>
                                  setCategoryCustom({
                                    ...categoryCustom,
                                    [cat.id]: {...(categoryCustom[cat.id] || {}), [m.user_id]: e.target.value}
                                  })
                                }
                              />
                              <span>%</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {!readOnly && (
              <button className="finance-primary" disabled={busy || members.length < 1} onClick={saveCategoryRules}>
                <Check size={17} />
                {busy ? 'Guardando...' : 'Guardar reglas por categoría'}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
