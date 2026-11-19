import type {ReactNode} from 'react';
import {ArrowRight, ChartPie, ChevronRight, Eye, EyeOff, Landmark, Wallet} from 'lucide-react';
import {Amount} from './ui';
import {amountsHidden, formatMoney as money} from './lib/money';
import type {SpendSummary} from './lib/spendSummary';
import './styles/components/home-hero.css';

const dayLabel = (date: string) =>
  new Date(date + 'T12:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'short'}).replace('.', '');

/**
 * The one figure Inicio leads with, in the style of the best money apps' "free to spend" headline:
 * what is left of this month's budget and what that means per day. Without a budget it shows the money
 * registered in cash and accounts and invites the person to plan, instead of a row of zeros.
 */
export default function HomeSpendHero({
  summary,
  period = 'month',
  onPeriod,
  recorded,
  accountsLoading,
  accountsError,
  balanceNote,
  canPlan,
  onNavigate,
  onRetryAccounts,
  details
}: {
  summary: SpendSummary | null;
  /** Which budget the figure uses: the current quincena or the whole month. */
  period?: 'fortnight' | 'month';
  /** Offered only when both periods have a plan. */
  onPeriod?: (period: 'fortnight' | 'month') => void;
  recorded: {total: number; bank: number; cash: number; count: number};
  accountsLoading: boolean;
  accountsError: string;
  /** Short status of the balances, e.g. when they were last reviewed. */
  balanceNote: string;
  canPlan: boolean;
  onNavigate: (route: string) => void;
  onRetryAccounts: () => void;
  /** Optional extra content (the commitments breakdown) shown under the figure. */
  details?: ReactNode;
}) {
  const hidden = amountsHidden();
  const eye = (
    <button
      type="button"
      className="nh-hero-eye"
      onClick={() => window.dispatchEvent(new CustomEvent('nh:toggle-amounts'))}
      aria-pressed={hidden}
      aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
      title={hidden ? 'Mostrar montos' : 'Ocultar montos'}
    >
      {hidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
    </button>
  );
  const accountsLine = accountsError ? (
    <p className="nh-hero-note" role="alert">
      {accountsError}{' '}
      <button type="button" className="nh-hero-link" onClick={onRetryAccounts}>
        Reintentar
      </button>
    </p>
  ) : (
    <p className="nh-hero-note">
      {balanceNote}
      {' · '}
      <button type="button" className="nh-hero-link" onClick={() => onNavigate('presupuesto:accounts')}>
        Actualizar saldos
      </button>
    </p>
  );

  if (summary) {
    const over = summary.remaining < 0;
    return (
      <section className="nh-hero" aria-labelledby="nh-hero-label">
        <div className="nh-hero-top">
          <p id="nh-hero-label" className="nh-hero-label">
            {over
              ? 'Te pasaste del presupuesto ' + (period === 'fortnight' ? 'de la quincena' : 'del mes')
              : 'Puedes gastar hasta el ' + dayLabel(summary.until)}
          </p>
          <span className="nh-hero-tools">
            {onPeriod && (
              <span className="nh-hero-lens" role="group" aria-label="Período de la cifra">
                <button type="button" aria-pressed={period === 'fortnight'} onClick={() => onPeriod('fortnight')}>
                  Quincena
                </button>
                <button type="button" aria-pressed={period === 'month'} onClick={() => onPeriod('month')}>
                  Mes
                </button>
              </span>
            )}
            {eye}
          </span>
        </div>
        <p className={'nh-hero-figure' + (over ? ' is-over' : '')}>
          <Amount value={over ? -summary.remaining : summary.remaining} animate />
        </p>
        <p className={'nh-hero-pace' + (over ? ' is-over' : '')}>
          {over
            ? 'Mueve dinero entre rubros o ajusta el plan para cerrar ' +
              (period === 'fortnight' ? 'la quincena' : 'el mes') +
              ' en orden.'
            : summary.perDay >= 1
              ? 'Unos ' +
                money(Math.floor(summary.perDay)) +
                ' por día · ' +
                (summary.daysLeft === 1
                  ? period === 'fortnight'
                    ? 'último día de la quincena'
                    : 'último día del mes'
                  : 'quedan ' + summary.daysLeft + ' días')
              : 'Ya usaste casi todo el presupuesto ' + (period === 'fortnight' ? 'de la quincena.' : 'del mes.')}
        </p>
        {!over && summary.reserved >= 1 && (
          <p className="nh-hero-note">
            Ya descontamos {money(summary.reserved)} del presupuesto para pagos fijos que faltan.
          </p>
        )}
        <div className="nh-hero-progress">
          <span
            role="progressbar"
            aria-label={period === 'fortnight' ? 'Presupuesto de la quincena usado' : 'Presupuesto del mes usado'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={summary.usedPercent}
            aria-valuetext={money(summary.spent) + ' usados de ' + money(summary.planned)}
          >
            <i
              className={over ? 'is-over' : summary.usedPercent >= 85 ? 'is-near' : ''}
              style={{width: summary.usedPercent + '%'}}
            />
          </span>
          <span className="nh-hero-progress-legend">
            <span>Usado {money(summary.spent)}</span>
            <span>Presupuesto {money(summary.planned)}</span>
          </span>
        </div>
        {details}
        <button type="button" className="nh-hero-row" onClick={() => onNavigate('presupuesto:accounts')}>
          <span>Cuentas y efectivo</span>
          <strong>{accountsLoading ? 'Q —' : money(recorded.total)}</strong>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        {accountsError && accountsLine}
      </section>
    );
  }

  return (
    <section className="nh-hero" aria-labelledby="nh-hero-label">
      <div className="nh-hero-top">
        <p id="nh-hero-label" className="nh-hero-label">
          Cuentas y efectivo
        </p>
        {eye}
      </div>
      <p className={'nh-hero-figure' + (recorded.total < 0 ? ' is-over' : '')}>
        {accountsLoading ? <span className="nh-hero-wait">Q —</span> : <Amount value={recorded.total} animate />}
      </p>
      {recorded.count > 0 && !accountsLoading ? (
        <div className="nh-hero-chips">
          <button type="button" onClick={() => onNavigate('presupuesto:accounts')}>
            <Landmark size={15} aria-hidden="true" /> Bancos {money(recorded.bank)}
          </button>
          <button type="button" onClick={() => onNavigate('presupuesto:accounts')}>
            <Wallet size={15} aria-hidden="true" /> Efectivo {money(recorded.cash)}
          </button>
        </div>
      ) : (
        !accountsLoading && <p className="nh-hero-pace">Agrega tus cuentas y su saldo para ubicar tu dinero.</p>
      )}
      {(recorded.count > 0 || accountsError) && accountsLine}
      {details}
      {canPlan && (
        <button type="button" className="nh-hero-invite" onClick={() => onNavigate('presupuesto:budget')}>
          <span className="nh-hero-invite-icon" aria-hidden="true">
            <ChartPie size={18} />
          </span>
          <span className="nh-hero-invite-copy">
            <strong>¿Cuánto puedes gastar?</strong>
            <small>Define tu presupuesto y lo verás aquí cada día.</small>
          </span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
