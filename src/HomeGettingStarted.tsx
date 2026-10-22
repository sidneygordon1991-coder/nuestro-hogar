import {Check, ChevronRight, Wallet, CalendarDays, ChartPie} from 'lucide-react';

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
      detail: 'Efectivo y cuentas con su saldo registrado.',
      route: 'accounts',
      icon: Wallet,
      action: 'Agregar mis cuentas'
    },
    {
      done: income,
      title: 'Organiza tus ingresos',
      detail: 'Cuánto esperas recibir y tus fechas de cobro.',
      route: 'income',
      icon: CalendarDays,
      action: 'Configurar mis ingresos'
    },
    {
      done: budget,
      title: 'Dale un destino',
      detail: 'Empieza con unas pocas categorías del mes.',
      route: 'budget',
      icon: ChartPie,
      action: 'Preparar mi presupuesto'
    }
  ];
  const done = steps.filter(s => s.done).length;
  if (done === 3) return null;
  return (
    <section className="home-start home-getting-started" aria-labelledby="home-start-title">
      <div className="home-getting-started-head">
        <div>
          <p className="eyebrow">Tu punto de partida</p>
          <h3 id="home-start-title">Un hogar organizado, paso a paso</h3>
        </div>
        <span>{done} de 3 listos</span>
      </div>
      <ol>
        {steps.map(({done, title, detail, route, icon: Icon, action}, i) => (
          <li key={route} className={done ? 'is-done' : ''}>
            <span className="home-setup-step-icon" aria-hidden="true">
              {done ? <Check /> : <Icon />}
            </span>
            <div>
              <strong>
                {i + 1}. {title}
              </strong>
              <p>{detail}</p>
              <button type="button" onClick={() => onNavigate('presupuesto:' + route)}>
                {done ? 'Revisar' : action}
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="home-link" onClick={onExample}>
        Ver un ejemplo
      </button>
    </section>
  );
}
