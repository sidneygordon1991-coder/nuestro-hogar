import {useMemo, useState} from 'react';
import {ChevronDown, PartyPopper, Target} from 'lucide-react';
import type {CashFlowSource} from './lib/cashFlow';
import {fortnightSplit} from './lib/fortnightSplit';
import {formatMoney as money} from './lib/money';
import './styles/components/home-hero.css';

const dayLabel = (date: string) =>
  new Date(date + 'T12:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'short'}).replace('.', '');

/**
 * «Llegó tu quincena»: a short ritual at the start of each fortnight (or when the pay is registered) that shows
 * where the money goes and offers the next move. Read-only: it changes nothing until the person acts.
 */
export default function HomeFortnightCard({
  source,
  householdId,
  canEdit,
  onNavigate
}: {
  source: CashFlowSource;
  householdId: string;
  canEdit: boolean;
  onNavigate: (route: string) => void;
}) {
  const split = useMemo(() => fortnightSplit(source), [source]);
  const storageKey = 'nh:quincena:' + householdId + ':' + split.start;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });
  const dayInPeriod = Number(source.today.slice(8, 10)) - Number(split.start.slice(8, 10));
  if (!split.ready || done || (split.received <= 0 && dayInPeriod > 2)) return null;
  const short = split.free < 0;
  function finish() {
    setDone(true);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      /* storage unavailable: hidden for this session */
    }
  }
  return (
    <section className="nh-fortnight" aria-labelledby="nh-fortnight-title">
      <button type="button" className="nh-fortnight-head" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <span className="nh-fortnight-icon" aria-hidden="true">
          <PartyPopper size={18} />
        </span>
        <span className="nh-fortnight-copy">
          <strong id="nh-fortnight-title">
            {split.received > 0 ? 'Llegó tu quincena' : 'Empieza tu quincena'} · {money(split.income)}
          </strong>
          <small className={short ? 'is-short' : ''}>
            {short
              ? 'Tu plan pide ' + money(-split.free) + ' más de lo que entra'
              : 'Libre después de tu plan: ' + money(split.free)}
          </small>
        </span>
        <span className="nh-fortnight-toggle">
          {open ? 'Ocultar' : 'Repartir'} <ChevronDown size={15} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div className="nh-fortnight-body">
          <p className="nh-fortnight-range">
            Quincena del {dayLabel(split.start)} al {dayLabel(split.end)}
          </p>
          <dl className="nh-fortnight-rows">
            <div>
              <dt>Ingresos de la quincena</dt>
              <dd>{money(split.income)}</dd>
            </div>
            {split.toReceive > 0 && (
              <div className="is-note">
                <dt>de los cuales por recibir</dt>
                <dd>{money(split.toReceive)}</dd>
              </div>
            )}
            {split.rows.map(row => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd>− {money(row.amount)}</dd>
              </div>
            ))}
            <div className={'is-total' + (short ? ' is-short' : '')}>
              <dt>{short ? 'Te falta' : 'Libre para decidir'}</dt>
              <dd>{money(Math.abs(split.free))}</dd>
            </div>
          </dl>
          <p className="nh-fortnight-hint">
            {short
              ? 'Baja algún rubro o mueve un pago para que la quincena alcance.'
              : split.free >= 1
                ? 'Dale un destino antes de que se vaya en gastos pequeños: una meta, una deuda o un rubro que se queda corto.'
                : 'Tu plan usa toda la quincena. Buen trabajo.'}
          </p>
          <div className="nh-fortnight-actions">
            {canEdit && !short && split.free >= 1 && (
              <button type="button" className="nh-setup-go" onClick={() => onNavigate('presupuesto:goals')}>
                <Target size={15} aria-hidden="true" /> Apartar para una meta
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                className={short ? 'nh-setup-go' : 'nh-fortnight-secondary'}
                onClick={() => onNavigate('presupuesto:budget')}
              >
                Ajustar presupuesto
              </button>
            )}
            <button type="button" className="nh-fortnight-secondary" onClick={finish}>
              Listo, ya lo revisé
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
