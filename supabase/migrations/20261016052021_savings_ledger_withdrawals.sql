-- Prepared for review: do not apply automatically to production.
-- Existing positive contributions remain deposits; negative entries are withdrawals.
-- No rows, authors, IDs, snapshots or account transactions are rewritten.
alter table public.goal_contributions drop constraint goal_contributions_amount_check;
alter table public.goal_contributions add constraint goal_contributions_amount_check
 check (amount <> 0 and abs(amount) <= 9999999999.99 and amount <> 'NaN'::numeric);

create function household_integrity.lock_savings_goal() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 -- All write paths (including direct API edits/recovery) take the same locks.
 perform 1 from public.savings_goals where id in (
  case when tg_op<>'INSERT' then old.goal_id else null end,
  case when tg_op<>'DELETE' then new.goal_id else null end
 ) order by id for update;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger savings_ledger_lock before insert or update or delete on public.goal_contributions
 for each row execute function household_integrity.lock_savings_goal();

create function household_integrity.check_savings_ledger() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare goal uuid;
begin
 for goal in select distinct id from unnest(array[
  case when tg_op<>'INSERT' then old.goal_id else null end,
  case when tg_op<>'DELETE' then new.goal_id else null end
 ]) as ids(id) where id is not null loop
  if exists(select 1 from (
   select sum(sum(amount)) over(order by contribution_date rows unbounded preceding) balance
   from public.goal_contributions where goal_id=goal group by contribution_date
  ) ledger where balance<0) then
   raise exception 'El retiro o la corrección supera el ahorro disponible en esa fecha. Revisa los aportes posteriores antes de cambiar el historial.' using errcode='23514';
  end if;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
-- Deferred so a complete backup can restore deposits and withdrawals in one transaction.
create constraint trigger savings_ledger_balance after insert or update or delete on public.goal_contributions
 deferrable initially deferred for each row execute function household_integrity.check_savings_ledger();
revoke all on function household_integrity.lock_savings_goal(),household_integrity.check_savings_ledger() from public,anon;

create function public.get_savings_ledger_capability(p_household_id uuid) returns boolean
 language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and public.can_view_household_module(p_household_id,'finance')
$$;
revoke all on function public.get_savings_ledger_capability(uuid) from public,anon;
grant execute on function public.get_savings_ledger_capability(uuid) to authenticated;

create function public.save_savings_entry(p_household_id uuid,p_goal_id uuid,p_entry_id uuid,p_amount numeric,p_direction text,p_date date)
 returns uuid language plpgsql security invoker set search_path='' as $$
declare signed_amount numeric;existing public.goal_contributions;server_day date:=(now() at time zone 'America/Guatemala')::date;
begin
 if auth.uid() is null or not public.can_edit_household_module(p_household_id,'finance') then
  raise exception 'Necesitas permiso para editar Finanzas.' using errcode='42501';end if;
 if p_entry_id is null or p_amount is null or p_amount<=0 or p_amount>9999999999.99 or p_amount='NaN'::numeric or p_amount<>round(p_amount,2) or p_direction is null or p_direction not in ('deposit','withdrawal') or p_date is null or p_date>server_day then
  raise exception 'Revisa el monto, el tipo y la fecha. Solo se registran movimientos realizados.' using errcode='23514';end if;
 perform 1 from public.savings_goals where id=p_goal_id and household_id=p_household_id and active for update;
 if not found then raise exception 'La meta no está disponible en este hogar.' using errcode='42501';end if;
 signed_amount:=case when p_direction='withdrawal' then -p_amount else p_amount end;
 select * into existing from public.goal_contributions where id=p_entry_id;
 if found then
  if existing.household_id=p_household_id and existing.goal_id=p_goal_id and existing.amount=signed_amount and existing.contribution_date=p_date and existing.created_by=auth.uid() then return existing.id;end if;
  raise exception 'La solicitud ya existe con otros datos. Actualiza el historial.' using errcode='40001';
 end if;
 insert into public.goal_contributions(id,household_id,goal_id,amount,contribution_date,created_by)
 values(p_entry_id,p_household_id,p_goal_id,signed_amount,p_date,auth.uid());
 return p_entry_id;
end $$;
revoke all on function public.save_savings_entry(uuid,uuid,uuid,numeric,text,date) from public,anon;
grant execute on function public.save_savings_entry(uuid,uuid,uuid,numeric,text,date) to authenticated;

comment on function public.save_savings_entry(uuid,uuid,uuid,numeric,text,date) is
 'Savings ledger only. Withdrawals release earmarked funds; they do not create income, expenses or bank transfers. Existing RLS, archive and audit triggers still apply.';
