-- v31: quick add saves dollar movements in one atomic step. save_transaction_once accepts the
-- original currency, amount and rate; the movement amount stays in quetzales.
do $$
declare def text;updated text;
begin
  def:=pg_get_functiondef('public.save_transaction_once(uuid,uuid,jsonb)'::regprocedure);
  if position('original_currency' in def)>0 then return; end if;
  updated:=replace(def,'''recurring'',''due_day''))','''recurring'',''due_day'',''original_currency'',''original_amount'',''exchange_rate''))');
  if updated=def then raise exception 'save_transaction_once: key list anchor not found'; end if;
  def:=updated;
  updated:=regexp_replace(def,'(''due_day'',case when v_recurring then v_day else null end\);)',
    E'\\1\n if nullif(p_values->>''original_currency'','''') is not null then\n  if p_values->>''original_currency''<>''USD'' or (p_values->>''original_amount'')::numeric is null or (p_values->>''exchange_rate'')::numeric is null then raise check_violation using message=''Revisa el monto en dólares y el tipo de cambio.'';end if;\n  v_payload:=v_payload||jsonb_build_object(''original_currency'',''USD'',''original_amount'',(p_values->>''original_amount'')::numeric,''exchange_rate'',(p_values->>''exchange_rate'')::numeric);\n end if;');
  if updated=def then raise exception 'save_transaction_once: payload anchor not found'; end if;
  def:=updated;
  updated:=regexp_replace(def,'(v_tx:=public\.save_finance_transaction\([^;]*\);)',
    E'\\1\n if v_payload ? ''original_currency'' then\n  update public.transactions set original_currency=''USD'',original_amount=(v_payload->>''original_amount'')::numeric,exchange_rate=(v_payload->>''exchange_rate'')::numeric where id=v_tx and household_id=p_household_id;\n end if;');
  if updated=def then raise exception 'save_transaction_once: save anchor not found'; end if;
  execute updated;
end $$;

-- CSV blocks reuse the canonical, idempotent movement engine. A block and its expense
-- splits commit together; a lost response can be retried with the same request IDs.
create or replace function public.import_finance_transactions_once(p_household_id uuid,p_entries jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare entry jsonb;ids jsonb:='[]'::jsonb;tx uuid;
begin
 if auth.uid() is null or not public.can_edit_household_module(p_household_id,'finance') then
  raise insufficient_privilege using message='Necesitas permiso para editar Finanzas.';
 end if;
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 100 then
  raise check_violation using message='Importa entre 1 y 100 movimientos por bloque.';
 end if;
 for entry in select value from jsonb_array_elements(p_entries) loop
  if nullif(entry->>'request_id','') is null or jsonb_typeof(entry->'values') is distinct from 'object' then
   raise check_violation using message='El bloque de importación está incompleto.';
  end if;
  tx:=public.save_transaction_once(p_household_id,(entry->>'request_id')::uuid,entry->'values');
  ids:=ids||jsonb_build_array(tx);
 end loop;
 return jsonb_build_object('transaction_ids',ids);
end $$;
revoke execute on function public.import_finance_transactions_once(uuid,jsonb) from public,anon;
grant execute on function public.import_finance_transactions_once(uuid,jsonb) to authenticated;
