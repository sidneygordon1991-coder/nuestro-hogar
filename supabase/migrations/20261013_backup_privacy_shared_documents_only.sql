create or replace function public.household_backup_rows(p_household_id uuid,p_table text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if p_table not in (
    'budget_allocations','budget_categories','events','finance_accounts','finance_assets',
    'finance_category_member_settings','finance_category_settings','finance_household_settings','finance_member_settings',
    'finance_net_worth_snapshots','finance_transfers','goal_contributions','household_automation_rules',
    'household_documents','household_health_snapshots','household_planning_goals','list_items','lists',
    'maintenance_records','maintenance_schedules','meal_plan_entries','monthly_household_closures',
    'pantry_items','planning_milestones','recipe_ingredients','recipes',
    'recurring_transaction_occurrences','recurring_transactions','savings_goals','transaction_splits','transactions'
  ) then raise exception 'Backup table not allowed'; end if;
  if p_table='household_documents' then
    select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) into v_result
    from public.household_documents d
    where d.household_id=p_household_id and d.access_scope='household';
  else
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where t.household_id=$1',p_table)
      into v_result using p_household_id;
  end if;
  return coalesce(v_result,'[]'::jsonb);
end $$;

create or replace function public.capture_household_recovery_delete()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_payload jsonb;v_label text;v_module text:=tg_argv[0];v_label_field text:=tg_argv[1];
begin
  if pg_trigger_depth()>1 then return old; end if;
  if tg_table_name='household_documents' and coalesce(old.access_scope,'household')<>'household' then return old; end if;

  v_payload:=jsonb_build_object('record',to_jsonb(old));
  v_label:=case when v_label_field='' then null else to_jsonb(old)->>v_label_field end;

  if tg_table_name='transactions' then
    v_payload:=v_payload||jsonb_build_object('transaction_splits',coalesce((select jsonb_agg(to_jsonb(x)) from public.transaction_splits x where x.transaction_id=old.id),'[]'::jsonb));
  elsif tg_table_name='lists' then
    v_payload:=v_payload||jsonb_build_object('list_items',coalesce((select jsonb_agg(to_jsonb(x)) from public.list_items x where x.list_id=old.id),'[]'::jsonb));
  elsif tg_table_name='recipes' then
    v_payload:=v_payload||jsonb_build_object('recipe_ingredients',coalesce((select jsonb_agg(to_jsonb(x)) from public.recipe_ingredients x where x.recipe_id=old.id),'[]'::jsonb));
  elsif tg_table_name='household_planning_goals' then
    v_payload:=v_payload||jsonb_build_object('planning_milestones',coalesce((select jsonb_agg(to_jsonb(x)) from public.planning_milestones x where x.planning_goal_id=old.id),'[]'::jsonb));
  end if;

  insert into public.household_recovery_items(
    household_id,module,source_table,source_id,label,row_data,deleted_by
  ) values(old.household_id,v_module,tg_table_name,old.id::text,v_label,v_payload,auth.uid());

  return old;
end $$;

revoke execute on function public.household_backup_rows(uuid,text) from public,anon,authenticated;
revoke execute on function public.capture_household_recovery_delete() from public,anon,authenticated;
