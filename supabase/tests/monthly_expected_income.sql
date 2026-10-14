-- Monthly income integration checks. Run each BEGIN / ROLLBACK block separately.
-- Requires two existing household owners; all test fixtures are rolled back.

begin;
select set_config('qa.income.hh',(select household_id::text from public.household_members where role='owner' order by joined_at limit 1),true);
select set_config('qa.income.owner',(select user_id::text from public.household_members where household_id=current_setting('qa.income.hh')::uuid and role='owner' limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('qa.income.owner'),true);
set local role authenticated;
do $$begin
 begin insert into public.finance_income_plans values(current_setting('qa.income.hh')::uuid,'2099-01-01',auth.uid(),-1,now(),now());raise exception 'negative accepted';exception when check_violation then null;end;
 begin insert into public.finance_income_plans values(current_setting('qa.income.hh')::uuid,'2099-01-01',auth.uid(),'NaN'::numeric,now(),now());raise exception 'NaN accepted';exception when check_violation then null;end;
 begin insert into public.finance_income_plans values(current_setting('qa.income.hh')::uuid,'2099-01-02',auth.uid(),1,now(),now());raise exception 'invalid month accepted';exception when check_violation then null;end;
 begin insert into public.finance_income_plans values(current_setting('qa.income.hh')::uuid,'infinity'::date,auth.uid(),1,now(),now());raise exception 'infinite date accepted';exception when check_violation then null;end;
end$$;
select true as invalid_values_rejected;
rollback;

begin;
select set_config('qa.income.hh',(select household_id::text from public.household_members where role='owner' order by joined_at limit 1),true);
select set_config('qa.income.owner',(select user_id::text from public.household_members where household_id=current_setting('qa.income.hh')::uuid and role='owner' limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('qa.income.owner'),true);
set local role authenticated;
select set_config('qa.income.snapshot',jsonb_set(public.build_household_backup_snapshot(current_setting('qa.income.hh')::uuid),'{tables,finance_income_plans}',jsonb_build_array(jsonb_build_object('household_id',current_setting('qa.income.hh'),'month','2099-01-01','user_id',auth.uid(),'expected_amount',200.25,'created_at',now(),'updated_at',now())))::text,true);
select set_config('qa.income.backup',public.import_household_backup(current_setting('qa.income.hh')::uuid,current_setting('qa.income.snapshot')::jsonb,'QA monthly income rollback')::text,true);
select public.restore_household_backup_missing(current_setting('qa.income.backup')::uuid);
select public.restore_household_backup_missing(current_setting('qa.income.backup')::uuid);
select count(*)=1 and sum(expected_amount)=200.25 as restore_is_idempotent from public.finance_income_plans where household_id=current_setting('qa.income.hh')::uuid and month='2099-01-01';
rollback;

begin;
select set_config('qa.income.a',(select user_id::text from public.household_members where role='owner' order by joined_at limit 1),true);
select set_config('qa.income.b',(select user_id::text from public.household_members where role='owner' and user_id<>current_setting('qa.income.a')::uuid order by joined_at limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('qa.income.a'),true);
select set_config('qa.income.hh',public.create_household('QA income permissions rollback')::text,true);
insert into public.household_members(household_id,user_id,role) values(current_setting('qa.income.hh')::uuid,current_setting('qa.income.b')::uuid,'guest');
insert into public.household_member_access(household_id,user_id,module,access_level) values(current_setting('qa.income.hh')::uuid,current_setting('qa.income.b')::uuid,'finance','view');
set local role authenticated;
insert into public.finance_income_plans(household_id,month,user_id,expected_amount) values(current_setting('qa.income.hh')::uuid,'2099-01-01',auth.uid(),123.45);
select set_config('request.jwt.claim.sub',current_setting('qa.income.b'),true);
do $$begin
 if not public.can_view_household_module(current_setting('qa.income.hh')::uuid,'finance') or public.can_edit_household_module(current_setting('qa.income.hh')::uuid,'finance') then raise exception 'View-only fixture invalid';end if;
 begin insert into public.finance_income_plans values(current_setting('qa.income.hh')::uuid,'2099-01-01',auth.uid(),1,now(),now());raise exception 'Read-only insert accepted';exception when insufficient_privilege then null;end;
end$$;
update public.finance_income_plans set expected_amount=99 where household_id=current_setting('qa.income.hh')::uuid;
do $$begin if not exists(select 1 from public.finance_income_plans where household_id=current_setting('qa.income.hh')::uuid and expected_amount=123.45) then raise exception 'Read-only update accepted';end if;end$$;
reset role;
update platform_security.household_controls set status='archived' where household_id=current_setting('qa.income.hh')::uuid;
select set_config('request.jwt.claim.sub',current_setting('qa.income.a'),true);
set local role authenticated;
update public.finance_income_plans set expected_amount=99 where household_id=current_setting('qa.income.hh')::uuid;
do $$begin if not exists(select 1 from public.finance_income_plans where household_id=current_setting('qa.income.hh')::uuid and expected_amount=123.45) then raise exception 'Archived update accepted';end if;end$$;
reset role;
set local role anon;
do $$begin begin perform 1 from public.finance_income_plans;raise exception 'Anonymous read accepted';exception when insufficient_privilege then null;end;end$$;
reset role;
select true as read_only_archived_and_anonymous_checks_passed;
rollback;
