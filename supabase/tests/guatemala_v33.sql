-- v33 Guatemala: card installments, mesadas and private pay profiles. Synthetic identities; everything is rolled back.
-- Run in the SQL editor of the TEST project (never production) after applying 20261018140000.
begin;
select set_config('qa.gt.'||kind,gen_random_uuid()::text,true) from unnest(array['owner','adult','teen']) kind;
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('qa.gt.'||kind)::uuid,'qa-'||current_setting('qa.gt.'||kind)||'@example.invalid','{"full_name":"Rollback QA"}'::jsonb
from unnest(array['owner','adult','teen']) kind;
select set_config('request.jwt.claim.sub',current_setting('qa.gt.owner'),true);
select set_config('qa.gt.hh',public.create_household('QA Guatemala v33 rollback')::text,true);
insert into public.household_members(household_id,user_id,role) values
 (current_setting('qa.gt.hh')::uuid,current_setting('qa.gt.adult')::uuid,'adult'),
 (current_setting('qa.gt.hh')::uuid,current_setting('qa.gt.teen')::uuid,'teen');
insert into public.household_member_access(household_id,user_id,module,access_level)
values(current_setting('qa.gt.hh')::uuid,current_setting('qa.gt.teen')::uuid,'finance','none')
on conflict (household_id,user_id,module) do update set access_level='none';
insert into public.finance_accounts(household_id,name,account_type,account_class,opening_balance)
values(current_setting('qa.gt.hh')::uuid,'QA tarjeta','credit','liability',0),
      (current_setting('qa.gt.hh')::uuid,'QA dólares','savings','asset',7750);

set local role authenticated;

-- Owner: installments only on credit cards; dollar accounts keep their dollars.
do $$
declare hh uuid:=current_setting('qa.gt.hh')::uuid;card uuid;usd uuid;
begin
 select id into card from public.finance_accounts where household_id=hh and name='QA tarjeta';
 select id into usd from public.finance_accounts where household_id=hh and name='QA dólares';
 insert into public.card_installments(household_id,account_id,kind,description,principal,months,first_statement)
 values(hh,card,'visacuotas','QA refrigeradora',6000,12,date '2026-09-05');
 begin
  insert into public.card_installments(household_id,account_id,kind,description,principal,months,first_statement)
  values(hh,usd,'visacuotas','QA no es tarjeta',100,3,current_date);
  raise exception 'Installment accepted on a non-card account';
 exception when check_violation then null;end;
 begin
  insert into public.card_installments(household_id,account_id,kind,description,principal,months,annual_rate,first_statement)
  values(hh,card,'visacuotas','QA visacuotas con interés',100,3,12,current_date);
  raise exception 'Visacuotas accepted an interest rate';
 exception when check_violation then null;end;
 update public.finance_accounts set currency='USD',opening_balance_usd=1000 where id=usd;
 begin
  update public.finance_accounts set opening_balance_usd=5 where id=card;
  raise exception 'Quetzal account accepted a dollar opening balance';
 exception when check_violation then null;end;
end $$;

-- Mesada: pay a payday atomically (movement + jars), never twice; withdrawals cannot exceed savings.
do $$
declare hh uuid:=current_setting('qa.gt.hh')::uuid;a uuid;p uuid;r record;
begin
 insert into public.allowances(household_id,child_name,child_user_id,amount,frequency,start_date,save_percent,give_percent,goal_name,goal_amount)
 values(hh,'QA Sofía',current_setting('qa.gt.teen')::uuid,33.33,'weekly',date '2026-10-03',33,33,'Audífonos',300) returning id into a;
 p:=public.pay_allowance(a,date '2026-10-03');
 select * into r from public.allowance_payments where id=p;
 if (r.spend_amount,r.save_amount,r.give_amount)<>(11.35::numeric,10.99::numeric,10.99::numeric) then raise exception 'Jar split differs from the app: %',r;end if;
 if not exists(select 1 from public.transactions t where t.id=r.transaction_id and t.amount=33.33 and t.type='expense') then raise exception 'Mesada movement missing';end if;
 begin perform public.pay_allowance(a,date '2026-10-03');raise exception 'Payday paid twice';
 exception when unique_violation then null;end;
 perform public.pay_allowance(a,date '2026-10-10',false);
 if (select count(*) from public.transactions where description='Mesada de QA Sofía')<>1 then raise exception 'Unrequested movement created';end if;
 begin
  insert into public.allowance_payments(household_id,allowance_id,kind,paid_on,save_amount) values(hh,a,'withdrawal',current_date,25);
  raise exception 'Withdrawal above savings accepted';
 exception when check_violation then null;end;
 insert into public.allowance_payments(household_id,allowance_id,kind,paid_on,save_amount) values(hh,a,'withdrawal',current_date,20);
 begin
  delete from public.allowance_payments where allowance_id=a;
  raise exception 'The jar ledger can be erased directly';
 exception when insufficient_privilege then null;end;
 begin
  update public.allowance_payments set save_amount=1000 where allowance_id=a;
  raise exception 'The jar ledger can be rewritten directly';
 exception when insufficient_privilege then null;end;
end $$;

-- Owner's salary is private.
insert into public.pay_profiles(household_id,salary,start_date) values(current_setting('qa.gt.hh')::uuid,10000,date '2024-02-01');

-- Teen without finance access: sees only their own mesada; no cards, no salaries; cannot pay themselves.
select set_config('request.jwt.claim.sub',current_setting('qa.gt.teen'),true);
do $$
declare hh uuid:=current_setting('qa.gt.hh')::uuid;
begin
 if (select count(*) from public.allowances)<>1 then raise exception 'Teen cannot see their mesada';end if;
 if (select count(*) from public.allowance_payments)<>3 then raise exception 'Teen cannot see their jars';end if;
 if exists(select 1 from public.card_installments) then raise exception 'Teen sees card installments';end if;
 if exists(select 1 from public.pay_profiles) then raise exception 'Teen sees a salary';end if;
 begin perform public.pay_allowance((select id from public.allowances limit 1),date '2026-10-17');raise exception 'Teen paid a mesada';
 exception when insufficient_privilege then null;end;
 update public.allowances set amount=1000;
 if (select amount from public.allowances limit 1)<>33.33 then raise exception 'Teen changed their mesada';end if;
end $$;

-- Another adult with finance access: sees cards and mesadas, never the owner's salary.
select set_config('request.jwt.claim.sub',current_setting('qa.gt.adult'),true);
do $$
begin
 if (select count(*) from public.card_installments)<>1 then raise exception 'Adult cannot see installments';end if;
 if exists(select 1 from public.pay_profiles) then raise exception 'Adult sees another member''s salary';end if;
 update public.pay_profiles set salary=1;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.gt.owner'),true);
do $$ begin if (select salary from public.pay_profiles)<>10000 then raise exception 'Salary changed by someone else';end if;end $$;

-- Backups: installments and mesadas are in the snapshot; salaries are not. Missing-only restore brings them back.
reset role;
do $$
declare hh uuid:=current_setting('qa.gt.hh')::uuid;snap jsonb;b uuid;res jsonb;
begin
 snap:=public.build_household_backup_snapshot(hh);
 if not (snap->'tables' ? 'card_installments' and snap->'tables' ? 'allowances' and snap->'tables' ? 'allowance_payments') then raise exception 'Backup misses Guatemala tables';end if;
 if snap->'tables' ? 'pay_profiles' or snap::text like '%10000.00%' and snap::text like '%2024-02-01%' then raise exception 'Backup includes a salary';end if;
 insert into public.household_backups(household_id,name,snapshot) values(hh,'QA',snap) returning id into b;
 delete from public.allowances where household_id=hh;
 delete from public.card_installments where household_id=hh;
 res:=public.restore_household_backup_missing(b);
 if (select count(*) from public.allowance_payments where household_id=hh)<>3 or (select count(*) from public.card_installments where household_id=hh)<>1 then
  raise exception 'Restore incomplete: %',res;
 end if;
 -- A backup from before v33 has no currency columns: restoring it must still work.
 snap:=jsonb_set(snap,'{tables,finance_accounts}',(select jsonb_agg(a-'currency'-'opening_balance_usd') from jsonb_array_elements(snap->'tables'->'finance_accounts') a));
 delete from public.finance_accounts where household_id=hh and name='QA dólares';
 insert into public.household_backups(household_id,name,snapshot) values(hh,'QA v32',snap) returning id into b;
 perform public.restore_household_backup_missing(b);
 if (select currency from public.finance_accounts where household_id=hh and name='QA dólares')<>'GTQ' then raise exception 'Old backup did not restore the account';end if;
end $$;
rollback;
