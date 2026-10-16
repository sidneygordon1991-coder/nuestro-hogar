-- Extend the existing guarded backup/restore entry points. Keep their ACLs.
do $$declare signature text;definition text;updated text;
begin
 foreach signature in array array['public.household_backup_rows(uuid,text)','public.restore_backup_table_missing(uuid,text,jsonb)','public.restore_household_backup_missing(uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(definition,'''household_health_snapshots''','''household_health_snapshots'',''goal_budget_links'',''shopping_checkouts'',''shopping_checkout_items'',''account_reconciliations''');
  if updated=definition then raise exception 'Connected workflow backup precondition failed: %',signature;end if;
  execute updated;
 end loop;
 definition:=pg_get_functiondef('public.build_household_backup_snapshot(uuid)'::regprocedure);
 updated:=replace(definition,'  return jsonb_build_object(',
  '  v_tables:=v_tables||jsonb_build_object(''goal_budget_links'',public.household_backup_rows(p_household_id,''goal_budget_links''),''shopping_checkouts'',public.household_backup_rows(p_household_id,''shopping_checkouts''),''shopping_checkout_items'',public.household_backup_rows(p_household_id,''shopping_checkout_items''),''account_reconciliations'',public.household_backup_rows(p_household_id,''account_reconciliations''));
  return jsonb_build_object(');
 if updated=definition then raise exception 'Connected workflow snapshot precondition failed';end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
