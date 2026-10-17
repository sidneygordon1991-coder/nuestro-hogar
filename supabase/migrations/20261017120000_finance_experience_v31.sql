-- Nuestro Hogar v31: pay days, quetzal/dollar entries, private personal movements,
-- settlements between members and a single read for the home summary.
-- Additive and backwards compatible: existing clients keep working without changes.

-- 1. Pay days per member: the projection places expected income on the real pay date.
alter table public.finance_member_settings
  add column if not exists first_pay_day smallint default 15,
  add column if not exists second_pay_day smallint default 31;
-- Nullable on purpose: restoring an older backup row (without these fields) falls back to 15 and the month's end.
alter table public.finance_member_settings drop constraint if exists finance_member_settings_pay_days_check;
alter table public.finance_member_settings add constraint finance_member_settings_pay_days_check
  check ((first_pay_day is null or first_pay_day between 1 and 15) and (second_pay_day is null or second_pay_day between 16 and 31));

-- 2. Dollars: every movement keeps its amount in quetzales (all budgets and balances stay in GTQ);
--    a dollar entry also stores the original amount and the rate used.
alter table public.finance_household_settings
  add column if not exists usd_rate numeric(10,4) default 7.75;
alter table public.finance_household_settings drop constraint if exists finance_household_settings_usd_rate_check;
alter table public.finance_household_settings add constraint finance_household_settings_usd_rate_check check (usd_rate is null or (usd_rate > 0 and usd_rate < 1000));

alter table public.transactions
  add column if not exists original_currency text,
  add column if not exists original_amount numeric(12,2),
  add column if not exists exchange_rate numeric(10,4);
alter table public.transactions drop constraint if exists transactions_original_currency_check;
alter table public.transactions add constraint transactions_original_currency_check check (
  (original_currency is null and original_amount is null and exchange_rate is null)
  or (original_currency = 'USD' and original_amount is not null and exchange_rate is not null and original_amount > 0 and original_amount < 10000000000 and exchange_rate > 0 and exchange_rate < 1000 and amount = round(original_amount * exchange_rate, 2))
);

-- 3. Private personal movements: visible and editable only by their owner. They are not part of the
--    household finances, its reports or its backups; they appear only in the owner's "Personal" view.
create table if not exists public.private_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 140),
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (type in ('income','expense')),
  transaction_date date not null default current_date,
  category_id uuid references public.budget_categories(id) on delete set null,
  original_currency text,
  original_amount numeric(12,2),
  exchange_rate numeric(10,4),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_transactions_currency_check check (
    (original_currency is null and original_amount is null and exchange_rate is null)
    or (original_currency = 'USD' and original_amount is not null and exchange_rate is not null and original_amount > 0 and original_amount < 10000000000 and exchange_rate > 0 and exchange_rate < 1000 and amount = round(original_amount * exchange_rate, 2))
  )
);
create index if not exists idx_private_transactions_owner on public.private_transactions(household_id, user_id, transaction_date desc);
alter table public.private_transactions enable row level security;
revoke all on public.private_transactions from anon;
grant select, insert, update, delete on public.private_transactions to authenticated;
drop policy if exists private_transactions_owner on public.private_transactions;
create policy private_transactions_owner on public.private_transactions for select to authenticated
  using (user_id = (select auth.uid()) and public.is_household_member(household_id));
drop policy if exists private_transactions_insert on public.private_transactions;
drop policy if exists private_transactions_update on public.private_transactions;
drop policy if exists private_transactions_delete on public.private_transactions;
create policy private_transactions_insert on public.private_transactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_edit_household_module(household_id,'finance'));
create policy private_transactions_update on public.private_transactions for update to authenticated
  using (user_id = (select auth.uid()) and public.can_edit_household_module(household_id,'finance'))
  with check (user_id = (select auth.uid()) and public.can_edit_household_module(household_id,'finance'));
create policy private_transactions_delete on public.private_transactions for delete to authenticated
  using (user_id = (select auth.uid()) and public.can_edit_household_module(household_id,'finance'));


create or replace function household_integrity.check_private_transaction() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.budget_categories c where c.id = new.category_id and c.household_id = new.household_id
  ) then raise exception 'La categoría no pertenece a este hogar.' using errcode = '23514'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists private_transactions_integrity on public.private_transactions;
create trigger private_transactions_integrity before insert or update on public.private_transactions
  for each row execute function household_integrity.check_private_transaction();

-- A member who leaves (or is removed from) a household takes their private movements with them.
create or replace function household_integrity.forget_private_transactions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.private_transactions where household_id = old.household_id and user_id = old.user_id;
  return old;
end $$;
revoke execute on function household_integrity.forget_private_transactions() from public, anon, authenticated;
drop trigger if exists household_members_forget_private on public.household_members;
create trigger household_members_forget_private after delete on public.household_members
  for each row execute function household_integrity.forget_private_transactions();

-- 4. Settlements: "Andrea le pagó Q 450 a Sidney". Recorded payments between members close the
--    balance produced by shared expenses. They do not change budgets, income or account balances.
create table if not exists public.finance_settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  settled_on date not null default current_date,
  period_month date not null default date_trunc('month', current_date)::date,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_settlements_parties_check check (from_user_id <> to_user_id),
  constraint finance_settlements_month_check check (period_month = date_trunc('month', period_month)::date)
);
create index if not exists idx_finance_settlements_month on public.finance_settlements(household_id, period_month);
alter table public.finance_settlements enable row level security;
revoke all on public.finance_settlements from anon;
grant select, insert, update, delete on public.finance_settlements to authenticated;
drop policy if exists finance_settlements_view on public.finance_settlements;
drop policy if exists finance_settlements_insert on public.finance_settlements;
drop policy if exists finance_settlements_delete on public.finance_settlements;
create policy finance_settlements_view on public.finance_settlements for select to authenticated
  using (public.can_view_household_module(household_id, 'finance'));
create policy finance_settlements_insert on public.finance_settlements for insert to authenticated
  with check (public.can_edit_household_module(household_id, 'finance') and created_by = (select auth.uid()));
create policy finance_settlements_delete on public.finance_settlements for delete to authenticated
  using (public.can_edit_household_module(household_id, 'finance'));

create or replace function household_integrity.check_settlement_members() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.household_members m
      where m.household_id = new.household_id and m.user_id in (new.from_user_id, new.to_user_id)) <> 2 then
    raise exception 'Ambas personas deben pertenecer al hogar.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function household_integrity.check_settlement_members() from public, anon, authenticated;
drop trigger if exists finance_settlements_members on public.finance_settlements;
create trigger finance_settlements_members before insert or update on public.finance_settlements
  for each row execute function household_integrity.check_settlement_members();

-- 5. One read for Inicio (security invoker: every table keeps its own row level security,
--    so modules a member cannot see come back empty).
create or replace function public.get_home_finance_source(p_household_id uuid, p_month date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'No perteneces a este hogar.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'month', v_start,
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.transaction_date desc, t.id) from (
      select id, description, amount, type, transaction_date, category_id, paid_by, is_shared, original_currency, original_amount
      from public.transactions where household_id = p_household_id and transaction_date between v_start and v_end) t), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from (
      select id, name, icon, budget_group from public.budget_categories where household_id = p_household_id) c), '[]'::jsonb),
    'allocations', coalesce((select jsonb_agg(to_jsonb(a)) from (
      select category_id, planned_amount, month, first_half_amount, second_half_amount
      from public.budget_allocations where household_id = p_household_id and month = v_start) a), '[]'::jsonb),
    'contributions', coalesce((select jsonb_agg(to_jsonb(g)) from (
      select goal_id, amount, contribution_date, created_by from public.goal_contributions
      where household_id = p_household_id and contribution_date between v_start and v_end) g), '[]'::jsonb),
    'recurring', coalesce((select jsonb_agg(to_jsonb(r)) from (
      select id, description, amount, type, due_day, category_id, paid_by, is_shared, created_at
      from public.recurring_transactions where household_id = p_household_id and active) r), '[]'::jsonb),
    'occurrences', coalesce((select jsonb_agg(to_jsonb(o)) from (
      select id, recurring_transaction_id, due_date, status, transaction_id, details_snapshot
      from public.recurring_transaction_occurrences where household_id = p_household_id and period_month = v_start) o), '[]'::jsonb),
    'member_settings', coalesce((select jsonb_agg(to_jsonb(m)) from (
      select user_id, monthly_income, first_pay_day, second_pay_day from public.finance_member_settings where household_id = p_household_id) m), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) order by g.target_date nulls last, g.name) from (
      select id, name, target_amount, target_date, icon from public.savings_goals where household_id = p_household_id and active) g), '[]'::jsonb),
    'goal_contributions', coalesce((select jsonb_agg(to_jsonb(g)) from (
      select goal_id, amount, contribution_date from public.goal_contributions where household_id = p_household_id) g), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(to_jsonb(p)) from (
      select user_id, month, expected_amount, first_half_amount, second_half_amount
      from public.finance_income_plans where household_id = p_household_id and month = v_start) p), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id)) from public.household_members m where m.household_id = p_household_id), '[]'::jsonb),
    'splits', coalesce((select jsonb_agg(to_jsonb(s)) from (
      select s.transaction_id, s.user_id, s.share_amount from public.transaction_splits s
      join public.transactions t on t.id = s.transaction_id
      where s.household_id = p_household_id and t.transaction_date between v_start and v_end) s), '[]'::jsonb),
    'settlements', coalesce((select jsonb_agg(to_jsonb(s) order by s.settled_on, s.created_at) from (
      select id, from_user_id, to_user_id, amount, settled_on, period_month, note, created_at
      from public.finance_settlements where household_id = p_household_id and period_month = v_start) s), '[]'::jsonb),
    'private', coalesce((select jsonb_agg(to_jsonb(p) order by p.transaction_date desc, p.created_at desc) from (
      select id, description, amount, type, transaction_date, category_id, original_currency, original_amount, created_at
      from public.private_transactions where household_id = p_household_id and user_id = auth.uid()
        and transaction_date between v_start and v_end) p), '[]'::jsonb),
    'settings', (select to_jsonb(s) from (select split_method, usd_rate from public.finance_household_settings where household_id = p_household_id) s)
  );
end $$;
revoke execute on function public.get_home_finance_source(uuid, date) from public, anon;
grant execute on function public.get_home_finance_source(uuid, date) to authenticated;
