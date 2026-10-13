-- Household document vault, private storage and expiry alerts.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('payment','event','task','birthday','budget','goal','document','system'));

alter table public.notification_preferences
  add column if not exists documents boolean not null default true;

create table if not exists public.household_documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  category text not null default 'other'
    check (category in ('personal','home','vehicle','health','finance','insurance','warranty','education','other')),
  document_number text,
  issuer text,
  owner_user_id uuid references auth.users(id) on delete set null,
  access_scope text not null default 'household'
    check (access_scope in ('household','private')),
  issued_on date,
  expires_on date,
  file_path text,
  original_filename text,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  notes text,
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_household_documents_household_category on public.household_documents(household_id,category);
create index if not exists idx_household_documents_expiry on public.household_documents(household_id,expires_on) where expires_on is not null;
create index if not exists idx_household_documents_owner on public.household_documents(owner_user_id);

alter table public.household_documents enable row level security;

create policy household_documents_select on public.household_documents for select to authenticated
using (
  public.is_household_member(household_id)
  and (access_scope='household' or owner_user_id=(select auth.uid()))
);
create policy household_documents_insert on public.household_documents for insert to authenticated
with check (
  public.is_household_member(household_id)
  and created_by=(select auth.uid())
  and (access_scope='household' or owner_user_id=(select auth.uid()))
);
create policy household_documents_update on public.household_documents for update to authenticated
using (
  public.is_household_member(household_id)
  and (access_scope='household' or owner_user_id=(select auth.uid()))
)
with check (
  public.is_household_member(household_id)
  and (access_scope='household' or owner_user_id=(select auth.uid()))
);
create policy household_documents_delete on public.household_documents for delete to authenticated
using (
  public.is_household_member(household_id)
  and (access_scope='household' or owner_user_id=(select auth.uid()))
);

grant select,insert,update,delete on public.household_documents to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'household-documents','household-documents',false,15728640,
  array[
    'application/pdf','image/jpeg','image/png','image/webp','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict(id) do update set
  public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy household_documents_storage_select on storage.objects for select to authenticated
using (
  bucket_id='household-documents'
  and exists (
    select 1 from public.household_members hm
    where hm.household_id::text=(storage.foldername(name))[1]
      and hm.user_id=(select auth.uid())
  )
  and (
    (storage.foldername(name))[2]='household'
    or ((storage.foldername(name))[2]='private' and (storage.foldername(name))[3]=(select auth.uid())::text)
  )
);

create policy household_documents_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id='household-documents'
  and exists (
    select 1 from public.household_members hm
    where hm.household_id::text=(storage.foldername(name))[1]
      and hm.user_id=(select auth.uid())
  )
  and (
    (storage.foldername(name))[2]='household'
    or ((storage.foldername(name))[2]='private' and (storage.foldername(name))[3]=(select auth.uid())::text)
  )
);

create policy household_documents_storage_update on storage.objects for update to authenticated
using (
  bucket_id='household-documents'
  and exists (
    select 1 from public.household_members hm
    where hm.household_id::text=(storage.foldername(name))[1]
      and hm.user_id=(select auth.uid())
  )
  and (
    (storage.foldername(name))[2]='household'
    or ((storage.foldername(name))[2]='private' and (storage.foldername(name))[3]=(select auth.uid())::text)
  )
)
with check (
  bucket_id='household-documents'
  and exists (
    select 1 from public.household_members hm
    where hm.household_id::text=(storage.foldername(name))[1]
      and hm.user_id=(select auth.uid())
  )
  and (
    (storage.foldername(name))[2]='household'
    or ((storage.foldername(name))[2]='private' and (storage.foldername(name))[3]=(select auth.uid())::text)
  )
);

create policy household_documents_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id='household-documents'
  and exists (
    select 1 from public.household_members hm
    where hm.household_id::text=(storage.foldername(name))[1]
      and hm.user_id=(select auth.uid())
  )
  and (
    (storage.foldername(name))[2]='household'
    or ((storage.foldername(name))[2]='private' and (storage.foldername(name))[3]=(select auth.uid())::text)
  )
);

create or replace function public.refresh_document_notifications_for_household(p_household_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_today date:=(now() at time zone 'America/Guatemala')::date;
begin
  insert into public.notifications(
    household_id,user_id,type,severity,title,body,action_tab,entity_type,entity_id,dedupe_key,expires_at
  )
  select d.household_id,hm.user_id,'document',
    case when d.expires_on<v_today then 'danger' when d.expires_on<=v_today+7 then 'danger' else 'warning' end,
    case
      when d.expires_on<v_today then 'Documento vencido'
      when d.expires_on=v_today then 'Documento vence hoy'
      when d.expires_on<=v_today+7 then 'Documento vence pronto'
      else 'Documento por vencer'
    end,
    d.title||' · '||case when d.expires_on<v_today then 'venció '||to_char(d.expires_on,'DD Mon YYYY') else 'vence '||to_char(d.expires_on,'DD Mon YYYY') end,
    'documentos','household_document',d.id,
    'document-expiry-'||d.id::text||'-'||d.expires_on::text||
      case when d.expires_on<v_today then '-expired' when d.expires_on<=v_today+7 then '-7' else '-30' end,
    (d.expires_on::timestamptz)+interval '45 days'
  from public.household_documents d
  join public.household_members hm on hm.household_id=d.household_id
  join public.notification_preferences np on np.household_id=hm.household_id and np.user_id=hm.user_id
  where d.household_id=p_household_id
    and d.expires_on is not null
    and d.expires_on<=v_today+30
    and np.documents=true
    and (d.access_scope='household' or (d.access_scope='private' and d.owner_user_id=hm.user_id))
  on conflict(user_id,dedupe_key) do nothing;
end $$;

create or replace function public.refresh_all_document_notifications()
returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
  for r in select id from public.households loop
    perform public.refresh_document_notifications_for_household(r.id);
  end loop;
end $$;

create or replace function public.refresh_my_notifications(p_household_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  perform public.refresh_notifications_for_household(p_household_id);
  perform public.refresh_recurring_event_notifications_for_household(p_household_id);
  perform public.refresh_document_notifications_for_household(p_household_id);
end $$;

create or replace function public.run_household_automation()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.generate_recurring_occurrences(date_trunc('month',(now() at time zone 'America/Guatemala'))::date,12);
  perform public.refresh_all_notifications();
  perform public.refresh_all_recurring_event_notifications();
  perform public.refresh_all_document_notifications();
  perform public.refresh_all_net_worth_snapshots();
end $$;

revoke execute on function public.refresh_document_notifications_for_household(uuid) from public,anon,authenticated;
revoke execute on function public.refresh_all_document_notifications() from public,anon,authenticated;
revoke execute on function public.refresh_my_notifications(uuid) from public,anon;
grant execute on function public.refresh_my_notifications(uuid) to authenticated;
revoke execute on function public.run_household_automation() from public,anon,authenticated;
grant execute on function public.run_household_automation() to service_role;
