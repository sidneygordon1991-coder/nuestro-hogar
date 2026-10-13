-- Calendar 2.0 and family profile fields.
alter table public.events
  add column if not exists category text not null default 'family'
    check (category in ('family','appointment','task','birthday','social','health','school','other')),
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists all_day boolean not null default false,
  add column if not exists recurrence text not null default 'none'
    check (recurrence in ('none','weekly','monthly','yearly')),
  add column if not exists recurrence_until date,
  add column if not exists reminder_minutes integer
    check (reminder_minutes is null or reminder_minutes >= 0);

alter table public.profiles
  add column if not exists birth_date date,
  add column if not exists relationship text,
  add column if not exists phone text;

create index if not exists idx_events_household_category on public.events(household_id,category);
create index if not exists idx_events_assigned_to on public.events(assigned_to);
create index if not exists idx_events_recurrence on public.events(household_id,recurrence,event_date);
create index if not exists idx_profiles_birth_date on public.profiles(birth_date);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;
