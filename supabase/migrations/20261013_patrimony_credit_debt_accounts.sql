-- Patrimony, credit cards, debts, transfers and net worth history.
alter table public.finance_accounts drop constraint if exists finance_accounts_account_type_check;

alter table public.finance_accounts
  add column if not exists account_class text not null default 'asset'
    check (account_class in ('asset','liability')),
  add column if not exists institution text,
  add column if not exists credit_limit numeric check (credit_limit is null or credit_limit >= 0),
  add column if not exists statement_day integer check (statement_day is null or statement_day between 1 and 31),
  add column if not exists payment_due_day integer check (payment_due_day is null or payment_due_day between 1 and 31),
  add column if not exists apr numeric check (apr is null or (apr >= 0 and apr <= 1000)),
  add column if not exists minimum_payment numeric check (minimum_payment is null or minimum_payment >= 0),
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.finance_accounts
  add constraint finance_accounts_account_type_check
  check (account_type in ('cash','checking','savings','investment','credit','loan','mortgage','other'));

update public.finance_accounts
set account_class=case when account_type in ('credit','loan','mortgage') then 'liability' else 'asset' end;

create table if not exists public.finance_transfers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_account_id uuid not null references public.finance_accounts(id) on delete cascade,
  to_account_id uuid not null references public.finance_accounts(id) on delete cascade,
  amount numeric not null check (amount > 0),
  transfer_date date not null default current_date,
  description text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);

create table if not exists public.finance_assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  asset_type text not null default 'other'
    check (asset_type in ('property','vehicle','investment','valuable','other')),
  estimated_value numeric not null default 0 check (estimated_value >= 0),
  purchase_value numeric check (purchase_value is null or purchase_value >= 0),
  owner_user_id uuid references auth.users(id) on delete set null,
  is_shared boolean not null default true,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  snapshot_date date not null,
  account_assets numeric not null default 0,
  manual_assets numeric not null default 0,
  liabilities numeric not null default 0,
  net_worth numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id,snapshot_date)
);

create index if not exists idx_finance_accounts_household_class on public.finance_accounts(household_id,account_class);
create index if not exists idx_finance_transfers_household_date on public.finance_transfers(household_id,transfer_date desc);
create index if not exists idx_finance_transfers_from on public.finance_transfers(from_account_id);
create index if not exists idx_finance_transfers_to on public.finance_transfers(to_account_id);
create index if not exists idx_finance_assets_household_active on public.finance_assets(household_id,active);
create index if not exists idx_finance_assets_owner on public.finance_assets(owner_user_id);
create index if not exists idx_finance_net_worth_household_date on public.finance_net_worth_snapshots(household_id,snapshot_date desc);

alter table public.finance_transfers enable row level security;
alter table public.finance_assets enable row level security;
alter table public.finance_net_worth_snapshots enable row level security;

create policy finance_transfers_member on public.finance_transfers for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy finance_assets_member on public.finance_assets for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy finance_net_worth_member_select on public.finance_net_worth_snapshots for select to authenticated
using (public.is_household_member(household_id));

grant select,insert,update,delete on public.finance_transfers,public.finance_assets to authenticated;
grant select on public.finance_net_worth_snapshots to authenticated;

create or replace function public.refresh_net_worth_snapshot(p_household_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_account_assets numeric:=0;v_manual_assets numeric:=0;v_liabilities numeric:=0;
begin
  with tx_delta as (
    select a.id,coalesce(sum(case
      when a.account_class='asset' and t.type='income' then t.amount
      when a.account_class='asset' and t.type='expense' then -t.amount
      when a.account_class='liability' and t.type='expense' then t.amount
      when a.account_class='liability' and t.type='income' then -t.amount
      else 0 end),0) delta
    from public.finance_accounts a
    left join public.transactions t on t.account_id=a.id
    where a.household_id=p_household_id and a.active
    group by a.id
  ), transfer_delta as (
    select a.id,coalesce(sum(case
      when ft.from_account_id=a.id and a.account_class='asset' then -ft.amount
      when ft.to_account_id=a.id and a.account_class='asset' then ft.amount
      when ft.from_account_id=a.id and a.account_class='liability' then ft.amount
      when ft.to_account_id=a.id and a.account_class='liability' then -ft.amount
      else 0 end),0) delta
    from public.finance_accounts a
    left join public.finance_transfers ft on ft.from_account_id=a.id or ft.to_account_id=a.id
    where a.household_id=p_household_id and a.active
    group by a.id
  ), balances as (
    select a.account_class,greatest(a.opening_balance+coalesce(td.delta,0)+coalesce(fd.delta,0),0) balance
    from public.finance_accounts a
    left join tx_delta td on td.id=a.id
    left join transfer_delta fd on fd.id=a.id
    where a.household_id=p_household_id and a.active
  )
  select coalesce(sum(balance) filter(where account_class='asset'),0),
         coalesce(sum(balance) filter(where account_class='liability'),0)
  into v_account_assets,v_liabilities from balances;

  select coalesce(sum(estimated_value),0) into v_manual_assets
  from public.finance_assets where household_id=p_household_id and active;

  insert into public.finance_net_worth_snapshots(
    household_id,snapshot_date,account_assets,manual_assets,liabilities,net_worth
  ) values(
    p_household_id,(now() at time zone 'America/Guatemala')::date,
    v_account_assets,v_manual_assets,v_liabilities,v_account_assets+v_manual_assets-v_liabilities
  )
  on conflict(household_id,snapshot_date) do update set
    account_assets=excluded.account_assets,
    manual_assets=excluded.manual_assets,
    liabilities=excluded.liabilities,
    net_worth=excluded.net_worth;
end $$;

create or replace function public.refresh_all_net_worth_snapshots()
returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
  for r in select id from public.households loop
    perform public.refresh_net_worth_snapshot(r.id);
  end loop;
end $$;

create or replace function public.refresh_my_net_worth_snapshot(p_household_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  perform public.refresh_net_worth_snapshot(p_household_id);
end $$;

revoke execute on function public.refresh_net_worth_snapshot(uuid) from public,anon,authenticated;
revoke execute on function public.refresh_all_net_worth_snapshots() from public,anon,authenticated;
revoke execute on function public.refresh_my_net_worth_snapshot(uuid) from public,anon;
grant execute on function public.refresh_my_net_worth_snapshot(uuid) to authenticated;

create or replace function public.run_household_automation()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.generate_recurring_occurrences(date_trunc('month',(now() at time zone 'America/Guatemala'))::date,12);
  perform public.refresh_all_notifications();
  perform public.refresh_all_recurring_event_notifications();
  perform public.refresh_all_net_worth_snapshots();
end $$;

revoke execute on function public.run_household_automation() from public,anon,authenticated;
grant execute on function public.run_household_automation() to service_role;

select public.refresh_all_net_worth_snapshots();
