-- Smart budget category groups used by the monthly projection.
alter table public.budget_categories
  add column if not exists budget_group text not null default 'variable'
  check (budget_group in ('fixed','variable','saving'));

update public.budget_categories
set budget_group = case
  when lower(name) in ('vivienda','servicios','educación','educacion') then 'fixed'
  when lower(name) in ('ahorro','ahorros') then 'saving'
  else 'variable'
end
where budget_group = 'variable';

create index if not exists idx_budget_categories_household_group
  on public.budget_categories(household_id, budget_group);
