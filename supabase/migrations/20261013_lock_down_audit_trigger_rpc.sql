-- Audit is invoked by table triggers, not by public Data API clients.
-- Preserve trigger behavior while preventing direct RPC execution.
REVOKE EXECUTE ON FUNCTION public.audit_household_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_household_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_household_change() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.audit_household_change() TO service_role;
