-- Nullable additions preserve older JSON backups. A reserve is explicitly
-- declared by the household; cash account balances are not assumed available.
alter table public.finance_household_settings
 add column emergency_fund_amount numeric(12,2),
 add column emergency_target_months integer,
 add column emergency_confirmed_on date,
 add constraint emergency_amount_valid check(emergency_fund_amount between 0 and 9999999999.99),
 add constraint emergency_target_valid check(emergency_target_months between 1 and 12),
 add constraint emergency_confirmation_valid check(emergency_confirmed_on is null or (isfinite(emergency_confirmed_on) and emergency_confirmed_on>=date '1900-01-01' and emergency_confirmed_on<date '10000-01-01'));

create function public.get_household_financial_diagnosis(p_household_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=''
as $function$
declare v_today date:=(statement_timestamp() at time zone 'America/Guatemala')::date;
 v_month date; v_source jsonb; v_accounts jsonb; v_history jsonb; v_reserve jsonb;
begin
 if auth.uid() is null or not public.can_view_household_module(p_household_id,'health') or not public.can_view_household_module(p_household_id,'finance') then raise exception 'Household health and Finance view access required' using errcode='42501';end if;
 v_month:=date_trunc('month',v_today)::date;
 v_source:=public.get_finance_fortnight_review(p_household_id,v_month,'second')->'source';
 -- Category identity lets the projection take the greater of remaining budget
 -- and unpaid recurring commitments in each category, rather than adding both.
 v_source:=jsonb_set(v_source,'{recurring}',coalesce((select jsonb_agg(item || jsonb_build_object('category_id',r.category_id) order by item->>'id') from jsonb_array_elements(v_source->'recurring') item join public.recurring_transactions r on r.id=(item->>'id')::uuid and r.household_id=p_household_id),'[]'::jsonb));
 with movements as (
  select t.account_id, sum(case when t.type='income' then t.amount else -t.amount end) delta from public.transactions t where t.household_id=p_household_id and t.transaction_date<=v_today group by t.account_id
 ), transfer_rows as (
  select t.from_account_id account_id,-t.amount delta from public.finance_transfers t where t.household_id=p_household_id and t.transfer_date<=v_today
  union all select t.to_account_id,t.amount from public.finance_transfers t where t.household_id=p_household_id and t.transfer_date<=v_today
 ), transfers as (select account_id,sum(delta) delta from transfer_rows group by account_id)
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'account_type',a.account_type,'account_class',a.account_class,'minimum_payment',a.minimum_payment,'balance',a.opening_balance+(coalesce(m.delta,0)+coalesce(t.delta,0))*case when a.account_class='liability' then -1 else 1 end) order by a.id),'[]'::jsonb) into v_accounts
 from public.finance_accounts a left join movements m on m.account_id=a.id left join transfers t on t.account_id=a.id where a.household_id=p_household_id and a.active;
 with months as (select generate_series(v_month-interval '3 months',v_month-interval '1 month',interval '1 month')::date as period_month),
 tx as (select date_trunc('month',t.transaction_date)::date as period_month,sum(t.amount) filter(where t.type='income') income,sum(t.amount) filter(where t.type='expense') expense,count(*) transaction_count from public.transactions t where t.household_id=p_household_id and t.transaction_date>=v_month-interval '3 months' and t.transaction_date<v_month group by 1),
 savings as (select date_trunc('month',g.contribution_date)::date as period_month,sum(g.amount) saving from public.goal_contributions g where g.household_id=p_household_id and g.contribution_date>=v_month-interval '3 months' and g.contribution_date<v_month group by 1)
 select jsonb_agg(jsonb_build_object('month',m.period_month,'income',coalesce(t.income,0),'expense',coalesce(t.expense,0),'saving',coalesce(s.saving,0),'transaction_count',coalesce(t.transaction_count,0)) order by m.period_month) into v_history from months m left join tx t using(period_month) left join savings s using(period_month);
 select jsonb_build_object('amount',s.emergency_fund_amount,'target_months',s.emergency_target_months,'confirmed_on',s.emergency_confirmed_on) into v_reserve from public.finance_household_settings s where s.household_id=p_household_id;
 return jsonb_build_object('month',v_month,'server_date',v_today,'generated_at',statement_timestamp(),'source',v_source,'accounts',v_accounts,'history',v_history,'reserve',v_reserve);
end;
$function$;
revoke all on function public.get_household_financial_diagnosis(uuid) from public,anon;
grant execute on function public.get_household_financial_diagnosis(uuid) to authenticated;

create function public.save_household_emergency_reserve(p_household_id uuid,p_amount numeric,p_target_months integer)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_today date:=(statement_timestamp() at time zone 'America/Guatemala')::date; v_result jsonb;
begin
 if auth.uid() is null or not public.can_edit_household_module(p_household_id,'finance') then raise exception 'Finance edit access required' using errcode='42501';end if;
 if p_amount is null or p_amount<0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2) or p_amount='NaN'::numeric or p_target_months is null or p_target_months not between 1 and 12 then raise exception 'Invalid emergency reserve' using errcode='23514';end if;
 insert into public.finance_household_settings(household_id,emergency_fund_amount,emergency_target_months,emergency_confirmed_on,updated_by,updated_at)
 values(p_household_id,p_amount,p_target_months,v_today,auth.uid(),now())
 on conflict(household_id) do update set emergency_fund_amount=excluded.emergency_fund_amount,emergency_target_months=excluded.emergency_target_months,emergency_confirmed_on=excluded.emergency_confirmed_on,updated_by=excluded.updated_by,updated_at=excluded.updated_at
 returning jsonb_build_object('amount',emergency_fund_amount,'target_months',emergency_target_months,'confirmed_on',emergency_confirmed_on) into v_result;
 if v_result is null then raise exception 'Reserve could not be saved' using errcode='42501';end if;
 return v_result;
end;
$function$;
revoke all on function public.save_household_emergency_reserve(uuid,numeric,integer) from public,anon;
grant execute on function public.save_household_emergency_reserve(uuid,numeric,integer) to authenticated;
