import {useEffect, useRef, useState, type FormEvent} from 'react';
import type {Goal} from '../FinanceParts';
import {supabase} from '../lib/supabase';
import {incomeAmount} from '../lib/monthlyIncome';
import {Modal} from './shared';

export type GoalAction = 'edit' | 'archive' | 'restore' | 'delete';
const titles: Record<GoalAction, string> = {
  edit: 'Editar meta',
  archive: 'Archivar meta',
  restore: 'Reactivar meta',
  delete: 'Eliminar meta'
};

export default function GoalManagementDialog({
  goal,
  action,
  householdId,
  onClose,
  onSaved
}: {
  goal: Goal;
  action: GoalAction;
  householdId: string;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    let values: Record<string, unknown> = {};
    if (action === 'edit') {
      try {
        const name = String(form.get('name') || '').trim();
        const amount = incomeAmount(String(form.get('target_amount') || ''));
        if (!name || name.length > 120 || amount <= 0) throw new Error('Escribe un nombre y una meta mayor que cero.');
        values = {name, target_amount: amount, target_date: String(form.get('target_date') || '') || null};
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    setBusy(true);
    setError('');
    const result = await supabase.rpc('manage_savings_goal', {
      p_household_id: householdId,
      p_goal_id: goal.id,
      p_action: action,
      p_expected: {
        name: goal.name,
        target_amount: Number(goal.target_amount),
        target_date: goal.target_date,
        active: goal.active
      },
      p_values: values
    });
    if (!alive.current) return;
    setBusy(false);
    if (result.error) {
      setError(
        ['PGRST202', '42883'].includes(String(result.error.code))
          ? 'La actualización del servidor aún no está disponible. Vuelve a intentarlo después de actualizar la app.'
          : result.error.code === '40001'
            ? 'Esta meta cambió en otra sesión. Cierra esta ventana y actualiza Finanzas antes de volver a editarla.'
            : result.error.message || 'No se pudo guardar el cambio. Tus datos se conservan.'
      );
      return;
    }
    await onSaved(
      {
        edit: 'Meta actualizada. Los aportes y saldos se conservan.',
        archive: 'Meta archivada. Su ahorro e historial se conservan.',
        restore: 'Meta reactivada.',
        delete: 'Meta eliminada.'
      }[action]
    );
  }
  return (
    <Modal
      title={titles[action]}
      close={() => {
        if (!busy) onClose();
      }}
    >
      <form className="finance-form" onSubmit={submit}>
        {action === 'edit' ? (
          <>
            <label>
              Nombre
              <input name="name" defaultValue={goal.name} maxLength={120} required />
            </label>
            <label>
              Monto objetivo (Q)
              <input
                name="target_amount"
                type="number"
                min="0.01"
                max="9999999999.99"
                step="0.01"
                defaultValue={goal.target_amount}
                required
              />
            </label>
            <label>
              Fecha objetivo
              <input name="target_date" type="date" defaultValue={goal.target_date || ''} />
            </label>
            <p className="goal-management-note">
              Cambiar la meta no modifica lo que ya ahorraste ni registra movimientos.
            </p>
          </>
        ) : (
          <>
            <strong>{goal.name}</strong>
            <p className="goal-management-note">
              {action === 'archive'
                ? 'Dejará de aparecer entre tus metas activas. Sus aportes, retiros y vínculos se conservan y podrás reactivarla en Archivadas.'
                : action === 'restore'
                  ? 'Volverá a tus metas activas con su historial y saldo conservados.'
                  : 'Solo se eliminan metas sin aportes, retiros ni vínculos con presupuestos o planeación. Si tiene historial, archívala para conservarlo.'}
            </p>
          </>
        )}
        {error && (
          <p className="finance-entry-error" role="alert">
            {error}
          </p>
        )}
        <div className="goal-dialog-actions">
          <button type="button" className="secondary-action" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className={action === 'delete' ? 'goal-delete-confirm' : 'finance-primary'}
            disabled={busy}
          >
            {busy ? 'Guardando…' : action === 'edit' ? 'Guardar cambios' : titles[action]}
          </button>
        </div>
      </form>
    </Modal>
  );
}
