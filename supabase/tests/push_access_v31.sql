-- Web push only reaches members who can view the notification's module; finance alerts run in the
-- hourly automation. Synthetic identities; everything is rolled back.
begin;
select set_config('qa.pa.owner',gen_random_uuid()::text,true);
select set_config('qa.pa.teen',gen_random_uuid()::text,true);
select set_config('qa.pa.out',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('qa.pa.'||kind)::uuid,'qa-'||current_setting('qa.pa.'||kind)||'@example.invalid','{"full_name":"Rollback QA"}'::jsonb
from unnest(array['owner','teen','out']) kind;
select set_config('request.jwt.claim.sub',current_setting('qa.pa.owner'),true);
select set_config('qa.pa.hh',public.create_household('QA push v31 rollback')::text,true);
insert into public.household_members(household_id,user_id,role) values(current_setting('qa.pa.hh')::uuid,current_setting('qa.pa.teen')::uuid,'teen');
do $$
declare hh uuid:=current_setting('qa.pa.hh')::uuid;o uuid:=current_setting('qa.pa.owner')::uuid;t uuid:=current_setting('qa.pa.teen')::uuid;x uuid:=current_setting('qa.pa.out')::uuid;
begin
 if not public.notification_push_allowed(hh,o,'presupuesto:budget') then raise exception 'Owner should get finance pushes';end if;
 if public.notification_push_allowed(hh,t,'presupuesto:budget') then raise exception 'Teen without finance access must not get finance pushes';end if;
 if public.notification_push_allowed(hh,t,'presupuesto') then raise exception 'Bare finance tab must be filtered too';end if;
 if not public.notification_push_allowed(hh,t,'inicio') then raise exception 'Generic notifications reach every member';end if;
 if public.notification_push_allowed(hh,x,'inicio') then raise exception 'Non-members never get pushes';end if;
 insert into public.household_member_access(household_id,user_id,module,access_level) values(hh,t,'finance','view');
 if not public.notification_push_allowed(hh,t,'presupuesto:accounts') then raise exception 'Viewer should get finance pushes';end if;
 if position('refresh_all_finance_alerts' in pg_get_functiondef('public.run_household_automation()'::regprocedure))=0 then raise exception 'Hourly automation must refresh finance alerts';end if;
 perform public.refresh_all_finance_alerts();
end $$;
set local role authenticated;
do $$
begin
 begin perform public.notification_push_allowed(current_setting('qa.pa.hh')::uuid,current_setting('qa.pa.owner')::uuid,'inicio');raise exception 'Clients must not call notification_push_allowed';
 exception when insufficient_privilege then null;end;
 begin perform public.refresh_all_finance_alerts();raise exception 'Clients must not call refresh_all_finance_alerts';
 exception when insufficient_privilege then null;end;
end $$;
rollback;
