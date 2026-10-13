-- Make the health score reflect both operational quality and module coverage.
create or replace function public.get_household_health_dashboard(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_snapshot jsonb;
  v_today date := (now() at time zone 'America/Guatemala')::date;
  v_raw integer;
  v_coverage integer;
  v_overall integer;
  v_factor numeric;
  v_finance integer;
  v_organization integer;
  v_documents integer;
  v_maintenance integer;
  v_pantry integer;
  v_status text;
  v_status_label text;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception 'Not a household member';
  end if;

  v_snapshot := public.household_health_snapshot(p_household_id);
  v_raw := coalesce((v_snapshot->>'overall_score')::integer,0);
  v_coverage := coalesce((v_snapshot->>'coverage_score')::integer,0);
  v_overall := round(v_raw * (0.70 + 0.30 * v_coverage::numeric / 100));
  v_overall := greatest(0,least(100,v_overall));
  v_factor := case when v_raw>0 then v_overall::numeric/v_raw else 0 end;

  v_status := case when v_overall>=90 then 'excellent' when v_overall>=75 then 'good' when v_overall>=55 then 'watch' else 'risk' end;
  v_status_label := case when v_overall>=90 then 'Excelente' when v_overall>=75 then 'Bien' when v_overall>=55 then 'Atención' else 'Prioridad alta' end;

  v_snapshot := jsonb_set(v_snapshot,'{operational_score}',to_jsonb(v_raw),true);
  v_snapshot := jsonb_set(v_snapshot,'{overall_score}',to_jsonb(v_overall),true);
  v_snapshot := jsonb_set(v_snapshot,'{status}',to_jsonb(v_status),true);
  v_snapshot := jsonb_set(v_snapshot,'{status_label}',to_jsonb(v_status_label),true);

  v_finance := round(coalesce((v_snapshot->'domains'->0->>'score')::numeric,0)*0.30*v_factor);
  v_organization := round(coalesce((v_snapshot->'domains'->1->>'score')::numeric,0)*0.20*v_factor);
  v_documents := round(coalesce((v_snapshot->'domains'->2->>'score')::numeric,0)*0.15*v_factor);
  v_maintenance := round(coalesce((v_snapshot->'domains'->3->>'score')::numeric,0)*0.20*v_factor);
  v_pantry := greatest(0,v_overall-v_finance-v_organization-v_documents-v_maintenance);

  insert into public.household_health_snapshots(
    household_id,snapshot_date,overall_score,finance_score,organization_score,documents_score,maintenance_score,pantry_score,updated_at
  ) values(
    p_household_id,v_today,v_overall,v_finance,v_organization,v_documents,v_maintenance,v_pantry,now()
  )
  on conflict(household_id,snapshot_date) do update set
    overall_score=excluded.overall_score,
    finance_score=excluded.finance_score,
    organization_score=excluded.organization_score,
    documents_score=excluded.documents_score,
    maintenance_score=excluded.maintenance_score,
    pantry_score=excluded.pantry_score,
    updated_at=now();

  return v_snapshot;
end;
$$;

revoke execute on function public.get_household_health_dashboard(uuid) from public,anon;
grant execute on function public.get_household_health_dashboard(uuid) to authenticated;
