-- Strengthen household invite codes for new households and future rotations.
-- Existing codes remain valid until an owner/admin rotates them.

alter table public.households
  alter column invite_code set default upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text),1,16));

create or replace function public.rotate_household_invite_code(p_household_id uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_role:=public.household_role_for_user(p_household_id,auth.uid());
  if v_role not in ('owner','admin') then raise exception 'Only household administrators can rotate invite codes'; end if;

  loop
    v_code:=upper(substr(md5(gen_random_uuid()::text||clock_timestamp()::text),1,16));
    exit when not exists(select 1 from public.households where invite_code=v_code);
  end loop;

  update public.households
  set invite_code=v_code,updated_at=now()
  where id=p_household_id;

  if not found then raise exception 'Household not found'; end if;

  insert into public.household_audit_log(
    household_id,actor_user_id,action,module,entity_type,entity_id,label,metadata
  ) values(
    p_household_id,auth.uid(),'access_change','family','household',p_household_id::text,
    'Código de invitación renovado',jsonb_build_object('kind','invite_code_rotation')
  );

  return v_code;
end;
$$;

revoke execute on function public.rotate_household_invite_code(uuid) from public,anon;
grant execute on function public.rotate_household_invite_code(uuid) to authenticated;
