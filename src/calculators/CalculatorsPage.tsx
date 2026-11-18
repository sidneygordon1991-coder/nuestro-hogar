import {useEffect, useMemo, useState} from 'react';
import BrandMark from '../BrandMark';
import {formatMoney as money} from '../lib/money';
import {localISODate} from '../lib/localDate';
import {
  INCENTIVE_BONUS,
  VERIFIED_PAYROLL_YEAR,
  netPay,
  upcomingExtraPays,
  type ExtraPayKind
} from '../lib/guatemalaPay';

type Tab = 'bono14' | 'aguinaldo' | 'liquido';
const tabs: {id: Tab; label: string; title: string}[] = [
  {id: 'bono14', label: 'Bono 14', title: 'Calculadora de Bono 14'},
  {id: 'aguinaldo', label: 'Aguinaldo', title: 'Calculadora de aguinaldo'},
  {id: 'liquido', label: 'Sueldo líquido', title: 'Sueldo líquido con IGSS e ISR'}
];
const appUrl = import.meta.env.BASE_URL;
const longDate = (iso: string) =>
  new Date(iso + 'T12:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'long', year: 'numeric'});
const amountOf = (value: string) => {
  const n = Number(value.replace(/[,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

function readParams() {
  const p = new URLSearchParams(window.location.search);
  const tab = p.get('calc');
  return {
    tab: (tabs.some(t => t.id === tab) ? tab : 'bono14') as Tab,
    salary: p.get('salario') || '',
    start: /^\d{4}-\d{2}-\d{2}$/.test(p.get('inicio') || '') ? p.get('inicio')! : ''
  };
}

/** Free, public calculators: the way people in Guatemala find Nuestro Hogar in July and December. */
export default function CalculatorsPage() {
  const initial = useMemo(readParams, []);
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [salary, setSalary] = useState(initial.salary);
  const [start, setStart] = useState(initial.start);
  const [incentive, setIncentive] = useState(String(INCENTIVE_BONUS));
  const [other, setOther] = useState('');
  const [deductions, setDeductions] = useState('');
  const [igss, setIgss] = useState(true);
  const [copied, setCopied] = useState(false);
  const today = localISODate();
  const monthly = amountOf(salary);

  // Keep the address shareable: ?calc=aguinaldo&salario=6500
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('calc', tab);
    if (monthly) url.searchParams.set('salario', String(monthly));
    else url.searchParams.delete('salario');
    if (start && tab !== 'liquido') url.searchParams.set('inicio', start);
    else url.searchParams.delete('inicio');
    window.history.replaceState({}, '', url);
    const current = tabs.find(t => t.id === tab)!;
    document.title = current.title + ' 2026 en Guatemala · Nuestro Hogar';
  }, [tab, monthly, start]);

  const extra = useMemo(() => {
    if (tab === 'liquido' || !monthly) return null;
    return upcomingExtraPays(monthly, start || null, today).find(p => p.kind === (tab as ExtraPayKind)) || null;
  }, [tab, monthly, start, today]);

  const payYear = Math.min(Number(today.slice(0, 4)), VERIFIED_PAYROLL_YEAR);
  const net = useMemo(() => {
    if (tab !== 'liquido' || !monthly) return null;
    return netPay({
      salary: monthly,
      incentive: amountOf(incentive),
      otherTaxable: amountOf(other),
      personalDeductions: amountOf(deductions),
      igss,
      year: payYear
    });
  }, [tab, monthly, incentive, other, deductions, igss, payYear]);

  async function share() {
    const url = window.location.href;
    const text =
      tab === 'liquido'
        ? 'Calcula tu sueldo líquido con IGSS e ISR 2026'
        : 'Calcula cuánto te toca de ' + (tab === 'bono14' ? 'Bono 14' : 'aguinaldo');
    try {
      if (navigator.share) {
        await navigator.share({title: 'Nuestro Hogar', text, url});
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The person closed the share sheet. */
    }
  }

  const salaryField = (
    <label className="calc-field">
      <span>Salario ordinario mensual</span>
      <span className="calc-money">
        <span aria-hidden="true">Q</span>
        <input
          inputMode="decimal"
          autoComplete="off"
          placeholder="Ej. 6,500"
          value={salary}
          onChange={e => setSalary(e.target.value)}
          aria-describedby="calc-salary-hint"
        />
      </span>
      <small id="calc-salary-hint">Sin la bonificación incentivo de Q250.</small>
    </label>
  );

  return (
    <div className="calc-page" data-accent="forest">
      <header className="calc-header">
        <a className="calc-brand" href={appUrl}>
          <span className="calc-brand-mark" aria-hidden="true">
            <BrandMark size={22} />
          </span>
          Nuestro Hogar
        </a>
        <a className="calc-enter" href={appUrl}>
          Entrar
        </a>
      </header>

      <main className="calc-main">
        <p className="calc-eyebrow">Gratis · sin crear cuenta · reglas 2026</p>
        <h1>Calculadoras de sueldo para Guatemala</h1>
        <p className="calc-lead">
          Cuánto te toca de Bono 14 y aguinaldo, y cuánto recibes después de IGSS e ISR. Escribe tu salario y listo.
        </p>

        <div className="calc-tabs" role="tablist" aria-label="Calculadoras">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={'tab-' + t.id}
              aria-selected={tab === t.id}
              aria-controls="calc-panel"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <section className="calc-card" id="calc-panel" role="tabpanel" aria-labelledby={'tab-' + tab}>
          <form className="calc-form" onSubmit={e => e.preventDefault()}>
            {salaryField}
            {tab !== 'liquido' ? (
              <label className="calc-field">
                <span>Fecha en que empezaste a trabajar (opcional)</span>
                <input type="date" value={start} max={today} onChange={e => setStart(e.target.value)} />
                <small>Si entraste a medio período, el monto es proporcional a los días trabajados.</small>
              </label>
            ) : (
              <>
                <label className="calc-field">
                  <span>Bonificación incentivo mensual</span>
                  <span className="calc-money">
                    <span aria-hidden="true">Q</span>
                    <input inputMode="decimal" value={incentive} onChange={e => setIncentive(e.target.value)} />
                  </span>
                </label>
                <label className="calc-field">
                  <span>Otros ingresos mensuales afectos (comisiones, horas extra)</span>
                  <span className="calc-money">
                    <span aria-hidden="true">Q</span>
                    <input inputMode="decimal" placeholder="0" value={other} onChange={e => setOther(e.target.value)} />
                  </span>
                </label>
                <label className="calc-field">
                  <span>Deducciones personales al año (planilla del IVA, donaciones, seguros)</span>
                  <span className="calc-money">
                    <span aria-hidden="true">Q</span>
                    <input
                      inputMode="decimal"
                      placeholder="0"
                      value={deductions}
                      onChange={e => setDeductions(e.target.value)}
                    />
                  </span>
                </label>
                <label className="calc-check">
                  <input type="checkbox" checked={igss} onChange={e => setIgss(e.target.checked)} />
                  <span>Contribuyo al IGSS (4.83 %)</span>
                </label>
              </>
            )}
          </form>

          <div className="calc-result" aria-live="polite">
            {!monthly ? (
              <p className="calc-empty">Escribe tu salario para ver el resultado.</p>
            ) : extra ? (
              <>
                <p className="calc-result-label">Tu {extra.label} estimado</p>
                <p className="calc-figure">{money(extra.amount)}</p>
                <ul className="calc-facts">
                  <li>
                    <span>Período</span>
                    <b>
                      {longDate(extra.periodStart)} – {longDate(extra.periodEnd)}
                    </b>
                  </li>
                  <li>
                    <span>Días trabajados</span>
                    <b>
                      {extra.daysWorked} de {extra.periodDays}
                    </b>
                  </li>
                  <li>
                    <span>Se paga a más tardar</span>
                    <b>{longDate(extra.payDate)}</b>
                  </li>
                  {extra.secondPayDate && (
                    <li>
                      <span>Si lo pagan en dos partes</span>
                      <b>{money(Math.round(extra.amount * 50) / 100)} en diciembre y el resto en enero</b>
                    </li>
                  )}
                  <li>
                    <span>IGSS e ISR</span>
                    <b>{extra.taxableExcess > 0 ? 'Parte afecta a ISR' : 'No paga IGSS ni ISR'}</b>
                  </li>
                </ul>
              </>
            ) : net ? (
              <>
                <p className="calc-result-label">Recibes al mes, aproximadamente</p>
                <p className="calc-figure">{money(net.net)}</p>
                <ul className="calc-facts">
                  <li>
                    <span>Total devengado</span>
                    <b>{money(net.gross)}</b>
                  </li>
                  <li>
                    <span>IGSS laboral</span>
                    <b>− {money(net.igss)}</b>
                  </li>
                  <li>
                    <span>Retención de ISR</span>
                    <b>− {money(net.isr)}</b>
                  </li>
                  <li>
                    <span>ISR del año</span>
                    <b>{money(net.yearlyIsr)}</b>
                  </li>
                </ul>
              </>
            ) : null}
            {monthly > 0 && (
              <button type="button" className="calc-share" onClick={share}>
                {copied ? 'Enlace copiado' : 'Compartir esta calculadora'}
              </button>
            )}
          </div>
        </section>

        <section className="calc-cta" aria-labelledby="calc-cta-title">
          <div>
            <h2 id="calc-cta-title">Decide en qué se va antes de que llegue</h2>
            <p>
              Nuestro Hogar te recuerda la fecha, te sugiere cuánto apartar para deudas, ahorro y gastos de temporada, y
              lo conecta con el presupuesto de tu hogar.
            </p>
          </div>
          <a className="calc-cta-button" href={appUrl}>
            Crear mi cuenta gratis
          </a>
        </section>

        <section className="calc-notes" aria-labelledby="calc-notes-title">
          <h2 id="calc-notes-title">Cómo se calcula</h2>
          <dl>
            <dt>Bono 14</dt>
            <dd>
              Un salario ordinario mensual por el período del 1 de julio al 30 de junio, proporcional a los días
              trabajados, a más tardar el 15 de julio (Decreto 42-92).
            </dd>
            <dt>Aguinaldo</dt>
            <dd>
              Un salario ordinario mensual por el período del 1 de diciembre al 30 de noviembre. La ley permite pagar 50
              % en la primera quincena de diciembre y 50 % en la segunda quincena de enero (Decreto 76-78).
            </dd>
            <dt>Sueldo líquido</dt>
            <dd>
              IGSS laboral de 4.83 % sobre el salario ordinario. ISR de asalariados: 5 % hasta Q300,000 de renta
              imponible al año y Q15,000 más 7 % sobre el excedente, después de la deducción de Q48,000, el IGSS y las
              deducciones personales; en 2026 se suma una deducción extraordinaria de Q3,024 (Decretos 10-2012 y
              13-2026).
            </dd>
          </dl>
          <p className="calc-disclaimer">
            Son estimaciones con las reglas verificadas para {VERIFIED_PAYROLL_YEAR}. La planilla de tu empleador tiene
            la última palabra.
          </p>
        </section>
      </main>

      <footer className="calc-footer">
        <a href={appUrl}>Nuestro Hogar</a> · Finanzas y vida familiar, hecho en Guatemala
      </footer>
    </div>
  );
}
