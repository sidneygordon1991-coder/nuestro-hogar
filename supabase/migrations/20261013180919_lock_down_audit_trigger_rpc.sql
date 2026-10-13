-- Internal audit trigger must not be exposed as a direct RPC.
-- Trigger execution remains unaffected; only direct EXECUTE privileges are restricted.

REVOKE EXECUTE ON FUNCTION public.audit_household_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_household_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_household_change() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.audit_household_change() TO service_role;
