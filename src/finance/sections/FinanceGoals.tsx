import {useEffect, useState} from 'react';
import GoalManagementDialog, {type GoalAction} from '../GoalManagementDialog';
import type {Goal} from '../../FinanceParts';
// Finance section: goals.
import {toCents} from '../../lib/financePeriods';
import {Pencil, PiggyBank, Plus, Trash2} from 'lucide-react';
import {EmptyFinance, GoalCard} from '../../FinanceParts';
import {entryMoney, monthLabel} from '../shared';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceGoals() {
  const {
    tab,
    household,
    load,
    setMessage,
    goalsDataError,
    setEditingContribution,
    setRemoving,
    setManagementError,
    contributionGoal,
    setContributionGoal,
    contributionPeriod,
    setContributionPeriod,
    contributionLimit,
    setContributionLimit,
    month,
    ledgerEnabled,
    setSavingsEntry,
    busy,
    goals,
    setShowGoalForm,
    actualContributions,
    contribute,
    contributionRows,
    goalName,
    readOnly
  } = useFinance();
  const [goalView, setGoalView] = useState<'active' | 'archived'>('active');
  const [management, setManagement] = useState<{goal: Goal; action: GoalAction} | null>(null);
  useEffect(() => {
    setManagement(null);
    setGoalView('active');
  }, [household.id]);
  if (tab === 'goals' && goalsDataError)
    return (
      <section className="finance-panel" role="alert">
        <p>No pudimos cargar las metas y su historial completos. Actualiza antes de modificarlas.</p>
        <button type="button" className="secondary-action" onClick={() => load()}>
          Reintentar
        </button>
      </section>
    );
  return (
    <>
      {tab === 'goals' && (
        <>
          <div className="finance-panel">
            <div className="panel-title">
              <div>
                <h3>Metas de ahorro</h3>
                <small>Casa, viajes, fondo de emergencia o cualquier proyecto.</small>
              </div>
              {!readOnly && (
                <button className="mini-add" onClick={() => setShowGoalForm(true)}>
                  <Plus size={16} /> Nueva
                </button>
              )}
            </div>
            <div className="goal-view-switch" role="group" aria-label="Estado de las metas">
              <button type="button" aria-pressed={goalView === 'active'} onClick={() => setGoalView('active')}>
                Activas ({goals.filter(g => g.active).length})
              </button>
              <button type="button" aria-pressed={goalView === 'archived'} onClick={() => setGoalView('archived')}>
                Archivadas ({goals.filter(g => !g.active).length})
              </button>
            </div>
            <p className="goal-management-note">
              Edita nombre, monto y fecha. Archiva para conservar el historial; elimina solo metas sin aportes ni
              vínculos.
            </p>
            <div className="goal-grid">
              {goals
                .filter(g => g.active === (goalView === 'active'))
                .map(g => {
                  const saved =
                    actualContributions.filter(c => c.goal_id === g.id).reduce((s, c) => s + toCents(c.amount), 0) /
                    100;
                  return (
                    <GoalCard
                      key={g.id}
                      goal={g}
                      saved={saved}
                      busy={busy}
                      readOnly={readOnly}
                      onContribute={contribute}
                      onEdit={() => setManagement({goal: g, action: 'edit'})}
                      onArchive={() => setManagement({goal: g, action: g.active ? 'archive' : 'restore'})}
                      onDelete={() => setManagement({goal: g, action: 'delete'})}
                      onWithdraw={
                        g.active && ledgerEnabled && saved > 0
                          ? () => setSavingsEntry({goal: g, direction: 'withdrawal'})
                          : undefined
                      }
                    />
                  );
                })}
            </div>
            {!goals.some(g => g.active === (goalView === 'active')) && (
              <EmptyFinance
                art="goal"
                text={
                  goalView === 'active'
                    ? 'Crea una meta o reactiva una archivada para continuar.'
                    : 'No tienes metas archivadas.'
                }
              />
            )}
          </div>
          {management && !readOnly && (
            <GoalManagementDialog
              key={household.id + ':' + management.goal.id + ':' + management.action}
              householdId={household.id}
              goal={management.goal}
              action={management.action}
              onClose={() => setManagement(null)}
              onSaved={async message => {
                const action = management.action;
                setManagement(null);
                if (action === 'restore') setGoalView('active');
                await load();
                setMessage(message);
              }}
            />
          )}
          <section className="finance-panel savings-history" aria-label="Historial de aportes de ahorro">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Tu ahorro, al detalle</p>
                <h3>Aportes de ahorro</h3>
                <small>Consulta aportes y retiros; los balances muestran el ahorro neto del período.</small>
              </div>
              <PiggyBank size={21} />
            </div>
            <div className="savings-history-filters">
              <label>
                Meta
                <select value={contributionGoal} onChange={e => setContributionGoal(e.target.value)}>
                  <option value="all">Todas las metas</option>
                  {goals.map(g => (
                    <option value={g.id} key={g.id}>
                      {g.name}
                      {g.active ? '' : ' · archivada'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Período
                <select value={contributionPeriod} onChange={e => setContributionPeriod(e.target.value)}>
                  <option value="month">{monthLabel(month)}</option>
                  <option value="all">Todos los meses</option>
                </select>
              </label>
              <div>
                <small>Total mostrado</small>
                <strong>{entryMoney(contributionRows.reduce((n, r) => n + toCents(r.amount), 0) / 100)}</strong>
              </div>
            </div>
            <div className="savings-history-list">
              {contributionRows.slice(0, contributionLimit).map(c => (
                <div className="savings-history-row" key={c.id}>
                  <span className="savings-history-icon">
                    <PiggyBank size={20} />
                  </span>
                  <div className="savings-history-copy">
                    <strong>{goalName(c.goal_id)}</strong>
                    <small>
                      {Number(c.amount) < 0 ? 'Retiro · ' : 'Aporte · '}
                      {new Date(c.contribution_date + 'T12:00').toLocaleDateString('es-GT', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </small>
                  </div>
                  <b>{entryMoney(Number(c.amount))}</b>
                  {!readOnly && (
                    <div className="finance-entry-actions">
                      <button
                        type="button"
                        aria-label={'Editar aporte de ' + entryMoney(Number(c.amount)) + ' a ' + goalName(c.goal_id)}
                        disabled={busy}
                        onClick={() => {
                          setManagementError('');
                          setEditingContribution(c);
                        }}
                      >
                        <Pencil size={15} />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        className="entry-delete"
                        aria-label={'Eliminar aporte de ' + entryMoney(Number(c.amount)) + ' a ' + goalName(c.goal_id)}
                        disabled={busy}
                        onClick={() => {
                          setManagementError('');
                          setRemoving({kind: 'contribution', row: c});
                        }}
                      >
                        <Trash2 size={15} />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!contributionRows.length && <EmptyFinance text="No hay aportes para estos filtros." />}
            {contributionRows.length > contributionLimit && (
              <button type="button" className="secondary-action" onClick={() => setContributionLimit(n => n + 20)}>
                Ver más aportes ({contributionRows.length - contributionLimit} restantes)
              </button>
            )}
          </section>
        </>
      )}
    </>
  );
}
