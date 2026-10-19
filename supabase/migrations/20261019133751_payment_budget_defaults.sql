-- Only future inserts infer a default. Existing rows, plans and split responsibilities are untouched.
-- Cash, checking/debit and savings spend money already held; credit purchases consume the plan.
create or replace function household_integrity.default_payment_budget(p_household_id uuid,p_account_id uuid,p_type text)
returns boolean language sql stable security invoker set search_path='' as $$
 select not (p_type='expense' and exists (
  select 1 from public.finance_accounts a
  where a.id=p_account_id and a.household_id=p_household_id
    and a.account_class='asset' and a.account_type in ('cash','checking','savings')
 ));
$$;
revoke execute on function household_integrity.default_payment_budget(uuid,uuid,text) from public,anon;
grant execute on function household_integrity.default_payment_budget(uuid,uuid,text) to authenticated,service_role;

create or replace function household_integrity.infer_payment_budget() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.budget_included is null then
  new.budget_included:=household_integrity.default_payment_budget(new.household_id,new.account_id,new.type);
 end if;
 return new;
end $$;
revoke execute on function household_integrity.infer_payment_budget() from public,anon,authenticated;
-- NULL is an insert-time sentinel only: the BEFORE trigger fills it before the NOT NULL check.
-- Explicit true/false (including restored backups) are preserved exactly.
alter table public.transactions alter column budget_included set default null;
create or replace trigger transactions_payment_budget_default before insert on public.transactions
for each row execute function household_integrity.infer_payment_budget();

CREATE OR REPLACE FUNCTION public.save_finance_transaction(p_household_id uuid, p_payload jsonb, p_transaction_id uuid DEFAULT NULL::uuid, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_id uuid;v_recurring uuid;v_tx public.transactions%rowtype;
 v_amount numeric:=round((p_payload->>'amount')::numeric,2);
 v_payer uuid:=coalesce(nullif(p_payload->>'paid_by','')::uuid,auth.uid());
 v_category uuid:=nullif(p_payload->>'category_id','')::uuid;
 v_account uuid:=nullif(p_payload->>'account_id','')::uuid;
 v_date date:=coalesce((p_payload->>'transaction_date')::date,(now() at time zone 'America/Guatemala')::date);
 v_type text:=p_payload->>'type';v_shared boolean:=coalesce((p_payload->>'is_shared')::boolean,true);
 v_description text:=nullif(trim(p_payload->>'description'),'');
 v_recur boolean:=coalesce((p_payload->>'recurring')::boolean,false);
 v_due integer:=coalesce((p_payload->>'due_day')::int,extract(day from v_date)::int);
 v_month date:=date_trunc('month',v_date)::date;
begin
 if auth.uid() is null or not public.can_edit_household_module(p_household_id,'finance') then raise exception 'Finance edit access required'; end if;
 perform 1 from public.households where id=p_household_id for update;
 if v_amount is null or v_amount<=0 or v_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Monto inválido.'; end if;
 if v_description is null or v_type is null or v_type not in ('income','expense') then raise exception 'Movimiento inválido.'; end if;
 if p_payload ? 'budget_included' and jsonb_typeof(p_payload->'budget_included') is distinct from 'boolean' then raise check_violation using message='Revisa si el gasto cuenta en el presupuesto.';end if;
 if v_recur and (v_due<1 or v_due>31) then raise exception 'Día de pago inválido.'; end if;
 if not exists(select 1 from public.household_members where household_id=p_household_id and user_id=v_payer) then raise exception 'Payer is not a household member'; end if;
 if v_account is not null and not exists(select 1 from public.finance_accounts where id=v_account and household_id=p_household_id and active) then raise exception 'Invalid account'; end if;
 if v_category is not null and not exists(select 1 from public.budget_categories where id=v_category and household_id=p_household_id) then raise exception 'Invalid category'; end if;
 if p_transaction_id is null then
  v_id:=coalesce(p_request_id,gen_random_uuid());
  select * into v_tx from public.transactions where id=v_id;
  if found then
   if v_tx.household_id<>p_household_id or not exists(select 1 from household_integrity.finance_requests where request_id=v_id and household_id=p_household_id and actor_user_id=auth.uid() and transaction_id=v_id) then raise exception 'Request identity conflict'; end if;
   return v_id;
  end if;
  insert into public.transactions(id,household_id,description,amount,type,transaction_date,category_id,account_id,paid_by,is_shared,notes,budget_included)
  values(v_id,p_household_id,v_description,v_amount,v_type,v_date,v_category,v_account,v_payer,v_shared,nullif(trim(p_payload->>'notes'),''),(p_payload->>'budget_included')::boolean);
  insert into household_integrity.finance_requests(request_id,household_id,actor_user_id,transaction_id) values(v_id,p_household_id,auth.uid(),v_id);
 else
  select * into v_tx from public.transactions where id=p_transaction_id and household_id=p_household_id for update;
  if not found then raise exception 'Movimiento no encontrado o sin permiso.'; end if;
  v_id:=v_tx.id;v_recurring:=v_tx.recurring_transaction_id;
  update public.transactions set description=v_description,amount=v_amount,type=v_type,transaction_date=v_date,
   category_id=v_category,account_id=v_account,paid_by=v_payer,is_shared=v_shared,notes=nullif(trim(p_payload->>'notes'),''),budget_included=coalesce((p_payload->>'budget_included')::boolean,v_tx.budget_included) where id=v_id;
 end if;
 perform household_integrity.rebuild_splits(v_id);
 if v_recur then
  if v_recurring is null then
   insert into public.recurring_transactions(household_id,category_id,account_id,type,description,amount,due_day,paid_by,is_shared)
    values(p_household_id,v_category,v_account,v_type,v_description,v_amount,v_due,v_payer,v_shared) returning id into v_recurring;
   update public.transactions set recurring_transaction_id=v_recurring where id=v_id;
   insert into public.recurring_transaction_occurrences(recurring_transaction_id,household_id,period_month,due_date,status,paid_at,transaction_id)
    values(v_recurring,p_household_id,v_month,v_month+least(v_due,extract(day from(v_month+interval '1 month - 1 day'))::int)-1,'paid',now(),v_id);
  else
   update public.recurring_transactions set category_id=v_category,account_id=v_account,type=v_type,description=v_description,
    amount=v_amount,due_day=v_due,paid_by=v_payer,is_shared=v_shared where id=v_recurring and household_id=p_household_id;
  end if;
 end if;
 perform public.refresh_net_worth_snapshot(p_household_id);
 return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.save_transaction_once(p_household_id uuid, p_request_id uuid, p_values jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare original public.finance_write_requests;v_amount numeric;v_type text;v_date date;v_description text;v_notes text;
 v_category uuid;v_account uuid;v_payer uuid;v_shared boolean;v_recurring boolean;v_day integer;v_payload jsonb;v_tx uuid;
begin
 if not coalesce(public.can_edit_household_module(p_household_id,'finance'),false) then raise insufficient_privilege using message='Necesitas permiso para editar Finanzas.';end if;
 if p_request_id is null or jsonb_typeof(p_values) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_values) k where k not in ('amount','type','date','description','notes','category_id','account_id','paid_by','is_shared','recurring','due_day','original_currency','original_amount','exchange_rate','budget_included')) then raise check_violation using message='Revisa los datos del movimiento.';end if;
 v_amount:=(p_values->>'amount')::numeric;v_type:=p_values->>'type';v_date:=(p_values->>'date')::date;
 v_description:=btrim(p_values->>'description');v_notes:=nullif(btrim(p_values->>'notes'),'');
 v_category:=nullif(p_values->>'category_id','')::uuid;v_account:=nullif(p_values->>'account_id','')::uuid;v_payer:=coalesce(nullif(p_values->>'paid_by','')::uuid,auth.uid());
 v_shared:=(p_values->>'is_shared')::boolean;v_recurring:=coalesce((p_values->>'recurring')::boolean,false);
 v_day:=coalesce(nullif(p_values->>'due_day','')::integer,extract(day from v_date)::integer);
 if v_amount is null or v_amount::text in ('NaN','Infinity','-Infinity') or v_amount<=0 or v_amount>9999999999.99 or round(v_amount,2)<>v_amount
  or v_type is null or v_type not in ('expense','income') or v_date is null or not isfinite(v_date) or v_date<'1900-01-01' or v_date>'9999-12-31'
  or coalesce(length(v_description),0) not between 1 and 250 or length(v_notes)>2000 or v_shared is null or (v_recurring and v_day not between 1 and 31) then raise check_violation using message='Revisa el monto, la fecha y la descripción.';end if;
 v_payload:=jsonb_build_object('amount',v_amount,'type',v_type,'date',v_date,'description',v_description,'notes',v_notes,'category_id',v_category,'account_id',v_account,'paid_by',v_payer,'is_shared',v_shared,'recurring',v_recurring,'due_day',case when v_recurring then v_day else null end);
 if nullif(p_values->>'original_currency','') is not null then
  if p_values->>'original_currency'<>'USD' or (p_values->>'original_amount')::numeric is null or (p_values->>'exchange_rate')::numeric is null then raise check_violation using message='Revisa el monto en dólares y el tipo de cambio.';end if;
  v_payload:=v_payload||jsonb_build_object('original_currency','USD','original_amount',(p_values->>'original_amount')::numeric,'exchange_rate',(p_values->>'exchange_rate')::numeric);
 end if;
 if p_values ? 'budget_included' and jsonb_typeof(p_values->'budget_included') is distinct from 'boolean' then raise check_violation using message='Revisa si el gasto cuenta en el presupuesto.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into original from public.finance_write_requests where id=p_request_id;
 -- A retry keeps the original classification even if an account's type changed later.
 -- Legacy included requests omitted the true flag; their canonical payload stays compatible.
 if v_type='expense' and (case
   when p_values ? 'budget_included' then (p_values->>'budget_included')::boolean
   when original.id is not null then coalesce((original.payload->>'budget_included')::boolean,true)
   else household_integrity.default_payment_budget(p_household_id,v_account,v_type)
 end) is false then
  v_payload:=v_payload||jsonb_build_object('budget_included',false);
 end if;
 if original.id is not null then
  if original.household_id<>p_household_id or original.created_by<>auth.uid() or original.payload<>v_payload then raise serialization_failure using message='Esta solicitud ya se guardó con otros datos. Revisa los movimientos antes de crear uno nuevo.';end if;
  if original.transaction_id is null then raise check_violation using message='El movimiento original fue eliminado. Inicia uno nuevo si corresponde.';end if;
  return original.transaction_id;
 end if;
 -- Reuse the existing atomic movement, split and recurring engine.
 v_tx:=public.save_finance_transaction(p_household_id,(v_payload-'date')||jsonb_build_object('transaction_date',v_date,'budget_included',coalesce((v_payload->>'budget_included')::boolean,true)),null,p_request_id);
 if v_payload ? 'original_currency' then
  update public.transactions set original_currency='USD',original_amount=(v_payload->>'original_amount')::numeric,exchange_rate=(v_payload->>'exchange_rate')::numeric where id=v_tx and household_id=p_household_id;
 end if;

 insert into public.finance_write_requests(id,household_id,transaction_id,payload) values(p_request_id,p_household_id,v_tx,v_payload);
 return v_tx;
end $function$
;
