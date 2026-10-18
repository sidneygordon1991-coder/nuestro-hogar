import {lazy, Suspense, useEffect, useRef, useState} from 'react';
const DemoPreview = lazy(() => import('./DemoPreview'));
import {ArrowLeft, ArrowRight, CheckCircle2, Copy, SlidersHorizontal, Sparkles, X} from 'lucide-react';
import {supabase} from './lib/supabase';
import {platformError} from './lib/platform';
import {formatMoney} from './lib/money';
type Household = {id: string; name: string; invite_code: string};
type Income = {user_id: string; name: string; monthly_income: string};
type Budget = {id: string | null; name: string; budget_group: string; planned_amount: string};
const templates: Budget[] = [
  ['Casa', 'fixed'],
  ['Servicios', 'fixed'],
  ['Alimentación', 'variable'],
  ['Transporte', 'variable'],
  ['Salud', 'variable'],
  ['Ahorro', 'saving']
].map(([name, budget_group]) => ({id: null, name, budget_group, planned_amount: '0'}));
const money = formatMoney;
export default function HouseholdWelcome({
  household,
  canManage,
  onChanged
}: {
  household: Household;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [completed, setCompleted] = useState(true),
    [open, setOpen] = useState(false),
    [step, setStep] = useState(0),
    [incomes, setIncomes] = useState<Income[]>([]),
    [budgets, setBudgets] = useState<Budget[]>([]),
    [method, setMethod] = useState('equal'),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const [demo, setDemo] = useState(false);
  const submission = useRef('');
  const month = useRef('');
  const [inviteCode, setInviteCode] = useState(household.invite_code);
  useEffect(() => {
    setInviteCode(household.invite_code);
  }, [household.id, household.invite_code]);
  // Familia can rotate the code while this component stays mounted: listen for it and re-read it from the server when the invite step opens.
  useEffect(() => {
    const rotated = (e: Event) => {
      const d = (e as CustomEvent<{householdId?: string; code?: string}>).detail;
      if (d?.code && (!d.householdId || d.householdId === household.id)) setInviteCode(d.code);
    };
    window.addEventListener('nh:invite-rotated', rotated);
    return () => window.removeEventListener('nh:invite-rotated', rotated);
  }, [household.id]);
  useEffect(() => {
    if (!open || step !== 2) return;
    let live = true;
    supabase
      .from('households')
      .select('invite_code')
      .eq('id', household.id)
      .maybeSingle()
      .then(({data}) => {
        if (live && data?.invite_code) setInviteCode(String(data.invite_code));
      });
    return () => {
      live = false;
    };
  }, [open, step, household.id]);
  useEffect(() => {
    let live = true;
    if (!canManage) return;
    supabase
      .from('household_setup_state')
      .select('completed_at')
      .eq('household_id', household.id)
      .maybeSingle()
      .then(({data}) => {
        if (live && data) setCompleted(Boolean(data.completed_at));
      });
    return () => {
      live = false;
    };
  }, [household.id, canManage]);
  useEffect(() => {
    const start = () => {
      if (canManage) void begin();
    };
    window.addEventListener('nh:setup', start);
    return () => window.removeEventListener('nh:setup', start);
  }, [household.id, canManage]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setOpen(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, busy]);
  async function begin() {
    if (!canManage) return;
    setIncomes([]);
    setBudgets([]);
    setOpen(true);
    setStep(0);
    setLoading(true);
    setError('');
    setSuccess('');
    submission.current = crypto.randomUUID();
    const now = new Date();
    month.current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    try {
      const results = await Promise.all([
        supabase.from('household_members').select('user_id').eq('household_id', household.id),
        supabase.from('finance_member_settings').select('user_id,monthly_income').eq('household_id', household.id),
        supabase
          .from('budget_categories')
          .select('id,name,budget_group')
          .eq('household_id', household.id)
          .order('created_at'),
        supabase
          .from('budget_allocations')
          .select('category_id,planned_amount')
          .eq('household_id', household.id)
          .eq('month', month.current),
        supabase
          .from('finance_household_settings')
          .select('split_method')
          .eq('household_id', household.id)
          .maybeSingle()
      ]);
      for (const r of results) if (r.error) throw r.error;
      const members = results[0].data as {user_id: string}[],
        incomeRows = results[1].data as {user_id: string; monthly_income: number}[],
        categories = results[2].data as {id: string; name: string; budget_group: string}[],
        allocationRows = results[3].data as {category_id: string; planned_amount: number}[];
      const profiles = await supabase
        .from('profiles')
        .select('id,full_name')
        .in(
          'id',
          members.map(m => m.user_id)
        );
      if (profiles.error) throw profiles.error;
      setIncomes(
        members.map(m => ({
          user_id: m.user_id,
          name: profiles.data.find(p => p.id === m.user_id)?.full_name || 'Integrante',
          monthly_income: String(incomeRows.find(i => i.user_id === m.user_id)?.monthly_income || 0)
        }))
      );
      setBudgets(
        categories.length
          ? categories.map(c => ({
              ...c,
              planned_amount: String(allocationRows.find(a => a.category_id === c.id)?.planned_amount || 0)
            }))
          : templates.map(b => ({...b}))
      );
      setMethod((results[4].data as {split_method: string} | null)?.split_method || 'equal');
    } catch (err) {
      setError(platformError(err));
    } finally {
      setLoading(false);
    }
  }
  // One person has nobody to split with: the split method and the invitation become optional extras.
  const shared = incomes.length > 1;
  const income = incomes.reduce((n, m) => n + Number(m.monthly_income || 0), 0),
    budget = budgets.reduce((n, c) => n + Number(c.planned_amount || 0), 0);
  function next() {
    const fields = step === 0 ? incomes.map(m => m.monthly_income) : budgets.map(b => b.planned_amount);
    if (fields.some(s => !Number.isFinite(Number(s)) || Number(s) < 0 || Number(s) > 999999999.99)) {
      setError('Usa montos entre cero y Q999,999,999.99.');
      return;
    }
    if (step === 0 && method === 'income' && income <= 0) {
      setError('Ingresa al menos un ingreso para dividir los aportes proporcionalmente.');
      return;
    }
    setError('');
    setStep(s => Math.min(2, s + 1));
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const {error} = await supabase.rpc('save_household_setup', {
        p_household_id: household.id,
        p_submission_id: submission.current,
        p_month: month.current,
        p_split_method: method,
        p_incomes: incomes.map(m => ({user_id: m.user_id, monthly_income: Number(m.monthly_income || 0)})),
        p_budgets: budgets.map(b => ({...b, planned_amount: Number(b.planned_amount || 0)}))
      });
      if (error) throw error;
      setCompleted(true);
      setOpen(false);
      setSuccess('Configuración guardada. Puedes ajustar los valores desde Finanzas.');
      onChanged();
    } catch (err) {
      setError(platformError(err));
    } finally {
      setBusy(false);
    }
  }
  if (!canManage) return null;
  return (
    <>
      {!completed && (
        <section className="sharing-welcome-banner">
          <Sparkles />
          <div>
            <strong>Empieza en tres pasos</strong>
            <p>Tus ingresos, tu presupuesto del mes y listo. Puedes ajustarlo cuando quieras.</p>
          </div>
          <div className="sharing-welcome-actions">
            <button className="sharing-primary" onClick={begin}>
              Configurar hogar
            </button>
            <button type="button" className="sharing-secondary" onClick={() => setDemo(true)}>
              Ver un ejemplo
            </button>
          </div>
        </section>
      )}
      {demo && (
        <Suspense fallback={null}>
          <DemoPreview onClose={() => setDemo(false)} onStart={() => void begin()} />
        </Suspense>
      )}
      {success && (
        <p className="sharing-success" role="status">
          {success}
        </p>
      )}
      {open && (
        <div className="modal-backdrop">
          <section
            className="finance-modal sharing-wizard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
          >
            <div className="sharing-dialog-head">
              <div>
                <p className="eyebrow">
                  {household.name} · Paso {step + 1} de 3
                </p>
                <h2 id="welcome-title">
                  {[shared ? 'Ingresos y aportes' : 'Tus ingresos', 'Presupuesto del mes', 'Revisa y comienza'][step]}
                </h2>
              </div>
              <button disabled={busy} onClick={() => setOpen(false)} aria-label="Cerrar bienvenida">
                <X />
              </button>
            </div>
            <div className="sharing-steps">
              {['Ingresos', 'Presupuesto', 'Revisión'].map((label, index) => (
                <span className={index === step ? 'active' : ''} key={label}>
                  {index + 1}. {label}
                </span>
              ))}
            </div>
            {loading ? (
              <p role="status">Cargando la configuración actual…</p>
            ) : (
              <>
                {step === 0 && (
                  <>
                    <p className="muted">
                      Estos ingresos son una referencia para planificar. No crean movimientos de dinero.
                    </p>
                    <div className="sharing-fields">
                      {incomes.map((m, index) => (
                        <label key={m.user_id}>
                          Ingreso mensual de {m.name}
                          <input
                            type="number"
                            min="0"
                            max="999999999.99"
                            step="0.01"
                            value={m.monthly_income}
                            onChange={e =>
                              setIncomes(rows =>
                                rows.map((r, i) => (i === index ? {...r, monthly_income: e.target.value} : r))
                              )
                            }
                          />
                        </label>
                      ))}
                      {shared && (
                        <label>
                          Cómo repartir los gastos compartidos
                          <select value={method} onChange={e => setMethod(e.target.value)}>
                            <option value="equal">Partes iguales</option>
                            <option value="income">Según ingresos</option>
                            {method === 'custom' && (
                              <option value="custom">Conservar porcentajes personalizados actuales</option>
                            )}
                          </select>
                        </label>
                      )}
                    </div>
                  </>
                )}
                {step === 1 && (
                  <>
                    <p className="muted">
                      Define cuánto quieren destinar este mes. Los montos actuales aparecen para que puedas revisarlos.
                    </p>
                    <div className="sharing-fields">
                      {budgets.map((b, index) => (
                        <label key={b.id || b.name}>
                          {b.name}
                          <input
                            type="number"
                            min="0"
                            max="999999999.99"
                            step="0.01"
                            value={b.planned_amount}
                            onChange={e =>
                              setBudgets(rows =>
                                rows.map((r, i) => (i === index ? {...r, planned_amount: e.target.value} : r))
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <p className="sharing-summary">
                      Plan mensual: <strong>{money(budget)}</strong>
                    </p>
                  </>
                )}
                {step === 2 && (
                  <>
                    <div className="sharing-review">
                      <span>
                        <SlidersHorizontal /> Referencias mensuales
                      </span>
                      <p>
                        Ingresos: <strong>{money(income)}</strong>
                      </p>
                      <p>
                        Presupuesto: <strong>{money(budget)}</strong>
                      </p>
                      {shared && (
                        <p>
                          Gastos compartidos:{' '}
                          <strong>
                            {method === 'equal'
                              ? 'Partes iguales'
                              : method === 'income'
                                ? 'Según ingresos'
                                : 'Porcentajes actuales'}
                          </strong>
                        </p>
                      )}
                      <p>
                        Después del plan: <strong>{money(income - budget)}</strong>
                      </p>
                    </div>
                    {budget > income && (
                      <p className="sharing-warning">
                        El presupuesto supera los ingresos de referencia. Puedes ajustar el plan ahora o revisarlo
                        después en Finanzas.
                      </p>
                    )}
                    {(() => {
                      const invite = (
                        <div className="sharing-invite">
                          <strong>
                            {shared ? 'Invita a los integrantes de este hogar' : '¿Compartes gastos con alguien?'}
                          </strong>
                          <p>
                            {shared
                              ? 'Usa este código con tu familia. Para otra familia, comparte el enlace de la aplicación para que cree su propio hogar.'
                              : 'Tu espacio funciona perfecto solo para ti. Si algún día quieres compartirlo con tu pareja o tu familia, dales este código.'}
                          </p>
                          <code>{inviteCode}</code>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(inviteCode);
                              } catch {
                                setError('No se pudo copiar. Puedes seleccionar el código.');
                              }
                            }}
                          >
                            <Copy size={16} /> Copiar código
                          </button>
                          <small>Entrarán como Invitados. Asigna sus roles desde Familia.</small>
                        </div>
                      );
                      return shared ? (
                        invite
                      ) : (
                        <details className="sharing-invite-optional">
                          <summary>Invitar a alguien (opcional)</summary>
                          {invite}
                        </details>
                      );
                    })()}
                  </>
                )}
                <div className="sharing-dialog-actions">
                  <button disabled={busy} onClick={() => (step ? setStep(s => s - 1) : setOpen(false))}>
                    <ArrowLeft size={16} />
                    {step ? 'Anterior' : 'Después'}
                  </button>
                  {step < 2 ? (
                    <button
                      className="sharing-primary"
                      disabled={busy || (Boolean(error) && !incomes.length)}
                      onClick={next}
                    >
                      Continuar
                      <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button className="sharing-primary" disabled={busy} onClick={save}>
                      <CheckCircle2 size={16} />
                      {busy ? 'Guardando…' : 'Guardar configuración'}
                    </button>
                  )}
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="sharing-error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
