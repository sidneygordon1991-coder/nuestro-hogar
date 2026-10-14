-- Read the optional document scope through JSON; non-document rows have no access_scope column.
create or replace function public.capture_household_recovery_delete()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_payload jsonb;v_label text;v_module text:=tg_argv[0];v_label_field text:=tg_argv[1];
begin
  if pg_trigger_depth()>1 then return old; end if;
  if tg_table_name='household_documents' and coalesce(to_jsonb(old)->>'access_scope','household')<>'household' then return old; end if;

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
