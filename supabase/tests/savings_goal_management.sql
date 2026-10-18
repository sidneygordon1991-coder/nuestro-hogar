-- Synthetic identities only; run in an isolated test database. All changes roll back.
begin;
select set_config('qa.goal.owner',gen_random_uuid()::text,true),set_config('qa.goal.reader',gen_random_uuid()::text,true),set_config('qa.goal.outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('qa.goal.'||r)::uuid,'goal-'||current_setting('qa.goal.'||r)||'@example.invalid','{"full_name":"Goal QA"}'::jsonb from unnest(array['owner','reader','outsider']) r;
select set_config('request.jwt.claim.sub',current_setting('qa.goal.owner'),true);
select set_config('qa.goal.hh',public.create_household('Goal QA rollback')::text,true);
insert into public.household_members(household_id,user_id,role) values(current_setting('qa.goal.hh')::uuid,current_setting('qa.goal.reader')::uuid,'adult');
insert into public.household_member_access(household_id,user_id,module,access_level) values(current_setting('qa.goal.hh')::uuid,current_setting('qa.goal.reader')::uuid,'finance','view') on conflict(household_id,user_id,module) do update set access_level='view';
set local role authenticated;
do $$ declare h uuid:=current_setting('qa.goal.hh')::uuid;g uuid;empty_goal uuid;terms jsonb;old_terms jsonb;begin
 insert into public.savings_goals(household_id,name,target_amount,target_date) values(h,'Fondo QA',50000,date '2027-12-31') returning id into g;
 perform set_config('qa.goal.id',g::text,true);
 terms:=jsonb_build_object('name','Fondo QA','target_amount',50000,'target_date','2027-12-31','active',true);
 old_terms:=terms;
 perform public.manage_savings_goal(h,g,'edit',terms,'{"name":"Reserva QA","target_amount":40000,"target_date":"2027-06-30"}');
 if not exists(select 1 from public.savings_goals where id=g and name='Reserva QA' and target_amount=40000 and target_date=date '2027-06-30') then raise exception 'Edit not applied';end if;
 begin perform public.manage_savings_goal(h,g,'edit',old_terms,'{"name":"Stale","target_amount":1}');raise exception 'Stale edit accepted';exception when serialization_failure then null;end;
 select jsonb_build_object('name',name,'target_amount',target_amount,'target_date',target_date,'active',active) into terms from public.savings_goals where id=g;
 begin perform public.manage_savings_goal(h,g,null,terms);raise exception 'Null action accepted';exception when check_violation then null;end;
 begin perform public.manage_savings_goal(h,g,'edit',terms,'{"name":"","target_amount":0}');raise exception 'Invalid goal accepted';exception when check_violation then null;end;
 perform public.save_savings_entry(h,g,gen_random_uuid(),100,'deposit',date '2000-01-01');
 perform public.save_savings_entry(h,g,gen_random_uuid(),100,'withdrawal',date '2000-01-01');
 -- Even a zero NET balance retains history, so deletion cannot cascade away its entries.
 begin perform public.manage_savings_goal(h,g,'delete',terms);raise exception 'Goal with history deleted';exception when restrict_violation then null;end;
 begin delete from public.savings_goals where id=g;raise exception 'Direct delete bypassed protection';exception when restrict_violation then null;end;
 perform public.manage_savings_goal(h,g,'archive',terms);
 if (select active from public.savings_goals where id=g) or (select count(*) from public.goal_contributions where goal_id=g)<>2 then raise exception 'Archive lost history';end if;
 if not exists(select 1 from jsonb_array_elements(public.build_household_backup_snapshot(h)->'tables'->'savings_goals') row where row->>'id'=g::text and row->>'active'='false') then raise exception 'Archived goal missing from backup';end if;
 select jsonb_build_object('name',name,'target_amount',target_amount,'target_date',target_date,'active',active) into terms from public.savings_goals where id=g;
 perform public.manage_savings_goal(h,g,'restore',terms);
 if not (select active from public.savings_goals where id=g) then raise exception 'Restore failed';end if;
 select jsonb_build_object('name',name,'target_amount',target_amount,'target_date',target_date,'active',active) into terms from public.savings_goals where id=g;
 perform public.manage_savings_goal(h,g,'edit',terms,'{"name":"Reserva final QA","target_amount":30000,"target_date":null}');
 if (select array_agg(amount order by amount) from public.goal_contributions where goal_id=g)<>array[-100,100]::numeric[] then raise exception 'Editing goal changed financial entries';end if;
 insert into public.savings_goals(household_id,name,target_amount) values(h,'Vacía',10) returning id into empty_goal;
 terms:='{"name":"Vacía","target_amount":10,"target_date":null,"active":true}';
 perform public.manage_savings_goal(h,empty_goal,'delete',terms);
 perform public.manage_savings_goal(h,empty_goal,'delete',terms);
 if exists(select 1 from public.savings_goals where id=empty_goal) then raise exception 'Empty goal not deleted';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.goal.reader'),true);
do $$ begin
 begin perform public.manage_savings_goal(current_setting('qa.goal.hh')::uuid,current_setting('qa.goal.id')::uuid,'delete','{}');raise exception 'Viewer managed goals';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.goal.outsider'),true);
do $$ begin
 begin perform public.manage_savings_goal(current_setting('qa.goal.hh')::uuid,current_setting('qa.goal.id')::uuid,'delete','{}');raise exception 'Outsider managed goals';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.savings_goals where household_id=current_setting('qa.goal.hh')::uuid) then raise exception 'Outsider sees goals';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.goal.owner'),true);
-- Cross-module links must not be silently removed, even if no money has been contributed.
do $$ declare h uuid:=current_setting('qa.goal.hh')::uuid;g uuid;c uuid;begin
 insert into public.savings_goals(household_id,name,target_amount) values(h,'Linked',10) returning id into g;
 insert into public.household_planning_goals(household_id,title,goal_type,target_date,linked_savings_goal_id) values(h,'Linked plan QA','other',current_date+30,g);
 begin delete from public.savings_goals where id=g;raise exception 'Planning link lost';exception when restrict_violation then null;end;
 insert into public.savings_goals(household_id,name,target_amount) values(h,'Budget linked',10) returning id into g;
 insert into public.budget_categories(household_id,name,icon,budget_group) values(h,'Linked goal QA','saving','saving') returning id into c;
 insert into public.goal_budget_links(household_id,goal_id,category_id,month) values(h,g,c,date_trunc('month',current_date)::date);
 begin delete from public.savings_goals where id=g;raise exception 'Budget link lost';exception when restrict_violation then null;end;
end $$;
set local role anon;
do $$ begin
 begin perform public.manage_savings_goal(current_setting('qa.goal.hh')::uuid,current_setting('qa.goal.id')::uuid,'delete','{}');raise exception 'Anonymous managed goals';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
