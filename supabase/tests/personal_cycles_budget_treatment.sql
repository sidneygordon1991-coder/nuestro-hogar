-- Synthetic data only; everything is rolled back. Run on the isolated QA database.
begin;
select set_config('qa.cy.a',(select user_id::text from public.household_members where role='owner' order by joined_at limit 1),true);
select set_config('qa.cy.b',(select user_id::text from public.household_members where role='owner' and user_id<>current_setting('qa.cy.a')::uuid order by joined_at limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('qa.cy.a'),true);
select set_config('qa.cy.hh',public.create_household('QA personal cycle')::text,true);
set local role authenticated;
do $$declare
 h uuid:=current_setting('qa.cy.hh')::uuid; a uuid:=auth.uid(); b uuid:=current_setting('qa.cy.b')::uuid;
 m date:=date_trunc('month',statement_timestamp() at time zone 'America/Guatemala')::date;
 t uuid;backup uuid;account uuid;cat uuid;request uuid:=gen_random_uuid();payload jsonb;source jsonb;legacy jsonb;original_count integer;
begin
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance,owner_user_id,is_shared) values(h,'QA savings','savings','asset',1000,a,true) returning id into account;
 insert into public.budget_categories(household_id,name,icon,budget_group) values(h,'QA special','wallet','variable') returning id into cat;
 insert into public.budget_allocations(household_id,category_id,month,planned_amount) values(h,cat,m,100);
 insert into public.finance_income_plans(household_id,user_id,month,expected_amount,first_half_amount,second_half_amount,cycle_first_day,cycle_second_day)
 values(h,a,m,1000,500,500,14,29),(h,a,(m+interval '2 months')::date,1000,500,500,5,20);
 if (select cycle_first_day from public.get_finance_cycle_defaults(h,(m+interval '1 month')::date) where user_id=a)<>14 then raise exception 'Inherited a future cycle';end if;
 if exists(select 1 from public.get_finance_cycle_defaults(h,m)) then raise exception 'Current plan inherited into its past';end if;
 begin update public.finance_income_plans set cycle_first_day=29,cycle_second_day=30 where household_id=h;raise exception 'Invalid first day accepted';exception when check_violation then null;end;
 begin update public.finance_income_plans set cycle_second_day=14 where household_id=h and month=m;raise exception 'Overlapping boundaries accepted';exception when check_violation then null;end;
 payload:=jsonb_build_object('description','QA special payment','type','expense','amount',200,'date',m,'paid_by',a,'is_shared',true,'category_id',cat,'account_id',account,'recurring',false,'budget_included',false);
 t:=public.save_transaction_once(h,request,payload);
 if (select budget_included from public.transactions where id=t) is distinct from false then raise exception 'Special funding classification lost';end if;
 if public.save_transaction_once(h,request,payload)<>t then raise exception 'Retry duplicated expense';end if;
 begin perform public.save_transaction_once(h,request,payload||'{"budget_included":true}');raise exception 'Changed retry accepted';exception when serialization_failure then null;end;
 begin perform public.save_transaction_once(h,gen_random_uuid(),payload||'{"budget_included":"false"}');raise exception 'String flag accepted';exception when check_violation then null;end;
 if (select sum(share_amount) from public.transaction_splits where transaction_id=t)<>200 then raise exception 'Special funding erased responsibility';end if;
 if (select sum(case when type='income' then amount else -amount end) from public.transactions where household_id=h and account_id=account)<>-200 then raise exception 'Special funding removed account debit';end if;
 source:=public.get_home_finance_source(h,m);
 if not exists(select 1 from jsonb_array_elements(source->'transactions') x where x->>'id'=t::text and x->>'budget_included'='false') then raise exception 'Home omitted classification';end if;
 if not exists(select 1 from jsonb_array_elements(source->'plans') x where x->>'cycle_first_day'='14') then raise exception 'Home omitted cycle';end if;
 source:=public.get_finance_fortnight_review(h,m,'second')->'source';
 if not exists(select 1 from jsonb_array_elements(source->'transactions') x where x->>'id'=t::text and x->>'budget_included'='false') then raise exception 'Review omitted classification';end if;
 update public.transactions set budget_included=true where id=t;
 if (select sum(amount) from public.transactions where household_id=h and budget_included)<>200 then raise exception 'Including again failed';end if;
 update public.transactions set budget_included=false where id=t;
 -- A legacy client payload remains retry-compatible when it starts sending the explicit true default.
 request:=gen_random_uuid();payload:=payload-'budget_included';
 t:=public.save_transaction_once(h,request,payload||'{"budget_included":true}');
 if public.save_transaction_once(h,request,payload)<>t then raise exception 'Legacy default retry incompatible';end if;
 if public.save_transaction_once(h,request,payload||'{"budget_included":true}')<>t then raise exception 'Legacy request incompatible';end if;
 source:=public.build_monthly_household_close(h,m);
 if (source->'financial'->>'budget_usage')::numeric<>200 or (source->'financial'->>'expense')::numeric<>400 or (source->'financial'->>'excluded_expense')::numeric<>200 then raise exception 'Close confused budget and real spending: %',source->'financial';end if;
 -- Generic backups restore new fields and supply defaults for old plans/transactions.
 source:=public.build_household_backup_snapshot(h);
 if not exists(select 1 from jsonb_array_elements(source->'tables'->'transactions') x where x->>'budget_included'='false') then raise exception 'Backup lost exclusion';end if;
 legacy:=jsonb_build_array(jsonb_build_object('household_id',h,'user_id',a,'month','2097-01-01','expected_amount',100,'created_at',now(),'updated_at',now()));
 source:=jsonb_set(source,'{tables,finance_income_plans}',(source->'tables'->'finance_income_plans')||legacy);
 backup:=public.import_household_backup(h,source,'QA legacy cycle');
 perform public.restore_household_backup_missing(backup);
 if not exists(select 1 from public.finance_income_plans where household_id=h and month='2097-01-01' and cycle_first_day=1 and cycle_second_day=16) then raise exception 'Legacy plan restore broken';end if;
 select to_jsonb(tx)-'budget_included' into legacy from public.transactions tx where id=t;
 legacy:=legacy||jsonb_build_object('id',gen_random_uuid(),'client_request_id',null);
 source:=jsonb_set(source,'{tables,transactions}',(source->'tables'->'transactions')||jsonb_build_array(legacy));
 backup:=public.import_household_backup(h,source,'QA legacy expense');
 perform public.restore_household_backup_missing(backup);
 if not exists(select 1 from public.transactions where id=(legacy->>'id')::uuid and budget_included) then raise exception 'Legacy movement restore broken';end if;
 -- Another household's authenticated owner cannot see or set any of the new fields.
 perform set_config('request.jwt.claim.sub',b::text,true);
 if exists(select 1 from public.finance_income_plans where household_id=h) then raise exception 'Outsider read cycles';end if;
 update public.transactions set budget_included=true where household_id=h;
 begin perform public.get_finance_cycle_defaults(h,m);raise exception 'Outsider RPC exposed cycles';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.cy.a'),true);
set local role authenticated;
do $$begin
 if not exists(select 1 from public.transactions where household_id=current_setting('qa.cy.hh')::uuid and budget_included=false) then raise exception 'Outsider changed budget flag';end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 begin perform public.get_finance_cycle_defaults(current_setting('qa.cy.hh')::uuid,current_date);raise exception 'Null auth bypass';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 begin perform public.get_finance_cycle_defaults(current_setting('qa.cy.hh')::uuid,current_date);raise exception 'Anonymous exposed cycles';exception when insufficient_privilege then null;end;
end $$;
rollback;
