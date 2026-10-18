import {useEffect, useMemo, useState} from 'react';
import {CalendarRange, ChevronRight} from 'lucide-react';
import {supabase} from './lib/supabase';
import {formatMoney} from './lib/money';
import {localISODate, localISODateIn} from './lib/localDate';
import {weeklySummary, type WeeklyTx} from './lib/weekly';
import type {CashFlowSource} from './lib/cashFlow';
import {Amount} from './ui';
import {fetchAllRows, pagedResult} from './lib/paging';
import {occurrenceDetails} from './lib/recurringDetails';

/** "Tu semana" on Inicio (optional): this week against a normal week, the reason, and what is coming. */
export default function WeeklySummaryCard({
  householdId,
  source,
  onNavigate
}: {
  householdId: string;
  source?: CashFlowSource;
  onNavigate: (tab: string) => void;
}) {
  const today = localISODate();
  const [rows, setRows] = useState<WeeklyTx[] | null>(null),
    [categories, setCategories] = useState<{id: string; name: string; budget_group?: string}[]>([]),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setRows(null);
    setFailed(false);
    const from = localISODateIn(-35);
    Promise.all([
      pagedResult(() =>
        fetchAllRows<WeeklyTx>((a, b) =>
          supabase
            .from('transactions')
            .select('id,amount,type,transaction_date,category_id,description')
            .eq('household_id', householdId)
            .eq('type', 'expense')
            .gte('transaction_date', from)
            .lte('transaction_date', today)
            .order('id')
            .range(a, b)
        )
      ),
      supabase.from('budget_categories').select('id,name,budget_group').eq('household_id', householdId)
    ]).then(([t, c]) => {
      if (!live) return;
      if (t.error || c.error) {
        setFailed(true);
        return;
      }
      setRows(t.error ? [] : ((t.data || []) as WeeklyTx[]));
      setCategories(c.error ? [] : ((c.data || []) as {id: string; name: string}[]));
    });
    return () => {
      live = false;
    };
  }, [householdId, today, attempt]);
  const upcoming = useMemo(() => {
    if (!source) return [];
    const limit = localISODateIn(7);
    const byId = new Map(source.recurring.map(r => [r.id, r]));
    return source.occurrences
      .filter(o => o.status === 'pending' && o.due_date > today && o.due_date <= limit)
      .map(o => {
        const original = byId.get(o.recurring_transaction_id);
        const r = original ? occurrenceDetails(original, o.details_snapshot) : null;
        return r && r.type === 'expense' && r.active !== false
          ? {date: o.due_date, description: r.description, amount: Number(r.amount) || 0}
          : null;
      })
      .filter((x): x is {date: string; description: string; amount: number} => Boolean(x));
  }, [source, today]);
  if (failed)
    return (
      <section className="home-card weekly-card" role="alert">
        No pudimos verificar el resumen de tu semana.
        <button onClick={() => setAttempt(n => n + 1)}>Reintentar resumen semanal</button>
      </section>
    );
  if (!rows) return null;
  const name = (id: string | null) => categories.find(c => c.id === id)?.name || 'Sin categoría';
  const savings = new Set(categories.filter(c => c.budget_group === 'saving').map(c => c.id));
  const s = weeklySummary(
    rows.filter(t => !t.category_id || !savings.has(t.category_id)),
    today,
    upcoming,
    name,
    formatMoney
  );
  const day = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-GT', {weekday: 'short', day: 'numeric'}).replace('.', '');
  return (
    <section className="home-card weekly-card" aria-labelledby="weekly-title">
      <div className="weekly-head">
        <CalendarRange aria-hidden="true" />
        <h3 id="weekly-title">Tu semana</h3>
        <span>desde el {day(s.start)}</span>
      </div>
      <div className="weekly-body">
        <div className="weekly-figure">
          <strong>
            <Amount value={s.spent} />
          </strong>
          {s.change !== null && (
            <span className={s.change >= 15 ? 'up' : s.change <= -15 ? 'down' : ''}>
              {s.change > 0 ? '+' : ''}
              {s.change}% frente a una semana normal ({formatMoney(s.usual)})
            </span>
          )}
        </div>
        <p>{s.sentence}</p>
        {s.biggest && (
          <p className="weekly-detail">
            Gasto más grande: {s.biggest.description}, {formatMoney(s.biggest.amount)}.
          </p>
        )}
      </div>
      {s.upcoming.length > 0 && (
        <div className="weekly-upcoming">
          <small>Vienen en 7 días · {formatMoney(s.upcomingTotal)}</small>
          <ul>
            {s.upcoming.slice(0, 4).map(u => (
              <li key={u.date + u.description}>
                <span>{day(u.date)}</span> {u.description} <b>{formatMoney(u.amount)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="weekly-link" onClick={() => onNavigate('presupuesto:transactions')}>
        Ver movimientos <ChevronRight aria-hidden="true" />
      </button>
    </section>
  );
}
