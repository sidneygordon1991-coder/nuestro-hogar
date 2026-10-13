-- Family mode: role model, per-module access, responsibilities and audit trail.

alter table public.household_members drop constraint if exists household_members_role_check;
update public.household_members set role='adult' where role='member';
alter table public.household_members
  add constraint household_members_role_check
  check (role in ('owner','admin','adult','teen','guest'));
alter table public.household_members
  add column if not exists responsibilities text[] not null default '{}';

create table if not exists public.household_member_access (
  household_id uuid not null,
  user_id uuid not null,
  module text not null check (module in ('finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations')),
  access_level text not null check (access_level in ('none','view','edit')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(household_id,user_id,module),
  foreign key(household_id,user_id) references public.household_members(household_id,user_id) on delete cascade
);

create table if not exists public.household_audit_log (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('create','update','delete','role_change','access_change','member_remove')),
  module text not null,
  entity_type text not null,
  entity_id text,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_member_access_household_user on public.household_member_access(household_id,user_id);
create index if not exists idx_audit_household_created on public.household_audit_log(household_id,created_at desc);

alter table public.household_member_access enable row level security;
alter table public.household_audit_log enable row level security;

create or replace function public.household_role_for_user(p_household_id uuid,p_user_id uuid)
returns text language sql stable security definer set search_path='' as $$
 select hm.role from public.household_members hm
 where hm.household_id=p_household_id and hm.user_id=p_user_id limit 1
$$;

create or replace function public.default_household_module_access(p_role text,p_module text)
returns text language plpgsql immutable set search_path='' as $$
begin
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
end $$;

create or replace function public.household_module_access_for_user(p_household_id uuid,p_user_id uuid,p_module text)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_role text;v_override text;
begin
 if p_module not in ('finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations') then return 'none'; end if;
 select role into v_role from public.household_members where household_id=p_household_id and user_id=p_user_id;
 if v_role is null then return 'none'; end if;
 if v_role in ('owner','admin') then return 'edit'; end if;
 select access_level into v_override from public.household_member_access
 where household_id=p_household_id and user_id=p_user_id and module=p_module;
 return coalesce(v_override,public.default_household_module_access(v_role,p_module));
end $$;

create or replace function public.can_view_household_module(p_household_id uuid,p_module text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_access text;
begin
 if v_user is null then return false; end if;
 v_access:=public.household_module_access_for_user(p_household_id,v_user,p_module);
 if v_access='none' then return false; end if;
 if p_module='monthly_close' and public.household_module_access_for_user(p_household_id,v_user,'finance')='none' then return false; end if;
 if p_module='health' and (
  public.household_module_access_for_user(p_household_id,v_user,'finance')='none' or
  public.household_module_access_for_user(p_household_id,v_user,'lists')='none' or
  public.household_module_access_for_user(p_household_id,v_user,'documents')='none' or
  public.household_module_access_for_user(p_household_id,v_user,'maintenance')='none' or
  public.household_module_access_for_user(p_household_id,v_user,'meals')='none'
 ) then return false; end if;
 return true;
end $$;

create or replace function public.can_edit_household_module(p_household_id uuid,p_module text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_access text;
begin
 if v_user is null then return false; end if;
 v_access:=public.household_module_access_for_user(p_household_id,v_user,p_module);
 if v_access<>'edit' then return false; end if;
 if p_module='monthly_close' and public.household_module_access_for_user(p_household_id,v_user,'finance')='none' then return false; end if;
 if p_module='health' and not public.can_view_household_module(p_household_id,'health') then return false; end if;
 return true;
end $$;

create or replace function public.can_manage_household_members(p_household_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.household_role_for_user(p_household_id,auth.uid()) in ('owner','admin'),false)
$$;

create or replace function public.can_view_household_audit(p_household_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.household_role_for_user(p_household_id,auth.uid()) in ('owner','admin','adult','member'),false)
$$;

create or replace function public.get_my_household_access(p_household_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_role text;v_modules jsonb:='{}'::jsonb;v_module text;v_level text;
begin
 v_role:=public.household_role_for_user(p_household_id,auth.uid());
 if v_role is null then raise exception 'Not a household member'; end if;
 foreach v_module in array array['finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations'] loop
  if public.can_edit_household_module(p_household_id,v_module) then v_level:='edit';
  elsif public.can_view_household_module(p_household_id,v_module) then v_level:='view';
  else v_level:='none'; end if;
  v_modules:=v_modules||jsonb_build_object(v_module,v_level);
 end loop;
 return jsonb_build_object('role',v_role,'can_manage_members',public.can_manage_household_members(p_household_id),'can_view_audit',public.can_view_household_audit(p_household_id),'modules',v_modules);
end $$;

create or replace function public.get_household_member_access(p_household_id uuid,p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_role text;v_effective jsonb:='{}'::jsonb;v_overrides jsonb:='{}'::jsonb;v_module text;
begin
 if not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
 v_role:=public.household_role_for_user(p_household_id,p_user_id);
 if v_role is null then raise exception 'Member not found'; end if;
 foreach v_module in array array['finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations'] loop
  v_effective:=v_effective||jsonb_build_object(v_module,public.household_module_access_for_user(p_household_id,p_user_id,v_module));
 end loop;
 select coalesce(jsonb_object_agg(module,access_level),'{}'::jsonb) into v_overrides
 from public.household_member_access where household_id=p_household_id and user_id=p_user_id;
 return jsonb_build_object('role',v_role,'effective',v_effective,'overrides',v_overrides);
end $$;

create or replace function public.set_household_member_access(p_household_id uuid,p_user_id uuid,p_role text,p_overrides jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor_role text;v_target_role text;v_key text;v_value text;
begin
 v_actor_role:=public.household_role_for_user(p_household_id,auth.uid());
 v_target_role:=public.household_role_for_user(p_household_id,p_user_id);
 if v_actor_role not in ('owner','admin') then raise exception 'Only household administrators can manage access'; end if;
 if v_target_role is null then raise exception 'Member not found'; end if;
 if v_target_role='owner' then raise exception 'The household owner cannot be modified'; end if;
 if p_role not in ('admin','adult','teen','guest') then raise exception 'Invalid role'; end if;
 if v_actor_role='admin' and (v_target_role='admin' or p_role='admin') then raise exception 'Only the owner can manage administrators'; end if;
 update public.household_members set role=p_role where household_id=p_household_id and user_id=p_user_id;
 delete from public.household_member_access where household_id=p_household_id and user_id=p_user_id;
 if jsonb_typeof(coalesce(p_overrides,'{}'::jsonb))='object' then
  for v_key,v_value in select key,value#>>'{}' from jsonb_each(coalesce(p_overrides,'{}'::jsonb)) loop
   if v_key in ('finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations') and v_value in ('none','view','edit') then
    insert into public.household_member_access(household_id,user_id,module,access_level,updated_by)
    values(p_household_id,p_user_id,v_key,v_value,auth.uid());
   end if;
  end loop;
 end if;
 insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata)
 values(p_household_id,auth.uid(),case when v_target_role<>p_role then 'role_change' else 'access_change' end,'family','household_member',p_user_id::text,null,
  jsonb_build_object('from_role',v_target_role,'to_role',p_role,'overrides',coalesce(p_overrides,'{}'::jsonb)));
end $$;

create or replace function public.set_household_member_responsibilities(p_household_id uuid,p_user_id uuid,p_responsibilities text[])
returns void language plpgsql security definer set search_path='' as $$
declare v_actor_role text;v_target_role text;v_clean text[];
begin
 v_actor_role:=public.household_role_for_user(p_household_id,auth.uid());
 v_target_role:=public.household_role_for_user(p_household_id,p_user_id);
 if v_actor_role not in ('owner','admin') and auth.uid()<>p_user_id then raise exception 'You cannot change these responsibilities'; end if;
 if v_target_role is null then raise exception 'Member not found'; end if;
 select coalesce(array_agg(distinct x),'{}'::text[]) into v_clean
 from unnest(coalesce(p_responsibilities,'{}'::text[])) x
 where x in ('finances','shopping','calendar','documents','meals','maintenance','planning','home');
 update public.household_members set responsibilities=v_clean where household_id=p_household_id and user_id=p_user_id;
 insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata)
 values(p_household_id,auth.uid(),'access_change','family','household_member',p_user_id::text,null,jsonb_build_object('kind','responsibilities','responsibilities',to_jsonb(v_clean)));
end $$;

create or replace function public.remove_household_member(p_household_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_actor_role text;v_target_role text;
begin
 v_actor_role:=public.household_role_for_user(p_household_id,v_actor);
 v_target_role:=public.household_role_for_user(p_household_id,p_user_id);
 if v_target_role is null then raise exception 'Member not found'; end if;
 if v_target_role='owner' then raise exception 'The owner cannot leave or be removed'; end if;
 if p_user_id<>v_actor then
  if v_actor_role='owner' then null;
  elsif v_actor_role='admin' and v_target_role in ('adult','teen','guest') then null;
  else raise exception 'You cannot remove this member'; end if;
 end if;
 insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata)
 values(p_household_id,v_actor,'member_remove','family','household_member',p_user_id::text,null,jsonb_build_object('role',v_target_role));
 delete from public.household_members where household_id=p_household_id and user_id=p_user_id;
end $$;

create or replace function public.join_household(p_invite_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select h.id into v_id from public.households h where h.invite_code=upper(trim(p_invite_code));
 if v_id is null then raise exception 'Invalid invite code'; end if;
 insert into public.household_members(household_id,user_id,role) values(v_id,auth.uid(),'guest')
 on conflict(household_id,user_id) do nothing;
 return v_id;
end $$;

drop policy if exists member_access_select on public.household_member_access;
create policy member_access_select on public.household_member_access for select to authenticated using (public.is_household_member(household_id));
revoke insert,update,delete on public.household_member_access from authenticated;
grant select on public.household_member_access to authenticated;

drop policy if exists audit_select on public.household_audit_log;
create policy audit_select on public.household_audit_log for select to authenticated using (public.can_view_household_audit(household_id));
revoke insert,update,delete on public.household_audit_log from authenticated;
grant select on public.household_audit_log to authenticated;

drop policy if exists household_members_delete on public.household_members;
create policy household_members_delete on public.household_members for delete to authenticated using (
 (user_id=auth.uid() and role<>'owner')
 or (public.household_role_for_user(household_id,auth.uid())='owner' and role<>'owner')
 or (public.household_role_for_user(household_id,auth.uid())='admin' and role in ('adult','teen','guest'))
);

do $$
declare r record;p record;
begin
 for r in select * from (values
  ('budget_allocations','finance'),('budget_categories','finance'),('transactions','finance'),('goal_contributions','finance'),('savings_goals','finance'),
  ('recurring_transactions','finance'),('recurring_transaction_occurrences','finance'),('finance_accounts','finance'),('finance_transfers','finance'),
  ('finance_assets','finance'),('finance_net_worth_snapshots','finance'),('finance_household_settings','finance'),('finance_member_settings','finance'),
  ('finance_category_settings','finance'),('finance_category_member_settings','finance'),('transaction_splits','finance'),
  ('events','calendar'),('lists','lists'),('list_items','lists'),('maintenance_schedules','maintenance'),('maintenance_records','maintenance'),
  ('pantry_items','meals'),('recipes','meals'),('recipe_ingredients','meals'),('meal_plan_entries','meals'),
  ('household_planning_goals','planning'),('planning_milestones','planning')
 ) as x(table_name,module)
 loop
  for p in select policyname from pg_policies where schemaname='public' and tablename=r.table_name loop
   execute format('drop policy if exists %I on public.%I',p.policyname,r.table_name);
  end loop;
  execute format('create policy %I on public.%I for select to authenticated using (public.can_view_household_module(household_id,%L))',r.table_name||'_module_view',r.table_name,r.module);
  execute format('create policy %I on public.%I for all to authenticated using (public.can_edit_household_module(household_id,%L)) with check (public.can_edit_household_module(household_id,%L))',r.table_name||'_module_edit',r.table_name,r.module,r.module);
 end loop;
end $$;

do $$
declare r record;p record;
begin
 for r in select * from (values
  ('household_health_snapshots','health'),('monthly_household_closures','monthly_close'),
  ('household_automation_rules','automations'),('automation_rule_runs','automations')
 ) as x(table_name,module)
 loop
  for p in select policyname from pg_policies where schemaname='public' and tablename=r.table_name loop
   execute format('drop policy if exists %I on public.%I',p.policyname,r.table_name);
  end loop;
  execute format('create policy %I on public.%I for select to authenticated using (public.can_view_household_module(household_id,%L))',r.table_name||'_module_view',r.table_name,r.module);
 end loop;
end $$;

drop policy if exists household_documents_select on public.household_documents;
drop policy if exists household_documents_insert on public.household_documents;
drop policy if exists household_documents_update on public.household_documents;
drop policy if exists household_documents_delete on public.household_documents;
create policy household_documents_select on public.household_documents for select to authenticated
using (public.can_view_household_module(household_id,'documents') and (access_scope='household' or owner_user_id=auth.uid()));
create policy household_documents_insert on public.household_documents for insert to authenticated
with check (public.can_edit_household_module(household_id,'documents') and created_by=auth.uid() and (access_scope='household' or owner_user_id=auth.uid()));
create policy household_documents_update on public.household_documents for update to authenticated
using (public.can_edit_household_module(household_id,'documents') and (access_scope='household' or owner_user_id=auth.uid()))
with check (public.can_edit_household_module(household_id,'documents') and (access_scope='household' or owner_user_id=auth.uid()));
create policy household_documents_delete on public.household_documents for delete to authenticated
using (public.can_edit_household_module(household_id,'documents') and (access_scope='household' or owner_user_id=auth.uid()));

drop policy if exists household_documents_storage_select on storage.objects;
drop policy if exists household_documents_storage_insert on storage.objects;
drop policy if exists household_documents_storage_update on storage.objects;
drop policy if exists household_documents_storage_delete on storage.objects;
create policy household_documents_storage_select on storage.objects for select to authenticated using (
 bucket_id='household-documents'
 and public.can_view_household_module(((storage.foldername(name))[1])::uuid,'documents')
 and ((storage.foldername(name))[2]='household' or ((storage.foldername(name))[2]='private' and (storage.foldername(name))[3]=auth.uid()::text))
);
create policy household_documents_storage_insert on storage.objects for insert to authenticated with check (
 bucket_id='household-documents'
 and public.can_edit_household_module(((storage.foldername(name))[1])::uuid,'documents')
 and ((storage.foldername(name))[2]='household' or ((storage.foldername(name))[2]='private' and (storage.foldername(name))[3]=auth.uid()::text))
);
create policy household_documents_storage_update on storage.objects for update to authenticated using (
 bucket_id='household-documents'
 and public.can_edit_household_module(((storage.foldername(name))[1])::uuid,'documents')
 and ((storage.foldername(name))[2]='household' or ((storage.foldername(name))[2]='private' and (storage.foldername(name))[3]=auth.uid()::text))
) with check (
 bucket_id='household-documents'
 and public.can_edit_household_module(((storage.foldername(name))[1])::uuid,'documents')
 and ((storage.foldername(name))[2]='household' or ((storage.foldername(name))[2]='private' and (storage.foldername(name))[3]=auth.uid()::text))
);
create policy household_documents_storage_delete on storage.objects for delete to authenticated using (
 bucket_id='household-documents'
 and public.can_edit_household_module(((storage.foldername(name))[1])::uuid,'documents')
 and ((storage.foldername(name))[2]='household' or ((storage.foldername(name))[2]='private' and (storage.foldername(name))[3]=auth.uid()::text))
);

create or replace function public.notification_module_allowed(p_household_id uuid,p_action_tab text,p_type text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_module text;
begin
 v_module:=case
  when p_action_tab='presupuesto' then 'finance' when p_action_tab='calendario' then 'calendar'
  when p_action_tab='listas' then 'lists' when p_action_tab='documentos' then 'documents'
  when p_action_tab='comidas' then 'meals' when p_action_tab='mantenimiento' then 'maintenance'
  when p_action_tab='planeacion' then 'planning' when p_action_tab='salud' then 'health'
  when p_action_tab='cierre' then 'monthly_close' when p_action_tab='automatizaciones' then 'automations'
  else null end;
 return v_module is null or public.can_view_household_module(p_household_id,v_module);
end $$;

drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
using (user_id=auth.uid() and public.is_household_member(household_id) and public.notification_module_allowed(household_id,action_tab,type));
create policy notifications_update_own on public.notifications for update to authenticated
using (user_id=auth.uid() and public.is_household_member(household_id) and public.notification_module_allowed(household_id,action_tab,type))
with check (user_id=auth.uid() and public.is_household_member(household_id) and public.notification_module_allowed(household_id,action_tab,type));
create policy notifications_delete_own on public.notifications for delete to authenticated
using (user_id=auth.uid() and public.is_household_member(household_id) and public.notification_module_allowed(household_id,action_tab,type));

create or replace function public.audit_household_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_row jsonb;v_household uuid;v_entity text;v_label text;v_module text:=tg_argv[0];v_label_key text:=tg_argv[1];v_action text;
begin
 if tg_op='DELETE' then v_row:=to_jsonb(old); else v_row:=to_jsonb(new); end if;
 v_household:=(v_row->>'household_id')::uuid;
 v_entity:=coalesce(v_row->>'id',v_row->>'rule_key',v_row->>'month');
 v_label:=case when v_label_key is null or v_label_key='' then null else v_row->>v_label_key end;
 v_action:=case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' when 'DELETE' then 'delete' else lower(tg_op) end;
 insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata)
 values(v_household,auth.uid(),v_action,v_module,tg_table_name,v_entity,v_label,jsonb_build_object('source','database'));
 return case when tg_op='DELETE' then old else new end;
end $$;

do $$
declare r record;
begin
 for r in select * from (values
  ('transactions','finance','description'),('budget_allocations','finance',''),('savings_goals','finance','name'),('goal_contributions','finance',''),
  ('finance_accounts','finance','name'),('finance_assets','finance','name'),('finance_transfers','finance','description'),
  ('household_documents','documents','title'),('lists','lists','title'),('list_items','lists','text'),('events','calendar','title'),
  ('maintenance_schedules','maintenance','title'),('maintenance_records','maintenance','notes'),('recipes','meals','name'),
  ('pantry_items','meals','name'),('meal_plan_entries','meals','custom_title'),('household_planning_goals','planning','title'),
  ('planning_milestones','planning','title'),('household_automation_rules','automations','rule_key'),('monthly_household_closures','monthly_close','')
 ) as x(table_name,module,label_key)
 loop
  execute format('drop trigger if exists %I on public.%I','audit_'||r.table_name,r.table_name);
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_household_change(%L,%L)','audit_'||r.table_name,r.table_name,r.module,r.label_key);
 end loop;
end $$;

revoke execute on function public.household_role_for_user(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.default_household_module_access(text,text) from public,anon,authenticated;
revoke execute on function public.household_module_access_for_user(uuid,uuid,text) from public,anon,authenticated;
revoke execute on function public.can_view_household_module(uuid,text) from public,anon;
grant execute on function public.can_view_household_module(uuid,text) to authenticated;
revoke execute on function public.can_edit_household_module(uuid,text) from public,anon;
grant execute on function public.can_edit_household_module(uuid,text) to authenticated;
revoke execute on function public.can_manage_household_members(uuid) from public,anon;
grant execute on function public.can_manage_household_members(uuid) to authenticated;
revoke execute on function public.can_view_household_audit(uuid) from public,anon;
grant execute on function public.can_view_household_audit(uuid) to authenticated;
revoke execute on function public.get_my_household_access(uuid) from public,anon;
grant execute on function public.get_my_household_access(uuid) to authenticated;
revoke execute on function public.get_household_member_access(uuid,uuid) from public,anon;
grant execute on function public.get_household_member_access(uuid,uuid) to authenticated;
revoke execute on function public.set_household_member_access(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.set_household_member_access(uuid,uuid,text,jsonb) to authenticated;
revoke execute on function public.set_household_member_responsibilities(uuid,uuid,text[]) from public,anon;
grant execute on function public.set_household_member_responsibilities(uuid,uuid,text[]) to authenticated;
revoke execute on function public.remove_household_member(uuid,uuid) from public,anon;
grant execute on function public.remove_household_member(uuid,uuid) to authenticated;
revoke execute on function public.notification_module_allowed(uuid,text,text) from public,anon;
grant execute on function public.notification_module_allowed(uuid,text,text) to authenticated;
revoke execute on function public.join_household(text) from public,anon;
grant execute on function public.join_household(text) to authenticated;
