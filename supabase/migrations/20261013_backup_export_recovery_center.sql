-- Backup, export and recovery center.
alter table public.household_member_access drop constraint if exists household_member_access_module_check;
alter table public.household_member_access
  add constraint household_member_access_module_check
  check (module in ('finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations','backups'));

create table if not exists public.household_backups(
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  schema_version integer not null default 1,
  snapshot jsonb not null,
  counts jsonb not null default '{}'::jsonb,
  size_bytes integer not null default 0,
  source text not null default 'manual' check(source in ('manual','imported')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_household_backups_household_created on public.household_backups(household_id,created_at desc);
alter table public.household_backups enable row level security;
drop policy if exists household_backups_select on public.household_backups;
create policy household_backups_select on public.household_backups for select to authenticated using (public.can_view_household_module(household_id,'backups'));
revoke insert,update,delete on public.household_backups from authenticated;
grant select on public.household_backups to authenticated;

create table if not exists public.household_recovery_items(
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  module text not null,
  source_table text not null,
  source_id text not null,
  label text,
  row_data jsonb not null,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 days'),
  restored_at timestamptz,
  restored_by uuid references auth.users(id) on delete set null
);
create index if not exists idx_recovery_household_deleted on public.household_recovery_items(household_id,deleted_at desc);
create index if not exists idx_recovery_active on public.household_recovery_items(household_id,expires_at) where restored_at is null;
alter table public.household_recovery_items enable row level security;
drop policy if exists household_recovery_select on public.household_recovery_items;
create policy household_recovery_select on public.household_recovery_items for select to authenticated using (public.can_view_household_module(household_id,'backups'));
revoke insert,update,delete on public.household_recovery_items from authenticated;
grant select on public.household_recovery_items to authenticated;


CREATE OR REPLACE FUNCTION public.default_household_module_access(p_role text, p_module text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if p_module='backups' then
    if p_role in ('owner','admin') then return 'edit'; end if;
    return 'none';
  end if;
  if p_role in ('owner','admin','adult','member') then return 'edit'; end if;
  if p_role='teen' then
    if p_module in ('calendar','lists','meals') then return 'edit'; end if;
    if p_module in ('maintenance','planning') then return 'view'; end if;
    return 'none';
  end if;
  if p_role='guest' then
    if p_module in ('calendar','lists','meals') then return 'view'; end if;
    return 'none';
  end if;
  return 'none';
end $function$;

CREATE OR REPLACE FUNCTION public.household_module_access_for_user(p_household_id uuid, p_user_id uuid, p_module text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_override text;
begin
  if p_module not in ('finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations','backups') then return 'none'; end if;
  select role into v_role from public.household_members where household_id=p_household_id and user_id=p_user_id;
  if v_role is null then return 'none'; end if;
  if p_module='backups' then return case when v_role in ('owner','admin') then 'edit' else 'none' end; end if;
  if v_role in ('owner','admin') then return 'edit'; end if;
  select access_level into v_override from public.household_member_access
  where household_id=p_household_id and user_id=p_user_id and module=p_module;
  return coalesce(v_override,public.default_household_module_access(v_role,p_module));
end $function$;

CREATE OR REPLACE FUNCTION public.get_my_household_access(p_household_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_modules jsonb:='{}'::jsonb;v_module text;v_level text;
begin
  v_role:=public.household_role_for_user(p_household_id,auth.uid());
  if v_role is null then raise exception 'Not a household member'; end if;
  foreach v_module in array array['finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations','backups'] loop
    if public.can_edit_household_module(p_household_id,v_module) then v_level:='edit';
    elsif public.can_view_household_module(p_household_id,v_module) then v_level:='view';
    else v_level:='none'; end if;
    v_modules:=v_modules||jsonb_build_object(v_module,v_level);
  end loop;
  return jsonb_build_object(
    'role',v_role,
    'can_manage_members',public.can_manage_household_members(p_household_id),
    'can_view_audit',public.can_view_household_audit(p_household_id),
    'modules',v_modules
  );
end $function$;

CREATE OR REPLACE FUNCTION public.get_household_member_access(p_household_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_effective jsonb:='{}'::jsonb;v_overrides jsonb:='{}'::jsonb;v_module text;
begin
  if not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  v_role:=public.household_role_for_user(p_household_id,p_user_id);
  if v_role is null then raise exception 'Member not found'; end if;
  foreach v_module in array array['finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations','backups'] loop
    v_effective:=v_effective||jsonb_build_object(v_module,public.household_module_access_for_user(p_household_id,p_user_id,v_module));
  end loop;
  select coalesce(jsonb_object_agg(module,access_level),'{}'::jsonb) into v_overrides
  from public.household_member_access where household_id=p_household_id and user_id=p_user_id and module<>'backups';
  return jsonb_build_object('role',v_role,'effective',v_effective,'overrides',v_overrides);
end $function$;

CREATE OR REPLACE FUNCTION public.household_backup_rows(p_household_id uuid, p_table text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where t.household_id=$1',p_table)
    into v_result using p_household_id;
  return coalesce(v_result,'[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.build_household_backup_snapshot(p_household_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_household jsonb;v_members jsonb;v_tables jsonb;
begin
  if auth.uid() is null or not public.can_view_household_module(p_household_id,'backups') then raise exception 'Backup access required'; end if;

  select jsonb_build_object('id',id,'name',name,'created_at',created_at) into v_household
  from public.households where id=p_household_id;
  if v_household is null then raise exception 'Household not found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',hm.user_id,'role',hm.role,'joined_at',hm.joined_at,'responsibilities',hm.responsibilities,
    'profile',jsonb_build_object('full_name',p.full_name,'avatar_url',p.avatar_url,'birth_date',p.birth_date,'relationship',p.relationship,'phone',p.phone)
  ) order by hm.joined_at),'[]'::jsonb)
  into v_members
  from public.household_members hm
  left join public.profiles p on p.id=hm.user_id
  where hm.household_id=p_household_id;

  v_tables:=jsonb_build_object(
    'budget_categories',public.household_backup_rows(p_household_id,'budget_categories'),
    'budget_allocations',public.household_backup_rows(p_household_id,'budget_allocations'),
    'finance_accounts',public.household_backup_rows(p_household_id,'finance_accounts'),
    'finance_assets',public.household_backup_rows(p_household_id,'finance_assets'),
    'finance_household_settings',public.household_backup_rows(p_household_id,'finance_household_settings'),
    'finance_member_settings',public.household_backup_rows(p_household_id,'finance_member_settings'),
    'finance_category_settings',public.household_backup_rows(p_household_id,'finance_category_settings'),
    'finance_category_member_settings',public.household_backup_rows(p_household_id,'finance_category_member_settings'),
    'savings_goals',public.household_backup_rows(p_household_id,'savings_goals'),
    'goal_contributions',public.household_backup_rows(p_household_id,'goal_contributions'),
    'recurring_transactions',public.household_backup_rows(p_household_id,'recurring_transactions'),
    'recurring_transaction_occurrences',public.household_backup_rows(p_household_id,'recurring_transaction_occurrences'),
    'transactions',public.household_backup_rows(p_household_id,'transactions'),
    'transaction_splits',public.household_backup_rows(p_household_id,'transaction_splits'),
    'finance_transfers',public.household_backup_rows(p_household_id,'finance_transfers'),
    'finance_net_worth_snapshots',public.household_backup_rows(p_household_id,'finance_net_worth_snapshots'),
    'events',public.household_backup_rows(p_household_id,'events'),
    'lists',public.household_backup_rows(p_household_id,'lists'),
    'list_items',public.household_backup_rows(p_household_id,'list_items'),
    'household_documents',public.household_backup_rows(p_household_id,'household_documents'),
    'pantry_items',public.household_backup_rows(p_household_id,'pantry_items'),
    'recipes',public.household_backup_rows(p_household_id,'recipes'),
    'recipe_ingredients',public.household_backup_rows(p_household_id,'recipe_ingredients'),
    'meal_plan_entries',public.household_backup_rows(p_household_id,'meal_plan_entries'),
    'maintenance_schedules',public.household_backup_rows(p_household_id,'maintenance_schedules'),
    'maintenance_records',public.household_backup_rows(p_household_id,'maintenance_records'),
    'household_planning_goals',public.household_backup_rows(p_household_id,'household_planning_goals'),
    'planning_milestones',public.household_backup_rows(p_household_id,'planning_milestones'),
    'monthly_household_closures',public.household_backup_rows(p_household_id,'monthly_household_closures'),
    'household_automation_rules',public.household_backup_rows(p_household_id,'household_automation_rules'),
    'household_health_snapshots',public.household_backup_rows(p_household_id,'household_health_snapshots')
  );

  return jsonb_build_object(
    'product','Nuestro Hogar','schema_version',1,'exported_at',now(),
    'household',v_household,'members',v_members,'tables',v_tables,
    'notes',jsonb_build_object(
      'document_files_included',false,
      'document_metadata_included',true,
      'authentication_secrets_included',false
    )
  );
end $function$;

CREATE OR REPLACE FUNCTION public.create_household_backup(p_household_id uuid, p_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_snapshot jsonb;v_counts jsonb;v_total integer;v_id uuid;v_name text;
begin
  if auth.uid() is null or not public.can_edit_household_module(p_household_id,'backups') then raise exception 'Backup edit access required'; end if;
  v_snapshot:=public.build_household_backup_snapshot(p_household_id);
  select coalesce(jsonb_object_agg(key,jsonb_array_length(value)),'{}'::jsonb),coalesce(sum(jsonb_array_length(value)),0)::int
  into v_counts,v_total from jsonb_each(v_snapshot->'tables');
  v_counts:=jsonb_build_object('total_records',v_total,'by_table',v_counts);
  v_name:=coalesce(nullif(trim(p_name),''),'Respaldo '||to_char(now() at time zone 'America/Guatemala','DD/MM/YYYY HH24:MI'));

  insert into public.household_backups(household_id,name,schema_version,snapshot,counts,size_bytes,source,created_by)
  values(p_household_id,v_name,1,v_snapshot,v_counts,pg_column_size(v_snapshot),'manual',auth.uid())
  returning id into v_id;

  insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata)
  values(p_household_id,auth.uid(),'create','backups','household_backup',v_id::text,v_name,jsonb_build_object('records',v_total));

  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.import_household_backup(p_household_id uuid, p_snapshot jsonb, p_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_counts jsonb;v_total integer;v_id uuid;v_name text;v_source_household uuid;
begin
  if auth.uid() is null or not public.can_edit_household_module(p_household_id,'backups') then raise exception 'Backup edit access required'; end if;
  if coalesce((p_snapshot->>'schema_version')::integer,0)<>1 then raise exception 'Unsupported backup schema version'; end if;
  if jsonb_typeof(p_snapshot->'tables')<>'object' then raise exception 'Invalid backup file'; end if;
  v_source_household:=(p_snapshot->'household'->>'id')::uuid;
  if v_source_household<>p_household_id then raise exception 'This backup belongs to a different household'; end if;

  select coalesce(jsonb_object_agg(key,case when jsonb_typeof(value)='array' then jsonb_array_length(value) else 0 end),'{}'::jsonb),
         coalesce(sum(case when jsonb_typeof(value)='array' then jsonb_array_length(value) else 0 end),0)::int
  into v_counts,v_total from jsonb_each(p_snapshot->'tables');
  v_counts:=jsonb_build_object('total_records',v_total,'by_table',v_counts);
  v_name:=coalesce(nullif(trim(p_name),''),'Respaldo importado '||to_char(now() at time zone 'America/Guatemala','DD/MM/YYYY HH24:MI'));

  insert into public.household_backups(household_id,name,schema_version,snapshot,counts,size_bytes,source,created_by)
  values(p_household_id,v_name,1,p_snapshot,v_counts,pg_column_size(p_snapshot),'imported',auth.uid())
  returning id into v_id;

  insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata)
  values(p_household_id,auth.uid(),'create','backups','household_backup',v_id::text,v_name,jsonb_build_object('source','imported','records',v_total));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_household_backup(p_backup_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.household_backups%rowtype;
begin
  select * into v_row from public.household_backups where id=p_backup_id;
  if not found then raise exception 'Backup not found'; end if;
  if not public.can_edit_household_module(v_row.household_id,'backups') then raise exception 'Backup edit access required'; end if;
  delete from public.household_backups where id=p_backup_id;
  insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata)
  values(v_row.household_id,auth.uid(),'delete','backups','household_backup',p_backup_id::text,v_row.name,'{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.restore_backup_table_missing(p_household_id uuid, p_table text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer:=0;
begin
  if p_table not in (
    'budget_allocations','budget_categories','events','finance_accounts','finance_assets',
    'finance_category_member_settings','finance_category_settings','finance_household_settings','finance_member_settings',
    'finance_net_worth_snapshots','finance_transfers','goal_contributions','household_automation_rules',
    'household_documents','household_health_snapshots','household_planning_goals','list_items','lists',
    'maintenance_records','maintenance_schedules','meal_plan_entries','monthly_household_closures',
    'pantry_items','planning_milestones','recipe_ingredients','recipes',
    'recurring_transaction_occurrences','recurring_transactions','savings_goals','transaction_splits','transactions'
  ) then raise exception 'Restore table not allowed'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then return 0; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x where x->>'household_id' is distinct from p_household_id::text) then
    raise exception 'Backup contains records from a different household';
  end if;

  execute format(
    'insert into public.%I select x.* from jsonb_populate_recordset(null::public.%I,$1) x on conflict do nothing',
    p_table,p_table
  ) using p_rows;
  get diagnostics v_count=row_count;
  return v_count;
end $function$;

CREATE OR REPLACE FUNCTION public.restore_household_backup_missing(p_backup_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.household_backups%rowtype;v_table text;v_count integer;v_total integer:=0;v_by_table jsonb:='{}'::jsonb;
begin
  select * into v_row from public.household_backups where id=p_backup_id;
  if not found then raise exception 'Backup not found'; end if;
  if not public.can_edit_household_module(v_row.household_id,'backups') then raise exception 'Backup edit access required'; end if;

  foreach v_table in array array[
    'budget_categories','finance_accounts','finance_assets','savings_goals','recurring_transactions',
    'events','lists','household_documents','pantry_items','recipes','maintenance_schedules','household_planning_goals',
    'finance_household_settings','finance_member_settings','finance_category_settings','finance_category_member_settings',
    'budget_allocations','goal_contributions','recurring_transaction_occurrences','finance_transfers','transactions',
    'transaction_splits','list_items','recipe_ingredients','meal_plan_entries','maintenance_records','planning_milestones',
    'monthly_household_closures','household_automation_rules','finance_net_worth_snapshots','household_health_snapshots'
  ] loop
    v_count:=public.restore_backup_table_missing(v_row.household_id,v_table,v_row.snapshot->'tables'->v_table);
    v_total:=v_total+v_count;
    v_by_table:=v_by_table||jsonb_build_object(v_table,v_count);
  end loop;

  insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata)
  values(v_row.household_id,auth.uid(),'update','backups','household_backup',p_backup_id::text,v_row.name,
    jsonb_build_object('restore_mode','missing_only','restored_records',v_total,'by_table',v_by_table));

  return jsonb_build_object('restored_records',v_total,'by_table',v_by_table);
end $function$;

CREATE OR REPLACE FUNCTION public.capture_household_recovery_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_payload jsonb;v_label text;v_module text:=tg_argv[0];v_label_field text:=tg_argv[1];
begin
  if pg_trigger_depth()>1 then return old; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.restore_recovery_item(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_item public.household_recovery_items%rowtype;v_record jsonb;v_count integer:=0;v_children integer:=0;
begin
  select * into v_item from public.household_recovery_items where id=p_item_id;
  if not found then raise exception 'Recovery item not found'; end if;
  if not public.can_edit_household_module(v_item.household_id,'backups') then raise exception 'Recovery access required'; end if;
  if v_item.restored_at is not null then return jsonb_build_object('restored',false,'reason','already_restored'); end if;
  if v_item.expires_at<now() then raise exception 'Recovery item expired'; end if;
  v_record:=v_item.row_data->'record';

  if v_item.source_table='household_documents' then
    v_record:=v_record||jsonb_build_object('file_path',null,'original_filename',null,'mime_type',null,'file_size',null);
  elsif v_item.source_table='maintenance_schedules' then
    v_record:=v_record||jsonb_build_object('document_id',null,'calendar_event_id',null);
  elsif v_item.source_table='household_planning_goals' then
    v_record:=v_record||jsonb_build_object('linked_savings_goal_id',null,'linked_account_id',null,'linked_maintenance_id',null,'linked_event_id',null);
  end if;

  v_count:=public.restore_backup_table_missing(v_item.household_id,v_item.source_table,jsonb_build_array(v_record));

  if v_item.source_table='transactions' then
    v_children:=public.restore_backup_table_missing(v_item.household_id,'transaction_splits',v_item.row_data->'transaction_splits');
  elsif v_item.source_table='lists' then
    v_children:=public.restore_backup_table_missing(v_item.household_id,'list_items',v_item.row_data->'list_items');
  elsif v_item.source_table='recipes' then
    v_children:=public.restore_backup_table_missing(v_item.household_id,'recipe_ingredients',v_item.row_data->'recipe_ingredients');
  elsif v_item.source_table='household_planning_goals' then
    v_children:=public.restore_backup_table_missing(v_item.household_id,'planning_milestones',v_item.row_data->'planning_milestones');
  end if;

  update public.household_recovery_items set restored_at=now(),restored_by=auth.uid() where id=p_item_id;

  insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata)
  values(v_item.household_id,auth.uid(),'create','backups','recovery_restore',p_item_id::text,v_item.label,
    jsonb_build_object('source_table',v_item.source_table,'record_restored',v_count,'children_restored',v_children));

  return jsonb_build_object('restored',true,'records',v_count+v_children);
exception
  when foreign_key_violation then
    raise exception 'No se puede restaurar todavía porque falta un registro relacionado. Restaura primero su elemento principal.';
end $function$;

CREATE OR REPLACE FUNCTION public.discard_recovery_item(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_item public.household_recovery_items%rowtype;
begin
  select * into v_item from public.household_recovery_items where id=p_item_id;
  if not found then return; end if;
  if not public.can_edit_household_module(v_item.household_id,'backups') then raise exception 'Recovery access required'; end if;
  delete from public.household_recovery_items where id=p_item_id;
end $function$;

CREATE OR REPLACE FUNCTION public.purge_expired_recovery_items()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  delete from public.household_recovery_items where expires_at<now()
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
  perform public.refresh_all_planning_notifications();
  perform public.refresh_all_monthly_close_notifications();
  perform public.refresh_all_net_worth_snapshots();
  perform public.purge_expired_recovery_items();
end;
$function$;


do $$
declare r record;
begin
  for r in select * from (values
    ('transactions','finance','description'),
    ('events','calendar','title'),
    ('lists','lists','title'),
    ('list_items','lists','text'),
    ('household_documents','documents','title'),
    ('pantry_items','meals','name'),
    ('recipes','meals','name'),
    ('maintenance_schedules','maintenance','title'),
    ('household_planning_goals','planning','title')
  ) as x(table_name,module,label_field)
  loop
    execute format('drop trigger if exists %I on public.%I','recovery_'||r.table_name,r.table_name);
    execute format('create trigger %I before delete on public.%I for each row execute function public.capture_household_recovery_delete(%L,%L)',
      'recovery_'||r.table_name,r.table_name,r.module,r.label_field);
  end loop;
end $$;

revoke execute on function public.household_backup_rows(uuid,text) from public,anon,authenticated;
revoke execute on function public.restore_backup_table_missing(uuid,text,jsonb) from public,anon,authenticated;
revoke execute on function public.capture_household_recovery_delete() from public,anon,authenticated;
revoke execute on function public.purge_expired_recovery_items() from public,anon,authenticated;
revoke execute on function public.build_household_backup_snapshot(uuid) from public,anon;
grant execute on function public.build_household_backup_snapshot(uuid) to authenticated;
revoke execute on function public.create_household_backup(uuid,text) from public,anon;
grant execute on function public.create_household_backup(uuid,text) to authenticated;
revoke execute on function public.import_household_backup(uuid,jsonb,text) from public,anon;
grant execute on function public.import_household_backup(uuid,jsonb,text) to authenticated;
revoke execute on function public.delete_household_backup(uuid) from public,anon;
grant execute on function public.delete_household_backup(uuid) to authenticated;
revoke execute on function public.restore_household_backup_missing(uuid) from public,anon;
grant execute on function public.restore_household_backup_missing(uuid) to authenticated;
revoke execute on function public.restore_recovery_item(uuid) from public,anon;
grant execute on function public.restore_recovery_item(uuid) to authenticated;
revoke execute on function public.discard_recovery_item(uuid) from public,anon;
grant execute on function public.discard_recovery_item(uuid) to authenticated;
revoke execute on function public.run_household_automation() from public,anon,authenticated;
grant execute on function public.run_household_automation() to service_role;
