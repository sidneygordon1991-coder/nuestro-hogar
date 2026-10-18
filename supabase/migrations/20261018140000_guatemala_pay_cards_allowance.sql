-- v33 · Guatemala: salary and extra-pay profile, dollar accounts, visacuotas/extrafinanciamiento and mesada.

-- 1. Pay profile: private to its owner (like private_transactions). Salary is personal: other members, reports
--    and backups never see it. Used for the net-pay calculator and the Bono 14 / aguinaldo planner.
create table if not exists public.pay_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  salary numeric(12,2) not null default 0 check (salary between 0 and 9999999),
  incentive numeric(10,2) not null default 250 check (incentive between 0 and 100000),
  other_taxable numeric(12,2) not null default 0 check (other_taxable between 0 and 9999999),
  personal_deductions numeric(12,2) not null default 0 check (personal_deductions between 0 and 9999999),
  igss boolean not null default true,
  start_date date check (start_date is null or start_date between date '1950-01-01' and date '2100-12-31'),
  bono14_plan jsonb check (bono14_plan is null or (jsonb_typeof(bono14_plan) = 'object' and pg_column_size(bono14_plan) < 2048)),
  aguinaldo_plan jsonb check (aguinaldo_plan is null or (jsonb_typeof(aguinaldo_plan) = 'object' and pg_column_size(aguinaldo_plan) < 2048)),
  updated_at timestamptz not null default now(),
  unique (household_id, user_id)
);
alter table public.pay_profiles enable row level security;
revoke all on public.pay_profiles from anon;
grant select, insert, update, delete on public.pay_profiles to authenticated;
drop policy if exists pay_profiles_owner_select on public.pay_profiles;
drop policy if exists pay_profiles_owner_insert on public.pay_profiles;
drop policy if exists pay_profiles_owner_update on public.pay_profiles;
drop policy if exists pay_profiles_owner_delete on public.pay_profiles;
create policy pay_profiles_owner_select on public.pay_profiles for select to authenticated
  using (user_id = (select auth.uid()) and public.is_household_member(household_id));
create policy pay_profiles_owner_insert on public.pay_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_household_member(household_id));
create policy pay_profiles_owner_update on public.pay_profiles for update to authenticated
  using (user_id = (select auth.uid()) and public.is_household_member(household_id))
  with check (user_id = (select auth.uid()) and public.is_household_member(household_id));
create policy pay_profiles_owner_delete on public.pay_profiles for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function household_integrity.touch_pay_profile() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists pay_profiles_touch on public.pay_profiles;
create trigger pay_profiles_touch before update on public.pay_profiles
  for each row execute function household_integrity.touch_pay_profile();

-- A member who leaves takes their pay profile with them.
create or replace function household_integrity.forget_pay_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.pay_profiles where household_id = old.household_id and user_id = old.user_id;
  return old;
end $$;
revoke execute on function household_integrity.forget_pay_profile() from public, anon, authenticated;
drop trigger if exists household_members_forget_pay_profile on public.household_members;
create trigger household_members_forget_pay_profile after delete on public.household_members
  for each row execute function household_integrity.forget_pay_profile();

comment on table public.pay_profiles is
  'Private salary profile per member (net pay, Bono 14 and aguinaldo plans). Visible only to its owner; never part of backups, exports or reports.';

-- 2. Dollar accounts. Balances stay in quetzales (book value) so every report keeps working; the app shows the
--    native dollar balance when original amounts exist, otherwise a clearly labelled estimate.
alter table public.finance_accounts
  add column if not exists currency text not null default 'GTQ',
  add column if not exists opening_balance_usd numeric(12,2);
alter table public.finance_accounts drop constraint if exists finance_accounts_currency_check;
alter table public.finance_accounts add constraint finance_accounts_currency_check check (
  currency in ('GTQ','USD') and (currency = 'USD' or opening_balance_usd is null)
  and (opening_balance_usd is null or abs(opening_balance_usd) < 10000000000)
);
comment on column public.finance_accounts.currency is 'GTQ or USD. Amounts are always stored in quetzales; USD accounts also show their dollar balance.';
comment on column public.finance_accounts.opening_balance_usd is 'Opening balance in dollars for USD accounts (opening_balance keeps its quetzal value at the rate of that day).';

-- 3. Visacuotas and extrafinanciamiento on credit cards.
create table if not exists public.card_installments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null references public.finance_accounts(id) on delete cascade,
  kind text not null check (kind in ('visacuotas','extra')),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  principal numeric(12,2) not null check (principal > 0 and principal < 10000000000),
  months integer not null check (months between 1 and 72),
  annual_rate numeric(6,3) not null default 0 check (annual_rate between 0 and 200),
  first_statement date not null,
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint card_installments_visacuotas_rate check (kind = 'extra' or annual_rate = 0)
);
create index if not exists idx_card_installments_account on public.card_installments(household_id, account_id);
alter table public.card_installments enable row level security;
revoke all on public.card_installments from anon;
grant select, insert, update, delete on public.card_installments to authenticated;
drop policy if exists card_installments_view on public.card_installments;
drop policy if exists card_installments_insert on public.card_installments;
drop policy if exists card_installments_update on public.card_installments;
drop policy if exists card_installments_delete on public.card_installments;
create policy card_installments_view on public.card_installments for select to authenticated
  using (public.can_view_household_module(household_id, 'finance'));
create policy card_installments_insert on public.card_installments for insert to authenticated
  with check (public.can_edit_household_module(household_id, 'finance'));
create policy card_installments_update on public.card_installments for update to authenticated
  using (public.can_edit_household_module(household_id, 'finance'))
  with check (public.can_edit_household_module(household_id, 'finance'));
create policy card_installments_delete on public.card_installments for delete to authenticated
  using (public.can_edit_household_module(household_id, 'finance'));

create or replace function household_integrity.check_card_installment() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.finance_accounts a
    where a.id = new.account_id and a.household_id = new.household_id and a.account_type = 'credit'
  ) then raise exception 'Las cuotas deben pertenecer a una tarjeta de crédito de este hogar.' using errcode = '23514'; end if;
  return new;
end $$;
drop trigger if exists card_installments_integrity on public.card_installments;
create trigger card_installments_integrity before insert or update on public.card_installments
  for each row execute function household_integrity.check_card_installment();

-- 4. Mesada: allowances for children and teens, with three jars (gastar, ahorrar, compartir).
create table if not exists public.allowances (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_name text not null check (char_length(btrim(child_name)) between 1 and 60),
  child_user_id uuid references auth.users(id) on delete set null,
  amount numeric(10,2) not null check (amount > 0 and amount <= 100000),
  frequency text not null default 'weekly' check (frequency in ('weekly','fortnight','monthly')),
  start_date date not null default (now() at time zone 'America/Guatemala')::date,
  save_percent integer not null default 20 check (save_percent between 0 and 100),
  give_percent integer not null default 0 check (give_percent between 0 and 100),
  goal_name text check (goal_name is null or char_length(btrim(goal_name)) between 1 and 60),
  goal_amount numeric(10,2) check (goal_amount is null or (goal_amount > 0 and goal_amount <= 10000000)),
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint allowances_jars_check check (save_percent + give_percent <= 100)
);
create index if not exists idx_allowances_household on public.allowances(household_id);
create table if not exists public.allowance_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  allowance_id uuid not null references public.allowances(id) on delete cascade,
  kind text not null default 'payment' check (kind in ('payment','withdrawal')),
  for_date date,
  paid_on date not null default (now() at time zone 'America/Guatemala')::date,
  spend_amount numeric(10,2) not null default 0 check (spend_amount >= 0),
  save_amount numeric(10,2) not null default 0 check (save_amount >= 0),
  give_amount numeric(10,2) not null default 0 check (give_amount >= 0),
  note text check (note is null or char_length(note) <= 140),
  transaction_id uuid references public.transactions(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint allowance_payments_shape_check check (
    (kind = 'payment' and for_date is not null) or (kind = 'withdrawal' and spend_amount = 0 and give_amount = 0 and save_amount > 0)
  )
);
create unique index if not exists uq_allowance_payment_payday on public.allowance_payments(allowance_id, for_date) where kind = 'payment';
create index if not exists idx_allowance_payments_household on public.allowance_payments(household_id, paid_on desc);

alter table public.allowances enable row level security;
alter table public.allowance_payments enable row level security;
revoke all on public.allowances, public.allowance_payments from anon;
grant select, insert, update, delete on public.allowances to authenticated;
grant select, insert on public.allowance_payments to authenticated;
revoke update, delete on public.allowance_payments from authenticated;
drop policy if exists allowances_view on public.allowances;
drop policy if exists allowances_insert on public.allowances;
drop policy if exists allowances_update on public.allowances;
drop policy if exists allowances_delete on public.allowances;
-- Adults with finance access manage them; the child sees their own (even without finance access).
create policy allowances_view on public.allowances for select to authenticated
  using (public.can_view_household_module(household_id, 'finance')
    or (child_user_id = (select auth.uid()) and public.is_household_member(household_id)));
create policy allowances_insert on public.allowances for insert to authenticated
  with check (public.can_edit_household_module(household_id, 'finance'));
create policy allowances_update on public.allowances for update to authenticated
  using (public.can_edit_household_module(household_id, 'finance'))
  with check (public.can_edit_household_module(household_id, 'finance'));
create policy allowances_delete on public.allowances for delete to authenticated
  using (public.can_edit_household_module(household_id, 'finance'));
drop policy if exists allowance_payments_view on public.allowance_payments;
drop policy if exists allowance_payments_insert on public.allowance_payments;
drop policy if exists allowance_payments_delete on public.allowance_payments;
create policy allowance_payments_view on public.allowance_payments for select to authenticated
  using (public.can_view_household_module(household_id, 'finance')
    or exists (select 1 from public.allowances a where a.id = allowance_id and a.child_user_id = (select auth.uid())
      and public.is_household_member(a.household_id)));
create policy allowance_payments_insert on public.allowance_payments for insert to authenticated
  with check (public.can_edit_household_module(household_id, 'finance'));
create policy allowance_payments_delete on public.allowance_payments for delete to authenticated
  using (public.can_edit_household_module(household_id, 'finance'));

create or replace function household_integrity.check_allowance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.child_user_id is not null and not exists (
    select 1 from public.household_members m where m.household_id = new.household_id and m.user_id = new.child_user_id
  ) then raise exception 'La persona debe pertenecer al hogar.' using errcode = '23514'; end if;
  return new;
end $$;
revoke execute on function household_integrity.check_allowance() from public, anon, authenticated;
drop trigger if exists allowances_integrity on public.allowances;
create trigger allowances_integrity before insert or update on public.allowances
  for each row execute function household_integrity.check_allowance();

create or replace function household_integrity.check_allowance_payment() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Serialize ledger changes for one allowance before testing the saving balance.
  perform 1 from public.allowances a where a.id = new.allowance_id and a.household_id = new.household_id for update;
  if not found then
    raise exception 'La mesada no pertenece a este hogar.' using errcode = '23514';
  end if;
  if new.transaction_id is not null and not exists (
    select 1 from public.transactions t where t.id = new.transaction_id and t.household_id = new.household_id
  ) then raise exception 'El movimiento no pertenece a este hogar.' using errcode = '23514'; end if;
  if new.kind = 'withdrawal' and new.save_amount > coalesce((
    select sum(case when p.kind = 'payment' then p.save_amount else -p.save_amount end)
    from public.allowance_payments p where p.allowance_id = new.allowance_id and p.id <> new.id
  ), 0) then raise exception 'No hay tanto ahorrado.' using errcode = '23514'; end if;
  return new;
end $$;
drop trigger if exists allowance_payments_integrity on public.allowance_payments;
create trigger allowance_payments_integrity before insert or update on public.allowance_payments
  for each row execute function household_integrity.check_allowance_payment();

-- Paying a mesada: split into jars on the server (same rounding as the app) and, optionally, record the expense
-- through quick_add_transaction (which checks permissions and splits it like any household expense). Atomic.
create or replace function public.pay_allowance(
  p_allowance_id uuid, p_for_date date, p_record_expense boolean default true,
  p_account_id uuid default null, p_paid_on date default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v public.allowances%rowtype;
  v_today date := (now() at time zone 'America/Guatemala')::date;
  v_cents bigint; v_save bigint; v_give bigint; v_tx uuid; v_id uuid; v_category uuid;
begin
  select * into v from public.allowances where id = p_allowance_id for update;
  if not found or not public.can_edit_household_module(v.household_id, 'finance') then
    raise exception 'Finance edit access required' using errcode = '42501';
  end if;
  if not v.active then raise exception 'Esta mesada está en pausa.'; end if;
  if p_for_date is null or p_for_date < v.start_date - 31 or p_for_date > v_today + 31 then raise exception 'Fecha de pago no válida.'; end if;
  v_cents := round(v.amount * 100)::bigint;
  v_save := floor(v_cents * v.save_percent / 100.0)::bigint;
  v_give := floor(v_cents * least(v.give_percent, 100 - v.save_percent) / 100.0)::bigint;
  if p_record_expense then
    select c.id into v_category from public.budget_categories c
      where c.household_id = v.household_id and c.name ilike 'mesada%' order by c.name limit 1;
    v_tx := public.quick_add_transaction(v.household_id, 'Mesada de ' || v.child_name, v.amount, 'expense',
      coalesce(p_paid_on, v_today), v_category, p_account_id, auth.uid(), true, null);
  end if;
  insert into public.allowance_payments(household_id, allowance_id, kind, for_date, paid_on, spend_amount, save_amount, give_amount, transaction_id)
  values (v.household_id, v.id, 'payment', p_for_date, coalesce(p_paid_on, v_today),
    (v_cents - v_save - v_give) / 100.0, v_save / 100.0, v_give / 100.0, v_tx)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.pay_allowance(uuid, date, boolean, uuid, date) from public, anon;
grant execute on function public.pay_allowance(uuid, date, boolean, uuid, date) to authenticated;

-- 5. Backups: installments and mesadas travel with the household (snapshot, export, import, missing-only restore).
--    Pay profiles are private and never do. On restore, people who left are cleared instead of failing, and
--    payments go before withdrawals so the savings check holds.
do $$ declare signature text; def text; updated text;
begin
  if position('card_installments' in pg_get_functiondef('public.build_household_backup_snapshot(uuid)'::regprocedure))>0 then return; end if;
  foreach signature in array array['public.household_backup_rows(uuid,text)','public.restore_backup_table_missing(uuid,text,jsonb)'] loop
    def:=pg_get_functiondef(signature::regprocedure);
    updated:=replace(def,'''finance_settlements'',''budget_allocations''','''finance_settlements'',''card_installments'',''allowances'',''allowance_payments'',''budget_allocations''');
    if updated=def then raise exception 'Guatemala backup precondition failed: %',signature; end if;
    if position('pay_profiles' in updated)>0 or position('private_transactions' in updated)>0 then
      raise exception 'Private data must never be backed up: %',signature;
    end if;
    execute updated;
  end loop;

  def:=pg_get_functiondef('public.restore_backup_table_missing(uuid,text,jsonb)'::regprocedure);
  updated:=replace(def,E'  if p_table=''finance_settlements'' then',
    E'  if p_table in (''card_installments'',''allowances'',''allowance_payments'') then\n'
    || E'   select coalesce(jsonb_agg(s - array_remove(array[\n'
    || E'     case when s->>''created_by'' is not null and not exists(select 1 from auth.users u where u.id=(s->>''created_by'')::uuid) then ''created_by'' end,\n'
    || E'     case when s->>''child_user_id'' is not null and not exists(select 1 from public.household_members m where m.household_id=p_household_id and m.user_id=(s->>''child_user_id'')::uuid) then ''child_user_id'' end,\n'
    || E'     case when s->>''transaction_id'' is not null and not exists(select 1 from public.transactions t where t.id=(s->>''transaction_id'')::uuid and t.household_id=p_household_id) then ''transaction_id'' end\n'
    || E'   ],null) order by s->>''kind''),''[]''::jsonb) into p_rows from jsonb_array_elements(p_rows) s;\n'
    || E'  end if;\n  if p_table=''finance_settlements'' then');
  if updated=def then raise exception 'Guatemala restore precondition failed'; end if;
  execute updated;

  def:=pg_get_functiondef('public.restore_household_backup_missing(uuid)'::regprocedure);
  updated:=replace(def,'''transaction_splits'',''finance_settlements''','''transaction_splits'',''finance_settlements'',''card_installments'',''allowances'',''allowance_payments''');
  if updated=def then raise exception 'Guatemala restore order precondition failed'; end if;
  execute updated;

  def:=pg_get_functiondef('public.build_household_backup_snapshot(uuid)'::regprocedure);
  updated:=replace(def,'''finance_settlements'',public.household_backup_rows(p_household_id,''finance_settlements''),',
    '''finance_settlements'',public.household_backup_rows(p_household_id,''finance_settlements''),'
    || '''card_installments'',public.household_backup_rows(p_household_id,''card_installments''),'
    || '''allowances'',public.household_backup_rows(p_household_id,''allowances''),'
    || '''allowance_payments'',public.household_backup_rows(p_household_id,''allowance_payments''),');
  if updated=def then raise exception 'Guatemala snapshot precondition failed'; end if;
  def:=updated;
  updated:=replace(def,E'  v_tables:=v_tables-''private_transactions'';',E'  v_tables:=v_tables-''private_transactions''-''pay_profiles'';');
  if updated=def then raise exception 'Snapshot privacy precondition failed'; end if;
  execute updated;
end $$;

-- Backups made before v33 have no finance_accounts.currency: jsonb_populate_recordset would insert an explicit NULL
-- (the column default does not apply) and the NOT NULL check would abort the whole restore. Fill it in.
do $$ declare def text; updated text;
begin
  def:=pg_get_functiondef('public.restore_backup_table_missing(uuid,text,jsonb)'::regprocedure);
  if position('finance_accounts_currency_fill' in def)>0 then return; end if;
  updated:=replace(def,E'  if p_table in (''card_installments'',''allowances'',''allowance_payments'') then',
    E'  if p_table=''finance_accounts'' then -- finance_accounts_currency_fill\n'
    || E'   select coalesce(jsonb_agg(s || jsonb_build_object(''currency'',coalesce(nullif(s->>''currency'',''''),''GTQ''))),''[]''::jsonb) into p_rows from jsonb_array_elements(p_rows) s;\n'
    || E'  end if;\n  if p_table in (''card_installments'',''allowances'',''allowance_payments'') then');
  if updated=def then raise exception 'Account currency restore precondition failed'; end if;
  execute updated;
end $$;

comment on table public.card_installments is 'Visacuotas and extrafinanciamiento per credit card. Included in household backups.';
comment on table public.allowances is 'Mesadas for children and teens. Included in household backups.';
comment on table public.allowance_payments is 'Mesada payments (with jar split) and savings withdrawals. Included in household backups.';

notify pgrst, 'reload schema';

-- Cover foreign-key lookups and deletion checks without scanning every household.
create index if not exists idx_pay_profiles_user on public.pay_profiles(user_id);
create index if not exists idx_card_installments_account_id on public.card_installments(account_id);
create index if not exists idx_card_installments_created_by on public.card_installments(created_by);
create index if not exists idx_allowances_child on public.allowances(child_user_id);
create index if not exists idx_allowances_created_by on public.allowances(created_by);
create index if not exists idx_allowance_payments_allowance on public.allowance_payments(allowance_id);
create index if not exists idx_allowance_payments_transaction on public.allowance_payments(transaction_id);
create index if not exists idx_allowance_payments_created_by on public.allowance_payments(created_by);
