-- Additive: historical movements remain included; existing plans keep calendar halves.
alter table public.finance_income_plans
  add column if not exists cycle_first_day smallint not null default 1 check(cycle_first_day between 1 and 28),
  add column if not exists cycle_second_day smallint not null default 16 check(cycle_second_day between 2 and 31);
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.finance_income_plans'::regclass and conname='finance_income_cycle_order') then
  alter table public.finance_income_plans add constraint finance_income_cycle_order check(cycle_first_day < cycle_second_day);
 end if;
end $$;
alter table public.transactions add column if not exists budget_included boolean not null default true;
comment on column public.transactions.budget_included is 'Expense budget classification only; false never removes a cash movement, account delta or stored split.';

-- Extend the canonical idempotent writer. Included transactions keep their old payload exactly,
-- so offline clients can safely retry a request created before this migration.
do $$declare def text;updated text;
begin
 def:=pg_get_functiondef('public.save_transaction_once(uuid,uuid,jsonb)'::regprocedure);
 if position('budget_included' in def)=0 then
  updated:=replace(def,'''original_amount'',''exchange_rate''))','''original_amount'',''exchange_rate'',''budget_included''))');
  if updated=def then raise exception 'Budget key anchor missing';end if;def:=updated;
  updated:=replace(def,' perform pg_advisory_xact_lock', E' if p_values ? ''budget_included'' and jsonb_typeof(p_values->''budget_included'') is distinct from ''boolean'' then raise check_violation using message=''Revisa si el gasto cuenta en el presupuesto.'';end if;\n if v_type=''expense'' and p_values->>''budget_included''=''false'' then v_payload:=v_payload||jsonb_build_object(''budget_included'',false);end if;\n perform pg_advisory_xact_lock');
  if updated=def then raise exception 'Budget payload anchor missing';end if;def:=updated;
  -- The underlying writer retains its allow-list; budget classification is applied within the same transaction.
  updated:=replace(def,'(v_payload-''date'')', '(v_payload-''date''-''budget_included'')');
  if updated=def then raise exception 'Budget canonical writer anchor missing';end if;def:=updated;
  updated:=replace(def,' insert into public.finance_write_requests',E' if v_payload->>''budget_included''=''false'' then update public.transactions set budget_included=false where id=v_tx and household_id=p_household_id;end if;\n insert into public.finance_write_requests');
  if updated=def then raise exception 'Budget persist anchor missing';end if;
  execute updated;
 end if;
end $$;

-- All dashboard/review readers expose the same classification; account totals remain unfiltered.
do $$declare def text;updated text;
begin
 def:=pg_get_functiondef('public.get_home_finance_source(uuid,date)'::regprocedure);
 if position('budget_included' in def)=0 then
  updated:=replace(def,'is_shared, original_currency, original_amount','is_shared, original_currency, original_amount, budget_included');
  if updated=def then raise exception 'Home source anchor missing';end if;def:=updated;
  updated:=replace(def,'user_id, month, expected_amount, first_half_amount, second_half_amount','user_id, month, expected_amount, first_half_amount, second_half_amount, cycle_first_day, cycle_second_day');
  if updated=def then raise exception 'Home cycle anchor missing';end if;execute updated;
 end if;
 def:=pg_get_functiondef('public.get_finance_fortnight_review(uuid,date,text)'::regprocedure);
 if position('budget_included' in def)=0 then
  updated:=replace(def,'''is_shared'',t.is_shared)', '''is_shared'',t.is_shared,''budget_included'',t.budget_included)');
  if updated=def then raise exception 'Review source anchor missing';end if;def:=updated;
  updated:=replace(def,'''second_half_amount'',p.second_half_amount)', '''second_half_amount'',p.second_half_amount,''cycle_first_day'',p.cycle_first_day,''cycle_second_day'',p.cycle_second_day)');
  if updated=def then raise exception 'Review cycle anchor missing';end if;execute updated;
 end if;
 def:=pg_get_functiondef('public.household_health_snapshot(uuid)'::regprocedure);
 if position('budget_included' in def)=0 then
  updated:=replace(def,E'and type=''expense''\n      and transaction_date',E'and type=''expense'' and budget_included\n      and transaction_date');
  if updated=def then raise exception 'Health budget anchor missing';end if;execute updated;
 end if;
end $$;

-- Budget usage in a calendar close excludes special funding; real balances and historical totals include it.
do $$declare def text;updated text;
begin
 def:=pg_get_functiondef('public.build_monthly_household_close(uuid,date)'::regprocedure);
 if position('v_budget_expense' in def)=0 then
  updated:=replace(def,'  v_income numeric:=0;', '  v_budget_expense numeric:=0;v_prev_budget_expense numeric:=0;v_income numeric:=0;');
  if updated=def then raise exception 'Close declaration anchor missing';end if;def:=updated;
  updated:=replace(def,'  v_balance:=v_income-v_expense-v_saving;',E'  select coalesce(sum(amount),0) into v_budget_expense from public.transactions where household_id=p_household_id and type=''expense'' and budget_included and transaction_date between v_month and v_period_end;\n  select coalesce(sum(amount),0) into v_prev_budget_expense from public.transactions where household_id=p_household_id and type=''expense'' and budget_included and transaction_date between v_prev_month and v_prev_compare_end;\n  v_balance:=v_income-v_expense-v_saving;');
  if updated=def then raise exception 'Close budget total anchor missing';end if;def:=updated;
  def:=replace(def,'then v_expense/v_budget*100','then v_budget_expense/v_budget*100');
  def:=replace(def,'then v_prev_expense/v_prev_budget*100','then v_prev_budget_expense/v_prev_budget*100');
  def:=replace(def,'v_expense>v_budget','v_budget_expense>v_budget');
  def:=replace(def,'v_expense<=v_budget','v_budget_expense<=v_budget');
  def:=replace(def,'v_expense-v_budget','v_budget_expense-v_budget');
  def:=replace(def,'''budget_usage'',round(v_budget_usage,1),', '''budget_usage'',round(v_budget_usage,1),''budget_expense'',round(v_budget_expense,2),''excluded_expense'',round(v_expense-v_budget_expense,2),');
  def:=replace(def,'''budget_usage'',round(v_prev_budget_usage,1),', '''budget_usage'',round(v_prev_budget_usage,1),''budget_expense'',round(v_prev_budget_expense,2),''excluded_expense'',round(v_prev_expense-v_prev_budget_expense,2),');
  execute def;
 end if;
end $$;

-- A pre-upgrade backup has no new columns: supply the legacy defaults before populating records.
do $$declare def text;updated text;
begin
 def:=pg_get_functiondef('public.restore_backup_table_missing(uuid,text,jsonb)'::regprocedure);
 if position('budget_included' in def)=0 then
  updated:=replace(def,'  execute format(',E'  if p_table=''transactions'' then select jsonb_agg(x||jsonb_build_object(''budget_included'',coalesce((x->>''budget_included'')::boolean,true))) into p_rows from jsonb_array_elements(p_rows) x;end if;\n  if p_table=''finance_income_plans'' then select jsonb_agg(x||jsonb_build_object(''cycle_first_day'',coalesce((x->>''cycle_first_day'')::integer,1),''cycle_second_day'',coalesce((x->>''cycle_second_day'')::integer,16))) into p_rows from jsonb_array_elements(p_rows) x;end if;\n  execute format(');
  if updated=def then raise exception 'Backup defaults anchor missing';end if;execute updated;
 end if;
end $$;

-- New monthly plans can propose the person's latest saved cycle without reclassifying earlier months.
create or replace function public.get_finance_cycle_defaults(p_household_id uuid,p_month date)
returns table(user_id uuid,cycle_first_day smallint,cycle_second_day smallint)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or public.can_view_household_module(p_household_id,'finance') is not true then
  raise insufficient_privilege using message='Necesitas acceso a Finanzas.';
 end if;
 if p_month is null or not isfinite(p_month) or extract(day from p_month)<>1 then
  raise check_violation using message='Selecciona un mes válido.';
 end if;
 return query select distinct on (p.user_id) p.user_id,p.cycle_first_day,p.cycle_second_day
 from public.finance_income_plans p
 where p.household_id=p_household_id and p.month<p_month
 order by p.user_id,p.month desc;
end $$;
revoke execute on function public.get_finance_cycle_defaults(uuid,date) from public,anon;
grant execute on function public.get_finance_cycle_defaults(uuid,date) to authenticated;
