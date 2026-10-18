import {useEffect, useState} from 'react';
import {Activity, AlertTriangle} from 'lucide-react';
import {supabase} from './lib/supabase';

type ActivityData = {
  generated_at: string;
  households: number;
  new_households_30: number;
  active_households_30: number;
  weekly_active: {week: string; households: number}[];
  errors: {
    open: number;
    last_7_days: number;
    occurrences_7_days: number;
    top: {
      source: string;
      message: string;
      occurrence_count: number;
      last_seen_at: string;
      app_version: string | null;
    }[];
  };
};

/**
 * Master panel: how many households really use the app each week (they register something), and the app errors
 * reported by devices. Counts only; no amounts or descriptions are read. Needs migration 20261018130000.
 */
export default function PlatformActivity() {
  const [data, setData] = useState<ActivityData | null>(null),
    [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  useEffect(() => {
    let live = true;
    supabase.rpc('get_platform_activity').then(({data, error}) => {
      if (!live) return;
      if (error)
        setState(['PGRST202', '42883'].includes(String((error as {code?: string}).code)) ? 'missing' : 'error');
      else if (
        !data ||
        !Array.isArray(data.weekly_active) ||
        !data.errors ||
        !Array.isArray(data.errors.top) ||
        !['households', 'active_households_30', 'new_households_30'].every(key => Number.isFinite(data[key])) ||
        !data.weekly_active.every(
          (w: {week?: unknown; households?: unknown}) => typeof w.week === 'string' && Number.isFinite(w.households)
        ) ||
        !Number.isFinite(data.errors.open) ||
        !Number.isFinite(data.errors.occurrences_7_days)
      )
        setState('error');
      else {
        setData(data as ActivityData);
        setState('ready');
      }
    });
    return () => {
      live = false;
    };
  }, []);
  if (state === 'loading')
    return (
      <p className="muted" role="status">
        Consultando la actividad…
      </p>
    );
  if (state === 'missing')
    return (
      <p className="master-footnote">
        Aplica la migración 20261018130000_platform_activity_metrics.sql para ver la actividad semanal.
      </p>
    );
  if (state === 'error' || !data)
    return (
      <p className="master-error" role="alert">
        No se pudo consultar la actividad.
      </p>
    );
  const weeks = data.weekly_active || [],
    max = Math.max(1, ...weeks.map(w => w.households)),
    last = weeks[weeks.length - 1]?.households || 0,
    previous = weeks[weeks.length - 2]?.households || 0;
  const rate = data.households ? Math.round((data.active_households_30 / data.households) * 100) : 0;
  return (
    <section className="master-activity" aria-labelledby="master-activity-title">
      <div className="master-section-heading">
        <h3 id="master-activity-title">
          <Activity size={18} aria-hidden="true" /> Uso real
        </h3>
        <small>Hogares que registraron algo (movimientos, ahorros, tareas o eventos)</small>
      </div>
      <div className="master-activity-kpis">
        <article>
          <small>Esta semana</small>
          <strong>{last}</strong>
          <em>
            {previous
              ? (last >= previous ? '+' : '') + (last - previous) + ' vs. semana anterior'
              : 'Primera semana medida'}
          </em>
        </article>
        <article>
          <small>Activos en 30 días</small>
          <strong>{data.active_households_30}</strong>
          <em>
            {rate}% de {data.households} hogares
          </em>
        </article>
        <article>
          <small>Hogares nuevos (30 días)</small>
          <strong>{data.new_households_30}</strong>
          <em>Creados en el último mes</em>
        </article>
        <article className={data.errors.open ? 'has-errors' : ''}>
          <small>Errores abiertos</small>
          <strong>{data.errors.open}</strong>
          <em>{data.errors.occurrences_7_days} ocurrencias en 7 días</em>
        </article>
      </div>
      <div
        className="master-activity-chart"
        role="img"
        aria-label={'Hogares activos por semana: ' + weeks.map(w => w.households).join(', ')}
      >
        {weeks.map(w => (
          <span
            key={w.week}
            title={
              'Semana del ' +
              new Date(w.week + 'T12:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'short'}) +
              ': ' +
              w.households
            }
          >
            <i style={{height: Math.max(4, (w.households / max) * 100) + '%'}} />
            <small>
              {new Date(w.week + 'T12:00')
                .toLocaleDateString('es-GT', {day: 'numeric', month: 'short'})
                .replace('.', '')}
            </small>
          </span>
        ))}
      </div>
      {data.errors.top.length > 0 && (
        <details className="master-activity-errors">
          <summary>
            <AlertTriangle size={16} aria-hidden="true" /> Últimos errores sin resolver
          </summary>
          <ul>
            {data.errors.top.map((e, i) => (
              <li key={i}>
                <strong>{e.source}</strong> · {e.message}
                <small>
                  {e.occurrence_count} vez/veces · {new Date(e.last_seen_at).toLocaleString('es-GT')}
                  {e.app_version ? ' · ' + e.app_version : ''}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
