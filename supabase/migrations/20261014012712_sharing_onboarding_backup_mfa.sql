-- Guided setup never records an actual payment, expense, split or contribution.
create schema if not exists sharing_security;
revoke all on schema sharing_security from public,anon;
grant usage on schema sharing_security to authenticated;
create table public.household_setup_state (
 household_id uuid primary key references public.households(id) on delete cascade,
 completed_at timestamptz,completed_by uuid references auth.users(id) on delete set null,
 last_submission_id uuid,created_at timestamptz not null default now()
);
alter table public.household_setup_state enable row level security;
revoke all on public.household_setup_state from public,anon,authenticated;
grant select on public.household_setup_state to authenticated;
create policy setup_view on public.household_setup_state for select to authenticated using(public.can_manage_household_members(household_id));
-- Existing families are not forced through setup or given new financial defaults.
insert into public.household_setup_state(household_id,completed_at) select id,now() from public.households;
create function sharing_security.seed_setup() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.household_setup_state(household_id) values(new.id);return new;end $$;
create trigger sharing_seed_setup after insert on public.households for each row execute function sharing_security.seed_setup();
create trigger platform_guard_archive before insert or update or delete on public.household_setup_state for each row execute function platform_security.guard_archived_write();
create function sharing_security.save_setup(p_household_id uuid,p_submission_id uuid,p_month date,p_split_method text,p_incomes jsonb,p_budgets jsonb) returns void language plpgsql security definer set search_path='' as $$
declare state public.household_setup_state;item jsonb;uid uuid;amount numeric;cat uuid;label text;grp text;
begin
 if auth.uid() is null or not public.can_manage_household_members(p_household_id) or not public.can_edit_household_module(p_household_id,'finance') then raise exception 'Solo un administrador activo puede configurar el hogar' using errcode='42501';end if;
 perform 1 from public.households where id=p_household_id for update;
 select * into state from public.household_setup_state where household_id=p_household_id for update;
 if not found then raise exception 'Configuración no encontrada';end if;
 if p_submission_id is null then raise exception 'Identificador de configuración requerido';end if;
 if state.last_submission_id=p_submission_id then return;end if;
 if p_month is null or extract(day from p_month)<>1 then raise exception 'Mes inválido';end if;
 if p_split_method is null or p_split_method not in ('equal','income','custom') then raise exception 'Método de aportes inválido';end if;
 if jsonb_typeof(p_incomes) is distinct from 'array' or jsonb_array_length(p_incomes)>50 or jsonb_typeof(p_budgets) is distinct from 'array' or jsonb_array_length(p_budgets)>100 then raise exception 'Datos de configuración inválidos';end if;
 for item in select value from jsonb_array_elements(p_incomes) loop
  uid:=(item->>'user_id')::uuid;amount:=(item->>'monthly_income')::numeric;
  if amount is null or amount<0 or amount>999999999.99 or not exists(select 1 from public.household_members where household_id=p_household_id and user_id=uid) then raise exception 'Ingreso o integrante inválido';end if;
  insert into public.finance_member_settings(household_id,user_id,monthly_income) values(p_household_id,uid,round(amount,2)) on conflict(household_id,user_id) do update set monthly_income=excluded.monthly_income,updated_at=now();
 end loop;
 if p_split_method='income' and coalesce((select sum(monthly_income) from public.finance_member_settings where household_id=p_household_id),0)<=0 then raise exception 'Ingresa al menos un ingreso para el reparto proporcional';end if;
 if p_split_method='custom' and abs(coalesce((select sum(custom_share_percent) from public.finance_member_settings where household_id=p_household_id),0)-100)>.01 then raise exception 'Los porcentajes personalizados deben configurarse en Finanzas y sumar 100%%';end if;
 insert into public.finance_household_settings(household_id,split_method,updated_by) values(p_household_id,p_split_method,auth.uid()) on conflict(household_id) do update set split_method=excluded.split_method,updated_by=auth.uid(),updated_at=now();
 for item in select value from jsonb_array_elements(p_budgets) loop
  amount:=(item->>'planned_amount')::numeric;
  if amount is null or amount<0 or amount>999999999.99 then raise exception 'Presupuesto inválido';end if;
  cat:=nullif(item->>'id','')::uuid;
  if cat is not null then
   if not exists(select 1 from public.budget_categories where id=cat and household_id=p_household_id) then raise exception 'Categoría de otro hogar' using errcode='42501';end if;
  else
   label:=trim(item->>'name');grp:=item->>'budget_group';
   if label is null or length(label) not between 1 and 80 or grp is null or grp not in ('fixed','variable','saving') then raise exception 'Categoría inválida';end if;
   select id into cat from public.budget_categories where household_id=p_household_id and name=label order by created_at limit 1;
   if cat is null then insert into public.budget_categories(household_id,name,budget_group) values(p_household_id,label,grp) returning id into cat;end if;
  end if;
  insert into public.budget_allocations(household_id,category_id,month,planned_amount) values(p_household_id,cat,p_month,round(amount,2)) on conflict(household_id,category_id,month) do update set planned_amount=excluded.planned_amount;
 end loop;
 update public.household_setup_state set completed_at=now(),completed_by=auth.uid(),last_submission_id=p_submission_id where household_id=p_household_id;
 insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata) values(p_household_id,auth.uid(),'update','finance','household_setup',p_household_id::text,'Configuración guiada',jsonb_build_object('month',p_month,'split_method',p_split_method));
end $$;
create function public.save_household_setup(p_household_id uuid,p_submission_id uuid,p_month date,p_split_method text,p_incomes jsonb,p_budgets jsonb) returns void language sql security invoker set search_path='' as $$ select sharing_security.save_setup(p_household_id,p_submission_id,p_month,p_split_method,p_incomes,p_budgets) $$;
revoke all on function sharing_security.seed_setup(),sharing_security.save_setup(uuid,uuid,date,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function sharing_security.save_setup(uuid,uuid,date,text,jsonb,jsonb) to authenticated;
revoke all on function public.save_household_setup(uuid,uuid,date,text,jsonb,jsonb) from public,anon;
grant execute on function public.save_household_setup(uuid,uuid,date,text,jsonb,jsonb) to authenticated;

-- Extend metadata backups with current receipts. Keep private documents isolated.
do $$ declare def text;begin
 select pg_get_functiondef('public.household_backup_rows(uuid,text)'::regprocedure) into def;
 def:=replace(def,'''budget_allocations'',''budget_categories''','''finance_receipts'',''budget_allocations'',''budget_categories''');
 def:=replace(def,'if p_table=''household_documents'' then',E'if p_table=''finance_receipts'' then\n select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) into v_result from public.finance_receipts r join public.transactions t on t.id=r.transaction_id and t.household_id=r.household_id where r.household_id=p_household_id;\n elsif p_table=''household_documents'' then');
 execute def;
 select pg_get_functiondef('public.build_household_backup_snapshot(uuid)'::regprocedure) into def;
 def:=replace(def,'''transactions'',public.household_backup_rows(p_household_id,''transactions''),','''transactions'',public.household_backup_rows(p_household_id,''transactions''),''finance_receipts'',public.household_backup_rows(p_household_id,''finance_receipts''),');
 execute def;
 select pg_get_functiondef('public.restore_backup_table_missing(uuid,text,jsonb)'::regprocedure) into def;
 def:=replace(def,'''budget_allocations'',''budget_categories''','''finance_receipts'',''budget_allocations'',''budget_categories''');
 def:=replace(def,'  execute format(',E'  if p_table=''finance_receipts'' and exists(select 1 from jsonb_array_elements(p_rows) r where not exists(select 1 from public.transactions t where t.id=(r->>''transaction_id'')::uuid and t.household_id=p_household_id)) then raise exception ''Comprobante de otro hogar o movimiento inexistente'';end if;\n if p_table=''household_documents'' and exists(select 1 from jsonb_array_elements(p_rows) d where d->>''access_scope''=''private'' and d->>''owner_user_id'' is distinct from auth.uid()::text) then raise exception ''No se pueden restaurar documentos privados de otra persona'';end if;\n  execute format(');
 execute def;
 select pg_get_functiondef('public.restore_household_backup_missing(uuid)'::regprocedure) into def;
 def:=replace(def,'''transaction_splits'',''list_items''','''finance_receipts'',''transaction_splits'',''list_items''');
 execute def;
end $$;
-- An invoker starts the existing checked snapshot, then adds only the caller's accessible private files.
create function public.build_household_file_backup(p_household_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare snap jsonb;docs jsonb;
begin
 snap:=public.build_household_backup_snapshot(p_household_id);
 if not public.can_edit_household_module(p_household_id,'backups') then raise exception 'Solo un administrador puede respaldar archivos' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) into docs from public.household_documents d where d.household_id=p_household_id;
 snap:=jsonb_set(snap,'{tables,household_documents}',docs);
 return snap;
end $$;
revoke all on function public.build_household_file_backup(uuid) from public,anon;
grant execute on function public.build_household_file_backup(uuid) to authenticated;
-- Reuse the metadata backup when the same ZIP is retried.
do $$ declare def text;begin
 select pg_get_functiondef('public.import_household_backup(uuid,jsonb,text)'::regprocedure) into def;
 def:=replace(def,'v_source_household uuid;','v_source_household uuid;v_existing uuid;');
 def:=replace(def,'  select coalesce(jsonb_object_agg',E'  if nullif(p_snapshot->''notes''->>''archive_id'','''') is not null then\n perform 1 from public.households where id=p_household_id for update;\n select id into v_existing from public.household_backups where household_id=p_household_id and snapshot->''notes''->>''archive_id''=p_snapshot->''notes''->>''archive_id'' order by created_at limit 1;\n if v_existing is not null then\n if (select snapshot->''tables'' from public.household_backups where id=v_existing) is distinct from p_snapshot->''tables'' then raise exception ''El mismo identificador de archivo contiene datos diferentes'';end if;\n return v_existing;end if;end if;\n  select coalesce(jsonb_object_agg');
 execute def;
end $$;
create index household_setup_completed_by_idx on public.household_setup_state(completed_by);
