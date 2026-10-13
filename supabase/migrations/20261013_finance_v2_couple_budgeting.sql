-- Finance v2: couple budgeting, accounts, goals, recurring payments and expense splits.
-- Applied to Supabase project dchihxrjtngwabbvsqap.

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  account_type text not null default 'cash' check (account_type in ('cash','checking','savings','credit','other')),
  opening_balance numeric(12,2) not null default 0,
  owner_user_id uuid references auth.users(id) on delete set null,
  is_shared boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.budget_categories(id) on delete cascade,
  month date not null,
  planned_amount numeric(12,2) not null default 0 check (planned_amount >= 0),
  created_at timestamptz not null default now(),
  unique (household_id, category_id, month)
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  target_date date,
  icon text not null default 'target',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  contribution_date date not null default current_date,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid references public.budget_categories(id) on delete set null,
  account_id uuid references public.finance_accounts(id) on delete set null,
  type text not null check (type in ('income','expense')),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_day integer not null check (due_day between 1 and 31),
  paid_by uuid references auth.users(id) on delete set null,
  is_shared boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.transactions
  add column if not exists account_id uuid references public.finance_accounts(id) on delete set null,
  add column if not exists is_shared boolean not null default true,
  add column if not exists notes text;

create table if not exists public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  share_amount numeric(12,2) not null check (share_amount >= 0),
  created_at timestamptz not null default now(),
  unique (transaction_id, user_id)
);

alter table public.finance_accounts enable row level security;
alter table public.budget_allocations enable row level security;
alter table public.savings_goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.transaction_splits enable row level security;

create policy finance_accounts_all on public.finance_accounts for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy budget_allocations_all on public.budget_allocations for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy savings_goals_all on public.savings_goals for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy goal_contributions_all on public.goal_contributions for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy recurring_transactions_all on public.recurring_transactions for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy transaction_splits_all on public.transaction_splits for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.finance_accounts, public.budget_allocations, public.savings_goals, public.goal_contributions, public.recurring_transactions, public.transaction_splits to authenticated;
