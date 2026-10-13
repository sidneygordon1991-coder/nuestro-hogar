-- House, vehicle, maintenance, warranty and service history.
alter table public.finance_assets
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists asset_year integer check (asset_year is null or (asset_year between 1900 and 2200)),
  add column if not exists serial_number text,
  add column if not exists license_plate text,
  add column if not exists current_mileage numeric check (current_mileage is null or current_mileage >= 0),
  add column if not exists purchase_date date,
  add column if not exists warranty_expires_on date;

alter table public.events drop constraint if exists events_category_check;
alter table public.events add constraint events_category_check
check (category in ('family','appointment','task','birthday','social','health','school','maintenance','other'));

create table if not exists public.maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid references public.finance_assets(id) on delete cascade,
  title text not null,
  maintenance_type text not null default 'service'
    check (maintenance_type in ('service','repair','inspection','insurance','registration','warranty','cleaning','other')),
  provider text,
  estimated_cost numeric check (estimated_cost is null or estimated_cost >= 0),
  assigned_to uuid references auth.users(id) on delete set null,
  next_due_date date,
  next_due_mileage numeric check (next_due_mileage is null or next_due_mileage >= 0),
  interval_months integer check (interval_months is null or (interval_months > 0 and interval_months <= 120)),
  interval_km numeric check (interval_km is null or interval_km > 0),
  last_completed_date date,
  last_completed_mileage numeric check (last_completed_mileage is null or last_completed_mileage >= 0),
  document_id uuid references public.household_documents(id) on delete set null,
  calendar_event_id uuid references public.events(id) on delete set null,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (next_due_date is not null or next_due_mileage is not null or interval_months is not null or interval_km is not null)
);

create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  schedule_id uuid references public.maintenance_schedules(id) on delete set null,
  asset_id uuid references public.finance_assets(id) on delete set null,
  title text not null,
  maintenance_type text not null default 'service',
  completed_date date not null default current_date,
  mileage numeric check (mileage is null or mileage >= 0),
  cost numeric check (cost is null or cost >= 0),
  provider text,
  document_id uuid references public.household_documents(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_maintenance_schedules_household_due on public.maintenance_schedules(household_id,next_due_date) where active=true;
create index if not exists idx_maintenance_schedules_asset on public.maintenance_schedules(asset_id);
create index if not exists idx_maintenance_schedules_assigned on public.maintenance_schedules(assigned_to);
create index if not exists idx_maintenance_records_household_date on public.maintenance_records(household_id,completed_date desc);
create index if not exists idx_maintenance_records_asset on public.maintenance_records(asset_id);

alter table public.maintenance_schedules enable row level security;
alter table public.maintenance_records enable row level security;

create policy maintenance_schedules_member on public.maintenance_schedules for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy maintenance_records_member on public.maintenance_records for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

grant select,insert,update,delete on public.maintenance_schedules,public.maintenance_records to authenticated;

alter table public.notification_preferences
  add column if not exists maintenance boolean not null default true;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
check (type in ('payment','event','task','birthday','budget','goal','document','maintenance','system'));

create or replace function public.sync_maintenance_event(p_schedule_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  s public.maintenance_schedules%rowtype;
  a public.finance_assets%rowtype;
  v_event_id uuid;
  v_description text;
begin
  select * into s from public.maintenance_schedules where id=p_schedule_id;
  if not found then raise exception 'Maintenance schedule not found'; end if;
  if not public.is_household_member(s.household_id) then raise exception 'Not a household member'; end if;

  if s.asset_id is not null then select * into a from public.finance_assets where id=s.asset_id; end if;

  if s.next_due_date is null or s.active=false then
    if s.calendar_event_id is not null then
      delete from public.events where id=s.calendar_event_id and household_id=s.household_id;
      update public.maintenance_schedules set calendar_event_id=null,updated_at=now() where id=s.id;
    end if;
    return;
  end if;

  v_description:=coalesce(case when a.id is not null then 'Activo: '||a.name else null end,'Mantenimiento del hogar');
  if s.provider is not null then v_description:=v_description||' · Proveedor: '||s.provider; end if;
  if s.next_due_mileage is not null then v_description:=v_description||' · Próximo: '||trim(to_char(s.next_due_mileage,'FM999G999G990'))||' km'; end if;

  if s.calendar_event_id is null then
    insert into public.events(household_id,title,description,event_date,event_type,category,assigned_to,all_day,recurrence,reminder_minutes)
    values(s.household_id,'Mantenimiento: '||s.title,v_description,s.next_due_date,'maintenance','maintenance',s.assigned_to,true,'none',1440)
    returning id into v_event_id;
    update public.maintenance_schedules set calendar_event_id=v_event_id,updated_at=now() where id=s.id;
  else
    update public.events set
      title='Mantenimiento: '||s.title,
      description=v_description,
      event_date=s.next_due_date,
      event_type='maintenance',
      category='maintenance',
      assigned_to=s.assigned_to,
      all_day=true,
      recurrence='none',
      recurrence_until=null,
      reminder_minutes=1440
    where id=s.calendar_event_id and household_id=s.household_id;
  end if;
end $$;

create or replace function public.complete_maintenance(
  p_schedule_id uuid,p_completed_date date,p_mileage numeric default null,p_cost numeric default null,
  p_provider text default null,p_document_id uuid default null,p_notes text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare
  s public.maintenance_schedules%rowtype;
  a public.finance_assets%rowtype;
  v_next_date date;
  v_next_mileage numeric;
  v_base_mileage numeric;
begin
  select * into s from public.maintenance_schedules where id=p_schedule_id for update;
  if not found then raise exception 'Maintenance schedule not found'; end if;
  if not public.is_household_member(s.household_id) then raise exception 'Not a household member'; end if;

  if s.asset_id is not null then select * into a from public.finance_assets where id=s.asset_id; end if;

  insert into public.maintenance_records(
    household_id,schedule_id,asset_id,title,maintenance_type,completed_date,mileage,cost,provider,document_id,notes
  ) values(
    s.household_id,s.id,s.asset_id,s.title,s.maintenance_type,p_completed_date,p_mileage,p_cost,
    coalesce(nullif(trim(p_provider),''),s.provider),coalesce(p_document_id,s.document_id),nullif(trim(p_notes),'')
  );

  if s.asset_id is not null and p_mileage is not null then
    update public.finance_assets set current_mileage=greatest(coalesce(current_mileage,0),p_mileage),updated_at=now()
    where id=s.asset_id and household_id=s.household_id;
  end if;

  if s.interval_months is not null then v_next_date:=(p_completed_date+make_interval(months=>s.interval_months))::date; else v_next_date:=null; end if;
  v_base_mileage:=coalesce(p_mileage,case when a.id is not null then a.current_mileage else null end,s.last_completed_mileage,s.next_due_mileage);
  if s.interval_km is not null and v_base_mileage is not null then v_next_mileage:=v_base_mileage+s.interval_km; else v_next_mileage:=null; end if;

  update public.maintenance_schedules set
    last_completed_date=p_completed_date,
    last_completed_mileage=coalesce(p_mileage,last_completed_mileage),
    provider=coalesce(nullif(trim(p_provider),''),provider),
    document_id=coalesce(p_document_id,document_id),
    next_due_date=v_next_date,
    next_due_mileage=v_next_mileage,
    active=(s.interval_months is not null or s.interval_km is not null),
    updated_at=now()
  where id=s.id;

  perform public.sync_maintenance_event(s.id);
end $$;

revoke execute on function public.sync_maintenance_event(uuid) from public,anon;
grant execute on function public.sync_maintenance_event(uuid) to authenticated;
revoke execute on function public.complete_maintenance(uuid,date,numeric,numeric,text,uuid,text) from public,anon;
grant execute on function public.complete_maintenance(uuid,date,numeric,numeric,text,uuid,text) to authenticated;

create or replace function public.refresh_maintenance_notifications_for_household(p_household_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_today date:=(now() at time zone 'America/Guatemala')::date;
begin
  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select s.household_id,hm.user_id,'maintenance',
    case when s.next_due_date<v_today then 'danger' when s.next_due_date<=v_today+7 then 'warning' else 'info' end,
    case when s.next_due_date<v_today then 'Mantenimiento vencido' when s.next_due_date=v_today then 'Mantenimiento para hoy' else 'Mantenimiento próximo' end,
    coalesce(a.name||' · ','')||s.title||' · '||case when s.next_due_date<v_today then 'venció ' else 'vence ' end||to_char(s.next_due_date,'DD Mon YYYY'),
    'mantenimiento','maintenance_schedule',s.id,
    'maintenance-date-'||s.id::text||'-'||s.next_due_date::text||case when s.next_due_date<v_today then '-expired' when s.next_due_date<=v_today+7 then '-7' else '-30' end,
    (s.next_due_date::timestamptz)+interval '45 days'
  from public.maintenance_schedules s
  left join public.finance_assets a on a.id=s.asset_id
  join public.household_members hm on hm.household_id=s.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where s.household_id=p_household_id and s.active and s.next_due_date is not null and s.next_due_date<=v_today+30
    and np.maintenance and (s.assigned_to is null or s.assigned_to=hm.user_id)
  on conflict(user_id,dedupe_key) do nothing;

  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select s.household_id,hm.user_id,'maintenance',
    case when coalesce(a.current_mileage,0)>=s.next_due_mileage then 'danger' else 'warning' end,
    case when coalesce(a.current_mileage,0)>=s.next_due_mileage then 'Mantenimiento por kilometraje' else 'Mantenimiento cerca por kilometraje' end,
    a.name||' · '||s.title||' · actual '||trim(to_char(coalesce(a.current_mileage,0),'FM999G999G990'))||' km / próximo '||trim(to_char(s.next_due_mileage,'FM999G999G990'))||' km',
    'mantenimiento','maintenance_schedule',s.id,
    'maintenance-km-'||s.id::text||'-'||trim(to_char(s.next_due_mileage,'FM999999999990'))||case when coalesce(a.current_mileage,0)>=s.next_due_mileage then '-due' else '-500' end,
    now()+interval '45 days'
  from public.maintenance_schedules s
  join public.finance_assets a on a.id=s.asset_id
  join public.household_members hm on hm.household_id=s.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where s.household_id=p_household_id and s.active and s.next_due_mileage is not null and a.current_mileage is not null
    and a.current_mileage>=greatest(0,s.next_due_mileage-500) and np.maintenance
    and (s.assigned_to is null or s.assigned_to=hm.user_id)
  on conflict(user_id,dedupe_key) do nothing;

  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select a.household_id,hm.user_id,'maintenance',
    case when a.warranty_expires_on<v_today then 'danger' when a.warranty_expires_on<=v_today+7 then 'warning' else 'info' end,
    case when a.warranty_expires_on<v_today then 'Garantía vencida' when a.warranty_expires_on=v_today then 'Garantía vence hoy' else 'Garantía por vencer' end,
    a.name||' · '||case when a.warranty_expires_on<v_today then 'venció ' else 'vence ' end||to_char(a.warranty_expires_on,'DD Mon YYYY'),
    'mantenimiento','finance_asset',a.id,
    'asset-warranty-'||a.id::text||'-'||a.warranty_expires_on::text||case when a.warranty_expires_on<v_today then '-expired' when a.warranty_expires_on<=v_today+7 then '-7' else '-30' end,
    (a.warranty_expires_on::timestamptz)+interval '45 days'
  from public.finance_assets a
  join public.household_members hm on hm.household_id=a.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where a.household_id=p_household_id and a.active and a.warranty_expires_on is not null and a.warranty_expires_on<=v_today+30 and np.maintenance
  on conflict(user_id,dedupe_key) do nothing;
end $$;

create or replace function public.refresh_all_maintenance_notifications()
returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
  for r in select id from public.households loop perform public.refresh_maintenance_notifications_for_household(r.id); end loop;
end $$;

create or replace function public.refresh_my_notifications(p_household_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  perform public.refresh_notifications_for_household(p_household_id);
  perform public.refresh_recurring_event_notifications_for_household(p_household_id);
  perform public.refresh_document_notifications_for_household(p_household_id);
  perform public.refresh_maintenance_notifications_for_household(p_household_id);
end $$;

create or replace function public.run_household_automation()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.generate_recurring_occurrences(date_trunc('month',(now() at time zone 'America/Guatemala'))::date,12);
  perform public.refresh_all_notifications();
  perform public.refresh_all_recurring_event_notifications();
  perform public.refresh_all_document_notifications();
  perform public.refresh_all_maintenance_notifications();
  perform public.refresh_all_net_worth_snapshots();
end $$;

revoke execute on function public.refresh_maintenance_notifications_for_household(uuid) from public,anon,authenticated;
revoke execute on function public.refresh_all_maintenance_notifications() from public,anon,authenticated;
revoke execute on function public.refresh_my_notifications(uuid) from public,anon;
grant execute on function public.refresh_my_notifications(uuid) to authenticated;
revoke execute on function public.run_household_automation() from public,anon,authenticated;
grant execute on function public.run_household_automation() to service_role;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='maintenance_schedules') then alter publication supabase_realtime add table public.maintenance_schedules; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='maintenance_records') then alter publication supabase_realtime add table public.maintenance_records; end if;
end $$;
