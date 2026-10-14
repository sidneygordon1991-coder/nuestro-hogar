-- Explicit deny policies document that internal tables are reachable only through checked RPCs.
create policy internal_rpc_only on platform_security.masters as restrictive for all to public using(false) with check(false);
create policy internal_rpc_only on platform_security.settings as restrictive for all to public using(false) with check(false);
create policy internal_rpc_only on platform_security.household_controls as restrictive for all to public using(false) with check(false);
create policy internal_rpc_only on platform_security.audit as restrictive for all to public using(false) with check(false);

-- Serialize allocations on the same global row used by the Storage counter.
-- This order (global -> household -> control) also prevents deadlocks with uploads.
do $$ declare definition text;begin
 select pg_get_functiondef('platform_security.configure_household(uuid,bigint,text,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'perform platform_security.require_master();','perform platform_security.require_master(); perform 1 from platform_security.settings where id for update;');
 definition:=replace(definition,'update platform_security.household_controls set quota_bytes=',
 'if (select coalesce(sum(quota_bytes),0) from platform_security.household_controls where household_id<>h.id)+p_quota_bytes>max_bytes then raise exception ''Las cuotas asignadas superarían el espacio global. Reduce otra cuota antes de ampliar esta.'';end if; update platform_security.household_controls set quota_bytes=');
 execute definition;
 select pg_get_functiondef('platform_security.configure_resources(uuid,bigint,integer,text,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'perform platform_security.require_master();','perform platform_security.require_master(); perform 1 from platform_security.settings where id for update;');
 execute definition;
 select pg_get_functiondef('platform_security.overview()'::regprocedure) into definition;
 definition:=replace(definition,'''storage_bytes'',s.storage_used_bytes,','''storage_bytes'',s.storage_used_bytes,''allocated_bytes'',(select coalesce(sum(quota_bytes),0) from platform_security.household_controls),');
 execute definition;
end $$;
create or replace function platform_security.seed_household() returns trigger language plpgsql security definer set search_path='' as $$
declare max_bytes bigint;
begin
 select storage_limit_bytes into max_bytes from platform_security.settings where id for update;
 if (select coalesce(sum(quota_bytes),0) from platform_security.household_controls)+100000000>max_bytes then raise exception 'No hay espacio asignable para una nueva familia. Contacta al master.';end if;
 insert into platform_security.household_controls(household_id) values(new.id) on conflict do nothing;
 return new;
end $$;
