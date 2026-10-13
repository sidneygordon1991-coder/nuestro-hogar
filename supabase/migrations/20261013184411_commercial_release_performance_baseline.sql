-- Commercial Release 1.0 performance baseline.
-- Adds covering indexes for foreign keys and avoids per-row auth.uid() evaluation
-- in the remaining RLS policies flagged by Supabase Advisor.

create index if not exists idx_app_error_logs_resolved_by on public.app_error_logs(resolved_by);
create index if not exists idx_app_error_logs_user_id on public.app_error_logs(user_id);
create index if not exists idx_finance_transfers_created_by on public.finance_transfers(created_by);
create index if not exists idx_household_audit_log_actor_user_id on public.household_audit_log(actor_user_id);
create index if not exists idx_household_automation_rules_updated_by on public.household_automation_rules(updated_by);
create index if not exists idx_household_backups_created_by on public.household_backups(created_by);
create index if not exists idx_household_diagnostic_runs_created_by on public.household_diagnostic_runs(created_by);
create index if not exists idx_household_documents_created_by on public.household_documents(created_by);
create index if not exists idx_household_member_access_updated_by on public.household_member_access(updated_by);
create index if not exists idx_household_planning_goals_created_by on public.household_planning_goals(created_by);
create index if not exists idx_household_planning_goals_linked_account on public.household_planning_goals(linked_account_id);
create index if not exists idx_household_planning_goals_linked_event on public.household_planning_goals(linked_event_id);
create index if not exists idx_household_planning_goals_linked_maintenance on public.household_planning_goals(linked_maintenance_id);
create index if not exists idx_household_planning_goals_linked_savings_goal on public.household_planning_goals(linked_savings_goal_id);
create index if not exists idx_household_recovery_items_deleted_by on public.household_recovery_items(deleted_by);
create index if not exists idx_household_recovery_items_restored_by on public.household_recovery_items(restored_by);
create index if not exists idx_list_items_source_recipe on public.list_items(source_recipe_id);
create index if not exists idx_maintenance_records_created_by on public.maintenance_records(created_by);
create index if not exists idx_maintenance_records_document on public.maintenance_records(document_id);
create index if not exists idx_maintenance_records_schedule on public.maintenance_records(schedule_id);
create index if not exists idx_maintenance_schedules_calendar_event on public.maintenance_schedules(calendar_event_id);
create index if not exists idx_maintenance_schedules_created_by on public.maintenance_schedules(created_by);
create index if not exists idx_maintenance_schedules_document on public.maintenance_schedules(document_id);
create index if not exists idx_meal_plan_entries_created_by on public.meal_plan_entries(created_by);
create index if not exists idx_monthly_household_closures_closed_by on public.monthly_household_closures(closed_by);
create index if not exists idx_notification_preferences_user_id on public.notification_preferences(user_id);
create index if not exists idx_pantry_items_created_by on public.pantry_items(created_by);
create index if not exists idx_planning_milestones_created_by on public.planning_milestones(created_by);
create index if not exists idx_recipe_ingredients_household_id on public.recipe_ingredients(household_id);
create index if not exists idx_recipes_created_by on public.recipes(created_by);

drop policy if exists household_members_delete on public.household_members;
create policy household_members_delete on public.household_members
for delete to authenticated
using (
  ((user_id = (select auth.uid())) and (role <> 'owner'))
  or ((public.household_role_for_user(household_id,(select auth.uid())) = 'owner') and (role <> 'owner'))
  or ((public.household_role_for_user(household_id,(select auth.uid())) = 'admin') and (role = any(array['adult','teen','guest'])))
);

drop policy if exists household_documents_select on public.household_documents;
create policy household_documents_select on public.household_documents
for select to authenticated
using (
  public.can_view_household_module(household_id,'documents')
  and (access_scope='household' or owner_user_id=(select auth.uid()))
);

drop policy if exists household_documents_insert on public.household_documents;
create policy household_documents_insert on public.household_documents
for insert to authenticated
with check (
  public.can_edit_household_module(household_id,'documents')
  and created_by=(select auth.uid())
  and (access_scope='household' or owner_user_id=(select auth.uid()))
);

drop policy if exists household_documents_update on public.household_documents;
create policy household_documents_update on public.household_documents
for update to authenticated
using (
  public.can_edit_household_module(household_id,'documents')
  and (access_scope='household' or owner_user_id=(select auth.uid()))
)
with check (
  public.can_edit_household_module(household_id,'documents')
  and (access_scope='household' or owner_user_id=(select auth.uid()))
);

drop policy if exists household_documents_delete on public.household_documents;
create policy household_documents_delete on public.household_documents
for delete to authenticated
using (
  public.can_edit_household_module(household_id,'documents')
  and (access_scope='household' or owner_user_id=(select auth.uid()))
);

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated
using (
  user_id=(select auth.uid())
  and public.is_household_member(household_id)
  and public.notification_module_allowed(household_id,action_tab,type)
);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update to authenticated
using (
  user_id=(select auth.uid())
  and public.is_household_member(household_id)
  and public.notification_module_allowed(household_id,action_tab,type)
)
with check (
  user_id=(select auth.uid())
  and public.is_household_member(household_id)
  and public.notification_module_allowed(household_id,action_tab,type)
);

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
for delete to authenticated
using (
  user_id=(select auth.uid())
  and public.is_household_member(household_id)
  and public.notification_module_allowed(household_id,action_tab,type)
);
