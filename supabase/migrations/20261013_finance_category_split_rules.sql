-- Category-level finance split rules.
create table if not exists public.finance_category_settings (
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.budget_categories(id) on delete cascade,
  split_method text not null default 'inherit' check (split_method in ('inherit','equal','income','custom','personal')),
  responsible_user_id uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (household_id, category_id)
);

create table if not exists public.finance_category_member_settings (
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.budget_categories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  custom_share_percent numeric(6,3) not null default 0 check (custom_share_percent >= 0 and custom_share_percent <= 100),
  updated_at timestamptz not null default now(),
  primary key (household_id, category_id, user_id)
);

create index if not exists idx_finance_category_settings_category on public.finance_category_settings(category_id);
create index if not exists idx_finance_category_settings_responsible on public.finance_category_settings(responsible_user_id);
create index if not exists idx_finance_category_settings_updated_by on public.finance_category_settings(updated_by);
create index if not exists idx_finance_category_member_settings_category on public.finance_category_member_settings(category_id);
create index if not exists idx_finance_category_member_settings_user on public.finance_category_member_settings(user_id);

alter table public.finance_category_settings enable row level security;
alter table public.finance_category_member_settings enable row level security;

create policy finance_category_settings_all on public.finance_category_settings
for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy finance_category_member_settings_all on public.finance_category_member_settings
for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.finance_category_settings to authenticated;
grant select, insert, update, delete on public.finance_category_member_settings to authenticated;
