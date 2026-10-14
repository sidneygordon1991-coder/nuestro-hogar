-- Platform administration is separate from household membership. No master is seeded here.
create schema if not exists platform_security;
revoke all on schema platform_security from public,anon;
grant usage on schema platform_security to authenticated;
create table platform_security.masters (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table platform_security.settings (
 id boolean primary key default true check(id),
 plan_label text not null default 'Free',
 database_limit_bytes bigint not null default 500000000,
 storage_limit_bytes bigint not null default 1000000000,
 storage_used_bytes bigint not null default 0 check(storage_used_bytes>=0)
);
create table platform_security.household_controls (
 household_id uuid primary key references public.households(id) on delete cascade,
 status text not null default 'active' check(status in ('active','archived')),
 quota_bytes bigint not null default 100000000 check(quota_bytes between 1000000 and 1000000000),
 used_bytes bigint not null default 0 check(used_bytes>=0),
 updated_at timestamptz not null default now()
);
create table platform_security.audit (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 household_id uuid references public.households(id) on delete set null,
 action text not null, detail jsonb not null default '{}',created_at timestamptz not null default now()
);
create index platform_audit_created_idx on platform_security.audit(created_at desc);
create index platform_audit_actor_idx on platform_security.audit(actor_id);
create index platform_audit_household_idx on platform_security.audit(household_id);
alter table platform_security.masters enable row level security;
alter table platform_security.settings enable row level security;
alter table platform_security.household_controls enable row level security;
alter table platform_security.audit enable row level security;
revoke all on all tables in schema platform_security from public,anon,authenticated;
insert into platform_security.settings(id,storage_used_bytes)
select true,coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0) from storage.objects;
insert into platform_security.household_controls(household_id,used_bytes)
select h.id,coalesce((select sum(case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end) from storage.objects o where split_part(o.name,'/',1)=h.id::text and o.bucket_id in ('household-documents','finance-receipts')),0) from public.households h;

create function platform_security.is_master() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from platform_security.masters m join auth.users u on u.id=m.user_id where m.user_id=auth.uid() and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now()))
$$;
create function platform_security.require_master() returns void language plpgsql stable security definer set search_path='' as $$
begin if not platform_security.is_master() then raise exception 'Acceso master requerido' using errcode='42501'; end if; end $$;
create function platform_security.household_active(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not exists(select 1 from platform_security.household_controls where household_id=p_id and status='archived')
$$;
-- Preserve existing module logic, adding the archive guard (also used by definer RPCs).
do $$ declare definition text; begin
 select pg_get_functiondef('public.can_edit_household_module(uuid,text)'::regprocedure) into definition;
 definition:=regexp_replace(definition,E'\\mbegin\\M',E'begin\n if not platform_security.household_active(p_household_id) then return false; end if;','i');
 execute definition;
end $$;
create or replace function public.can_manage_household_members(p_household_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select platform_security.household_active(p_household_id) and coalesce(public.household_role_for_user(p_household_id,auth.uid()) in ('owner','admin'),false)
$$;
create function platform_security.seed_household() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into platform_security.household_controls(household_id) values(new.id) on conflict do nothing; return new; end $$;
create trigger platform_seed_household after insert on public.households for each row execute function platform_security.seed_household();
create function platform_security.guard_archived_write() returns trigger language plpgsql security definer set search_path='' as $$
declare old_id uuid;new_id uuid;
begin
 if tg_op<>'INSERT' then old_id:=case when tg_table_name='households' then (to_jsonb(old)->>'id')::uuid else (to_jsonb(old)->>'household_id')::uuid end; end if;
 if tg_op<>'DELETE' then new_id:=case when tg_table_name='households' then (to_jsonb(new)->>'id')::uuid else (to_jsonb(new)->>'household_id')::uuid end; end if;
 if exists(select 1 from platform_security.household_controls where household_id in (old_id,new_id) and status='archived') then raise exception 'Esta familia está archivada. Sus datos son de solo lectura.' using errcode='42501';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
do $$ declare t record;begin
 for t in select distinct table_name from information_schema.columns where table_schema='public' and (column_name='household_id' or table_name='households') loop
 execute format('create trigger platform_guard_archive before insert or update or delete on public.%I for each row execute function platform_security.guard_archived_write()',t.table_name);
 end loop;
end $$;

-- An atomic counter enforces quota on the actual Storage metadata, across both buckets.
-- All uploads acquire the global row before the family row to avoid concurrent overspending.
create function platform_security.account_storage() returns trigger language plpgsql security definer set search_path='' as $$
declare bucket text;path text;hh uuid;old_bytes bigint:=0;new_bytes bigint:=0;delta bigint;tracked boolean;
begin
 if tg_op='DELETE' then bucket:=old.bucket_id;path:=old.name;else bucket:=new.bucket_id;path:=new.name;end if;
 if tg_op='UPDATE' and (old.bucket_id<>new.bucket_id or old.name<>new.name) and (old.bucket_id in ('household-documents','finance-receipts') or new.bucket_id in ('household-documents','finance-receipts')) then raise exception 'No se permite mover archivos entre rutas de familias';end if;
 tracked:=bucket in ('household-documents','finance-receipts');
 if tracked then
  if split_part(path,'/',1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Ruta de familia inválida';end if;
  hh:=split_part(path,'/',1)::uuid;
  if not exists(select 1 from platform_security.household_controls where household_id=hh) then raise exception 'Familia inexistente';end if;
 end if;
 if tg_op<>'INSERT' and old.metadata->>'size' ~ '^[0-9]+$' then old_bytes:=(old.metadata->>'size')::bigint;end if;
 if tg_op<>'DELETE' and new.metadata->>'size' ~ '^[0-9]+$' then new_bytes:=(new.metadata->>'size')::bigint;end if;
 delta:=new_bytes-old_bytes;
 update platform_security.settings set storage_used_bytes=greatest(0,storage_used_bytes+delta) where id and (delta<=0 or storage_used_bytes+delta<=storage_limit_bytes);
 if not found then raise exception 'Se alcanzó el límite global de archivos. Contacta al administrador.' using errcode='P0001';end if;
 if tracked then
  if tg_op<>'DELETE' and exists(select 1 from platform_security.household_controls where household_id=hh and status='archived') then raise exception 'Esta familia está archivada.' using errcode='42501';end if;
  update platform_security.household_controls set used_bytes=greatest(0,used_bytes+delta) where household_id=hh and (delta<=0 or used_bytes+delta<=quota_bytes);
  if not found then raise exception 'Esta familia alcanzó su cuota de archivos. Contacta al administrador.' using errcode='P0001';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger platform_storage_quota before insert or update or delete on storage.objects for each row execute function platform_security.account_storage();

create function platform_security.overview() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform platform_security.require_master();
 select jsonb_build_object('plan',s.plan_label,'database_bytes',pg_database_size(current_database()),'database_limit_bytes',s.database_limit_bytes,'storage_limit_bytes',s.storage_limit_bytes,'storage_bytes',s.storage_used_bytes,
 'households',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'name',h.name,'status',c.status,'quota_bytes',c.quota_bytes,'used_bytes',c.used_bytes,'members',(select count(*) from public.household_members m where m.household_id=h.id),'movements',(select count(*) from public.transactions t where t.household_id=h.id),'files',(select count(*) from storage.objects o where o.bucket_id in ('household-documents','finance-receipts') and split_part(o.name,'/',1)=h.id::text),'created_at',h.created_at) order by h.created_at) from public.households h join platform_security.household_controls c on c.household_id=h.id),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select a.id,a.action,a.detail,a.created_at,h.name household_name,p.full_name actor_name from platform_security.audit a left join public.households h on h.id=a.household_id left join public.profiles p on p.id=a.actor_id order by a.created_at desc,a.id desc limit 50) a),'[]'::jsonb)) into result from platform_security.settings s where s.id;
 return result;
end $$;
create function platform_security.members(p_household_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform platform_security.require_master();
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',p.full_name,'email',u.email,'role',m.role) order by m.role,p.full_name) from public.household_members m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id where m.household_id=p_household_id),'[]'::jsonb);
end $$;
create function platform_security.configure_household(p_household_id uuid,p_quota_bytes bigint,p_status text,p_confirmation text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare h public.households;previous platform_security.household_controls;max_bytes bigint;
begin
 perform platform_security.require_master();
 select * into h from public.households where id=p_household_id for update;
 if not found then raise exception 'Familia inexistente';end if;
 if p_confirmation is distinct from h.name then raise exception 'Escribe el nombre exacto de la familia para confirmar';end if;
 if p_reason is null or length(trim(p_reason))<5 or length(p_reason)>500 then raise exception 'Indica un motivo de 5 a 500 caracteres';end if;
 select storage_limit_bytes into max_bytes from platform_security.settings where id;
 if p_quota_bytes is null or p_quota_bytes<1000000 or p_quota_bytes>max_bytes then raise exception 'Cuota fuera del límite permitido';end if;
 if p_status is null or p_status not in ('active','archived') then raise exception 'Estado inválido';end if;
 select * into previous from platform_security.household_controls where household_id=h.id for update;
 if p_quota_bytes<previous.used_bytes then raise exception 'La cuota no puede ser menor que los archivos ya almacenados';end if;
 update platform_security.household_controls set quota_bytes=p_quota_bytes,status=p_status,updated_at=now() where household_id=h.id;
 insert into platform_security.audit(actor_id,household_id,action,detail) values(auth.uid(),h.id,'family_configured',jsonb_build_object('previous_status',previous.status,'status',p_status,'previous_quota_bytes',previous.quota_bytes,'quota_bytes',p_quota_bytes,'reason',trim(p_reason)));
end $$;
create function platform_security.manage_member(p_household_id uuid,p_user_id uuid,p_role text,p_confirmation text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare h public.households;previous_role text;
begin
 perform platform_security.require_master();
 select * into h from public.households where id=p_household_id for update;
 if not found then raise exception 'Familia inexistente';end if;
 if p_confirmation is distinct from h.name then raise exception 'Nombre de familia incorrecto';end if;
 if p_reason is null or length(trim(p_reason))<5 or length(p_reason)>500 then raise exception 'Indica un motivo de 5 a 500 caracteres';end if;
 select role into previous_role from public.household_members where household_id=h.id and user_id=p_user_id for update;
 if not found then raise exception 'Miembro inexistente';end if;
 if previous_role='owner' or p_user_id=auth.uid() or exists(select 1 from platform_security.masters where user_id=p_user_id) then raise exception 'El propietario y las cuentas master están protegidos';end if;
 if p_role is null or p_role not in ('admin','adult','teen','guest','remove') then raise exception 'Rol inválido';end if;
 if p_role='remove' then delete from public.household_members where household_id=h.id and user_id=p_user_id;
 else update public.household_members set role=p_role where household_id=h.id and user_id=p_user_id;end if;
 insert into platform_security.audit(actor_id,household_id,action,detail) values(auth.uid(),h.id,'member_managed',jsonb_build_object('user_id',p_user_id,'previous_role',previous_role,'role',p_role,'reason',trim(p_reason)));
end $$;
create function platform_security.household_storage(p_household_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_household_member(p_household_id) then raise exception 'No perteneces a esta familia' using errcode='42501';end if;
 return (select jsonb_build_object('status',status,'used_bytes',used_bytes,'quota_bytes',quota_bytes) from platform_security.household_controls where household_id=p_household_id);
end $$;

-- Exposed RPCs are invokers; privileged implementations live in an unexposed schema.
create function public.get_my_platform_access() returns boolean language sql stable security invoker set search_path='' as $$ select platform_security.is_master() $$;
create function public.get_platform_overview() returns jsonb language sql security invoker set search_path='' as $$ select platform_security.overview() $$;
create function public.get_platform_members(p_household_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select platform_security.members(p_household_id) $$;
create function public.configure_platform_household(p_household_id uuid,p_quota_bytes bigint,p_status text,p_confirmation text,p_reason text) returns void language sql security invoker set search_path='' as $$ select platform_security.configure_household(p_household_id,p_quota_bytes,p_status,p_confirmation,p_reason) $$;
create function public.manage_platform_member(p_household_id uuid,p_user_id uuid,p_role text,p_confirmation text,p_reason text) returns void language sql security invoker set search_path='' as $$ select platform_security.manage_member(p_household_id,p_user_id,p_role,p_confirmation,p_reason) $$;
create function public.get_my_household_storage(p_household_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select platform_security.household_storage(p_household_id) $$;
revoke all on all functions in schema platform_security from public,anon,authenticated;
grant execute on function platform_security.is_master(),platform_security.household_active(uuid),platform_security.overview(),platform_security.members(uuid),platform_security.configure_household(uuid,bigint,text,text,text),platform_security.manage_member(uuid,uuid,text,text,text),platform_security.household_storage(uuid) to authenticated;
revoke all on function public.get_my_platform_access(),public.get_platform_overview(),public.get_platform_members(uuid),public.configure_platform_household(uuid,bigint,text,text,text),public.manage_platform_member(uuid,uuid,text,text,text),public.get_my_household_storage(uuid) from public,anon;
grant execute on function public.get_my_platform_access(),public.get_platform_overview(),public.get_platform_members(uuid),public.configure_platform_household(uuid,bigint,text,text,text),public.manage_platform_member(uuid,uuid,text,text,text),public.get_my_household_storage(uuid) to authenticated;
