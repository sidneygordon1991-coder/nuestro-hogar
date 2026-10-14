-- Real role/RLS/quota integration tests; all fixtures and operations roll back.
begin;
do $$
declare master_uid uuid:=gen_random_uuid();owner_uid uuid:=gen_random_uuid();guest_uid uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();ta uuid:=gen_random_uuid();tb uuid:=gen_random_uuid();
begin
 perform set_config('platform_qa.master',master_uid::text,true);perform set_config('platform_qa.owner',owner_uid::text,true);perform set_config('platform_qa.guest',guest_uid::text,true);perform set_config('platform_qa.a',a::text,true);perform set_config('platform_qa.b',b::text,true);perform set_config('platform_qa.ta',ta::text,true);perform set_config('platform_qa.tb',tb::text,true);
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(master_uid,'platform-qa-'||master_uid||'@example.invalid',now(),'{"full_name":"Master QA"}'),(owner_uid,'platform-qa-'||owner_uid||'@example.invalid',now(),'{"full_name":"Owner QA","master":true,"role":"master"}'),(guest_uid,'platform-qa-'||guest_uid||'@example.invalid',now(),'{"full_name":"Guest QA"}');
 insert into public.households(id,name,owner_id) values(a,'Platform QA rollback A',master_uid),(b,'Platform QA rollback B',owner_uid);
 insert into public.household_members(household_id,user_id,role) values(a,master_uid,'owner'),(b,owner_uid,'owner'),(b,guest_uid,'guest');
 insert into public.transactions(id,household_id,type,amount,description,paid_by) values(ta,a,'expense',123.45,'Platform QA A',master_uid),(tb,b,'expense',88.50,'Platform QA B',owner_uid);
 insert into platform_security.masters(user_id) values(master_uid);
 perform set_config('platform_qa.invite',(select invite_code from public.households where id=b),true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('platform_qa.owner'),true);
set local role authenticated;
do $$ begin
 if public.get_my_platform_access() then raise exception 'User metadata escalated to master';end if;
 begin perform public.get_platform_overview();raise exception 'Non-master read overview';exception when insufficient_privilege then null;end;
 begin perform public.get_platform_members(current_setting('platform_qa.a')::uuid);raise exception 'Non-master read members';exception when insufficient_privilege then null;end;
 begin perform public.configure_platform_household(current_setting('platform_qa.b')::uuid,1000000,'archived','Platform QA rollback B','Unauthorized');raise exception 'Non-master configured family';exception when insufficient_privilege then null;end;
 begin perform public.manage_platform_member(current_setting('platform_qa.b')::uuid,current_setting('platform_qa.guest')::uuid,'admin','Platform QA rollback B','Unauthorized');raise exception 'Non-master managed member';exception when insufficient_privilege then null;end;
 begin insert into platform_security.masters(user_id) values(auth.uid());raise exception 'Master table writable';exception when insufficient_privilege then null;end;
 begin perform public.get_my_household_storage(current_setting('platform_qa.a')::uuid);raise exception 'Other family usage leaked';exception when insufficient_privilege then null;end;
 if (public.get_my_household_storage(current_setting('platform_qa.b')::uuid)->>'quota_bytes')::bigint<>100000000 then raise exception 'Default quota missing';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('platform_qa.master'),true);
set local role authenticated;
do $$ begin
 if not public.get_my_platform_access() then raise exception 'Master missing';end if;
 if not exists(select 1 from jsonb_array_elements(public.get_platform_overview()->'households') f where f->>'id'=current_setting('platform_qa.b')) then raise exception 'Master cannot see other families';end if;
 if (select count(*) from public.transactions where household_id=current_setting('platform_qa.b')::uuid)<>0 then raise exception 'Master bypassed ordinary finance isolation';end if;
 if jsonb_array_length(public.get_platform_members(current_setting('platform_qa.b')::uuid))<>2 then raise exception 'Master member summary missing';end if;
 begin perform public.configure_platform_household(current_setting('platform_qa.b')::uuid,1000000,'active','Wrong name','QA quota');raise exception 'Incorrect confirmation accepted';exception when raise_exception then if sqlerrm='Incorrect confirmation accepted' then raise;end if;end;
 begin perform public.configure_platform_household(current_setting('platform_qa.b')::uuid,1000000000,'active','Platform QA rollback B','QA over-allocation');raise exception 'Allocated quota exceeded global capacity';exception when raise_exception then if sqlerrm='Allocated quota exceeded global capacity' then raise;end if;end;
 perform public.configure_platform_resources(current_setting('platform_qa.b')::uuid,1000000,2,'active','Platform QA rollback B','QA quota and member limit test');
 begin perform public.join_household(current_setting('platform_qa.invite'));raise exception 'Member limit bypassed';exception when raise_exception then if sqlerrm='Member limit bypassed' then raise;end if;end;
 begin perform public.manage_platform_member(current_setting('platform_qa.b')::uuid,current_setting('platform_qa.owner')::uuid,'remove','Platform QA rollback B','Remove owner');raise exception 'Owner removed';exception when raise_exception then if sqlerrm='Owner removed' then raise;end if;end;
 perform public.manage_platform_member(current_setting('platform_qa.b')::uuid,current_setting('platform_qa.guest')::uuid,'adult','Platform QA rollback B','QA role test');
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('platform_qa.owner'),true);
set local role authenticated;
do $$ declare path text:=current_setting('platform_qa.b')||'/'||current_setting('platform_qa.tb')||'/'||gen_random_uuid()||'.pdf';begin
 perform set_config('platform_qa.path',path,true);
 insert into storage.objects(bucket_id,name,owner_id,metadata) values('finance-receipts',path,auth.uid()::text,'{"size":600000}');
 if (public.get_my_household_storage(current_setting('platform_qa.b')::uuid)->>'used_bytes')::bigint<>600000 then raise exception 'Stored file not counted';end if;
 begin insert into storage.objects(bucket_id,name,owner_id,metadata) values('finance-receipts',current_setting('platform_qa.b')||'/'||current_setting('platform_qa.tb')||'/'||gen_random_uuid()||'.pdf',auth.uid()::text,'{"size":500000}');raise exception 'Quota bypassed';exception when raise_exception then if sqlerrm='Quota bypassed' then raise;end if;end;
 if (public.get_my_household_storage(current_setting('platform_qa.b')::uuid)->>'used_bytes')::bigint<>600000 then raise exception 'Failed upload consumed quota';end if;
 begin insert into storage.objects(bucket_id,name,owner_id,metadata) values('finance-receipts',current_setting('platform_qa.a')||'/'||current_setting('platform_qa.ta')||'/'||gen_random_uuid()||'.pdf',auth.uid()::text,'{"size":10}');raise exception 'Cross-family upload allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if (select member_count from platform_security.household_controls where household_id=current_setting('platform_qa.b')::uuid)<>2 then raise exception 'Failed join consumed member quota';end if;
 if (select role from public.household_members where household_id=current_setting('platform_qa.b')::uuid and user_id=current_setting('platform_qa.guest')::uuid)<>'adult' then raise exception 'Master role change failed';end if;
 -- Both buckets must spend the same quota; placeholder -> final metadata must be counted too.
 begin insert into storage.objects(bucket_id,name,owner_id,metadata) values('household-documents',current_setting('platform_qa.b')||'/household/'||gen_random_uuid()||'/qa.pdf',current_setting('platform_qa.owner'),'{"size":500000}');raise exception 'Second bucket bypassed quota';exception when raise_exception then if sqlerrm='Second bucket bypassed quota' then raise;end if;end;
 insert into storage.objects(bucket_id,name,owner_id) values('finance-receipts',current_setting('platform_qa.b')||'/'||current_setting('platform_qa.tb')||'/placeholder.pdf',current_setting('platform_qa.owner'));
 begin update storage.objects set metadata='{"size":500000}' where name=current_setting('platform_qa.b')||'/'||current_setting('platform_qa.tb')||'/placeholder.pdf';raise exception 'Final metadata bypassed quota';exception when raise_exception then if sqlerrm='Final metadata bypassed quota' then raise;end if;end;
 -- Exercise the same negative-byte accounting without bypassing Storage's delete guard.
 update storage.objects set metadata='{"size":0}' where name=current_setting('platform_qa.path');
 if (select used_bytes from platform_security.household_controls where household_id=current_setting('platform_qa.b')::uuid)<>0 then raise exception 'Reduced bytes did not release quota';end if;
 update platform_security.settings set storage_limit_bytes=storage_used_bytes+50 where id;
 begin insert into storage.objects(bucket_id,name,owner_id,metadata) values('finance-receipts',current_setting('platform_qa.a')||'/'||current_setting('platform_qa.ta')||'/'||gen_random_uuid()||'.pdf',current_setting('platform_qa.master'),'{"size":51}');raise exception 'Global quota bypassed';exception when raise_exception then if sqlerrm='Global quota bypassed' then raise;end if;end;
 update platform_security.settings set storage_limit_bytes=1000000000 where id;
end $$;
select set_config('request.jwt.claim.sub',current_setting('platform_qa.master'),true);
set local role authenticated;
select public.configure_platform_household(current_setting('platform_qa.b')::uuid,1000000,'archived','Platform QA rollback B','QA archive test');
reset role;
select set_config('request.jwt.claim.sub',current_setting('platform_qa.owner'),true);
set local role authenticated;
do $$ declare changed integer;begin
 if public.can_edit_household_module(current_setting('platform_qa.b')::uuid,'finance') or public.can_manage_household_members(current_setting('platform_qa.b')::uuid) then raise exception 'Archived edit access remains';end if;
 if (public.get_my_household_access(current_setting('platform_qa.b')::uuid)->'modules'->>'finance')<>'view' then raise exception 'Archive not read-only';end if;
 if (select count(*) from public.transactions where id=current_setting('platform_qa.tb')::uuid)<>1 then raise exception 'Archived information disappeared';end if;
 update public.transactions set amount=999 where id=current_setting('platform_qa.tb')::uuid;get diagnostics changed=row_count;if changed<>0 then raise exception 'Archived transaction changed';end if;
 begin insert into public.lists(household_id,title) values(current_setting('platform_qa.b')::uuid,'Blocked');raise exception 'Archived insert allowed';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name,owner_id,metadata) values('finance-receipts',current_setting('platform_qa.b')||'/'||current_setting('platform_qa.tb')||'/'||gen_random_uuid()||'.pdf',auth.uid()::text,'{"size":10}');raise exception 'Archived upload allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('platform_qa.master'),true);
set local role authenticated;
select public.configure_platform_household(current_setting('platform_qa.b')::uuid,1000000,'active','Platform QA rollback B','QA reactivate test');
select public.manage_platform_member(current_setting('platform_qa.b')::uuid,current_setting('platform_qa.guest')::uuid,'remove','Platform QA rollback B','QA revoke test');
reset role;
select set_config('request.jwt.claim.sub',current_setting('platform_qa.guest'),true);
set local role authenticated;
do $$ begin
 if public.is_household_member(current_setting('platform_qa.b')::uuid) then raise exception 'Removed member still has access';end if;
 if (select count(*) from public.transactions where id=current_setting('platform_qa.tb')::uuid)<>0 then raise exception 'Removed member sees finance';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('platform_qa.owner'),true);
set local role authenticated;
do $$ begin
 if not public.can_edit_household_module(current_setting('platform_qa.b')::uuid,'finance') then raise exception 'Reactivation did not restore access';end if;
 if (select amount from public.transactions where id=current_setting('platform_qa.tb')::uuid)<>88.50 then raise exception 'Admin controls changed financial data';end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from platform_security.audit where household_id=current_setting('platform_qa.b')::uuid)<>5 then raise exception 'Missing administrative audit';end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.get_platform_overview();raise exception 'Anonymous overview allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select json_build_object('passed',true,'checks',array['master authorization','metadata cannot escalate','private tables protected','family isolation','confirmed changes','owner protection','allocated quotas cannot exceed free capacity','family member limits','join RPC cannot bypass member quota','both bucket quotas','final metadata quota','failed upload rollback','global quota','quota released on reduced metadata','archive read-only','reactivation','membership revocation','unchanged finances','audit trail','anonymous denied'],'fixtures','rolled back') as result;
