import {countsInBudget} from '../../lib/budgetTreatment';
// Optional finance features (turned on per person in Configuración). Everything is computed on the device.
import {FormEvent, useMemo, useState} from 'react';
import {MessageCircleQuestion, Plus, Repeat, TrendingDown} from 'lucide-react';
import {currency} from '../../FinanceParts';
import {useFinance} from '../useFinanceWorkspace';
import {monthDate} from '../shared';
import {useFeatures} from '../../lib/features';
import {localISODate} from '../../lib/localDate';
import {answerQuestion, QUESTION_EXAMPLES, type QAnswer} from '../../lib/localQuestions';
import {forecast90, usualFlows} from '../../lib/forecast';
import {detectSubscriptions} from '../../lib/subscriptions';
import {rolloverCarry, zeroBased} from '../../lib/zeroBased';
import {supabase} from '../../lib/supabase';
import {Amount} from '../../ui';

const toCents = (n: unknown) => Math.round((Number(n) || 0) * 100);
const isCurrentMonth = (month: Date, today: string) => monthDate(month).slice(0, 7) === today.slice(0, 7);
const shortDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'short'}).replace('.', '');

/** "Preguntas rápidas" and "Pronóstico de 90 días", shown in the summary of the current month. */
export function SummaryOptional() {
  const features = useFeatures();
  const {month} = useFinance();
  const today = localISODate();
  if (!isCurrentMonth(month, today) || (!features.questions && !features.forecast)) return null;
  return (
    <>
      {features.questions && <QuickQuestions today={today} />}
      {features.forecast && <ForecastPanel today={today} />}
    </>
  );
}

function QuickQuestions({today}: {today: string}) {
  const {historyTxs, categories, allocations, recurring, goals, actualContributions} = useFinance();
  const [question, setQuestion] = useState(''),
    [result, setResult] = useState<QAnswer | null | 'unknown'>(null);
  const ctx = useMemo(
    () => ({
      today,
      txs: historyTxs,
      categories,
      planned: Object.fromEntries(allocations.map(a => [a.category_id, Number(a.planned_amount) || 0])),
      recurring,
      goals: goals
        .filter(g => g.active)
        .map(g => ({
          name: g.name,
          target_amount: g.target_amount,
          saved: actualContributions.filter(c => c.goal_id === g.id).reduce((s, c) => s + toCents(c.amount), 0) / 100
        })),
      format: currency
    }),
    [today, historyTxs, categories, allocations, recurring, goals, actualContributions]
  );
  function ask(text: string) {
    setQuestion(text);
    setResult(answerQuestion(text, ctx) || 'unknown');
  }
  return (
    <section className="finance-panel optional-panel questions-panel" aria-labelledby="questions-title">
      <div className="optional-head">
        <MessageCircleQuestion aria-hidden="true" />
        <h3 id="questions-title">Pregúntale a tus números</h3>
      </div>
      <form
        className="questions-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label className="sr-only" htmlFor="quick-question">
          Tu pregunta
        </label>
        <input
          id="quick-question"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="¿Cuánto gasté en comida este mes?"
          maxLength={140}
          autoComplete="off"
        />
        <button className="finance-primary" disabled={!question.trim()}>
          Preguntar
        </button>
      </form>
      {result && (
        <div className="questions-answer" aria-live="polite">
          {result === 'unknown' ? (
            <p>Aún no entiendo esa pregunta. Prueba con una de estas:</p>
          ) : (
            <>
              <p>
                <strong>{result.answer}</strong>
              </p>
              {result.detail && <p className="muted">{result.detail}</p>}
            </>
          )}
        </div>
      )}
      <div className="questions-examples">
        {QUESTION_EXAMPLES.map(q => (
          <button key={q} type="button" onClick={() => ask(q)}>
            {q}
          </button>
        ))}
      </div>
    </section>
  );
}

function ForecastPanel({today}: {today: string}) {
  const {historyTxs, recurring, occurrences, patrimony, accounts} = useFinance();
  const f = useMemo(() => {
    const flows = usualFlows(historyTxs, recurring, today);
    const paid = new Set(
      occurrences
        .filter(o => o.period_month.slice(0, 7) === today.slice(0, 7) && o.status !== 'pending')
        .map(o => o.recurring_transaction_id)
    );
    return forecast90(patrimony.liquidAssets, today, {recurring, paidThisMonth: paid, ...flows});
  }, [historyTxs, recurring, occurrences, patrimony.liquidAssets, today]);
  if (!accounts.length)
    return (
      <section className="finance-panel optional-panel">
        <div className="optional-head">
          <TrendingDown aria-hidden="true" />
          <h3>Próximos 90 días</h3>
        </div>
        <p className="muted">Agrega tus cuentas con su saldo para ver cómo se movería tu dinero.</p>
      </section>
    );
  const W = 640,
    H = 160,
    pad = 8;
  const values = f.points.map(p => p.balance);
  const max = Math.max(...values, 0),
    min = Math.min(...values, 0),
    span = max - min || 1;
  const x = (i: number) => pad + (i / (f.points.length - 1)) * (W - pad * 2),
    y = (v: number) => pad + ((max - v) / span) * (H - pad * 2);
  const line = f.points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.balance).toFixed(1)).join(' ');
  const lowIndex = f.points.indexOf(f.low);
  const big = [...f.events].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 4);
  return (
    <section className="finance-panel optional-panel forecast-panel" aria-labelledby="forecast-title">
      <div className="optional-head">
        <TrendingDown aria-hidden="true" />
        <h3 id="forecast-title">Próximos 90 días</h3>
      </div>
      <div className="forecast-figures">
        <div>
          <small>Hoy</small>
          <strong>
            <Amount value={f.points[0].balance} />
          </strong>
        </div>
        <div className={f.low.balance < 0 ? 'is-low' : ''}>
          <small>Punto más bajo · {shortDate(f.low.date)}</small>
          <strong>
            <Amount value={f.low.balance} tone={f.low.balance < 0 ? 'negative' : undefined} />
          </strong>
        </div>
        <div>
          <small>En 90 días</small>
          <strong>
            <Amount value={f.end.balance} tone={f.end.balance < 0 ? 'negative' : undefined} />
          </strong>
        </div>
      </div>
      <svg
        className="forecast-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Saldo proyectado: más bajo ${currency(f.low.balance)} el ${shortDate(f.low.date)}`}
      >
        {min < 0 && <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} className="forecast-zero" />}
        <path d={line + ` L${x(f.points.length - 1)} ${H} L${x(0)} ${H} Z`} className="forecast-area" />
        <path d={line} className="forecast-line" vectorEffect="non-scaling-stroke" />
        <circle cx={x(lowIndex)} cy={y(f.low.balance)} r={5} className="forecast-low" />
      </svg>
      <p className="forecast-note">
        {f.firstNegative
          ? `Al ritmo de siempre, el ${shortDate(f.firstNegative)} tus cuentas quedarían en negativo. Mueve un gasto o aparta dinero antes.`
          : 'Al ritmo de siempre, tus cuentas no quedan en negativo en los próximos tres meses.'}{' '}
        Supone {currency(f.dailyVariable)} al día de gasto variable
        {f.monthlyOtherIncome > 0 ? ` y ${currency(f.monthlyOtherIncome)} al mes de otros ingresos` : ''}, según tus
        últimos tres meses, más tus pagos fijos.
      </p>
      {big.length > 0 && (
        <ul className="forecast-events">
          {big.map(e => (
            <li key={e.date + e.description}>
              <span>{shortDate(e.date)}</span> {e.description}
              <b className={e.amount > 0 ? 'positive' : ''}>
                {(e.amount > 0 ? '+' : '−') + currency(Math.abs(e.amount))}
              </b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Charges that repeat every month and are not a recurring payment yet. */
export function SubscriptionsPanel() {
  const enabled = useFeatures().subscriptions;
  const {historyTxs, recurring, household, readOnly, load, setMessage} = useFinance();
  const today = localISODate();
  const found = useMemo(
    () =>
      enabled
        ? detectSubscriptions(
            historyTxs,
            recurring.map(r => r.description),
            today
          )
        : [],
    [enabled, historyTxs, recurring, today]
  );
  const [busy, setBusy] = useState('');
  if (!enabled) return null;
  async function add(s: (typeof found)[number]) {
    setBusy(s.key);
    const {error} = await supabase.from('recurring_transactions').insert({
      household_id: household.id,
      description: s.description,
      amount: s.amount,
      type: 'expense',
      due_day: s.dueDay,
      active: true,
      is_shared: true
    });
    setBusy('');
    setMessage(error ? 'No se pudo agregar el pago recurrente.' : s.description + ' quedó como pago recurrente.');
    if (!error) load();
  }
  const yearly = found.reduce((n, s) => n + toCents(s.yearly), 0) / 100;
  return (
    <section className="finance-panel optional-panel subscriptions-panel" aria-labelledby="subscriptions-title">
      <div className="optional-head">
        <Repeat aria-hidden="true" />
        <h3 id="subscriptions-title">Suscripciones detectadas</h3>
      </div>
      {found.length === 0 ? (
        <p className="muted">
          No encontramos cobros que se repitan cada mes fuera de tus pagos recurrentes. Revisamos los últimos doce
          meses.
        </p>
      ) : (
        <>
          <p className="muted">
            {found.length} {found.length === 1 ? 'cobro se repite' : 'cobros se repiten'} cada mes: unos{' '}
            {currency(yearly)} al año. ¿Los sigues usando todos?
          </p>
          <ul className="subscriptions-list">
            {found.map(s => (
              <li key={s.key}>
                <div>
                  <strong>{s.description}</strong>
                  <small>
                    {currency(s.amount)} al mes · próximo cobro cerca del {shortDate(s.nextDate)}
                    {s.priceChange ? ` · ${s.priceChange > 0 ? 'subió' : 'bajó'} ${Math.abs(s.priceChange)}%` : ''}
                  </small>
                </div>
                {!readOnly && (
                  <button type="button" disabled={busy === s.key} onClick={() => add(s)}>
                    <Plus aria-hidden="true" /> Pago recurrente
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Zero-based view of the month's budget, with what each category carries from earlier months. */
export function ZeroBasedPanel() {
  const enabled = useFeatures().zeroBased;
  const {incomeSummary, allocations, categories, historyAllocations, historyTxs, month} = useFinance();
  const data = useMemo(() => {
    if (!enabled) return null;
    const current = monthDate(month).slice(0, 7);
    const ids = categories.map(c => c.id);
    const months = new Map<string, {month: string; planned: Record<string, number>; spent: Record<string, number>}>();
    const slot = (m: string) => {
      if (!months.has(m)) months.set(m, {month: m, planned: {}, spent: {}});
      return months.get(m)!;
    };
    for (const a of historyAllocations) {
      const m = a.month.slice(0, 7);
      if (m < current) slot(m).planned[a.category_id] = Number(a.planned_amount) || 0;
    }
    for (const t of historyTxs) {
      const m = t.transaction_date.slice(0, 7);
      if (t.type !== 'expense' || !countsInBudget(t) || !t.category_id || m >= current) continue;
      const s = slot(m);
      s.spent[t.category_id] = (s.spent[t.category_id] || 0) + Number(t.amount);
    }
    slot(current);
    const ordered = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
    const carry = rolloverCarry(ordered, ids);
    const planned = Object.fromEntries(allocations.map(a => [a.category_id, Number(a.planned_amount) || 0]));
    return {carry, plan: zeroBased(incomeSummary.expected, planned, carry)};
  }, [enabled, month, categories, historyAllocations, historyTxs, allocations, incomeSummary.expected]);
  if (!enabled || !data) return null;
  const {plan, carry} = data;
  const carried = categories.filter(c => carry[c.id] > 0);
  return (
    <section className={'finance-panel optional-panel zero-panel is-' + plan.state} aria-labelledby="zero-title">
      <div className="zero-main">
        <small id="zero-title">Por asignar</small>
        <strong>
          <Amount value={plan.toAssign} tone={plan.state === 'over' ? 'negative' : undefined} />
        </strong>
        <p>
          {plan.state === 'balanced'
            ? 'Cada quetzal del ingreso esperado tiene un destino.'
            : plan.state === 'unassigned'
              ? `De ${currency(incomeSummary.expected)} esperados, ${currency(plan.assigned)} ya tienen destino. Asigna el resto a una categoría o a ahorro.`
              : `Asignaste ${currency(-plan.toAssign)} más de lo que esperas recibir. Baja alguna categoría.`}
        </p>
      </div>
      {carried.length > 0 && (
        <div className="zero-carry">
          <small>Pasa de meses anteriores · {currency(plan.carried)}</small>
          <ul>
            {carried.map(c => (
              <li key={c.id}>
                {c.name} <b>+{currency(carry[c.id])}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
