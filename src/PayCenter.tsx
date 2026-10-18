import {FormEvent, useEffect, useMemo, useState} from 'react';
import {Lock, RotateCcw} from 'lucide-react';
import WorkspaceHeading from './WorkspaceHeading';
import WorkspaceTitle from './WorkspaceTitle';
import ModuleLoading from './ModuleLoading';
import {supabase} from './lib/supabase';
import {formatMoney} from './lib/money';
import {localISODate} from './lib/localDate';
import {
  EXTRA_PLAN_LABELS,
  IGSS_EMPLOYEE_RATE,
  INCENTIVE_BONUS,
  ISR_PERSONAL_DEDUCTIONS_CAP,
  VERIFIED_PAYROLL_YEAR,
  daysUntil,
  nextDue,
  netPay,
  normalizeExtraPlan,
  suggestedExtraPlan,
  upcomingExtraPays,
  type ExtraPay,
  type ExtraPlan
} from './lib/guatemalaPay';
import {Amount, Button, EmptyState, Illustration} from './ui';
import './styles/modules/pay.css';

type Household = {id: string; name: string};
type Profile = {
  salary: number;
  incentive: number;
  other_taxable: number;
  personal_deductions: number;
  igss: boolean;
  start_date: string | null;
  bono14_plan: (ExtraPlan & {year?: number}) | null;
  aguinaldo_plan: (ExtraPlan & {year?: number}) | null;
};
const EMPTY: Profile = {
  salary: 0,
  incentive: INCENTIVE_BONUS,
  other_taxable: 0,
  personal_deductions: 0,
  igss: true,
  start_date: null,
  bono14_plan: null,
  aguinaldo_plan: null
};
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const longDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'long', year: 'numeric'});
const shortDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('es-GT', {day: 'numeric', month: 'short', year: 'numeric'});
const inDays = (n: number) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : 'en ' + n + ' días');

export default function PayCenter({household}: {household: Household; readOnly?: boolean}) {
  const today = localISODate();
  const [userId, setUserId] = useState<string | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [hasDebt, setHasDebt] = useState(false),
    [loading, setLoading] = useState(true),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [loadFailed, setLoadFailed] = useState(false),
    [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const {
        data: {user}
      } = await supabase.auth.getUser();
      if (!alive) return;
      setUserId(user?.id ?? null);
      const [profileR, debtR] = await Promise.all([
        supabase
          .from('pay_profiles')
          .select('salary,incentive,other_taxable,personal_deductions,igss,start_date,bono14_plan,aguinaldo_plan')
          .eq('household_id', household.id)
          .eq('user_id', user?.id ?? '')
          .maybeSingle(),
        supabase
          .from('finance_accounts')
          .select('id', {count: 'exact', head: true})
          .eq('household_id', household.id)
          .eq('account_class', 'liability')
          .eq('active', true)
      ]);
      if (!alive) return;
      setLoadFailed(Boolean(profileR.error));
      const row = profileR.data as Partial<Profile> | null;
      setProfile(
        row
          ? {
              ...EMPTY,
              ...row,
              salary: Number(row.salary) || 0,
              incentive: Number(row.incentive ?? INCENTIVE_BONUS),
              other_taxable: Number(row.other_taxable) || 0,
              personal_deductions: Number(row.personal_deductions) || 0
            }
          : null
      );
      setEditing(!row);
      setHasDebt((debtR.count || 0) > 0);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [household.id, attempt]);

  async function save(next: Profile, done = 'Guardado.') {
    if (!userId) return;
    setBusy(true);
    setMessage('');
    const {error} = await supabase
      .from('pay_profiles')
      .upsert({household_id: household.id, user_id: userId, ...next}, {onConflict: 'household_id,user_id'});
    setBusy(false);
    if (error) {
      setMessage('No se pudo guardar. Inténtalo de nuevo.');
      return false;
    }
    setProfile(next);
    setMessage(done);
    return true;
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const next: Profile = {
      ...(profile || EMPTY),
      salary: num(f.get('salary')),
      incentive: num(f.get('incentive')),
      other_taxable: num(f.get('other_taxable')),
      personal_deductions: num(f.get('personal_deductions')),
      igss: f.get('igss') === 'on',
      start_date: String(f.get('start_date') || '') || null
    };
    if (next.salary <= 0) {
      setMessage('Escribe tu sueldo base mensual para calcular.');
      return;
    }
    if (await save(next, 'Tus datos quedaron guardados. Solo tú puedes verlos.')) setEditing(false);
  }

  if (loading) return <ModuleLoading label="Cargando tu sueldo" />;
  const year = Math.min(Number(today.slice(0, 4)), VERIFIED_PAYROLL_YEAR);

  return (
    <section className="pay-center">
      <WorkspaceHeading>
        <WorkspaceTitle
          module="pay"
          eyebrow="Sueldo y prestaciones"
          title="Sueldo y prestaciones"
          description="Calcula cuánto te queda de sueldo y planea el Bono 14 y el aguinaldo antes de que lleguen."
        />
      </WorkspaceHeading>
      {message && (
        <div className="finance-message" role="status">
          {message}
        </div>
      )}

      {loadFailed ? (
        <div className="pay-panel">
          <EmptyState
            art="savings"
            title="No se pudieron cargar tus datos"
            action={
              <Button variant="primary" onClick={() => setAttempt(n => n + 1)}>
                Reintentar
              </Button>
            }
          >
            Revisa tu conexión. Tus datos guardados siguen a salvo.
          </EmptyState>
        </div>
      ) : profile && !editing ? (
        <NetPayCard profile={profile} year={year} onEdit={() => setEditing(true)} />
      ) : (
        <ProfileForm
          profile={profile}
          busy={busy}
          onSubmit={submit}
          onCancel={profile ? () => setEditing(false) : undefined}
        />
      )}

      {!loadFailed && profile && profile.salary > 0 && (
        <div className="pay-extras">
          {upcomingExtraPays(profile.salary, profile.start_date, today).map((pay, i) => (
            <ExtraPayCard
              key={pay.kind}
              pay={pay}
              today={today}
              first={i === 0}
              hasDebt={hasDebt}
              saved={profile[pay.kind === 'bono14' ? 'bono14_plan' : 'aguinaldo_plan']}
              busy={busy}
              onSave={plan =>
                save(
                  {
                    ...profile,
                    [pay.kind === 'bono14' ? 'bono14_plan' : 'aguinaldo_plan']: {
                      ...plan,
                      year: Number(pay.payDate.slice(0, 4))
                    }
                  },
                  'Plan de ' + pay.label + ' guardado.'
                )
              }
            />
          ))}
        </div>
      )}

      <p className="pay-footnote">
        Reglas del cálculo de sueldo: {year}.{' '}
        {Number(today.slice(0, 4)) > VERIFIED_PAYROLL_YEAR &&
          'La actualización del ISR del año actual está pendiente; este cálculo usa las reglas indicadas. '}
        <Lock aria-hidden="true" /> Tu sueldo es solo tuyo: nadie más del hogar lo ve y no entra en los respaldos. Los
        cálculos siguen el Decreto 10-2012 (ISR), los Decretos 42-92 y 76-78 (Bono 14 y aguinaldo) y la cuota laboral
        del IGSS de {(IGSS_EMPLOYEE_RATE * 100).toFixed(2)}%. Son estimaciones: tu planilla tiene la última palabra.
      </p>
    </section>
  );
}

function ProfileForm({
  profile,
  busy,
  onSubmit,
  onCancel
}: {
  profile: Profile | null;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}) {
  const p = profile || EMPTY;
  return (
    <form className="pay-panel pay-form finance-form" onSubmit={onSubmit}>
      {!profile && (
        <EmptyState art="savings" title="¿Cuánto te queda de tu sueldo?" compact>
          Escribe tu sueldo y te mostramos lo que llega a tu cuenta, cuánto será tu Bono 14 y tu aguinaldo, y cuándo.
        </EmptyState>
      )}
      <div className="two">
        <label>
          Sueldo base mensual
          <input
            name="salary"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            defaultValue={p.salary || ''}
            required
          />
        </label>
        <label>
          Bonificación incentivo
          <input name="incentive" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={p.incentive} />
        </label>
      </div>
      <div className="two">
        <label>
          Fecha en que empezaste a trabajar ahí
          <input name="start_date" type="date" defaultValue={p.start_date || ''} />
        </label>
        <label>
          Comisiones u horas extra al mes
          <input
            name="other_taxable"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            defaultValue={p.other_taxable || ''}
          />
        </label>
      </div>
      <label>
        Facturas y otras deducciones al año (planilla del IVA, hasta {formatMoney(ISR_PERSONAL_DEDUCTIONS_CAP)})
        <input
          name="personal_deductions"
          type="number"
          inputMode="decimal"
          min="0"
          max={ISR_PERSONAL_DEDUCTIONS_CAP}
          step="0.01"
          defaultValue={p.personal_deductions || ''}
        />
      </label>
      <label className="check-line">
        <input name="igss" type="checkbox" defaultChecked={p.igss} /> Me descuentan IGSS
      </label>
      <div className="pay-form-actions">
        {onCancel && (
          <Button variant="quiet" type="button" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Calcular y guardar'}
        </Button>
      </div>
    </form>
  );
}

function NetPayCard({profile, year, onEdit}: {profile: Profile; year: number; onEdit: () => void}) {
  const r = netPay({
    salary: profile.salary,
    incentive: profile.incentive,
    otherTaxable: profile.other_taxable,
    personalDeductions: profile.personal_deductions,
    igss: profile.igss,
    year
  });
  const rows: [string, number, string?][] = [
    ['Sueldo base', profile.salary],
    ...(profile.incentive ? ([['Bonificación incentivo', profile.incentive]] as [string, number][]) : []),
    ...(profile.other_taxable ? ([['Comisiones u horas extra', profile.other_taxable]] as [string, number][]) : []),
    ...(profile.igss
      ? ([['IGSS (' + (IGSS_EMPLOYEE_RATE * 100).toFixed(2) + '%)', -r.igss]] as [string, number][])
      : []),
    ['ISR retenido', -r.isr, r.isr === 0 ? 'Tu sueldo no llega al mínimo que paga ISR' : undefined]
  ];
  return (
    <article className="pay-panel pay-net">
      <div className="pay-net-lead">
        <p className="pay-label">Te llega cada mes</p>
        <strong className="pay-figure">
          <Amount value={r.net} animate />
        </strong>
        <p className="pay-note">
          De {formatMoney(r.gross)} brutos. Al año pagas {formatMoney(r.yearlyIsr)} de ISR, el{' '}
          {(r.effectiveRate * 100).toFixed(1)}% de lo que ganas.
        </p>
        <Button variant="secondary" onClick={onEdit}>
          Cambiar mis datos
        </Button>
      </div>
      <dl className="pay-breakdown">
        {rows.map(([label, value, hint]) => (
          <div key={label}>
            <dt>
              {label}
              {hint && <small>{hint}</small>}
            </dt>
            <dd className={value < 0 ? 'minus' : ''}>{value < 0 ? '−' + formatMoney(-value) : formatMoney(value)}</dd>
          </div>
        ))}
        <div className="pay-total">
          <dt>Líquido</dt>
          <dd>{formatMoney(r.net)}</dd>
        </div>
      </dl>
    </article>
  );
}

function ExtraPayCard({
  pay,
  today,
  first,
  hasDebt,
  saved,
  busy,
  onSave
}: {
  pay: ExtraPay;
  today: string;
  first: boolean;
  hasDebt: boolean;
  saved: (ExtraPlan & {year?: number}) | null;
  busy: boolean;
  onSave: (plan: ExtraPlan) => void;
}) {
  const payYear = Number(pay.payDate.slice(0, 4));
  const initial = useMemo(
    () => (saved && saved.year === payYear ? saved : suggestedExtraPlan(pay.kind, pay.amount, hasDebt)),
    [saved, payYear, pay.kind, pay.amount, hasDebt]
  );
  const [draft, setDraft] = useState<ExtraPlan>(initial);
  useEffect(() => setDraft(initial), [initial]);
  const plan = normalizeExtraPlan(draft, pay.amount);
  const januaryHalf = Boolean(pay.secondPayDate) && today > pay.payDate;
  const days = daysUntil(today, nextDue(pay, today));
  const partial = pay.daysWorked < pay.periodDays;
  const parts = (['debt', 'saving', 'planned', 'free'] as const).filter(k => plan[k] > 0);
  const dirty =
    !saved || saved.year !== payYear || (['debt', 'saving', 'planned'] as const).some(k => saved[k] !== plan[k]);

  return (
    <article className={'pay-panel pay-extra' + (first ? ' pay-extra--next' : '')}>
      <div className="pay-extra-head">
        {first && <Illustration name="kite" size={96} />}
        <div>
          <p className="pay-label">
            {pay.label}
            {januaryHalf ? ' · segunda mitad' : ''} · {inDays(days)}
          </p>
          <strong className="pay-figure pay-figure--sm">
            <Amount value={pay.amount} />
          </strong>
          <p className="pay-note">
            {januaryHalf
              ? 'Si tu empresa lo divide, la segunda mitad (' +
                formatMoney(Math.round(pay.amount * 50) / 100) +
                ') llega a más tardar el ' +
                longDate(pay.secondPayDate!) +
                '.'
              : pay.kind === 'aguinaldo'
                ? 'Por ley, la mitad a más tardar el ' +
                  longDate(pay.payDate) +
                  ' y la otra mitad en la segunda quincena de enero. Muchas empresas lo pagan completo en diciembre.'
                : 'Se paga a más tardar el ' + longDate(pay.payDate) + '.'}
            {partial &&
              ' Es proporcional: cuenta ' + pay.daysWorked + ' de ' + pay.periodDays + ' días trabajados del periodo.'}
            {pay.taxableExcess > 0 && ' Lo que pase de un sueldo (' + formatMoney(pay.taxableExcess) + ') paga ISR.'}
          </p>
          <p className="pay-period">
            Periodo del {shortDate(pay.periodStart)} al {shortDate(pay.periodEnd)}
          </p>
        </div>
      </div>

      {pay.amount > 0 && (
        <div className="pay-plan">
          <div className="pay-plan-head">
            <h3>¿A dónde va?</h3>
            <Button
              variant="quiet"
              icon={<RotateCcw aria-hidden="true" />}
              onClick={() => setDraft(suggestedExtraPlan(pay.kind, pay.amount, hasDebt))}
            >
              Sugerir reparto
            </Button>
          </div>
          <div className="pay-split" aria-hidden="true">
            {parts.map(k => (
              <i key={k} className={'pay-split--' + k} style={{flexGrow: plan[k]}} />
            ))}
          </div>
          <div className="pay-plan-fields">
            {(['debt', 'saving', 'planned'] as const).map(k => (
              <label key={k} className={'pay-plan-field pay-plan-field--' + k}>
                <span>{EXTRA_PLAN_LABELS[k]}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={draft[k] || ''}
                  onChange={e => setDraft({...draft, [k]: num(e.target.value)})}
                />
              </label>
            ))}
            <div className="pay-plan-field pay-plan-field--free">
              <span>{EXTRA_PLAN_LABELS.free}</span>
              <b>{formatMoney(plan.free)}</b>
            </div>
          </div>
          {pay.kind === 'aguinaldo' && plan.planned > 0 && (
            <p className="pay-hint">Los gastos de temporada incluyen fin de año y la inscripción y útiles de enero.</p>
          )}
          {dirty && (
            <Button variant="primary" disabled={busy} onClick={() => onSave(plan)}>
              Guardar plan de {pay.label}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
