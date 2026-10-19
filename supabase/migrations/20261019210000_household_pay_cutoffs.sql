-- Optional until this PR is approved: run before enabling the new household settings screen.
-- Existing RLS policies on finance_household_settings remain authoritative.
alter table public.finance_household_settings
  add column if not exists first_cutoff_day integer not null default 15,
  add column if not exists second_cutoff_day integer not null default 31;

alter table public.finance_household_settings
  drop constraint if exists finance_household_settings_pay_cutoffs_check;
alter table public.finance_household_settings
  add constraint finance_household_settings_pay_cutoffs_check
  check (
    first_cutoff_day between 1 and 27
    and second_cutoff_day between first_cutoff_day + 1 and 31
  );

comment on column public.finance_household_settings.first_cutoff_day is
  'Primer corte mensual del presupuesto (13 para ciclos 29–13 y 14–28).';
comment on column public.finance_household_settings.second_cutoff_day is
  'Segundo corte mensual, 31 significa último día cuando el mes es más corto.';
