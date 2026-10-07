-- Security/index hardening applied after initial schema.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.create_household(text) from public, anon;
revoke execute on function public.join_household(text) from public, anon;
revoke execute on function public.is_household_member(uuid) from public, anon;
revoke execute on function public.is_household_admin(uuid) from public, anon;
revoke execute on function public.shares_household(uuid) from public, anon;

create index if not exists idx_households_owner on public.households(owner_id);
create index if not exists idx_lists_created_by on public.lists(created_by);
create index if not exists idx_list_items_list on public.list_items(list_id);
create index if not exists idx_list_items_created_by on public.list_items(created_by);
create index if not exists idx_events_created_by on public.events(created_by);
create index if not exists idx_transactions_category on public.transactions(category_id);
create index if not exists idx_transactions_paid_by on public.transactions(paid_by);
