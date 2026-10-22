-- Permit a first fortnight such as 29–13 followed by 14–28.
-- Only validation changes: no plans, amounts, permissions or historical records are rewritten.
begin;
set local lock_timeout = '5s';
alter table public.finance_income_plans
  drop constraint if exists finance_income_cycle_order,
  drop constraint if exists finance_income_plans_cycle_first_day_check,
  drop constraint if exists finance_income_plans_cycle_second_day_check,
  drop constraint if exists finance_income_cycle_days_valid,
  add constraint finance_income_cycle_days_valid check (
    cycle_first_day between 1 and 31
    and cycle_second_day between 1 and 31
    and cycle_first_day <> cycle_second_day
    and least(cycle_first_day, cycle_second_day) <= 28
  );
comment on column public.finance_income_plans.cycle_first_day is
  'First fortnight start (1–31) in the plan month. Missing dates start on the following month''s first day.';
comment on column public.finance_income_plans.cycle_second_day is
  'Second fortnight start (1–31). When less than the first start, it falls in the following month.';
commit;
