-- Count only changes that actually happened. BEFORE INSERT also fires for
-- INSERT ... ON CONFLICT DO NOTHING, which must not spend a member/file quota.
drop trigger platform_member_quota on public.household_members;
create trigger platform_member_quota after insert or update or delete on public.household_members for each row execute function platform_security.account_members();
drop trigger platform_storage_quota on storage.objects;
create trigger platform_storage_quota after insert or update or delete on storage.objects for each row execute function platform_security.account_storage();
-- Reconcile counters under the same global lock used by uploads and allocations.
do $$ begin
 perform 1 from platform_security.settings where id for update;
 update platform_security.household_controls c set member_count=(select count(*) from public.household_members m where m.household_id=c.household_id),used_bytes=coalesce((select sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end) from storage.objects o where o.bucket_id in ('household-documents','finance-receipts') and split_part(o.name,'/',1)=c.household_id::text),0);
 update platform_security.settings set storage_used_bytes=(select coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0) from storage.objects) where id;
end $$;
