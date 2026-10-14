-- Monthly projections are independent of actual transactions and contribution references.
create table public.finance_income_plans (
 household_id uuid not null references public.households(id) on delete cascade,
 month date not null check (month>=date '1900-01-01' and month<date '10000-01-01' and extract(day from month)=1),
 user_id uuid not null references auth.users(id) on delete cascade,
 expected_amount numeric(12,2) not null check (expected_amount>=0 and expected_amount<=9999999999.99),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(household_id,month,user_id)
);
create index finance_income_plans_user_idx on public.finance_income_plans(user_id);
alter table public.finance_income_plans enable row level security;
revoke all on public.finance_income_plans from public,anon,authenticated;
grant select,insert,update,delete on public.finance_income_plans to authenticated;
create policy finance_income_plans_view on public.finance_income_plans for select to authenticated
 using (public.can_view_household_module(household_id,'finance'));
create policy finance_income_plans_insert on public.finance_income_plans for insert to authenticated
 with check (public.can_edit_household_module(household_id,'finance') and exists(
  select 1 from public.household_members hm where hm.household_id=finance_income_plans.household_id and hm.user_id=finance_income_plans.user_id
 ));
create policy finance_income_plans_update on public.finance_income_plans for update to authenticated
 using (public.can_edit_household_module(household_id,'finance'))
 with check (public.can_edit_household_module(household_id,'finance') and exists(
  select 1 from public.household_members hm where hm.household_id=finance_income_plans.household_id and hm.user_id=finance_income_plans.user_id
 ));
create policy finance_income_plans_delete on public.finance_income_plans for delete to authenticated
 using (public.can_edit_household_module(household_id,'finance'));
create trigger platform_guard_archive before insert or update or delete on public.finance_income_plans
 for each row execute function platform_security.guard_archived_write();
create trigger household_check_family_links before insert or update on public.finance_income_plans
 for each row execute function household_integrity.check_family_links('[]');
create trigger audit_finance_income_plans after insert or update or delete on public.finance_income_plans
 for each row execute function public.audit_household_change('finance','month');

-- Extend the existing allowlists while preserving their privacy checks and ACLs.
do $$
declare signature text;definition text;updated text;
begin
 foreach signature in array array['public.household_backup_rows(uuid,text)','public.restore_backup_table_missing(uuid,text,jsonb)','public.restore_household_backup_missing(uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(definition,'''finance_member_settings'',','''finance_member_settings'',''finance_income_plans'',');
  if updated=definition then raise exception 'Monthly income backup precondition failed: %',signature;end if;
  execute updated;
 end loop;
 definition:=pg_get_functiondef('public.build_household_backup_snapshot(uuid)'::regprocedure);
 updated:=replace(definition,
  '''finance_member_settings'',public.household_backup_rows(p_household_id,''finance_member_settings''),',
  '''finance_member_settings'',public.household_backup_rows(p_household_id,''finance_member_settings''),''finance_income_plans'',public.household_backup_rows(p_household_id,''finance_income_plans''),');
 if updated=definition then raise exception 'Monthly income snapshot precondition failed';end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
