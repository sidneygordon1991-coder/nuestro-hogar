-- Bind household automation rules to the existing alert engine.

CREATE OR REPLACE FUNCTION public.refresh_notifications_for_household(p_household_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and public.automation_rule_enabled(p_household_id,'payment_due_alert',true)
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
    and o.due_date between v_today and v_today+greatest(0,least(90,public.automation_rule_number(p_household_id,'payment_due_alert','days_before',3)))::int and np.payments
    and public.automation_rule_enabled(p_household_id,'payment_due_alert',true)
  on conflict (user_id,dedupe_key) do nothing;

  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select li.household_id,hm.user_id,'task',
    case when li.due_date<v_today then 'danger' else 'warning' end,
    case when li.due_date<v_today then 'Tarea vencida' when li.due_date=v_today then 'Tarea para hoy' else 'Tarea próxima' end,
    li.text||' · '||to_char(li.due_date,'DD Mon'),'listas','list_item',li.id,
    'task-due-'||li.id::text||'-'||li.due_date::text,(li.due_date::timestamptz)+interval '14 days'
  from public.list_items li
  join public.household_members hm on hm.household_id=li.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where li.household_id=p_household_id and not li.completed and li.due_date is not null
    and li.due_date<=v_today+greatest(0,least(90,public.automation_rule_number(p_household_id,'task_due_alert','days_before',1)))::int and np.tasks
    and public.automation_rule_enabled(p_household_id,'task_due_alert',true)
    and (li.assigned_to is null or li.assigned_to=hm.user_id)
  on conflict (user_id,dedupe_key) do nothing;

  -- Events today/tomorrow, including weekly/monthly/yearly recurrence.
  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select e.household_id,hm.user_id,'event','info',
    case when d.target=v_today then 'Evento hoy' else 'Evento mañana' end,
    e.title||coalesce(' · '||to_char(e.start_time,'HH24:MI'),''),
    'calendario','event',e.id,
    'event-upcoming-'||e.id::text||'-'||d.target::text,
    (d.target::timestamptz)+interval '3 days'
  from public.events e
  cross join lateral (
    select gs::date target
    from generate_series(v_today::timestamp,(v_today+1)::timestamp,interval '1 day') gs
  ) d
  join public.household_members hm on hm.household_id=e.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where e.household_id=p_household_id and np.events
    and public.event_occurs_on(e.event_date,e.recurrence,e.recurrence_until,d.target)
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
    from public.budget_allocations ba
    join public.budget_categories bc on bc.id=ba.category_id
    left join actual a on a.household_id=ba.household_id and a.category_id=ba.category_id
    where ba.household_id=p_household_id and ba.month=v_month and ba.planned_amount>0
  )
  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select u.household_id,hm.user_id,'budget',
    case when u.ratio>=1 then 'danger' else 'warning' end,
    case when u.ratio>=1 then 'Presupuesto excedido' else 'Presupuesto cerca del límite' end,
    u.name||' · '||round(u.ratio*100)::int||'% usado','presupuesto','budget_category',u.category_id,
    'budget-'||case when u.ratio>=1 then '100' else trim(to_char(public.automation_rule_number(p_household_id,'budget_limit_alert','threshold_percent',90),'FM999')) end||'-'||v_month::text||'-'||u.category_id::text,
    (v_month+interval '2 months')::timestamptz
  from usage u
  join public.household_members hm on hm.household_id=u.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where u.ratio>=public.automation_rule_number(p_household_id,'budget_limit_alert','threshold_percent',90)/100.0 and np.budget
    and public.automation_rule_enabled(p_household_id,'budget_limit_alert',true)
  on conflict (user_id,dedupe_key) do nothing;

  with saved as (
    select sg.id,sg.household_id,sg.name,sg.target_amount,coalesce(sum(gc.amount),0) saved
    from public.savings_goals sg
    left join public.goal_contributions gc on gc.goal_id=sg.id
    where sg.household_id=p_household_id and sg.active
    group by sg.id
  )
  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select s.household_id,hm.user_id,'goal','success','Meta alcanzada 🎯',
    s.name||' llegó a Q'||trim(to_char(s.saved,'FM999G999G990D00')),'presupuesto','savings_goal',s.id,
    'goal-reached-'||s.id::text,now()+interval '90 days'
  from saved s
  join public.household_members hm on hm.household_id=s.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where s.saved>=s.target_amount and np.goals
  on conflict (user_id,dedupe_key) do nothing;

  delete from public.notifications where expires_at is not null and expires_at<now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_document_notifications_for_household(p_household_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := (now() at time zone 'America/Guatemala')::date;
begin
  insert into public.notifications(
    household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at
  )
  select
    d.household_id,
    hm.user_id,
    'document',
    case
      when d.expires_on < v_today then 'danger'
      when d.expires_on <= v_today+7 then 'danger'
      else 'warning'
    end,
    case
      when d.expires_on < v_today then 'Documento vencido'
      when d.expires_on = v_today then 'Documento vence hoy'
      when d.expires_on <= v_today+7 then 'Documento vence pronto'
      else 'Documento por vencer'
    end,
    d.title||' · '||
      case
        when d.expires_on < v_today then 'venció '||to_char(d.expires_on,'DD Mon YYYY')
        else 'vence '||to_char(d.expires_on,'DD Mon YYYY')
      end,
    'documentos',
    'household_document',
    d.id,
    'document-expiry-'||d.id::text||'-'||d.expires_on::text||
      case
        when d.expires_on < v_today then '-expired'
        when d.expires_on <= v_today+7 then '-7'
        else '-30'
      end,
    (d.expires_on::timestamptz)+interval '45 days'
  from public.household_documents d
  join public.household_members hm on hm.household_id=d.household_id
  join public.notification_preferences np
    on np.household_id=hm.household_id and np.user_id=hm.user_id
  where d.household_id=p_household_id
    and d.expires_on is not null
    and d.expires_on <= v_today+greatest(0,least(90,public.automation_rule_number(p_household_id,'document_expiry_alert','days_before',30)))::int
    and np.documents=true
    and public.automation_rule_enabled(p_household_id,'document_expiry_alert',true)
    and (
      d.access_scope='household'
      or (d.access_scope='private' and d.owner_user_id=hm.user_id)
    )
  on conflict(user_id,dedupe_key) do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_maintenance_notifications_for_household(p_household_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := (now() at time zone 'America/Guatemala')::date;
begin
  insert into public.notifications(
    household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at
  )
  select
    s.household_id,hm.user_id,'maintenance',
    case when s.next_due_date < v_today then 'danger'
         when s.next_due_date <= v_today+7 then 'warning'
         else 'info' end,
    case when s.next_due_date < v_today then 'Mantenimiento vencido'
         when s.next_due_date = v_today then 'Mantenimiento para hoy'
         else 'Mantenimiento próximo' end,
    coalesce(a.name||' · ','')||s.title||' · '||
      case when s.next_due_date < v_today then 'venció ' else 'vence ' end||
      to_char(s.next_due_date,'DD Mon YYYY'),
    'mantenimiento','maintenance_schedule',s.id,
    'maintenance-date-'||s.id::text||'-'||s.next_due_date::text||
      case when s.next_due_date<v_today then '-expired'
           when s.next_due_date<=v_today+7 then '-7' else '-30' end,
    (s.next_due_date::timestamptz)+interval '45 days'
  from public.maintenance_schedules s
  left join public.finance_assets a on a.id=s.asset_id
  join public.household_members hm on hm.household_id=s.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where s.household_id=p_household_id
    and s.active=true
    and s.next_due_date is not null
    and s.next_due_date<=v_today+greatest(0,least(90,public.automation_rule_number(p_household_id,'maintenance_date_alert','days_before',30)))::int
    and np.maintenance=true
    and public.automation_rule_enabled(p_household_id,'maintenance_date_alert',true)
    and (s.assigned_to is null or s.assigned_to=hm.user_id)
  on conflict(user_id,dedupe_key) do nothing;

  insert into public.notifications(
    household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at
  )
  select
    s.household_id,hm.user_id,'maintenance',
    case when coalesce(a.current_mileage,0)>=s.next_due_mileage then 'danger' else 'warning' end,
    case when coalesce(a.current_mileage,0)>=s.next_due_mileage then 'Mantenimiento por kilometraje' else 'Mantenimiento cerca por kilometraje' end,
    a.name||' · '||s.title||' · actual '||trim(to_char(coalesce(a.current_mileage,0),'FM999G999G990'))||
      ' km / próximo '||trim(to_char(s.next_due_mileage,'FM999G999G990'))||' km',
    'mantenimiento','maintenance_schedule',s.id,
    'maintenance-km-'||s.id::text||'-'||trim(to_char(s.next_due_mileage,'FM999999999990'))||
      case when coalesce(a.current_mileage,0)>=s.next_due_mileage then '-due' else '-500' end,
    now()+interval '45 days'
  from public.maintenance_schedules s
  join public.finance_assets a on a.id=s.asset_id
  join public.household_members hm on hm.household_id=s.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where s.household_id=p_household_id
    and s.active=true
    and s.next_due_mileage is not null
    and a.current_mileage is not null
    and a.current_mileage>=greatest(0,s.next_due_mileage-greatest(0,least(10000,public.automation_rule_number(p_household_id,'maintenance_mileage_alert','km_before',500))))
    and np.maintenance=true
    and public.automation_rule_enabled(p_household_id,'maintenance_mileage_alert',true)
    and (s.assigned_to is null or s.assigned_to=hm.user_id)
  on conflict(user_id,dedupe_key) do nothing;

  insert into public.notifications(
    household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at
  )
  select
    a.household_id,hm.user_id,'maintenance',
    case when a.warranty_expires_on < v_today then 'danger'
         when a.warranty_expires_on <= v_today+7 then 'warning'
         else 'info' end,
    case when a.warranty_expires_on < v_today then 'Garantía vencida'
         when a.warranty_expires_on = v_today then 'Garantía vence hoy'
         else 'Garantía por vencer' end,
    a.name||' · '||
      case when a.warranty_expires_on < v_today then 'venció ' else 'vence ' end||
      to_char(a.warranty_expires_on,'DD Mon YYYY'),
    'mantenimiento','finance_asset',a.id,
    'asset-warranty-'||a.id::text||'-'||a.warranty_expires_on::text||
      case when a.warranty_expires_on<v_today then '-expired'
           when a.warranty_expires_on<=v_today+7 then '-7' else '-30' end,
    (a.warranty_expires_on::timestamptz)+interval '45 days'
  from public.finance_assets a
  join public.household_members hm on hm.household_id=a.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where a.household_id=p_household_id
    and a.active=true
    and a.warranty_expires_on is not null
    and a.warranty_expires_on<=v_today+greatest(0,least(90,public.automation_rule_number(p_household_id,'warranty_expiry_alert','days_before',30)))::int
    and np.maintenance=true
    and public.automation_rule_enabled(p_household_id,'warranty_expiry_alert',true)
  on conflict(user_id,dedupe_key) do nothing;
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
  perform public.refresh_all_net_worth_snapshots();
end;
$function$;