-- Quick add in dollars: save_transaction_once stores quetzales plus the original USD amount and rate
-- in one step, and a retry with the same request id returns the same movement. Rolled back.
begin;
do $$
begin
 -- Local fixtures lack the production movement engine; a minimal stand-in keeps this scenario runnable.
 if to_regprocedure('public.save_finance_transaction(uuid,jsonb,uuid,uuid)') is null then
  execute $f$create function public.save_finance_transaction(h uuid,p jsonb,t uuid,r uuid) returns uuid language plpgsql as $b$
   declare tx uuid;begin insert into public.transactions(household_id,description,amount,type,transaction_date,category_id,paid_by,is_shared)
   values(h,p->>'description',(p->>'amount')::numeric,p->>'type',(p->>'transaction_date')::date,nullif(p->>'category_id','')::uuid,(p->>'paid_by')::uuid,(p->>'is_shared')::boolean) returning id into tx;return tx;end $b$ $f$;
  execute 'grant execute on function public.save_finance_transaction(uuid,jsonb,uuid,uuid) to authenticated';
 end if;
end $$;
select set_config('qa.sc.owner',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values(current_setting('qa.sc.owner')::uuid,'qa-sc@example.invalid','{"full_name":"Rollback QA"}');
select set_config('request.jwt.claim.sub',current_setting('qa.sc.owner'),true);
select set_config('qa.sc.hh',public.create_household('QA dólares v31 rollback')::text,true);
set local role authenticated;
do $$
declare hh uuid:=current_setting('qa.sc.hh')::uuid;req uuid:=gen_random_uuid();tx uuid;again uuid;row public.transactions;
 v jsonb:=jsonb_build_object('amount',387.5,'type','expense','date','2026-10-17','description','Suscripción','is_shared',true,'original_currency','USD','original_amount',50,'exchange_rate',7.75);
begin
 tx:=public.save_transaction_once(hh,req,v);
 select * into row from public.transactions where id=tx;
 if row.amount<>387.5 or row.original_currency<>'USD' or row.original_amount<>50 or row.exchange_rate<>7.75 then raise exception 'USD fields not stored: %',row_to_json(row);end if;
 again:=public.save_transaction_once(hh,req,v);
 if again<>tx then raise exception 'Retry must return the same movement';end if;
 begin perform public.save_transaction_once(hh,req,v||'{"exchange_rate":8}');raise exception 'Changed retry must be rejected';
 exception when serialization_failure then null;end;
 begin perform public.save_transaction_once(hh,gen_random_uuid(),v||'{"original_currency":"EUR"}');raise exception 'Only USD is accepted';
 exception when check_violation then null;end;
 begin perform public.save_transaction_once(hh,gen_random_uuid(),v-'exchange_rate');raise exception 'Rate is required with USD';
 exception when check_violation then null;end;
 -- Quetzal movements are unchanged.
 tx:=public.save_transaction_once(hh,gen_random_uuid(),v-'original_currency'-'original_amount'-'exchange_rate');
 if (select original_currency from public.transactions where id=tx) is not null then raise exception 'Quetzal movement must not carry a currency';end if;
end $$;
rollback;

-- CSV imports commit each block together with canonical expense splits and retain request IDs.
begin;
select set_config('qa.csv.owner',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values(current_setting('qa.csv.owner')::uuid,'qa-csv@example.invalid','{"full_name":"CSV QA"}');
select set_config('request.jwt.claim.sub',current_setting('qa.csv.owner'),true);
select set_config('qa.csv.hh',public.create_household('QA CSV rollback')::text,true);
set local role authenticated;
do $$
declare hh uuid:=current_setting('qa.csv.hh')::uuid;a uuid:=current_setting('qa.csv.owner')::uuid;entries jsonb;first jsonb;again jsonb;n int;
begin
 entries:=jsonb_build_array(jsonb_build_object('request_id',gen_random_uuid(),'values',jsonb_build_object('description','CSV atomic expense','amount',125.50,'type','expense','date',current_date,'paid_by',a,'is_shared',true,'recurring',false)));
 first:=public.import_finance_transactions_once(hh,entries);
 again:=public.import_finance_transactions_once(hh,entries);
 if first<>again then raise exception 'CSV retry changed movement IDs';end if;
 if (select count(*) from public.transactions where household_id=hh)<>1 then raise exception 'CSV retry duplicated movements';end if;
 if (select sum(share_amount) from public.transaction_splits where household_id=hh)<>125.50 then raise exception 'CSV expense splits missing';end if;
 begin
  perform public.import_finance_transactions_once(hh,entries||jsonb_build_array(jsonb_build_object('request_id',gen_random_uuid(),'values',jsonb_build_object('description','Invalid','amount',-1,'type','expense','date',current_date))));
  raise exception 'Invalid CSV block accepted';
 exception when check_violation then null;end;
 -- First new row must roll back when the second row fails.
 n:=(select count(*) from public.transactions where household_id=hh);
 begin
  perform public.import_finance_transactions_once(hh,jsonb_build_array(
   jsonb_build_object('request_id',gen_random_uuid(),'values',jsonb_build_object('description','Must roll back','amount',20,'type','expense','date',current_date,'paid_by',a,'is_shared',true,'recurring',false)),
   jsonb_build_object('request_id',gen_random_uuid(),'values',jsonb_build_object('description','Invalid','amount',-1,'type','expense','date',current_date))));
  raise exception 'Invalid CSV block accepted';
 exception when check_violation then null;end;
 if (select count(*) from public.transactions where household_id=hh)<>n then raise exception 'Partial CSV block committed';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$begin
 begin perform public.import_finance_transactions_once(current_setting('qa.csv.hh')::uuid,'[]');raise exception 'Outsider imported CSV';exception when insufficient_privilege then null;end;
end$$;
rollback;
