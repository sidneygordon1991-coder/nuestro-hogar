import {ArrowUpRight, ChevronDown, ReceiptText} from 'lucide-react';
import {formatMoney as money} from './lib/money';

export type LedgerFigures = {
  income: number;
  expense: number;
  saving: number;
  available: number;
  budgetExpense: number;
  excludedExpense: number;
};

/** Same vocabulary and equation wherever an actual monthly result is presented. */
export default function FinancialEvidence({
  figures,
  start,
  end,
  onNavigate
}: {
  figures: LedgerFigures;
  start: string;
  end: string;
  onNavigate: (section: 'transactions' | 'goals' | 'accounts') => void;
}) {
  const date = (value: string) =>
    new Date(value + 'T12:00:00Z').toLocaleDateString('es-GT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    });
  return (
    <details className="financial-evidence">
      <summary>
        <ReceiptText size={16} aria-hidden="true" />
        <span>Comprobar cifras del mes</span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="financial-evidence-content">
        <p>
          {start > end ? (
            'Este período aún no empieza. Los movimientos futuros no forman parte de los importes reales.'
          ) : (
            <>
              Registros del {date(start)} al {date(end)}. Solo incluye lo ocurrido hasta esa fecha.
            </>
          )}
        </p>
        <dl>
          <div>
            <dt>Ingresos recibidos</dt>
            <dd>{money(figures.income)}</dd>
          </div>
          <div>
            <dt>Gastos registrados</dt>
            <dd>− {money(figures.expense)}</dd>
          </div>
          <div>
            <dt>Ahorro neto del período</dt>
            <dd>
              {figures.saving < 0 ? '+ ' : '− '}
              {money(Math.abs(figures.saving))}
            </dd>
          </div>
          <div className="financial-evidence-total">
            <dt>Resultado después de ahorro</dt>
            <dd>{money(figures.available)}</dd>
          </div>
        </dl>
        <p>
          Del gasto total, {money(figures.budgetExpense)} cuenta en el presupuesto y {money(figures.excludedExpense)}{' '}
          queda fuera. Ambos reducen el resultado real.
        </p>
        <p>
          El ahorro reúne los aportes menos retiros de metas y los movimientos en categorías de ahorro. Un retiro libera
          ahorro; no crea otro ingreso. Las transferencias entre cuentas y los pagos de tarjeta registrados como
          transferencias no son gastos nuevos.
        </p>
        <p>
          Este resultado mide la actividad del mes. Los saldos de tus cuentas también incluyen dinero anterior y se
          consultan por separado. Los ingresos esperados y los pagos pendientes pertenecen a la proyección.
        </p>
        <div className="evidence-actions">
          <button type="button" onClick={() => onNavigate('transactions')}>
            Revisar movimientos <ArrowUpRight size={15} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onNavigate('goals')}>
            Revisar ahorro <ArrowUpRight size={15} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onNavigate('accounts')}>
            Revisar cuentas <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </details>
  );
}
