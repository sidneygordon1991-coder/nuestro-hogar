-- Intelligent monthly household close: immutable month snapshots, comparisons, reflections and reminders.
create table if not exists public.monthly_household_closures (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  month date not null,
  status text not null default 'closed' check (status in ('closed')),
  snapshot jsonb not null,
  reflection text,
  next_month_focus text[] not null default '{}',
  generated_at timestamptz not null default now(),
  closed_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(household_id,month),
  check (month=date_trunc('month',month)::date)
);
create index if not exists idx_monthly_closures_household_month on public.monthly_household_closures(household_id,month desc);
alter table public.monthly_household_closures enable row level security;
drop policy if exists monthly_closures_member_select on public.monthly_household_closures;
create policy monthly_closures_member_select on public.monthly_household_closures for select to authenticated using (public.is_household_member(household_id));
revoke insert,update,delete on public.monthly_household_closures from authenticated;
grant select on public.monthly_household_closures to authenticated;


CREATE OR REPLACE FUNCTION public.build_monthly_household_close(p_household_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid();
  v_today date:=(now() at time zone 'America/Guatemala')::date;
  v_month date:=date_trunc('month',p_month)::date;
  v_month_end date:=(date_trunc('month',p_month)+interval '1 month - 1 day')::date;
  v_period_end date;
  v_prev_month date;
  v_prev_end date;
  v_prev_compare_end date;

  v_income numeric:=0;v_expense numeric:=0;v_saving numeric:=0;v_budget numeric:=0;
  v_prev_income numeric:=0;v_prev_expense numeric:=0;v_prev_saving numeric:=0;v_prev_budget numeric:=0;
  v_balance numeric:=0;v_prev_balance numeric:=0;
  v_saving_rate numeric:=0;v_prev_saving_rate numeric:=0;
  v_budget_usage numeric:=0;v_prev_budget_usage numeric:=0;

  v_pending_payments integer:=0;v_paid_payments integer:=0;
  v_tasks_completed integer:=0;v_tasks_overdue integer:=0;
  v_events integer:=0;
  v_maintenance_count integer:=0;v_maintenance_cost numeric:=0;
  v_documents_due integer:=0;
  v_meals_prepared integer:=0;

  v_networth numeric;v_prev_networth numeric;
  v_score integer:=100;v_status text;v_status_label text;

  v_top_categories jsonb:='[]'::jsonb;
  v_insights jsonb:='[]'::jsonb;
  v_focus jsonb:='[]'::jsonb;
  v_largest_name text;v_largest_amount numeric:=0;v_largest_share numeric:=0;

  v_income_change numeric;v_expense_change numeric;v_saving_change numeric;v_networth_change numeric;
begin
  if v_user is null or not public.is_household_member(p_household_id) then
    raise exception 'Not a household member';
  end if;
  if p_month is null then raise exception 'Month is required'; end if;
  if v_month>date_trunc('month',v_today)::date then raise exception 'Future months are not available'; end if;

  v_period_end:=least(v_month_end,v_today);
  v_prev_month:=(v_month-interval '1 month')::date;
  v_prev_end:=(v_month-interval '1 day')::date;
  if v_month=date_trunc('month',v_today)::date then
    v_prev_compare_end:=least(v_prev_end,(v_prev_month+(extract(day from v_period_end)::int-1))::date);
  else
    v_prev_compare_end:=v_prev_end;
  end if;

  select
    coalesce(sum(amount) filter(where type='income'),0),
    coalesce(sum(amount) filter(where type='expense'),0)
  into v_income,v_expense
  from public.transactions
  where household_id=p_household_id and transaction_date between v_month and v_period_end;

  select
    coalesce(sum(amount) filter(where type='income'),0),
    coalesce(sum(amount) filter(where type='expense'),0)
  into v_prev_income,v_prev_expense
  from public.transactions
  where household_id=p_household_id and transaction_date between v_prev_month and v_prev_compare_end;

  select coalesce(sum(amount),0) into v_saving
  from public.goal_contributions
  where household_id=p_household_id and contribution_date between v_month and v_period_end;

  select coalesce(sum(amount),0) into v_prev_saving
  from public.goal_contributions
  where household_id=p_household_id and contribution_date between v_prev_month and v_prev_compare_end;

  select coalesce(sum(planned_amount),0) into v_budget
  from public.budget_allocations
  where household_id=p_household_id and month=v_month;

  select coalesce(sum(planned_amount),0) into v_prev_budget
  from public.budget_allocations
  where household_id=p_household_id and month=v_prev_month;

  v_balance:=v_income-v_expense-v_saving;
  v_prev_balance:=v_prev_income-v_prev_expense-v_prev_saving;
  v_saving_rate:=case when v_income>0 then v_saving/v_income*100 else 0 end;
  v_prev_saving_rate:=case when v_prev_income>0 then v_prev_saving/v_prev_income*100 else 0 end;
  v_budget_usage:=case when v_budget>0 then v_expense/v_budget*100 else 0 end;
  v_prev_budget_usage:=case when v_prev_budget>0 then v_prev_expense/v_prev_budget*100 else 0 end;

  select
    count(*) filter(where o.status='pending')::integer,
    count(*) filter(where o.status='paid')::integer
  into v_pending_payments,v_paid_payments
  from public.recurring_transaction_occurrences o
  join public.recurring_transactions r on r.id=o.recurring_transaction_id
  where o.household_id=p_household_id
    and r.type='expense'
    and o.period_month=v_month;

  select
    count(*) filter(where completed_at is not null and completed_at::date between v_month and v_period_end)::integer,
    count(*) filter(
      where due_date is not null and due_date<=v_period_end
        and (completed_at is null or completed_at::date>v_period_end)
    )::integer
  into v_tasks_completed,v_tasks_overdue
  from public.list_items
  where household_id=p_household_id;

  select count(*)::integer into v_events
  from (
    select e.id,d.day
    from public.events e
    cross join lateral generate_series(v_month::timestamp,v_period_end::timestamp,interval '1 day') d(day)
    where e.household_id=p_household_id
      and public.event_occurs_on(e.event_date,e.recurrence,e.recurrence_until,d.day::date)
  ) x;

  select count(*)::integer,coalesce(sum(cost),0)
  into v_maintenance_count,v_maintenance_cost
  from public.maintenance_records
  where household_id=p_household_id and completed_date between v_month and v_period_end;

  select count(*)::integer into v_documents_due
  from public.household_documents
  where household_id=p_household_id
    and access_scope='household'
    and expires_on between v_month and v_month_end;

  select count(*)::integer into v_meals_prepared
  from public.meal_plan_entries
  where household_id=p_household_id
    and meal_date between v_month and v_period_end
    and status='prepared';

  select net_worth into v_networth
  from public.finance_net_worth_snapshots
  where household_id=p_household_id and snapshot_date<=v_period_end
  order by snapshot_date desc limit 1;

  select net_worth into v_prev_networth
  from public.finance_net_worth_snapshots
  where household_id=p_household_id and snapshot_date<=v_prev_compare_end
  order by snapshot_date desc limit 1;

  with current_spend as (
    select t.category_id,coalesce(bc.name,'Sin categoría') category_name,sum(t.amount)::numeric amount
    from public.transactions t
    left join public.budget_categories bc on bc.id=t.category_id
    where t.household_id=p_household_id and t.type='expense' and t.transaction_date between v_month and v_period_end
    group by t.category_id,bc.name
  ), prev_spend as (
    select t.category_id,sum(t.amount)::numeric amount
    from public.transactions t
    where t.household_id=p_household_id and t.type='expense' and t.transaction_date between v_prev_month and v_prev_compare_end
    group by t.category_id
  ), ranked as (
    select c.category_id,c.category_name,c.amount,coalesce(p.amount,0) previous_amount,
      case when v_expense>0 then c.amount/v_expense*100 else 0 end share,
      case when coalesce(p.amount,0)>0 then (c.amount-p.amount)/p.amount*100 else null end change_pct
    from current_spend c
    left join prev_spend p on p.category_id is not distinct from c.category_id
    order by c.amount desc
    limit 6
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'category_id',category_id,'name',category_name,'amount',round(amount,2),
      'previous_amount',round(previous_amount,2),'share',round(share,1),
      'change_pct',case when change_pct is null then null else round(change_pct,1) end
    ) order by amount desc),'[]'::jsonb),
    max(category_name) filter(where amount=(select max(amount) from ranked)),
    coalesce(max(amount),0)
  into v_top_categories,v_largest_name,v_largest_amount
  from ranked;

  v_largest_share:=case when v_expense>0 then v_largest_amount/v_expense*100 else 0 end;

  v_income_change:=case when v_prev_income>0 then (v_income-v_prev_income)/v_prev_income*100 else null end;
  v_expense_change:=case when v_prev_expense>0 then (v_expense-v_prev_expense)/v_prev_expense*100 else null end;
  v_saving_change:=case when v_prev_saving>0 then (v_saving-v_prev_saving)/v_prev_saving*100 else null end;
  v_networth_change:=case when v_networth is not null and v_prev_networth is not null then v_networth-v_prev_networth else null end;

  if v_income>0 then
    if v_expense>v_income then v_score:=v_score-25;
    elsif v_expense/v_income>0.90 then v_score:=v_score-15;
    elsif v_expense/v_income>0.80 then v_score:=v_score-8;
    end if;
    if v_saving_rate<5 then v_score:=v_score-12;
    elsif v_saving_rate<10 then v_score:=v_score-7;
    elsif v_saving_rate<15 then v_score:=v_score-3;
    end if;
  elsif v_expense>0 then v_score:=v_score-20;
  end if;
  if v_budget>0 and v_expense>v_budget then v_score:=v_score-12; end if;
  v_score:=v_score-least(18,v_pending_payments*6);
  v_score:=v_score-least(15,v_tasks_overdue*3);
  v_score:=greatest(0,least(100,v_score));

  v_status:=case when v_score>=90 then 'excellent' when v_score>=75 then 'good' when v_score>=55 then 'watch' else 'risk' end;
  v_status_label:=case when v_score>=90 then 'Excelente' when v_score>=75 then 'Buen cierre' when v_score>=55 then 'Con oportunidades' else 'Necesita atención' end;

  if v_prev_expense>0 then
    if v_expense_change<=-5 then
      v_insights:=v_insights||jsonb_build_array(jsonb_build_object(
        'tone','positive','title','El gasto bajó','body','Gastaron '||abs(round(v_expense_change))||'% menos que en el período comparable anterior.','tab','presupuesto'
      ));
    elsif v_expense_change>=10 then
      v_insights:=v_insights||jsonb_build_array(jsonb_build_object(
        'tone','warning','title','El gasto aumentó','body','El gasto subió '||round(v_expense_change)||'% frente al período comparable anterior.','tab','presupuesto'
      ));
      v_focus:=v_focus||jsonb_build_array('Reducir el gasto variable frente a este mes');
    end if;
  end if;

  if v_budget>0 then
    if v_expense<=v_budget then
      v_insights:=v_insights||jsonb_build_array(jsonb_build_object(
        'tone','positive','title','Presupuesto bajo control','body','Se utilizó '||round(v_budget_usage)||'% del presupuesto planificado.','tab','presupuesto'
      ));
    else
      v_insights:=v_insights||jsonb_build_array(jsonb_build_object(
        'tone','danger','title','Presupuesto superado','body','El gasto excedió el presupuesto por Q'||trim(to_char(v_expense-v_budget,'FM999G999G990D00'))||'.','tab','presupuesto'
      ));
      v_focus:=v_focus||jsonb_build_array('Volver a un gasto mensual dentro del presupuesto');
    end if;
  elsif v_income>0 or v_expense>0 then
    v_insights:=v_insights||jsonb_build_array(jsonb_build_object(
      'tone','info','title','Faltó presupuesto mensual','body','Hubo movimientos pero no un presupuesto asignado para este mes.','tab','presupuesto'
    ));
    v_focus:=v_focus||jsonb_build_array('Definir el presupuesto antes de iniciar el próximo mes');
  end if;

  if v_income>0 then
    if v_saving_rate>=15 then
      v_insights:=v_insights||jsonb_build_array(jsonb_build_object(
        'tone','positive','title','Buen ritmo de ahorro','body','Se destinó '||round(v_saving_rate,1)||'% de los ingresos a metas de ahorro.','tab','presupuesto'
      ));
    elsif v_saving_rate<10 then
      v_insights:=v_insights||jsonb_build_array(jsonb_build_object(
        'tone','warning','title','Ahorro por fortalecer','body','La tasa de ahorro fue '||round(v_saving_rate,1)||'%.','tab','presupuesto'
      ));
      v_focus:=v_focus||jsonb_build_array('Llevar la tasa de ahorro a por lo menos 10%');
    end if;
  end if;

  if v_largest_name is not null and v_largest_share>=35 then
    v_insights:=v_insights||jsonb_build_array(jsonb_build_object(
      'tone','info','title','Categoría dominante','body',v_largest_name||' concentró '||round(v_largest_share)||'% de los gastos.','tab','presupuesto'
    ));
  end if;

  if v_tasks_overdue>0 then
    v_insights:=v_insights||jsonb_build_array(jsonb_build_object(
      'tone','warning','title','Pendientes arrastrados','body',v_tasks_overdue||' tarea'||case when v_tasks_overdue=1 then '' else 's' end||' quedó'||case when v_tasks_overdue=1 then '' else 'aron' end||' vencida'||case when v_tasks_overdue=1 then '' else 's' end||' al cierre.','tab','listas'
    ));
    v_focus:=v_focus||jsonb_build_array('Cerrar tareas vencidas antes de acumular nuevos pendientes');
  end if;

  if v_pending_payments>0 then
    v_insights:=v_insights||jsonb_build_array(jsonb_build_object(
      'tone','danger','title','Pagos pendientes del período','body',v_pending_payments||' pago'||case when v_pending_payments=1 then '' else 's' end||' recurrente'||case when v_pending_payments=1 then '' else 's' end||' siguen pendientes.','tab','presupuesto'
    ));
    v_focus:=v_focus||jsonb_build_array('Terminar el próximo mes sin pagos recurrentes pendientes');
  end if;

  if v_networth_change is not null then
    v_insights:=v_insights||jsonb_build_array(jsonb_build_object(
      'tone',case when v_networth_change>=0 then 'positive' else 'warning' end,
      'title',case when v_networth_change>=0 then 'Patrimonio en crecimiento' else 'Patrimonio disminuyó' end,
      'body',case when v_networth_change>=0 then 'El patrimonio aumentó Q'||trim(to_char(v_networth_change,'FM999G999G990D00'))||'.'
                  else 'El patrimonio disminuyó Q'||trim(to_char(abs(v_networth_change),'FM999G999G990D00'))||'.' end,
      'tab','presupuesto'
    ));
  end if;

  if v_maintenance_count>0 then
    v_insights:=v_insights||jsonb_build_array(jsonb_build_object(
      'tone','info','title','Mantenimiento realizado','body','Se completaron '||v_maintenance_count||' servicio'||case when v_maintenance_count=1 then '' else 's' end||' por Q'||trim(to_char(v_maintenance_cost,'FM999G999G990D00'))||'.','tab','mantenimiento'
    ));
  end if;

  if jsonb_array_length(v_focus)=0 then
    v_focus:=jsonb_build_array(
      'Mantener el gasto dentro del presupuesto',
      'Conservar el ritmo de ahorro',
      'Cerrar el próximo mes sin pendientes vencidos'
    );
  end if;

  return jsonb_build_object(
    'month',v_month,
    'period_end',v_period_end,
    'is_complete_month',v_period_end=v_month_end,
    'score',v_score,
    'status',v_status,
    'status_label',v_status_label,
    'financial',jsonb_build_object(
      'income',round(v_income,2),'expense',round(v_expense,2),'saving',round(v_saving,2),'budget',round(v_budget,2),
      'balance',round(v_balance,2),'saving_rate',round(v_saving_rate,1),'budget_usage',round(v_budget_usage,1),
      'net_worth',v_networth
    ),
    'previous',jsonb_build_object(
      'month',v_prev_month,'period_end',v_prev_compare_end,
      'income',round(v_prev_income,2),'expense',round(v_prev_expense,2),'saving',round(v_prev_saving,2),'budget',round(v_prev_budget,2),
      'balance',round(v_prev_balance,2),'saving_rate',round(v_prev_saving_rate,1),'budget_usage',round(v_prev_budget_usage,1),
      'net_worth',v_prev_networth
    ),
    'changes',jsonb_build_object(
      'income_pct',case when v_income_change is null then null else round(v_income_change,1) end,
      'expense_pct',case when v_expense_change is null then null else round(v_expense_change,1) end,
      'saving_pct',case when v_saving_change is null then null else round(v_saving_change,1) end,
      'net_worth_amount',v_networth_change
    ),
    'operations',jsonb_build_object(
      'recurring_paid',v_paid_payments,'recurring_pending',v_pending_payments,
      'tasks_completed',v_tasks_completed,'tasks_overdue',v_tasks_overdue,
      'events',v_events,'maintenance_count',v_maintenance_count,'maintenance_cost',round(v_maintenance_cost,2),
      'documents_due',v_documents_due,'meals_prepared',v_meals_prepared
    ),
    'top_categories',v_top_categories,
    'insights',v_insights,
    'suggested_focus',v_focus,
    'generated_at',now()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_monthly_household_close(p_household_id uuid, p_month date, p_reflection text DEFAULT NULL::text, p_next_month_focus text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_month date:=date_trunc('month',p_month)::date;
  v_current_month date:=date_trunc('month',(now() at time zone 'America/Guatemala'))::date;
  v_snapshot jsonb;
  v_id uuid;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception 'Not a household member';
  end if;
  if v_month>=v_current_month then raise exception 'Only completed months can be closed'; end if;

  select snapshot into v_snapshot
  from public.monthly_household_closures
  where household_id=p_household_id and month=v_month;

  if v_snapshot is null then
    v_snapshot:=public.build_monthly_household_close(p_household_id,v_month);
  end if;

  insert into public.monthly_household_closures(
    household_id,month,status,snapshot,reflection,next_month_focus,generated_at,closed_at,closed_by,updated_at
  ) values(
    p_household_id,v_month,'closed',v_snapshot,nullif(trim(p_reflection),''),
    coalesce(p_next_month_focus,'{}'::text[]),now(),now(),auth.uid(),now()
  )
  on conflict(household_id,month) do update set
    reflection=coalesce(nullif(trim(excluded.reflection),''),public.monthly_household_closures.reflection),
    next_month_focus=case when cardinality(excluded.next_month_focus)>0 then excluded.next_month_focus else public.monthly_household_closures.next_month_focus end,
    updated_at=now()
  returning id into v_id;

  delete from public.notifications
  where household_id=p_household_id
    and entity_type='monthly_close'
    and dedupe_key='monthly-close-'||to_char(v_month,'YYYY-MM');

  return (
    select jsonb_build_object(
      'id',id,'month',month,'status',status,'snapshot',snapshot,'reflection',reflection,
      'next_month_focus',next_month_focus,'closed_at',closed_at,'closed_by',closed_by
    )
    from public.monthly_household_closures where id=v_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_monthly_close_reflection(p_household_id uuid, p_month date, p_reflection text, p_next_month_focus text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_month date:=date_trunc('month',p_month)::date;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception 'Not a household member';
  end if;
  update public.monthly_household_closures
  set reflection=nullif(trim(p_reflection),''),
      next_month_focus=coalesce(p_next_month_focus,'{}'::text[]),
      updated_at=now()
  where household_id=p_household_id and month=v_month;
  if not found then raise exception 'Monthly close not found'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_monthly_close_notifications_for_household(p_household_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=(now() at time zone 'America/Guatemala')::date;
  v_month date:=(date_trunc('month',(now() at time zone 'America/Guatemala'))-interval '1 month')::date;
begin
  insert into public.notifications(
    household_id,user_id,type,severity,title,body,action_tab,entity_type,dedupe_key,expires_at
  )
  select
    p_household_id,hm.user_id,'system',
    case when extract(day from v_today)>=10 then 'warning' else 'info' end,
    'Cierre mensual pendiente',
    'El resumen de '||to_char(v_month,'TMMonth YYYY')||' está listo para revisar y cerrar.',
    'cierre','monthly_close',
    'monthly-close-'||to_char(v_month,'YYYY-MM'),
    (date_trunc('month',v_today)+interval '2 months')::timestamptz
  from public.household_members hm
  left join public.monthly_household_closures c
    on c.household_id=hm.household_id and c.month=v_month
  where hm.household_id=p_household_id and c.id is null
  on conflict(user_id,dedupe_key) do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_all_monthly_close_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  for r in select id from public.households loop
    perform public.refresh_monthly_close_notifications_for_household(r.id);
  end loop;
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
  perform public.refresh_all_monthly_close_notifications();
  perform public.refresh_all_net_worth_snapshots();
end;
$function$;


revoke execute on function public.build_monthly_household_close(uuid,date) from public,anon;
grant execute on function public.build_monthly_household_close(uuid,date) to authenticated;
revoke execute on function public.finalize_monthly_household_close(uuid,date,text,text[]) from public,anon;
grant execute on function public.finalize_monthly_household_close(uuid,date,text,text[]) to authenticated;
revoke execute on function public.update_monthly_close_reflection(uuid,date,text,text[]) from public,anon;
grant execute on function public.update_monthly_close_reflection(uuid,date,text,text[]) to authenticated;
revoke execute on function public.refresh_monthly_close_notifications_for_household(uuid) from public,anon,authenticated;
revoke execute on function public.refresh_all_monthly_close_notifications() from public,anon,authenticated;
revoke execute on function public.run_household_automation() from public,anon,authenticated;
grant execute on function public.run_household_automation() to service_role;
