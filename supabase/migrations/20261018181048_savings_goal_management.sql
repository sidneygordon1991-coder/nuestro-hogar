-- Metadata-only management. Financial entries, amounts and historical snapshots are never rewritten.
-- Locking uses the same parent row as household_integrity.lock_savings_goal(), serializing contributions/deletes.
create or replace function household_integrity.protect_savings_goal_history() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- A separately authorized deletion of the entire household may cascade normally.
 if not exists(select 1 from public.households where id=old.household_id) then return old;end if;
 if auth.uid() is null or public.can_edit_household_module(old.household_id,'finance') is not true then
  raise exception 'Necesitas permiso para editar Finanzas.' using errcode='42501';
 end if;
 -- The private trigger must see links even when the finance editor cannot read the Planning module.
 if exists(select 1 from public.goal_contributions where goal_id=old.id)
    or exists(select 1 from public.goal_budget_links where goal_id=old.id)
    or exists(select 1 from public.household_planning_goals where linked_savings_goal_id=old.id) then
  raise exception 'Esta meta tiene aportes, retiros o vínculos con presupuesto o planeación. Archívala para conservar su historial.' using errcode='23001';
 end if;
 return old;
end $$;
revoke all on function household_integrity.protect_savings_goal_history() from public,anon,authenticated;
create or replace trigger savings_goal_preserve_history before delete on public.savings_goals
for each row execute function household_integrity.protect_savings_goal_history();

create or replace function public.manage_savings_goal(
 p_household_id uuid,p_goal_id uuid,p_action text,p_expected jsonb,p_values jsonb default '{}'::jsonb
) returns uuid language plpgsql security invoker set search_path='' as $$
declare g public.savings_goals;terms jsonb;v_name text;v_amount numeric;v_date date;
begin
 if auth.uid() is null or public.can_edit_household_module(p_household_id,'finance') is not true then
  raise exception 'Necesitas permiso para editar Finanzas.' using errcode='42501';
 end if;
 if p_action is null or p_action not in ('edit','archive','restore','delete') then
  raise exception 'Elige una acción válida para la meta.' using errcode='23514';
 end if;
 select * into g from public.savings_goals where id=p_goal_id and household_id=p_household_id for update;
 if not found then
  -- A retry after a lost delete response is harmless, within the same authorized household.
  if p_action='delete' then return p_goal_id;end if;
  raise exception 'La meta no está disponible en este hogar.' using errcode='42501';
 end if;
 terms:=jsonb_build_object('name',g.name,'target_amount',g.target_amount,'target_date',g.target_date,'active',g.active);
 if p_expected is distinct from terms then
  raise exception 'Esta meta cambió. Actualiza Finanzas antes de volver a editarla.' using errcode='40001';
 end if;
 if p_action='edit' then
  v_name:=btrim(p_values->>'name');
  v_amount:=(p_values->>'target_amount')::numeric;
  v_date:=nullif(p_values->>'target_date','')::date;
  if v_name is null or char_length(v_name) not between 1 and 120 or v_amount is null
    or v_amount<=0 or v_amount>9999999999.99 or v_amount='NaN'::numeric or v_amount<>round(v_amount,2) then
   raise exception 'Escribe un nombre y un monto objetivo válido, con hasta dos decimales.' using errcode='23514';
  end if;
  update public.savings_goals set name=v_name,target_amount=v_amount,target_date=v_date where id=g.id and household_id=p_household_id;
 elsif p_action in ('archive','restore') then
  update public.savings_goals set active=(p_action='restore') where id=g.id and household_id=p_household_id;
 else
  delete from public.savings_goals where id=g.id and household_id=p_household_id;
 end if;
 return g.id;
end $$;
revoke all on function public.manage_savings_goal(uuid,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.manage_savings_goal(uuid,uuid,text,jsonb,jsonb) to authenticated;
