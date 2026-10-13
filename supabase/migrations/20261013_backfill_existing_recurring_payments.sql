-- Backfill recurring templates created before occurrence tracking existed.
-- Links a recurring template to the transaction created within 60 seconds with the same household, description, amount, type and category.

with matched as (
  select distinct on (r.id)
    r.id as recurring_id,
    r.household_id,
    r.due_day,
    t.id as transaction_id,
    t.transaction_date,
    t.created_at as transaction_created_at
  from public.recurring_transactions r
  join public.transactions t
    on t.household_id = r.household_id
   and t.description = r.description
   and t.amount = r.amount
   and t.type = r.type
   and coalesce(t.category_id::text,'') = coalesce(r.category_id::text,'')
   and abs(extract(epoch from (t.created_at - r.created_at))) <= 60
  order by r.id, abs(extract(epoch from (t.created_at - r.created_at)))
)
update public.transactions t
set recurring_transaction_id = m.recurring_id
from matched m
where t.id = m.transaction_id
  and t.recurring_transaction_id is null;

with matched as (
  select distinct on (r.id)
    r.id as recurring_id,
    r.household_id,
    r.due_day,
    t.id as transaction_id,
    t.transaction_date,
    t.created_at as transaction_created_at
  from public.recurring_transactions r
  join public.transactions t
    on t.household_id = r.household_id
   and t.description = r.description
   and t.amount = r.amount
   and t.type = r.type
   and coalesce(t.category_id::text,'') = coalesce(r.category_id::text,'')
   and abs(extract(epoch from (t.created_at - r.created_at))) <= 60
  order by r.id, abs(extract(epoch from (t.created_at - r.created_at)))
),
prepared as (
  select
    recurring_id,
    household_id,
    transaction_id,
    date_trunc('month', transaction_date)::date as period_month,
    (
      date_trunc('month', transaction_date)::date
      + (
          least(
            due_day,
            extract(day from (date_trunc('month', transaction_date) + interval '1 month - 1 day'))::int
          ) - 1
        )
    )::date as due_date,
    transaction_created_at
  from matched
)
insert into public.recurring_transaction_occurrences (
  recurring_transaction_id,
  household_id,
  period_month,
  due_date,
  status,
  paid_at,
  transaction_id,
  updated_at
)
select
  recurring_id,
  household_id,
  period_month,
  due_date,
  'paid',
  transaction_created_at,
  transaction_id,
  now()
from prepared
on conflict (recurring_transaction_id, period_month)
do update set
  status = 'paid',
  paid_at = excluded.paid_at,
  transaction_id = excluded.transaction_id,
  updated_at = now();
