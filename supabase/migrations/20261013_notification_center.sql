-- Notification center + scheduled household alerts.
create extension if not exists pg_cron;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('payment','event','task','birthday','budget','goal','system')),
  severity text not null default 'info' check (severity in ('info','warning','danger','success')),
  title text not null,
  body text,
  action_tab text,
  entity_type text,
  entity_id uuid,
  dedupe_key text not null,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (user_id,dedupe_key)
);

create table if not exists public.notification_preferences (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  browser_notifications boolean not null default false,
  payments boolean not null default true,
  events boolean not null default true,
  tasks boolean not null default true,
  birthdays boolean not null default true,
  budget boolean not null default true,
  goals boolean not null default true,
  quiet_start time,
  quiet_end time,
  updated_at timestamptz not null default now(),
  primary key (household_id,user_id)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created on public.notifications(user_id,created_at desc);
create index if not exists idx_notifications_user_unread on public.notifications(user_id,read_at) where read_at is null;
create index if not exists idx_notifications_household on public.notifications(household_id);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);
create index if not exists idx_push_subscriptions_household on public.push_subscriptions(household_id);

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;

create policy notifications_select_own on public.notifications for select to authenticated
using (user_id=(select auth.uid()) and public.is_household_member(household_id));
create policy notifications_update_own on public.notifications for update to authenticated
using (user_id=(select auth.uid()) and public.is_household_member(household_id))
with check (user_id=(select auth.uid()) and public.is_household_member(household_id));
create policy notifications_delete_own on public.notifications for delete to authenticated
using (user_id=(select auth.uid()) and public.is_household_member(household_id));
create policy notification_preferences_own on public.notification_preferences for all to authenticated
using (user_id=(select auth.uid()) and public.is_household_member(household_id))
with check (user_id=(select auth.uid()) and public.is_household_member(household_id));
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
using (user_id=(select auth.uid()) and public.is_household_member(household_id))
with check (user_id=(select auth.uid()) and public.is_household_member(household_id));

grant select,update,delete on public.notifications to authenticated;
grant select,insert,update,delete on public.notification_preferences,public.push_subscriptions to authenticated;

create or replace function public.refresh_notifications_for_household(p_household_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_today date := (now() at time zone 'America/Guatemala')::date;
  v_month date := date_trunc('month',(now() at time zone 'America/Guatemala'))::date;
begin
  insert into public.notification_preferences(household_id,user_id)
  select hm.household_id,hm.user_id from public.household_members hm where hm.household_id=p_household_id
  on conflict (household_id,user_id) do nothing;

  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,dedupe_key,expires_at)
  select hm.household_id,hm.user_id,'system','info','Centro de alertas listo',
    'Aquí verás pagos, tareas, eventos, cumpleaños, presupuesto y metas que requieran atención.',
    'inicio','system-alert-center-v1',now()+interval '30 days'
  from public.household_members hm where hm.household_id=p_household_id
  on conflict (user_id,dedupe_key) do nothing;

  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select r.household_id,hm.user_id,'payment','danger','Pago vencido: '||r.description,
    'Venció el '||to_char(o.due_date,'DD Mon')||' · Q'||trim(to_char(r.amount,'FM999G999G990D00')),
    'presupuesto','recurring_occurrence',o.id,'payment-overdue-'||o.id::text,now()+interval '45 days'
  from public.recurring_transaction_occurrences o
  join public.recurring_transactions r on r.id=o.recurring_transaction_id
  join public.household_members hm on hm.household_id=r.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where r.household_id=p_household_id and r.type='expense' and r.active and o.status='pending'
    and o.due_date<v_today and np.payments
  on conflict (user_id,dedupe_key) do nothing;

  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select r.household_id,hm.user_id,'payment','warning',
    case when o.due_date=v_today then 'Pago vence hoy: ' else 'Pago próximo: ' end||r.description,
    'Vence '||to_char(o.due_date,'DD Mon')||' · Q'||trim(to_char(r.amount,'FM999G999G990D00')),
    'presupuesto','recurring_occurrence',o.id,'payment-upcoming-'||o.id::text,(o.due_date::timestamptz)+interval '7 days'
  from public.recurring_transaction_occurrences o
  join public.recurring_transactions r on r.id=o.recurring_transaction_id
  join public.household_members hm on hm.household_id=r.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where r.household_id=p_household_id and r.type='expense' and r.active and o.status='pending'
    and o.due_date between v_today and v_today+3 and np.payments
  on conflict (user_id,dedupe_key) do nothing;

  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select li.household_id,hm.user_id,'task',case when li.due_date<v_today then 'danger' else 'warning' end,
    case when li.due_date<v_today then 'Tarea vencida' when li.due_date=v_today then 'Tarea para hoy' else 'Tarea próxima' end,
    li.text||' · '||to_char(li.due_date,'DD Mon'),'listas','list_item',li.id,
    'task-due-'||li.id::text||'-'||li.due_date::text,(li.due_date::timestamptz)+interval '14 days'
  from public.list_items li
  join public.household_members hm on hm.household_id=li.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where li.household_id=p_household_id and not li.completed and li.due_date is not null
    and li.due_date<=v_today+1 and np.tasks and (li.assigned_to is null or li.assigned_to=hm.user_id)
  on conflict (user_id,dedupe_key) do nothing;

  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select e.household_id,hm.user_id,'event','info',
    case when e.event_date=v_today then 'Evento hoy' else 'Evento mañana' end,
    e.title||coalesce(' · '||to_char(e.start_time,'HH24:MI'),''),
    'calendario','event',e.id,'event-upcoming-'||e.id::text||'-'||e.event_date::text,(e.event_date::timestamptz)+interval '3 days'
  from public.events e
  join public.household_members hm on hm.household_id=e.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where e.household_id=p_household_id and e.event_date between v_today and v_today+1 and np.events
    and (e.assigned_to is null or e.assigned_to=hm.user_id)
  on conflict (user_id,dedupe_key) do nothing;

  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select p_household_id,hm_target.user_id,'birthday','info',
    case when b.next_birthday=v_today then 'Cumpleaños hoy 🎉' else 'Cumpleaños próximo' end,
    'Cumpleaños de '||coalesce(p.full_name,'Miembro')||' · '||to_char(b.next_birthday,'DD Mon'),
    'familia','profile',p.id,'birthday-'||p.id::text||'-'||extract(year from b.next_birthday)::int,(b.next_birthday::timestamptz)+interval '2 days'
  from public.household_members hm_person
  join public.profiles p on p.id=hm_person.user_id and p.birth_date is not null
  cross join lateral (
    select case
      when make_date(extract(year from v_today)::int,extract(month from p.birth_date)::int,
        least(extract(day from p.birth_date)::int,extract(day from(date_trunc('month',make_date(extract(year from v_today)::int,extract(month from p.birth_date)::int,1))+interval '1 month - 1 day'))::int))>=v_today
      then make_date(extract(year from v_today)::int,extract(month from p.birth_date)::int,
        least(extract(day from p.birth_date)::int,extract(day from(date_trunc('month',make_date(extract(year from v_today)::int,extract(month from p.birth_date)::int,1))+interval '1 month - 1 day'))::int))
      else make_date(extract(year from v_today)::int+1,extract(month from p.birth_date)::int,
        least(extract(day from p.birth_date)::int,extract(day from(date_trunc('month',make_date(extract(year from v_today)::int+1,extract(month from p.birth_date)::int,1))+interval '1 month - 1 day'))::int))
    end next_birthday
  ) b
  join public.household_members hm_target on hm_target.household_id=hm_person.household_id
  join public.notification_preferences np on np.household_id=hm_target.household_id and np.user_id=hm_target.user_id
  where hm_person.household_id=p_household_id and b.next_birthday between v_today and v_today+7 and np.birthdays
  on conflict (user_id,dedupe_key) do nothing;

  with actual as (
    select household_id,category_id,sum(amount)::numeric spent
    from public.transactions
    where household_id=p_household_id and type='expense' and transaction_date>=v_month
      and transaction_date<(v_month+interval '1 month')::date and category_id is not null
    group by household_id,category_id
  ), usage as (
    select ba.household_id,ba.category_id,bc.name,ba.planned_amount,coalesce(a.spent,0) spent,
      case when ba.planned_amount>0 then coalesce(a.spent,0)/ba.planned_amount else 0 end ratio
    from public.budget_allocations ba join public.budget_categories bc on bc.id=ba.category_id
    left join actual a on a.household_id=ba.household_id and a.category_id=ba.category_id
    where ba.household_id=p_household_id and ba.month=v_month and ba.planned_amount>0
  )
  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select u.household_id,hm.user_id,'budget',case when u.ratio>=1 then 'danger' else 'warning' end,
    case when u.ratio>=1 then 'Presupuesto excedido' else 'Presupuesto cerca del límite' end,
    u.name||' · '||round(u.ratio*100)::int||'% usado','presupuesto','budget_category',u.category_id,
    'budget-'||case when u.ratio>=1 then '100' else '90' end||'-'||v_month::text||'-'||u.category_id::text,
    (v_month+interval '2 months')::timestamptz
  from usage u join public.household_members hm on hm.household_id=u.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where u.ratio>=0.9 and np.budget
  on conflict (user_id,dedupe_key) do nothing;

  with saved as (
    select sg.id,sg.household_id,sg.name,sg.target_amount,coalesce(sum(gc.amount),0) saved
    from public.savings_goals sg left join public.goal_contributions gc on gc.goal_id=sg.id
    where sg.household_id=p_household_id and sg.active group by sg.id
  )
  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select s.household_id,hm.user_id,'goal','success','Meta alcanzada 🎯',
    s.name||' llegó a Q'||trim(to_char(s.saved,'FM999G999G990D00')),'presupuesto','savings_goal',s.id,
    'goal-reached-'||s.id::text,now()+interval '90 days'
  from saved s join public.household_members hm on hm.household_id=s.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where s.saved>=s.target_amount and np.goals
  on conflict (user_id,dedupe_key) do nothing;

  delete from public.notifications where expires_at is not null and expires_at<now();
end; $$;

create or replace function public.refresh_my_notifications(p_household_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  perform public.refresh_notifications_for_household(p_household_id);
end; $$;

create or replace function public.refresh_all_notifications()
returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
  for r in select id from public.households loop
    perform public.refresh_notifications_for_household(r.id);
  end loop;
end; $$;

revoke execute on function public.refresh_notifications_for_household(uuid) from public,anon,authenticated;
revoke execute on function public.refresh_all_notifications() from public,anon,authenticated;
revoke execute on function public.refresh_my_notifications(uuid) from public,anon;
grant execute on function public.refresh_my_notifications(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then alter publication supabase_realtime add table public.notifications; end if;
end $$;

select cron.schedule('nuestro-hogar-notification-refresh','0 * * * *','select public.refresh_all_notifications();');
