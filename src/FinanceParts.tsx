import {type OccurrenceDetails} from './lib/recurringDetails';
import {type HalfAmounts} from './lib/financePeriods';
import {InteractiveTrend} from './FinancialVisuals';
import ModuleIcon from './ModuleIcon';
import {useEffect, useRef, useState} from 'react';
import {
  Archive,
  RotateCcw,
  ArrowDownLeft,
  Building2,
  Car,
  CircleDollarSign,
  CreditCard,
  Gem,
  GraduationCap,
  Landmark,
  Pencil,
  Plane,
  PiggyBank,
  Paperclip,
  ReceiptText,
  ShoppingCart,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import {formatMoney} from './lib/money';
import {Illustration, type IllustrationName} from './ui';
import {formatEntryAmount, usdToQuetzales} from './lib/currency';

export const currency = (n: number) => formatMoney(n || 0);
export const isoDate = (d = new Date()) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};
export const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, Math.floor((a / b) * 100))) : 0);
/** Finance building blocks: shared types, small presentational components and labels used by Finance.tsx. */
export type Household = {id: string; name: string; invite_code: string};
export type BudgetGroup = 'fixed' | 'variable' | 'saving';
export type Category = {id: string; name: string; icon: string; budget_group: BudgetGroup};
export type Tx = {
  budget_included?: boolean;
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  transaction_date: string;
  category_id: string | null;
  paid_by: string | null;
  account_id: string | null;
  is_shared: boolean;
  notes: string | null;
  recurring_transaction_id: string | null;
  original_currency?: string | null;
  original_amount?: number | null;
  exchange_rate?: number | null;
};
export type Allocation = HalfAmounts & {id: string; category_id: string; planned_amount: number; month: string};
export type Goal = {
  id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
  icon: string;
  active: boolean;
};
export type Contribution = {
  id: string;
  goal_id: string;
  amount: number;
  contribution_date: string;
  created_by: string | null;
};
export type Recurring = {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  due_day: number;
  category_id: string | null;
  account_id: string | null;
  paid_by: string | null;
  is_shared: boolean;
  active: boolean;
  created_at: string;
};
export type RecurringOccurrence = {
  id: string;
  recurring_transaction_id: string;
  period_month: string;
  due_date: string;
  status: 'pending' | 'paid' | 'skipped';
  paid_at: string | null;
  transaction_id: string | null;
  details_snapshot?: OccurrenceDetails;
};
export type AccountClass = 'asset' | 'liability';
export type Account = {
  id: string;
  name: string;
  account_type: string;
  account_class: AccountClass;
  opening_balance: number;
  owner_user_id: string | null;
  is_shared: boolean;
  active: boolean;
  institution: string | null;
  credit_limit: number | null;
  statement_day: number | null;
  payment_due_day: number | null;
  apr: number | null;
  minimum_payment: number | null;
  notes: string | null;
};
export type Transfer = {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  transfer_date: string;
  description: string | null;
};
export type FinanceAsset = {
  id: string;
  name: string;
  asset_type: 'property' | 'vehicle' | 'investment' | 'valuable' | 'other';
  estimated_value: number;
  purchase_value: number | null;
  owner_user_id: string | null;
  is_shared: boolean;
  notes: string | null;
  active: boolean;
};
export type NetWorthSnapshot = {
  snapshot_date: string;
  account_assets: number;
  manual_assets: number;
  liabilities: number;
  net_worth: number;
};
export type Member = {user_id: string; role: string; full_name: string};
export type Split = {transaction_id: string; user_id: string; share_amount: number};
export type SplitMethod = 'equal' | 'income' | 'custom';
export type MemberFinanceDraft = {monthly_income: string; custom_share_percent: string};
export type CategoryRuleMethod = 'inherit' | 'equal' | 'income' | 'custom' | 'personal';
export type CategoryRuleDraft = {split_method: CategoryRuleMethod; responsible_user_id: string};
export type HistoryTx = {
  budget_included?: boolean;
  amount: number;
  type: 'income' | 'expense';
  transaction_date: string;
  category_id: string | null;
  description?: string | null;
  original_currency?: string | null;
  original_amount?: number | null;
};
export type HistoryContribution = {amount: number; contribution_date: string};
export type HistoryAllocation = {planned_amount: number; month: string; category_id: string};
export type MonthMetric = {
  key: string;
  label: string;
  income: number;
  expense: number;
  saving: number;
  budget: number;
  balance: number;
  savingRate: number;
};

export function Kpi({label, value, icon, tone}: {label: string; value: string; icon: any; tone: string}) {
  return (
    <div className={'finance-kpi ' + tone}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
export function Progress({value}: {value: number}) {
  return (
    <div className="progress">
      <span style={{width: `${Math.max(0, Math.min(100, value))}%`}} />
    </div>
  );
}
export function EmptyFinance({text, art}: {text: string; art?: IllustrationName}) {
  return (
    <div className={'finance-empty' + (art ? ' finance-empty--art' : '')}>
      {art && <Illustration name={art} size={112} />}
      <span>{text}</span>
    </div>
  );
}

export function TransactionRows({
  txs,
  categoryName,
  memberName,
  onEdit,
  onDelete,
  onDetail,
  receiptCounts,
  readOnly,
  groupByDay = false
}: {
  txs: Tx[];
  categoryName: (x: string | null) => string;
  memberName: (x: string | null) => string;
  onEdit: (tx: Tx) => void;
  onDelete: (tx: Tx) => void;
  onDetail: (tx: Tx) => void;
  receiptCounts: Record<string, number>;
  readOnly: boolean;
  groupByDay?: boolean;
}) {
  const renderRow = (t: Tx) => {
    const category = categoryName(t.category_id),
      count = receiptCounts[t.id] || 0;
    return (
      <div className="transaction-row polished" key={t.id}>
        <span className={'transaction-icon ' + t.type}>{transactionIcon(t.type, category)}</span>
        <div className="transaction-main">
          <button
            type="button"
            className="transaction-detail-link"
            onClick={() => onDetail(t)}
            aria-label={'Ver detalle de ' + t.description}
          >
            {t.description}
          </button>
          <small>
            {category} · {memberName(t.paid_by)}
            {t.is_shared ? ' · Compartido' : ''}
            {t.type === 'expense' && t.budget_included === false ? ' · Fuera del presupuesto' : ''}
            {t.recurring_transaction_id ? ' · Recurrente' : ''}
            {t.transaction_date > isoDate() ? ' · Fecha futura: excluido del balance real' : ''}
          </small>
          {!!count && (
            <small className="transaction-receipt-count">
              <Paperclip />
              {count} comprobante{count === 1 ? '' : 's'}
            </small>
          )}
        </div>
        <div className="transaction-value">
          <b className={t.type}>
            {t.type === 'income' ? '+' : '−'}
            {formatEntryAmount(Number(t.amount), t)}
          </b>
          <small>
            {new Date(t.transaction_date + 'T12:00').toLocaleDateString('es-GT', {day: '2-digit', month: 'short'})}
          </small>
        </div>
        <div className="transaction-actions">
          <button
            type="button"
            className="transaction-action receipt"
            title="Ver detalle y comprobantes"
            aria-label={'Ver detalle y comprobantes de ' + t.description}
            onClick={() => onDetail(t)}
          >
            <Paperclip />
          </button>
          {!readOnly && (
            <>
              <button
                className="transaction-action edit"
                title="Editar movimiento"
                aria-label="Editar movimiento"
                onClick={() => onEdit(t)}
              >
                <Pencil aria-hidden="true" />
                <span>Editar</span>
              </button>
              <button
                className="transaction-action delete"
                title="Eliminar movimiento"
                aria-label="Eliminar movimiento"
                onClick={() => onDelete(t)}
              >
                <Trash2 aria-hidden="true" />
                <span>Eliminar</span>
              </button>
            </>
          )}
        </div>
      </div>
    );
  };
  if (!groupByDay) return <div className="transaction-list">{txs.map(renderRow)}</div>;
  // Grouped by day, newest first, with each day's net result: the way people read a bank statement.
  const days = new Map<string, Tx[]>();
  for (const t of txs) days.set(t.transaction_date, [...(days.get(t.transaction_date) || []), t]);
  return (
    <div className="transaction-list transaction-list--days">
      {[...days.entries()].map(([date, rows]) => {
        const net =
          rows.reduce((n, t) => n + (t.type === 'income' ? 1 : -1) * Math.round(Number(t.amount) * 100), 0) / 100;
        return (
          <section className="transaction-day" key={date} aria-label={dayLabel(date)}>
            <h4 className="transaction-day-head">
              <span>{dayLabel(date)}</span>
              <b className={net > 0 ? 'income' : net < 0 ? 'expense' : ''}>
                {net > 0 ? '+' : ''}
                {formatMoney(net)}
              </b>
            </h4>
            {rows.map(renderRow)}
          </section>
        );
      })}
    </div>
  );
}
/** "Hoy", "Ayer", "Mañana" or "mié 15 oct" for a local YYYY-MM-DD date. */
export function dayLabel(date: string) {
  const today = isoDate(),
    d = new Date(date + 'T12:00'),
    t = new Date(today + 'T12:00'),
    diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === -1) return 'Ayer';
  if (diff === 1) return 'Mañana';
  const text = d.toLocaleDateString('es-GT', {weekday: 'short', day: 'numeric', month: 'short'}).replace(/\./g, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ComparisonKpi({
  label,
  value,
  delta,
  goodWhenUp
}: {
  label: string;
  value: number;
  delta: number;
  goodWhenUp: boolean;
}) {
  const up = delta > 0,
    neutral = Math.abs(delta) < 0.05,
    good = neutral ? true : up === goodWhenUp;
  return (
    <div className="comparison-kpi">
      <div>
        <small>{label}</small>
        <strong>{currency(value)}</strong>
      </div>
      <span className={neutral ? 'neutral' : good ? 'good' : 'bad'}>
        {neutral ? '—' : up ? <TrendingUp /> : <TrendingDown />}
        {neutral ? 'Sin cambio' : Math.abs(delta) >= 1000 ? '>999%' : Math.abs(delta).toFixed(1) + '%'}
      </span>
    </div>
  );
}

export function MonthlyBars({data}: {data: MonthMetric[]}) {
  return <InteractiveTrend data={data} />;
}

export function BalanceChart({data}: {data: MonthMetric[]}) {
  const max = Math.max(1, ...data.map(row => Math.abs(row.balance)));
  return (
    <div className="balance-chart">
      {data.map(row => (
        <div className="balance-column" key={row.key}>
          <div className="balance-track">
            <span
              className={row.balance >= 0 ? 'positive' : 'negative'}
              style={{
                height: (Math.abs(row.balance) / max) * 48 + '%',
                bottom: row.balance >= 0 ? '50%' : 'auto',
                top: row.balance < 0 ? '50%' : 'auto'
              }}
              title={currency(row.balance)}
            />
            <i />
          </div>
          <small>{row.label}</small>
        </div>
      ))}
    </div>
  );
}

export function SavingsRateChart({data}: {data: MonthMetric[]}) {
  const max = Math.max(10, ...data.map(row => Math.abs(row.savingRate)));
  return (
    <div className="savings-rate-chart">
      {data.map(row => (
        <div key={row.key}>
          <div className="saving-rate-track">
            <span
              style={{
                height: Math.min(100, (Math.abs(row.savingRate) / max) * 100) + '%',
                background: row.savingRate < 0 ? 'var(--nh-chart-danger)' : undefined
              }}
            />
            <b>{Math.round(row.savingRate)}%</b>
          </div>
          <small>{row.label}</small>
        </div>
      ))}
    </div>
  );
}

export function CategoryComparison({
  rows
}: {
  rows: {id: string; name: string; current: number; previous: number; delta: number}[];
}) {
  const max = Math.max(1, ...rows.flatMap(row => [row.current, row.previous]));
  if (!rows.length) return <EmptyFinance text="Aún no hay suficientes movimientos para comparar categorías." />;
  return (
    <div className="category-comparison">
      <div className="category-comparison-legend">
        <span>
          <i className="previous" />
          Mes anterior
        </span>
        <span>
          <i className="current" />
          Mes actual
        </span>
      </div>
      {rows.map(row => (
        <div className="category-compare-row" key={row.id}>
          <div>
            <strong>{row.name}</strong>
            <small className={row.delta > 0 ? 'negative' : row.delta < 0 ? 'positive' : ''}>
              {row.previous === 0 && row.current > 0
                ? 'Nueva'
                : Math.abs(row.delta) < 0.05
                  ? 'Sin cambio'
                  : (row.delta > 0 ? '+' : '') + row.delta.toFixed(0) + '%'}
            </small>
          </div>
          <div className="category-bars">
            <span className="previous" style={{width: (row.previous / max) * 100 + '%'}} />
            <span className="current" style={{width: (row.current / max) * 100 + '%'}} />
          </div>
          <div>
            <small>{currency(row.previous)}</small>
            <strong>{currency(row.current)}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GoalCard({
  goal,
  saved,
  busy,
  readOnly,
  onContribute,
  onWithdraw,
  onEdit,
  onArchive,
  onDelete
}: {
  goal: Goal;
  saved: number;
  busy: boolean;
  readOnly: boolean;
  onContribute: (id: string, amount: number) => Promise<boolean>;
  onWithdraw?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}) {
  const [amount, setAmount] = useState('');
  const progress = pct(saved, Number(goal.target_amount));
  return (
    <div className="goal-card">
      <div className="goal-head">
        <span className="studio-ring" style={{'--ring-progress': progress + '%'} as React.CSSProperties}>
          <Target />
        </span>
        <div>
          <strong>{goal.name}</strong>
          {!goal.active && <small className="goal-archived-label">Archivada · conserva su historial</small>}
          <small>
            {goal.target_date
              ? 'Meta ' + new Date(goal.target_date + 'T12:00').toLocaleDateString('es-GT')
              : 'Sin fecha límite'}
          </small>
        </div>
      </div>
      <div className="goal-amount">
        <strong>{currency(saved)}</strong>
        <span>de {currency(Number(goal.target_amount))}</span>
      </div>
      <Progress value={progress} />
      <div className="goal-footer">
        <small>{progress}% completado</small>
        {!readOnly && goal.active && (
          <div>
            <input
              aria-label={'Nuevo aporte para ' + goal.name}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Aporte"
            />
            <button
              aria-label={'Agregar aporte a ' + goal.name}
              disabled={busy}
              onClick={async () => {
                if (await onContribute(goal.id, Number(amount))) setAmount('');
              }}
            >
              +
            </button>
            {onWithdraw && (
              <button type="button" disabled={busy} onClick={onWithdraw}>
                Retirar
              </button>
            )}
          </div>
        )}
      </div>
      {!readOnly && (onEdit || onArchive || onDelete) && (
        <div className="goal-management-actions">
          {onEdit && (
            <button type="button" disabled={busy} onClick={onEdit} aria-label={'Editar meta ' + goal.name}>
              <Pencil aria-hidden="true" size={16} />
              Editar
            </button>
          )}
          {onArchive && (
            <button
              type="button"
              disabled={busy}
              onClick={onArchive}
              aria-label={(goal.active ? 'Archivar meta ' : 'Reactivar meta ') + goal.name}
            >
              {goal.active ? <Archive aria-hidden="true" size={16} /> : <RotateCcw aria-hidden="true" size={16} />}
              {goal.active ? 'Archivar' : 'Reactivar'}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              disabled={busy}
              className="goal-delete"
              onClick={onDelete}
              aria-label={'Eliminar meta ' + goal.name}
            >
              <Trash2 aria-hidden="true" size={16} />
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AmountField({
  householdRate,
  initial
}: {
  householdRate: number;
  initial?: Pick<Tx, 'amount' | 'original_currency' | 'original_amount' | 'exchange_rate'>;
}) {
  const usd = initial?.original_currency === 'USD' && Number(initial.original_amount) > 0,
    box = useRef<HTMLDivElement>(null);
  const start = {
    currency: usd ? 'USD' : 'GTQ',
    amount: initial ? String(usd ? Number(initial.original_amount) : Number(initial.amount)) : '',
    rate: String(usd && Number(initial?.exchange_rate) > 0 ? Number(initial!.exchange_rate) : householdRate)
  };
  const [view, setView] = useState(start);
  // Inputs stay uncontrolled so drafts can restore them; the hint re-reads the DOM on any interaction or reset.
  const read = () => {
    const el = box.current;
    if (!el) return;
    const value = (name: string) =>
      (el.querySelector('[name="' + name + '"]') as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
    setView({currency: value('currency') || 'GTQ', amount: value('amount'), rate: value('exchange_rate')});
  };
  useEffect(() => {
    const form = box.current?.closest('form');
    if (!form) return;
    const onReset = () => window.setTimeout(read, 0);
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, []);
  const dollars = view.currency === 'USD',
    amount = Number(view.amount),
    rate = Number(String(view.rate).replace(',', '.'));
  const preview = dollars && amount > 0 && rate >= 1 && rate <= 100 ? usdToQuetzales(amount, rate) : null;
  return (
    <div className="currency-amount" ref={box} onChange={read} onFocusCapture={read}>
      <div className="two">
        <label>
          Monto
          <input
            name="amount"
            type="number"
            min=".01"
            step=".01"
            placeholder="0.00"
            defaultValue={start.amount}
            required
          />
        </label>
        <label>
          Moneda
          <select name="currency" defaultValue={start.currency}>
            <option value="GTQ">Q · Quetzales</option>
            <option value="USD">US$ · Dólares</option>
          </select>
        </label>
      </div>
      <label hidden={!dollars}>
        Tipo de cambio (Q por US$)
        <input name="exchange_rate" type="number" inputMode="decimal" step="0.0001" defaultValue={start.rate} />
      </label>
      <p className="currency-amount-hint" aria-live="polite">
        {dollars ? (
          preview !== null ? (
            <>
              ≈ <b>{formatMoney(preview)}</b> al tipo de cambio Q {rate}. Se guarda en quetzales junto con el monto en
              dólares.
            </>
          ) : (
            'Escribe el monto en dólares y un tipo de cambio entre 1 y 100.'
          )
        ) : (
          'Monto en quetzales.'
        )}
      </p>
    </div>
  );
}

export function transactionIcon(type: 'income' | 'expense', category: string) {
  if (type === 'income') return <ArrowDownLeft />;
  const key = category.toLocaleLowerCase('es-GT');
  if (key.includes('vivienda')) return <ModuleIcon name="home" />;
  if (key.includes('aliment')) return <ShoppingCart />;
  if (key.includes('transport')) return <Car />;
  if (key.includes('servicio')) return <ReceiptText />;
  if (key.includes('salud')) return <ModuleIcon name="health" />;
  if (key.includes('educa')) return <GraduationCap />;
  if (key.includes('ahorro')) return <PiggyBank />;
  if (key.includes('viaje')) return <Plane />;
  if (key.includes('entreten')) return <Sparkles />;
  return <ModuleIcon name="finance" />;
}
export function statusLabel(status: string) {
  return status === 'paid'
    ? 'Pagado'
    : status === 'overdue'
      ? 'Vencido'
      : status === 'skipped'
        ? 'Omitido'
        : 'Pendiente';
}
export function splitMethodLabel(method: SplitMethod) {
  return method === 'income'
    ? 'Proporcional a ingresos'
    : method === 'custom'
      ? 'Porcentaje personalizado'
      : 'Partes iguales';
}
export function categoryRuleLabel(method: CategoryRuleMethod, globalMethod: SplitMethod) {
  return method === 'inherit'
    ? `General · ${splitMethodLabel(globalMethod)}`
    : method === 'equal'
      ? 'Partes iguales'
      : method === 'income'
        ? 'Según ingresos'
        : method === 'custom'
          ? 'Porcentaje personalizado'
          : 'Una persona cubre 100%';
}
export function NetWorthChart({data}: {data: NetWorthSnapshot[]}) {
  if (!data.length) return <EmptyFinance text="El histórico comenzará a construirse desde hoy." />;
  const rows = data.slice(-90),
    values = rows.map(x => Number(x.net_worth)),
    min = Math.min(...values, 0),
    max = Math.max(...values, 1),
    range = Math.max(1, max - min);
  return (
    <div className="net-worth-chart">
      <div className="net-worth-chart-bars">
        {rows.map((row, index) => {
          const h = Math.max(4, ((Number(row.net_worth) - min) / range) * 100);
          return (
            <div
              className="net-worth-chart-col"
              key={row.snapshot_date}
              title={
                new Date(row.snapshot_date + 'T12:00').toLocaleDateString('es-GT') +
                ' · ' +
                currency(Number(row.net_worth))
              }
            >
              <span style={{height: h + '%'}} />
              <small>
                {index === 0 || index === rows.length - 1 || index % Math.max(1, Math.floor(rows.length / 4)) === 0
                  ? new Date(row.snapshot_date + 'T12:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'short'})
                  : ''}
              </small>
            </div>
          );
        })}
      </div>
      <div className="net-worth-chart-summary">
        <span>
          Inicio <b>{currency(Number(rows[0].net_worth))}</b>
        </span>
        <span>
          Actual{' '}
          <b
            className={
              Number(rows[rows.length - 1]?.net_worth || 0) >= Number(rows[0].net_worth) ? 'positive' : 'negative'
            }
          >
            {currency(Number(rows[rows.length - 1]?.net_worth || 0))}
          </b>
        </span>
      </div>
    </div>
  );
}
export function accountIcon(type: string) {
  if (type === 'credit') return <CreditCard />;
  if (type === 'loan' || type === 'mortgage') return <CircleDollarSign />;
  if (type === 'investment') return <TrendingUp />;
  if (type === 'cash') return <ModuleIcon name="finance" />;
  if (type === 'savings') return <PiggyBank />;
  return <Landmark />;
}
export function assetIcon(type: FinanceAsset['asset_type']) {
  if (type === 'property') return <Building2 />;
  if (type === 'vehicle') return <Car />;
  if (type === 'investment') return <TrendingUp />;
  if (type === 'valuable') return <Gem />;
  return <ModuleIcon name="finance" />;
}
export function assetTypeName(type: FinanceAsset['asset_type']) {
  return (
    (
      {
        property: 'Propiedad',
        vehicle: 'Vehículo',
        investment: 'Inversión',
        valuable: 'Objeto de valor',
        other: 'Otro activo'
      } as Record<string, string>
    )[type] || 'Activo'
  );
}
export function accountTypeName(type: string) {
  return (
    (
      {
        cash: 'Efectivo',
        checking: 'Cuenta bancaria',
        savings: 'Ahorro',
        investment: 'Inversión',
        credit: 'Tarjeta de crédito',
        loan: 'Préstamo',
        mortgage: 'Hipoteca',
        other: 'Otra'
      } as Record<string, string>
    )[type] || 'Cuenta'
  );
}
