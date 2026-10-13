-- Intelligent household automation rules and audit history.
create table if not exists public.household_automation_rules (
  household_id uuid not null references public.households(id) on delete cascade,
  rule_key text not null check (rule_key in (
    'payment_due_alert','task_due_alert','budget_limit_alert','document_expiry_alert',
    'maintenance_date_alert','maintenance_mileage_alert','warranty_expiry_alert',
    'pantry_expiry_alert','pantry_low_to_shopping'
  )),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id,rule_key)
);

create table if not exists public.automation_rule_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  rule_key text not null,
  action text not null,
  affected_count integer not null default 0,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_rule_runs_household_created
  on public.automation_rule_runs(household_id,created_at desc);

alter table public.household_automation_rules enable row level security;
alter table public.automation_rule_runs enable row level security;

drop policy if exists automation_rules_member_select on public.household_automation_rules;
create policy automation_rules_member_select on public.household_automation_rules
for select to authenticated using (public.is_household_member(household_id));

drop policy if exists automation_runs_member_select on public.automation_rule_runs;
create policy automation_runs_member_select on public.automation_rule_runs
for select to authenticated using (public.is_household_member(household_id));

revoke insert,update,delete on public.household_automation_rules from authenticated;
revoke insert,update,delete on public.automation_rule_runs from authenticated;
grant select on public.household_automation_rules,public.automation_rule_runs to authenticated;

alter table public.notification_preferences add column if not exists pantry boolean not null default true;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
check (type in ('payment','event','task','birthday','budget','goal','document','maintenance','pantry','system'));

create or replace function public.seed_household_automation_rules(p_household_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.household_automation_rules(household_id,rule_key,enabled,config)
  values
    (p_household_id,'payment_due_alert',true,'{"days_before":3}'::jsonb),
    (p_household_id,'task_due_alert',true,'{"days_before":1}'::jsonb),
    (p_household_id,'budget_limit_alert',true,'{"threshold_percent":90}'::jsonb),
    (p_household_id,'document_expiry_alert',true,'{"days_before":30}'::jsonb),
    (p_household_id,'maintenance_date_alert',true,'{"days_before":30}'::jsonb),
    (p_household_id,'maintenance_mileage_alert',true,'{"km_before":500}'::jsonb),
    (p_household_id,'warranty_expiry_alert',true,'{"days_before":30}'::jsonb),
    (p_household_id,'pantry_expiry_alert',true,'{"days_before":7}'::jsonb),
    (p_household_id,'pantry_low_to_shopping',false,'{"list_title":"Supermercado"}'::jsonb)
  on conflict(household_id,rule_key) do nothing;
end $$;

create or replace function public.ensure_household_automation_rules(p_household_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  perform public.seed_household_automation_rules(p_household_id);
end $$;

create or replace function public.automation_rule_enabled(p_household_id uuid,p_rule_key text,p_default boolean default true)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select enabled from public.household_automation_rules where household_id=p_household_id and rule_key=p_rule_key),p_default);
$$;

create or replace function public.automation_rule_number(p_household_id uuid,p_rule_key text,p_field text,p_default numeric)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_value numeric;
begin
  select case
    when jsonb_typeof(config->p_field)='number' then (config->>p_field)::numeric
    when (config->>p_field) ~ '^-?[0-9]+([.][0-9]+)?$' then (config->>p_field)::numeric
    else null end
  into v_value
  from public.household_automation_rules
  where household_id=p_household_id and rule_key=p_rule_key;
  return coalesce(v_value,p_default);
end $$;

create or replace function public.clear_automation_rule_notifications(p_household_id uuid,p_rule_key text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_rule_key='payment_due_alert' then
    delete from public.notifications where household_id=p_household_id and type='payment' and entity_type='recurring_occurrence';
  elsif p_rule_key='task_due_alert' then
    delete from public.notifications where household_id=p_household_id and type='task' and entity_type='list_item';
  elsif p_rule_key='budget_limit_alert' then
    delete from public.notifications where household_id=p_household_id and type='budget' and entity_type='budget_category';
  elsif p_rule_key='document_expiry_alert' then
    delete from public.notifications where household_id=p_household_id and type='document' and entity_type='household_document';
  elsif p_rule_key in ('maintenance_date_alert','maintenance_mileage_alert','warranty_expiry_alert') then
    delete from public.notifications where household_id=p_household_id and type='maintenance';
  elsif p_rule_key='pantry_expiry_alert' then
    delete from public.notifications where household_id=p_household_id and type='pantry' and entity_type='pantry_item';
  end if;
end $$;

create or replace function public.update_household_automation_rule(
  p_household_id uuid,p_rule_key text,p_enabled boolean,p_config jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_days numeric;v_threshold numeric;v_km numeric;v_title text;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  perform public.seed_household_automation_rules(p_household_id);
  if not exists(select 1 from public.household_automation_rules where household_id=p_household_id and rule_key=p_rule_key) then raise exception 'Unknown automation rule'; end if;

  if p_rule_key in ('payment_due_alert','task_due_alert','document_expiry_alert','maintenance_date_alert','warranty_expiry_alert','pantry_expiry_alert') then
    v_days:=coalesce((p_config->>'days_before')::numeric,0);
    if v_days<0 or v_days>90 then raise exception 'days_before must be between 0 and 90'; end if;
  elsif p_rule_key='budget_limit_alert' then
    v_threshold:=coalesce((p_config->>'threshold_percent')::numeric,90);
    if v_threshold<50 or v_threshold>100 then raise exception 'threshold_percent must be between 50 and 100'; end if;
  elsif p_rule_key='maintenance_mileage_alert' then
    v_km:=coalesce((p_config->>'km_before')::numeric,500);
    if v_km<0 or v_km>10000 then raise exception 'km_before must be between 0 and 10000'; end if;
  elsif p_rule_key='pantry_low_to_shopping' then
    v_title:=left(trim(coalesce(p_config->>'list_title','Supermercado')),80);
    if v_title='' then p_config:=jsonb_set(coalesce(p_config,'{}'::jsonb),'{list_title}','"Supermercado"'::jsonb,true); end if;
  end if;

  update public.household_automation_rules
  set enabled=p_enabled,config=coalesce(p_config,'{}'::jsonb),updated_by=auth.uid(),updated_at=now()
  where household_id=p_household_id and rule_key=p_rule_key;

  perform public.clear_automation_rule_notifications(p_household_id,p_rule_key);

  insert into public.automation_rule_runs(household_id,rule_key,action,affected_count,summary)
  values(p_household_id,p_rule_key,'configured',0,case when p_enabled then 'Regla activada o actualizada' else 'Regla desactivada' end);

  return (select jsonb_build_object('rule_key',rule_key,'enabled',enabled,'config',config,'updated_at',updated_at)
          from public.household_automation_rules where household_id=p_household_id and rule_key=p_rule_key);
end $$;

create or replace function public.apply_household_automation_rules(p_household_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_today date := (now() at time zone 'America/Guatemala')::date;
  v_list_id uuid;v_list_title text;v_days integer;v_count integer:=0;v_total integer:=0;
begin
  perform public.seed_household_automation_rules(p_household_id);

  insert into public.notification_preferences(household_id,user_id)
  select household_id,user_id from public.household_members where household_id=p_household_id
  on conflict(household_id,user_id) do nothing;

  if public.automation_rule_enabled(p_household_id,'pantry_low_to_shopping',false) then
    select coalesce(nullif(trim(config->>'list_title'),''),'Supermercado')
    into v_list_title from public.household_automation_rules
    where household_id=p_household_id and rule_key='pantry_low_to_shopping';

    select id into v_list_id from public.lists
    where household_id=p_household_id and list_type='shopping'
    order by created_at limit 1;

    if v_list_id is null then
      insert into public.lists(household_id,title,list_type,created_by)
      values(p_household_id,coalesce(v_list_title,'Supermercado'),'shopping',auth.uid())
      returning id into v_list_id;
    end if;

    insert into public.list_items(household_id,list_id,text,quantity,notes,source_pantry_item_id,created_by)
    select p.household_id,v_list_id,p.name,
      trim(to_char(greatest(1,p.minimum_quantity-p.quantity),'FM999G999G990D99'))||' '||p.unit,
      'Agregado automáticamente por stock bajo',p.id,auth.uid()
    from public.pantry_items p
    where p.household_id=p_household_id and p.active=true and p.quantity<=p.minimum_quantity
      and not exists(select 1 from public.list_items li
        where li.household_id=p_household_id and li.list_id=v_list_id and li.completed=false and li.source_pantry_item_id=p.id);

    get diagnostics v_count=row_count;v_total:=v_total+v_count;

    if v_count>0 then
      insert into public.automation_rule_runs(household_id,rule_key,action,affected_count,summary)
      values(p_household_id,'pantry_low_to_shopping','items_added',v_count,
        v_count||' producto'||case when v_count=1 then '' else 's' end||' agregado'||case when v_count=1 then '' else 's' end||' a la lista de compras');

      insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,dedupe_key,expires_at)
      select p_household_id,hm.user_id,'pantry','success','Supermercado actualizado automáticamente',
        v_count||' producto'||case when v_count=1 then '' else 's' end||' con stock bajo se agregó'||case when v_count=1 then '' else 'n' end||' a la lista.',
        'listas','automation_rule','auto-pantry-shopping-'||v_today::text,now()+interval '7 days'
      from public.household_members hm
      join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
      where hm.household_id=p_household_id and np.pantry=true
      on conflict(user_id,dedupe_key) do nothing;
    end if;
  end if;

  if public.automation_rule_enabled(p_household_id,'pantry_expiry_alert',true) then
    v_days:=greatest(0,least(90,public.automation_rule_number(p_household_id,'pantry_expiry_alert','days_before',7)::integer));
    insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
    select p.household_id,hm.user_id,'pantry',
      case when p.expires_on<v_today then 'danger' when p.expires_on<=v_today+2 then 'warning' else 'info' end,
      case when p.expires_on<v_today then 'Producto vencido' when p.expires_on=v_today then 'Producto vence hoy' else 'Producto por vencer' end,
      p.name||' · '||case when p.expires_on<v_today then 'venció ' else 'vence ' end||to_char(p.expires_on,'DD Mon YYYY'),
      'comidas','pantry_item',p.id,'pantry-expiry-'||p.id::text||'-'||p.expires_on::text||'-'||v_days::text,
      (p.expires_on::timestamptz)+interval '14 days'
    from public.pantry_items p
    join public.household_members hm on hm.household_id=p.household_id
    join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
    where p.household_id=p_household_id and p.active=true and p.expires_on is not null
      and p.expires_on<=v_today+v_days and np.pantry=true
    on conflict(user_id,dedupe_key) do nothing;

    get diagnostics v_count=row_count;v_total:=v_total+v_count;
    if v_count>0 then
      insert into public.automation_rule_runs(household_id,rule_key,action,affected_count,summary)
      values(p_household_id,'pantry_expiry_alert','notifications_created',v_count,'Alertas de vencimiento de despensa creadas');
    end if;
  end if;

  return jsonb_build_object('affected',v_total,'executed_at',now());
end $$;

create or replace function public.run_my_household_automation_rules(p_household_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  v_result:=public.apply_household_automation_rules(p_household_id);
  perform public.refresh_my_notifications(p_household_id);
  return v_result;
end $$;

create or replace function public.run_all_household_automation_rules()
returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
  for r in select id from public.households loop perform public.apply_household_automation_rules(r.id); end loop;
end $$;

revoke execute on function public.seed_household_automation_rules(uuid) from public,anon,authenticated;
revoke execute on function public.automation_rule_enabled(uuid,text,boolean) from public,anon,authenticated;
revoke execute on function public.automation_rule_number(uuid,text,text,numeric) from public,anon,authenticated;
revoke execute on function public.clear_automation_rule_notifications(uuid,text) from public,anon,authenticated;
revoke execute on function public.apply_household_automation_rules(uuid) from public,anon,authenticated;
revoke execute on function public.run_all_household_automation_rules() from public,anon,authenticated;

revoke execute on function public.ensure_household_automation_rules(uuid) from public,anon;
grant execute on function public.ensure_household_automation_rules(uuid) to authenticated;
revoke execute on function public.update_household_automation_rule(uuid,text,boolean,jsonb) from public,anon;
grant execute on function public.update_household_automation_rule(uuid,text,boolean,jsonb) to authenticated;
revoke execute on function public.run_my_household_automation_rules(uuid) from public,anon;
grant execute on function public.run_my_household_automation_rules(uuid) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='household_automation_rules') then
    alter publication supabase_realtime add table public.household_automation_rules;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='automation_rule_runs') then
    alter publication supabase_realtime add table public.automation_rule_runs;
  end if;
end $$;
