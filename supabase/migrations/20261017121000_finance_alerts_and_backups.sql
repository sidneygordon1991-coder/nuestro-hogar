-- Nuestro Hogar v31: finance alerts in the notification center, settlements in backups and
-- an explicit privacy guarantee for private movements. Additive: existing functions are patched
-- in place (same pattern as the backup migrations) so their current bodies and ACLs are kept.

-- 1. Money as the app shows it: 'Q 1,234' or 'Q 1,234.50' (fixed separators, independent of locale).
create or replace function public.finance_alert_money(p_amount numeric)
returns text language sql immutable set search_path='' as $$
  select 'Q '||case when p_amount<0 then '-' else '' end||
    case when abs(round(p_amount,2))=trunc(abs(round(p_amount,2)))
      then to_char(trunc(abs(round(p_amount,2))),'FM999,999,999,990')
      else to_char(abs(round(p_amount,2)),'FM999,999,999,990.00') end
$$;
revoke execute on function public.finance_alert_money(numeric) from public,anon,authenticated;

-- 2. Finance alerts. Created for every member who can view finances (role defaults and per-member
--    overrides), honouring notification preferences and the household automation switches.
--    Deduplication: each alert has a stable dedupe_key (unique per user) and is inserted with
--    on conflict do nothing; expires_at always outlives the window in which the condition can be true,
--    so the hourly purge of expired rows never lets the same alert be created twice.
--      finance-budget-pace-<month>-<category>     one per category per month
--      finance-unusual-expense-<transaction>      one per transaction
--      finance-card-due-<account>-<due date>      one per card per due date
--    "Recurring expense due tomorrow" is not added: refresh_notifications_for_household already
--    notifies every pending recurring expense due within the next days ('payment-upcoming-<occurrence>').
--    p_today exists only so scenarios can run against a fixed date; the app always omits it.
create or replace function public.refresh_finance_alerts(p_household_id uuid, p_today date default null)
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_today date := coalesce(p_today,(now() at time zone 'America/Guatemala')::date);
  v_month date := date_trunc('month',v_today)::date;
  v_next_month date := (date_trunc('month',v_today)+interval '1 month')::date;
  v_months text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  v_rows integer;
  v_total integer := 0;
begin
  if p_household_id is null then return 0; end if;

  insert into public.notification_preferences(household_id,user_id)
  select hm.household_id,hm.user_id from public.household_members hm where hm.household_id=p_household_id
  on conflict (household_id,user_id) do nothing;

  -- a) A spending category reached 80% of the month's plan before day 20 (saving categories excluded).
  --    Skipped when the general budget alert ('budget-<threshold>-<month>-<category>') already exists.
  if extract(day from v_today)<20 and public.automation_rule_enabled(p_household_id,'budget_limit_alert',true) then
    with spent as (
      select t.category_id,sum(t.amount) spent
      from public.transactions t
      where t.household_id=p_household_id and t.type='expense' and t.category_id is not null
        and t.transaction_date>=v_month and t.transaction_date<v_next_month
      group by t.category_id
    ), usage as (
      select ba.category_id,bc.name,ba.planned_amount planned,coalesce(s.spent,0) spent
      from public.budget_allocations ba
      join public.budget_categories bc on bc.id=ba.category_id and bc.household_id=ba.household_id
      left join spent s on s.category_id=ba.category_id
      where ba.household_id=p_household_id and ba.month=v_month and ba.planned_amount>0 and bc.budget_group<>'saving'
    )
    insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
    select p_household_id,hm.user_id,'budget','warning',
      u.name||' va al '||floor(u.spent/u.planned*100)::int||'%',
      case when u.spent>u.planned then 'Ya pasaste lo planeado por '||public.finance_alert_money(u.spent-u.planned)
        else 'Quedan '||public.finance_alert_money(u.planned-u.spent)||' para el mes' end,
      'presupuesto:budget','budget_category',u.category_id,
      'finance-budget-pace-'||v_month::text||'-'||u.category_id::text,
      v_next_month::timestamptz
    from usage u
    join public.household_members hm on hm.household_id=p_household_id
    join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
    where u.spent>=u.planned*0.8 and np.budget
      and public.household_module_access_for_user(p_household_id,hm.user_id,'finance')<>'none'
      and not exists(select 1 from public.notifications n
        where n.user_id=hm.user_id and n.household_id=p_household_id and n.type='budget' and n.entity_id=u.category_id
          and n.dedupe_key like 'budget-%-'||v_month::text||'-'||u.category_id::text)
    on conflict (user_id,dedupe_key) do nothing;
    get diagnostics v_rows=row_count; v_total:=v_total+v_rows;
  end if;

  -- b) Unusual expense: registered in the last 3 days, at least twice the category's average expense
  --    of the previous 3 full months and at least Q 300 above it (needs 3 or more earlier expenses).
  --    Only household movements are read; private movements never produce alerts.
  with recent as (
    select t.id,t.description,t.amount,t.transaction_date,t.category_id,bc.name
    from public.transactions t
    join public.budget_categories bc on bc.id=t.category_id and bc.household_id=t.household_id
    where t.household_id=p_household_id and t.type='expense' and bc.budget_group<>'saving'
      and t.transaction_date>v_today-3 and t.transaction_date<=v_today
  ), baseline as (
    select t.category_id,avg(t.amount) avg_amount,count(*) n
    from public.transactions t
    where t.household_id=p_household_id and t.type='expense'
      and t.category_id in (select r.category_id from recent r)
      and t.transaction_date>=(v_month-interval '3 months')::date and t.transaction_date<v_month
    group by t.category_id
  )
  insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
  select p_household_id,hm.user_id,'budget','info',
    'Gasto inusual en '||r.name,
    r.description||' · '||public.finance_alert_money(r.amount)||'. Lo usual en esta categoría es '||public.finance_alert_money(round(b.avg_amount,2)),
    'presupuesto:transactions','transaction',r.id,
    'finance-unusual-expense-'||r.id::text,
    (r.transaction_date+30)::timestamptz
  from recent r
  join baseline b on b.category_id=r.category_id
  join public.household_members hm on hm.household_id=p_household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where b.n>=3 and r.amount>=2*b.avg_amount and r.amount>=b.avg_amount+300 and np.budget
    and public.household_module_access_for_user(p_household_id,hm.user_id,'finance')<>'none'
  on conflict (user_id,dedupe_key) do nothing;
  get diagnostics v_rows=row_count; v_total:=v_total+v_rows;

  -- d) Credit card payment due within 3 days with money owed. Balance as the app computes it for a
  --    liability: opening + expenses - incomes + transfers out - transfers in, up to today.
  --    A personal (not shared) card only alerts its owner.
  if public.automation_rule_enabled(p_household_id,'payment_due_alert',true) then
    with cards as (
      select fa.id,fa.name,fa.owner_user_id,fa.is_shared,fa.minimum_payment,due.due_date,bal.balance
      from public.finance_accounts fa
      cross join lateral (select
        least(fa.payment_due_day,extract(day from (v_month+interval '1 month - 1 day'))::int) this_day,
        least(fa.payment_due_day,extract(day from (v_next_month+interval '1 month - 1 day'))::int) next_day) dd
      cross join lateral (select case when v_month+dd.this_day-1>=v_today then v_month+dd.this_day-1
        else v_next_month+dd.next_day-1 end due_date) due
      cross join lateral (select fa.opening_balance
        +coalesce((select sum(case when t.type='expense' then t.amount else -t.amount end) from public.transactions t
          where t.account_id=fa.id and t.household_id=p_household_id and t.transaction_date<=v_today),0)
        +coalesce((select sum(tr.amount) from public.finance_transfers tr
          where tr.from_account_id=fa.id and tr.household_id=p_household_id and tr.transfer_date<=v_today),0)
        -coalesce((select sum(tr.amount) from public.finance_transfers tr
          where tr.to_account_id=fa.id and tr.household_id=p_household_id and tr.transfer_date<=v_today),0) balance) bal
      where fa.household_id=p_household_id and fa.account_type='credit' and fa.active and fa.payment_due_day is not null
    )
    insert into public.notifications(household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at)
    select p_household_id,hm.user_id,'payment','warning',
      'Paga tu tarjeta '||c.name||case when c.due_date=v_today then ' hoy' else ' antes del '||extract(day from c.due_date)::int end,
      'Saldo de '||public.finance_alert_money(c.balance)
        ||case when c.minimum_payment>0 then ' · pago mínimo '||public.finance_alert_money(least(c.minimum_payment,c.balance)) else '' end
        ||' · vence el '||extract(day from c.due_date)::int||' de '||v_months[extract(month from c.due_date)::int],
      'presupuesto:accounts','finance_account',c.id,
      'finance-card-due-'||c.id::text||'-'||c.due_date::text,
      (c.due_date+7)::timestamptz
    from cards c
    join public.household_members hm on hm.household_id=p_household_id
    join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
    where c.due_date between v_today and v_today+3 and c.balance>0 and np.payments
      and (c.is_shared or c.owner_user_id is null or c.owner_user_id=hm.user_id)
      and public.household_module_access_for_user(p_household_id,hm.user_id,'finance')<>'none'
    on conflict (user_id,dedupe_key) do nothing;
    get diagnostics v_rows=row_count; v_total:=v_total+v_rows;
  end if;

  return v_total;
end $$;
revoke execute on function public.refresh_finance_alerts(uuid,date) from public,anon,authenticated;

-- 3. Inicio's refresh also creates finance alerts. The live body is kept as is; only the call is appended.
do $$ declare def text; updated text;
begin
  def:=pg_get_functiondef('public.refresh_my_notifications(uuid)'::regprocedure);
  if position('refresh_notifications_for_household' in def)=0 then raise exception 'refresh_my_notifications precondition failed'; end if;
  if position('refresh_finance_alerts' in def)>0 then return; end if;
  updated:=regexp_replace(def,'end;?\s*\$function\$\s*$',E'  perform public.refresh_finance_alerts(p_household_id);\nend;\n$function$\n');
  if updated=def then raise exception 'refresh_my_notifications end not found'; end if;
  execute updated;
end $$;
revoke execute on function public.refresh_my_notifications(uuid) from public,anon;
grant execute on function public.refresh_my_notifications(uuid) to authenticated;

-- 4. Section-specific tabs ('presupuesto:budget') belong to the same module as their tab, so members
--    without finance access never read them, even after their access changes.
do $$ declare def text; updated text;
begin
  def:=pg_get_functiondef('public.notification_module_allowed(uuid,text,text)'::regprocedure);
  if position('split_part(p_action_tab' in def)>0 then return; end if;
  updated:=replace(def,'when p_action_tab=''','when split_part(p_action_tab,'':'',1)=''');
  if updated=def then raise exception 'notification_module_allowed precondition failed'; end if;
  execute updated;
end $$;

-- 5. Backups: settlements travel with the other finance tables (snapshot, file export, import, restore).
--    Private movements (public.private_transactions) are NEVER part of a backup, export or snapshot:
--    they are not in any allow-list, the snapshot drops the key defensively and imports strip it.
do $$ declare signature text; def text; updated text;
begin
  if position('finance_settlements' in pg_get_functiondef('public.build_household_backup_snapshot(uuid)'::regprocedure))>0 then return; end if;
  foreach signature in array array['public.household_backup_rows(uuid,text)','public.restore_backup_table_missing(uuid,text,jsonb)'] loop
    def:=pg_get_functiondef(signature::regprocedure);
    updated:=replace(def,'''finance_receipts'',''budget_allocations''','''finance_receipts'',''finance_settlements'',''budget_allocations''');
    if updated=def then raise exception 'Settlement backup precondition failed: %',signature; end if;
    if position('private_transactions' in updated)>0 then raise exception 'Private movements must never be backed up: %',signature; end if;
    execute updated;
  end loop;

  -- Restoring a settlement needs both people in the household (the table trigger enforces it):
  -- rows for people who left are skipped instead of failing the whole restore.
  def:=pg_get_functiondef('public.restore_backup_table_missing(uuid,text,jsonb)'::regprocedure);
  if (length(def)-length(replace(def,'  execute format(','')))/length('  execute format(')<>1 then raise exception 'Settlement restore precondition failed'; end if;
  updated:=replace(def,'  execute format(',E'  if p_table=''finance_settlements'' then\n   select coalesce(jsonb_agg(case when s->>''created_by'' is not null and not exists(select 1 from auth.users u where u.id=(s->>''created_by'')::uuid) then jsonb_set(s,''{created_by}'',''null''::jsonb) else s end),''[]''::jsonb) into p_rows\n   from jsonb_array_elements(p_rows) s\n   where (select count(*) from public.household_members m where m.household_id=p_household_id and m.user_id in ((s->>''from_user_id'')::uuid,(s->>''to_user_id'')::uuid))=2;\n  end if;\n  execute format(');
  execute updated;

  def:=pg_get_functiondef('public.restore_household_backup_missing(uuid)'::regprocedure);
  updated:=replace(def,'''finance_receipts'',''transaction_splits''','''finance_receipts'',''transaction_splits'',''finance_settlements''');
  if updated=def then raise exception 'Settlement restore order precondition failed'; end if;
  execute updated;

  def:=pg_get_functiondef('public.build_household_backup_snapshot(uuid)'::regprocedure);
  updated:=replace(def,'''finance_receipts'',public.household_backup_rows(p_household_id,''finance_receipts''),',
    '''finance_receipts'',public.household_backup_rows(p_household_id,''finance_receipts''),''finance_settlements'',public.household_backup_rows(p_household_id,''finance_settlements''),');
  if updated=def then raise exception 'Settlement snapshot precondition failed'; end if;
  def:=updated;
  updated:=replace(def,'  return jsonb_build_object(',E'  v_tables:=v_tables-''private_transactions'';\n  return jsonb_build_object(');
  if updated=def then raise exception 'Snapshot privacy precondition failed'; end if;
  execute updated;

  def:=pg_get_functiondef('public.import_household_backup(uuid,jsonb,text)'::regprocedure);
  updated:=replace(def,'then raise exception ''Invalid backup file''; end if;',E'then raise exception ''Invalid backup file''; end if;\n  p_snapshot:=p_snapshot #- ''{tables,private_transactions}'';');
  if updated=def then raise exception 'Import privacy precondition failed'; end if;
  execute updated;
end $$;

comment on table public.private_transactions is
  'Private personal movements, visible only to their owner. Never included in household backups, file exports, snapshots, reports or alerts: household_backup_rows/restore_backup_table_missing do not allow this table, build_household_backup_snapshot drops the key and import_household_backup strips it.';
comment on table public.finance_settlements is
  'Payments between members that close shared-expense balances. Included in household backups (snapshot, export, import and missing-only restore).';
comment on function public.refresh_finance_alerts(uuid,date) is
  'Creates finance alerts (budget pace, unusual expense, credit card due) for members with finance view access. Idempotent via dedupe_key; called by refresh_my_notifications.';

notify pgrst,'reload schema';
