-- Product quality diagnostics, error telemetry and deployment integrity.
alter table public.household_member_access drop constraint if exists household_member_access_module_check;
alter table public.household_member_access
  add constraint household_member_access_module_check
  check (module in ('finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations','backups','diagnostics'));

create table if not exists public.app_error_logs(
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  source text not null,
  message text not null,
  stack text,
  context jsonb not null default '{}'::jsonb,
  app_version text,
  url text,
  user_agent text,
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
create index if not exists idx_app_error_logs_household_last on public.app_error_logs(household_id,last_seen_at desc);
create index if not exists idx_app_error_logs_open on public.app_error_logs(household_id,last_seen_at desc) where resolved_at is null;
alter table public.app_error_logs enable row level security;
drop policy if exists app_error_logs_admin_select on public.app_error_logs;
create policy app_error_logs_admin_select on public.app_error_logs for select to authenticated
using (public.can_view_household_module(household_id,'diagnostics'));
revoke insert,update,delete on public.app_error_logs from authenticated;
grant select on public.app_error_logs to authenticated;

create table if not exists public.household_diagnostic_runs(
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  score integer not null check(score between 0 and 100),
  status text not null check(status in ('excellent','healthy','attention','risk')),
  error_count integer not null default 0,
  warning_count integer not null default 0,
  info_count integer not null default 0,
  checks jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_diagnostic_runs_household_created on public.household_diagnostic_runs(household_id,created_at desc);
alter table public.household_diagnostic_runs enable row level security;
drop policy if exists diagnostic_runs_admin_select on public.household_diagnostic_runs;
create policy diagnostic_runs_admin_select on public.household_diagnostic_runs for select to authenticated
using (public.can_view_household_module(household_id,'diagnostics'));
revoke insert,update,delete on public.household_diagnostic_runs from authenticated;
grant select on public.household_diagnostic_runs to authenticated;


CREATE OR REPLACE FUNCTION public.default_household_module_access(p_role text, p_module text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if p_module in ('backups','diagnostics') then
    if p_role in ('owner','admin') then return 'edit'; end if;
    return 'none';
  end if;
  if p_role in ('owner','admin','adult','member') then return 'edit'; end if;
  if p_role='teen' then
    if p_module in ('calendar','lists','meals') then return 'edit'; end if;
    if p_module in ('maintenance','planning') then return 'view'; end if;
    return 'none';
  end if;
  if p_role='guest' then
    if p_module in ('calendar','lists','meals') then return 'view'; end if;
    return 'none';
  end if;
  return 'none';
end $function$;

CREATE OR REPLACE FUNCTION public.household_module_access_for_user(p_household_id uuid, p_user_id uuid, p_module text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_override text;
begin
  if p_module not in ('finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations','backups','diagnostics') then return 'none'; end if;
  select role into v_role from public.household_members where household_id=p_household_id and user_id=p_user_id;
  if v_role is null then return 'none'; end if;
  if p_module in ('backups','diagnostics') then return case when v_role in ('owner','admin') then 'edit' else 'none' end; end if;
  if v_role in ('owner','admin') then return 'edit'; end if;
  select access_level into v_override from public.household_member_access
  where household_id=p_household_id and user_id=p_user_id and module=p_module;
  return coalesce(v_override,public.default_household_module_access(v_role,p_module));
end $function$;

CREATE OR REPLACE FUNCTION public.get_my_household_access(p_household_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_modules jsonb:='{}'::jsonb;v_module text;v_level text;
begin
  v_role:=public.household_role_for_user(p_household_id,auth.uid());
  if v_role is null then raise exception 'Not a household member'; end if;
  foreach v_module in array array['finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations','backups','diagnostics'] loop
    if public.can_edit_household_module(p_household_id,v_module) then v_level:='edit';
    elsif public.can_view_household_module(p_household_id,v_module) then v_level:='view';
    else v_level:='none'; end if;
    v_modules:=v_modules||jsonb_build_object(v_module,v_level);
  end loop;
  return jsonb_build_object(
    'role',v_role,
    'can_manage_members',public.can_manage_household_members(p_household_id),
    'can_view_audit',public.can_view_household_audit(p_household_id),
    'modules',v_modules
  );
end $function$;

CREATE OR REPLACE FUNCTION public.get_household_member_access(p_household_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_effective jsonb:='{}'::jsonb;v_overrides jsonb:='{}'::jsonb;v_module text;
begin
  if not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  v_role:=public.household_role_for_user(p_household_id,p_user_id);
  if v_role is null then raise exception 'Member not found'; end if;
  foreach v_module in array array['finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations','backups','diagnostics'] loop
    v_effective:=v_effective||jsonb_build_object(v_module,public.household_module_access_for_user(p_household_id,p_user_id,v_module));
  end loop;
  select coalesce(jsonb_object_agg(module,access_level),'{}'::jsonb) into v_overrides
  from public.household_member_access
  where household_id=p_household_id and user_id=p_user_id and module not in ('backups','diagnostics');
  return jsonb_build_object('role',v_role,'effective',v_effective,'overrides',v_overrides);
end $function$;

CREATE OR REPLACE FUNCTION public.log_client_error(p_household_id uuid, p_source text, p_message text, p_stack text DEFAULT NULL::text, p_context jsonb DEFAULT '{}'::jsonb, p_app_version text DEFAULT NULL::text, p_url text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then return null; end if;
  if nullif(trim(p_message),'') is null then return null; end if;

  select id into v_id
  from public.app_error_logs
  where household_id=p_household_id and user_id=auth.uid()
    and source=left(coalesce(p_source,'client'),80)
    and message=left(p_message,1000)
    and resolved_at is null
    and last_seen_at>=now()-interval '5 minutes'
  order by last_seen_at desc limit 1;

  if v_id is not null then
    update public.app_error_logs
    set occurrence_count=occurrence_count+1,last_seen_at=now(),
        stack=coalesce(left(p_stack,6000),stack),
        context=coalesce(p_context,'{}'::jsonb),
        app_version=coalesce(left(p_app_version,40),app_version),
        url=coalesce(left(p_url,1000),url),
        user_agent=coalesce(left(p_user_agent,600),user_agent)
    where id=v_id;
    return v_id;
  end if;

  insert into public.app_error_logs(
    household_id,user_id,source,message,stack,context,app_version,url,user_agent
  ) values(
    p_household_id,auth.uid(),left(coalesce(p_source,'client'),80),left(p_message,1000),
    left(p_stack,6000),coalesce(p_context,'{}'::jsonb),left(p_app_version,40),left(p_url,1000),left(p_user_agent,600)
  ) returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.resolve_app_error(p_error_id uuid, p_resolved boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.app_error_logs%rowtype;
begin
  select * into v_row from public.app_error_logs where id=p_error_id;
  if not found then raise exception 'Error log not found'; end if;
  if not public.can_edit_household_module(v_row.household_id,'diagnostics') then raise exception 'Diagnostics access required'; end if;
  update public.app_error_logs
  set resolved_at=case when p_resolved then now() else null end,
      resolved_by=case when p_resolved then auth.uid() else null end
  where id=p_error_id;
end $function$;

CREATE OR REPLACE FUNCTION public.run_household_diagnostics(p_household_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=(now() at time zone 'America/Guatemala')::date;
  v_month date:=date_trunc('month',(now() at time zone 'America/Guatemala'))::date;
  v_checks jsonb:='[]'::jsonb;
  v_count integer;
  v_errors integer:=0;v_warnings integer:=0;v_info integer:=0;v_score integer:=100;v_status text;
  v_backup_age integer;
  v_run_id uuid;
begin
  if auth.uid() is null or not public.can_view_household_module(p_household_id,'diagnostics') then raise exception 'Diagnostics access required'; end if;

  select count(*)::int into v_count from (
    select t.id
    from public.transactions t
    left join public.transaction_splits s on s.transaction_id=t.id
    where t.household_id=p_household_id and t.is_shared=true
    group by t.id,t.amount
    having abs(coalesce(sum(s.share_amount),0)-t.amount)>0.01
  ) q;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','finance_split_mismatch','module','finance','title','Distribución de movimientos compartidos',
    'severity','error','status',case when v_count=0 then 'ok' else 'error' end,'count',v_count,
    'detail',case when v_count=0 then 'Todas las distribuciones compartidas cuadran con el total.'
      else v_count||' movimiento'||case when v_count=1 then '' else 's' end||' no cuadra'||case when v_count=1 then '' else 'n' end||' con sus participantes.' end,
    'action_tab','presupuesto'
  ));
  if v_count>0 then v_errors:=v_errors+1;v_score:=v_score-least(24,14+v_count*2); end if;

  select count(*)::int into v_count
  from public.recurring_transaction_occurrences o
  where o.household_id=p_household_id and (
    (o.status='paid' and o.transaction_id is null) or
    (o.status='pending' and o.transaction_id is not null)
  );
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','recurring_state','module','finance','title','Estado de pagos recurrentes',
    'severity','error','status',case when v_count=0 then 'ok' else 'error' end,'count',v_count,
    'detail',case when v_count=0 then 'Los pagos recurrentes y sus movimientos están sincronizados.'
      else v_count||' ocurrencia'||case when v_count=1 then '' else 's' end||' tiene un estado inconsistente.' end,
    'action_tab','presupuesto'
  ));
  if v_count>0 then v_errors:=v_errors+1;v_score:=v_score-least(20,12+v_count*2); end if;

  select count(*)::int into v_count
  from public.recurring_transactions r
  where r.household_id=p_household_id and r.active=true
    and not exists(
      select 1 from public.recurring_transaction_occurrences o
      where o.recurring_transaction_id=r.id and o.period_month=v_month
    );
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','recurring_missing_occurrence','module','finance','title','Generación de pagos del mes',
    'severity','warning','status',case when v_count=0 then 'ok' else 'warning' end,'count',v_count,
    'detail',case when v_count=0 then 'Todos los recurrentes activos tienen su ocurrencia del mes.'
      else v_count||' recurrente'||case when v_count=1 then '' else 's' end||' necesita'||case when v_count=1 then '' else 'n' end||' regeneración.' end,
    'action_tab','presupuesto'
  ));
  if v_count>0 then v_warnings:=v_warnings+1;v_score:=v_score-least(12,6+v_count); end if;

  select (
    (select count(*) from public.list_items li join public.lists l on l.id=li.list_id where li.household_id=p_household_id and l.household_id<>li.household_id)+
    (select count(*) from public.recipe_ingredients ri join public.recipes r on r.id=ri.recipe_id where ri.household_id=p_household_id and r.household_id<>ri.household_id)+
    (select count(*) from public.planning_milestones pm join public.household_planning_goals g on g.id=pm.planning_goal_id where pm.household_id=p_household_id and g.household_id<>pm.household_id)+
    (select count(*) from public.maintenance_records mr join public.maintenance_schedules ms on ms.id=mr.schedule_id where mr.household_id=p_household_id and ms.household_id<>mr.household_id)
  )::int into v_count;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','cross_household_links','module','system','title','Aislamiento entre hogares',
    'severity','error','status',case when v_count=0 then 'ok' else 'error' end,'count',v_count,
    'detail',case when v_count=0 then 'No hay relaciones detectadas entre registros de hogares distintos.'
      else 'Se detectaron '||v_count||' relaciones que deben revisarse inmediatamente.' end,
    'action_tab','familia'
  ));
  if v_count>0 then v_errors:=v_errors+1;v_score:=v_score-30; end if;

  select count(*)::int into v_count
  from public.household_members hm left join public.profiles p on p.id=hm.user_id
  where hm.household_id=p_household_id and p.id is null;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','member_profiles','module','family','title','Perfiles de integrantes',
    'severity','warning','status',case when v_count=0 then 'ok' else 'warning' end,'count',v_count,
    'detail',case when v_count=0 then 'Todos los integrantes tienen un perfil asociado.'
      else v_count||' integrante'||case when v_count=1 then '' else 's' end||' no tiene'||case when v_count=1 then '' else 'n' end||' perfil.' end,
    'action_tab','familia'
  ));
  if v_count>0 then v_warnings:=v_warnings+1;v_score:=v_score-least(10,5+v_count); end if;

  select count(*)::int into v_count from (
    select li.list_id,li.source_pantry_item_id
    from public.list_items li join public.lists l on l.id=li.list_id
    where li.household_id=p_household_id and l.list_type='shopping' and li.completed=false and li.source_pantry_item_id is not null
    group by li.list_id,li.source_pantry_item_id having count(*)>1
  ) q;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','shopping_duplicates','module','meals','title','Duplicados de reposición',
    'severity','warning','status',case when v_count=0 then 'ok' else 'warning' end,'count',v_count,
    'detail',case when v_count=0 then 'La lista de compras no tiene reposiciones duplicadas de despensa.'
      else v_count||' producto'||case when v_count=1 then '' else 's' end||' aparece'||case when v_count=1 then '' else 'n' end||' duplicado'||case when v_count=1 then '' else 's' end||'.' end,
    'action_tab','listas'
  ));
  if v_count>0 then v_warnings:=v_warnings+1;v_score:=v_score-least(10,4+v_count); end if;

  select count(*)::int into v_count
  from public.household_planning_goals g
  where g.household_id=p_household_id and g.status='completed'
    and exists(select 1 from public.planning_milestones m where m.planning_goal_id=g.id and m.status='pending');
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','planning_completed_pending','module','planning','title','Objetivos y pasos',
    'severity','warning','status',case when v_count=0 then 'ok' else 'warning' end,'count',v_count,
    'detail',case when v_count=0 then 'Los objetivos completados no dejan pasos pendientes.'
      else v_count||' objetivo'||case when v_count=1 then '' else 's' end||' completado'||case when v_count=1 then '' else 's' end||' conserva'||case when v_count=1 then '' else 'n' end||' pasos pendientes.' end,
    'action_tab','planeacion'
  ));
  if v_count>0 then v_warnings:=v_warnings+1;v_score:=v_score-least(10,4+v_count); end if;

  select count(*)::int into v_count
  from public.push_subscriptions
  where household_id=p_household_id and enabled=true and last_seen_at<now()-interval '45 days';
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','stale_push','module','notifications','title','Dispositivos de notificación',
    'severity','info','status',case when v_count=0 then 'ok' else 'info' end,'count',v_count,
    'detail',case when v_count=0 then 'No hay suscripciones push activas sin uso reciente.'
      else v_count||' dispositivo'||case when v_count=1 then '' else 's' end||' lleva'||case when v_count=1 then '' else 'n' end||' más de 45 días sin actividad.' end,
    'action_tab','inicio'
  ));
  if v_count>0 then v_info:=v_info+1;v_score:=v_score-least(4,v_count); end if;

  select count(*)::int into v_count
  from public.notifications where household_id=p_household_id and expires_at is not null and expires_at<now();
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','expired_notifications','module','notifications','title','Limpieza de notificaciones',
    'severity','info','status',case when v_count=0 then 'ok' else 'info' end,'count',v_count,
    'detail',case when v_count=0 then 'No hay notificaciones expiradas pendientes de limpieza.'
      else v_count||' notificación'||case when v_count=1 then '' else 'es' end||' expirada'||case when v_count=1 then '' else 's' end||' puede'||case when v_count=1 then '' else 'n' end||' limpiarse.' end,
    'action_tab','inicio'
  ));
  if v_count>0 then v_info:=v_info+1;v_score:=v_score-least(3,v_count); end if;

  select count(*)::int into v_count
  from public.household_recovery_items
  where household_id=p_household_id and restored_at is null and expires_at<now();
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','expired_recovery','module','backups','title','Papelera vencida',
    'severity','info','status',case when v_count=0 then 'ok' else 'info' end,'count',v_count,
    'detail',case when v_count=0 then 'La papelera no contiene elementos vencidos.'
      else v_count||' elemento'||case when v_count=1 then '' else 's' end||' vencido'||case when v_count=1 then '' else 's' end||' puede'||case when v_count=1 then '' else 'n' end||' purgarse.' end,
    'action_tab','respaldos'
  ));
  if v_count>0 then v_info:=v_info+1;v_score:=v_score-least(3,v_count); end if;

  select case when max(created_at) is null then 9999 else extract(day from now()-max(created_at))::int end
  into v_backup_age from public.household_backups where household_id=p_household_id;
  v_count:=case when v_backup_age>14 then 1 else 0 end;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','backup_recency','module','backups','title','Antigüedad del respaldo',
    'severity','warning','status',case when v_count=0 then 'ok' else 'warning' end,'count',v_count,
    'detail',case when v_backup_age=9999 then 'Todavía no existe un respaldo del hogar.'
                  when v_backup_age>14 then 'El último respaldo tiene '||v_backup_age||' días.'
                  else 'El último respaldo tiene '||v_backup_age||' día'||case when v_backup_age=1 then '' else 's' end||'.' end,
    'action_tab','respaldos'
  ));
  if v_count>0 then v_warnings:=v_warnings+1;v_score:=v_score-8; end if;

  select count(*)::int into v_count
  from public.app_error_logs
  where household_id=p_household_id and resolved_at is null and last_seen_at>=now()-interval '7 days';
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','client_errors','module','system','title','Errores de aplicación',
    'severity','warning','status',case when v_count=0 then 'ok' else 'warning' end,'count',v_count,
    'detail',case when v_count=0 then 'No se registraron errores de cliente sin resolver en los últimos 7 días.'
      else v_count||' error'||case when v_count=1 then '' else 'es' end||' sin resolver fue'||case when v_count=1 then '' else 'ron' end||' detectado'||case when v_count=1 then '' else 's' end||'.' end,
    'action_tab','diagnostico'
  ));
  if v_count>0 then v_warnings:=v_warnings+1;v_score:=v_score-least(15,6+v_count*2); end if;

  v_score:=greatest(0,least(100,v_score));
  v_status:=case when v_score>=95 then 'excellent' when v_score>=85 then 'healthy' when v_score>=70 then 'attention' else 'risk' end;

  insert into public.household_diagnostic_runs(household_id,score,status,error_count,warning_count,info_count,checks,created_by)
  values(p_household_id,v_score,v_status,v_errors,v_warnings,v_info,v_checks,auth.uid())
  returning id into v_run_id;

  return jsonb_build_object(
    'run_id',v_run_id,'score',v_score,'status',v_status,'error_count',v_errors,'warning_count',v_warnings,
    'info_count',v_info,'checks',v_checks,'generated_at',now()
  );
end $function$;

CREATE OR REPLACE FUNCTION public.run_household_diagnostic_maintenance(p_household_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_month date:=date_trunc('month',(now() at time zone 'America/Guatemala'))::date;
  v_occurrences integer:=0;v_paid integer:=0;v_notifications integer:=0;v_recovery integer:=0;v_preferences integer:=0;
begin
  if auth.uid() is null or not public.can_edit_household_module(p_household_id,'diagnostics') then raise exception 'Diagnostics access required'; end if;

  insert into public.notification_preferences(household_id,user_id)
  select hm.household_id,hm.user_id
  from public.household_members hm
  where hm.household_id=p_household_id
  on conflict(household_id,user_id) do nothing;
  get diagnostics v_preferences=row_count;

  insert into public.recurring_transaction_occurrences(
    recurring_transaction_id,household_id,period_month,due_date,status
  )
  select
    r.id,r.household_id,m.period_month,
    (m.period_month + (least(r.due_day,extract(day from (m.period_month+interval '1 month - 1 day'))::int)-1))::date,
    'pending'
  from public.recurring_transactions r
  cross join lateral (
    select (v_month+make_interval(months=>g.n))::date period_month
    from generate_series(0,1) g(n)
  ) m
  where r.household_id=p_household_id and r.active=true
  on conflict(recurring_transaction_id,period_month) do nothing;
  get diagnostics v_occurrences=row_count;

  update public.recurring_transaction_occurrences
  set status='paid',paid_at=coalesce(paid_at,now()),updated_at=now()
  where household_id=p_household_id and status='pending' and transaction_id is not null;
  get diagnostics v_paid=row_count;

  delete from public.notifications
  where household_id=p_household_id and expires_at is not null and expires_at<now();
  get diagnostics v_notifications=row_count;

  delete from public.household_recovery_items
  where household_id=p_household_id and expires_at<now();
  get diagnostics v_recovery=row_count;

  perform public.run_my_household_automation_rules(p_household_id);
  perform public.refresh_my_notifications(p_household_id);

  insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,label,metadata)
  values(p_household_id,auth.uid(),'update','diagnostics','system_maintenance','Mantenimiento de integridad',
    jsonb_build_object('occurrences_created',v_occurrences,'recurring_states_fixed',v_paid,'expired_notifications_removed',v_notifications,
      'expired_recovery_removed',v_recovery,'notification_preferences_created',v_preferences));

  return jsonb_build_object(
    'occurrences_created',v_occurrences,'recurring_states_fixed',v_paid,
    'expired_notifications_removed',v_notifications,'expired_recovery_removed',v_recovery,
    'notification_preferences_created',v_preferences,'completed_at',now()
  );
end $function$;

CREATE OR REPLACE FUNCTION public.purge_old_app_error_logs()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  delete from public.app_error_logs
  where (resolved_at is not null and resolved_at<now()-interval '30 days')
     or (resolved_at is null and last_seen_at<now()-interval '120 days')
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
  perform public.purge_expired_recovery_items();
  perform public.purge_old_app_error_logs();
end $function$;


revoke execute on function public.log_client_error(uuid,text,text,text,jsonb,text,text,text) from public,anon;
grant execute on function public.log_client_error(uuid,text,text,text,jsonb,text,text,text) to authenticated;
revoke execute on function public.resolve_app_error(uuid,boolean) from public,anon;
grant execute on function public.resolve_app_error(uuid,boolean) to authenticated;
revoke execute on function public.run_household_diagnostics(uuid) from public,anon;
grant execute on function public.run_household_diagnostics(uuid) to authenticated;
revoke execute on function public.run_household_diagnostic_maintenance(uuid) from public,anon;
grant execute on function public.run_household_diagnostic_maintenance(uuid) to authenticated;
revoke execute on function public.purge_old_app_error_logs() from public,anon,authenticated;
revoke execute on function public.run_household_automation() from public,anon,authenticated;
grant execute on function public.run_household_automation() to service_role;
