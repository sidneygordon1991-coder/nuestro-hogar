-- Couple contribution rules for Nuestro Hogar finance center.
create table if not exists public.finance_household_settings (
  household_id uuid primary key references public.households(id) on delete cascade,
  split_method text not null default 'equal' check (split_method in ('equal','income','custom')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_member_settings (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  monthly_income numeric(12,2) not null default 0 check (monthly_income >= 0),
  custom_share_percent numeric(6,3) not null default 0 check (custom_share_percent >= 0 and custom_share_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists idx_finance_household_settings_updated_by on public.finance_household_settings(updated_by);
create index if not exists idx_finance_member_settings_user on public.finance_member_settings(user_id);

alter table public.finance_household_settings enable row level security;
alter table public.finance_member_settings enable row level security;

create policy finance_household_settings_all on public.finance_household_settings
for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy finance_member_settings_all on public.finance_member_settings
for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.finance_household_settings to authenticated;
grant select, insert, update, delete on public.finance_member_settings to authenticated;
