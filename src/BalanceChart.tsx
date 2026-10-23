import {useEffect, useId, useRef, useState} from 'react';
import {CalendarDays} from 'lucide-react';
import {dayDiff, type BalanceTimeline} from './lib/homeOverview';
import type {CashFlowSource} from './lib/cashFlow';
import {formatMoney as money, formatMoneyRounded} from './lib/money';
import MovementList from './MovementList';
const shortDate = (date: string) =>
  new Intl.DateTimeFormat('es-GT', {day: 'numeric', month: 'short', timeZone: 'UTC'}).format(
    new Date(date + 'T12:00:00Z')
  );

function niceStep(range: number) {
  const raw = range / 3,
    pow = 10 ** Math.floor(Math.log10(Math.max(1, raw))),
    n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

export default function BalanceChart({timeline, source}: {timeline: BalanceTimeline; source: CashFlowSource}) {
  const [selection, setSelection] = useState<string | null>(null),
    [exploring, setExploring] = useState(false);
  const id = useId().replace(/:/g, '');
  const chart = useRef<HTMLElement>(null),
    [width, setWidth] = useState(640);
  useEffect(() => {
    const el = chart.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const context = timeline.context,
    reg = timeline.registered,
    proj = timeline.projected,
    last = reg[reg.length - 1];
  const entries = [
    ...context.map(p => ({...p, kind: 'context' as const})),
    ...reg.map(p => ({...p, kind: 'registered' as const})),
    ...proj.map(p => ({...p, kind: 'projected' as const}))
  ].sort((a, b) => a.date.localeCompare(b.date));
  const entryKey = (p: (typeof entries)[number]) => p.kind + ':' + p.date;
  const selected =
    entries.find(p => entryKey(p) === selection) ||
    entries.find(p => p.kind === 'registered' && p.date === last?.date) ||
    entries[0];
  const selectionIndex = selected ? entries.indexOf(selected) : 0;
  const all = [...context, ...reg, ...proj];
  if (!all.length)
    return (
      <figure ref={chart} className="home-chart home-chart--empty">
        <CalendarDays size={24} aria-hidden="true" />
        <p>Este período todavía no tiene días registrados.</p>
      </figure>
    );
  const compact = width < 420,
    height = compact ? 172 : 200,
    left = compact ? 54 : 66,
    right = 16,
    top = 12,
    bottom = compact ? 30 : 46;
  const axisStart = context[0]?.date || timeline.start,
    span = Math.max(1, dayDiff(axisStart, timeline.end));
  const values = all.map(r => r.balance),
    min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const step = niceStep(max - min),
    lo = Math.floor(min / step) * step,
    hi = Math.ceil(max / step) * step,
    range = hi - lo || 1;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  const x = (date: string) => left + (dayDiff(axisStart, date) / span) * (width - left - right);
  const y = (n: number) => top + ((hi - n) / range) * (height - top - bottom);
  const line = (rows: {date: string; balance: number}[]) =>
    rows.map(r => x(r.date).toFixed(1) + ',' + y(r.balance).toFixed(1)).join(' ');
  const solid = [...(context.length ? context : []), ...reg];
  const projectedPath = last && proj.length ? line([last, ...proj.filter(p => p.date > last.date)]) : '';
  // Date labels never overlap: candidates are placed by priority using their estimated text width.
  const candidates: {date: string; note?: string; kind: string}[] = [
    ...(last && timeline.status !== 'closed' ? [{date: last.date, note: 'Hoy', kind: 'today'}] : []),
    ...timeline.marks
      .filter(m => m.kind === 'income')
      .map(m => ({date: m.date, note: 'Ingreso esperado', kind: 'income'})),
    ...timeline.marks
      .filter(m => m.kind === 'payment')
      .sort((a, b) => b.amount - a.amount)
      .map(m => ({date: m.date, note: m.label, kind: 'payment'})),
    ...(context.length ? [{date: timeline.start, note: 'Inicio', kind: 'start'}] : []),
    {date: axisStart, kind: 'edge'},
    {date: timeline.end, kind: 'edge'}
  ];
  const charWidth = compact ? 6.2 : 6.6,
    box = (c: {date: string; note?: string}) =>
      Math.max(shortDate(c.date).length, compact || !c.note ? 0 : Math.min(16, c.note.length)) * charWidth + 10;
  const placed: {date: string; note?: string; kind: string; x: number; w: number}[] = [];
  for (const c of candidates) {
    const cx = x(c.date),
      w = box(c),
      same = placed.find(p => p.date === c.date);
    if (same) {
      if (!same.note && c.note && !compact) {
        same.note = c.note;
        same.w = Math.max(same.w, w);
      }
      continue;
    }
    const lo1 = Math.max(left - 20, cx - w / 2),
      hi1 = Math.min(width, cx + w / 2);
    if (placed.every(p => hi1 + 6 <= p.x - p.w / 2 || lo1 - 6 >= p.x + p.w / 2)) placed.push({...c, x: cx, w});
  }
  const anchor = (px: number) => (px < left + 24 ? 'start' : px > width - right - 24 ? 'end' : 'middle');
  const description =
    'Saldo ' +
    (timeline.basis === 'accounts' ? 'registrado en cuentas' : 'registrado del mes') +
    (last ? ' al ' + shortDate(last.date) + ': ' + money(last.balance) : '') +
    (proj.length ? '. Proyección al ' + shortDate(timeline.end) + ': ' + money(proj[proj.length - 1].balance) : '');
  return (
    <figure ref={chart} className="home-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={description}
        className="interactive-balance-chart"
        onClick={e => {
          const box = e.currentTarget.getBoundingClientRect(),
            px = ((e.clientX - box.left) / box.width) * width;
          const nearest = entries.reduce(
            (best, p) => (Math.abs(x(p.date) - px) < Math.abs(x(best.date) - px) ? p : best),
            entries[0]
          );
          setSelection(entryKey(nearest));
          setExploring(true);
        }}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="home-chart-fill-start" />
            <stop offset="100%" className="home-chart-fill-end" />
          </linearGradient>
        </defs>
        {ticks.map(t => (
          <g key={t}>
            <line className="home-chart-grid" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
            <text className="home-chart-tick" x={left - 8} y={y(t) + 4} textAnchor="end">
              {formatMoneyRounded(t)}
            </text>
          </g>
        ))}
        {placed
          .filter(p => p.kind !== 'edge')
          .map(p => (
            <line key={'v' + p.date} className="home-chart-marker" x1={p.x} x2={p.x} y1={top} y2={height - bottom} />
          ))}
        {solid.length > 1 && (
          <polygon
            points={`${x(solid[0].date)},${y(lo)} ${line(solid)} ${x(solid[solid.length - 1].date)},${y(lo)}`}
            fill={`url(#${id})`}
          />
        )}
        {solid.length > 0 && <polyline className="home-chart-line" points={line(solid)} />}
        {projectedPath && <polyline className="home-chart-line home-chart-line--projected" points={projectedPath} />}
        {timeline.marks
          .filter(m => m.kind === 'payment')
          .map(m => {
            const point = proj.find(p => p.date === m.date);
            return point ? (
              <circle
                key={'p' + m.date + m.label}
                className="home-chart-dot"
                cx={x(m.date)}
                cy={y(point.balance)}
                r={3.5}
              />
            ) : null;
          })}
        {timeline.marks
          .filter(m => m.kind === 'income')
          .filter((m, i, all) => all.findIndex(o => o.date === m.date) === i)
          .map(m => {
            const point = proj.find(p => p.date === m.date);
            return point ? (
              <circle
                key={'i' + m.date}
                className="home-chart-dot home-chart-dot--open"
                cx={x(m.date)}
                cy={y(point.balance)}
                r={5}
              />
            ) : null;
          })}
        {last && (
          <circle className="home-chart-dot home-chart-dot--today" cx={x(last.date)} cy={y(last.balance)} r={4.5} />
        )}
        {exploring && selected && (
          <g aria-hidden="true" className="home-chart-selection">
            <line x1={x(selected.date)} x2={x(selected.date)} y1={top} y2={height - bottom} />
            <circle cx={x(selected.date)} cy={y(selected.balance)} r={6} />
          </g>
        )}
        {placed.map(p => (
          <g key={'l' + p.date} className="home-chart-xlabel">
            <text x={p.x} y={height - bottom + 17} textAnchor={anchor(p.x)}>
              {shortDate(p.date)}
            </text>
            {p.note && !compact && (
              <text className="home-chart-xnote" x={p.x} y={height - bottom + 33} textAnchor={anchor(p.x)}>
                {p.note.length > 16 ? p.note.slice(0, 15) + '…' : p.note}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="chart-touch-hint">Toca un día de la gráfica para ver el detalle.</figcaption>
      <details className="chart-inspector" open={exploring} onToggle={e => setExploring(e.currentTarget.open)}>
        <summary>Explorar días</summary>
        <label className="chart-date-control">
          Elige un día
          <input
            type="range"
            min={0}
            max={entries.length - 1}
            step={1}
            value={selectionIndex}
            aria-label="Explorar días de la gráfica"
            aria-valuetext={
              shortDate(selected.date) + (selected.kind === 'projected' ? ', proyectado' : ', registrado')
            }
            onChange={e => setSelection(entryKey(entries[Number(e.target.value)]))}
          />
        </label>
        <div className="chart-selected-value" aria-live="polite" aria-atomic="true">
          <span>
            <strong>{shortDate(selected.date)}</strong>
            <small>
              {selected.kind === 'projected'
                ? 'Proyectado · según el plan'
                : selected.kind === 'context'
                  ? 'Saldo de contexto'
                  : 'Registrado'}
            </small>
          </span>
          <b>{money(selected.balance)}</b>
        </div>
        {selected.kind === 'projected' ? (
          <div className="chart-projected-detail">
            <p>Es una estimación; estos importes aún no son movimientos registrados.</p>
            {timeline.marks
              .filter(m => m.date === selected.date)
              .map((m, i) => (
                <div key={i}>
                  <span>{m.label}</span>
                  <b>
                    {m.kind === 'income' ? '+ ' : '− '}
                    {money(m.amount)}
                  </b>
                </div>
              ))}
          </div>
        ) : selected.date.slice(0, 7) !== source.month.slice(0, 7) ? (
          <p className="movement-empty">
            El detalle de movimientos de esta fecha no está incluido en el mes consultado.
          </p>
        ) : (
          <>
            <MovementList
              rows={source.transactions.filter(
                t => t.transaction_date === selected.date && t.transaction_date <= source.today
              )}
              categories={source.categories}
            />
            {source.savings.some(t => t.contribution_date === selected.date) && (
              <p className="movement-empty">
                También hay aportes o retiros de ahorro registrados en esta fecha. Consulta su historial en Metas.
              </p>
            )}
            {timeline.basis === 'accounts' && (
              <p className="movement-empty">
                El saldo también refleja saldos iniciales y transferencias entre cuentas.
              </p>
            )}
          </>
        )}
      </details>
    </figure>
  );
}
