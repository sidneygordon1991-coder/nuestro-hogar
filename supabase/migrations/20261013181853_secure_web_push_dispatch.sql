-- Protect privileged Web Push dispatch with a private server-side secret stored in Vault.

create or replace function public.ensure_web_push_dispatch_secret()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_secret text;
begin
  if not exists(select 1 from vault.secrets where name='web_push_dispatch_secret') then
    v_secret :=
      replace(gen_random_uuid()::text,'-','') ||
      replace(gen_random_uuid()::text,'-','') ||
      replace(gen_random_uuid()::text,'-','');
    perform vault.create_secret(v_secret,'web_push_dispatch_secret','Nuestro Hogar internal Web Push dispatch secret');
  end if;
end $$;

create or replace function public.get_web_push_dispatch_secret()
returns text
language sql
security definer
set search_path=''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='web_push_dispatch_secret'
  limit 1
$$;

revoke execute on function public.ensure_web_push_dispatch_secret() from public,anon,authenticated;
revoke execute on function public.get_web_push_dispatch_secret() from public,anon,authenticated;
grant execute on function public.ensure_web_push_dispatch_secret() to service_role;
grant execute on function public.get_web_push_dispatch_secret() to service_role;

select public.ensure_web_push_dispatch_secret();

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='nuestro-hogar-web-push-delivery'),
  command := $cron$
    select net.http_post(
      url:='https://dchihxrjtngwabbvsqap.supabase.co/functions/v1/send-web-push',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'apikey','sb_publishable_1IQkLKO6xv1p4jiHDxepRQ_BZa_Sfbc',
        'Authorization','Bearer sb_publishable_1IQkLKO6xv1p4jiHDxepRQ_BZa_Sfbc',
        'X-NH-Dispatch-Secret',
          (select decrypted_secret from vault.decrypted_secrets where name='web_push_dispatch_secret' limit 1)
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=10000
    );
  $cron$
);
