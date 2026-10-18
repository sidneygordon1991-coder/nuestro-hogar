-- v32 · Seguridad: guardas de administración seguras ante NULL, códigos de invitación fuertes,
-- límite de intentos al unirse y MFA obligatorio para masters.
--
-- Problema corregido: `if v_actor_role not in ('owner','admin') then raise ...` no se ejecuta cuando el
-- usuario NO pertenece al hogar (household_role_for_user devuelve NULL y `NULL not in (...)` es NULL).
-- Una cuenta externa que conociera el id del hogar podía cambiar roles o renovar y leer el código de invitación.
-- Esta migración es idempotente (create or replace / if not exists) y no borra datos.

-- 1. Cambiar rol y permisos de un integrante: solo owner/admin del mismo hogar.
create or replace function public.set_household_member_access(p_household_id uuid,p_user_id uuid,p_role text,p_overrides jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor_role text;v_target_role text;v_key text;v_value text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 v_actor_role:=public.household_role_for_user(p_household_id,auth.uid());
 v_target_role:=public.household_role_for_user(p_household_id,p_user_id);
 if coalesce(v_actor_role,'') not in ('owner','admin') then raise exception 'Only household administrators can manage access'; end if;
 if v_target_role is null then raise exception 'Member not found'; end if;
 if v_target_role='owner' then raise exception 'The household owner cannot be modified'; end if;
 if coalesce(p_role,'') not in ('admin','adult','teen','guest') then raise exception 'Invalid role'; end if;
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
revoke execute on function public.set_household_member_access(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.set_household_member_access(uuid,uuid,text,jsonb) to authenticated;

-- 2. Responsabilidades: owner/admin del hogar, o el propio integrante sobre sí mismo.
create or replace function public.set_household_member_responsibilities(p_household_id uuid,p_user_id uuid,p_responsibilities text[])
returns void language plpgsql security definer set search_path='' as $$
declare v_actor_role text;v_target_role text;v_clean text[];
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 v_actor_role:=public.household_role_for_user(p_household_id,auth.uid());
 v_target_role:=public.household_role_for_user(p_household_id,p_user_id);
 if v_actor_role is null then raise exception 'You cannot change these responsibilities'; end if;
 if v_actor_role not in ('owner','admin') and auth.uid() is distinct from p_user_id then raise exception 'You cannot change these responsibilities'; end if;
 if v_target_role is null then raise exception 'Member not found'; end if;
 select coalesce(array_agg(distinct x),'{}'::text[]) into v_clean
 from unnest(coalesce(p_responsibilities,'{}'::text[])) x
 where x in ('finances','shopping','calendar','documents','meals','maintenance','planning','home');
 update public.household_members set responsibilities=v_clean where household_id=p_household_id and user_id=p_user_id;
 insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata)
 values(p_household_id,auth.uid(),'access_change','family','household_member',p_user_id::text,null,jsonb_build_object('kind','responsibilities','responsibilities',to_jsonb(v_clean)));
end $$;
revoke execute on function public.set_household_member_responsibilities(uuid,uuid,text[]) from public,anon;
grant execute on function public.set_household_member_responsibilities(uuid,uuid,text[]) to authenticated;

-- 3. Renovar el código de invitación: solo owner/admin; 16 caracteres (64 bits).
create or replace function public.rotate_household_invite_code(p_household_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_role text;v_code text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 v_role:=public.household_role_for_user(p_household_id,auth.uid());
 if coalesce(v_role,'') not in ('owner','admin') then raise exception 'Only household administrators can rotate invite codes'; end if;
 loop
  v_code:=upper(substr(md5(gen_random_uuid()::text||clock_timestamp()::text),1,16));
  exit when not exists(select 1 from public.households where invite_code=v_code);
 end loop;
 update public.households set invite_code=v_code,updated_at=now() where id=p_household_id;
 if not found then raise exception 'Household not found'; end if;
 insert into public.household_audit_log(household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata)
 values(p_household_id,auth.uid(),'access_change','family','household',p_household_id::text,'Código de invitación renovado',jsonb_build_object('kind','invite_code_rotation'));
 return v_code;
end $$;
revoke execute on function public.rotate_household_invite_code(uuid) from public,anon;
grant execute on function public.rotate_household_invite_code(uuid) to authenticated;

-- 4. Códigos cortos heredados (8 caracteres): se reemplazan por códigos de 16.
--    Las invitaciones ya enviadas con el código anterior dejan de funcionar; el owner comparte el nuevo desde Familia.
alter table public.households alter column invite_code set default upper(substr(md5(gen_random_uuid()::text||clock_timestamp()::text),1,16));
update public.households set invite_code=upper(substr(md5(gen_random_uuid()::text||id::text||clock_timestamp()::text),1,16)) where length(coalesce(invite_code,''))<16;

-- 5. Unirse a un hogar con límite de intentos fallidos (10 por usuario cada 15 minutos).
--    Un código inválido devuelve NULL (sin excepción) para que el intento quede registrado; la app muestra el aviso.
create table if not exists household_integrity.household_join_attempts(
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 attempted_at timestamptz not null default now()
);
create index if not exists household_join_attempts_user_time on household_integrity.household_join_attempts(user_id,attempted_at desc);
alter table household_integrity.household_join_attempts enable row level security;
revoke all on household_integrity.household_join_attempts from public,anon,authenticated;

create or replace function public.join_household(p_invite_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_failed int;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 -- Serialize attempts per account so parallel requests cannot bypass the limit.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,32));
 select count(*) into v_failed from household_integrity.household_join_attempts where user_id=auth.uid() and attempted_at>now()-interval '15 minutes';
 if v_failed>=10 then raise exception 'Demasiados intentos. Espera 15 minutos y vuelve a intentarlo.' using errcode='P0001'; end if;
 select h.id into v_id from public.households h where h.invite_code=upper(trim(coalesce(p_invite_code,'')));
 if v_id is null then
  insert into household_integrity.household_join_attempts(user_id) values(auth.uid());
  delete from household_integrity.household_join_attempts where attempted_at<now()-interval '1 day';
  return null;
 end if;
 insert into public.household_members(household_id,user_id,role) values(v_id,auth.uid(),'guest')
 on conflict(household_id,user_id) do nothing;
 return v_id;
end $$;
revoke execute on function public.join_household(text) from public,anon;
grant execute on function public.join_household(text) to authenticated;

-- 6. MFA obligatorio para todo master (los creados antes de 20261014013518 quedaron con false).
--    El master debe tener un autenticador inscrito; MasterSecurityGate guía la inscripción.
update platform_security.masters set mfa_required=true where mfa_required is distinct from true;

-- 7. Índices usados por RLS y por las lecturas del Inicio (solo si la columna existe).
do $$
declare r record;
begin
 for r in select * from (values
  ('savings_goals','household_id'),('goal_contributions','household_id'),('goal_contributions','goal_id'),
  ('recurring_transactions','household_id'),('transaction_splits','household_id'),('transaction_splits','transaction_id')) v(t,c)
 loop
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.t and column_name=r.c)
   and not exists(
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class t on t.oid=i.indrelid
    join pg_catalog.pg_namespace n on n.oid=t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum=i.indkey[0]
    where n.nspname='public' and t.relname=r.t and a.attname=r.c and i.indisvalid and i.indpred is null
   ) then
   execute format('create index if not exists %I on public.%I(%I)',r.t||'_'||r.c||'_idx',r.t,r.c);
  end if;
 end loop;
end $$;
