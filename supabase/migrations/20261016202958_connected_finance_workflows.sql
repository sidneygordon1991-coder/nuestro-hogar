-- Additive workflows. Existing financial records and permissions remain intact.
create table public.goal_budget_links (
 household_id uuid not null references public.households(id) on delete cascade,
 goal_id uuid not null references public.savings_goals(id) on delete cascade,
 month date not null check(extract(day from month)=1),
 category_id uuid not null references public.budget_categories(id) on delete cascade,
 primary key(goal_id,month)
);
create index goal_budget_links_household_month on public.goal_budget_links(household_id,month,category_id);
alter table public.goal_budget_links enable row level security;
grant select,insert,update,delete on public.goal_budget_links to authenticated;
create policy goal_links_view on public.goal_budget_links for select to authenticated using(public.can_view_household_module(household_id,'finance'));
create policy goal_links_edit on public.goal_budget_links for all to authenticated using(public.can_edit_household_module(household_id,'finance')) with check(public.can_edit_household_module(household_id,'finance'));
create function household_integrity.validate_goal_budget_link() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.savings_goals where id=new.goal_id and household_id=new.household_id)
 or not exists(select 1 from public.budget_categories where id=new.category_id and household_id=new.household_id and budget_group='saving') then
  raise exception 'La meta y el rubro de ahorro deben pertenecer al mismo hogar.' using errcode='23514';end if;
 return new;
end $$;
create trigger validate_goal_budget_link before insert or update on public.goal_budget_links for each row execute function household_integrity.validate_goal_budget_link();
create trigger platform_guard_archive before insert or update or delete on public.goal_budget_links for each row execute function platform_security.guard_archived_write();
create function household_integrity.guard_linked_savings_category() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.budget_group='saving' and new.budget_group<>'saving' and exists(select 1 from public.goal_budget_links where category_id=old.id) then raise exception 'Desvincula las metas de este rubro antes de cambiar su tipo.' using errcode='23514';end if;
 return new;
end $$;
create trigger guard_linked_savings_category before update of budget_group on public.budget_categories for each row execute function household_integrity.guard_linked_savings_category();

create table public.shopping_checkouts (
 id uuid primary key,
 household_id uuid not null references public.households(id) on delete cascade,
 list_id uuid references public.lists(id) on delete set null,
 transaction_id uuid unique references public.transactions(id) on delete set null,
 request jsonb not null,
 list_title text not null,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now()
);
create index shopping_checkouts_household on public.shopping_checkouts(household_id,created_at desc);
create table public.shopping_checkout_items (
 checkout_id uuid not null references public.shopping_checkouts(id),
 household_id uuid not null references public.households(id) on delete cascade,
 item_id uuid unique references public.list_items(id) on delete set null,
 snapshot jsonb not null,
 id uuid primary key default gen_random_uuid()
);
create index shopping_checkout_items_checkout on public.shopping_checkout_items(checkout_id);
create index shopping_checkout_items_household on public.shopping_checkout_items(household_id);
alter table public.shopping_checkouts enable row level security;
alter table public.shopping_checkout_items enable row level security;
grant select,insert on public.shopping_checkouts,public.shopping_checkout_items to authenticated;
create policy checkout_view on public.shopping_checkouts for select to authenticated using(public.can_view_household_module(household_id,'finance') and public.can_view_household_module(household_id,'lists'));
create policy checkout_create on public.shopping_checkouts for insert to authenticated with check(created_by=auth.uid() and public.can_edit_household_module(household_id,'finance') and public.can_edit_household_module(household_id,'lists'));
create policy checkout_item_view on public.shopping_checkout_items for select to authenticated using(public.can_view_household_module(household_id,'finance') and public.can_view_household_module(household_id,'lists'));
create policy checkout_item_create on public.shopping_checkout_items for insert to authenticated with check(public.can_edit_household_module(household_id,'finance') and public.can_edit_household_module(household_id,'lists'));
create function household_integrity.validate_shopping_checkout() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.transaction_id is null and current_user not in ('postgres','supabase_admin')) or (new.transaction_id is not null and not exists(select 1 from public.transactions t where t.id=new.transaction_id and t.household_id=new.household_id and t.type='expense'))
 or (new.list_id is null and current_user not in ('postgres','supabase_admin')) or (new.list_id is not null and not exists(select 1 from public.lists l where l.id=new.list_id and l.household_id=new.household_id and l.list_type='shopping')) then
  raise exception 'La compra y el gasto deben pertenecer al mismo hogar.' using errcode='23514';end if;
 return new;
end $$;
create function household_integrity.validate_shopping_checkout_item() returns trigger language plpgsql security invoker set search_path='' as $$
declare i public.list_items;c public.shopping_checkouts;
begin
 select * into c from public.shopping_checkouts where id=new.checkout_id and household_id=new.household_id and (created_by=auth.uid() or current_user in ('postgres','supabase_admin'));
 if not found then raise exception 'Compra no disponible.' using errcode='42501';end if;
 if current_user in ('postgres','supabase_admin') then
  if jsonb_typeof(new.snapshot)<>'object' or (new.item_id is not null and not exists(select 1 from public.list_items where id=new.item_id and household_id=new.household_id and list_id=c.list_id)) then raise exception 'Evidencia de compra inválida.' using errcode='23514';end if;
  return new;
 end if;
 select * into i from public.list_items where id=new.item_id and household_id=new.household_id and list_id=c.list_id and completed for update;
 if not found then raise exception 'Solo puedes incluir elementos comprados de esta lista.' using errcode='23514';end if;
 new.snapshot:=jsonb_build_object('id',i.id,'text',i.text,'quantity',i.quantity,'notes',i.notes);
 return new;
end $$;
create trigger validate_shopping_checkout before insert on public.shopping_checkouts for each row execute function household_integrity.validate_shopping_checkout();
create trigger validate_shopping_checkout_item before insert on public.shopping_checkout_items for each row execute function household_integrity.validate_shopping_checkout_item();
create trigger platform_guard_archive before insert or update or delete on public.shopping_checkouts for each row execute function platform_security.guard_archived_write();
create trigger platform_guard_archive before insert or update or delete on public.shopping_checkout_items for each row execute function platform_security.guard_archived_write();

create function public.checkout_shopping_purchase(p_household_id uuid,p_request_id uuid,p_list_id uuid,p_item_ids uuid[],p_amount numeric,p_date date,p_category_id uuid,p_account_id uuid,p_paid_by uuid,p_is_shared boolean,p_description text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare req jsonb;old public.shopping_checkouts;tx uuid;l public.lists;ids uuid[];n integer;detail text;
begin
 if auth.uid() is null or not public.can_edit_household_module(p_household_id,'finance') or not public.can_edit_household_module(p_household_id,'lists') then raise exception 'Necesitas editar Listas y Finanzas para registrar la compra.' using errcode='42501';end if;
 if p_request_id is null or p_list_id is null or p_item_ids is null or cardinality(p_item_ids) not between 1 and 500 or p_amount is null or p_amount='NaN'::numeric or p_amount<=0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2) or p_date is null or p_date>(now() at time zone 'America/Guatemala')::date or p_is_shared is null or length(trim(coalesce(p_description,''))) not between 1 and 250 then raise exception 'Revisa la selección, el monto y la fecha de compra.' using errcode='23514';end if;
 select array_agg(x order by x) into ids from unnest(p_item_ids) x;
 if exists(select 1 from unnest(ids) x where x is null) or (select count(distinct x) from unnest(ids) x)<>cardinality(ids) then raise exception 'La selección contiene elementos repetidos.' using errcode='23514';end if;
 req:=jsonb_build_object('list_id',p_list_id,'items',ids,'amount',p_amount,'date',p_date,'category_id',p_category_id,'account_id',p_account_id,'paid_by',coalesce(p_paid_by,auth.uid()),'is_shared',p_is_shared,'description',trim(p_description));
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into old from public.shopping_checkouts where id=p_request_id;
 if found then
  if old.household_id<>p_household_id or old.created_by<>auth.uid() or old.request<>req then raise exception 'La solicitud ya se usó con otros datos.' using errcode='40001';end if;
  if old.transaction_id is null then raise exception 'El gasto original fue eliminado. Revisa el historial antes de registrar otro.' using errcode='40001';end if;
  return old.transaction_id;
 end if;
 select * into l from public.lists where id=p_list_id and household_id=p_household_id and list_type='shopping' for update;
 if not found then raise exception 'La lista de compras no está disponible.' using errcode='42501';end if;
 perform 1 from public.list_items where id=any(ids) and household_id=p_household_id and list_id=p_list_id order by id for update;
 select count(*) into n from public.list_items i where i.id=any(ids) and i.household_id=p_household_id and i.list_id=p_list_id and i.completed and not exists(select 1 from public.shopping_checkout_items used where used.item_id=i.id);
 if n<>cardinality(ids) then raise exception 'Hay elementos pendientes, eliminados o ya vinculados a otro gasto. Actualiza la lista.' using errcode='40001';end if;
 if p_category_id is not null and not exists(select 1 from public.budget_categories where id=p_category_id and household_id=p_household_id and budget_group<>'saving') then raise exception 'Elige un rubro de gasto de este hogar.' using errcode='23514';end if;
 select string_agg(i.text||case when i.quantity is null then '' else ' · '||i.quantity end,E'\n' order by i.sort_order,i.id) into detail from public.list_items i where i.id=any(ids);
 tx:=public.quick_add_transaction(p_household_id,trim(p_description),p_amount,'expense',p_date,p_category_id,p_account_id,coalesce(p_paid_by,auth.uid()),p_is_shared,'Compra de lista: '||l.title||E'\n'||detail);
 insert into public.shopping_checkouts(id,household_id,list_id,transaction_id,request,list_title) values(p_request_id,p_household_id,p_list_id,tx,req,l.title);
 insert into public.shopping_checkout_items(checkout_id,household_id,item_id,snapshot) select p_request_id,p_household_id,x,'{}'::jsonb from unnest(ids) x;
 return tx;
end $$;

create function public.get_account_book_state(p_household_id uuid,p_account_id uuid,p_cutoff date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a public.finance_accounts;ts jsonb;fs jsonb;balance numeric;
begin
 if auth.uid() is null or not public.can_view_household_module(p_household_id,'finance') then raise exception 'Necesitas acceso a Finanzas.' using errcode='42501';end if;
 if p_cutoff is null or p_cutoff>(now() at time zone 'America/Guatemala')::date then raise exception 'Elige una fecha hasta hoy.' using errcode='23514';end if;
 select * into a from public.finance_accounts where id=p_account_id and household_id=p_household_id;
 if not found then raise exception 'Cuenta no disponible.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'amount',amount,'type',type,'date',transaction_date) order by id),'[]') into ts from public.transactions where household_id=p_household_id and account_id=p_account_id and transaction_date<=p_cutoff;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'amount',amount,'from',from_account_id,'to',to_account_id,'date',transfer_date) order by id),'[]') into fs from public.finance_transfers where household_id=p_household_id and (from_account_id=p_account_id or to_account_id=p_account_id) and transfer_date<=p_cutoff;
 balance:=a.opening_balance+coalesce((select sum((x->>'amount')::numeric*case when (x->>'type'='income')=(a.account_class='asset') then 1 else -1 end) from jsonb_array_elements(ts) x),0)
 +coalesce((select sum((x->>'amount')::numeric*case when (x->>'to'=p_account_id::text)=(a.account_class='asset') then 1 else -1 end) from jsonb_array_elements(fs) x),0);
 return jsonb_build_object('balance',balance,'fingerprint',md5(jsonb_build_object('opening',a.opening_balance,'class',a.account_class,'transactions',ts,'transfers',fs)::text),'cutoff',p_cutoff,'transaction_count',jsonb_array_length(ts),'transfer_count',jsonb_array_length(fs));
end $$;

create table public.account_reconciliations (
 id uuid primary key,
 household_id uuid not null references public.households(id) on delete cascade,
 account_id uuid not null references public.finance_accounts(id),
 cutoff date not null,
 confirmed_balance numeric(14,2) not null check(confirmed_balance<>'NaN'::numeric),
 book_balance numeric(16,2) not null,
 fingerprint text not null,
 notes text not null default '' check(length(notes)<=1000),
 source text not null default 'confirmation' check(source in ('confirmation','restored')),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now()
);
create index account_reconciliations_scope on public.account_reconciliations(household_id,account_id,cutoff desc,created_at desc);
alter table public.account_reconciliations enable row level security;
grant select,insert on public.account_reconciliations to authenticated;
create policy reconciliation_view on public.account_reconciliations for select to authenticated using(public.can_view_household_module(household_id,'finance'));
create policy reconciliation_create on public.account_reconciliations for insert to authenticated with check(created_by=auth.uid() and public.can_edit_household_module(household_id,'finance'));
create function household_integrity.validate_reconciliation() returns trigger language plpgsql security invoker set search_path='' as $$
declare state jsonb;
begin
 if current_user in ('postgres','supabase_admin') then
  if not exists(select 1 from public.finance_accounts where id=new.account_id and household_id=new.household_id) or new.cutoff>(now() at time zone 'America/Guatemala')::date or new.book_balance='NaN'::numeric or new.fingerprint!~'^[a-f0-9]{32}$' then raise exception 'Comparación importada inválida.' using errcode='23514';end if;
  new.source:='restored';return new;
 end if;
 new.source:='confirmation';
 state:=public.get_account_book_state(new.household_id,new.account_id,new.cutoff);
 if new.fingerprint is distinct from state->>'fingerprint' then raise exception 'La cuenta cambió. Actualiza el cálculo antes de confirmar.' using errcode='40001';end if;
 new.book_balance:=(state->>'balance')::numeric;new.created_by:=auth.uid();
 return new;
end $$;
create trigger validate_reconciliation before insert on public.account_reconciliations for each row execute function household_integrity.validate_reconciliation();
create trigger platform_guard_archive before insert or update or delete on public.account_reconciliations for each row execute function platform_security.guard_archived_write();
create function public.confirm_account_reconciliation(p_household_id uuid,p_request_id uuid,p_account_id uuid,p_cutoff date,p_confirmed_balance numeric,p_fingerprint text,p_notes text default '')
returns uuid language plpgsql security invoker set search_path='' as $$
declare old public.account_reconciliations;
begin
 if auth.uid() is null or not public.can_edit_household_module(p_household_id,'finance') then raise exception 'Necesitas editar Finanzas.' using errcode='42501';end if;
 if p_request_id is null or p_confirmed_balance is null or p_confirmed_balance='NaN'::numeric or abs(p_confirmed_balance)>9999999999.99 or p_confirmed_balance<>round(p_confirmed_balance,2) or p_notes is null or length(p_notes)>1000 then raise exception 'Revisa el saldo y las notas.' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into old from public.account_reconciliations where id=p_request_id;
 if found then
  if old.household_id=p_household_id and old.account_id=p_account_id and old.created_by=auth.uid() and old.cutoff=p_cutoff and old.confirmed_balance=p_confirmed_balance and old.fingerprint=p_fingerprint and old.notes=p_notes then return old.id;end if;
  raise exception 'La solicitud ya existe con otros datos.' using errcode='40001';
 end if;
 insert into public.account_reconciliations(id,household_id,account_id,cutoff,confirmed_balance,book_balance,fingerprint,notes) values(p_request_id,p_household_id,p_account_id,p_cutoff,p_confirmed_balance,0,p_fingerprint,p_notes);
 return p_request_id;
end $$;

revoke all on function public.checkout_shopping_purchase(uuid,uuid,uuid,uuid[],numeric,date,uuid,uuid,uuid,boolean,text),public.get_account_book_state(uuid,uuid,date),public.confirm_account_reconciliation(uuid,uuid,uuid,date,numeric,text,text) from public,anon;
grant execute on function public.checkout_shopping_purchase(uuid,uuid,uuid,uuid[],numeric,date,uuid,uuid,uuid,boolean,text),public.get_account_book_state(uuid,uuid,date),public.confirm_account_reconciliation(uuid,uuid,uuid,date,numeric,text,text) to authenticated;
revoke all on function household_integrity.validate_goal_budget_link(),household_integrity.guard_linked_savings_category(),household_integrity.validate_shopping_checkout(),household_integrity.validate_shopping_checkout_item(),household_integrity.validate_reconciliation() from public,anon,authenticated;
create function public.get_connected_finance_capability(p_household_id uuid) returns boolean language sql stable security invoker set search_path='' as $$ select auth.uid() is not null and public.can_view_household_module(p_household_id,'finance') $$;
revoke all on function public.get_connected_finance_capability(uuid) from public,anon;
grant execute on function public.get_connected_finance_capability(uuid) to authenticated;
