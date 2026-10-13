-- Shared split integrity applies to expenses; shared income does not use expense participant splits.
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
    where t.household_id=p_household_id and t.type='expense' and t.is_shared=true
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