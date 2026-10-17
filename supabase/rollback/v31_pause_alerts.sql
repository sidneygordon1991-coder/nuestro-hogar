-- Emergency pause of v31 alert generation only. Retains tables/data, module filters and privacy safeguards.
-- Apply as a reviewed transaction if new alert generation must be stopped.
begin;
CREATE OR REPLACE FUNCTION public.refresh_my_notifications(p_household_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  perform public.refresh_notifications_for_household(p_household_id);
  perform public.refresh_recurring_event_notifications_for_household(p_household_id);
  perform public.refresh_document_notifications_for_household(p_household_id);
  perform public.refresh_maintenance_notifications_for_household(p_household_id);
  perform public.refresh_planning_notifications_for_household(p_household_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.run_household_automation()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.generate_recurring_occurrences(
    date_trunc('month',(now() at time zone 'America/Guatemala'))::date,12
  );
  perform public.run_all_household_automation_rules();
  perform public.refresh_all_notifications();
  perform public.refresh_all_recurring_event_notifications();
  perform public.refresh_all_document_notifications();
  perform public.refresh_all_maintenance_notifications();
  perform public.refresh_all_planning_notifications();
  perform public.refresh_all_monthly_close_notifications();
  perform public.refresh_all_net_worth_snapshots();
  perform public.purge_expired_recovery_items();
  perform public.purge_old_app_error_logs();
end $function$
;
commit;
