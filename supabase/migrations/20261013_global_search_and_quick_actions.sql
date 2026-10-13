-- Global search and intelligent quick actions.
create extension if not exists pg_trgm;

create index if not exists idx_transactions_description_trgm on public.transactions using gin (lower(description) gin_trgm_ops);
create index if not exists idx_documents_title_trgm on public.household_documents using gin (lower(title) gin_trgm_ops);
create index if not exists idx_events_title_trgm on public.events using gin (lower(title) gin_trgm_ops);
create index if not exists idx_list_items_text_trgm on public.list_items using gin (lower(text) gin_trgm_ops);
create index if not exists idx_lists_title_trgm on public.lists using gin (lower(title) gin_trgm_ops);
create index if not exists idx_assets_name_trgm on public.finance_assets using gin (lower(name) gin_trgm_ops);
create index if not exists idx_recipes_name_trgm on public.recipes using gin (lower(name) gin_trgm_ops);
create index if not exists idx_pantry_name_trgm on public.pantry_items using gin (lower(name) gin_trgm_ops);
create index if not exists idx_maintenance_title_trgm on public.maintenance_schedules using gin (lower(title) gin_trgm_ops);

create or replace function public.global_search(p_household_id uuid,p_query text,p_limit integer default 40)
returns table(result_type text,entity_id uuid,title text,subtitle text,action_tab text,occurred_on date,score integer)
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  v_query text:=trim(coalesce(p_query,''));
  v_limit integer:=greatest(1,least(coalesce(p_limit,40),80));
begin
  if v_user is null or not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  if length(v_query)<2 then return; end if;

  return query
  with q as (select lower(v_query) needle),
  results as (
    select 'transaction'::text,t.id,t.description,
      (case when t.type='income' then 'Ingreso' else 'Gasto' end)||' · Q'||trim(to_char(t.amount,'FM999G999G990D00'))||coalesce(' · '||bc.name,''),
      'presupuesto'::text,t.transaction_date,
      case when lower(t.description)=q.needle then 100 when lower(t.description) like q.needle||'%' then 80 when lower(t.description) like '%'||q.needle||'%' then 60 else 30 end
    from public.transactions t left join public.budget_categories bc on bc.id=t.category_id cross join q
    where t.household_id=p_household_id and (
      lower(t.description) like '%'||q.needle||'%' or lower(coalesce(t.notes,'')) like '%'||q.needle||'%' or lower(coalesce(bc.name,'')) like '%'||q.needle||'%'
    )
    union all
    select 'document',d.id,d.title,'Documento · '||coalesce(d.issuer,replace(initcap(d.category),'_',' ')),'documentos',d.expires_on,
      case when lower(d.title)=q.needle then 100 when lower(d.title) like q.needle||'%' then 80 else 60 end
    from public.household_documents d cross join q
    where d.household_id=p_household_id and (d.access_scope='household' or (d.access_scope='private' and d.owner_user_id=v_user)) and (
      lower(d.title) like '%'||q.needle||'%' or lower(coalesce(d.document_number,'')) like '%'||q.needle||'%' or
      lower(coalesce(d.issuer,'')) like '%'||q.needle||'%' or lower(coalesce(d.notes,'')) like '%'||q.needle||'%' or
      lower(array_to_string(d.tags,' ')) like '%'||q.needle||'%'
    )
    union all
    select 'event',e.id,e.title,'Evento · '||coalesce(e.location,replace(initcap(e.category),'_',' ')),
      case when e.event_type='maintenance' then 'mantenimiento' else 'calendario' end,e.event_date,
      case when lower(e.title)=q.needle then 100 when lower(e.title) like q.needle||'%' then 80 else 60 end
    from public.events e cross join q
    where e.household_id=p_household_id and (
      lower(e.title) like '%'||q.needle||'%' or lower(coalesce(e.description,'')) like '%'||q.needle||'%' or lower(coalesce(e.location,'')) like '%'||q.needle||'%'
    )
    union all
    select 'list_item',li.id,li.text,'Lista · '||l.title||case when li.completed then ' · completado' else '' end,'listas',li.due_date,
      case when lower(li.text)=q.needle then 100 when lower(li.text) like q.needle||'%' then 80 else 60 end
    from public.list_items li join public.lists l on l.id=li.list_id cross join q
    where li.household_id=p_household_id and (
      lower(li.text) like '%'||q.needle||'%' or lower(coalesce(li.notes,'')) like '%'||q.needle||'%' or lower(l.title) like '%'||q.needle||'%'
    )
    union all
    select 'list',l.id,l.title,'Lista · '||case l.list_type when 'shopping' then 'Compras' when 'tasks' then 'Tareas' else 'General' end,
      'listas',l.created_at::date,case when lower(l.title)=q.needle then 100 when lower(l.title) like q.needle||'%' then 80 else 60 end
    from public.lists l cross join q where l.household_id=p_household_id and lower(l.title) like '%'||q.needle||'%'
    union all
    select 'asset',a.id,a.name,
      case a.asset_type when 'vehicle' then 'Vehículo' when 'property' then 'Propiedad' else 'Activo' end||coalesce(' · '||a.brand,'')||coalesce(' '||a.model,''),
      case when a.asset_type in ('vehicle','property','other') then 'mantenimiento' else 'presupuesto' end,a.purchase_date,
      case when lower(a.name)=q.needle then 100 when lower(a.name) like q.needle||'%' then 80 else 60 end
    from public.finance_assets a cross join q
    where a.household_id=p_household_id and a.active=true and (
      lower(a.name) like '%'||q.needle||'%' or lower(coalesce(a.brand,'')) like '%'||q.needle||'%' or lower(coalesce(a.model,'')) like '%'||q.needle||'%' or
      lower(coalesce(a.license_plate,'')) like '%'||q.needle||'%' or lower(coalesce(a.serial_number,'')) like '%'||q.needle||'%' or lower(coalesce(a.notes,'')) like '%'||q.needle||'%'
    )
    union all
    select 'recipe',r.id,r.name,'Receta · '||r.servings||' porciones · '||(r.prep_minutes+r.cook_minutes)||' min','comidas',r.created_at::date,
      case when lower(r.name)=q.needle then 100 when lower(r.name) like q.needle||'%' then 80 else 60 end
    from public.recipes r cross join q
    where r.household_id=p_household_id and r.active=true and (
      lower(r.name) like '%'||q.needle||'%' or lower(coalesce(r.description,'')) like '%'||q.needle||'%' or lower(coalesce(r.notes,'')) like '%'||q.needle||'%'
    )
    union all
    select 'pantry',p.id,p.name,'Despensa · '||trim(to_char(p.quantity,'FM999G999G990D99'))||' '||p.unit,'comidas',p.expires_on,
      case when lower(p.name)=q.needle then 100 when lower(p.name) like q.needle||'%' then 80 else 60 end
    from public.pantry_items p cross join q
    where p.household_id=p_household_id and p.active=true and (
      lower(p.name) like '%'||q.needle||'%' or lower(coalesce(p.notes,'')) like '%'||q.needle||'%'
    )
    union all
    select 'maintenance',m.id,m.title,'Mantenimiento · '||coalesce(a.name,'Hogar')||coalesce(' · '||m.provider,''),'mantenimiento',m.next_due_date,
      case when lower(m.title)=q.needle then 100 when lower(m.title) like q.needle||'%' then 80 else 60 end
    from public.maintenance_schedules m left join public.finance_assets a on a.id=m.asset_id cross join q
    where m.household_id=p_household_id and m.active=true and (
      lower(m.title) like '%'||q.needle||'%' or lower(coalesce(m.provider,'')) like '%'||q.needle||'%' or
      lower(coalesce(m.notes,'')) like '%'||q.needle||'%' or lower(coalesce(a.name,'')) like '%'||q.needle||'%'
    )
    union all
    select 'person',p.id,coalesce(p.full_name,'Miembro'),'Familia','familia',p.created_at::date,
      case when lower(coalesce(p.full_name,''))=q.needle then 100 when lower(coalesce(p.full_name,'')) like q.needle||'%' then 80 else 60 end
    from public.household_members hm join public.profiles p on p.id=hm.user_id cross join q
    where hm.household_id=p_household_id and lower(coalesce(p.full_name,'')) like '%'||q.needle||'%'
  )
  select r.result_type,r.entity_id,r.title,r.subtitle,r.action_tab,r.occurred_on,r.score
  from results r order by r.score desc,r.occurred_on desc nulls last,r.title limit v_limit;
end $$;

revoke execute on function public.global_search(uuid,text,integer) from public,anon;
grant execute on function public.global_search(uuid,text,integer) to authenticated;

create or replace function public.quick_add_transaction(
  p_household_id uuid,p_description text,p_amount numeric,p_type text,p_transaction_date date default current_date,
  p_category_id uuid default null,p_account_id uuid default null,p_paid_by uuid default null,p_is_shared boolean default true,p_notes text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();v_payer uuid:=coalesce(p_paid_by,auth.uid());v_transaction_id uuid;v_member_count integer:=0;
  v_method text:='equal';v_category_method text;v_responsible uuid;v_total_weight numeric:=0;v_weight numeric;
  v_cents bigint;v_used bigint:=0;v_share_cents bigint;v_index integer:=0;r record;
begin
  if v_user is null or not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  if p_type not in ('income','expense') then raise exception 'Invalid transaction type'; end if;
  if nullif(trim(p_description),'') is null then raise exception 'Description is required'; end if;
  if not exists(select 1 from public.household_members where household_id=p_household_id and user_id=v_payer) then raise exception 'Payer is not a household member'; end if;
  if p_category_id is not null and not exists(select 1 from public.budget_categories where id=p_category_id and household_id=p_household_id) then raise exception 'Invalid category'; end if;
  if p_account_id is not null and not exists(select 1 from public.finance_accounts where id=p_account_id and household_id=p_household_id and active=true) then raise exception 'Invalid account'; end if;

  insert into public.transactions(household_id,description,amount,type,transaction_date,category_id,account_id,paid_by,is_shared,notes)
  values(p_household_id,trim(p_description),p_amount,p_type,coalesce(p_transaction_date,current_date),p_category_id,p_account_id,v_payer,p_is_shared,nullif(trim(p_notes),''))
  returning id into v_transaction_id;

  if p_type='expense' then
    select count(*) into v_member_count from public.household_members where household_id=p_household_id;
    if p_is_shared=false or v_member_count<=1 then
      insert into public.transaction_splits(transaction_id,household_id,user_id,share_amount) values(v_transaction_id,p_household_id,v_payer,p_amount);
    else
      if p_category_id is not null then
        select split_method,responsible_user_id into v_category_method,v_responsible
        from public.finance_category_settings where household_id=p_household_id and category_id=p_category_id;
      end if;
      if v_category_method is not null and v_category_method<>'inherit' then v_method:=v_category_method;
      else
        select coalesce(split_method,'equal') into v_method from public.finance_household_settings where household_id=p_household_id;
        v_method:=coalesce(v_method,'equal');
      end if;

      if v_method='personal' then
        if v_responsible is null then
          select user_id into v_responsible from public.household_members where household_id=p_household_id order by joined_at,user_id limit 1;
        end if;
        insert into public.transaction_splits(transaction_id,household_id,user_id,share_amount) values(v_transaction_id,p_household_id,v_responsible,p_amount);
      else
        select coalesce(sum(case
          when v_method='income' then coalesce(fms.monthly_income,0)
          when v_method='custom' and v_category_method='custom' then coalesce(fcms.custom_share_percent,0)
          when v_method='custom' then coalesce(fms.custom_share_percent,0)
          else 1 end),0)
        into v_total_weight
        from public.household_members hm
        left join public.finance_member_settings fms on fms.household_id=hm.household_id and fms.user_id=hm.user_id
        left join public.finance_category_member_settings fcms on fcms.household_id=hm.household_id and fcms.user_id=hm.user_id and fcms.category_id=p_category_id
        where hm.household_id=p_household_id;

        if v_total_weight<=0 then v_method:='equal';v_total_weight:=v_member_count; end if;
        v_cents:=round(p_amount*100)::bigint;

        for r in
          select hm.user_id,case
            when v_method='income' then coalesce(fms.monthly_income,0)
            when v_method='custom' and v_category_method='custom' then coalesce(fcms.custom_share_percent,0)
            when v_method='custom' then coalesce(fms.custom_share_percent,0)
            else 1 end weight
          from public.household_members hm
          left join public.finance_member_settings fms on fms.household_id=hm.household_id and fms.user_id=hm.user_id
          left join public.finance_category_member_settings fcms on fcms.household_id=hm.household_id and fcms.user_id=hm.user_id and fcms.category_id=p_category_id
          where hm.household_id=p_household_id order by hm.joined_at,hm.user_id
        loop
          v_index:=v_index+1;v_weight:=case when r.weight>0 then r.weight else 0 end;
          if v_index=v_member_count then v_share_cents:=v_cents-v_used;
          else v_share_cents:=floor(v_cents*v_weight/v_total_weight);v_used:=v_used+v_share_cents;end if;
          insert into public.transaction_splits(transaction_id,household_id,user_id,share_amount)
          values(v_transaction_id,p_household_id,r.user_id,v_share_cents/100.0);
        end loop;
      end if;
    end if;
  end if;

  perform public.refresh_net_worth_snapshot(p_household_id);
  return v_transaction_id;
end $$;

revoke execute on function public.quick_add_transaction(uuid,text,numeric,text,date,uuid,uuid,uuid,boolean,text) from public,anon;
grant execute on function public.quick_add_transaction(uuid,text,numeric,text,date,uuid,uuid,uuid,boolean,text) to authenticated;
