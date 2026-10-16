-- Additive: no existing task, purchase, meal or financial history is rewritten.
alter table public.lists add column is_pinned boolean not null default false,
 add column shopping_week date;
alter table public.list_items add column routine_frequency text not null default 'none',
 add column routine_series_id uuid, add column routine_members uuid[] not null default '{}',
 add column shopping_week date, add column shopping_key text;
alter table public.list_items add constraint list_item_routine_frequency check(routine_frequency in ('none','daily','weekly')),
 add constraint list_item_routine_date check(routine_frequency='none' or (due_date is not null and routine_series_id is not null)),
 add constraint list_item_shopping_source check((shopping_week is null)=(shopping_key is null));
create unique index lists_shopping_week on public.lists(household_id,shopping_week) where shopping_week is not null;
create unique index list_items_routine_occurrence on public.list_items(household_id,routine_series_id,due_date) where routine_series_id is not null;
create unique index list_items_shopping_entry on public.list_items(household_id,shopping_week,shopping_key) where shopping_week is not null;

create function household_integrity.normalize_daily_list_fields() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='lists' then new.is_pinned:=coalesce(new.is_pinned,false);return new;end if;
 -- json_populate_recordset in legacy backups supplies null for new columns.
 new.routine_frequency:=coalesce(new.routine_frequency,'none');
 new.routine_members:=coalesce(new.routine_members,'{}'::uuid[]);
 if new.routine_frequency<>'none' and not new.completed then
  if new.routine_series_id is null then new.routine_series_id:=gen_random_uuid();end if;
  if cardinality(new.routine_members)>50 or array_position(new.routine_members,null) is not null
   or cardinality(new.routine_members)<>(select count(distinct x) from unnest(new.routine_members) x) then
   raise exception 'Revisa los responsables de la rutina.' using errcode='23514';end if;
  if exists(select 1 from unnest(new.routine_members) x where not exists(
   select 1 from public.household_members m where m.household_id=new.household_id and m.user_id=x))
   or (new.assigned_to is not null and not exists(select 1 from public.household_members m where m.household_id=new.household_id and m.user_id=new.assigned_to)) then
   raise exception 'Los responsables deben pertenecer a este hogar.' using errcode='23514';end if;
 end if;
 return new;
end $$;
revoke all on function household_integrity.normalize_daily_list_fields() from public,anon;
create trigger daily_list_defaults before insert or update on public.lists for each row execute function household_integrity.normalize_daily_list_fields();
create trigger daily_item_defaults before insert or update on public.list_items for each row execute function household_integrity.normalize_daily_list_fields();

create function public.complete_household_list_item(p_household_id uuid,p_item_id uuid,p_completed boolean)
 returns uuid language plpgsql security invoker set search_path='' as $$
declare item public.list_items;next_day date;step_days integer;next_member uuid;participants uuid[];next_id uuid;server_day date:=(now() at time zone 'America/Guatemala')::date;
begin
 if auth.uid() is null or not public.can_edit_household_module(p_household_id,'lists') then
  raise exception 'Necesitas permiso para editar Listas.' using errcode='42501';end if;
 if p_completed is null then raise exception 'Confirma el estado de la tarea.' using errcode='23514';end if;
 select * into item from public.list_items where id=p_item_id and household_id=p_household_id for update;
 if not found then raise exception 'El elemento ya no está disponible.' using errcode='40001';end if;
 if item.completed=p_completed then return item.id;end if;
 update public.list_items set completed=p_completed,completed_at=case when p_completed then now() else null end where id=item.id;
 if p_completed and item.routine_frequency<>'none' then
  step_days:=case when item.routine_frequency='daily' then 1 else 7 end;
  next_day:=item.due_date+step_days*(greatest(0,(server_day-item.due_date)/step_days)+1);
  -- Removed members never become the responsible person for a future occurrence.
  select coalesce(array_agg(x order by ord),'{}'::uuid[]) into participants
   from unnest(item.routine_members) with ordinality a(x,ord)
   where exists(select 1 from public.household_members m where m.household_id=p_household_id and m.user_id=x);
  if cardinality(participants)>0 then
   next_member:=participants[coalesce(array_position(participants,item.assigned_to),0)%cardinality(participants)+1];
  elsif exists(select 1 from public.household_members where household_id=p_household_id and user_id=item.assigned_to) then next_member:=item.assigned_to;end if;
  insert into public.list_items(household_id,list_id,text,quantity,notes,assigned_to,due_date,sort_order,routine_frequency,routine_series_id,routine_members)
   values(p_household_id,item.list_id,item.text,item.quantity,item.notes,next_member,next_day,item.sort_order,item.routine_frequency,item.routine_series_id,participants)
   on conflict(household_id,routine_series_id,due_date) where routine_series_id is not null do nothing returning id into next_id;
 end if;
 return coalesce(next_id,item.id);
end $$;
revoke all on function public.complete_household_list_item(uuid,uuid,boolean) from public,anon;
grant execute on function public.complete_household_list_item(uuid,uuid,boolean) to authenticated;

-- Only exact metric conversions and count aliases. Cups, packages and other
-- ambiguous measures stay separate; no inferred densities or package sizes.
create function public.grocery_unit(p_unit text) returns table(kind text,factor numeric,label text)
 language sql immutable security invoker set search_path='' as $$
 with u as(select lower(trim(coalesce(p_unit,''))) v)
 select case when v in ('g','gr','gramo','gramos','kg','kilogramo','kilogramos','mg') then 'mass'
  when v in ('ml','mililitro','mililitros','l','litro','litros') then 'volume'
  when v in ('unidad','unidades','ud','uds','u') then 'count' else 'custom:'||v end,
 case when v in ('kg','kilogramo','kilogramos','l','litro','litros') then 1000::numeric when v='mg' then 0.001::numeric else 1::numeric end,
 case when v in ('g','gr','gramo','gramos','kg','kilogramo','kilogramos','mg') then 'g'
  when v in ('ml','mililitro','mililitros','l','litro','litros') then 'ml'
  when v in ('unidad','unidades','ud','uds','u') then 'unidad' else coalesce(nullif(v,''),'unidad') end from u
$$;
revoke all on function public.grocery_unit(text) from public,anon;
grant execute on function public.grocery_unit(text) to authenticated;

create function public.get_weekly_shopping_plan(p_household_id uuid,p_week date) returns jsonb
 language plpgsql stable security invoker set search_path='' as $$
declare rows jsonb;result jsonb;
begin
 if auth.uid() is null or not public.can_view_household_module(p_household_id,'meals') then
  raise exception 'Necesitas permiso para consultar Comidas.' using errcode='42501';end if;
 if p_week is null or extract(isodow from p_week)<>1 then raise exception 'Selecciona el lunes de la semana.' using errcode='23514';end if;
 with required as (
  select i.pantry_item_id,case when i.pantry_item_id is not null then 'p:'||i.pantry_item_id::text else 't:'||lower(regexp_replace(trim(i.ingredient_name),'\s+',' ','g')) end||'|'||u.kind key,
   min(i.ingredient_name) name,u.kind,u.label,sum(i.quantity*(coalesce(m.servings,r.servings)::numeric/r.servings)*u.factor) needed,
   string_agg(distinct r.name,', ' order by r.name) recipes
  from public.meal_plan_entries m join public.recipes r on r.id=m.recipe_id and r.household_id=m.household_id
   join public.recipe_ingredients i on i.recipe_id=r.id and i.household_id=m.household_id
   cross join lateral public.grocery_unit(i.unit) u
  where m.household_id=p_household_id and m.meal_date between p_week and p_week+6 and m.status='planned' and not i.optional
  group by i.pantry_item_id,key,u.kind,u.label
 ), calculated as (
  select q.*,coalesce(case when p.active and (p.expires_on is null or p.expires_on>=(now() at time zone 'America/Guatemala')::date) and pu.kind=q.kind then p.quantity*pu.factor else 0 end,0) stock,
   case when q.pantry_item_id is null then 'Sin vincular: no se descontó despensa.'
    when not coalesce(p.active,false) then 'Producto no disponible en despensa.'
    when p.expires_on<(now() at time zone 'America/Guatemala')::date then 'No se descontó producto vencido.'
    when pu.kind is distinct from q.kind then 'Unidades incompatibles: revisa la cantidad.' else null end warning
  from required q left join public.pantry_items p on p.id=q.pantry_item_id and p.household_id=p_household_id
   left join lateral public.grocery_unit(p.unit) pu on true
 )
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'name',name,'unit',label,'required',ceil(needed*100)/100,'available',floor(stock*100)/100,
  'missing',ceil(greatest(0,needed-stock)*100)/100,'pantry_item_id',pantry_item_id,'recipes',recipes,'warning',warning) order by name,key),'[]'::jsonb) into rows from calculated;
 result:=jsonb_build_object('week',p_week,'rows',rows,'unquantified_meals',(select count(*) from public.meal_plan_entries m where m.household_id=p_household_id and m.meal_date between p_week and p_week+6 and m.status='planned' and (m.recipe_id is null or not exists(select 1 from public.recipe_ingredients i where i.recipe_id=m.recipe_id and i.household_id=p_household_id and not i.optional))));
 return result||jsonb_build_object('fingerprint',md5(result::text));
end $$;
revoke all on function public.get_weekly_shopping_plan(uuid,date) from public,anon;
grant execute on function public.get_weekly_shopping_plan(uuid,date) to authenticated;

create function public.sync_weekly_shopping_plan(p_household_id uuid,p_week date,p_fingerprint text) returns uuid
 language plpgsql security invoker set search_path='' as $$
declare plan jsonb;row jsonb;destination uuid;
begin
 if auth.uid() is null or not public.can_edit_household_module(p_household_id,'lists') or not public.can_view_household_module(p_household_id,'meals') then
  raise exception 'Necesitas consultar Comidas y editar Listas.' using errcode='42501';end if;
 if p_week is null then raise exception 'Selecciona una semana.' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_household_id::text||':shopping:'||p_week::text,0));
 plan:=public.get_weekly_shopping_plan(p_household_id,p_week);
 if p_fingerprint is distinct from plan->>'fingerprint' then raise exception 'El menú o la despensa cambiaron. Actualiza la vista previa antes de guardar.' using errcode='40001';end if;
 insert into public.lists(household_id,title,list_type,shopping_week) values(p_household_id,'Compra semanal · '||to_char(p_week,'DD/MM/YYYY'),'shopping',p_week)
  on conflict(household_id,shopping_week) where shopping_week is not null do update set updated_at=now() returning id into destination;
 -- Only automatically generated pending rows from this week are synchronized.
 delete from public.list_items x where x.household_id=p_household_id and x.shopping_week=p_week and not x.completed
  and not exists(select 1 from jsonb_array_elements(plan->'rows') r where r->>'key'=x.shopping_key and (r->>'missing')::numeric>0);
 for row in select value from jsonb_array_elements(plan->'rows') where (value->>'missing')::numeric>0 loop
  insert into public.list_items(household_id,list_id,text,quantity,notes,source_pantry_item_id,shopping_week,shopping_key)
   values(p_household_id,destination,row->>'name',trim_scale((row->>'missing')::numeric)::text||' '||(row->>'unit'),'Menú semanal: '||(row->>'recipes'),(row->>'pantry_item_id')::uuid,p_week,row->>'key')
   on conflict(household_id,shopping_week,shopping_key) where shopping_week is not null do update set quantity=excluded.quantity
   where not public.list_items.completed;
 end loop;
 return destination;
end $$;
revoke all on function public.sync_weekly_shopping_plan(uuid,date,text) from public,anon;
grant execute on function public.sync_weekly_shopping_plan(uuid,date,text) to authenticated;
