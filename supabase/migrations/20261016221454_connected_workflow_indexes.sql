-- Cover parent-record cleanup and avoid evaluating the caller ID for every row.
create index goal_budget_links_category on public.goal_budget_links(category_id);
create index shopping_checkouts_list on public.shopping_checkouts(list_id);
create index account_reconciliations_account on public.account_reconciliations(account_id);
create index household_comments_transaction on public.household_comments(transaction_id);
create index household_comments_item on public.household_comments(list_item_id);
alter policy checkout_create on public.shopping_checkouts with check(created_by=(select auth.uid()) and public.can_edit_household_module(household_id,'finance') and public.can_edit_household_module(household_id,'lists'));
alter policy reconciliation_create on public.account_reconciliations with check(created_by=(select auth.uid()) and public.can_edit_household_module(household_id,'finance'));
drop policy goal_links_edit on public.goal_budget_links;
create policy goal_links_insert on public.goal_budget_links for insert to authenticated with check(public.can_edit_household_module(household_id,'finance'));
create policy goal_links_update on public.goal_budget_links for update to authenticated using(public.can_edit_household_module(household_id,'finance')) with check(public.can_edit_household_module(household_id,'finance'));
create policy goal_links_delete on public.goal_budget_links for delete to authenticated using(public.can_edit_household_module(household_id,'finance'));
