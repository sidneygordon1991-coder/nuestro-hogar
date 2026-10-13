-- Permission-aware SECURITY DEFINER RPCs.

CREATE OR REPLACE FUNCTION public.global_search(p_household_id uuid, p_query text, p_limit integer DEFAULT 40)
 RETURNS TABLE(result_type text, entity_id uuid, title text, subtitle text, action_tab text, occurred_on date, score integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_query text := trim(coalesce(p_query,''));
  v_limit integer := greatest(1,least(coalesce(p_limit,40),80));
begin
  if v_user is null or not public.is_household_member(p_household_id) then
    raise exception 'Not a household member';
  end if;

  if length(v_query)<2 then
    return;
  end if;

  return query
  with q as (
    select lower(v_query) needle
  ),
  results as (
    select
      'transaction'::text result_type,
      t.id entity_id,
      t.description title,
      (case when t.type='income' then 'Ingreso' else 'Gasto' end)||
        ' · Q'||trim(to_char(t.amount,'FM999G999G990D00'))||
        coalesce(' · '||bc.name,'') subtitle,
      'presupuesto'::text action_tab,
      t.transaction_date occurred_on,
      case
        when lower(t.description)=q.needle then 100
        when lower(t.description) like q.needle||'%' then 80
        when lower(t.description) like '%'||q.needle||'%' then 60
        else 30
      end score
    from public.transactions t
    left join public.budget_categories bc on bc.id=t.category_id
    cross join q
    where t.household_id=p_household_id
      and public.can_view_household_module(p_household_id,'finance')
      and (
        lower(t.description) like '%'||q.needle||'%'
        or lower(coalesce(t.notes,'')) like '%'||q.needle||'%'
        or lower(coalesce(bc.name,'')) like '%'||q.needle||'%'
      )

    union all

    select
      'document',d.id,d.title,
      'Documento · '||coalesce(d.issuer,replace(initcap(d.category),'_',' ')),
      'documentos',d.expires_on,
      case
        when lower(d.title)=q.needle then 100
        when lower(d.title) like q.needle||'%' then 80
        else 60
      end
    from public.household_documents d
    cross join q
    where d.household_id=p_household_id
      and public.can_view_household_module(p_household_id,'documents')
      and (d.access_scope='household' or (d.access_scope='private' and d.owner_user_id=v_user))
      and (
        lower(d.title) like '%'||q.needle||'%'
        or lower(coalesce(d.document_number,'')) like '%'||q.needle||'%'
        or lower(coalesce(d.issuer,'')) like '%'||q.needle||'%'
        or lower(coalesce(d.notes,'')) like '%'||q.needle||'%'
        or lower(array_to_string(d.tags,' ')) like '%'||q.needle||'%'
      )

    union all

    select
      'event',e.id,e.title,
      'Evento · '||coalesce(e.location,replace(initcap(e.category),'_',' ')),
      case when e.event_type='maintenance' then 'mantenimiento' else 'calendario' end,
      e.event_date,
      case
        when lower(e.title)=q.needle then 100
        when lower(e.title) like q.needle||'%' then 80
        else 60
      end
    from public.events e
    cross join q
    where e.household_id=p_household_id
      and public.can_view_household_module(p_household_id,'calendar')
      and (
        lower(e.title) like '%'||q.needle||'%'
        or lower(coalesce(e.description,'')) like '%'||q.needle||'%'
        or lower(coalesce(e.location,'')) like '%'||q.needle||'%'
      )

    union all

    select
      'list_item',li.id,li.text,
      'Lista · '||l.title||case when li.completed then ' · completado' else '' end,
      'listas',li.due_date,
      case
        when lower(li.text)=q.needle then 100
        when lower(li.text) like q.needle||'%' then 80
        else 60
      end
    from public.list_items li
    join public.lists l on l.id=li.list_id
    cross join q
    where li.household_id=p_household_id
      and public.can_view_household_module(p_household_id,'lists')
      and (
        lower(li.text) like '%'||q.needle||'%'
        or lower(coalesce(li.notes,'')) like '%'||q.needle||'%'
        or lower(l.title) like '%'||q.needle||'%'
      )

    union all

    select
      'list',l.id,l.title,
      'Lista · '||case l.list_type when 'shopping' then 'Compras' when 'tasks' then 'Tareas' else 'General' end,
      'listas',l.created_at::date,
      case when lower(l.title)=q.needle then 100 when lower(l.title) like q.needle||'%' then 80 else 60 end
    from public.lists l
    cross join q
    where l.household_id=p_household_id and public.can_view_household_module(p_household_id,'lists') and lower(l.title) like '%'||q.needle||'%'

    union all

    select
      'asset',a.id,a.name,
      case a.asset_type when 'vehicle' then 'Vehículo' when 'property' then 'Propiedad' else 'Activo' end||
        coalesce(' · '||a.brand,'')||coalesce(' '||a.model,''),
      case when a.asset_type in ('vehicle','property','other') then 'mantenimiento' else 'presupuesto' end,
      a.purchase_date,
      case when lower(a.name)=q.needle then 100 when lower(a.name) like q.needle||'%' then 80 else 60 end
    from public.finance_assets a
    cross join q
    where a.household_id=p_household_id and a.active=true
      and public.can_view_household_module(p_household_id,'finance')
      and (
        lower(a.name) like '%'||q.needle||'%'
        or lower(coalesce(a.brand,'')) like '%'||q.needle||'%'
        or lower(coalesce(a.model,'')) like '%'||q.needle||'%'
        or lower(coalesce(a.license_plate,'')) like '%'||q.needle||'%'
        or lower(coalesce(a.serial_number,'')) like '%'||q.needle||'%'
        or lower(coalesce(a.notes,'')) like '%'||q.needle||'%'
      )

    union all

    select
      'recipe',r.id,r.name,
      'Receta · '||r.servings||' porciones · '||(r.prep_minutes+r.cook_minutes)||' min',
      'comidas',r.created_at::date,
      case when lower(r.name)=q.needle then 100 when lower(r.name) like q.needle||'%' then 80 else 60 end
    from public.recipes r
    cross join q
    where r.household_id=p_household_id and r.active=true
      and public.can_view_household_module(p_household_id,'meals')
      and (
        lower(r.name) like '%'||q.needle||'%'
        or lower(coalesce(r.description,'')) like '%'||q.needle||'%'
        or lower(coalesce(r.notes,'')) like '%'||q.needle||'%'
      )

    union all

    select
      'pantry',p.id,p.name,
      'Despensa · '||trim(to_char(p.quantity,'FM999G999G990D99'))||' '||p.unit,
      'comidas',p.expires_on,
      case when lower(p.name)=q.needle then 100 when lower(p.name) like q.needle||'%' then 80 else 60 end
    from public.pantry_items p
    cross join q
    where p.household_id=p_household_id and p.active=true
      and public.can_view_household_module(p_household_id,'meals')
      and (
        lower(p.name) like '%'||q.needle||'%'
        or lower(coalesce(p.notes,'')) like '%'||q.needle||'%'
      )

    union all

    select
      'maintenance',m.id,m.title,
      'Mantenimiento · '||coalesce(a.name,'Hogar')||coalesce(' · '||m.provider,''),
      'mantenimiento',m.next_due_date,
      case when lower(m.title)=q.needle then 100 when lower(m.title) like q.needle||'%' then 80 else 60 end
    from public.maintenance_schedules m
    left join public.finance_assets a on a.id=m.asset_id
    cross join q
    where m.household_id=p_household_id and m.active=true
      and public.can_view_household_module(p_household_id,'maintenance')
      and (
        lower(m.title) like '%'||q.needle||'%'
        or lower(coalesce(m.provider,'')) like '%'||q.needle||'%'
        or lower(coalesce(m.notes,'')) like '%'||q.needle||'%'
        or lower(coalesce(a.name,'')) like '%'||q.needle||'%'
      )

    union all

    select
      'person',p.id,coalesce(p.full_name,'Miembro'),
      'Familia',
      'familia',p.created_at::date,
      case when lower(coalesce(p.full_name,''))=q.needle then 100 when lower(coalesce(p.full_name,'')) like q.needle||'%' then 80 else 60 end
    from public.household_members hm
    join public.profiles p on p.id=hm.user_id
    cross join q
    where hm.household_id=p_household_id
      and lower(coalesce(p.full_name,'')) like '%'||q.needle||'%'
  )
  select r.result_type,r.entity_id,r.title,r.subtitle,r.action_tab,r.occurred_on,r.score
  from results r
  order by r.score desc,r.occurred_on desc nulls last,r.title
  limit v_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.quick_add_transaction(p_household_id uuid, p_description text, p_amount numeric, p_type text, p_transaction_date date DEFAULT CURRENT_DATE, p_category_id uuid DEFAULT NULL::uuid, p_account_id uuid DEFAULT NULL::uuid, p_paid_by uuid DEFAULT NULL::uuid, p_is_shared boolean DEFAULT true, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_payer uuid := coalesce(p_paid_by,auth.uid());
  v_transaction_id uuid;
  v_member_count integer := 0;
  v_method text := 'equal';
  v_category_method text;
  v_responsible uuid;
  v_total_weight numeric := 0;
  v_weight numeric;
  v_cents bigint;
  v_used bigint := 0;
  v_share_cents bigint;
  v_index integer := 0;
  r record;
begin
  if v_user is null or not public.can_edit_household_module(p_household_id,'finance') then
    raise exception 'Finance edit access required';
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  if p_type not in ('income','expense') then raise exception 'Invalid transaction type'; end if;
  if nullif(trim(p_description),'') is null then raise exception 'Description is required'; end if;
  if not exists(select 1 from public.household_members where household_id=p_household_id and user_id=v_payer) then
    raise exception 'Payer is not a household member';
  end if;
  if p_category_id is not null and not exists(select 1 from public.budget_categories where id=p_category_id and household_id=p_household_id) then
    raise exception 'Invalid category';
  end if;
  if p_account_id is not null and not exists(select 1 from public.finance_accounts where id=p_account_id and household_id=p_household_id and active=true) then
    raise exception 'Invalid account';
  end if;

  insert into public.transactions(
    household_id,description,amount,type,transaction_date,category_id,account_id,paid_by,is_shared,notes
  ) values(
    p_household_id,trim(p_description),p_amount,p_type,coalesce(p_transaction_date,current_date),
    p_category_id,p_account_id,v_payer,p_is_shared,nullif(trim(p_notes),'')
  ) returning id into v_transaction_id;

  if p_type='expense' then
    select count(*) into v_member_count from public.household_members where household_id=p_household_id;

    if p_is_shared=false or v_member_count<=1 then
      insert into public.transaction_splits(transaction_id,household_id,user_id,share_amount)
      values(v_transaction_id,p_household_id,v_payer,p_amount);
    else
      if p_category_id is not null then
        select split_method,responsible_user_id into v_category_method,v_responsible
        from public.finance_category_settings
        where household_id=p_household_id and category_id=p_category_id;
      end if;

      if v_category_method is not null and v_category_method<>'inherit' then
        v_method:=v_category_method;
      else
        select coalesce(split_method,'equal') into v_method
        from public.finance_household_settings
        where household_id=p_household_id;
        v_method:=coalesce(v_method,'equal');
      end if;

      if v_method='personal' then
        if v_responsible is null then
          select user_id into v_responsible
          from public.household_members
          where household_id=p_household_id
          order by joined_at,user_id
          limit 1;
        end if;
        insert into public.transaction_splits(transaction_id,household_id,user_id,share_amount)
        values(v_transaction_id,p_household_id,v_responsible,p_amount);
      else
        select coalesce(sum(
          case
            when v_method='income' then coalesce(fms.monthly_income,0)
            when v_method='custom' and v_category_method='custom' then coalesce(fcms.custom_share_percent,0)
            when v_method='custom' then coalesce(fms.custom_share_percent,0)
            else 1
          end
        ),0)
        into v_total_weight
        from public.household_members hm
        left join public.finance_member_settings fms
          on fms.household_id=hm.household_id and fms.user_id=hm.user_id
        left join public.finance_category_member_settings fcms
          on fcms.household_id=hm.household_id and fcms.user_id=hm.user_id and fcms.category_id=p_category_id
        where hm.household_id=p_household_id;

        if v_total_weight<=0 then v_method:='equal';v_total_weight:=v_member_count; end if;
        v_cents:=round(p_amount*100)::bigint;

        for r in
          select
            hm.user_id,
            case
              when v_method='income' then coalesce(fms.monthly_income,0)
              when v_method='custom' and v_category_method='custom' then coalesce(fcms.custom_share_percent,0)
              when v_method='custom' then coalesce(fms.custom_share_percent,0)
              else 1
            end as weight
          from public.household_members hm
          left join public.finance_member_settings fms
            on fms.household_id=hm.household_id and fms.user_id=hm.user_id
          left join public.finance_category_member_settings fcms
            on fcms.household_id=hm.household_id and fcms.user_id=hm.user_id and fcms.category_id=p_category_id
          where hm.household_id=p_household_id
          order by hm.joined_at,hm.user_id
        loop
          v_index:=v_index+1;
          v_weight:=case when r.weight>0 then r.weight else 0 end;
          if v_index=v_member_count then
            v_share_cents:=v_cents-v_used;
          else
            v_share_cents:=floor(v_cents*v_weight/v_total_weight);
            v_used:=v_used+v_share_cents;
          end if;
          insert into public.transaction_splits(transaction_id,household_id,user_id,share_amount)
          values(v_transaction_id,p_household_id,r.user_id,v_share_cents/100.0);
        end loop;
      end if;
    end if;
  end if;

  perform public.refresh_net_worth_snapshot(p_household_id);
  return v_transaction_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_household_health_dashboard(p_household_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_snapshot jsonb;
  v_today date := (now() at time zone 'America/Guatemala')::date;
  v_raw integer;
  v_coverage integer;
  v_overall integer;
  v_factor numeric;
  v_finance integer;
  v_organization integer;
  v_documents integer;
  v_maintenance integer;
  v_pantry integer;
  v_status text;
  v_status_label text;
begin
  if auth.uid() is null or not public.can_view_household_module(p_household_id,'health') then
    raise exception 'Health access required';
  end if;

  v_snapshot := public.household_health_snapshot(p_household_id);
  v_raw := coalesce((v_snapshot->>'overall_score')::integer,0);
  v_coverage := coalesce((v_snapshot->>'coverage_score')::integer,0);

  -- The operational score reflects configured modules. The final health score
  -- also rewards coverage so an empty household cannot appear as 100/100.
  v_overall := round(v_raw * (0.70 + 0.30 * v_coverage::numeric / 100));
  v_overall := greatest(0,least(100,v_overall));
  v_factor := case when v_raw>0 then v_overall::numeric/v_raw else 0 end;

  v_status := case
    when v_overall>=90 then 'excellent'
    when v_overall>=75 then 'good'
    when v_overall>=55 then 'watch'
    else 'risk'
  end;
  v_status_label := case
    when v_overall>=90 then 'Excelente'
    when v_overall>=75 then 'Bien'
    when v_overall>=55 then 'Atención'
    else 'Prioridad alta'
  end;

  v_snapshot := jsonb_set(v_snapshot,'{operational_score}',to_jsonb(v_raw),true);
  v_snapshot := jsonb_set(v_snapshot,'{overall_score}',to_jsonb(v_overall),true);
  v_snapshot := jsonb_set(v_snapshot,'{status}',to_jsonb(v_status),true);
  v_snapshot := jsonb_set(v_snapshot,'{status_label}',to_jsonb(v_status_label),true);

  v_finance := round(coalesce((v_snapshot->'domains'->0->>'score')::numeric,0)*0.30*v_factor);
  v_organization := round(coalesce((v_snapshot->'domains'->1->>'score')::numeric,0)*0.20*v_factor);
  v_documents := round(coalesce((v_snapshot->'domains'->2->>'score')::numeric,0)*0.15*v_factor);
  v_maintenance := round(coalesce((v_snapshot->'domains'->3->>'score')::numeric,0)*0.20*v_factor);
  v_pantry := greatest(0,v_overall-v_finance-v_organization-v_documents-v_maintenance);

  insert into public.household_health_snapshots(
    household_id,snapshot_date,overall_score,finance_score,organization_score,documents_score,maintenance_score,pantry_score,updated_at
  ) values(
    p_household_id,v_today,v_overall,v_finance,v_organization,v_documents,v_maintenance,v_pantry,now()
  )
  on conflict(household_id,snapshot_date) do update set
    overall_score=excluded.overall_score,
    finance_score=excluded.finance_score,
    organization_score=excluded.organization_score,
    documents_score=excluded.documents_score,
    maintenance_score=excluded.maintenance_score,
    pantry_score=excluded.pantry_score,
    updated_at=now();

  return v_snapshot;
end;
$function$;

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
  if v_user is null or not public.can_view_household_module(p_household_id,'monthly_close') then
    raise exception 'Monthly close access required';
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
  if auth.uid() is null or not public.can_edit_household_module(p_household_id,'monthly_close') then
    raise exception 'Monthly close edit access required';
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
  if auth.uid() is null or not public.can_edit_household_module(p_household_id,'monthly_close') then
    raise exception 'Monthly close edit access required';
  end if;
  update public.monthly_household_closures
  set reflection=nullif(trim(p_reflection),''),
      next_month_focus=coalesce(p_next_month_focus,'{}'::text[]),
      updated_at=now()
  where household_id=p_household_id and month=v_month;
  if not found then raise exception 'Monthly close not found'; end if;
end;
$function$;

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
  v_can_finance boolean:=false;
begin
  select * into g from public.household_planning_goals where id=p_goal_id;
  if not found then return 0; end if;

  v_can_finance:=auth.uid() is not null
    and public.household_module_access_for_user(g.household_id,auth.uid(),'finance')<>'none';

  if g.linked_savings_goal_id is not null and v_can_finance then
    select coalesce(sum(amount),0) into v_amount
    from public.goal_contributions
    where goal_id=g.linked_savings_goal_id and household_id=g.household_id;
    return greatest(0,v_amount);
  end if;

  if g.linked_account_id is not null and g.goal_type='debt' and v_can_finance then
    select opening_balance into v_amount
    from public.finance_accounts
    where id=g.linked_account_id and household_id=g.household_id and account_class='liability';
    if not found then return greatest(0,g.current_amount); end if;
    return greatest(0,coalesce(v_amount,0)-public.planning_account_balance(g.linked_account_id));
  end if;

  return greatest(0,g.current_amount);
end
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
  if auth.uid() is null or not public.can_edit_household_module(p_household_id,'planning') then raise exception 'Planning edit access required'; end if;
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
  if auth.uid() is null or not public.can_view_household_module(p_household_id,'planning') then raise exception 'Planning access required'; end if;

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
  if not public.can_edit_household_module(m.household_id,'planning') then raise exception 'Planning edit access required'; end if;

  update public.planning_milestones
  set status=case when p_completed then 'completed' else 'pending' end,
      completed_at=case when p_completed then now() else null end,
      updated_at=now()
  where id=p_milestone_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_household_automation_rules(p_household_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not public.can_view_household_module(p_household_id,'automations') then
    raise exception 'Automation access required';
  end if;
  perform public.seed_household_automation_rules(p_household_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_household_automation_rule(p_household_id uuid, p_rule_key text, p_enabled boolean, p_config jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days numeric;
  v_threshold numeric;
  v_km numeric;
  v_title text;
begin
  if auth.uid() is null or not public.can_edit_household_module(p_household_id,'automations') then
    raise exception 'Automation edit access required';
  end if;

  perform public.seed_household_automation_rules(p_household_id);

  if not exists(
    select 1 from public.household_automation_rules
    where household_id=p_household_id and rule_key=p_rule_key
  ) then raise exception 'Unknown automation rule'; end if;

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
  values(
    p_household_id,p_rule_key,'configured',0,
    case when p_enabled then 'Regla activada o actualizada' else 'Regla desactivada' end
  );

  return (
    select jsonb_build_object(
      'rule_key',rule_key,'enabled',enabled,'config',config,'updated_at',updated_at
    )
    from public.household_automation_rules
    where household_id=p_household_id and rule_key=p_rule_key
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_my_household_automation_rules(p_household_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.can_edit_household_module(p_household_id,'automations') then
    raise exception 'Automation edit access required';
  end if;
  v_result:=public.apply_household_automation_rules(p_household_id);
  perform public.refresh_my_notifications(p_household_id);
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.seed_finance_categories(p_household_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.can_edit_household_module(p_household_id,'finance') then
    raise exception 'Finance edit access required';
  end if;

  insert into public.budget_categories (household_id, name, icon, monthly_limit)
  select p_household_id, c.name, c.icon, 0
  from (values
    ('Vivienda','home'),
    ('Alimentación','shopping-cart'),
    ('Transporte','car'),
    ('Servicios','receipt'),
    ('Salud','heart'),
    ('Educación','book'),
    ('Ahorro','piggy-bank'),
    ('Viajes','plane'),
    ('Entretenimiento','sparkles'),
    ('Otros','wallet')
  ) as c(name,icon)
  on conflict (household_id, name) do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_my_net_worth_snapshot(p_household_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.can_edit_household_module(p_household_id,'finance') then
    raise exception 'Finance edit access required';
  end if;
  perform public.refresh_net_worth_snapshot(p_household_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_maintenance_event(p_schedule_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.maintenance_schedules%rowtype;
  a public.finance_assets%rowtype;
  v_event_id uuid;
  v_description text;
begin
  select * into s from public.maintenance_schedules where id=p_schedule_id;
  if not found then raise exception 'Maintenance schedule not found'; end if;
  if not public.can_edit_household_module(s.household_id,'maintenance') then raise exception 'Maintenance edit access required'; end if;

  delete from public.notifications
  where household_id=s.household_id
    and entity_type='maintenance_schedule'
    and entity_id=s.id;

  if s.asset_id is not null then
    select * into a from public.finance_assets where id=s.asset_id;
  end if;

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
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_maintenance(p_schedule_id uuid, p_completed_date date, p_mileage numeric DEFAULT NULL::numeric, p_cost numeric DEFAULT NULL::numeric, p_provider text DEFAULT NULL::text, p_document_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.maintenance_schedules%rowtype;
  a public.finance_assets%rowtype;
  v_next_date date;
  v_next_mileage numeric;
  v_base_mileage numeric;
begin
  select * into s from public.maintenance_schedules where id=p_schedule_id for update;
  if not found then raise exception 'Maintenance schedule not found'; end if;
  if not public.can_edit_household_module(s.household_id,'maintenance') then raise exception 'Maintenance edit access required'; end if;

  if s.asset_id is not null then
    select * into a from public.finance_assets where id=s.asset_id;
  end if;

  insert into public.maintenance_records(
    household_id,schedule_id,asset_id,title,maintenance_type,completed_date,mileage,cost,provider,document_id,notes
  ) values(
    s.household_id,s.id,s.asset_id,s.title,s.maintenance_type,p_completed_date,p_mileage,p_cost,
    coalesce(nullif(trim(p_provider),''),s.provider),coalesce(p_document_id,s.document_id),nullif(trim(p_notes),'')
  );

  if s.asset_id is not null and p_mileage is not null then
    update public.finance_assets
    set current_mileage=greatest(coalesce(current_mileage,0),p_mileage),updated_at=now()
    where id=s.asset_id and household_id=s.household_id;
  end if;

  if s.interval_months is not null then
    v_next_date := (p_completed_date + make_interval(months=>s.interval_months))::date;
  else
    v_next_date := null;
  end if;

  v_base_mileage := coalesce(
    p_mileage,
    case when a.id is not null then a.current_mileage else null end,
    s.last_completed_mileage,
    s.next_due_mileage
  );

  if s.interval_km is not null and v_base_mileage is not null then
    v_next_mileage := v_base_mileage + s.interval_km;
  else
    v_next_mileage := null;
  end if;

  update public.maintenance_schedules
  set last_completed_date=p_completed_date,
      last_completed_mileage=coalesce(p_mileage,last_completed_mileage),
      provider=coalesce(nullif(trim(p_provider),''),provider),
      document_id=coalesce(p_document_id,document_id),
      next_due_date=v_next_date,
      next_due_mileage=v_next_mileage,
      active=(s.interval_months is not null or s.interval_km is not null),
      updated_at=now()
  where id=s.id;

  perform public.sync_maintenance_event(s.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_meal_plan(p_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_entry public.meal_plan_entries%rowtype;
  v_recipe public.recipes%rowtype;
  v_ratio numeric := 1;
begin
  select * into v_entry
  from public.meal_plan_entries
  where id=p_entry_id
  for update;

  if not found then raise exception 'Meal plan entry not found'; end if;
  if not public.can_edit_household_module(v_entry.household_id,'meals') then raise exception 'Meals edit access required'; end if;
  if v_entry.status='prepared' then return; end if;

  if v_entry.recipe_id is not null then
    select * into v_recipe from public.recipes where id=v_entry.recipe_id;
    if found and v_recipe.servings>0 then
      v_ratio := coalesce(v_entry.servings,v_recipe.servings)::numeric / v_recipe.servings::numeric;
    end if;

    update public.pantry_items p
    set quantity=greatest(0,p.quantity-(ri.quantity*v_ratio)),updated_at=now()
    from public.recipe_ingredients ri
    where ri.recipe_id=v_entry.recipe_id
      and ri.pantry_item_id=p.id
      and ri.optional=false
      and p.household_id=v_entry.household_id;
  end if;

  update public.meal_plan_entries
  set status='prepared',completed_at=now(),updated_at=now()
  where id=p_entry_id;
end;
$function$;


-- Internal helpers stay private; user-facing RPCs are granted explicitly.
revoke execute on function public.household_health_snapshot(uuid) from public,anon,authenticated;
revoke execute on function public.planning_account_balance(uuid) from public,anon,authenticated;
revoke execute on function public.planning_goal_current_amount(uuid) from public,anon,authenticated;
