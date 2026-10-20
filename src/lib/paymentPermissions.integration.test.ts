// Real PostgreSQL roles and v35 writer definitions, with a minimal synthetic permission fixture.
// Split allocation and net-worth calculations are covered by the full SQL scenarios, not this fixture.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import original from '../../supabase/migrations/20261019133751_payment_budget_defaults.sql?raw';
import fix from '../../supabase/migrations/20261020085406_fix_payment_private_schema_permissions.sql?raw';
const db = new PGlite();
const home = '11111111-1111-4111-8111-111111111111',
  owner = '22222222-2222-4222-8222-222222222222',
  reader = '33333333-3333-4333-8333-333333333333';
const id = (n: number) => '44444444-4444-4444-8444-' + String(n).padStart(12, '0');
beforeAll(async () => {
  await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema household_integrity;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
    create function public.can_edit_household_module(h uuid,m text) returns boolean language sql stable as $$select h='${home}'::uuid and auth.uid()='${owner}'::uuid$$;
    create table public.households(id uuid primary key);insert into public.households values('${home}');
    create table public.household_members(household_id uuid,user_id uuid);insert into public.household_members values('${home}','${owner}');
    create table public.budget_categories(id uuid,household_id uuid);
    create table public.finance_accounts(id uuid primary key,household_id uuid,name text,account_type text,account_class text,active boolean default true);
    insert into public.finance_accounts values('${id(1)}','${home}','Bank','checking','asset',true),('${id(2)}','${home}','Credit','credit','liability',true);
    create table public.transactions(id uuid primary key default gen_random_uuid(),household_id uuid,description text,amount numeric,type text,transaction_date date,category_id uuid,account_id uuid,paid_by uuid,is_shared boolean,notes text,recurring_transaction_id uuid,original_currency text,original_amount numeric,exchange_rate numeric,budget_included boolean not null default true);
    create table public.finance_write_requests(id uuid primary key,household_id uuid,transaction_id uuid,payload jsonb,created_by uuid default auth.uid());
    create table household_integrity.finance_requests(request_id uuid primary key,household_id uuid,actor_user_id uuid,transaction_id uuid);
    create function household_integrity.rebuild_splits(uuid) returns void language sql as $$select$$;
    create function public.refresh_net_worth_snapshot(uuid) returns void language sql as $$select$$;
    alter table public.finance_accounts enable row level security;alter table public.transactions enable row level security;alter table public.finance_write_requests enable row level security;
    create policy accounts_access on public.finance_accounts to authenticated using(public.can_edit_household_module(household_id,'finance')) with check(public.can_edit_household_module(household_id,'finance'));
    create policy transactions_access on public.transactions to authenticated using(public.can_edit_household_module(household_id,'finance')) with check(public.can_edit_household_module(household_id,'finance'));
    create policy request_access on public.finance_write_requests to authenticated using(public.can_edit_household_module(household_id,'finance') and created_by=auth.uid()) with check(public.can_edit_household_module(household_id,'finance') and created_by=auth.uid());
    grant usage on schema public,auth to authenticated;
    grant select,insert,update on public.finance_accounts,public.transactions,public.finance_write_requests to authenticated;
    -- Intentionally NO USAGE grant on household_integrity, matching production.
  `);
  await db.exec(original);
  await db.exec(
    `revoke execute on function public.save_transaction_once(uuid,uuid,jsonb),public.save_finance_transaction(uuid,jsonb,uuid,uuid) from public,anon;grant execute on function public.save_transaction_once(uuid,uuid,jsonb),public.save_finance_transaction(uuid,jsonb,uuid,uuid) to authenticated;`
  );
}, 30000);
afterAll(async () => db.close());
async function run(sql: string, user = owner, role = 'authenticated') {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role};select set_config('qa.uid','${user}',true)`);
    const result = await db.exec(sql);
    await db.exec('commit');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}
const values = (account = id(1), budget?: boolean, type = 'expense') => ({
  amount: 391,
  type,
  date: '2026-10-20',
  description: 'Electricidad QA',
  account_id: account,
  paid_by: owner,
  is_shared: true,
  recurring: false,
  ...(budget === undefined ? {} : {budget_included: budget})
});
const save = (n: number, data = values()) =>
  `select public.save_transaction_once('${home}','${id(n)}','${JSON.stringify(data)}'::jsonb)`;
const direct = `insert into public.transactions(household_id,description,amount,type,transaction_date,account_id,paid_by,is_shared) values('${home}','Direct API',3,'expense','2026-10-20','${id(1)}','${owner}',false)`;
describe.sequential('v35 save permissions with the private schema closed', () => {
  it('reproduces the reported failure for explicit RPC values and direct inserts before the fix', async () => {
    await expect(run(save(10, values(id(1), false)))).rejects.toThrow(
      'permission denied for schema household_integrity'
    );
    await expect(run(direct)).rejects.toThrow('permission denied for schema household_integrity');
    expect((await db.query('select id from public.transactions')).rows).toHaveLength(0);
  });
  it('applies twice and saves both budget choices, automatic credit and income as authenticated', async () => {
    await db.exec(fix);
    await db.exec(fix);
    await run(save(10, values(id(1), false)));
    await run(save(11, values(id(1), true)));
    await run(save(12, values(id(2))));
    await run(save(13, values(id(1), undefined, 'income')));
    const rows = (
      await db.query<{id: string; budget_included: boolean}>(
        'select id,budget_included from public.transactions order by id'
      )
    ).rows;
    expect(rows.map(x => x.budget_included)).toEqual([false, true, true, true]);
  });
  it('retains idempotency and the saved classification when account metadata changes', async () => {
    await run(save(10, values(id(1), false)));
    await run(save(10));
    await db.exec(
      `update public.finance_accounts set account_type='credit',account_class='liability' where id='${id(1)}'`
    );
    await run(save(10));
    await expect(run(save(10, values(id(1), true)))).rejects.toThrow('otros datos');
    expect((await db.query('select id from public.transactions')).rows).toHaveLength(4);
    await db.exec(
      `update public.finance_accounts set account_type='checking',account_class='asset' where id='${id(1)}'`
    );
  });
  it('runs the invoker trigger without schema usage and preserves classification on edit', async () => {
    await run(direct);
    await run(`update public.transactions set description='Edited' where description='Direct API'`);
    expect(
      (
        await db.query<{budget_included: boolean}>(
          "select budget_included from public.transactions where description='Edited'"
        )
      ).rows[0].budget_included
    ).toBe(false);
  });
  it('rejects unrelated and anonymous callers and hides financial rows with RLS', async () => {
    await expect(run(save(20), reader)).rejects.toThrow('permiso');
    await expect(run(save(20), reader, 'anon')).rejects.toThrow('permission denied');
    expect((await run('select id from public.transactions', reader))[0].rows).toHaveLength(0);
  });
  it('keeps the schema private and both new functions as invokers', async () => {
    const r = await db.query<{auth_usage: boolean; anon_usage: boolean; helper_execute: boolean; definer: boolean}>(
      `select has_schema_privilege('authenticated','household_integrity','USAGE') auth_usage,has_schema_privilege('anon','household_integrity','USAGE') anon_usage,has_function_privilege('authenticated','household_integrity.default_payment_budget(uuid,uuid,text)','EXECUTE') helper_execute,exists(select 1 from pg_proc where oid in ('household_integrity.infer_payment_budget()'::regprocedure,'public.save_transaction_once(uuid,uuid,jsonb)'::regprocedure) and prosecdef) definer`
    );
    expect(r.rows[0]).toEqual({auth_usage: false, anon_usage: false, helper_execute: false, definer: false});
  });
});
