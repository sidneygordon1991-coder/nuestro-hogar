-- Preserve the private schema boundary. Invoker code must query public RLS-protected tables directly.
-- No schema USAGE grants, SECURITY DEFINER escalation, or historical data updates.
create or replace function household_integrity.infer_payment_budget() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.budget_included is null then
  new.budget_included:=not (new.type='expense' and exists (
   select 1 from public.finance_accounts a
   where a.id=new.account_id and a.household_id=new.household_id
     and a.account_class='asset' and a.account_type in ('cash','checking','savings')
  ));
 end if;
 return new;
end $$;
revoke execute on function household_integrity.infer_payment_budget() from public,anon,authenticated;
-- The old helper is no longer called by invokers; keep it private as well.
revoke execute on function household_integrity.default_payment_budget(uuid,uuid,text) from public,anon,authenticated;

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
   else not exists (select 1 from public.finance_accounts a where a.id=v_account and a.household_id=p_household_id and a.account_class='asset' and a.account_type in ('cash','checking','savings'))
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
