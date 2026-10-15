-- Pure record formatting; no table access or elevated permissions.
alter function household_integrity.recurring_terms(public.recurring_transactions) set schema public;
alter function public.recurring_terms(public.recurring_transactions) rename to finance_recurring_terms;


create or replace function household_integrity.keep_occurrence_details()
returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.recurring_transactions; t public.transactions;
begin
 select * into r from public.recurring_transactions where id=new.recurring_transaction_id and household_id=new.household_id;
 if not found then raise exception 'Recurring not available in this household' using errcode='23514';end if;
 if new.details_snapshot is null then new.details_snapshot:=public.finance_recurring_terms(r);end if;
 if new.status='paid' and new.transaction_id is not null then
  select * into t from public.transactions where id=new.transaction_id and household_id=new.household_id;
  if found then new.details_snapshot:=jsonb_build_object('description',t.description,'amount',t.amount,'type',t.type,'category_id',t.category_id,'account_id',t.account_id,'paid_by',t.paid_by,'is_shared',t.is_shared);end if;
 end if;
 if new.status='pending' and not r.active then new.status:='skipped';new.transaction_id:=null;new.paid_at:=null;end if;
 return new;
end $$;

create or replace function household_integrity.sync_recurring_pending_details()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if public.finance_recurring_terms(new) is distinct from public.finance_recurring_terms(old) or new.active is distinct from old.active then
  -- Capture legacy history before changing the template. Paid rows use their
  -- actual linked movement, including a payment recorded in another month.
  update public.recurring_transaction_occurrences set details_snapshot=public.finance_recurring_terms(old)
   where household_id=old.household_id and recurring_transaction_id=old.id and status<>'pending' and details_snapshot is null;
  update public.recurring_transaction_occurrences set status='paid',paid_at=coalesce(paid_at,now())
   where household_id=old.household_id and recurring_transaction_id=old.id and status='pending' and transaction_id is not null;
  update public.recurring_transaction_occurrences set
   details_snapshot=public.finance_recurring_terms(new),
   due_date=case when new.active then period_month+(least(new.due_day,extract(day from(period_month+interval '1 month - 1 day'))::integer)-1) else due_date end,
   status=case when new.active then 'pending' else 'skipped' end,updated_at=now()
   where household_id=old.household_id and recurring_transaction_id=old.id and status='pending';
 end if;
 return new;
end $$;

create or replace function public.manage_finance_recurring(p_household_id uuid,p_recurring_id uuid,p_values jsonb,p_expected jsonb,p_delete boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.recurring_transactions; v public.recurring_transactions;
begin
 if auth.uid() is null or not public.can_edit_household_module(p_household_id,'finance') then raise exception 'Finance edit access required' using errcode='42501';end if;
 select * into r from public.recurring_transactions where id=p_recurring_id and household_id=p_household_id for update;
 if not found or not r.active then raise exception 'El recurrente cambió o ya fue eliminado. Actualiza la vista.' using errcode='40001';end if;
 if p_expected is null or p_expected is distinct from public.finance_recurring_terms(r) then raise exception 'El recurrente cambió. Actualiza la vista antes de guardar.' using errcode='40001';end if;
 if p_delete is null then raise exception 'Invalid action' using errcode='23514';end if;
 if p_delete then update public.recurring_transactions set active=false where id=r.id and household_id=p_household_id;return r.id;end if;
 if p_values is null or jsonb_typeof(p_values)<>'object' or not(p_values ?& array['description','amount','type','due_day','category_id','account_id','paid_by','is_shared']) or (p_values-array['description','amount','type','due_day','category_id','account_id','paid_by','is_shared'])<>'{}'::jsonb then raise exception 'Invalid recurring fields' using errcode='23514';end if;
 if (p_values->>'amount')::numeric<>round((p_values->>'amount')::numeric,2) then raise exception 'Usa como máximo dos decimales.' using errcode='23514';end if;
 v:=jsonb_populate_record(r,p_values);v.description:=btrim(v.description);
 if v.description is null or char_length(v.description) not between 1 and 250 or v.amount is null or v.amount<=0 or v.amount>9999999999.99 or v.amount='NaN'::numeric or v.type is null or v.type not in ('income','expense') or v.due_day is null or v.due_day not between 1 and 31 or v.is_shared is null then raise exception 'Revisa el nombre, monto y día del recurrente.' using errcode='23514';end if;
 update public.recurring_transactions set description=v.description,amount=v.amount,type=v.type,due_day=v.due_day,category_id=v.category_id,account_id=v.account_id,paid_by=v.paid_by,is_shared=v.is_shared where id=r.id and household_id=p_household_id;
 return r.id;
end $$;
