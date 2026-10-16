-- Extend the existing guarded backup/restore entry points. Keep their ACLs.
do $$declare signature text;definition text;updated text;
begin
 foreach signature in array array['public.household_backup_rows(uuid,text)','public.restore_backup_table_missing(uuid,text,jsonb)','public.restore_household_backup_missing(uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(definition,'''account_reconciliations''','''account_reconciliations'',''finance_write_requests'',''household_comments''');
  if updated=definition then raise exception 'Connected workflow backup precondition failed: %',signature;end if;
  execute updated;
 end loop;
 definition:=pg_get_functiondef('public.build_household_backup_snapshot(uuid)'::regprocedure);
 updated:=replace(definition,'  return jsonb_build_object(',
  '  v_tables:=v_tables||jsonb_build_object(''finance_write_requests'',public.household_backup_rows(p_household_id,''finance_write_requests''),''household_comments'',public.household_backup_rows(p_household_id,''household_comments''));
  return jsonb_build_object(');
 if updated=definition then raise exception 'Connected workflow snapshot precondition failed';end if;
 execute updated;
 definition:=pg_get_functiondef('public.restore_household_backup_missing(uuid)'::regprocedure);
 updated:=replace(definition,'''budget_allocations'',''goal_contributions'',''recurring_transaction_occurrences'',''finance_transfers'',''transactions''', '''budget_allocations'',''goal_contributions'',''transactions'',''recurring_transaction_occurrences'',''finance_transfers''');
 if updated=definition then raise exception 'Backup transaction order precondition failed';end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
