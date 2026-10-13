-- Backend automation and Web Push delivery.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.event_occurs_on(
  p_event_date date,p_recurrence text,p_recurrence_until date,p_target date
)
returns boolean language sql immutable set search_path='' as $$
  select p_target>=p_event_date
    and (p_recurrence_until is null or p_target<=p_recurrence_until)
    and case coalesce(p_recurrence,'none')
      when 'none' then p_target=p_event_date
      when 'weekly' then mod((p_target-p_event_date),7)=0
      when 'monthly' then extract(day from p_target)::int=least(
        extract(day from p_event_date)::int,
        extract(day from(date_trunc('month',p_target)+interval '1 month - 1 day'))::int
      )
      when 'yearly' then extract(month from p_target)::int=extract(month from p_event_date)::int
        and extract(day from p_target)::int=least(
          extract(day from p_event_date)::int,
          extract(day from(date_trunc('month',p_target)+interval '1 month - 1 day'))::int
        )
      else false
    end
$$;

create or replace function public.generate_recurring_occurrences(
  p_start_month date default date_trunc('month',(now() at time zone 'America/Guatemala'))::date,
  p_months integer default 12
)
returns integer language plpgsql security definer set search_path='' as $$
declare v_inserted integer:=0;
begin
  if p_months<1 or p_months>24 then raise exception 'p_months must be between 1 and 24'; end if;
  insert into public.recurring_transaction_occurrences(
    recurring_transaction_id,household_id,period_month,due_date,status,updated_at
  )
  select r.id,r.household_id,m.period_month,
    (m.period_month+(least(r.due_day,extract(day from(m.period_month+interval '1 month - 1 day'))::int)-1))::date,
    'pending',now()
  from public.recurring_transactions r
  cross join lateral (
    select (date_trunc('month',p_start_month)::date+(g.n||' months')::interval)::date period_month
    from generate_series(0,p_months-1) g(n)
  ) m
  where r.active=true and date_trunc('month',r.created_at)::date<=m.period_month
  on conflict(recurring_transaction_id,period_month) do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted;
end $$;

create or replace function public.refresh_recurring_event_notifications_for_household(p_household_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_today date:=(now() at time zone 'America/Guatemala')::date;
begin
  insert into public.notifications(
    household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at
  )
  select e.household_id,hm.user_id,'event','info',
    case when d.target=v_today then 'Evento hoy' else 'Evento mañana' end,
    e.title||coalesce(' · '||to_char(e.start_time,'HH24:MI'),''),
    'calendario','event',e.id,
    'event-upcoming-'||e.id::text||'-'||d.target::text,
    (d.target::timestamptz)+interval '3 days'
  from public.events e
  cross join lateral (
    select gs::date target from generate_series(v_today::timestamp,(v_today+1)::timestamp,interval '1 day') gs
  ) d
  join public.household_members hm on hm.household_id=e.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where e.household_id=p_household_id and e.recurrence<>'none' and np.events
    and public.event_occurs_on(e.event_date,e.recurrence,e.recurrence_until,d.target)
    and (e.assigned_to is null or e.assigned_to=hm.user_id)
  on conflict(user_id,dedupe_key) do nothing;
end $$;

create or replace function public.refresh_all_recurring_event_notifications()
returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
  for r in select id from public.households loop
    perform public.refresh_recurring_event_notifications_for_household(r.id);
  end loop;
end $$;

create or replace function public.run_household_automation()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.generate_recurring_occurrences(
    date_trunc('month',(now() at time zone 'America/Guatemala'))::date,12
  );
  perform public.refresh_all_notifications();
  perform public.refresh_all_recurring_event_notifications();
end $$;

create or replace function public.ensure_web_push_vapid(
  p_public_key text,p_private_key text,p_subject text
)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from vault.secrets where name='web_push_vapid_public') then
    perform vault.create_secret(p_public_key,'web_push_vapid_public','Nuestro Hogar Web Push public VAPID key');
  end if;
  if not exists(select 1 from vault.secrets where name='web_push_vapid_private') then
    perform vault.create_secret(p_private_key,'web_push_vapid_private','Nuestro Hogar Web Push private VAPID key');
  end if;
  if not exists(select 1 from vault.secrets where name='web_push_vapid_subject') then
    perform vault.create_secret(p_subject,'web_push_vapid_subject','Nuestro Hogar Web Push VAPID subject');
  end if;
end $$;

create or replace function public.get_web_push_vapid()
returns table(public_key text,private_key text,subject text)
language sql security definer set search_path='' as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name='web_push_vapid_public' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name='web_push_vapid_private' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name='web_push_vapid_subject' limit 1)
$$;

create or replace function public.get_web_push_public_key()
returns text language sql security definer set search_path='' as $$
  select decrypted_secret from vault.decrypted_secrets where name='web_push_vapid_public' limit 1
$$;

revoke execute on function public.event_occurs_on(date,text,date,date) from public,anon,authenticated;
revoke execute on function public.generate_recurring_occurrences(date,integer) from public,anon,authenticated;
revoke execute on function public.refresh_recurring_event_notifications_for_household(uuid) from public,anon,authenticated;
revoke execute on function public.refresh_all_recurring_event_notifications() from public,anon,authenticated;
revoke execute on function public.run_household_automation() from public,anon,authenticated;
revoke execute on function public.ensure_web_push_vapid(text,text,text) from public,anon,authenticated;
revoke execute on function public.get_web_push_vapid() from public,anon,authenticated;
revoke execute on function public.get_web_push_public_key() from public,anon;

grant execute on function public.run_household_automation() to service_role;
grant execute on function public.ensure_web_push_vapid(text,text,text) to service_role;
grant execute on function public.get_web_push_vapid() to service_role;
grant execute on function public.get_web_push_public_key() to authenticated;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='nuestro-hogar-notification-refresh'),
  command := 'select public.run_household_automation();'
);

select cron.schedule(
  'nuestro-hogar-web-push-delivery',
  '*/5 * * * *',
  $$
    select net.http_post(
      url:='https://dchihxrjtngwabbvsqap.supabase.co/functions/v1/send-web-push',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'apikey','sb_publishable_1IQkLKO6xv1p4jiHDxepRQ_BZa_Sfbc',
        'Authorization','Bearer sb_publishable_1IQkLKO6xv1p4jiHDxepRQ_BZa_Sfbc'
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=10000
    );
  $$
);
