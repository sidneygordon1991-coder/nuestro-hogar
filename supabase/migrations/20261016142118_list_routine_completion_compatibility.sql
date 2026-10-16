-- Old installed clients complete list items with direct UPDATE. Advancing a
-- routine must therefore be a server invariant shared by RPC and direct writes.
create function household_integrity.advance_list_routine() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare step_days integer;next_day date;next_member uuid;participants uuid[];server_day date:=(now() at time zone 'America/Guatemala')::date;
begin
 if old.completed or not new.completed or new.routine_frequency='none' then return new;end if;
 step_days:=case when new.routine_frequency='daily' then 1 else 7 end;
 next_day:=new.due_date+step_days*(greatest(0,(server_day-new.due_date)/step_days)+1);
 select coalesce(array_agg(x order by ord),'{}'::uuid[]) into participants
  from unnest(new.routine_members) with ordinality a(x,ord)
  where exists(select 1 from public.household_members m where m.household_id=new.household_id and m.user_id=x);
 if cardinality(participants)>0 then
  next_member:=participants[coalesce(array_position(participants,new.assigned_to),0)%cardinality(participants)+1];
 elsif exists(select 1 from public.household_members where household_id=new.household_id and user_id=new.assigned_to) then next_member:=new.assigned_to;end if;
 insert into public.list_items(household_id,list_id,text,quantity,notes,assigned_to,due_date,sort_order,routine_frequency,routine_series_id,routine_members)
  values(new.household_id,new.list_id,new.text,new.quantity,new.notes,next_member,next_day,new.sort_order,new.routine_frequency,new.routine_series_id,participants)
  on conflict(household_id,routine_series_id,due_date) where routine_series_id is not null do nothing;
 return new;
end $$;
revoke all on function household_integrity.advance_list_routine() from public,anon;
create trigger advance_list_routine after update of completed on public.list_items
 for each row when(not old.completed and new.completed) execute function household_integrity.advance_list_routine();

create or replace function public.complete_household_list_item(p_household_id uuid,p_item_id uuid,p_completed boolean)
 returns uuid language plpgsql security invoker set search_path='' as $$
declare item public.list_items;
begin
 if auth.uid() is null or not public.can_edit_household_module(p_household_id,'lists') then
  raise exception 'Necesitas permiso para editar Listas.' using errcode='42501';end if;
 if p_completed is null then raise exception 'Confirma el estado de la tarea.' using errcode='23514';end if;
 select * into item from public.list_items where id=p_item_id and household_id=p_household_id for update;
 if not found then raise exception 'El elemento ya no está disponible.' using errcode='40001';end if;
 if item.completed=p_completed then return item.id;end if;
 update public.list_items set completed=p_completed,completed_at=case when p_completed then now() else null end where id=item.id;
 return item.id;
end $$;
revoke all on function public.complete_household_list_item(uuid,uuid,boolean) from public,anon;
grant execute on function public.complete_household_list_item(uuid,uuid,boolean) to authenticated;
