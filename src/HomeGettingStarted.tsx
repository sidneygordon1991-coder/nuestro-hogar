import {Check, ChevronRight, Wallet, CalendarDays, ChartPie} from 'lucide-react';
import './styles/components/home-hero.css';

/**
 * First-run guide, compact: a progress bar, the next step as the only primary action and the other steps as
 * quiet rows. It disappears once accounts, income and budget are set up.
 */
export default function HomeGettingStarted({
  accounts,
  income,
  budget,
  onNavigate,
  onExample
}: {
  accounts: boolean;
  income: boolean;
  budget: boolean;
  onNavigate: (route: string) => void;
  onExample: () => void;
}) {
  const steps = [
    {
      done: accounts,
      title: 'Ubica tu dinero',
      detail: 'Efectivo y cuentas con su saldo',
      route: 'accounts',
      icon: Wallet,
      action: 'Agregar mis cuentas'
    },
    {
      done: income,
      title: 'Organiza tus ingresos',
      detail: 'Cuánto esperas y cuándo cobras',
      route: 'income',
      icon: CalendarDays,
      action: 'Configurar mis ingresos'
    },
    {
      done: budget,
      title: 'Dale un destino a tu dinero',
      detail: 'Unas pocas categorías del mes',
      route: 'budget',
      icon: ChartPie,
      action: 'Preparar mi presupuesto'
    }
  ];
  const done = steps.filter(s => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find(s => !s.done)!;
  return (
    <section className="nh-setup" aria-labelledby="home-start-title">
      <div className="nh-setup-head">
        <h3 id="home-start-title">Configura tu hogar</h3>
        <span>
          {done} de {steps.length}
        </span>
      </div>
      <span
        className="nh-setup-bar"
        role="progressbar"
        aria-label="Avance de la configuración"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
      >
        <i style={{width: Math.round((done / steps.length) * 100) + '%'}} />
      </span>
      <ol>
        {steps.map(({done: isDone, title, detail, route, icon: Icon, action}) => {
          const isNext = route === next.route;
          return (
            <li key={route} className={isDone ? 'is-done' : isNext ? 'is-next' : ''}>
              <span className="nh-setup-icon" aria-hidden="true">
                {isDone ? <Check /> : <Icon />}
              </span>
              <span className="nh-setup-copy">
                <strong>{title}</strong>
                <small>{isDone ? 'Listo' : detail}</small>
              </span>
              {isNext ? (
                <button type="button" className="nh-setup-go" onClick={() => onNavigate('presupuesto:' + route)}>
                  {action}
                </button>
              ) : (
                !isDone && (
                  <button
                    type="button"
                    className="nh-setup-later"
                    aria-label={action}
                    onClick={() => onNavigate('presupuesto:' + route)}
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                )
              )}
            </li>
          );
        })}
      </ol>
      <div className="nh-setup-foot">
        <button type="button" className="nh-hero-link" onClick={onExample}>
          Ver un ejemplo
        </button>
      </div>
    </section>
  );
}
