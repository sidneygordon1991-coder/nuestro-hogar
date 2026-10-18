import {useEffect, useRef, useState} from 'react';
import {AlertTriangle, ArrowUpRight, Check, RefreshCw, ShoppingCart, X} from 'lucide-react';
import {supabase} from './lib/supabase';
type PlanRow = {
  key: string;
  name: string;
  unit: string;
  required: number;
  available: number;
  missing: number;
  warning: string | null;
  recipes: string;
  pantry_item_id: string | null;
};
type Plan = {week: string; rows: PlanRow[]; fingerprint: string; unquantified_meals: number};
const qty = (n: number) => new Intl.NumberFormat('es-GT', {maximumFractionDigits: 2}).format(Number(n));
export default function WeeklyShoppingDialog({
  householdId,
  week,
  canSave,
  onClose,
  onOpenLists
}: {
  householdId: string;
  week: string;
  canSave: boolean;
  onClose: () => void;
  onOpenLists?: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const version = useRef(0);
  useEffect(() => {
    load();
    return () => {
      version.current++;
    };
  }, [householdId, week]);
  async function load() {
    const v = ++version.current;
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const {data, error} = await supabase.rpc('get_weekly_shopping_plan', {p_household_id: householdId, p_week: week});
      if (error) throw error;
      if (!data || !Array.isArray(data.rows) || data.week !== week || typeof data.fingerprint !== 'string')
        throw new Error('No se pudo verificar la compra semanal.');
      if (v === version.current) setPlan(data as Plan);
    } catch (e: any) {
      if (v === version.current) {
        setPlan(null);
        setError(e?.message || 'No se pudo consultar el menú.');
      }
    } finally {
      if (v === version.current) setLoading(false);
    }
  }
  async function save() {
    if (!plan || !canSave || saving) return;
    setSaving(true);
    setError('');
    try {
      const {data, error} = await supabase.rpc('sync_weekly_shopping_plan', {
        p_household_id: householdId,
        p_week: week,
        p_fingerprint: plan.fingerprint
      });
      if (error) throw error;
      if (typeof data !== 'string') throw new Error('No se pudo confirmar la lista.');
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la compra. Actualiza la vista previa y vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  }
  const missing = plan?.rows.filter(r => Number(r.missing) > 0).length || 0;
  return (
    <div className="modal-backdrop">
      <div className="finance-modal weekly-shopping-modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Del menú a tu lista</p>
            <h3>Compra semanal</h3>
          </div>
          <button disabled={saving} aria-label="Cerrar compra semanal" onClick={onClose}>
            <X />
          </button>
        </div>
        <p className="weekly-shopping-intro">
          Semana del {new Date(week + 'T12:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'long'})}. Suma las
          comidas pendientes y descuenta la despensa actual una sola vez por producto y unidad compatible.
        </p>
        {error && (
          <div className="workspace-status error" role="alert">
            <AlertTriangle size={19} />
            <p>{error}</p>
          </div>
        )}
        {loading ? (
          <p role="status">Calculando ingredientes…</p>
        ) : (
          plan && (
            <>
              <div className="weekly-shopping-summary">
                <span>
                  <ShoppingCart size={22} />
                </span>
                <div>
                  <strong>
                    {missing} ingrediente{missing === 1 ? '' : 's'} por comprar
                  </strong>
                  <small>
                    {plan.rows.length} ingrediente{plan.rows.length === 1 ? '' : 's'} consolidado
                    {plan.rows.length === 1 ? '' : 's'} · porciones del menú
                  </small>
                </div>
              </div>
              {plan.unquantified_meals > 0 && (
                <p className="weekly-shopping-warning">
                  <AlertTriangle size={16} />
                  {plan.unquantified_meals} comida{plan.unquantified_meals === 1 ? '' : 's'} sin ingredientes
                  calculables. Revisa sus compras manualmente.
                </p>
              )}
              <ul className="weekly-shopping-rows">
                {plan.rows.map(row => (
                  <li key={row.key}>
                    <div>
                      <strong>{row.name}</strong>
                      <small>{row.recipes}</small>
                    </div>
                    <dl>
                      <div>
                        <dt>Necesario</dt>
                        <dd>
                          {qty(row.required)} {row.unit}
                        </dd>
                      </div>
                      <div>
                        <dt>En despensa</dt>
                        <dd>
                          {qty(row.available)} {row.unit}
                        </dd>
                      </div>
                      <div className={Number(row.missing) > 0 ? 'to-buy' : 'covered'}>
                        <dt>Comprar</dt>
                        <dd>
                          {qty(row.missing)} {row.unit}
                        </dd>
                      </div>
                    </dl>
                    {row.warning && (
                      <p className="weekly-shopping-warning">
                        <AlertTriangle size={14} />
                        {row.warning}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {!plan.rows.length && (
                <p className="weekly-shopping-empty">
                  No hay ingredientes pendientes calculables. Planifica comidas con receta o actualiza la lista para
                  quitar faltantes automáticos anteriores.
                </p>
              )}
              <p className="daily-agenda-caption">
                Se guarda en una lista propia de esta semana. Al actualizarla se ajustan solo los renglones automáticos
                pendientes; se conservan las compras completadas y los elementos manuales. No modifica la despensa ni
                registra gastos. No descuenta productos anotados en otras listas.
              </p>
              {!canSave && (
                <p className="daily-agenda-caption">
                  Puedes consultar el cálculo. Para guardar la compra necesitas permiso de edición en Listas.
                </p>
              )}
              {saved && (
                <div className="weekly-shopping-success" role="status">
                  <Check size={18} />
                  Lista semanal guardada.
                  {onOpenLists && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenLists();
                      }}
                    >
                      Ver en Listas <ArrowUpRight size={16} />
                    </button>
                  )}
                </div>
              )}
            </>
          )
        )}
        <div className="weekly-shopping-actions">
          <button disabled={loading || saving} onClick={load}>
            <RefreshCw size={16} /> Actualizar cálculo
          </button>
          {canSave && plan && (
            <button className="finance-primary" disabled={loading || saving} onClick={save}>
              <ShoppingCart size={17} />
              {saving ? 'Guardando…' : saved ? 'Actualizar lista semanal' : 'Guardar lista semanal'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
