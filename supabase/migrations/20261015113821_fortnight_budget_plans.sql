-- Nullable allocations preserve existing monthly plans without inventing a 50/50 split.
alter table public.finance_income_plans
 add column first_half_amount numeric(12,2),
 add column second_half_amount numeric(12,2),
 add constraint income_plan_halves_valid check (
  (first_half_amount is null or first_half_amount between 0 and 9999999999.99) and
  (second_half_amount is null or second_half_amount between 0 and 9999999999.99) and
  coalesce(first_half_amount,0)+coalesce(second_half_amount,0)<=expected_amount
 );
alter table public.budget_allocations
 add column first_half_amount numeric(12,2),
 add column second_half_amount numeric(12,2),
 add constraint budget_halves_valid check (
  (first_half_amount is null or first_half_amount between 0 and 9999999999.99) and
  (second_half_amount is null or second_half_amount between 0 and 9999999999.99) and
  coalesce(first_half_amount,0)+coalesce(second_half_amount,0)<=planned_amount
 );

-- Same RLS and grants as the original tables. JSON snapshots/restore include these
-- nullable columns automatically, including when restoring a pre-fortnight backup.
comment on column public.finance_income_plans.first_half_amount is 'Expected income allocated to days 1-15; NULL means not allocated.';
comment on column public.finance_income_plans.second_half_amount is 'Expected income allocated to days 16-month end; NULL means not allocated.';
comment on column public.budget_allocations.first_half_amount is 'Monthly budget allocated to days 1-15; NULL means not allocated.';
comment on column public.budget_allocations.second_half_amount is 'Monthly budget allocated to days 16-month end; NULL means not allocated.';

-- Invoker function: does not bypass RLS or expose another household. Both quick
-- entry and full finance forms use these date-specific weights for new splits.
create or replace function public.finance_split_weights(p_household_id uuid,p_date date,p_category_id uuid default null)
returns table(user_id uuid,ratio numeric,source text,method text)
language plpgsql stable security invoker set search_path=''
as $function$
declare
 v_method text;v_category_method text;v_responsible uuid;
 v_date date:=coalesce(p_date,current_date);
begin
 if auth.uid() is null or not public.can_view_household_module(p_household_id,'finance') then
  raise exception 'Finance view access required' using errcode='42501';
 end if;
 if not isfinite(v_date) then raise exception 'Invalid date';end if;
 if p_category_id is not null and not exists(select 1 from public.budget_categories c where c.id=p_category_id and c.household_id=p_household_id) then
  raise exception 'Invalid category';
 end if;
 select s.split_method,s.responsible_user_id into v_category_method,v_responsible from public.finance_category_settings s where s.household_id=p_household_id and s.category_id=p_category_id;
 if v_category_method is not null and v_category_method<>'inherit' then v_method:=v_category_method;
 else select s.split_method into v_method from public.finance_household_settings s where s.household_id=p_household_id;end if;
 v_method:=coalesce(v_method,'equal');
 if v_method='personal' and v_responsible is null then
  select hm.user_id into v_responsible from public.household_members hm where hm.household_id=p_household_id order by hm.joined_at,hm.user_id limit 1;
 end if;
 return query
 with members as (
  select hm.user_id,
   coalesce(ip.expected_amount,ms.monthly_income,0) as monthly,
   case when extract(day from v_date)<=15 then ip.first_half_amount else ip.second_half_amount end as half,
   coalesce(case when v_category_method='custom' then cs.custom_share_percent else ms.custom_share_percent end,0) as custom
  from public.household_members hm
  left join public.finance_income_plans ip on ip.household_id=hm.household_id and ip.user_id=hm.user_id and ip.month=date_trunc('month',v_date)::date
  left join public.finance_member_settings ms on ms.household_id=hm.household_id and ms.user_id=hm.user_id
  left join public.finance_category_member_settings cs on cs.household_id=hm.household_id and cs.user_id=hm.user_id and cs.category_id=p_category_id
  where hm.household_id=p_household_id
 ), ready as (
  select coalesce(bool_and(m.monthly=0 or m.half is not null) and sum(coalesce(m.half,0))>0,false) as use_half from members m
 ), weights as (
  select m.user_id,
   case when v_method='income' then case when r.use_half then coalesce(m.half,0) else m.monthly end
        when v_method='custom' then greatest(0,m.custom)
        when v_method='personal' then case when m.user_id=v_responsible then 1 else 0 end
        else 1 end as weight,
   case when v_method='income' then case when r.use_half then 'half' else 'monthly' end else v_method end as weight_source
  from members m cross join ready r
 ), totals as (select sum(w.weight) as total,count(*) as n from weights w)
 select w.user_id,case when t.total>0 then w.weight/t.total else 1.0/nullif(t.n,0) end,
  case when t.total>0 then w.weight_source else 'equal' end,v_method
 from weights w cross join totals t order by w.user_id;
end;
$function$;
revoke all on function public.finance_split_weights(uuid,date,uuid) from public,anon;
grant execute on function public.finance_split_weights(uuid,date,uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.quick_add_transaction(p_household_id uuid, p_description text, p_amount numeric, p_type text, p_transaction_date date DEFAULT CURRENT_DATE, p_category_id uuid DEFAULT NULL::uuid, p_account_id uuid DEFAULT NULL::uuid, p_paid_by uuid DEFAULT NULL::uuid, p_is_shared boolean DEFAULT true, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_payer uuid := coalesce(p_paid_by,auth.uid());
  v_transaction_id uuid;
  v_member_count integer := 0;
  v_method text := 'equal';
  v_category_method text;
  v_responsible uuid;
  v_total_weight numeric := 0;
  v_weight numeric;
  v_cents bigint;
  v_used bigint := 0;
  v_share_cents bigint;
  v_index integer := 0;
  r record;
begin
  if v_user is null or not public.can_edit_household_module(p_household_id,'finance') then
    raise exception 'Finance edit access required';
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  if p_type not in ('income','expense') then raise exception 'Invalid transaction type'; end if;
  if nullif(trim(p_description),'') is null then raise exception 'Description is required'; end if;
  if not exists(select 1 from public.household_members where household_id=p_household_id and user_id=v_payer) then
    raise exception 'Payer is not a household member';
  end if;
  if p_category_id is not null and not exists(select 1 from public.budget_categories where id=p_category_id and household_id=p_household_id) then
    raise exception 'Invalid category';
  end if;
  if p_account_id is not null and not exists(select 1 from public.finance_accounts where id=p_account_id and household_id=p_household_id and active=true) then
    raise exception 'Invalid account';
  end if;

  insert into public.transactions(
    household_id,description,amount,type,transaction_date,category_id,account_id,paid_by,is_shared,notes
  ) values(
    p_household_id,trim(p_description),p_amount,p_type,coalesce(p_transaction_date,current_date),
    p_category_id,p_account_id,v_payer,p_is_shared,nullif(trim(p_notes),'')
  ) returning id into v_transaction_id;

  if p_type='expense' then
    if p_is_shared=false then
      insert into public.transaction_splits(transaction_id,household_id,user_id,share_amount)
      values(v_transaction_id,p_household_id,v_payer,p_amount);
    else
      -- Largest remainder allocates all cents, with no residual charged to a zero weight.
      v_cents:=round(p_amount*100)::bigint;
      insert into public.transaction_splits(transaction_id,household_id,user_id,share_amount)
      with weights as (
        select w.user_id,w.ratio from public.finance_split_weights(p_household_id,coalesce(p_transaction_date,current_date),p_category_id) w
      ), rounded as (
        select w.user_id,floor(v_cents*w.ratio)::bigint as base,
          v_cents*w.ratio-floor(v_cents*w.ratio) as fraction from weights w
      ), ranked as (
        select r.*,row_number() over(order by r.fraction desc,r.user_id) as rank,
          v_cents-sum(r.base) over() as remainder from rounded r
      )
      select v_transaction_id,p_household_id,r.user_id,
        (r.base+case when r.rank<=r.remainder then 1 else 0 end)/100.0 from ranked r;
    end if;
  end if;

  perform public.refresh_net_worth_snapshot(p_household_id);
  return v_transaction_id;
end;
$function$
;
