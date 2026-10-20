-- Regression: normal API users have NO USAGE on household_integrity in production.
-- All identities and household records below are synthetic and rolled back.
begin;
select set_config('qa.acl.owner',gen_random_uuid()::text,true);
select set_config('qa.acl.other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('qa.acl.'||kind)::uuid,'acl-'||current_setting('qa.acl.'||kind)||'@example.invalid','{"full_name":"Rollback permissions QA"}'::jsonb
from unnest(array['owner','other']) kind;
select set_config('request.jwt.claim.sub',current_setting('qa.acl.owner'),true);
select set_config('qa.acl.hh',public.create_household('QA payment permissions rollback')::text,true);
-- Isolated tests may grant schema usage for unrelated fixtures. Reproduce production exactly here.
revoke usage on schema household_integrity from public,authenticated,anon;
set local role authenticated;
do $$declare
 h uuid:=current_setting('qa.acl.hh')::uuid;u uuid:=auth.uid();bank uuid;card uuid;r uuid;tx uuid;p jsonb;
 d date:=(statement_timestamp() at time zone 'America/Guatemala')::date;
begin
 if has_schema_privilege(current_user,'household_integrity','USAGE') then raise exception 'Test does not reproduce private schema permissions';end if;
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance,is_shared)
 values(h,'QA bank','checking','asset',500,true) returning id into bank;
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance,is_shared)
 values(h,'QA credit','credit','liability',0,true) returning id into card;
 p:=jsonb_build_object('amount',391,'type','expense','date',d,'description','Electricidad QA','account_id',bank,'paid_by',u,'is_shared',true,'recurring',false,'budget_included',false);
 -- Main form and quick entry both call this public RPC with an explicit saved classification.
 r:=gen_random_uuid();tx:=public.save_transaction_once(h,r,p);
 if (select budget_included from public.transactions where id=tx) then raise exception 'Cash classification changed';end if;
 if public.save_transaction_once(h,r,p)<>tx then raise exception 'Retry duplicated a movement';end if;
 begin perform public.save_transaction_once(h,r,p||'{"amount":392}');raise exception 'Changed retry accepted';exception when serialization_failure then null;end;
 -- Automatic defaults and older clients also work without private schema access.
 tx:=public.save_transaction_once(h,gen_random_uuid(),(p-'budget_included')||jsonb_build_object('amount',40,'account_id',card));
 if not (select budget_included from public.transactions where id=tx) then raise exception 'Credit did not consume budget';end if;
 tx:=public.save_transaction_once(h,gen_random_uuid(),(p-'budget_included')||'{"amount":100,"type":"income"}');
 if (select type from public.transactions where id=tx)<>'income' then raise exception 'Income was not saved';end if;
 -- Direct inserts run the invoker trigger under the authenticated role too.
 insert into public.transactions(household_id,description,amount,type,transaction_date,account_id,paid_by,is_shared)
 values(h,'QA direct debit',3,'expense',d,bank,u,false) returning id into tx;
 if (select budget_included from public.transactions where id=tx) then raise exception 'Direct debit default changed';end if;
 -- Paying the card is still neutral to the expense ledger and budget.
 insert into public.finance_transfers(household_id,from_account_id,to_account_id,amount,transfer_date,description)
 values(h,bank,card,40,d,'QA card repayment');
 if (public.get_account_book_state(h,bank,d)->>'balance')::numeric<>166 then raise exception 'Wrong cash balance after payments';end if;
 if (public.get_account_book_state(h,card,d)->>'balance')::numeric<>0 then raise exception 'Card repayment did not reduce debt';end if;
 if (select count(*) from public.transactions where household_id=h)<>4 then raise exception 'Retry or repayment duplicated an expense';end if;
 if (select sum(amount) from public.transactions where household_id=h and type='expense' and budget_included)<>40 then raise exception 'Wrong budget total';end if;
 update public.transactions set description='QA direct debit edited' where id=tx;
 if (select budget_included from public.transactions where id=tx) then raise exception 'Edit changed classification';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.acl.other'),true);
do $$begin
 if exists(select 1 from public.transactions where household_id=current_setting('qa.acl.hh')::uuid) then raise exception 'Outsider read another household';end if;
 begin perform public.save_transaction_once(current_setting('qa.acl.hh')::uuid,gen_random_uuid(),'{"amount":1,"type":"expense","date":"2026-10-20","description":"Denied","is_shared":false}');raise exception 'Outsider wrote another household';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 begin perform public.save_transaction_once(current_setting('qa.acl.hh')::uuid,gen_random_uuid(),'{"amount":1,"type":"income","date":"2026-10-20","description":"Denied","is_shared":false}');raise exception 'Anonymous write accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if has_schema_privilege('authenticated','household_integrity','USAGE') or has_schema_privilege('anon','household_integrity','USAGE') then raise exception 'Private schema was opened';end if;
end $$;
rollback;
