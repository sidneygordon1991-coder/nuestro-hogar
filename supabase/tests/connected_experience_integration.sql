-- Production-schema integration using synthetic households. Entire transaction rolls back.
begin;
set local statement_timeout='20s';
set local lock_timeout='5s';
select set_config('qa.connected.owner',gen_random_uuid()::text,true);
select set_config('qa.connected.other',gen_random_uuid()::text,true);
select set_config('qa.connected.reader',gen_random_uuid()::text,true);
select set_config('qa.connected.outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('qa.connected.'||kind)::uuid,'qa-'||current_setting('qa.connected.'||kind)||'@example.invalid','{"full_name":"Connected experience rollback QA"}'::jsonb
from unnest(array['owner','other','reader','outsider']) kind;
select set_config('request.jwt.claim.sub',current_setting('qa.connected.owner'),true);
select set_config('qa.connected.home',public.create_household('Connected experience rollback QA')::text,true);
insert into public.household_members(household_id,user_id,role)
values(current_setting('qa.connected.home')::uuid,current_setting('qa.connected.other')::uuid,'adult'),(current_setting('qa.connected.home')::uuid,current_setting('qa.connected.reader')::uuid,'guest');
insert into public.household_member_access(household_id,user_id,module,access_level)
select current_setting('qa.connected.home')::uuid,current_setting('qa.connected.reader')::uuid,module,'view' from unnest(array['lists','finance']) module;
set local role authenticated;
do $$
declare h uuid:=current_setting('qa.connected.home')::uuid;d date:=(now() at time zone 'America/Guatemala')::date;m date:=date_trunc('month',d)::date;
 a uuid;c uuid;sc uuid;g uuid;l uuid;i uuid;tx uuid;again uuid;req uuid:=gen_random_uuid();movement uuid:=gen_random_uuid();confirmation uuid:=gen_random_uuid();comment uuid:=gen_random_uuid();state jsonb;v_values jsonb;backup uuid;snapshot jsonb;restored jsonb;
begin
 insert into public.budget_categories(household_id,name,icon,budget_group) values(h,'QA connected food','food','variable') returning id into c;
 insert into public.budget_categories(household_id,name,icon,budget_group) values(h,'QA connected saving','saving','saving') returning id into sc;
 insert into public.savings_goals(household_id,name,target_amount) values(h,'QA connected goal',1000) returning id into g;
 insert into public.goal_budget_links(household_id,goal_id,category_id,month) values(h,g,sc,m);
 begin update public.budget_categories set budget_group='variable' where id=sc;raise exception 'Linked saving category changed';exception when check_violation then null;end;
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance) values(h,'QA connected account','checking','asset',1000) returning id into a;
 insert into public.lists(household_id,title,list_type) values(h,'QA connected shopping','shopping') returning id into l;
 insert into public.list_items(household_id,list_id,text,quantity,completed) values(h,l,'QA milk','2 units',true) returning id into i;
 tx:=public.checkout_shopping_purchase(h,req,l,array[i],125.50,d,c,a,auth.uid(),true,'QA purchase');
 again:=public.checkout_shopping_purchase(h,req,l,array[i],125.50,d,c,a,auth.uid(),true,'QA purchase');
 if tx<>again or (select count(*) from public.transactions where household_id=h)<>1 then raise exception 'Duplicate checkout';end if;
 begin perform public.checkout_shopping_purchase(h,gen_random_uuid(),l,array[i],125.50,d,c,a,auth.uid(),true,'QA purchase');raise exception 'Second checkout accepted';exception when serialization_failure then null;end;
 if (select sum(share_amount) from public.transaction_splits where transaction_id=tx)<>125.50 then raise exception 'Purchase split mismatch';end if;
 v_values:=jsonb_build_object('amount',10.25,'type','expense','date',d,'description','QA monthly','account_id',a,'category_id',c,'paid_by',auth.uid(),'is_shared',true,'recurring',true,'due_day',31);
 tx:=public.save_transaction_once(h,movement,v_values);again:=public.save_transaction_once(h,movement,v_values);
 if tx<>again or tx<>movement or (select count(*) from public.transactions where household_id=h)<>2 or (select count(*) from public.recurring_transactions where household_id=h)<>1 or (select count(*) from public.recurring_transaction_occurrences where household_id=h)<>1 then raise exception 'Atomic recurring retry failed';end if;
 begin perform public.save_transaction_once(h,movement,v_values||'{"amount":11}'::jsonb);raise exception 'Changed retry accepted';exception when serialization_failure then null;end;
 begin perform public.save_transaction_once(h,gen_random_uuid(),v_values||'{"amount":0.001}'::jsonb);raise exception 'Fractional cents accepted';exception when check_violation then null;end;
 state:=public.get_account_book_state(h,a,d);if (state->>'balance')::numeric<>864.25 then raise exception 'Account book calculation failed: %',state;end if;
 perform public.confirm_account_reconciliation(h,confirmation,a,d,864.25,state->>'fingerprint','QA statement');
 perform public.confirm_account_reconciliation(h,confirmation,a,d,864.25,state->>'fingerprint','QA statement');
 if (select count(*) from public.account_reconciliations where household_id=h)<>1 then raise exception 'Duplicate confirmation';end if;
 perform public.quick_add_transaction(h,'QA late entry',1,'expense',d,c,a,auth.uid(),true,null);
 begin perform public.confirm_account_reconciliation(h,gen_random_uuid(),a,d,863.25,state->>'fingerprint','stale');raise exception 'Stale confirmation accepted';exception when serialization_failure then null;end;
 insert into public.household_comments(id,household_id,transaction_id,body,created_by) values(comment,h,tx,'QA coordination',current_setting('qa.connected.outsider')::uuid);
 if not exists(select 1 from public.household_comments where id=comment and created_by=auth.uid()) then raise exception 'Comment author spoofed';end if;
 snapshot:=public.build_household_backup_snapshot(h);
 if not(snapshot->'tables' ?& array['goal_budget_links','shopping_checkouts','shopping_checkout_items','account_reconciliations','finance_write_requests','household_comments']) then raise exception 'Connected records missing from snapshot';end if;
 backup:=public.create_household_backup(h,'QA recovery drill');
 perform set_config('qa.connected.account',a::text,true);perform set_config('qa.connected.item',i::text,true);perform set_config('qa.connected.backup',backup::text,true);
 perform set_config('qa.connected.request',movement::text,true);perform set_config('qa.connected.values',v_values::text,true);perform set_config('qa.connected.confirmation',confirmation::text,true);
 -- Two other accounts: a reader can view shared records; an outsider cannot.
 perform set_config('request.jwt.claim.sub',current_setting('qa.connected.reader'),true);
 if (select count(*) from public.household_comments where household_id=h)<>1 then raise exception 'Reader cannot view comments';end if;
 begin perform public.save_transaction_once(h,gen_random_uuid(),v_values);raise exception 'Reader wrote movement';exception when insufficient_privilege then null;end;
 begin insert into public.household_comments(household_id,list_item_id,body) values(h,i,'Reader');raise exception 'Reader wrote comment';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.finance_write_requests where household_id=h) then raise exception 'Reader sees another user draft request';end if;
 perform set_config('request.jwt.claim.sub',current_setting('qa.connected.outsider'),true);
 if exists(select 1 from public.goal_budget_links where household_id=h) or exists(select 1 from public.shopping_checkouts where household_id=h) or exists(select 1 from public.account_reconciliations where household_id=h) or exists(select 1 from public.household_comments where household_id=h) then raise exception 'Cross-household RLS failed';end if;
 begin perform public.get_account_book_state(h,a,d);raise exception 'Outsider viewed account';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',current_setting('qa.connected.other'),true);
 delete from public.household_comments where id=comment;
 if not exists(select 1 from public.household_comments where id=comment) then raise exception 'Other member deleted author comment';end if;
 perform set_config('request.jwt.claim.sub',current_setting('qa.connected.owner'),true);
 begin perform public.get_platform_overview();raise exception 'Non-master opened administration';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Deliberately remove only this test household's synthetic records, then recover them.
delete from public.household_comments where household_id=current_setting('qa.connected.home')::uuid;
delete from public.shopping_checkout_items where household_id=current_setting('qa.connected.home')::uuid;
delete from public.shopping_checkouts where household_id=current_setting('qa.connected.home')::uuid;
delete from public.account_reconciliations where household_id=current_setting('qa.connected.home')::uuid;
delete from public.finance_write_requests where household_id=current_setting('qa.connected.home')::uuid;
delete from public.recurring_transaction_occurrences where household_id=current_setting('qa.connected.home')::uuid;
delete from public.transactions where household_id=current_setting('qa.connected.home')::uuid;
delete from public.recurring_transactions where household_id=current_setting('qa.connected.home')::uuid;
delete from public.goal_budget_links where household_id=current_setting('qa.connected.home')::uuid;
set local role authenticated;
do $$declare h uuid:=current_setting('qa.connected.home')::uuid;r jsonb;state jsonb;begin
 r:=public.restore_household_backup_missing(current_setting('qa.connected.backup')::uuid);
 if (select count(*) from public.transactions where household_id=h)<>3 or (select count(*) from public.recurring_transaction_occurrences where household_id=h)<>1 or (select count(*) from public.household_comments where household_id=h)<>1 or (select count(*) from public.shopping_checkout_items where household_id=h)<>1 then raise exception 'Recovery failed: %',r;end if;
 if not exists(select 1 from public.account_reconciliations where id=current_setting('qa.connected.confirmation')::uuid and source='restored' and book_balance=864.25) then raise exception 'Historical reconciliation rewritten';end if;
 state:=public.get_account_book_state(h,current_setting('qa.connected.account')::uuid,(now() at time zone 'America/Guatemala')::date);
 if (state->>'balance')::numeric<>863.25 then raise exception 'Recovered balance changed';end if;
 perform public.save_transaction_once(h,current_setting('qa.connected.request')::uuid,current_setting('qa.connected.values')::jsonb);
 if (select count(*) from public.transactions where household_id=h)<>3 then raise exception 'Restored request duplicated';end if;
 r:=public.restore_household_backup_missing(current_setting('qa.connected.backup')::uuid);
 if (r->>'restored_records')::integer<>0 then raise exception 'Second recovery was not idempotent: %',r;end if;
end $$;
reset role;
update platform_security.household_controls set status='archived' where household_id=current_setting('qa.connected.home')::uuid;
set local role authenticated;
do $$begin
 begin perform public.save_transaction_once(current_setting('qa.connected.home')::uuid,gen_random_uuid(),current_setting('qa.connected.values')::jsonb);raise exception 'Archived movement accepted';exception when insufficient_privilege then null;end;
 begin insert into public.household_comments(household_id,list_item_id,body) values(current_setting('qa.connected.home')::uuid,current_setting('qa.connected.item')::uuid,'Archived');raise exception 'Archived comment accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 begin perform public.save_transaction_once(gen_random_uuid(),gen_random_uuid(),'{}'::jsonb);raise exception 'Anonymous save accepted';exception when insufficient_privilege then null;end;
 begin perform public.get_household_comments_capability(gen_random_uuid());raise exception 'Anonymous comments accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'connected_experience_passed'::text outcome,not exists(select 1 from auth.users where raw_user_meta_data->>'full_name'='Connected experience rollback QA') fixtures_rolled_back;
