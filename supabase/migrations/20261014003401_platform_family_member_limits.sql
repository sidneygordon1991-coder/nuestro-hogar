alter table platform_security.household_controls add column member_limit integer not null default 10 check(member_limit between 1 and 50);
alter table platform_security.household_controls add column member_count integer not null default 0 check(member_count>=0);
update platform_security.household_controls c set member_count=(select count(*) from public.household_members m where m.household_id=c.household_id);
update platform_security.household_controls set member_limit=least(50,greatest(10,member_count));
create function platform_security.account_members() returns trigger language plpgsql security definer set search_path='' as $$
declare hh uuid;delta integer;
begin
 if tg_op='UPDATE' then
  if old.household_id<>new.household_id or old.user_id<>new.user_id then raise exception 'No se permite mover membresías entre familias';end if;
  return new;
 end if;
 if tg_op='DELETE' then hh:=old.household_id;delta:=-1;else hh:=new.household_id;delta:=1;end if;
 update platform_security.household_controls set member_count=greatest(0,member_count+delta) where household_id=hh and (delta<0 or member_count+delta<=member_limit);
 if not found and tg_op='INSERT' then raise exception 'Esta familia alcanzó su máximo de miembros. Contacta al master para ampliarlo.';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger platform_member_quota before insert or update or delete on public.household_members for each row execute function platform_security.account_members();
-- New controls automatically receive defaults through seed_household.
create function platform_security.configure_resources(p_household_id uuid,p_quota_bytes bigint,p_member_limit integer,p_status text,p_confirmation text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare previous_limit integer;member_total integer;
begin
 perform platform_security.require_master();
 -- Same lock order as configure_household and existing membership operations.
 perform 1 from public.households where id=p_household_id for update;
 select member_limit,member_count into previous_limit,member_total from platform_security.household_controls where household_id=p_household_id for update;
 if not found then raise exception 'Familia inexistente';end if;
 if p_member_limit is null or p_member_limit<1 or p_member_limit>50 or p_member_limit<member_total then raise exception 'El máximo debe incluir a los miembros actuales y estar entre 1 y 50';end if;
 perform platform_security.configure_household(p_household_id,p_quota_bytes,p_status,p_confirmation,p_reason);
 update platform_security.household_controls set member_limit=p_member_limit where household_id=p_household_id;
 update platform_security.audit set detail=detail||jsonb_build_object('previous_member_limit',previous_limit,'member_limit',p_member_limit) where id=(select max(id) from platform_security.audit where household_id=p_household_id and actor_id=auth.uid() and action='family_configured');
end $$;
create function public.configure_platform_resources(p_household_id uuid,p_quota_bytes bigint,p_member_limit integer,p_status text,p_confirmation text,p_reason text) returns void language sql security invoker set search_path='' as $$
 select platform_security.configure_resources(p_household_id,p_quota_bytes,p_member_limit,p_status,p_confirmation,p_reason)
$$;
-- Keep the protected overview and add the new per-family resource limit.
do $$ declare definition text;begin
 select pg_get_functiondef('platform_security.overview()'::regprocedure) into definition;
 definition:=replace(definition,'''members'',','''member_limit'',c.member_limit,''members'',');
 execute definition;
end $$;
revoke all on function platform_security.account_members(),platform_security.configure_resources(uuid,bigint,integer,text,text,text) from public,anon,authenticated;
grant execute on function platform_security.configure_resources(uuid,bigint,integer,text,text,text) to authenticated;
revoke all on function public.configure_platform_resources(uuid,bigint,integer,text,text,text) from public,anon;
grant execute on function public.configure_platform_resources(uuid,bigint,integer,text,text,text) to authenticated;
