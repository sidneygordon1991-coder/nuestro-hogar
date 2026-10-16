create table public.household_comments(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id) on delete cascade,
 transaction_id uuid references public.transactions(id) on delete cascade,
 list_item_id uuid references public.list_items(id) on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 1000),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 check(num_nonnulls(transaction_id,list_item_id)=1)
);
create index household_comments_transactions on public.household_comments(household_id,transaction_id,created_at desc) where transaction_id is not null;
create index household_comments_lists on public.household_comments(household_id,list_item_id,created_at desc) where list_item_id is not null;
alter table public.household_comments enable row level security;
create policy household_comments_read on public.household_comments for select to authenticated using(
 (transaction_id is not null and public.can_view_household_module(household_id,'finance') and exists(select 1 from public.transactions t where t.id=transaction_id and t.household_id=household_comments.household_id)) or
 (list_item_id is not null and public.can_view_household_module(household_id,'lists') and exists(select 1 from public.list_items i where i.id=list_item_id and i.household_id=household_comments.household_id)));
create policy household_comments_create on public.household_comments for insert to authenticated with check(created_by=(select auth.uid()) and (
 (transaction_id is not null and public.can_edit_household_module(household_id,'finance')) or (list_item_id is not null and public.can_edit_household_module(household_id,'lists'))));
create policy household_comments_delete on public.household_comments for delete to authenticated using(created_by=(select auth.uid()) and (
 (transaction_id is not null and public.can_edit_household_module(household_id,'finance')) or (list_item_id is not null and public.can_edit_household_module(household_id,'lists'))));
grant select,insert,delete on public.household_comments to authenticated;
create function household_integrity.check_household_comment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.transaction_id is not null and not exists(select 1 from public.transactions t where t.id=new.transaction_id and t.household_id=new.household_id) or
  new.list_item_id is not null and not exists(select 1 from public.list_items i where i.id=new.list_item_id and i.household_id=new.household_id) then raise check_violation using message='El registro no pertenece a este hogar o no está disponible.';end if;
 new.body:=btrim(new.body);
 if current_user not in ('postgres','supabase_admin') then new.created_by:=auth.uid();new.created_at:=now();end if;
 return new;
end $$;
revoke all on function household_integrity.check_household_comment() from public,anon,authenticated;
create trigger household_comment_scope before insert on public.household_comments for each row execute function household_integrity.check_household_comment();
create trigger platform_guard_archive before insert or update or delete on public.household_comments for each row execute function platform_security.guard_archived_write();
create function public.get_household_comments_capability(p_household_id uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select public.can_view_household_module(p_household_id,'finance') or public.can_view_household_module(p_household_id,'lists')
$$;
revoke all on function public.get_household_comments_capability(uuid) from public,anon;
grant execute on function public.get_household_comments_capability(uuid) to authenticated;

-- The existing master/MFA guard and ACLs stay in place. Expose metadata only.
do $$declare definition text;updated text;
begin
 definition:=pg_get_functiondef('platform_security.overview()'::regprocedure);
 updated:=replace(definition,'''created_at'',h.created_at)',
  '''created_at'',h.created_at,''latest_backup_at'',(select max(b.created_at) from public.household_backups b where b.household_id=h.id),''open_errors_7d'',(select count(*) from public.app_error_logs e where e.household_id=h.id and e.resolved_at is null and e.last_seen_at>=now()-interval ''7 days''))');
 if updated=definition then raise exception 'Operational overview precondition failed';end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
