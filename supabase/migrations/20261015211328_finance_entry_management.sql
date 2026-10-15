-- Optional history details preserve old backups and keep paid/skipped occurrences
-- independent of later changes to a recurring template. No ledger backfill.
alter table public.recurring_transaction_occurrences add column details_snapshot jsonb;
create function household_integrity.recurring_terms(p_row public.recurring_transactions)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('description',p_row.description,'amount',p_row.amount,'type',p_row.type,'due_day',p_row.due_day,'category_id',p_row.category_id,'account_id',p_row.account_id,'paid_by',p_row.paid_by,'is_shared',p_row.is_shared)
$$;
revoke all on function household_integrity.recurring_terms(public.recurring_transactions) from public,anon;
grant execute on function household_integrity.recurring_terms(public.recurring_transactions) to authenticated;

create function household_integrity.keep_occurrence_details()
returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.recurring_transactions; t public.transactions;
begin
 select * into r from public.recurring_transactions where id=new.recurring_transaction_id and household_id=new.household_id;
 if not found then raise exception 'Recurring not available in this household' using errcode='23514';end if;
 if new.details_snapshot is null then new.details_snapshot:=household_integrity.recurring_terms(r);end if;
 if new.status='paid' and new.transaction_id is not null then
  select * into t from public.transactions where id=new.transaction_id and household_id=new.household_id;
  if found then new.details_snapshot:=jsonb_build_object('description',t.description,'amount',t.amount,'type',t.type,'category_id',t.category_id,'account_id',t.account_id,'paid_by',t.paid_by,'is_shared',t.is_shared);end if;
 end if;
 if new.status='pending' and not r.active then new.status:='skipped';new.transaction_id:=null;new.paid_at:=null;end if;
 return new;
end $$;
create trigger occurrence_details_before_write before insert or update on public.recurring_transaction_occurrences for each row execute function household_integrity.keep_occurrence_details();

create function household_integrity.sync_recurring_pending_details()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if household_integrity.recurring_terms(new) is distinct from household_integrity.recurring_terms(old) or new.active is distinct from old.active then
  -- Capture legacy history before changing the template. Paid rows use their
  -- actual linked movement, including a payment recorded in another month.
  update public.recurring_transaction_occurrences set details_snapshot=household_integrity.recurring_terms(old)
   where household_id=old.household_id and recurring_transaction_id=old.id and status<>'pending' and details_snapshot is null;
  update public.recurring_transaction_occurrences set status='paid',paid_at=coalesce(paid_at,now())
   where household_id=old.household_id and recurring_transaction_id=old.id and status='pending' and transaction_id is not null;
  update public.recurring_transaction_occurrences set
   details_snapshot=household_integrity.recurring_terms(new),
   due_date=case when new.active then period_month+(least(new.due_day,extract(day from(period_month+interval '1 month - 1 day'))::integer)-1) else due_date end,
   status=case when new.active then 'pending' else 'skipped' end,updated_at=now()
   where household_id=old.household_id and recurring_transaction_id=old.id and status='pending';
 end if;
 return new;
end $$;
create trigger recurring_pending_details_before_update before update on public.recurring_transactions for each row execute function household_integrity.sync_recurring_pending_details();

create function household_integrity.sync_paid_occurrence_details()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.recurring_transaction_occurrences set details_snapshot=jsonb_build_object('description',new.description,'amount',new.amount,'type',new.type,'category_id',new.category_id,'account_id',new.account_id,'paid_by',new.paid_by,'is_shared',new.is_shared)
 where household_id=new.household_id and transaction_id=new.id and status='paid';return new;
end $$;
create trigger transaction_paid_details_after_update after update of description,amount,type,category_id,account_id,paid_by,is_shared on public.transactions for each row execute function household_integrity.sync_paid_occurrence_details();

-- One template update also updates its unpaid occurrences. Locks and expected
-- terms reject stale editor forms; RLS and existing integrity/archive guards apply.
create function public.manage_finance_recurring(p_household_id uuid,p_recurring_id uuid,p_values jsonb,p_expected jsonb,p_delete boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.recurring_transactions; v public.recurring_transactions;
begin
 if auth.uid() is null or not public.can_edit_household_module(p_household_id,'finance') then raise exception 'Finance edit access required' using errcode='42501';end if;
 select * into r from public.recurring_transactions where id=p_recurring_id and household_id=p_household_id for update;
 if not found or not r.active then raise exception 'El recurrente cambió o ya fue eliminado. Actualiza la vista.' using errcode='40001';end if;
 if p_expected is null or p_expected is distinct from household_integrity.recurring_terms(r) then raise exception 'El recurrente cambió. Actualiza la vista antes de guardar.' using errcode='40001';end if;
 if p_delete is null then raise exception 'Invalid action' using errcode='23514';end if;
 if p_delete then update public.recurring_transactions set active=false where id=r.id and household_id=p_household_id;return r.id;end if;
 if p_values is null or jsonb_typeof(p_values)<>'object' or not(p_values ?& array['description','amount','type','due_day','category_id','account_id','paid_by','is_shared']) or (p_values-array['description','amount','type','due_day','category_id','account_id','paid_by','is_shared'])<>'{}'::jsonb then raise exception 'Invalid recurring fields' using errcode='23514';end if;
 if (p_values->>'amount')::numeric<>round((p_values->>'amount')::numeric,2) then raise exception 'Usa como máximo dos decimales.' using errcode='23514';end if;
 v:=jsonb_populate_record(r,p_values);v.description:=btrim(v.description);
 if v.description is null or char_length(v.description) not between 1 and 250 or v.amount is null or v.amount<=0 or v.amount>9999999999.99 or v.amount='NaN'::numeric or v.type is null or v.type not in ('income','expense') or v.due_day is null or v.due_day not between 1 and 31 or v.is_shared is null then raise exception 'Revisa el nombre, monto y día del recurrente.' using errcode='23514';end if;
 update public.recurring_transactions set description=v.description,amount=v.amount,type=v.type,due_day=v.due_day,category_id=v.category_id,account_id=v.account_id,paid_by=v.paid_by,is_shared=v.is_shared where id=r.id and household_id=p_household_id;
 return r.id;
end $$;
revoke all on function public.manage_finance_recurring(uuid,uuid,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.manage_finance_recurring(uuid,uuid,jsonb,jsonb,boolean) to authenticated;

-- Paying is atomic and retry-safe. A concurrent edit/retirement cannot leave a
-- movement unlinked or create two payments for the same occurrence.
create function public.pay_finance_recurring_occurrence(p_household_id uuid,p_occurrence_id uuid,p_expected_amount numeric,p_expected_due_date date)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.recurring_transactions;o public.recurring_transaction_occurrences;t uuid;rid uuid;
begin
 if auth.uid() is null or not public.can_edit_household_module(p_household_id,'finance') then raise exception 'Finance edit access required' using errcode='42501';end if;
 select recurring_transaction_id into rid from public.recurring_transaction_occurrences where id=p_occurrence_id and household_id=p_household_id;
 select * into r from public.recurring_transactions where id=rid and household_id=p_household_id for update;
 if not found then raise exception 'Recurrente no disponible.' using errcode='42501';end if;
 select * into o from public.recurring_transaction_occurrences where id=p_occurrence_id and household_id=p_household_id for update;
 if not found then raise exception 'Vencimiento no disponible.' using errcode='42501';end if;
 if o.status='paid' and o.transaction_id is not null then return o.transaction_id;end if;
 if not r.active or o.status<>'pending' then raise exception 'Este vencimiento ya no está pendiente.' using errcode='40001';end if;
 if p_expected_amount is distinct from r.amount or p_expected_due_date is distinct from o.due_date then raise exception 'El pago cambió. Actualiza la vista antes de registrarlo.' using errcode='40001';end if;
 t:=public.quick_add_transaction(p_household_id=>p_household_id,p_description=>r.description,p_amount=>r.amount,p_type=>r.type,p_transaction_date=>(statement_timestamp() at time zone 'America/Guatemala')::date,p_category_id=>r.category_id,p_account_id=>r.account_id,p_paid_by=>coalesce(r.paid_by,auth.uid()),p_is_shared=>r.is_shared,p_notes=>'Pago recurrente');
 update public.transactions set recurring_transaction_id=r.id where id=t and household_id=p_household_id;
 update public.recurring_transaction_occurrences set status='paid',transaction_id=t,paid_at=now(),updated_at=now() where id=o.id and household_id=p_household_id;
 return t;
end $$;
revoke all on function public.pay_finance_recurring_occurrence(uuid,uuid,numeric,date) from public,anon;
grant execute on function public.pay_finance_recurring_occurrence(uuid,uuid,numeric,date) to authenticated;
revoke all on function household_integrity.keep_occurrence_details(),household_integrity.sync_recurring_pending_details(),household_integrity.sync_paid_occurrence_details() from public,anon;

create or replace function public.get_finance_fortnight_review(p_household_id uuid,p_month date,p_period text)
returns jsonb language plpgsql stable security invoker set search_path=''
as $function$
declare v_end date;v_source jsonb;v_review jsonb;
begin
 if auth.uid() is null or not public.can_view_household_module(p_household_id,'finance') then raise exception 'Finance view access required' using errcode='42501';end if;
 if p_month is null or not isfinite(p_month) or p_month<date '1900-01-01' or p_month>=date '10000-01-01' or extract(day from p_month)<>1 or p_period is null or p_period not in ('first','second') then raise exception 'Invalid review period';end if;
 v_end:=case when p_period='first' then p_month+14 else (p_month+interval '1 month - 1 day')::date end;
 select jsonb_build_object(
  'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',hm.user_id,'full_name',coalesce(nullif(p.full_name,''),'Integrante')) order by hm.user_id) from public.household_members hm left join public.profiles p on p.id=hm.user_id where hm.household_id=p_household_id),'[]'::jsonb),
  'income_plans',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'month',p.month,'expected_amount',p.expected_amount,'first_half_amount',p.first_half_amount,'second_half_amount',p.second_half_amount) order by p.user_id) from public.finance_income_plans p where p.household_id=p_household_id and p.month=p_month),'[]'::jsonb),
  'allocations',coalesce((select jsonb_agg(jsonb_build_object('category_id',a.category_id,'month',a.month,'planned_amount',a.planned_amount,'first_half_amount',a.first_half_amount,'second_half_amount',a.second_half_amount) order by a.category_id) from public.budget_allocations a where a.household_id=p_household_id and a.month=p_month),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'budget_group',c.budget_group) order by c.id) from public.budget_categories c where c.household_id=p_household_id),'[]'::jsonb),
  'transactions',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'description',t.description,'amount',t.amount,'type',t.type,'transaction_date',t.transaction_date,'category_id',t.category_id,'paid_by',t.paid_by,'is_shared',t.is_shared) order by t.id) from public.transactions t where t.household_id=p_household_id and t.transaction_date between p_month and v_end),'[]'::jsonb),
  'savings',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'amount',g.amount,'contribution_date',g.contribution_date) order by g.id) from public.goal_contributions g where g.household_id=p_household_id and g.contribution_date between p_month and v_end),'[]'::jsonb),
  'splits',coalesce((select jsonb_agg(jsonb_build_object('transaction_id',s.transaction_id,'user_id',s.user_id,'share_amount',s.share_amount) order by s.transaction_id,s.user_id) from public.transaction_splits s join public.transactions t on t.id=s.transaction_id and t.household_id=s.household_id where s.household_id=p_household_id and t.transaction_date between p_month and v_end),'[]'::jsonb),
  'settings',(select jsonb_build_object('split_method',s.split_method) from public.finance_household_settings s where s.household_id=p_household_id),
  'member_settings',coalesce((select jsonb_agg(jsonb_build_object('user_id',s.user_id,'monthly_income',s.monthly_income,'custom_share_percent',s.custom_share_percent) order by s.user_id) from public.finance_member_settings s where s.household_id=p_household_id),'[]'::jsonb),
  'category_settings',coalesce((select jsonb_agg(jsonb_build_object('category_id',s.category_id,'split_method',s.split_method,'responsible_user_id',s.responsible_user_id) order by s.category_id) from public.finance_category_settings s where s.household_id=p_household_id),'[]'::jsonb),
  'category_member_settings',coalesce((select jsonb_agg(jsonb_build_object('category_id',s.category_id,'user_id',s.user_id,'custom_share_percent',s.custom_share_percent) order by s.category_id,s.user_id) from public.finance_category_member_settings s where s.household_id=p_household_id),'[]'::jsonb),
  'recurring',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'description',r.description,'amount',r.amount,'type',r.type,'active',r.active,'due_day',r.due_day,'created_at',r.created_at) order by r.id) from public.recurring_transactions r where r.household_id=p_household_id and ((r.active and r.created_at::date<=v_end) or exists(select 1 from public.recurring_transaction_occurrences o where o.recurring_transaction_id=r.id and o.household_id=p_household_id and o.due_date between p_month and v_end))),'[]'::jsonb),
  'occurrences',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'recurring_transaction_id',o.recurring_transaction_id,'due_date',o.due_date,'status',o.status,'transaction_id',o.transaction_id)||case when o.details_snapshot is null then '{}'::jsonb else jsonb_build_object('details_snapshot',o.details_snapshot) end order by o.id) from public.recurring_transaction_occurrences o where o.household_id=p_household_id and o.due_date between p_month and v_end),'[]'::jsonb)
 ) into v_source;
 select to_jsonb(r) into v_review from public.finance_fortnight_reviews r where r.household_id=p_household_id and r.month=p_month and r.period=p_period;
 return jsonb_build_object('source',v_source,'fingerprint',md5(v_source::text),'server_date',(statement_timestamp() at time zone 'America/Guatemala')::date,'review',v_review);
end;
$function$;
revoke all on function public.get_finance_fortnight_review(uuid,date,text) from public,anon;
grant execute on function public.get_finance_fortnight_review(uuid,date,text) to authenticated;
