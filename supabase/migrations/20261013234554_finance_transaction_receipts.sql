-- Additive evidence storage. No transaction, split, balance or budget mutation.
create table public.finance_receipts (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id) on delete cascade,
 -- Deliberately retained across transaction deletion: the existing recovery center
 -- restores the original transaction ID, so its evidence becomes visible again.
 -- RLS validates the transaction/household pair on every insert and read.
 transaction_id uuid not null,
 file_path text not null unique,
 original_filename text not null check(char_length(original_filename) between 1 and 250),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size bigint not null check(file_size between 1 and 15728640),
 purchase_detail text not null default '' check(char_length(purchase_detail)<=10000),
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint finance_receipts_scoped_path check (
  split_part(file_path,'/',1)=household_id::text
  and split_part(file_path,'/',2)=transaction_id::text
  and file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
 )
);
create index finance_receipts_household_transaction_idx on public.finance_receipts(household_id,transaction_id);
create index finance_receipts_created_by_idx on public.finance_receipts(created_by);
alter table public.finance_receipts enable row level security;
create policy finance_receipts_view on public.finance_receipts for select to authenticated using (
 public.can_view_household_module(household_id,'finance')
 and exists(select 1 from public.transactions t where t.id=finance_receipts.transaction_id and t.household_id=finance_receipts.household_id)
);
create policy finance_receipts_insert on public.finance_receipts for insert to authenticated with check (
 public.can_edit_household_module(household_id,'finance')
 and created_by=(select auth.uid())
 and exists(select 1 from public.transactions t where t.id=finance_receipts.transaction_id and t.household_id=finance_receipts.household_id)
);
create policy finance_receipts_update_detail on public.finance_receipts for update to authenticated using (
 public.can_edit_household_module(household_id,'finance')
 and exists(select 1 from public.transactions t where t.id=finance_receipts.transaction_id and t.household_id=finance_receipts.household_id)
) with check (
 public.can_edit_household_module(household_id,'finance')
 and exists(select 1 from public.transactions t where t.id=finance_receipts.transaction_id and t.household_id=finance_receipts.household_id)
);
-- Files and their linkage are immutable to clients. Only explanatory text is editable.
revoke all on public.finance_receipts from public,anon,authenticated;
grant select,insert on public.finance_receipts to authenticated;
grant update(purchase_detail) on public.finance_receipts to authenticated;
revoke all on public.finance_receipts from anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('finance-receipts','finance-receipts',false,15728640,
 array['application/pdf','image/jpeg','image/png','image/webp']);
create policy finance_receipts_storage_read on storage.objects for select to authenticated using (
 bucket_id='finance-receipts'
 and exists(select 1 from public.finance_receipts r where r.file_path=storage.objects.name)
);
create policy finance_receipts_storage_insert on storage.objects for insert to authenticated with check (
 bucket_id='finance-receipts'
 and exists(select 1 from public.transactions t
  where t.household_id::text=(storage.foldername(name))[1]
   and t.id::text=(storage.foldername(name))[2]
   and public.can_edit_household_module(t.household_id,'finance'))
);
-- Internal lookup sees linked evidence even while a deleted transaction is in recovery.
-- It is intentionally not exposed through the public Data API.
create schema if not exists finance_receipt_security;
revoke all on schema finance_receipt_security from public;
grant usage on schema finance_receipt_security to authenticated;
create function finance_receipt_security.can_cleanup(p_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$' then return false; end if;
 return public.can_edit_household_module(split_part(p_path,'/',1)::uuid,'finance')
  and not exists(select 1 from public.finance_receipts r where r.file_path=p_path);
exception when invalid_text_representation then return false;
end $$;
revoke all on function finance_receipt_security.can_cleanup(text) from public,anon;
grant execute on function finance_receipt_security.can_cleanup(text) to authenticated;

-- Cleanup only unlinked uploads created by the caller. Saved evidence cannot be removed.
create policy finance_receipts_storage_cleanup on storage.objects for delete to authenticated using (
 bucket_id='finance-receipts'
 and owner_id=(select auth.uid())::text
 and finance_receipt_security.can_cleanup(name)
);
