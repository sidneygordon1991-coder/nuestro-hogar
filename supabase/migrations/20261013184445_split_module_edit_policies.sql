-- Avoid duplicate SELECT policy evaluation while preserving the same permission model.
-- The existing *_module_edit FOR ALL policies are split into write-only policies,
-- leaving *_module_view as the single SELECT policy.

do $$
declare r record;
begin
  for r in
    select tablename,policyname,qual,with_check
    from pg_policies
    where schemaname='public'
      and cmd='ALL'
      and roles='{authenticated}'
      and policyname like '%\_module\_edit' escape '\'
  loop
    execute format('drop policy %I on public.%I',r.policyname,r.tablename);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      r.policyname||'_insert',r.tablename,coalesce(r.with_check,r.qual)
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      r.policyname||'_update',r.tablename,r.qual,coalesce(r.with_check,r.qual)
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      r.policyname||'_delete',r.tablename,r.qual
    );
  end loop;
end $$;
