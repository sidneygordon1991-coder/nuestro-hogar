-- v33 · Métricas de uso para el panel master (solo masters con MFA).
-- La métrica principal: hogares que registran algo cada semana (movimientos, ahorros, tareas o eventos).
-- Solo cuenta filas por hogar y semana; no lee montos, descripciones ni datos privados ("Solo yo" no participa).

create or replace function platform_security.activity() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 v_union text:='';
 v_weeks jsonb;
 v_total int;
 v_active_30 int;
 v_new_30 int;
 v_errors jsonb;
 r record;
begin
 perform platform_security.require_master();
 -- Every household table with household_id + created_at takes part (checked at run time: no failure if one is missing).
 for r in select t from unnest(array['transactions','goal_contributions','list_items','events','recurring_transaction_occurrences']) t
 loop
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.t and column_name='household_id')
     and exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.t and column_name='created_at') then
   v_union:=v_union||case when v_union='' then '' else ' union all ' end||format('select household_id,created_at from public.%I where created_at>=now()-interval ''12 weeks''',r.t);
   if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.t and column_name='is_shared') then
    v_union:=v_union||' and is_shared is true';
   end if;
  end if;
 end loop;
 if v_union='' then v_union:='select null::uuid as household_id,null::timestamptz as created_at where false'; end if;

 execute format($q$
  select coalesce(jsonb_agg(jsonb_build_object('week',w.week,'households',coalesce(a.households,0)) order by w.week),'[]'::jsonb)
  from (select generate_series(date_trunc('week',now())-interval '11 weeks',date_trunc('week',now()),interval '1 week')::date as week) w
  left join (select date_trunc('week',created_at)::date as week,count(distinct household_id)::int as households from (%s) x group by 1) a using(week)
 $q$,v_union) into v_weeks;
 execute format('select count(distinct household_id)::int from (%s) x where created_at>=now()-interval ''30 days''',v_union) into v_active_30;

 select count(*)::int into v_total from public.households;
 select count(*)::int into v_new_30 from public.households where created_at>=now()-interval '30 days';

 select jsonb_build_object(
  'open',count(*) filter (where resolved_at is null),
  'last_7_days',count(*) filter (where last_seen_at>=now()-interval '7 days'),
  'occurrences_7_days',coalesce(sum(occurrence_count) filter (where last_seen_at>=now()-interval '7 days'),0),
  'top',coalesce((select jsonb_agg(t) from (select source,left(message,140) as message,occurrence_count,last_seen_at,app_version from public.app_error_logs where resolved_at is null order by last_seen_at desc limit 5) t),'[]'::jsonb)
 ) into v_errors from public.app_error_logs;

 return jsonb_build_object('generated_at',now(),'households',v_total,'new_households_30',v_new_30,'active_households_30',v_active_30,'weekly_active',v_weeks,'errors',v_errors);
end $$;

create or replace function public.get_platform_activity() returns jsonb
language sql stable security invoker set search_path='' as $$ select platform_security.activity() $$;

revoke all on function platform_security.activity() from public,anon,authenticated;
grant execute on function platform_security.activity() to authenticated;
revoke all on function public.get_platform_activity() from public,anon;
grant execute on function public.get_platform_activity() to authenticated;
