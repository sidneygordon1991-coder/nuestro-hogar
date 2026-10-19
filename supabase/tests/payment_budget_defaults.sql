-- Isolated QA schema only. Synthetic rows are rolled back and never touch production records.
begin;
select set_config('qa.pay.owner',(select user_id::text from public.household_members where role='owner' order by joined_at limit 1),true);
select set_config('qa.pay.other',(select user_id::text from public.household_members where role='owner' and user_id<>current_setting('qa.pay.owner')::uuid order by joined_at limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('qa.pay.owner'),true);
select set_config('qa.pay.hh',public.create_household('QA payment sources')::text,true);
set local role authenticated;
do $$declare
 h uuid:=current_setting('qa.pay.hh')::uuid;u uuid:=auth.uid();bank uuid;card uuid;cash uuid;tx uuid;legacy uuid;outside_id uuid;req uuid;payload jsonb;
 d date:=(statement_timestamp() at time zone 'America/Guatemala')::date;m date:=date_trunc('month',d)::date;
 r uuid;o uuid;l uuid;i uuid;checkout uuid;purchase uuid;batch uuid;result jsonb;before_count integer;
begin
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance,owner_user_id,is_shared)
 values(h,'QA debit','checking','asset',1000,u,true) returning id into bank;
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance,owner_user_id,is_shared)
 values(h,'QA credit','credit','liability',0,u,true) returning id into card;
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance,owner_user_id,is_shared)
 values(h,'QA wallet','cash','asset',0,u,true) returning id into cash;
 payload:=jsonb_build_object('amount',100,'type','expense','date',d,'description','Debit purchase','account_id',bank,'paid_by',u,'is_shared',true,'recurring',false);
 req:=gen_random_uuid();outside_id:=public.save_transaction_once(h,req,payload);
 if (select budget_included from public.transactions where id=outside_id) is distinct from false then raise exception 'Debit purchase consumed budget';end if;
 if public.save_transaction_once(h,req,payload)<>outside_id then raise exception 'Default cash retry duplicated';end if;
 begin perform public.save_transaction_once(h,req,payload||'{"budget_included":true}');raise exception 'Changed automatic budget request accepted';exception when serialization_failure then null;end;
 if (select sum(share_amount) from public.transaction_splits where transaction_id=outside_id)<>100 then raise exception 'Exclusion lost responsibility';end if;
 update public.finance_accounts set account_type='credit',account_class='liability' where id=bank;
 if public.save_transaction_once(h,req,payload)<>outside_id or (select budget_included from public.transactions where id=outside_id) then raise exception 'Account change reclassified retry';end if;
 update public.finance_accounts set account_type='checking',account_class='asset' where id=bank;
 tx:=public.save_transaction_once(h,gen_random_uuid(),payload||jsonb_build_object('account_id',card,'amount',200,'description','Credit purchase'));
 if (select budget_included from public.transactions where id=tx) is distinct from true then raise exception 'Credit purchase missed budget';end if;
 tx:=public.save_transaction_once(h,gen_random_uuid(),payload||'{"amount":50,"description":"Cash exception","budget_included":true}');
 if (select budget_included from public.transactions where id=tx) is distinct from true then raise exception 'Cash include override lost';end if;
 tx:=public.save_transaction_once(h,gen_random_uuid(),payload||jsonb_build_object('account_id',card,'amount',20,'description','Credit exception','budget_included',false));
 if (select budget_included from public.transactions where id=tx) is distinct from false then raise exception 'Credit exclusion override lost';end if;
 tx:=public.save_transaction_once(h,gen_random_uuid(),payload||'{"account_id":null,"amount":5,"description":"Unassigned funding"}');
 if (select budget_included from public.transactions where id=tx) is distinct from true then raise exception 'Unassigned funding silently excluded';end if;
 tx:=public.save_transaction_once(h,gen_random_uuid(),payload||'{"type":"income","amount":30,"description":"Income"}');
 if (select budget_included from public.transactions where id=tx) is distinct from true then raise exception 'Income treated as spending';end if;
 -- Included legacy payloads did not store a true flag. Their retries must still match after the upgrade.
 req:=gen_random_uuid();payload:=payload||'{"amount":10,"description":"Legacy included request"}';
 legacy:=public.save_transaction_once(h,req,payload||'{"budget_included":true}');
 if exists(select 1 from public.finance_write_requests wr where wr.id=req and wr.payload ? 'budget_included') then raise exception 'Legacy canonical shape changed';end if;
 if public.save_transaction_once(h,req,payload)<>legacy or public.save_transaction_once(h,req,payload||'{"budget_included":true}')<>legacy then raise exception 'Legacy retry incompatible';end if;
 if (select budget_included from public.transactions where id=legacy) is distinct from true then raise exception 'Legacy inclusion rewritten';end if;
 if (public.get_account_book_state(h,bank,d)->>'balance')::numeric<>870 or (public.get_account_book_state(h,card,d)->>'balance')::numeric<>220 then raise exception 'Purchases confused cash with debt';end if;
 before_count:=(select count(*) from public.transactions where household_id=h);
 insert into public.finance_transfers(household_id,from_account_id,to_account_id,amount,transfer_date,description)
 values(h,bank,card,220,d,'Card repayment'),(h,bank,cash,100,d,'Own-account transfer');
 if (select count(*) from public.transactions where household_id=h)<>before_count then raise exception 'Transfer recorded a duplicate expense';end if;
 if (public.get_account_book_state(h,bank,d)->>'balance')::numeric<>550 or (public.get_account_book_state(h,card,d)->>'balance')::numeric<>0 or (public.get_account_book_state(h,cash,d)->>'balance')::numeric<>100 then raise exception 'Repayment or own transfer changed the wrong balance';end if;
 if (select sum(amount) from public.transactions where household_id=h and type='expense' and budget_included)<>265 then raise exception 'Budget double-counted a payment';end if;
 -- Every new insert path shares the default, not only the main form.
 tx:=public.quick_add_transaction(h,'Wallet purchase',15,'expense',d,null,cash,u,true);
 if (select budget_included from public.transactions where id=tx) then raise exception 'Quick add missed automatic cash rule';end if;
 insert into public.recurring_transactions(household_id,description,amount,type,due_day,account_id,paid_by,is_shared)
 values(h,'Bank recurrence',25,'expense',extract(day from d)::integer,bank,u,true) returning id into r;
 insert into public.recurring_transaction_occurrences(household_id,recurring_transaction_id,period_month,due_date,status)
 values(h,r,m,d,'pending') returning id into o;
 tx:=public.pay_finance_recurring_occurrence(h,o,25,d);
 if (select budget_included from public.transactions where id=tx) or public.pay_finance_recurring_occurrence(h,o,25,d)<>tx then raise exception 'Recurrence rule or retry incorrect';end if;
 insert into public.lists(household_id,title,list_type) values(h,'QA groceries','shopping') returning id into l;
 insert into public.list_items(household_id,list_id,text,completed) values(h,l,'Apples',true) returning id into i;
 checkout:=gen_random_uuid();purchase:=public.checkout_shopping_purchase(h,checkout,l,array[i],40,d,null,bank,u,true,'Groceries');
 if (select budget_included from public.transactions where id=purchase) or public.checkout_shopping_purchase(h,checkout,l,array[i],40,d,null,bank,u,true,'Groceries')<>purchase then raise exception 'Checkout rule or retry incorrect';end if;
 batch:=gen_random_uuid();result:=public.import_finance_transactions_once(h,jsonb_build_array(jsonb_build_object('request_id',batch,'values',payload||'{"amount":60,"description":"CSV purchase"}')));
 if exists(select 1 from public.transactions where id=(result->'transaction_ids'->>0)::uuid and budget_included) then raise exception 'CSV rule incorrect';end if;
 insert into public.transactions(household_id,description,amount,type,transaction_date,account_id,paid_by,is_shared,budget_included)
 values(h,'Explicit direct include',5,'expense',d,bank,u,false,true);
 if (public.get_account_book_state(h,bank,d)->>'balance')::numeric<>420 or (public.get_account_book_state(h,cash,d)->>'balance')::numeric<>85 then raise exception 'Real balances lost an excluded expense';end if;
 if (select sum(amount) from public.transactions where household_id=h and type='expense' and budget_included)<>270 then raise exception 'Budget exceptions changed other payments';end if;
 -- Existing flags survive ordinary edits and a backup restore. No historical inference on UPDATE.
 update public.transactions set description='Edited old description' where id=legacy;
 if not (select budget_included from public.transactions where id=legacy) then raise exception 'Ordinary edit reclassified history';end if;
 if exists(select 1 from public.transactions where household_id=h and budget_included is null) then raise exception 'Insert sentinel leaked into records';end if;
end $$;
-- A non-member cannot read the household's accounting or create an excluded expense there.
select set_config('request.jwt.claim.sub',current_setting('qa.pay.other'),true);
do $$begin
 if exists(select 1 from public.transactions where household_id=current_setting('qa.pay.hh')::uuid) then raise exception 'Outsider read transactions';end if;
 begin perform public.save_transaction_once(current_setting('qa.pay.hh')::uuid,gen_random_uuid(),'{"amount":1,"type":"expense","date":"2000-01-01","description":"Denied","is_shared":false}');raise exception 'Outsider write accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 begin perform household_integrity.default_payment_budget(current_setting('qa.pay.hh')::uuid,null,'expense');raise exception 'Anonymous helper executable';exception when insufficient_privilege then null;end;
end $$;
rollback;
