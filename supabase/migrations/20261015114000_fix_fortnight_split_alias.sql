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
