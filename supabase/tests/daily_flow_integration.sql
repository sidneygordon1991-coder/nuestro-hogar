-- Real schema/RLS integration. All fixtures and Auth identities roll back.
begin;
select set_config('qa.daily.owner',gen_random_uuid()::text,true);
select set_config('qa.daily.other',gen_random_uuid()::text,true);
select set_config('qa.daily.reader',gen_random_uuid()::text,true);
select set_config('qa.daily.outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('qa.daily.'||kind)::uuid,'qa-'||current_setting('qa.daily.'||kind)||'@example.invalid','{"full_name":"Daily flow rollback QA"}'::jsonb
from unnest(array['owner','other','reader','outsider']) kind;
select set_config('request.jwt.claim.sub',current_setting('qa.daily.owner'),true);
select set_config('qa.daily.home',public.create_household('Daily flow rollback QA')::text,true);
insert into public.household_members(household_id,user_id,role)
values(current_setting('qa.daily.home')::uuid,current_setting('qa.daily.other')::uuid,'adult'),
(current_setting('qa.daily.home')::uuid,current_setting('qa.daily.reader')::uuid,'guest');
insert into public.household_member_access(household_id,user_id,module,access_level)
select current_setting('qa.daily.home')::uuid,current_setting('qa.daily.reader')::uuid,module,'view' from unnest(array['lists','meals']) module;
set local role authenticated;
do $$
declare h uuid:=current_setting('qa.daily.home')::uuid;day date:=(now() at time zone 'America/Guatemala')::date;
 w date:=date_trunc('week',day)::date;l uuid;p uuid;r uuid;t uuid;n uuid;dest uuid;again uuid;plan jsonb;snapshot jsonb;legacy jsonb;
begin
 insert into public.lists(household_id,title,list_type,is_pinned) values(h,'Routine QA','tasks',true) returning id into l;
 insert into public.list_items(household_id,list_id,text,due_date,assigned_to,routine_frequency,routine_members)
 values(h,l,'Rotate QA',day-15,auth.uid(),'weekly',array[auth.uid(),current_setting('qa.daily.other')::uuid]) returning id into t;
 update public.list_items set completed=true,completed_at=now() where id=t;
 select id into n from public.list_items where list_id=l and not completed;
 perform public.complete_household_list_item(h,t,true);
 if (select count(*) from public.list_items where list_id=l)<>2 or not exists(select 1 from public.list_items where id=n and not completed and due_date=day+6 and assigned_to=current_setting('qa.daily.other')::uuid) then raise exception 'Routine retry, date or rotation failed';end if;
 perform public.complete_household_list_item(h,t,false);
 perform public.complete_household_list_item(h,t,true);
 if (select count(*) from public.list_items where list_id=l)<>2 then raise exception 'Undo/recomplete duplicated routine';end if;
 update public.list_items set text='Corrected QA',notes='Keep history',routine_frequency='none' where id=n;
 if not exists(select 1 from public.list_items where id=t and completed) then raise exception 'Task edit rewrote history';end if;
 begin update public.list_items set routine_frequency='daily',routine_members=array[current_setting('qa.daily.outsider')::uuid] where id=n;raise exception 'Foreign responsible accepted';exception when check_violation then null;end;
 insert into public.pantry_items(household_id,name,quantity,unit) values(h,'Rice QA',200,'g') returning id into p;
 insert into public.recipes(household_id,name,servings) values(h,'Rice recipe QA',2) returning id into r;
 insert into public.recipe_ingredients(household_id,recipe_id,pantry_item_id,ingredient_name,quantity,unit) values(h,r,p,'Rice QA',0.5,'kg');
 insert into public.meal_plan_entries(household_id,meal_date,meal_type,recipe_id,servings) values(h,w,'dinner',r,2),(h,w+1,'dinner',r,2);
 plan:=public.get_weekly_shopping_plan(h,w);
 if jsonb_array_length(plan->'rows')<>1 or (plan->'rows'->0->>'missing')::numeric<>800 then raise exception 'Weekly aggregation failed';end if;
 dest:=public.sync_weekly_shopping_plan(h,w,plan->>'fingerprint');again:=public.sync_weekly_shopping_plan(h,w,plan->>'fingerprint');
 if dest<>again or (select count(*) from public.list_items where shopping_week=w and household_id=h)<>1 then raise exception 'Shopping retry duplicated';end if;
 update public.list_items set completed=true where shopping_week=w and household_id=h;
 insert into public.list_items(household_id,list_id,text,notes) values(h,dest,'Manual QA','Preserve');
 update public.pantry_items set quantity=300 where id=p;
 begin perform public.sync_weekly_shopping_plan(h,w,plan->>'fingerprint');raise exception 'Stale preview accepted';exception when serialization_failure then null;end;
 plan:=public.get_weekly_shopping_plan(h,w);
 perform public.sync_weekly_shopping_plan(h,w,plan->>'fingerprint');
 if not exists(select 1 from public.list_items where list_id=dest and shopping_week=w and completed and quantity='800 g') or not exists(select 1 from public.list_items where list_id=dest and text='Manual QA' and notes='Preserve') then raise exception 'Completed or manual purchase changed';end if;
 snapshot:=public.build_household_backup_snapshot(h);
 if not exists(select 1 from jsonb_array_elements(snapshot->'tables'->'list_items') x where x->>'id'=t::text and x->>'routine_frequency'='weekly') then raise exception 'Routine fields missing in backup';end if;
 -- Simulate an old backup's missing new columns through the existing restore helper.
 select to_jsonb(x)-'is_pinned'-'shopping_week' into legacy from public.lists x where id=l;
 legacy:=legacy||jsonb_build_object('id',gen_random_uuid());
 reset role;
 perform public.restore_backup_table_missing(h,'lists',jsonb_build_array(legacy));
 set local role authenticated;
 if not exists(select 1 from public.lists where id=(legacy->>'id')::uuid and is_pinned=false) then raise exception 'Legacy list restore failed';end if;
 select to_jsonb(x)-'routine_frequency'-'routine_series_id'-'routine_members'-'shopping_week'-'shopping_key' into legacy from public.list_items x where id=n;
 legacy:=legacy||jsonb_build_object('id',gen_random_uuid());
 reset role;
 perform public.restore_backup_table_missing(h,'list_items',jsonb_build_array(legacy));
 set local role authenticated;
 if not exists(select 1 from public.list_items where id=(legacy->>'id')::uuid and routine_frequency='none' and routine_members='{}'::uuid[]) then raise exception 'Legacy item restore failed';end if;
 if exists(select 1 from public.transactions where household_id=h) then raise exception 'Shopping created financial movements';end if;
 perform set_config('qa.daily.item',n::text,true);perform set_config('qa.daily.week',w::text,true);perform set_config('qa.daily.fingerprint',plan->>'fingerprint',true);
 perform set_config('request.jwt.claim.sub',current_setting('qa.daily.reader'),true);
 if jsonb_array_length(public.get_weekly_shopping_plan(h,w)->'rows')<>1 then raise exception 'Read-only preview failed';end if;
 begin perform public.complete_household_list_item(h,n,true);raise exception 'Read-only complete accepted';exception when insufficient_privilege then null;end;
 begin perform public.sync_weekly_shopping_plan(h,w,plan->>'fingerprint');raise exception 'Read-only shopping accepted';exception when insufficient_privilege then null;end;
 update public.lists set is_pinned=false where id=l;
 if not exists(select 1 from public.lists where id=l and is_pinned) then raise exception 'Read-only direct update accepted';end if;
 perform set_config('request.jwt.claim.sub',current_setting('qa.daily.outsider'),true);
 if exists(select 1 from public.list_items where household_id=h) then raise exception 'Household RLS failed';end if;
 begin perform public.get_weekly_shopping_plan(h,w);raise exception 'Outsider preview accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
update platform_security.household_controls set status='archived' where household_id=current_setting('qa.daily.home')::uuid;
select set_config('request.jwt.claim.sub',current_setting('qa.daily.owner'),true);
set local role authenticated;
do $$begin
 begin perform public.complete_household_list_item(current_setting('qa.daily.home')::uuid,current_setting('qa.daily.item')::uuid,true);raise exception 'Archived completion accepted';exception when insufficient_privilege then null;end;
 begin perform public.sync_weekly_shopping_plan(current_setting('qa.daily.home')::uuid,current_setting('qa.daily.week')::date,current_setting('qa.daily.fingerprint'));raise exception 'Archived shopping accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 begin perform public.get_weekly_shopping_plan(gen_random_uuid(),current_date);raise exception 'Anonymous preview accepted';exception when insufficient_privilege then null;end;
 begin perform public.complete_household_list_item(gen_random_uuid(),gen_random_uuid(),true);raise exception 'Anonymous completion accepted';exception when insufficient_privilege then null;end;
 begin perform public.sync_weekly_shopping_plan(gen_random_uuid(),current_date,'x');raise exception 'Anonymous shopping accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select true as real_schema_routines_weekly_shopping_permissions_and_legacy_restore_passed;
rollback;
