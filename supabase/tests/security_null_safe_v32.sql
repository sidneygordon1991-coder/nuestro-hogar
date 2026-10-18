-- v32: someone who is NOT a member of a household cannot change roles, responsibilities or rotate its invite code;
-- failed join attempts are limited. Synthetic identities; everything is rolled back.
begin;
select set_config('qa.ns.owner',gen_random_uuid()::text,true);
select set_config('qa.ns.guest',gen_random_uuid()::text,true);
select set_config('qa.ns.out',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('qa.ns.'||kind)::uuid,'qa-'||current_setting('qa.ns.'||kind)||'@example.invalid','{"full_name":"Rollback QA"}'::jsonb
from unnest(array['owner','guest','out']) kind;
select set_config('request.jwt.claim.sub',current_setting('qa.ns.owner'),true);
select set_config('qa.ns.hh',public.create_household('QA null-safe v32 rollback')::text,true);
insert into public.household_members(household_id,user_id,role) values(current_setting('qa.ns.hh')::uuid,current_setting('qa.ns.guest')::uuid,'guest');

-- The outsider (not a member) tries every administrative action.
select set_config('request.jwt.claim.sub',current_setting('qa.ns.out'),true);
set local role authenticated;
do $$
declare hh uuid:=current_setting('qa.ns.hh')::uuid;g uuid:=current_setting('qa.ns.guest')::uuid;
begin
 begin perform public.set_household_member_access(hh,g,'admin','{}'::jsonb);raise exception 'Outsider promoted a member';
 exception when raise_exception then if sqlerrm<>'Only household administrators can manage access' then raise; end if;end;
 begin perform public.set_household_member_responsibilities(hh,g,array['finances']);raise exception 'Outsider changed responsibilities';
 exception when raise_exception then if sqlerrm<>'You cannot change these responsibilities' then raise; end if;end;
 begin perform public.rotate_household_invite_code(hh);raise exception 'Outsider rotated the invite code';
 exception when raise_exception then if sqlerrm<>'Only household administrators can rotate invite codes' then raise; end if;end;
end $$;

-- Invite codes are 16 characters; an invalid code returns null and counts as a failed attempt; the 11th is refused.
do $$
declare i int;
begin
 for i in 1..10 loop
  if public.join_household('NO-EXISTE-'||i) is not null then raise exception 'Invalid code joined a household';end if;
 end loop;
 begin perform public.join_household('NO-EXISTE-11');raise exception 'Rate limit not applied';
 exception when raise_exception then if sqlerrm<>'Demasiados intentos. Espera 15 minutos y vuelve a intentarlo.' then raise; end if;end;
end $$;

-- The owner still manages normally.
reset role;
do $$ begin
 if exists(select 1 from public.households where length(invite_code)<16) then raise exception 'Short invite codes remain';end if;
 if (select role from public.household_members where household_id=current_setting('qa.ns.hh')::uuid and user_id=current_setting('qa.ns.guest')::uuid)<>'guest' then raise exception 'Guest role changed';end if;
 if (select count(*) from household_integrity.household_join_attempts where user_id=current_setting('qa.ns.out')::uuid)<>10 then raise exception 'Failed attempts not persisted';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.ns.owner'),true);
set local role authenticated;
do $$
declare hh uuid:=current_setting('qa.ns.hh')::uuid;g uuid:=current_setting('qa.ns.guest')::uuid;code text;
begin
 perform public.set_household_member_access(hh,g,'adult','{}'::jsonb);
 if (select role from public.household_members where household_id=hh and user_id=g)<>'adult' then raise exception 'Owner could not change the role';end if;
 code:=public.rotate_household_invite_code(hh);
 if length(code)<>16 then raise exception 'Rotated code must have 16 characters';end if;
end $$;
reset role;
-- A member can update their own responsibilities, but cannot become administrator.
select set_config('request.jwt.claim.sub',current_setting('qa.ns.guest'),true);
set local role authenticated;
do $$ declare hh uuid:=current_setting('qa.ns.hh')::uuid;u uuid:=current_setting('qa.ns.guest')::uuid;begin
 perform public.set_household_member_responsibilities(hh,u,array['shopping']);
 begin perform public.set_household_member_access(hh,u,'admin','{}');raise exception 'Self promotion succeeded';
 exception when raise_exception then if sqlerrm<>'Only household administrators can manage access' then raise;end if;end;
 begin perform public.join_household('INVALID-FOR-MEMBER');exception when others then raise exception 'Rate limit leaked across users';end;
end $$;
reset role;
-- Authenticated role without a signed-in user, and anonymous callers, cannot execute administration.
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
do $$ begin
 begin perform public.rotate_household_invite_code(current_setting('qa.ns.hh')::uuid);raise exception 'Missing identity accepted';
 exception when raise_exception then if sqlerrm<>'Authentication required' then raise;end if;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.join_household('INVALID');raise exception 'Anonymous join accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
