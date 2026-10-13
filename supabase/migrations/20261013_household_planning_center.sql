
-- Household planning roadmap: goals, milestones, linked financial progress and alerts.
create table if not exists public.household_planning_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  goal_type text not null default 'other' check (goal_type in ('saving','travel','purchase','housing','vehicle','debt','maintenance','event','home','other')),
  description text,
  horizon_months integer not null default 3 check (horizon_months in (1,3,6,12)),
  target_date date not null,
  target_amount numeric check (target_amount is null or target_amount >= 0),
  current_amount numeric not null default 0 check (current_amount >= 0),
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  status text not null default 'active' check (status in ('active','paused','completed')),
  linked_savings_goal_id uuid references public.savings_goals(id) on delete set null,
  linked_account_id uuid references public.finance_accounts(id) on delete set null,
  linked_maintenance_id uuid references public.maintenance_schedules(id) on delete set null,
  linked_event_id uuid references public.events(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planning_milestones (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  planning_goal_id uuid not null references public.household_planning_goals(id) on delete cascade,
  title text not null,
  due_date date,
  estimated_amount numeric check (estimated_amount is null or estimated_amount >= 0),
  status text not null default 'pending' check (status in ('pending','completed','skipped')),
  linked_tab text,
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_planning_goals_household_status on public.household_planning_goals(household_id,status,target_date);
create index if not exists idx_planning_goals_horizon on public.household_planning_goals(household_id,horizon_months,status);
create index if not exists idx_planning_milestones_goal on public.planning_milestones(planning_goal_id,status,due_date);
create index if not exists idx_planning_milestones_household_due on public.planning_milestones(household_id,due_date) where status='pending';

alter table public.household_planning_goals enable row level security;
alter table public.planning_milestones enable row level security;

drop policy if exists planning_goals_member on public.household_planning_goals;
create policy planning_goals_member on public.household_planning_goals for all to authenticated
using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

drop policy if exists planning_milestones_member on public.planning_milestones;
create policy planning_milestones_member on public.planning_milestones for all to authenticated
using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

grant select,insert,update,delete on public.household_planning_goals,public.planning_milestones to authenticated;

alter table public.notification_preferences add column if not exists planning boolean not null default true;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
check (type in ('payment','event','task','birthday','budget','goal','document','maintenance','pantry','planning','system'));


CREATE OR REPLACE FUNCTION public.planning_account_balance(p_account_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.finance_accounts%rowtype;
  v_balance numeric:=0;
begin
  select * into a from public.finance_accounts where id=p_account_id;
  if not found then return 0; end if;
  v_balance:=coalesce(a.opening_balance,0);

  select v_balance+coalesce(sum(
    case
      when a.account_class='asset' then case when t.type='income' then t.amount else -t.amount end
      else case when t.type='expense' then t.amount else -t.amount end
    end
  ),0)
  into v_balance
  from public.transactions t
  where t.account_id=a.id;

  select v_balance+coalesce(sum(
    case
      when tr.from_account_id=a.id then case when a.account_class='asset' then -tr.amount else tr.amount end
      when tr.to_account_id=a.id then case when a.account_class='asset' then tr.amount else -tr.amount end
      else 0
    end
  ),0)
  into v_balance
  from public.finance_transfers tr
  where tr.from_account_id=a.id or tr.to_account_id=a.id;

  return greatest(0,v_balance);
end;
$function$;

CREATE OR REPLACE FUNCTION public.planning_goal_current_amount(p_goal_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  g public.household_planning_goals%rowtype;
  v_amount numeric:=0;
begin
  select * into g from public.household_planning_goals where id=p_goal_id;
  if not found then return 0; end if;

  if g.linked_savings_goal_id is not null then
    select coalesce(sum(amount),0) into v_amount
    from public.goal_contributions
    where goal_id=g.linked_savings_goal_id and household_id=g.household_id;
    return greatest(0,v_amount);
  end if;

  if g.linked_account_id is not null and g.goal_type='debt' then
    select opening_balance into v_amount
    from public.finance_accounts
    where id=g.linked_account_id and household_id=g.household_id and account_class='liability';
    if not found then return greatest(0,g.current_amount); end if;
    return greatest(0,coalesce(v_amount,0)-public.planning_account_balance(g.linked_account_id));
  end if;

  return greatest(0,g.current_amount);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_planning_goal(p_household_id uuid, p_title text, p_goal_type text, p_horizon_months integer, p_target_date date, p_target_amount numeric DEFAULT NULL::numeric, p_current_amount numeric DEFAULT 0, p_priority text DEFAULT 'medium'::text, p_description text DEFAULT NULL::text, p_linked_savings_goal_id uuid DEFAULT NULL::uuid, p_linked_account_id uuid DEFAULT NULL::uuid, p_linked_maintenance_id uuid DEFAULT NULL::uuid, p_linked_event_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_today date:=(now() at time zone 'America/Guatemala')::date;
  v_mid date;
  v_tab text;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'Title is required'; end if;
  if p_horizon_months not in (1,3,6,12) then raise exception 'Invalid horizon'; end if;
  if p_target_date<v_today then raise exception 'Target date cannot be in the past'; end if;

  if p_linked_savings_goal_id is not null and not exists(
    select 1 from public.savings_goals where id=p_linked_savings_goal_id and household_id=p_household_id
  ) then raise exception 'Invalid savings goal'; end if;

  if p_linked_account_id is not null and not exists(
    select 1 from public.finance_accounts where id=p_linked_account_id and household_id=p_household_id
  ) then raise exception 'Invalid finance account'; end if;

  if p_linked_maintenance_id is not null and not exists(
    select 1 from public.maintenance_schedules where id=p_linked_maintenance_id and household_id=p_household_id
  ) then raise exception 'Invalid maintenance plan'; end if;

  if p_linked_event_id is not null and not exists(
    select 1 from public.events where id=p_linked_event_id and household_id=p_household_id
  ) then raise exception 'Invalid event'; end if;

  insert into public.household_planning_goals(
    household_id,title,goal_type,description,horizon_months,target_date,target_amount,current_amount,priority,
    linked_savings_goal_id,linked_account_id,linked_maintenance_id,linked_event_id,notes
  ) values(
    p_household_id,trim(p_title),p_goal_type,nullif(trim(p_description),''),p_horizon_months,p_target_date,
    p_target_amount,greatest(0,coalesce(p_current_amount,0)),p_priority,p_linked_savings_goal_id,p_linked_account_id,
    p_linked_maintenance_id,p_linked_event_id,nullif(trim(p_notes),'')
  ) returning id into v_id;

  v_mid:=v_today+greatest(1,((p_target_date-v_today)/2))::integer;

  v_tab:=case
    when p_goal_type in ('saving','purchase','housing','vehicle','debt','travel') then 'presupuesto'
    when p_goal_type='maintenance' then 'mantenimiento'
    when p_goal_type='event' then 'calendario'
    else 'inicio'
  end;

  insert into public.planning_milestones(household_id,planning_goal_id,title,due_date,sort_order,linked_tab)
  values
    (p_household_id,v_id,
      case when p_goal_type in ('saving','purchase','housing','vehicle','debt','travel') then 'Revisar presupuesto y capacidad mensual'
           when p_goal_type='maintenance' then 'Confirmar alcance, proveedor y costo'
           when p_goal_type='event' then 'Definir fecha, presupuesto y responsables'
           else 'Definir alcance y próximos pasos' end,
      least(v_today+7,p_target_date),10,v_tab),
    (p_household_id,v_id,'Revisión de avance al 50%',least(v_mid,p_target_date),20,v_tab),
    (p_household_id,v_id,'Completar objetivo',p_target_date,30,v_tab);

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_household_plan(p_household_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=(now() at time zone 'America/Guatemala')::date;
  v_goals jsonb:='[]'::jsonb;
  v_monthly_required numeric:=0;
  v_active integer:=0;v_at_risk integer:=0;v_due_soon integer:=0;v_completed integer:=0;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;

  with enriched as (
    select
      g.*,
      public.planning_goal_current_amount(g.id) derived_current,
      greatest(0,coalesce(g.target_amount,0)-public.planning_goal_current_amount(g.id)) remaining,
      greatest(1,ceil(greatest(0,g.target_date-v_today)/30.44)::int) months_remaining,
      coalesce((select count(*) from public.planning_milestones m where m.planning_goal_id=g.id),0)::int milestone_count,
      coalesce((select count(*) from public.planning_milestones m where m.planning_goal_id=g.id and m.status='completed'),0)::int milestone_done,
      coalesce((select count(*) from public.planning_milestones m where m.planning_goal_id=g.id and m.status='pending' and m.due_date<v_today),0)::int milestone_overdue
    from public.household_planning_goals g
    where g.household_id=p_household_id
  ), scored as (
    select e.*,
      case
        when e.status='completed' then 100
        when e.target_amount is not null and e.target_amount>0 then least(100,round(e.derived_current/e.target_amount*100))
        when e.milestone_count>0 then least(100,round(e.milestone_done::numeric/e.milestone_count*100))
        else 0 end progress_pct,
      case
        when e.status='completed' then 'completed'
        when e.target_date<v_today then 'overdue'
        when e.milestone_overdue>0 then 'at_risk'
        when e.target_amount is not null and e.target_amount>0
          and e.derived_current/e.target_amount <
            least(1,greatest(0,1-(e.target_date-v_today)::numeric/greatest(1,(e.target_date-e.created_at::date)::numeric)))-0.12
          then 'at_risk'
        when e.target_date<=v_today+30 then 'due_soon'
        else 'on_track' end pace_status,
      case when e.target_amount is not null and e.target_amount>0
        then greatest(0,e.target_amount-e.derived_current)/greatest(1,e.months_remaining)
        else null end required_monthly
    from enriched e
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'title',title,'goal_type',goal_type,'description',description,'horizon_months',horizon_months,
    'target_date',target_date,'target_amount',target_amount,'current_amount',derived_current,'manual_current_amount',current_amount,
    'priority',priority,'status',status,'progress_pct',progress_pct,'pace_status',pace_status,'remaining',remaining,
    'months_remaining',months_remaining,'required_monthly',required_monthly,
    'milestone_count',milestone_count,'milestone_done',milestone_done,'milestone_overdue',milestone_overdue,
    'linked_savings_goal_id',linked_savings_goal_id,'linked_account_id',linked_account_id,
    'linked_maintenance_id',linked_maintenance_id,'linked_event_id',linked_event_id,'notes',notes
  ) order by
    case priority when 'high' then 1 when 'medium' then 2 else 3 end,
    target_date),'[]'::jsonb)
  into v_goals
  from scored;

  with e as (
    select
      g.status,g.target_date,g.target_amount,
      public.planning_goal_current_amount(g.id) current_amount,
      greatest(1,ceil(greatest(0,g.target_date-v_today)/30.44)::int) months_remaining,
      coalesce((select count(*) from public.planning_milestones m where m.planning_goal_id=g.id and m.status='pending' and m.due_date<v_today),0)::int milestone_overdue
    from public.household_planning_goals g
    where g.household_id=p_household_id
  )
  select
    count(*) filter(where status='active')::int,
    count(*) filter(where status='active' and (target_date<v_today or milestone_overdue>0))::int,
    count(*) filter(where status='active' and target_date between v_today and v_today+30)::int,
    count(*) filter(where status='completed')::int,
    coalesce(sum(case when status='active' and target_amount is not null and target_amount>0
      then greatest(0,target_amount-current_amount)/greatest(1,months_remaining) else 0 end),0)
  into v_active,v_at_risk,v_due_soon,v_completed,v_monthly_required
  from e;

  return jsonb_build_object(
    'summary',jsonb_build_object(
      'active',v_active,'at_risk',v_at_risk,'due_soon',v_due_soon,'completed',v_completed,
      'monthly_required',round(v_monthly_required,2)
    ),
    'goals',v_goals,
    'generated_at',now()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_planning_milestone(p_milestone_id uuid, p_completed boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.planning_milestones%rowtype;
begin
  select * into m from public.planning_milestones where id=p_milestone_id;
  if not found then raise exception 'Milestone not found'; end if;
  if not public.is_household_member(m.household_id) then raise exception 'Not a household member'; end if;

  update public.planning_milestones
  set status=case when p_completed then 'completed' else 'pending' end,
      completed_at=case when p_completed then now() else null end,
      updated_at=now()
  where id=p_milestone_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_planning_notifications_for_household(p_household_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_today date:=(now() at time zone 'America/Guatemala')::date;
begin
  insert into public.notifications(
    household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at
  )
  select
    g.household_id,hm.user_id,'planning',
    case when g.target_date<v_today then 'danger' when g.target_date<=v_today+14 then 'warning' else 'info' end,
    case when g.target_date<v_today then 'Objetivo vencido'
         when g.target_date<=v_today+14 then 'Objetivo muy próximo'
         else 'Objetivo próximo' end,
    g.title||' · '||case when g.target_date<v_today then 'venció ' else 'vence ' end||to_char(g.target_date,'DD Mon YYYY'),
    'planeacion','planning_goal',g.id,
    'planning-goal-'||g.id::text||'-'||g.target_date::text||
      case when g.target_date<v_today then '-overdue' when g.target_date<=v_today+14 then '-14' else '-30' end,
    (g.target_date::timestamptz)+interval '30 days'
  from public.household_planning_goals g
  join public.household_members hm on hm.household_id=g.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where g.household_id=p_household_id and g.status='active'
    and g.target_date<=v_today+30 and np.planning=true
  on conflict(user_id,dedupe_key) do nothing;

  insert into public.notifications(
    household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at
  )
  select
    m.household_id,hm.user_id,'planning',
    case when m.due_date<v_today then 'danger' else 'warning' end,
    case when m.due_date<v_today then 'Paso de plan vencido' else 'Paso de plan próximo' end,
    g.title||' · '||m.title,
    'planeacion','planning_milestone',m.id,
    'planning-milestone-'||m.id::text||'-'||m.due_date::text||
      case when m.due_date<v_today then '-overdue' else '-7' end,
    (m.due_date::timestamptz)+interval '14 days'
  from public.planning_milestones m
  join public.household_planning_goals g on g.id=m.planning_goal_id
  join public.household_members hm on hm.household_id=m.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where m.household_id=p_household_id and m.status='pending' and g.status='active'
    and m.due_date is not null and m.due_date<=v_today+7 and np.planning=true
  on conflict(user_id,dedupe_key) do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_all_planning_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  for r in select id from public.households loop
    perform public.refresh_planning_notifications_for_household(r.id);
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_my_notifications(p_household_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  perform public.refresh_notifications_for_household(p_household_id);
  perform public.refresh_recurring_event_notifications_for_household(p_household_id);
  perform public.refresh_document_notifications_for_household(p_household_id);
  perform public.refresh_maintenance_notifications_for_household(p_household_id);
  perform public.refresh_planning_notifications_for_household(p_household_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_household_automation()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.generate_recurring_occurrences(
    date_trunc('month',(now() at time zone 'America/Guatemala'))::date,12
  );
  perform public.run_all_household_automation_rules();
  perform public.refresh_all_notifications();
  perform public.refresh_all_recurring_event_notifications();
  perform public.refresh_all_document_notifications();
  perform public.refresh_all_maintenance_notifications();
  perform public.refresh_all_planning_notifications();
  perform public.refresh_all_monthly_close_notifications();
  perform public.refresh_all_net_worth_snapshots();
end;
$function$;


revoke execute on function public.planning_account_balance(uuid) from public,anon,authenticated;
revoke execute on function public.planning_goal_current_amount(uuid) from public,anon,authenticated;
revoke execute on function public.create_planning_goal(uuid,text,text,integer,date,numeric,numeric,text,text,uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.create_planning_goal(uuid,text,text,integer,date,numeric,numeric,text,text,uuid,uuid,uuid,uuid,text) to authenticated;
revoke execute on function public.get_household_plan(uuid) from public,anon;
grant execute on function public.get_household_plan(uuid) to authenticated;
revoke execute on function public.complete_planning_milestone(uuid,boolean) from public,anon;
grant execute on function public.complete_planning_milestone(uuid,boolean) to authenticated;
revoke execute on function public.refresh_planning_notifications_for_household(uuid) from public,anon,authenticated;
revoke execute on function public.refresh_all_planning_notifications() from public,anon,authenticated;
revoke execute on function public.refresh_my_notifications(uuid) from public,anon;
grant execute on function public.refresh_my_notifications(uuid) to authenticated;
revoke execute on function public.run_household_automation() from public,anon,authenticated;
grant execute on function public.run_household_automation() to service_role;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='household_planning_goals') then alter publication supabase_realtime add table public.household_planning_goals; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='planning_milestones') then alter publication supabase_realtime add table public.planning_milestones; end if;
end $$;
