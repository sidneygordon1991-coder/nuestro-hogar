import {useEffect, useState, type FormEvent} from 'react';
import {CalendarRange, Check, RefreshCw} from 'lucide-react';
import {supabase} from './lib/supabase';
import {
  DEFAULT_HOUSEHOLD_CUTOFFS,
  normalizedHouseholdCutoffs,
  payWindow,
  payWindowLabel,
  validateHouseholdCutoffs
} from './lib/householdPayPeriod';

type CutoffValue = {first: string; second: string};
const fromSaved = (settings: {first_cutoff_day?: number | null; second_cutoff_day?: number | null} | null): CutoffValue => {
  const parsed = normalizedHouseholdCutoffs(settings);
  return {first: String(parsed.first_cutoff_day), second: String(parsed.second_cutoff_day)};
};

/** Stored per household in finance_household_settings; no local-only settings that drift across devices. */
export default function HouseholdCutoffSettings({
  householdId,
  month,
  readOnly
}: {
  householdId: string;
  month: string;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState<CutoffValue>(() => fromSaved(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    supabase
      .from('finance_household_settings')
      .select('first_cutoff_day,second_cutoff_day')
      .eq('household_id', householdId)
      .maybeSingle()
      .then(({data, error: readError}) => {
        if (!active) return;
        if (readError) {
          setError('No fue posible cargar los cortes del hogar. Es posible que falte la actualización de la base de datos.');
        } else {
          setDraft(fromSaved(data));
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [householdId, retry]);

  const numberFirst = Number(draft.first);
  const numberSecond = Number(draft.second);
  const preview = Number.isInteger(numberFirst) && Number.isInteger(numberSecond)
    && numberFirst >= 1 && numberFirst <= 27 && numberSecond > numberFirst && numberSecond <= 31
      ? {first_cutoff_day: numberFirst, second_cutoff_day: numberSecond}
      : DEFAULT_HOUSEHOLD_CUTOFFS;

  const example = [
    payWindow(month, 'first', preview),
    payWindow(month, 'second', preview),
    payWindow(
      new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10),
      'first',
      preview
    )
  ];

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly || saving || loading || error) return;
    let values;
    try {
      values = validateHouseholdCutoffs(Number(draft.first), Number(draft.second));
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Revisa los días.');
      return;
    }
    setSaving(true);
    setSaved(false);
    const user = await supabase.auth.getUser();
    const result = await supabase.from('finance_household_settings').upsert(
      {
        household_id: householdId,
        ...values,
        updated_by: user.data.user?.id || null,
        updated_at: new Date().toISOString()
      },
      {onConflict: 'household_id'}
    );
    if (result.error) setError('No se pudieron guardar las fechas. ' + result.error.message);
    else setSaved(true);
    setSaving(false);
  }

  return (
    <section className="monthly-income-plan finance-panel" aria-labelledby="household-cutoffs-title">
      <div className="monthly-income-heading">
        <span><CalendarRange size={23} /></span>
        <div>
          <p className="eyebrow">Cortes del presupuesto del hogar</p>
          <h3 id="household-cutoffs-title">¿Cuándo cierran tus quincenas?</h3>
          <p>
            Independiente del banco y de los días individuales de salario. Se guarda para este hogar
            y funciona en cualquier dispositivo. Los otros hogares conservan sus propias fechas.
          </p>
        </div>
      </div>
      {loading ? <p role="status">Cargando fechas del hogar…</p> : (
        <form onSubmit={save}>
          <div className="tools-grid">
            <label>
              Primer corte del mes
              <input aria-label="Primer corte del presupuesto" type="number" min="1" max="27" step="1"
                required value={draft.first} disabled={readOnly || saving || Boolean(error)}
                onChange={e => {setDraft(d => ({...d, first: e.target.value})); setSaved(false);}} />
            </label>
            <label>
              Segundo corte del mes
              <input aria-label="Segundo corte del presupuesto" type="number" min="2" max="31" step="1"
                required value={draft.second} disabled={readOnly || saving || Boolean(error)}
                onChange={e => {setDraft(d => ({...d, second: e.target.value})); setSaved(false);}} />
            </label>
          </div>
          <div className="monthly-income-actions">
            <button type="button" className="secondary-action" disabled={readOnly || saving || Boolean(error)}
              onClick={() => {setDraft({first: '13', second: '28'}); setSaved(false);}}>
              Usar 13 y 28
            </button>
            <button type="button" className="secondary-action" disabled={readOnly || saving || Boolean(error)}
              onClick={() => {setDraft(fromSaved(null)); setSaved(false);}}>
              Usar 15 y último día
            </button>
            {!readOnly && (
              <button type="submit" className="finance-primary" disabled={saving || Boolean(error)}>
                <Check size={16} /> {saving ? 'Guardando…' : 'Guardar cortes'}
              </button>
            )}
          </div>
          <p className="monthly-income-hint">
            Primera: {payWindowLabel(example[0])}. Segunda: {payWindowLabel(example[1])}.
            Siguiente primera: {payWindowLabel(example[2])}.
            El presupuesto mensual continúa siendo el mes calendario.
          </p>
          {saved && <p role="status" className="monthly-income-hint">Cortes guardados para este hogar. Verás el cambio al regresar a Inicio.</p>}
          {error && (
            <p role="alert" className="monthly-income-alert">
              {error}
              <button type="button" onClick={() => setRetry(n => n + 1)}>
                <RefreshCw size={15} /> Reintentar
              </button>
            </p>
          )}
        </form>
      )}
    </section>
  );
}
