-- Recurring payment lifecycle: monthly occurrences and transaction linkage.

alter table public.transactions
  add column if not exists recurring_transaction_id uuid
  references public.recurring_transactions(id) on delete set null;

create index if not exists idx_transactions_recurring_transaction
  on public.transactions(recurring_transaction_id);

create table if not exists public.recurring_transaction_occurrences (
  id uuid primary key default gen_random_uuid(),
  recurring_transaction_id uuid not null references public.recurring_transactions(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  period_month date not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','paid','skipped')),
  paid_at timestamptz,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recurring_transaction_id, period_month)
);

create index if not exists idx_recurring_occurrences_household_month
  on public.recurring_transaction_occurrences(household_id, period_month);
create index if not exists idx_recurring_occurrences_recurring
  on public.recurring_transaction_occurrences(recurring_transaction_id);
create index if not exists idx_recurring_occurrences_transaction
  on public.recurring_transaction_occurrences(transaction_id);
create index if not exists idx_recurring_occurrences_due_date
  on public.recurring_transaction_occurrences(household_id, due_date, status);

alter table public.recurring_transaction_occurrences enable row level security;

create policy recurring_occurrences_all
on public.recurring_transaction_occurrences
for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

grant select, insert, update, delete
on public.recurring_transaction_occurrences
to authenticated;
