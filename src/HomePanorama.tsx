import {ArrowDownLeft, ArrowUpRight, PiggyBank} from 'lucide-react';
import FinancialEvidence, {type LedgerFigures} from './FinancialEvidence';
import {formatMoney as money} from './lib/money';

export default function HomePanorama({
  month,
  today,
  figures,
  onNavigate
}: {
  month: string;
  today: string;
  figures: LedgerFigures;
  onNavigate: (route: string) => void;
}) {
  const label = new Date(month + 'T12:00:00Z').toLocaleDateString('es-GT', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
  return (
    <section className="home-panorama" aria-label="Panorama del mes">
      <div className="panorama-heading">
        <div>
          <p className="eyebrow">Tu panorama · {label}</p>
          <h3>Espacio para lo que importa.</h3>
          <p>Tus decisiones de hoy, tus planes de mañana.</p>
        </div>
        <PanoramaArt />
      </div>
      <div className="panorama-figures">
        {[
          {name: 'Recibido', value: figures.income, icon: <ArrowDownLeft />},
          {name: 'Gastado', value: figures.expense, icon: <ArrowUpRight />},
          {name: 'Ahorro neto', value: figures.saving, icon: <PiggyBank />}
        ].map(item => (
          <div key={item.name}>
            <span aria-hidden="true">{item.icon}</span>
            <small>{item.name}</small>
            <strong>{money(item.value)}</strong>
          </div>
        ))}
      </div>
      <FinancialEvidence
        figures={figures}
        start={month}
        end={
          today.slice(0, 7) === month.slice(0, 7)
            ? today
            : month.slice(0, 7) + '-' + new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
        }
        onNavigate={s => onNavigate('presupuesto:' + s)}
      />
    </section>
  );
}

/** Architectural illustration: no sample balances or artificial financial trend. */
function PanoramaArt() {
  return (
    <svg className="panorama-art" viewBox="0 0 230 150" fill="none" aria-hidden="true">
      <ellipse cx="123" cy="134" rx="94" ry="11" fill="currentColor" opacity=".07" />
      <circle cx="135" cy="68" r="56" stroke="currentColor" opacity=".12" />
      <circle cx="135" cy="68" r="69" stroke="currentColor" strokeDasharray="2 7" opacity=".14" />
      <path d="M54 84 114 31 174 84v48H54Z" fill="var(--nh-surface)" stroke="currentColor" strokeWidth="1.5" />
      <path d="m42 85 72-64 72 64M114 31v101" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M73 93h24v39H73z" fill="var(--nh-accent-soft)" stroke="currentColor" />
      <path d="M130 83h25v25h-25z" fill="var(--nh-ill-2)" stroke="currentColor" />
      <path
        d="M142.5 83v25M130 95.5h25M177 132V98m0 16c-22-3-21-28-10-35 1 11 11 10 10 35Zm0 7c21-5 27-23 17-33-5 14-16 14-17 33Z"
        stroke="currentColor"
        strokeLinecap="round"
      />
      <circle cx="67" cy="42" r="12" fill="var(--nh-ill-2)" />
      <path d="M32 132h171" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}
