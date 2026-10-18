import {FormEvent, useEffect, useRef, useState} from 'react';
import {fetchAllRows, pagedResult} from './lib/paging';
import {Pause, Pencil, Play, Plus} from 'lucide-react';
import WorkspaceHeading from './WorkspaceHeading';
import WorkspaceTitle from './WorkspaceTitle';
import ModuleLoading from './ModuleLoading';
import {supabase} from './lib/supabase';
import {formatMoney} from './lib/money';
import {localISODate} from './lib/localDate';
import {
  FREQUENCY_LABELS,
  allowanceGoal,
  jarTotals,
  monthlyCost,
  nextPayday,
  pendingPaydays,
  splitAllowance,
  type Allowance,
  type AllowanceFrequency,
  type AllowancePayment
} from './lib/allowance';
import {Modal} from './finance/shared';
import {Amount, Button, EmptyState, ProgressBar} from './ui';
import './styles/modules/allowance.css';

type Household = {id: string; name: string};
type Member = {user_id: string; role: string; full_name: string};
const dayLabel = (iso: string, today: string) =>
  iso === today
    ? 'hoy'
    : new Date(iso + 'T12:00:00').toLocaleDateString('es-GT', {weekday: 'long', day: 'numeric', month: 'short'});

export default function AllowanceCenter({
  household,
  financeAccess,
  onChanged
}: {
  household: Household;
  financeAccess?: string;
  onChanged?: () => void;
}) {
  const today = localISODate();
  const canEdit = financeAccess === 'edit';
  const [items, setItems] = useState<Allowance[]>([]),
    [payments, setPayments] = useState<AllowancePayment[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [editing, setEditing] = useState<Allowance | 'new' | null>(null),
    [withdrawing, setWithdrawing] = useState<Allowance | null>(null),
    [recordExpense, setRecordExpense] = useState(true);
  const loadSequence = useRef(0);
  const withdrawalRequest = useRef('');
  const [loadFailed, setLoadFailed] = useState(false);

  async function load(spinner = true) {
    const request = ++loadSequence.current;
    if (spinner) setLoading(true);
    const [aR, pR, mR] = await Promise.all([
      pagedResult(() =>
        fetchAllRows<Allowance>((from, to) =>
          supabase
            .from('allowances')
            .select(
              'id,child_name,child_user_id,amount,frequency,start_date,save_percent,give_percent,goal_name,goal_amount,active'
            )
            .eq('household_id', household.id)
            .order('created_at')
            .order('id')
            .range(from, to)
        )
      ),
      pagedResult(() =>
        fetchAllRows<AllowancePayment>((from, to) =>
          supabase
            .from('allowance_payments')
            .select('id,allowance_id,kind,for_date,paid_on,spend_amount,save_amount,give_amount')
            .eq('household_id', household.id)
            .order('paid_on', {ascending: false})
            .order('id')
            .range(from, to)
        )
      ),
      canEdit
        ? supabase.from('household_members').select('user_id,role').eq('household_id', household.id)
        : Promise.resolve({data: [] as {user_id: string; role: string}[], error: null})
    ]);
    if (request !== loadSequence.current) return;
    if (aR.error || pR.error) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setLoadFailed(false);
    setItems((aR.data || []) as Allowance[]);
    setPayments((pR.data || []) as AllowancePayment[]);
    const ids = (mR.data || []).map(m => m.user_id);
    const profiles = ids.length
      ? (await supabase.from('profiles').select('id,full_name').in('id', ids)).data || []
      : [];
    if (request !== loadSequence.current) return;
    setMembers(
      (mR.data || []).map(m => ({
        ...m,
        full_name:
          (profiles as {id: string; full_name: string | null}[]).find(p => p.id === m.user_id)?.full_name || 'Miembro'
      }))
    );
    setLoading(false);
  }
  useEffect(() => {
    load();
    return () => {
      loadSequence.current++;
    };
  }, [household.id, canEdit]);

  async function pay(a: Allowance, forDate: string) {
    setBusy(true);
    setMessage('');
    const {error} = await supabase.rpc('pay_allowance', {
      p_allowance_id: a.id,
      p_for_date: forDate,
      p_record_expense: recordExpense,
      p_paid_on: today
    });
    setBusy(false);
    if (error) {
      if (error.code === '23505') {
        await load(false);
        onChanged?.();
      }
      setMessage(
        error.code === '23505'
          ? 'Esa mesada ya estaba marcada como pagada.'
          : 'No se pudo registrar el pago. Inténtalo de nuevo.'
      );
      return;
    }
    setMessage('Mesada de ' + a.child_name + ' pagada' + (recordExpense ? ' y registrada como gasto del hogar.' : '.'));
    await load(false);
    if (recordExpense) onChanged?.();
  }

  async function saveAllowance(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const save = Math.min(100, Math.max(0, Math.round(Number(f.get('save_percent')) || 0)));
    const give = Math.min(100 - save, Math.max(0, Math.round(Number(f.get('give_percent')) || 0)));
    const row = {
      household_id: household.id,
      child_name: String(f.get('child_name') || '').trim(),
      child_user_id: String(f.get('child_user_id') || '') || null,
      amount: Math.round(Number(f.get('amount')) * 100) / 100,
      frequency: String(f.get('frequency')) as AllowanceFrequency,
      start_date: String(f.get('start_date') || today),
      save_percent: save,
      give_percent: give,
      goal_name: String(f.get('goal_name') || '').trim() || null,
      goal_amount: Number(f.get('goal_amount')) > 0 ? Math.round(Number(f.get('goal_amount')) * 100) / 100 : null
    };
    if (!row.child_name || !(row.amount > 0)) {
      setMessage('Escribe el nombre y el monto de la mesada.');
      return;
    }
    setBusy(true);
    const {error} =
      editing && editing !== 'new'
        ? await supabase.from('allowances').update(row).eq('id', editing.id)
        : await supabase.from('allowances').insert(row);
    setBusy(false);
    if (error) {
      setMessage('No se pudo guardar la mesada. Revisa los datos e inténtalo de nuevo.');
      return;
    }
    setEditing(null);
    setMessage('Mesada guardada.');
    load(false);
  }

  async function toggle(a: Allowance) {
    const {error} = await supabase
      .from('allowances')
      .update({active: a.active === false})
      .eq('id', a.id);
    if (error) setMessage('No se pudo cambiar la mesada.');
    else load(false);
  }
  async function remove(a: Allowance) {
    if (
      !window.confirm(
        '¿Eliminar la mesada de ' + a.child_name + ' y su historial de frascos? Los gastos ya registrados se quedan.'
      )
    )
      return;
    const {error} = await supabase.from('allowances').delete().eq('id', a.id);
    if (error) setMessage('No se pudo eliminar la mesada.');
    else {
      setEditing(null);
      setMessage('Mesada eliminada.');
      load(false);
    }
  }
  async function withdraw(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!withdrawing) return;
    const f = new FormData(e.currentTarget);
    const amount = Math.round(Number(f.get('amount')) * 100) / 100;
    setBusy(true);
    const requestId = withdrawalRequest.current || (withdrawalRequest.current = crypto.randomUUID());
    const values = {
      id: requestId,
      household_id: household.id,
      allowance_id: withdrawing.id,
      kind: 'withdrawal',
      paid_on: today,
      save_amount: amount,
      note: String(f.get('note') || '').trim() || null
    };
    let {error} = await supabase.from('allowance_payments').insert(values);
    if (error?.code === '23505') {
      const saved = await supabase
        .from('allowance_payments')
        .select('household_id,allowance_id,kind,paid_on,save_amount,note')
        .eq('id', requestId)
        .single();
      const same =
        !saved.error &&
        saved.data &&
        saved.data.household_id === values.household_id &&
        saved.data.allowance_id === values.allowance_id &&
        saved.data.kind === values.kind &&
        saved.data.paid_on === values.paid_on &&
        Number(saved.data.save_amount) === values.save_amount &&
        (saved.data.note || null) === values.note;
      if (same) error = null;
      else {
        setBusy(false);
        setMessage(
          'No pudimos confirmar este retiro con los mismos datos. Revisa el historial antes de intentarlo otra vez.'
        );
        return;
      }
    }
    setBusy(false);
    if (error) {
      setMessage(error.code === '23514' ? 'No hay tanto en el frasco de ahorro.' : 'No se pudo registrar el retiro.');
      return;
    }
    setWithdrawing(null);
    setMessage('Retiro registrado.');
    load(false);
  }

  if (loading) return <ModuleLoading label="Cargando la mesada" />;
  if (loadFailed)
    return (
      <section className="allowance-center">
        <WorkspaceHeading>
          <WorkspaceTitle
            module="allowance"
            eyebrow="Mesada"
            title="Mesada"
            description="Tus datos guardados se conservan."
          />
        </WorkspaceHeading>
        <div role="alert" className="finance-message">
          No se pudo cargar la mesada completa. Reintenta antes de registrar pagos o retiros.
          <Button onClick={() => load()}>Reintentar</Button>
        </div>
      </section>
    );
  const kids = members.filter(m => m.role === 'teen' || m.role === 'child');

  return (
    <section className="allowance-center">
      <WorkspaceHeading>
        <WorkspaceTitle
          module="allowance"
          eyebrow="Mesada"
          title={canEdit ? 'Mesada' : 'Tu mesada'}
          description="Una mesada con tres frascos: para gastar, para ahorrar y para compartir."
        />
        {canEdit && items.length > 0 && (
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => setEditing('new')}>
            Nueva mesada
          </Button>
        )}
      </WorkspaceHeading>
      {message && (
        <div className="finance-message" role="status">
          {message}
        </div>
      )}

      {items.length === 0 ? (
        <div className="allowance-panel">
          <EmptyState
            art="family"
            title={canEdit ? 'Una mesada que enseña' : 'Aún no tienes mesada aquí'}
            action={
              canEdit && (
                <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => setEditing('new')}>
                  Crear mesada
                </Button>
              )
            }
          >
            {canEdit
              ? 'Define cuánto recibe cada hijo y cada cuándo. Una parte va a su frasco de ahorro y otra a compartir, y la app lleva la cuenta.'
              : 'Cuando alguien del hogar configure tu mesada, aquí verás tus frascos y tu meta.'}
          </EmptyState>
        </div>
      ) : (
        <div className="allowance-grid">
          {items.map(a => {
            const jars = jarTotals(a.id, payments),
              goal = allowanceGoal(a, jars.save),
              split = splitAllowance(a.amount, a.save_percent, a.give_percent),
              pending = canEdit ? pendingPaydays(a, payments, today) : [],
              paused = a.active === false,
              fullest = Math.max(jars.spend, jars.save, jars.give);
            return (
              <article key={a.id} className={'allowance-panel allowance-card' + (paused ? ' is-paused' : '')}>
                <div className="allowance-head">
                  <div>
                    <h3>{a.child_name}</h3>
                    <p>
                      {formatMoney(Number(a.amount))} · {FREQUENCY_LABELS[a.frequency].toLowerCase()}
                      {paused ? ' · en pausa' : ' · próxima ' + dayLabel(nextPayday(a, today), today)}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="allowance-tools">
                      <Button
                        variant="quiet"
                        icon={paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                        onClick={() => toggle(a)}
                      >
                        {paused ? 'Reanudar' : 'Pausar'}
                      </Button>
                      <Button variant="quiet" icon={<Pencil aria-hidden="true" />} onClick={() => setEditing(a)}>
                        Editar
                      </Button>
                    </div>
                  )}
                </div>

                <div className="allowance-jars" role="list" aria-label="Frascos">
                  {(
                    [
                      ['spend', 'Gastar', jars.spend, split.spend],
                      ['save', 'Ahorrar', jars.save, split.save],
                      ['give', 'Compartir', jars.give, split.give]
                    ] as const
                  ).map(([key, label, total, each]) => (
                    <div key={key} role="listitem" className={'allowance-jar allowance-jar--' + key}>
                      <span className="allowance-jar-glass" aria-hidden="true">
                        <i
                          style={{height: (total > 0 && fullest > 0 ? Math.max(6, (total / fullest) * 100) : 0) + '%'}}
                        />
                      </span>
                      <strong>
                        <Amount value={total} />
                      </strong>
                      <small>
                        {label} · {formatMoney(each)} por pago
                      </small>
                    </div>
                  ))}
                </div>

                {goal && (
                  <div className="allowance-goal">
                    <div>
                      <strong>{a.goal_name || 'Meta de ahorro'}</strong>
                      <span>
                        {goal.left === 0
                          ? '¡Lo logró!'
                          : formatMoney(goal.left) +
                            ' por juntar' +
                            (goal.paydaysLeft ? ' · unas ' + goal.paydaysLeft + ' mesadas más' : '')}
                      </span>
                    </div>
                    <ProgressBar
                      value={jars.save}
                      max={goal.target}
                      label={'Avance de ' + (a.goal_name || 'la meta')}
                      tone="success"
                    />
                  </div>
                )}

                {pending.length > 0 && (
                  <div className="allowance-due">
                    {pending.map(d => (
                      <div key={d}>
                        <span>
                          Pago del <b>{dayLabel(d, today)}</b>
                        </span>
                        <Button variant="primary" disabled={busy} onClick={() => pay(a, d)}>
                          Marcar pagada
                        </Button>
                      </div>
                    ))}
                    <label className="allowance-record">
                      <input
                        type="checkbox"
                        checked={recordExpense}
                        onChange={e => setRecordExpense(e.target.checked)}
                      />{' '}
                      Registrarla como gasto del hogar
                    </label>
                  </div>
                )}

                <div className="allowance-foot">
                  <span>
                    {jars.payments} {jars.payments === 1 ? 'pago' : 'pagos'} · le cuesta al hogar unos{' '}
                    {formatMoney(monthlyCost(a))} al mes
                  </span>
                  {canEdit && jars.save > 0 && (
                    <Button
                      variant="quiet"
                      onClick={() => {
                        withdrawalRequest.current = crypto.randomUUID();
                        setWithdrawing(a);
                      }}
                    >
                      Usar ahorro
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Nueva mesada' : 'Editar mesada'} close={() => setEditing(null)}>
          <AllowanceForm
            initial={editing === 'new' ? null : editing}
            kids={kids.length ? kids : members}
            today={today}
            busy={busy}
            onSubmit={saveAllowance}
            onDelete={editing !== 'new' ? () => remove(editing) : undefined}
          />
        </Modal>
      )}
      {withdrawing && (
        <Modal title={'Usar el ahorro de ' + withdrawing.child_name} close={() => setWithdrawing(null)}>
          <form className="finance-form" onSubmit={withdraw}>
            <p className="allowance-form-note">
              En el frasco hay {formatMoney(jarTotals(withdrawing.id, payments).save)}. El retiro baja el frasco de
              ahorro; no es un gasto nuevo del hogar.
            </p>
            <label>
              ¿Cuánto?
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                max={jarTotals(withdrawing.id, payments).save}
                step="0.01"
                required
              />
            </label>
            <label>
              ¿Para qué? (opcional)
              <input name="note" maxLength={140} placeholder="Audífonos, excursión…" />
            </label>
            <Button variant="primary" type="submit" disabled={busy}>
              Registrar retiro
            </Button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function AllowanceForm({
  initial,
  kids,
  today,
  busy,
  onSubmit,
  onDelete
}: {
  initial: Allowance | null;
  kids: Member[];
  today: string;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onDelete?: () => void;
}) {
  const [amount, setAmount] = useState(Number(initial?.amount) || 0),
    [save, setSave] = useState(initial?.save_percent ?? 20),
    [give, setGive] = useState(initial?.give_percent ?? 10);
  const split = splitAllowance(amount, save, give);
  return (
    <form className="finance-form" onSubmit={onSubmit}>
      <div className="two">
        <label>
          Nombre
          <input
            name="child_name"
            required
            maxLength={60}
            defaultValue={initial?.child_name || ''}
            placeholder="Sofía"
          />
        </label>
        <label>
          Su cuenta en el hogar
          <select name="child_user_id" defaultValue={initial?.child_user_id || ''}>
            <option value="">No tiene cuenta</option>
            {kids.map(k => (
              <option key={k.user_id} value={k.user_id}>
                {k.full_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="two">
        <label>
          Monto
          <input
            name="amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            defaultValue={initial?.amount || ''}
            onChange={e => setAmount(Number(e.target.value) || 0)}
          />
        </label>
        <label>
          Cada cuándo
          <select name="frequency" defaultValue={initial?.frequency || 'weekly'}>
            {(Object.keys(FREQUENCY_LABELS) as AllowanceFrequency[]).map(k => (
              <option key={k} value={k}>
                {FREQUENCY_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Primer pago
        <input name="start_date" type="date" required defaultValue={initial?.start_date || today} />
      </label>
      <div className="two">
        <label>
          % al frasco de ahorro
          <input
            name="save_percent"
            type="number"
            min="0"
            max="100"
            step="1"
            value={save}
            onChange={e => setSave(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
          />
        </label>
        <label>
          % para compartir
          <input
            name="give_percent"
            type="number"
            min="0"
            max={100 - save}
            step="1"
            value={give}
            onChange={e => setGive(Math.max(0, Math.min(100 - save, Math.round(Number(e.target.value) || 0))))}
          />
        </label>
      </div>
      {amount > 0 && (
        <p className="allowance-form-note">
          Cada pago: {formatMoney(split.spend)} para gastar, {formatMoney(split.save)} para ahorrar y{' '}
          {formatMoney(split.give)} para compartir.
        </p>
      )}
      <div className="two">
        <label>
          Meta de ahorro (opcional)
          <input name="goal_name" maxLength={60} defaultValue={initial?.goal_name || ''} placeholder="Bicicleta" />
        </label>
        <label>
          Cuánto cuesta
          <input
            name="goal_amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            defaultValue={initial?.goal_amount || ''}
          />
        </label>
      </div>
      <div className="allowance-form-actions">
        {onDelete && (
          <Button variant="danger" onClick={onDelete} disabled={busy}>
            Eliminar
          </Button>
        )}
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar mesada'}
        </Button>
      </div>
    </form>
  );
}
