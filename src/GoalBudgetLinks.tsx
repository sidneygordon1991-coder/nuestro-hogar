import {useEffect, useState} from 'react';
import {Link2} from 'lucide-react';
import {supabase} from './lib/supabase';
import type {GoalLink} from './lib/connectedFinance';
export default function GoalBudgetLinks({
  householdId,
  month,
  goals,
  categories,
  readOnly,
  onChanged
}: {
  householdId: string;
  month: string;
  goals: {id: string; name: string; active?: boolean}[];
  categories: {id: string; name: string; budget_group: string}[];
  readOnly: boolean;
  onChanged: (links: GoalLink[] | null) => void;
}) {
  const [verified, setVerified] = useState(false);
  const [links, setLinks] = useState<GoalLink[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setLoading(true);
    setVerified(false);
    setError('');
    onChanged(null);
    supabase
      .from('goal_budget_links')
      .select('goal_id,category_id,month')
      .eq('household_id', householdId)
      .eq('month', month)
      .then(({data, error}) => {
        if (!live) return;
        if (error)
          setError('No pudimos verificar los vínculos del ahorro. Vuelve a abrir Presupuesto para reintentar.');
        else {
          setVerified(true);
          setLinks(data || []);
          onChanged(data || []);
        }
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [householdId, month]);
  async function link(goalId: string, categoryId: string) {
    if (readOnly || busy) return;
    setBusy(true);
    setError('');
    try {
      const {error} = categoryId
        ? await supabase
            .from('goal_budget_links')
            .upsert(
              {household_id: householdId, goal_id: goalId, category_id: categoryId, month},
              {onConflict: 'goal_id,month'}
            )
        : await supabase
            .from('goal_budget_links')
            .delete()
            .eq('household_id', householdId)
            .eq('goal_id', goalId)
            .eq('month', month);
      if (error) throw error;
      const updated = [
        ...links.filter(l => l.goal_id !== goalId),
        ...(categoryId ? [{goal_id: goalId, category_id: categoryId, month}] : [])
      ];
      setLinks(updated);
      onChanged(updated);
    } catch (e) {
      setError((e as {message?: string}).message || 'No se pudo guardar el vínculo.');
    } finally {
      setBusy(false);
    }
  }
  const saving = categories.filter(c => c.budget_group === 'saving');
  return (
    <section className="finance-panel goal-budget-links">
      <div className="panel-title">
        <div>
          <h3>
            <Link2 size={18} />
            Ahorro conectado al presupuesto
          </h3>
          <small>
            Vínculos de {new Date(month + 'T12:00').toLocaleDateString('es-GT', {month: 'long', year: 'numeric'})}
          </small>
        </div>
      </div>
      <p className="muted">
        Cada meta puede vincularse a un solo rubro por mes. Sus aportes menos retiros del período se suman allí una sola
        vez. El vínculo no cambia movimientos ni meses anteriores.
      </p>
      {loading ? (
        <p role="status">Verificando vínculos…</p>
      ) : (
        goals
          .filter(g => g.active !== false || links.some(l => l.goal_id === g.id))
          .map(g => (
            <label key={g.id}>
              {g.name}
              <select
                aria-label={'Rubro de ahorro de ' + g.name}
                disabled={readOnly || busy || !verified}
                value={links.find(l => l.goal_id === g.id)?.category_id || ''}
                onChange={e => link(g.id, e.target.value)}
              >
                <option value="">Sin vincular</option>
                {saving.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ))
      )}
      {!goals.length && <p className="muted">Crea una meta en Metas para vincularla con un rubro de ahorro.</p>}
      {!saving.length && (
        <p className="muted">Configura un rubro de tipo Ahorro y guarda el presupuesto para poder vincular metas.</p>
      )}
      {error && (
        <p role="alert" className="sharing-error">
          {error}
        </p>
      )}
    </section>
  );
}
