-- A review records the household's acknowledgement of a loaded summary. It never
-- freezes, edits or pays transactions. Source fingerprints detect later changes.
create table public.finance_fortnight_reviews (
 household_id uuid not null references public.households(id) on delete cascade,
 month date not null check (month>=date '1900-01-01' and month<date '10000-01-01' and extract(day from month)=1),
 period text not null check(period in ('first','second')),
 source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{32}$'),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=65536),
 checks jsonb not null check(octet_length(checks::text)<=256 and jsonb_typeof(checks)='object' and checks @> '{"income":true,"payments":true,"contributions":true}'::jsonb),
 acknowledged_pending boolean not null default false,
 notes text check(char_length(notes)<=2000),
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz not null default now(),
 primary key(household_id,month,period),
 constraint fortnight_snapshot_identity check (coalesce((
  snapshot @> '{"schema_version":1}'::jsonb and
  snapshot->>'month'=month::text and snapshot->>'period'=period and
  jsonb_typeof(snapshot->'financial')='object' and jsonb_typeof(snapshot->'people')='array' and
  jsonb_typeof(snapshot->'issues')='array' and jsonb_typeof(snapshot->'settlements')='array' and jsonb_typeof(snapshot->'payments')='array' and snapshot ?& array['start','end']
 ),false))
);
create index finance_fortnight_reviews_reviewer_idx on public.finance_fortnight_reviews(reviewed_by);
alter table public.finance_fortnight_reviews enable row level security;
revoke all on public.finance_fortnight_reviews from public,anon,authenticated;
grant select,insert,update,delete on public.finance_fortnight_reviews to authenticated;
create policy fortnight_reviews_view on public.finance_fortnight_reviews for select to authenticated using(public.can_view_household_module(household_id,'finance'));
create policy fortnight_reviews_insert on public.finance_fortnight_reviews for insert to authenticated with check(public.can_edit_household_module(household_id,'finance') and reviewed_by=(select auth.uid()));
create policy fortnight_reviews_update on public.finance_fortnight_reviews for update to authenticated using(public.can_edit_household_module(household_id,'finance')) with check(public.can_edit_household_module(household_id,'finance') and reviewed_by=(select auth.uid()));
create policy fortnight_reviews_delete on public.finance_fortnight_reviews for delete to authenticated using(public.can_edit_household_module(household_id,'finance'));

-- Read one consistent snapshot for the guide and its fingerprint, using the
-- caller's Finance permissions and RLS. No email, files or private documents.
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
  'occurrences',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'recurring_transaction_id',o.recurring_transaction_id,'due_date',o.due_date,'status',o.status,'transaction_id',o.transaction_id) order by o.id) from public.recurring_transaction_occurrences o where o.household_id=p_household_id and o.due_date between p_month and v_end),'[]'::jsonb)
 ) into v_source;
 select to_jsonb(r) into v_review from public.finance_fortnight_reviews r where r.household_id=p_household_id and r.month=p_month and r.period=p_period;
 return jsonb_build_object('source',v_source,'fingerprint',md5(v_source::text),'server_date',(statement_timestamp() at time zone 'America/Guatemala')::date,'review',v_review);
end;
$function$;
revoke all on function public.get_finance_fortnight_review(uuid,date,text) from public,anon;
grant execute on function public.get_finance_fortnight_review(uuid,date,text) to authenticated;

create or replace function household_integrity.guard_fortnight_review()
returns trigger language plpgsql security invoker set search_path=''
as $function$
declare v_end date;v_preview jsonb;
begin
 -- Backup restore runs through a permission-checked definer function. Preserve
 -- the original reviewer/date and historical fingerprint on those restores.
 if current_user='authenticated' then
  v_end:=case when new.period='first' then new.month+14 else (new.month+interval '1 month - 1 day')::date end;
  if v_end>=(statement_timestamp() at time zone 'America/Guatemala')::date then raise exception 'La quincena sigue en curso. Puedes revisar la vista previa y guardar al terminar.' using errcode='23514';end if;
  v_preview:=public.get_finance_fortnight_review(new.household_id,new.month,new.period);
  if new.source_fingerprint is distinct from v_preview->>'fingerprint' then raise exception 'Los datos cambiaron durante la revisión. Actualiza el cierre y vuelve a revisar.' using errcode='40001';end if;
  if jsonb_array_length(new.snapshot->'issues')>0 and (not new.acknowledged_pending or char_length(trim(coalesce(new.notes,'')))<5) then raise exception 'Confirma los puntos pendientes y agrega una nota para el siguiente período.' using errcode='23514';end if;
  new.reviewed_by:=auth.uid();new.reviewed_at:=clock_timestamp();
 end if;
 return new;
end;
$function$;
revoke all on function household_integrity.guard_fortnight_review() from public,anon,authenticated;
create trigger a_guard_fortnight_review before insert or update on public.finance_fortnight_reviews for each row execute function household_integrity.guard_fortnight_review();
create trigger platform_guard_archive before insert or update or delete on public.finance_fortnight_reviews for each row execute function platform_security.guard_archived_write();
create trigger household_check_family_links before insert or update on public.finance_fortnight_reviews for each row execute function household_integrity.check_family_links('[]');
create trigger audit_fortnight_review after insert or update or delete on public.finance_fortnight_reviews for each row execute function public.audit_household_change('finance','month');

-- Keep the new review records in JSON/ZIP backups and restore-missing workflows.
do $$declare signature text;definition text;updated text;
begin
 foreach signature in array array['public.household_backup_rows(uuid,text)','public.restore_backup_table_missing(uuid,text,jsonb)','public.restore_household_backup_missing(uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(definition,'''finance_income_plans'',','''finance_income_plans'',''finance_fortnight_reviews'',');
  if updated=definition then raise exception 'Fortnight review backup precondition failed: %',signature;end if;
  execute updated;
 end loop;
 definition:=pg_get_functiondef('public.build_household_backup_snapshot(uuid)'::regprocedure);
 updated:=replace(definition,'''finance_income_plans'',public.household_backup_rows(p_household_id,''finance_income_plans''),','''finance_income_plans'',public.household_backup_rows(p_household_id,''finance_income_plans''),''finance_fortnight_reviews'',public.household_backup_rows(p_household_id,''finance_fortnight_reviews''),');
 if updated=definition then raise exception 'Fortnight review snapshot precondition failed';end if;
 execute updated;
end$$;
notify pgrst,'reload schema';
