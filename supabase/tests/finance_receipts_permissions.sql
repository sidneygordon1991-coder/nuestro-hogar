-- Integration regression. Every fixture and operation is rolled back.
begin;
do $$
declare owner_uid uuid:=gen_random_uuid();viewer_uid uuid:=gen_random_uuid();denied_uid uuid:=gen_random_uuid();outside_uid uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();ta uuid:=gen_random_uuid();tb uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();
begin
 perform set_config('receipt_qa.owner',owner_uid::text,true);perform set_config('receipt_qa.viewer',viewer_uid::text,true);perform set_config('receipt_qa.denied',denied_uid::text,true);perform set_config('receipt_qa.outside',outside_uid::text,true);
 perform set_config('receipt_qa.a',a::text,true);perform set_config('receipt_qa.b',b::text,true);perform set_config('receipt_qa.ta',ta::text,true);perform set_config('receipt_qa.tb',tb::text,true);perform set_config('receipt_qa.rid',rid::text,true);
 perform set_config('receipt_qa.path',a::text||'/'||ta::text||'/'||rid::text||'.pdf',true);
 insert into auth.users(id,email,raw_user_meta_data) values(owner_uid,'receipt-qa-'||owner_uid||'@example.invalid','{"full_name":"Receipt QA"}'),(viewer_uid,'receipt-qa-'||viewer_uid||'@example.invalid','{"full_name":"Receipt QA"}'),(denied_uid,'receipt-qa-'||denied_uid||'@example.invalid','{"full_name":"Receipt QA"}'),(outside_uid,'receipt-qa-'||outside_uid||'@example.invalid','{"full_name":"Receipt QA"}');
 insert into public.households(id,name,owner_id) values(a,'Receipt QA rollback A',owner_uid),(b,'Receipt QA rollback B',outside_uid);
 insert into public.household_members(household_id,user_id,role) values(a,owner_uid,'owner'),(a,viewer_uid,'guest'),(a,denied_uid,'adult'),(b,outside_uid,'owner');
 insert into public.household_member_access(household_id,user_id,module,access_level) values(a,viewer_uid,'finance','view'),(a,denied_uid,'finance','none');
 insert into public.transactions(id,household_id,type,amount,description,paid_by) values(ta,a,'expense',123.45,'Receipt QA supermarket',owner_uid),(tb,b,'expense',88.50,'Receipt QA other home',outside_uid);
end $$;
select set_config('request.jwt.claim.sub',current_setting('receipt_qa.owner'),true);
set local role authenticated;
do $$
begin
 insert into public.finance_receipts(id,household_id,transaction_id,file_path,original_filename,mime_type,file_size) values(current_setting('receipt_qa.rid')::uuid,current_setting('receipt_qa.a')::uuid,current_setting('receipt_qa.ta')::uuid,current_setting('receipt_qa.path'),'qa.pdf','application/pdf',20);
 insert into storage.objects(bucket_id,name,owner_id) values('finance-receipts',current_setting('receipt_qa.path'),current_setting('receipt_qa.owner'));
 if (select count(*) from public.finance_receipts where id=current_setting('receipt_qa.rid')::uuid)<>1 then raise exception 'Owner cannot read evidence';end if;
 if (select count(*) from storage.objects where bucket_id='finance-receipts' and name=current_setting('receipt_qa.path'))<>1 then raise exception 'Owner cannot read file';end if;
 update public.finance_receipts set purchase_detail=E'Milk · 2\nBread · 1' where id=current_setting('receipt_qa.rid')::uuid;
 if (select amount from public.transactions where id=current_setting('receipt_qa.ta')::uuid)<>123.45 then raise exception 'Evidence changed amount';end if;
 begin
  insert into public.finance_receipts(household_id,transaction_id,file_path,original_filename,mime_type,file_size) values(current_setting('receipt_qa.a')::uuid,current_setting('receipt_qa.tb')::uuid,current_setting('receipt_qa.a')||'/'||current_setting('receipt_qa.tb')||'/'||gen_random_uuid()||'.pdf','qa.pdf','application/pdf',20);
  raise exception 'Cross-household transaction allowed';
 exception when insufficient_privilege then null;end;
 begin
  update public.finance_receipts set file_path=current_setting('receipt_qa.path') where id=current_setting('receipt_qa.rid')::uuid;
  raise exception 'Immutable file linkage is editable';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('receipt_qa.viewer'),true);
set local role authenticated;
do $$
declare changed integer;
begin
 if (select count(*) from public.finance_receipts where id=current_setting('receipt_qa.rid')::uuid)<>1 then raise exception 'View-only member cannot read evidence';end if;
 if (select count(*) from storage.objects where bucket_id='finance-receipts' and name=current_setting('receipt_qa.path'))<>1 then raise exception 'View-only member cannot read file';end if;
 update public.finance_receipts set purchase_detail='Must not change' where id=current_setting('receipt_qa.rid')::uuid;get diagnostics changed=row_count;
 if changed<>0 then raise exception 'View-only member edited evidence';end if;
 begin
  insert into public.finance_receipts(household_id,transaction_id,file_path,original_filename,mime_type,file_size) values(current_setting('receipt_qa.a')::uuid,current_setting('receipt_qa.ta')::uuid,current_setting('receipt_qa.a')||'/'||current_setting('receipt_qa.ta')||'/'||gen_random_uuid()||'.pdf','qa.pdf','application/pdf',20);
  raise exception 'View-only member uploaded metadata';
 exception when insufficient_privilege then null;end;
 begin
  insert into storage.objects(bucket_id,name,owner_id) values('finance-receipts',current_setting('receipt_qa.a')||'/'||current_setting('receipt_qa.ta')||'/'||gen_random_uuid()||'.pdf',current_setting('receipt_qa.viewer'));
  raise exception 'View-only member uploaded file';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('receipt_qa.denied'),true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.finance_receipts where id=current_setting('receipt_qa.rid')::uuid) then raise exception 'Finance-denied member saw evidence';end if;
 if exists(select 1 from storage.objects where bucket_id='finance-receipts' and name=current_setting('receipt_qa.path')) then raise exception 'Finance-denied member saw file';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('receipt_qa.outside'),true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.finance_receipts where id=current_setting('receipt_qa.rid')::uuid) then raise exception 'Other household saw evidence';end if;
 if exists(select 1 from storage.objects where bucket_id='finance-receipts' and name=current_setting('receipt_qa.path')) then raise exception 'Other household saw file';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('receipt_qa.owner'),true);
set local role authenticated;
do $$begin
 delete from public.transactions where id=current_setting('receipt_qa.ta')::uuid;
 if exists(select 1 from public.finance_receipts where id=current_setting('receipt_qa.rid')::uuid) then raise exception 'Deleted movement still exposes evidence';end if;
 if finance_receipt_security.can_cleanup(current_setting('receipt_qa.path')) then raise exception 'Saved evidence can be cleaned up during recovery';end if;
 perform public.restore_recovery_item((select id from public.household_recovery_items where source_table='transactions' and source_id=current_setting('receipt_qa.ta') order by deleted_at desc limit 1));
 if (select count(*) from public.finance_receipts where id=current_setting('receipt_qa.rid')::uuid)<>1 then raise exception 'Evidence lost on recovery';end if;
 if (select purchase_detail from public.finance_receipts where id=current_setting('receipt_qa.rid')::uuid)<>E'Milk · 2\nBread · 1' then raise exception 'Purchase detail changed';end if;
end $$;
do $$
declare private_doc uuid:=gen_random_uuid();shared_doc uuid:=gen_random_uuid();
begin
 insert into public.household_documents(id,household_id,title,access_scope,owner_user_id,created_by)
 values(private_doc,current_setting('receipt_qa.a')::uuid,'Receipt QA private','private',current_setting('receipt_qa.owner')::uuid,current_setting('receipt_qa.owner')::uuid),
 (shared_doc,current_setting('receipt_qa.a')::uuid,'Receipt QA shared','household',current_setting('receipt_qa.owner')::uuid,current_setting('receipt_qa.owner')::uuid);
 delete from public.household_documents where id in (private_doc,shared_doc);
 if exists(select 1 from public.household_recovery_items where source_table='household_documents' and source_id=private_doc::text) then raise exception 'Private document leaked into shared recovery';end if;
 if not exists(select 1 from public.household_recovery_items where source_table='household_documents' and source_id=shared_doc::text) then raise exception 'Shared document recovery broken';end if;
end $$;
reset role;
rollback;
select 'passed: editor, view-only, denied module, other household, immutable linkage, amount unchanged, recovery preserved, document privacy preserved; fixtures rolled back' as receipt_integration_result;
