-- Household health history + dashboard wrapper.
create table if not exists public.household_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  snapshot_date date not null,
  overall_score integer not null check (overall_score between 0 and 100),
  finance_score integer not null check (finance_score between 0 and 30),
  organization_score integer not null check (organization_score between 0 and 20),
  documents_score integer not null check (documents_score between 0 and 15),
  maintenance_score integer not null check (maintenance_score between 0 and 20),
  pantry_score integer not null check (pantry_score between 0 and 15),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(household_id,snapshot_date)
);

create index if not exists idx_household_health_snapshots_household_date
  on public.household_health_snapshots(household_id,snapshot_date desc);

alter table public.household_health_snapshots enable row level security;

drop policy if exists household_health_snapshots_member_select on public.household_health_snapshots;
create policy household_health_snapshots_member_select
on public.household_health_snapshots
for select to authenticated
using (public.is_household_member(household_id));

revoke insert,update,delete on public.household_health_snapshots from authenticated;
grant select on public.household_health_snapshots to authenticated;

drop function if exists public.get_household_health(uuid);

create or replace function public.get_household_health_dashboard(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_snapshot jsonb;
  v_today date := (now() at time zone 'America/Guatemala')::date;
  v_overall integer;
  v_finance integer;
  v_organization integer;
  v_documents integer;
  v_maintenance integer;
  v_pantry integer;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception 'Not a household member';
  end if;

  v_snapshot := public.household_health_snapshot(p_household_id);
  v_overall := coalesce((v_snapshot->>'overall_score')::integer,0);
  v_finance := round(coalesce((v_snapshot->'domains'->0->>'score')::numeric,0)*0.30);
  v_organization := round(coalesce((v_snapshot->'domains'->1->>'score')::numeric,0)*0.20);
  v_documents := round(coalesce((v_snapshot->'domains'->2->>'score')::numeric,0)*0.15);
  v_maintenance := round(coalesce((v_snapshot->'domains'->3->>'score')::numeric,0)*0.20);
  v_pantry := round(coalesce((v_snapshot->'domains'->4->>'score')::numeric,0)*0.15);

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
