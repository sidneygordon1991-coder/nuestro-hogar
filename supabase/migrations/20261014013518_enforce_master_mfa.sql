-- Enrollment stays available at aal1; global administration requires a verified aal2 session.
-- Existing masters are activated after the enrollment UI has been deployed.
alter table platform_security.masters add column mfa_required boolean not null default false;
alter table platform_security.masters alter column mfa_required set default true;
create or replace function platform_security.require_master() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not platform_security.is_master() then raise exception 'Acceso master requerido' using errcode='42501';end if;
 if exists(select 1 from platform_security.masters where user_id=auth.uid() and mfa_required) and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'Verifica tu autenticador para abrir la administración global' using errcode='42501';end if;
end $$;
revoke all on function platform_security.require_master() from public,anon,authenticated;
