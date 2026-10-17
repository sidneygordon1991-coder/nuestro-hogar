-- Finance alerts (budget pace, unusual expense, credit card due), settlements in backups and
-- private movements kept out of every backup. Synthetic identities; everything is rolled back.
begin;
select set_config('qa.fa.owner',gen_random_uuid()::text,true);
select set_config('qa.fa.teen',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('qa.fa.'||kind)::uuid,'qa-'||current_setting('qa.fa.'||kind)||'@example.invalid','{"full_name":"Rollback QA"}'::jsonb
from unnest(array['owner','teen']) kind;
select set_config('request.jwt.claim.sub',current_setting('qa.fa.owner'),true);
select set_config('qa.fa.hh',public.create_household('QA alertas v31 rollback')::text,true);
-- A teen has no finance access by default.
insert into public.household_members(household_id,user_id,role) values(current_setting('qa.fa.hh')::uuid,current_setting('qa.fa.teen')::uuid,'teen');
set local role authenticated;

-- Data, using the real "today" (Guatemala) for alerts that Inicio's refresh creates.
do $$
declare hh uuid:=current_setting('qa.fa.hh')::uuid;a uuid:=current_setting('qa.fa.owner')::uuid;
 v_today date:=(now() at time zone 'America/Guatemala')::date;v_month date:=date_trunc('month',(now() at time zone 'America/Guatemala'))::date;
 pets uuid;pharmacy uuid;books uuid;travel uuid;visa uuid;master uuid;amex uuid;personal uuid;r uuid;o uuid;i int;
begin
 insert into public.budget_categories(household_id,name,budget_group) values(hh,'QA Mascotas','variable') returning id into pets;
 insert into public.budget_categories(household_id,name,budget_group) values(hh,'QA Farmacia','variable') returning id into pharmacy;
 insert into public.budget_categories(household_id,name,budget_group) values(hh,'QA Libros','variable') returning id into books;
 insert into public.budget_categories(household_id,name,budget_group) values(hh,'QA Viajes','variable') returning id into travel;
 for i in 0..2 loop
  insert into public.transactions(household_id,description,amount,type,transaction_date,category_id,paid_by) values
   (hh,'Concentrado',100+i*10,'expense',(v_month-interval '1 month')::date+i,pets,a),
   (hh,'Medicina',100,'expense',(v_month-interval '2 months')::date+i,pharmacy,a),
   (hh,'Bus',100,'expense',(v_month-interval '3 months')::date+i,travel,a);
 end loop;
 insert into public.transactions(household_id,description,amount,type,transaction_date,category_id,paid_by) values
  (hh,'Novela',50,'expense',(v_month-interval '1 month')::date,books,a),(hh,'Cuento',50,'expense',(v_month-interval '1 month')::date+1,books,a);
 -- Unusual: 900 vs average 110 (>= 2x and >= +300).
 insert into public.transactions(household_id,description,amount,type,transaction_date,category_id,paid_by) values(hh,'Veterinario',900,'expense',v_today,pets,a);
 perform set_config('qa.fa.unusual',(select id::text from public.transactions where household_id=hh and description='Veterinario'),true);
 -- Not unusual: 2.5x but only Q 150 above the average; too little history; older than 3 days.
 insert into public.transactions(household_id,description,amount,type,transaction_date,category_id,paid_by) values
  (hh,'Vitaminas',250,'expense',v_today,pharmacy,a),(hh,'Enciclopedia',1000,'expense',v_today-1,books,a),(hh,'Boletos',2000,'expense',v_today-3,travel,a);

 -- Credit cards (liabilities). Visa: due in 2 days, balance 1500 - 200 income - 300 payment = 1000.
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance,payment_due_day,minimum_payment)
  values(hh,'Visa','credit','liability',0,extract(day from v_today+2)::int,250) returning id into visa;
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance) values(hh,'Banco QA','checking','asset',5000) returning id into master;
 insert into public.transactions(household_id,description,amount,type,transaction_date,account_id,paid_by) values
  (hh,'Compras con tarjeta',1500,'expense',v_today-1,visa,a),(hh,'Reembolso',200,'income',v_today-1,visa,a),
  (hh,'Cargo futuro',5000,'expense',v_today+1,visa,a);
 insert into public.finance_transfers(household_id,from_account_id,to_account_id,amount,transfer_date) values(hh,master,visa,300,v_today);
 -- Due in 10 days (outside the window), paid off, and a personal card that only alerts its owner.
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance,payment_due_day) values(hh,'Mastercard','credit','liability',800,extract(day from v_today+10)::int);
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance,payment_due_day) values(hh,'Amex','credit','liability',400,extract(day from v_today+1)::int) returning id into amex;
 insert into public.finance_transfers(household_id,from_account_id,to_account_id,amount,transfer_date) values(hh,master,amex,400,v_today-1);
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance,payment_due_day,is_shared,owner_user_id)
  values(hh,'Personal','credit','liability',600,extract(day from v_today+1)::int,false,a) returning id into personal;
 insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance,payment_due_day,active)
  values(hh,'Vieja','credit','liability',600,extract(day from v_today+1)::int,false);
 perform set_config('qa.fa.visa',visa::text,true);perform set_config('qa.fa.personal',personal::text,true);

 -- Recurring expense due tomorrow: already covered by the existing 'payment-upcoming-' alert.
 insert into public.recurring_transactions(household_id,description,amount,type,due_day,category_id) values(hh,'Internet QA',350,'expense',extract(day from v_today+1)::int,pets) returning id into r;
 insert into public.recurring_transaction_occurrences(recurring_transaction_id,household_id,period_month,due_date,status)
  values(r,hh,date_trunc('month',v_today+1)::date,v_today+1,'pending') returning id into o;
 perform set_config('qa.fa.occurrence',o::text,true);

 -- The internal generator is not callable by clients.
 begin perform public.refresh_finance_alerts(hh);raise exception 'Client called refresh_finance_alerts';exception when insufficient_privilege then null;end;

 perform public.refresh_my_notifications(hh);
end $$;

-- Owner: alerts created once, with the expected text; a second refresh adds nothing.
do $$
declare hh uuid:=current_setting('qa.fa.hh')::uuid;v_today date:=(now() at time zone 'America/Guatemala')::date;before int;n int;row public.notifications;
begin
 select count(*) into before from public.notifications where household_id=hh;
 perform public.refresh_my_notifications(hh);
 perform public.refresh_my_notifications(hh);
 select count(*) into n from public.notifications where household_id=hh;
 if n<>before then raise exception 'Refresh duplicated notifications: % -> %',before,n;end if;

 select count(*) into n from public.notifications where household_id=hh and dedupe_key like 'finance-unusual-expense-%';
 if n<>1 then raise exception 'Expected one unusual expense alert, got %',n;end if;
 select * into row from public.notifications where household_id=hh and dedupe_key='finance-unusual-expense-'||current_setting('qa.fa.unusual');
 if row.id is null or row.title<>'Gasto inusual en QA Mascotas' or row.severity<>'info' or row.type<>'budget' or row.action_tab<>'presupuesto:transactions'
  or row.body<>'Veterinario · Q 900. Lo usual en esta categoría es Q 110' then raise exception 'Unusual alert wrong: % / %',row.title,row.body;end if;

 select count(*) into n from public.notifications where household_id=hh and dedupe_key like 'finance-card-due-%';
 if n<>2 then raise exception 'Expected Visa and personal card alerts, got %',n;end if;
 select * into row from public.notifications where household_id=hh and dedupe_key='finance-card-due-'||current_setting('qa.fa.visa')||'-'||(v_today+2)::text;
 if row.id is null or row.title<>'Paga tu tarjeta Visa antes del '||extract(day from v_today+2)::int or row.severity<>'warning' or row.action_tab<>'presupuesto:accounts'
  or row.body not like 'Saldo de Q 1,000 · pago mínimo Q 250 · vence el '||extract(day from v_today+2)::int||' de %' then raise exception 'Card alert wrong: % / %',row.title,row.body;end if;
 if not exists(select 1 from public.notifications where household_id=hh and dedupe_key like 'finance-card-due-'||current_setting('qa.fa.personal')||'-%') then raise exception 'Personal card owner not alerted';end if;

 -- No budget pace alert today: no plan exists for the current month.
 if exists(select 1 from public.notifications where household_id=hh and dedupe_key like 'finance-budget-pace-%') then raise exception 'Unexpected budget pace alert';end if;
 -- Recurring due tomorrow keeps its single existing alert.
 if (select count(*) from public.notifications where household_id=hh and entity_id=current_setting('qa.fa.occurrence')::uuid)<>1 then raise exception 'Recurring due tomorrow not notified exactly once';end if;
end $$;

-- Budget pace on fixed dates (internal entry point, as the scheduler/role owner).
do $$
declare hh uuid:=current_setting('qa.fa.hh')::uuid;a uuid:=current_setting('qa.fa.owner')::uuid;super uuid;saving uuid;pharmacy uuid;clothes uuid;april uuid;
begin
 insert into public.budget_categories(household_id,name,budget_group) values(hh,'QA Supermercado','variable') returning id into super;
 insert into public.budget_categories(household_id,name,budget_group) values(hh,'QA Ahorro','saving') returning id into saving;
 insert into public.budget_categories(household_id,name,budget_group) values(hh,'QA Botiquín','variable') returning id into pharmacy;
 insert into public.budget_categories(household_id,name,budget_group) values(hh,'QA Ropa','variable') returning id into clothes;
 insert into public.budget_categories(household_id,name,budget_group) values(hh,'QA Abril','variable') returning id into april;
 insert into public.budget_allocations(household_id,category_id,month,planned_amount) values
  (hh,super,'2098-03-01',6000),(hh,saving,'2098-03-01',1000),(hh,pharmacy,'2098-03-01',1000),(hh,clothes,'2098-03-01',1000),(hh,april,'2098-04-01',1000);
 insert into public.transactions(household_id,description,amount,type,transaction_date,category_id,paid_by) values
  (hh,'Despensa',4920,'expense','2098-03-05',super,a),(hh,'Depósito',900,'expense','2098-03-05',saving,a),
  (hh,'Curitas',700,'expense','2098-03-05',pharmacy,a),(hh,'Zapatos',950,'expense','2098-03-05',clothes,a),
  (hh,'Chumpa',850,'expense','2098-04-02',april,a);
 perform set_config('qa.fa.super',super::text,true);perform set_config('qa.fa.saving',saving::text,true);
 perform set_config('qa.fa.pharmacy',pharmacy::text,true);perform set_config('qa.fa.clothes',clothes::text,true);perform set_config('qa.fa.april',april::text,true);
end $$;
reset role;
-- The general 90% alert already exists for Ropa: no second alert for the same category and month.
insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
values(current_setting('qa.fa.hh')::uuid,current_setting('qa.fa.owner')::uuid,'budget','warning','Presupuesto cerca del límite','QA Ropa · 95% usado','presupuesto','budget_category',
 current_setting('qa.fa.clothes')::uuid,'budget-90-2098-03-01-'||current_setting('qa.fa.clothes'),'2098-05-01');
do $$
declare hh uuid:=current_setting('qa.fa.hh')::uuid;a uuid:=current_setting('qa.fa.owner')::uuid;t uuid:=current_setting('qa.fa.teen')::uuid;row public.notifications;n int;
begin
 perform public.refresh_finance_alerts(hh,'2098-03-10');
 perform public.refresh_finance_alerts(hh,'2098-03-10');
 perform public.refresh_finance_alerts(hh,'2098-03-19');
 select * into row from public.notifications where user_id=a and dedupe_key='finance-budget-pace-2098-03-01-'||current_setting('qa.fa.super');
 if row.id is null or row.title<>'QA Supermercado va al 82%' or row.body<>'Quedan Q 1,080 para el mes' or row.severity<>'warning' or row.action_tab<>'presupuesto:budget' then
  raise exception 'Budget pace alert wrong: % / %',row.title,row.body;end if;
 select count(*) into n from public.notifications where user_id=a and dedupe_key like 'finance-budget-pace-%';
 if n<>1 then raise exception 'Expected only the Supermercado pace alert (saving, 70%% and already-alerted excluded), got %',n;end if;
 -- Day 20 or later: no early warning; day 19: yes.
 perform public.refresh_finance_alerts(hh,'2098-04-20');
 if exists(select 1 from public.notifications where dedupe_key like 'finance-budget-pace-2098-04-01-%') then raise exception 'Pace alert created on day 20';end if;
 perform public.refresh_finance_alerts(hh,'2098-04-19');
 if (select count(*) from public.notifications where user_id=a and dedupe_key='finance-budget-pace-2098-04-01-'||current_setting('qa.fa.april'))<>1 then raise exception 'Pace alert missing on day 19';end if;
 -- The teen (no finance access) never receives finance alerts.
 if exists(select 1 from public.notifications where user_id=t and dedupe_key like 'finance-%') then raise exception 'Finance alert created for a member without finance access';end if;
 -- A household that disabled budget alerts gets no pace alert.
 update public.household_automation_rules set enabled=false where household_id=hh and rule_key='budget_limit_alert';
 if not found then insert into public.household_automation_rules(household_id,rule_key,enabled) values(hh,'budget_limit_alert',false);end if;
 delete from public.notifications where dedupe_key like 'finance-budget-pace-%';
 perform public.refresh_finance_alerts(hh,'2098-03-10');
 if exists(select 1 from public.notifications where dedupe_key like 'finance-budget-pace-%') then raise exception 'Pace alert ignored the disabled budget rule';end if;
 update public.household_automation_rules set enabled=true where household_id=hh and rule_key='budget_limit_alert';
end $$;
-- Finance view access (not edit) is enough to receive the alerts; personal cards stay with their owner.
insert into public.household_member_access(household_id,user_id,module,access_level) values(current_setting('qa.fa.hh')::uuid,current_setting('qa.fa.teen')::uuid,'finance','view');
select set_config('request.jwt.claim.sub',current_setting('qa.fa.teen'),true);
set local role authenticated;
do $$
declare hh uuid:=current_setting('qa.fa.hh')::uuid;n int;
begin
 perform public.refresh_my_notifications(hh);
 perform public.refresh_my_notifications(hh);
 select count(*) into n from public.notifications where household_id=hh and user_id=auth.uid() and dedupe_key like 'finance-%';
 if n<>2 then raise exception 'Viewer should see unusual expense and shared card alerts once each, got %',n;end if;
 if exists(select 1 from public.notifications where user_id=auth.uid() and dedupe_key like 'finance-card-due-'||current_setting('qa.fa.personal')||'-%') then raise exception 'Personal card alerted another member';end if;
end $$;
reset role;
select public.refresh_finance_alerts(current_setting('qa.fa.hh')::uuid,'2098-03-10');
do $$begin
 if not exists(select 1 from public.notifications where user_id=current_setting('qa.fa.teen')::uuid and dedupe_key='finance-budget-pace-2098-03-01-'||current_setting('qa.fa.clothes')) then raise exception 'Viewer missing Ropa pace alert';end if;
end$$;
-- Losing finance access hides section tabs ('presupuesto:...') as well.
update public.household_member_access set access_level='none' where household_id=current_setting('qa.fa.hh')::uuid and user_id=current_setting('qa.fa.teen')::uuid and module='finance';
set local role authenticated;
do $$begin
 if exists(select 1 from public.notifications where household_id=current_setting('qa.fa.hh')::uuid and action_tab like 'presupuesto%') then raise exception 'Finance alerts visible without finance access';end if;
end$$;

-- Backups: settlements round trip; private movements never included.
select set_config('request.jwt.claim.sub',current_setting('qa.fa.owner'),true);
do $$
declare hh uuid:=current_setting('qa.fa.hh')::uuid;a uuid:=current_setting('qa.fa.owner')::uuid;t uuid:=current_setting('qa.fa.teen')::uuid;s uuid;snap jsonb;backup uuid;restored jsonb;imported uuid;
begin
 insert into public.finance_settlements(household_id,from_user_id,to_user_id,amount,period_month,note,created_by)
  values(hh,t,a,450,date_trunc('month',current_date)::date,'QA liquidación',a) returning id into s;
 insert into public.private_transactions(household_id,description,amount,type) values(hh,'QA privado secreto',300,'expense');
 snap:=public.build_household_backup_snapshot(hh);
 if jsonb_array_length(snap->'tables'->'finance_settlements')<>1 or snap->'tables'->'finance_settlements'->0->>'id'<>s::text then raise exception 'Settlement missing from snapshot';end if;
 if snap->'tables' ? 'private_transactions' or position('QA privado secreto' in snap::text)>0 then raise exception 'Private movement leaked into snapshot';end if;
 snap:=public.build_household_file_backup(hh);
 if jsonb_array_length(snap->'tables'->'finance_settlements')<>1 or position('QA privado secreto' in snap::text)>0 then raise exception 'File backup wrong';end if;
 backup:=public.create_household_backup(hh,'QA alertas rollback');
 if ((select counts->'by_table'->>'finance_settlements' from public.household_backups where id=backup))<>'1' then raise exception 'Backup counts miss settlements';end if;
 delete from public.finance_settlements where id=s;
 restored:=public.restore_household_backup_missing(backup);
 if (restored->'by_table'->>'finance_settlements')::int<>1 or not exists(select 1 from public.finance_settlements where id=s and amount=450 and note='QA liquidación') then raise exception 'Settlement not restored: %',restored;end if;
 restored:=public.restore_household_backup_missing(backup);
 if (restored->'by_table'->>'finance_settlements')::int<>0 then raise exception 'Settlement restored twice';end if;
 -- A crafted import carrying private movements is stored without them.
 imported:=public.import_household_backup(hh,jsonb_set(snap,'{tables,private_transactions}',jsonb_build_array(jsonb_build_object('household_id',hh,'description','QA importado privado'))),'QA import rollback');
 if exists(select 1 from public.household_backups where id=imported and (snapshot->'tables' ? 'private_transactions' or counts->'by_table' ? 'private_transactions')) then raise exception 'Import kept private movements';end if;
end $$;
reset role;
do $$
declare hh uuid:=current_setting('qa.fa.hh')::uuid;n int;
begin
 begin perform public.household_backup_rows(hh,'private_transactions');raise exception 'Private rows exported';exception when raise_exception then if sqlerrm<>'Backup table not allowed' then raise;end if;end;
 begin perform public.restore_backup_table_missing(hh,'private_transactions','[]'::jsonb);raise exception 'Private rows restorable';exception when raise_exception then if sqlerrm<>'Restore table not allowed' then raise;end if;end;
 -- Settlements involving someone who is no longer a member are skipped, not fatal.
 n:=public.restore_backup_table_missing(hh,'finance_settlements',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'household_id',hh,
  'from_user_id',gen_random_uuid(),'to_user_id',current_setting('qa.fa.owner'),'amount',10,'settled_on',current_date,'period_month',date_trunc('month',current_date)::date,'created_at',now())));
 if n<>0 then raise exception 'Settlement with a former member restored';end if;
end $$;
select true as finance_alerts_v31_passed;
rollback;
