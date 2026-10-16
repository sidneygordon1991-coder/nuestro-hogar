-- Run only against a backend with the savings ledger migration applied.
-- All identities and households are synthetic and rolled back. No emails sent.
begin;
select set_config('qa.savings.owner',gen_random_uuid()::text,true);
select set_config('qa.savings.reader',gen_random_uuid()::text,true);
select set_config('qa.savings.outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('qa.savings.'||kind)::uuid,'qa-'||current_setting('qa.savings.'||kind)||'@example.invalid','{"full_name":"Rollback QA"}'::jsonb
from unnest(array['owner','reader','outsider']) kind;
select set_config('request.jwt.claim.sub',current_setting('qa.savings.owner'),true);
select set_config('qa.savings.home',public.create_household('Savings ledger rollback QA')::text,true);
insert into public.household_members(household_id,user_id,role)
values(current_setting('qa.savings.home')::uuid,current_setting('qa.savings.reader')::uuid,'guest');
insert into public.household_member_access(household_id,user_id,module,access_level)
values(current_setting('qa.savings.home')::uuid,current_setting('qa.savings.reader')::uuid,'finance','view');
set local role authenticated;
do $$
declare h uuid:=current_setting('qa.savings.home')::uuid;g uuid;g2 uuid;d uuid:=gen_random_uuid();w uuid:=gen_random_uuid();backup jsonb;
begin
 if not public.get_savings_ledger_capability(h) then raise exception 'Owner capability missing';end if;
 insert into public.savings_goals(household_id,name,target_amount) values(h,'Ledger QA',1000) returning id into g;
 insert into public.savings_goals(household_id,name,target_amount) values(h,'Restore QA',1000) returning id into g2;
 perform set_config('qa.savings.goal',g::text,true);
 perform public.save_savings_entry(h,g,d,100,'deposit','2000-01-05');
 perform public.save_savings_entry(h,g,d,100,'deposit','2000-01-05');
 perform public.save_savings_entry(h,g,w,40,'withdrawal','2000-01-06');
 set constraints all immediate;
 if (select sum(amount) from public.goal_contributions where goal_id=g)<>60 or (select count(*) from public.goal_contributions where goal_id=g)<>2 then raise exception 'Balance or retry failed';end if;
 begin perform public.save_savings_entry(h,g,w,30,'withdrawal','2000-01-06');raise exception 'Conflicting retry accepted';exception when serialization_failure then null;end;
 begin perform public.save_savings_entry(h,g,gen_random_uuid(),61,'withdrawal','2000-01-06');raise exception 'Overdraft accepted';exception when check_violation then null;end;
 begin perform public.save_savings_entry(h,g,gen_random_uuid(),10,'withdrawal','2000-01-04');raise exception 'Backdated overdraft accepted';exception when check_violation then null;end;
 begin update public.goal_contributions set amount=30 where id=d;raise exception 'Invalid edit accepted';exception when check_violation then null;end;
 begin delete from public.goal_contributions where id=d;raise exception 'Invalid delete accepted';exception when check_violation then null;end;
 begin update public.goal_contributions set goal_id=g2 where id=d;raise exception 'Invalid goal move accepted';exception when check_violation then null;end;
 begin insert into public.goal_contributions(household_id,goal_id,amount,contribution_date) values(h,g,-100,'2000-01-07');raise exception 'Direct overdraft accepted';exception when check_violation then null;end;
 begin perform public.save_savings_entry(h,g,gen_random_uuid(),0.001,'deposit','2000-01-05');raise exception 'Fractional cent accepted';exception when check_violation then null;end;
 begin perform public.save_savings_entry(h,g,gen_random_uuid(),1,'deposit','2999-01-05');raise exception 'Future entry accepted';exception when check_violation then null;end;
 begin perform public.save_savings_entry(h,gen_random_uuid(),gen_random_uuid(),1,'deposit','2000-01-05');raise exception 'Foreign goal accepted';exception when insufficient_privilege then null;end;
 set constraints all deferred;
 insert into public.goal_contributions(household_id,goal_id,amount,contribution_date)
 values(h,g2,-10,'2000-01-06'),(h,g2,20,'2000-01-05');
 set constraints all immediate;
 if (select sum(amount) from public.goal_contributions where goal_id=g2)<>10 then raise exception 'Deferred restore order failed';end if;
 backup:=public.build_household_backup_snapshot(h);
 if not exists(select 1 from jsonb_array_elements(backup->'tables'->'goal_contributions') x where (x->>'amount')::numeric=-40) then raise exception 'Backup lost withdrawal';end if;
 if exists(select 1 from public.transactions where household_id=h) then raise exception 'Savings created a bank movement';end if;
 perform set_config('request.jwt.claim.sub',current_setting('qa.savings.reader'),true);
 if not public.get_savings_ledger_capability(h) then raise exception 'Reader visibility missing';end if;
 begin perform public.save_savings_entry(h,g,gen_random_uuid(),1,'deposit','2000-01-05');raise exception 'Reader write accepted';exception when insufficient_privilege then null;end;
 update public.goal_contributions set amount=999 where goal_id=g;
 delete from public.goal_contributions where goal_id=g;
 if (select sum(amount) from public.goal_contributions where goal_id=g)<>60 then raise exception 'Reader direct mutation accepted';end if;
 perform set_config('request.jwt.claim.sub',current_setting('qa.savings.outsider'),true);
 if public.get_savings_ledger_capability(h) or exists(select 1 from public.goal_contributions where household_id=h) then raise exception 'Household isolation failed';end if;
 begin perform public.save_savings_entry(h,g,gen_random_uuid(),1,'deposit','2000-01-05');raise exception 'Outsider write accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
update platform_security.household_controls set status='archived' where household_id=current_setting('qa.savings.home')::uuid;
select set_config('request.jwt.claim.sub',current_setting('qa.savings.owner'),true);
set local role authenticated;
do $$begin
 begin perform public.save_savings_entry(current_setting('qa.savings.home')::uuid,current_setting('qa.savings.goal')::uuid,gen_random_uuid(),1,'deposit','2000-01-05');raise exception 'Archived write accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 begin perform public.get_savings_ledger_capability(gen_random_uuid());raise exception 'Anonymous capability accepted';exception when insufficient_privilege then null;end;
 begin perform public.save_savings_entry(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),1,'deposit','2000-01-05');raise exception 'Anonymous write accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select true as real_schema_ledger_rls_archive_retry_backup_passed;
rollback;
