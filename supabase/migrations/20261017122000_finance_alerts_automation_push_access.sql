-- v31: finance alerts also run in the hourly automation (not only when someone opens Inicio),
-- and web push only delivers a notification to a member who can still view its module.

create or replace function public.refresh_all_finance_alerts()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare v_household uuid;v_total integer:=0;v_count integer;
begin
  for v_household in select id from public.households loop
    begin
      v_count:=coalesce(public.refresh_finance_alerts(v_household),0);
      v_total:=v_total+v_count;
    exception when others then
      -- One broken household must never stop the alerts of the others.
      raise warning 'refresh_finance_alerts(%) failed: %',v_household,sqlerrm;
    end;
  end loop;
  return v_total;
end $$;
revoke execute on function public.refresh_all_finance_alerts() from public,anon,authenticated;

do $$
declare def text;updated text;
begin
  def:=pg_get_functiondef('public.run_household_automation()'::regprocedure);
  if position('refresh_all_finance_alerts' in def)>0 then return; end if;
  updated:=replace(def,'perform public.purge_expired_recovery_items();',E'perform public.refresh_all_finance_alerts();\n  perform public.purge_expired_recovery_items();');
  if updated=def then raise exception 'run_household_automation: expected anchor not found'; end if;
  execute updated;
end $$;
revoke execute on function public.run_household_automation() from public,anon,authenticated;

-- Module of a notification's action tab, shared by the screen filter and the push sender.
create or replace function public.notification_module_for_tab(p_action_tab text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case split_part(coalesce(p_action_tab,''),':',1)
    when 'presupuesto' then 'finance' when 'calendario' then 'calendar' when 'listas' then 'lists'
    when 'documentos' then 'documents' when 'comidas' then 'meals' when 'mantenimiento' then 'maintenance'
    when 'planeacion' then 'planning' when 'salud' then 'health' when 'cierre' then 'monthly_close'
    when 'automatizaciones' then 'automations' else null end
$$;

-- Server-side twin of notification_module_allowed for a given user (auth.uid() is null in the push sender).
create or replace function public.notification_push_allowed(p_household_id uuid,p_user_id uuid,p_action_tab text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_module text:=public.notification_module_for_tab(p_action_tab);
begin
  if not exists(select 1 from public.household_members where household_id=p_household_id and user_id=p_user_id) then return false; end if;
  return v_module is null or public.household_module_access_for_user(p_household_id,p_user_id,v_module)<>'none';
end $$;
revoke execute on function public.notification_push_allowed(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.notification_push_allowed(uuid,uuid,text) to service_role;
