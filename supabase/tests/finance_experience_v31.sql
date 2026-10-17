-- Run as one block. Uses the two oldest owners as members of a temporary household; everything is rolled back.
begin;
select set_config('qa.v31.a',(select user_id::text from public.household_members where role='owner' order by joined_at limit 1),true);
select set_config('qa.v31.b',(select user_id::text from public.household_members where role='owner' and user_id<>current_setting('qa.v31.a')::uuid order by joined_at limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('qa.v31.a'),true);
select set_config('qa.v31.hh',public.create_household('QA v31 rollback')::text,true);
insert into public.household_members(household_id,user_id,role) values(current_setting('qa.v31.hh')::uuid,current_setting('qa.v31.b')::uuid,'adult');
set local role authenticated;
do $$
declare hh uuid:=current_setting('qa.v31.hh')::uuid;a uuid:=current_setting('qa.v31.a')::uuid;b uuid:=current_setting('qa.v31.b')::uuid;src jsonb;n int;
begin
 -- Pay days have defaults and limits.
 insert into public.finance_member_settings(household_id,user_id,monthly_income) values(hh,a,9000);
 if (select first_pay_day::text||'/'||second_pay_day::text from public.finance_member_settings where household_id=hh and user_id=a)<>'15/31' then raise exception 'Default pay days missing';end if;
 begin update public.finance_member_settings set first_pay_day=20 where household_id=hh and user_id=a;raise exception 'Invalid first pay day accepted';exception when check_violation then null;end;
 -- Dollar entries keep GTQ amounts and the original currency together.
 insert into public.transactions(household_id,description,amount,type,transaction_date,paid_by,original_currency,original_amount,exchange_rate) values(hh,'Compra en línea',387.50,'expense',current_date,a,'USD',50,7.75);
 begin insert into public.transactions(household_id,description,amount,type,transaction_date,paid_by,original_currency) values(hh,'Incompleta',10,'expense',current_date,a,'USD');raise exception 'Partial currency accepted';exception when check_violation then null;end;
 begin insert into public.transactions(household_id,description,amount,type,transaction_date,paid_by,original_currency,original_amount,exchange_rate) values(hh,'Wrong conversion',1,'expense',current_date,a,'USD',50,7.75);raise exception 'Mismatched USD conversion accepted';exception when check_violation then null;end;
 -- Private movements belong only to their owner.
 insert into public.private_transactions(household_id,description,amount,type) values(hh,'Regalo sorpresa',300,'expense');
 begin insert into public.private_transactions(household_id,user_id,description,amount,type) values(hh,b,'Suplantado',5,'expense');raise exception 'Private row for another member accepted';exception when insufficient_privilege then null;end;
 -- Settlements require two different members.
 insert into public.finance_settlements(household_id,from_user_id,to_user_id,amount,period_month,created_by) values(hh,b,a,450,date_trunc('month',current_date)::date,a);
 begin insert into public.finance_settlements(household_id,from_user_id,to_user_id,amount,created_by) values(hh,a,a,1,a);raise exception 'Self settlement accepted';exception when check_violation then null;end;
 src:=public.get_home_finance_source(hh,current_date);
 if jsonb_array_length(src->'transactions')<>1 or (src->'transactions'->0->>'original_currency')<>'USD' then raise exception 'Home source transactions wrong: %',src->'transactions';end if;
 if jsonb_array_length(src->'private')<>1 then raise exception 'Owner cannot see own private movement';end if;
 if jsonb_array_length(src->'settlements')<>1 or jsonb_array_length(src->'members')<>2 then raise exception 'Settlements or members missing';end if;
 if (src->'member_settings'->0->>'second_pay_day')<>'31' then raise exception 'Pay days missing in home source';end if;
end $$;
-- The other member never sees, edits or deletes the private movement.
reset role;
insert into public.household_member_access(household_id,user_id,module,access_level) values(current_setting('qa.v31.hh')::uuid,current_setting('qa.v31.b')::uuid,'finance','view');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.v31.b'),true);
do $$
declare hh uuid:=current_setting('qa.v31.hh')::uuid;n int;src jsonb;
begin
 begin insert into public.private_transactions(household_id,description,amount,type) values(hh,'Viewer cannot write',10,'expense');raise exception 'Read-only member wrote a private movement';exception when insufficient_privilege then null;end;
 select count(*) into n from public.private_transactions where household_id=hh;if n<>0 then raise exception 'Private movement leaked to partner';end if;
 update public.private_transactions set amount=1 where household_id=hh;get diagnostics n=row_count;if n<>0 then raise exception 'Partner edited a private movement';end if;
 delete from public.private_transactions where household_id=hh;get diagnostics n=row_count;if n<>0 then raise exception 'Partner deleted a private movement';end if;
 src:=public.get_home_finance_source(hh,current_date);
 if jsonb_array_length(src->'private')<>0 then raise exception 'Home source leaked private movement';end if;
 if jsonb_array_length(src->'settlements')<>1 then raise exception 'Shared settlement hidden from partner';end if;
end $$;
-- A non-member cannot read the home source.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000999',true);
do $$ begin perform public.get_home_finance_source(current_setting('qa.v31.hh')::uuid,current_date);raise exception 'Outsider read the home source';exception when insufficient_privilege then null;end $$;
reset role;
-- Leaving the household removes that member's private movements.
delete from public.household_members where household_id=current_setting('qa.v31.hh')::uuid and user_id=current_setting('qa.v31.a')::uuid;
do $$ begin if exists(select 1 from public.private_transactions where household_id=current_setting('qa.v31.hh')::uuid) then raise exception 'Private movements survived leaving';end if;end $$;
rollback;
