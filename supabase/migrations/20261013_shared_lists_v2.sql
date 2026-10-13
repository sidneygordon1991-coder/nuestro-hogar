-- Realtime collaborative lists.
alter table public.lists
  add column if not exists list_type text not null default 'general'
  check (list_type in ('general','shopping','tasks'));

alter table public.list_items
  add column if not exists quantity text,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists due_date date,
  add column if not exists notes text,
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_list_items_assigned_to on public.list_items(assigned_to);
create index if not exists idx_list_items_due_date on public.list_items(household_id,due_date);
create index if not exists idx_list_items_list_completed on public.list_items(list_id,completed);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='lists'
  ) then
    alter publication supabase_realtime add table public.lists;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='list_items'
  ) then
    alter publication supabase_realtime add table public.list_items;
  end if;
end $$;
