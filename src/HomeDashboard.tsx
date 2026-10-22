import HomeGettingStarted from './HomeGettingStarted';
import {formatMoney as money} from './lib/money';
import WorkspaceHeading from './WorkspaceHeading';
import HomeAgenda from './HomeAgenda';
import type {DailyAgendaItem as AgendaItem} from './lib/dailyAgenda';
import HomeMoneyWorkspace from './HomeMoneyWorkspace';
import WeeklySummaryCard from './WeeklySummaryCard';
import {useFeature} from './lib/features';
import HomeToday, {type Attention} from './HomeToday';
import type {HomeFinance as FinanceHome} from './lib/homeOverview';
import HouseScene from './HouseScene';
import {moduleCatalog, readScope, saveScope, scopeKey, type Appearance, type FinanceScope} from './lib/appearance';
import type {ModuleIconName} from './ModuleIcon';
import ModuleIcon from './ModuleIcon';
import {lazy, Suspense, useEffect, useRef, useState} from 'react';
const DemoPreview = lazy(() => import('./DemoPreview'));
import {AlertTriangle, CheckCircle2, ChevronRight, ArrowUpRight, Palette, ChevronDown, Plus} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household = {id: string; name: string; invite_code: string};
type EventSource = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  location: string | null;
  event_type: string | null;
  recurrence: 'none' | 'weekly' | 'monthly' | 'yearly';
  recurrence_until: string | null;
  assigned_to: string | null;
  all_day: boolean;
};
type SetupState = {
  profile: boolean;
  finance: boolean;
  financeVerified: boolean;
  lists: boolean;
  family: boolean;
  backup: boolean;
};

const iso = (d = new Date()) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfWeek = () => addDays(startOfDay(), 6);
const severityRank = (s: string) => (s === 'danger' ? 0 : s === 'warning' ? 1 : s === 'success' ? 2 : 3);

export default function HomeDashboard({
  household,
  finance,
  listCount,
  access,
  onNavigate,
  appearance,
  onPersonalize,
  onRefresh
}: {
  appearance: Appearance;
  onPersonalize: () => void;
  onRefresh: () => void;
  household: Household;
  finance: FinanceHome;
  listCount: number;
  access?: Record<string, 'none' | 'view' | 'edit'>;
  onNavigate: (tab: string) => void;
}) {
  const request = useRef(0);
  const weekly = useFeature('weekly');
  const [agendaError, setAgendaError] = useState(''),
    [members, setMembers] = useState<{user_id: string; full_name: string}[]>([]);
  const accessKey = JSON.stringify(access || {});
  const can = (module: string) => !access || access[module] !== 'none';
  const [attention, setAttention] = useState<Attention[]>([]),
    [agenda, setAgenda] = useState<AgendaItem[]>([]),
    [firstName, setFirstName] = useState(''),
    [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<SetupState>({
    profile: false,
    finance: false,
    financeVerified: false,
    lists: false,
    family: false,
    backup: false
  });
  const [demo, setDemo] = useState(false);
  const [userId, setUserId] = useState(''),
    [scope, setScopeState] = useState<FinanceScope>('household');
  useEffect(() => {
    if (userId) setScopeState(readScope(scopeKey(userId, household.id)));
  }, [userId, household.id]);
  function setScope(next: FinanceScope) {
    setScopeState(next);
    if (userId) saveScope(scopeKey(userId, household.id), next);
  }

  useEffect(() => {
    let channel: any,
      active = true,
      timer = 0;
    // Bulk actions emit bursts of realtime events; one reload after they settle is enough.
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (active) load(false);
      }, 400);
    };
    (async () => {
      await load();
      if (!active) return;
      const {
        data: {user}
      } = await supabase.auth.getUser();
      // The screen may have closed during that request: a channel created now would never be removed.
      if (!active) return;
      channel = supabase
        .channel('home-control-' + household.id + '-' + Date.now().toString(36))
        .on(
          'postgres_changes',
          {event: '*', schema: 'public', table: 'notifications', filter: user ? 'user_id=eq.' + user.id : undefined},
          schedule
        )
        .on(
          'postgres_changes',
          {event: '*', schema: 'public', table: 'list_items', filter: 'household_id=eq.' + household.id},
          schedule
        )
        .on(
          'postgres_changes',
          {event: '*', schema: 'public', table: 'meal_plan_entries', filter: 'household_id=eq.' + household.id},
          schedule
        )
        .on(
          'postgres_changes',
          {event: '*', schema: 'public', table: 'maintenance_schedules', filter: 'household_id=eq.' + household.id},
          schedule
        )
        .on(
          'postgres_changes',
          {event: '*', schema: 'public', table: 'events', filter: 'household_id=eq.' + household.id},
          schedule
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'recurring_transaction_occurrences',
            filter: 'household_id=eq.' + household.id
          },
          schedule
        )
        .subscribe();
    })();
    return () => {
      active = false;
      window.clearTimeout(timer);
      request.current++;
      if (channel) supabase.removeChannel(channel);
    };
  }, [household.id, accessKey]);

  async function load(showLoader = true) {
    const currentRequest = ++request.current;
    if (showLoader) setLoading(true);
    const {
      data: {user}
    } = await supabase.auth.getUser();
    if (currentRequest !== request.current) return;
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);
    await supabase.rpc('refresh_my_notifications', {p_household_id: household.id});
    const today = iso(),
      weekEnd = iso(endOfWeek());
    const [
      notificationR,
      taskR,
      eventR,
      occR,
      recR,
      memberR,
      profileR,
      accountR,
      backupR,
      mealR,
      recipeR,
      maintenanceR
    ] = await Promise.all([
      supabase
        .from('notifications')
        .select('id,type,severity,title,body,action_tab,created_at')
        .eq('household_id', household.id)
        .eq('user_id', user.id)
        .is('read_at', null)
        .neq('type', 'system')
        .order('created_at', {ascending: false})
        .limit(20),
      can('lists')
        ? supabase
            .from('list_items')
            .select('id,text,due_date,assigned_to,completed')
            .eq('household_id', household.id)
            .eq('completed', false)
            .lte('due_date', weekEnd)
        : Promise.resolve({data: [] as any[], error: null}),
      can('calendar')
        ? supabase
            .from('events')
            .select(
              'id,title,event_date,start_time,location,event_type,recurrence,recurrence_until,assigned_to,all_day'
            )
            .eq('household_id', household.id)
            .lte('event_date', weekEnd)
            .or(`recurrence.eq.none,recurrence_until.is.null,recurrence_until.gte.${today}`)
            .or(`recurrence.neq.none,event_date.gte.${today}`)
            .order('event_date')
        : Promise.resolve({data: [] as any[], error: null}),
      can('finance')
        ? supabase
            .from('recurring_transaction_occurrences')
            .select('id,recurring_transaction_id,due_date,status')
            .eq('household_id', household.id)
            .eq('status', 'pending')
            .lte('due_date', weekEnd)
        : Promise.resolve({data: [] as any[], error: null}),
      can('finance')
        ? supabase
            .from('recurring_transactions')
            .select('id,description,amount,type,paid_by')
            .eq('household_id', household.id)
            .eq('active', true)
        : Promise.resolve({data: [] as any[], error: null}),
      supabase.from('household_members').select('user_id').eq('household_id', household.id),
      supabase.from('profiles').select('id,full_name,birth_date,relationship').eq('id', user.id).maybeSingle(),
      can('finance')
        ? supabase.from('finance_accounts').select('id').eq('household_id', household.id).eq('active', true).limit(1)
        : Promise.resolve({data: [] as any[], error: null}),
      can('backups')
        ? supabase.from('household_backups').select('id').eq('household_id', household.id).limit(1)
        : Promise.resolve({data: [] as any[], error: null}),
      can('meals')
        ? supabase
            .from('meal_plan_entries')
            .select('id,meal_date,meal_type,recipe_id,custom_title,status')
            .eq('household_id', household.id)
            .eq('status', 'planned')
            .gte('meal_date', today)
            .lte('meal_date', weekEnd)
        : Promise.resolve({data: [] as any[], error: null}),
      can('meals')
        ? supabase.from('recipes').select('id,name').eq('household_id', household.id)
        : Promise.resolve({data: [] as any[], error: null}),
      can('maintenance')
        ? supabase
            .from('maintenance_schedules')
            .select('id,title,next_due_date,assigned_to,calendar_event_id')
            .eq('household_id', household.id)
            .eq('active', true)
            .lte('next_due_date', weekEnd)
        : Promise.resolve({data: [] as any[], error: null})
    ]);
    const memberIds = (memberR.data || []).map((m: any) => m.user_id);
    const birthdaysR = memberIds.length
      ? await supabase.from('profiles').select('id,full_name,birth_date').in('id', memberIds)
      : {data: [] as any[]};
    if (currentRequest !== request.current) return;
    setAgendaError(
      [taskR, eventR, occR, recR, mealR, recipeR, maintenanceR].some(r => r.error)
        ? 'No se pudieron verificar todas las actividades. La agenda puede estar incompleta.'
        : ''
    );
    setMembers(
      memberIds.map((id: string) => ({
        user_id: id,
        full_name: (birthdaysR.data || []).find((p: any) => p.id === id)?.full_name || 'Miembro'
      }))
    );
    setFirstName(
      String(profileR.data?.full_name || user.user_metadata?.full_name || '')
        .trim()
        .split(/\s+/)[0] || ''
    );
    setSetup({
      profile: Boolean(
        String(profileR.data?.full_name || '').trim() && String(profileR.data?.relationship || '').trim()
      ),
      finance: !can('finance') || Boolean(accountR.data?.length),
      financeVerified: !accountR.error,
      lists: !can('lists') || listCount > 0,
      family: (memberR.data || []).length > 1,
      backup: !can('backups') || Boolean(backupR.data?.length)
    });

    const rows = ((notificationR.data || []) as Attention[]).sort(
      (a, b) =>
        severityRank(a.severity) - severityRank(b.severity) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    setAttention(rows);

    const items: AgendaItem[] = [];
    for (const task of (taskR.data || []) as any[])
      items.push({
        id: 'task-' + task.id,
        kind: 'task',
        title: task.text,
        date: task.due_date,
        time: null,
        subtitle: 'Tarea',
        assignedTo: task.assigned_to,
        tab: 'listas'
      });

    const recurringMap = new Map(((recR.data || []) as any[]).map(r => [r.id, r]));
    for (const occ of (occR.data || []) as any[]) {
      const recurring: any = recurringMap.get(occ.recurring_transaction_id);
      if (!recurring || recurring.type !== 'expense') continue;
      items.push({
        id: 'pay-' + occ.id,
        kind: 'payment',
        title: recurring.description,
        date: occ.due_date,
        time: null,
        subtitle: money(Number(recurring.amount)),
        assignedTo: recurring.paid_by,
        tab: 'presupuesto:recurring'
      });
    }

    const maintenanceEvents = new Set((maintenanceR.data || []).map((m: any) => m.calendar_event_id).filter(Boolean));
    for (const event of (eventR.data || []) as EventSource[]) {
      if (maintenanceEvents.has(event.id)) continue;
      for (let d = startOfDay(); d <= endOfWeek(); d = addDays(d, 1)) {
        const date = iso(d);
        if (eventOccursOn(event, date))
          items.push({
            id: 'event-' + event.id + '-' + date,
            kind: 'event',
            title: event.title,
            date,
            time: event.all_day ? null : event.start_time?.slice(0, 5) || null,
            assignedTo: event.assigned_to,
            subtitle: event.location || (event.event_type === 'maintenance' ? 'Mantenimiento' : 'Evento familiar'),
            tab: event.event_type === 'maintenance' ? 'mantenimiento' : 'calendario'
          });
      }
    }

    for (const member of (birthdaysR.data || []) as any[]) {
      if (!member.birth_date) continue;
      const [, mm, dd] = String(member.birth_date).split('-');
      for (let d = startOfDay(); d <= endOfWeek(); d = addDays(d, 1)) {
        const date = iso(d);
        if (date.slice(5) === mm + '-' + dd)
          items.push({
            id: 'birthday-' + member.id + '-' + date,
            kind: 'birthday',
            title: 'Cumpleaños de ' + (member.full_name || 'Miembro'),
            date,
            time: null,
            subtitle: 'Familia',
            tab: 'familia'
          });
      }
    }

    const recipeNames = new Map((recipeR.data || []).map((r: any) => [r.id, r.name]));
    const mealLabels: Record<string, string> = {
      breakfast: 'Desayuno',
      lunch: 'Almuerzo',
      dinner: 'Cena',
      snack: 'Snack'
    };
    for (const meal of (mealR.data || []) as any[])
      items.push({
        id: 'meal-' + meal.id,
        kind: 'meal',
        title: meal.custom_title || String(recipeNames.get(meal.recipe_id) || 'Comida planificada'),
        date: meal.meal_date,
        time: null,
        subtitle: mealLabels[meal.meal_type] || 'Comida',
        tab: 'comidas'
      });
    for (const job of (maintenanceR.data || []) as any[])
      items.push({
        id: 'maintenance-' + job.id,
        kind: 'maintenance',
        title: job.title,
        date: job.next_due_date,
        time: null,
        subtitle: 'Mantenimiento',
        assignedTo: job.assigned_to,
        tab: 'mantenimiento'
      });

    items.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99'));
    setAgenda(items);
    if (showLoader) setLoading(false);
  }

  async function openAttention(item: Attention) {
    const {error} = await supabase.from('notifications').update({read_at: new Date().toISOString()}).eq('id', item.id);
    // Only hide the notice once it is really marked as read; navigation still happens either way.
    if (!error) {
      setAttention(current => current.filter(x => x.id !== item.id));
      window.dispatchEvent(new CustomEvent('nh:notifications-changed'));
    }
    if (item.action_tab) onNavigate(item.action_tab);
  }

  const today = iso();
  const urgent = attention.filter(x => x.severity === 'danger' || x.severity === 'warning');
  const overdueItems = agenda.filter(x => x.date < today);
  const greeting = greetingLabel();
  const setupSteps = [
    {
      key: 'profile',
      done: setup.profile,
      title: 'Completa tu perfil',
      detail: 'Nombre, relación y datos básicos',
      tab: 'familia',
      show: true
    },
    {
      key: 'finance',
      done: setup.finance,
      title: 'Agrega una cuenta',
      detail: 'Efectivo, banco o tarjeta para empezar',
      tab: 'presupuesto:accounts',
      show: can('finance')
    },
    {
      key: 'lists',
      done: setup.lists,
      title: 'Crea tu primera lista',
      detail: 'Compras o tareas compartidas',
      tab: 'listas',
      show: can('lists')
    },
    {
      key: 'family',
      done: setup.family,
      title: 'Invita a otra persona (opcional)',
      detail: 'Tu hogar también funciona solo para ti',
      tab: 'familia',
      show: setup.family
    },
    {
      key: 'backup',
      done: setup.backup,
      title: 'Crea un respaldo',
      detail: 'Protege la configuración inicial',
      tab: 'respaldos',
      show: can('backups')
    }
  ].filter(x => x.show);
  const setupCompleted = setupSteps.filter(x => x.done).length,
    showSetup = setupSteps.length > 0 && setupCompleted < setupSteps.length;
  const nextStep = setupSteps.find(step => !step.done);

  const availableModules = moduleCatalog.filter(m => !('module' in m) || can(m.module));
  const favorites = appearance.favorites
    .map(tab => availableModules.find(m => m.tab === tab))
    .filter(Boolean) as typeof availableModules;
  const showFinance = can('finance') && !finance.error;
  if (loading || (showFinance && finance.loading))
    return (
      <div className="studio-skeleton" role="status" aria-label="Cargando tu hogar">
        <span />
        <i />
        <div>
          <b />
          <b />
          <b />
        </div>
        <i />
        <i />
      </div>
    );
  const agendaView = (
    <HomeAgenda
      items={agenda}
      members={members}
      today={today}
      end={iso(endOfWeek())}
      error={agendaError}
      refresh={() => load(false)}
      onNavigate={onNavigate}
      canCalendar={can('calendar')}
    />
  );
  const shared = members.length > 1;
  const canRegister = can('finance') && access?.finance !== 'view';
  const longDate = new Date(today + 'T12:00').toLocaleDateString('es-GT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const todayInput = {notifications: urgent, overdue: overdueItems, agendaError, onOpenNotification: openAttention};
  return (
    <section className="home-dashboard home-control premium-home" data-focus={appearance.focus}>
      <WorkspaceHeading className="home-heading">
        <div className="home-intro">
          <div className="home-title">
            <h2>
              <span className="home-title-desktop">
                {can('finance') ? 'Tu dinero, en perspectiva.' : 'Tu hogar, en perspectiva.'}
              </span>
              <span className="home-title-mobile">
                {greeting}
                {firstName ? ', ' + firstName : ''}
              </span>
            </h2>
            <p className="home-date">{longDate.charAt(0).toUpperCase() + longDate.slice(1)}</p>
          </div>
          <div className="home-heading-actions">
            {showFinance && shared && (
              <div className="home-segmented home-scope" role="group" aria-label="Vista de tus finanzas">
                <button
                  type="button"
                  aria-pressed={scope === 'household'}
                  title="Todo lo registrado en el hogar"
                  onClick={() => setScope('household')}
                >
                  Compartido
                </button>
                <button
                  type="button"
                  aria-pressed={scope === 'personal'}
                  title="Tus ingresos y lo que registraste como personal"
                  onClick={() => setScope('personal')}
                >
                  Personal
                </button>
              </div>
            )}
            {canRegister && (
              <button
                type="button"
                className="home-register"
                onClick={() => window.dispatchEvent(new CustomEvent('nh:quick-add'))}
              >
                <Plus size={18} aria-hidden="true" /> Registrar
              </button>
            )}
          </div>
        </div>
      </WorkspaceHeading>
      {can('finance') && finance.error && (
        <div className="workspace-status error" role="alert">
          <AlertTriangle size={20} />
          <p>{finance.error}</p>
          <button type="button" onClick={onRefresh}>
            Reintentar
          </button>
        </div>
      )}
      {showFinance && finance.source && setup.financeVerified && canRegister && !finance.source.transactions.length && (
        <HomeGettingStarted
          accounts={setup.finance}
          income={
            finance.source.members.length > 0 &&
            finance.source.members.every(member =>
              finance.source!.plans.some(
                plan => plan.user_id === member.user_id && plan.month === finance.source!.month
              )
            )
          }
          budget={finance.source.allocations.length > 0}
          onNavigate={onNavigate}
          onExample={() => setDemo(true)}
        />
      )}
      {demo && (
        <Suspense fallback={null}>
          <DemoPreview
            onClose={() => setDemo(false)}
            onStart={() => window.dispatchEvent(new CustomEvent('nh:setup'))}
          />
        </Suspense>
      )}
      {showFinance && finance.source ? (
        <HomeMoneyWorkspace
          householdName={household.name}
          householdId={household.id}
          userId={userId}
          scope={shared ? scope : 'household'}
          shared={shared}
          members={members}
          canEdit={!access || access.finance === 'edit'}
          finance={finance}
          onNavigate={onNavigate}
          onRefresh={onRefresh}
          agenda={agendaView}
          agendaFirst={appearance.focus === 'plans'}
          today={todayInput}
          canHealth={can('health')}
          cover={appearance.cover}
          essential={appearance.view === 'essential'}
        />
      ) : (
        <div className="home-grid home-grid--no-finance">
          <section className="home-card home-welcome">
            <HouseScene />
            <div>
              <h3>{household.name}</h3>
              <p>Tu agenda, tus pendientes y los espacios que compartes.</p>
            </div>
          </section>
          <HomeToday
            notifications={urgent}
            actions={[]}
            overdue={overdueItems}
            agendaError={agendaError}
            onOpenNotification={openAttention}
            onNavigate={onNavigate}
          />
          <div className="home-agenda-slot">{agendaView}</div>
        </div>
      )}
      {showFinance && weekly && (
        <WeeklySummaryCard householdId={household.id} source={finance.source} onNavigate={onNavigate} />
      )}
      <section className="home-favorites-section">
        <div className="control-section-head">
          <div>
            <p className="eyebrow">A tu manera</p>
            <h3>Tus favoritos</h3>
          </div>
          <button aria-label="Personalizar mi espacio" onClick={onPersonalize}>
            Editar <Palette size={15} />
          </button>
        </div>
        {favorites.length ? (
          <div className="studio-favorites">
            {favorites.map(m => (
              <button key={m.tab} className={'favorite-card module-' + m.icon} onClick={() => onNavigate(m.tab)}>
                <span>
                  <ModuleIcon name={m.icon as ModuleIconName} size={30} />
                </span>
                <ArrowUpRight className="favorite-arrow" size={17} />
                <strong>{m.label}</strong>
                <small>{m.detail}</small>
              </button>
            ))}
          </div>
        ) : (
          <button className="home-see-more" onClick={onPersonalize}>
            Elige tus módulos favoritos <Palette size={16} />
          </button>
        )}
      </section>
      <details className="control-section home-all-modules">
        <summary>
          <span>
            <p className="eyebrow">Explora tu hogar</p>
            <strong>Todos los espacios</strong>
          </span>
          <span>
            {availableModules.length} módulos <ChevronDown size={17} />
          </span>
        </summary>
        <div className="control-module-grid">
          {availableModules.map(m => (
            <button key={m.tab} onClick={() => onNavigate(m.tab)}>
              <span className={m.icon}>
                <ModuleIcon name={m.icon as ModuleIconName} />
              </span>
              <div>
                <strong>{m.label}</strong>
                <small>{m.detail}</small>
              </div>
              <ChevronRight />
            </button>
          ))}
        </div>
      </details>
      {showSetup && nextStep && (!showFinance || Boolean(finance.source?.transactions.length)) && (
        <section className="control-section home-next-step" aria-label="Tu próximo paso">
          <div>
            <p className="eyebrow">Un paso a la vez</p>
            <h3>{nextStep.title}</h3>
            <p>{nextStep.detail}</p>
          </div>
          <button type="button" className="home-register" onClick={() => onNavigate(nextStep.tab)}>
            Continuar <ChevronRight size={16} aria-hidden="true" />
          </button>
        </section>
      )}
      {showSetup && (
        <details className="control-section home-setup-section">
          <summary>
            <span>
              <p className="eyebrow">Tu próximo paso</p>
              <strong>Prepara tu hogar</strong>
            </span>
            <span className="home-setup-count">
              {setupCompleted}/{setupSteps.length}
              <ChevronDown size={15} />
            </span>
          </summary>
          <div className="home-setup-progress">
            <span style={{width: Math.round((setupCompleted / setupSteps.length) * 100) + '%'}} />
          </div>
          <div className="home-setup-list">
            {setupSteps.map((step, i) => (
              <button
                key={step.key}
                className={step.done ? 'done' : ''}
                onClick={() => !step.done && onNavigate(step.tab)}
                disabled={step.done}
              >
                <span>{step.done ? <CheckCircle2 /> : i + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.done ? 'Listo' : step.detail}</small>
                </div>
                {!step.done && <ChevronRight />}
              </button>
            ))}
          </div>
        </details>
      )}
      <p className="home-signature">
        <ModuleIcon name="home" size={16} /> Hecho para compartir la vida.
      </p>
    </section>
  );
}

function greetingLabel() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}
function eventOccursOn(event: EventSource, target: string) {
  if (target < event.event_date) return false;
  if (event.recurrence_until && target > event.recurrence_until) return false;
  if (event.recurrence === 'none') return target === event.event_date;
  const base = new Date(event.event_date + 'T12:00'),
    date = new Date(target + 'T12:00');
  if (event.recurrence === 'weekly') return Math.round((date.getTime() - base.getTime()) / 86400000) % 7 === 0;
  if (event.recurrence === 'monthly')
    return date.getDate() === Math.min(base.getDate(), new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate());
  if (event.recurrence === 'yearly')
    return (
      date.getMonth() === base.getMonth() &&
      date.getDate() === Math.min(base.getDate(), new Date(date.getFullYear(), base.getMonth() + 1, 0).getDate())
    );
  return false;
}
