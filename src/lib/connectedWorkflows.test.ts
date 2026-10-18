import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import migration from '../../supabase/migrations/20261016202958_connected_finance_workflows.sql?raw';
import draftsMigration from '../../supabase/migrations/20261016203009_safe_finance_drafts.sql?raw';
import collaborationMigration from '../../supabase/migrations/20261016203014_collaboration_operational_visibility.sql?raw';
import reuseMigration from '../../supabase/migrations/20261016203147_reuse_atomic_finance_save.sql?raw';
import indexesMigration from '../../supabase/migrations/20261016221454_connected_workflow_indexes.sql?raw';
const db = new PGlite(),
  h = '10000000-0000-4000-8000-000000000001',
  foreign = '10000000-0000-4000-8000-000000000002',
  owner = '20000000-0000-4000-8000-000000000001',
  reader = '20000000-0000-4000-8000-000000000002',
  outsider = '20000000-0000-4000-8000-000000000003';
const id = (n: number) => '30000000-0000-4000-8000-' + String(n).padStart(12, '0');
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema household_integrity;create schema platform_security;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
 create table households(id uuid primary key,archived boolean default false);insert into households(id) values('${h}'),('${foreign}');
 create function public.can_view_household_module(home uuid,module text) returns boolean language sql stable as $$select home='${h}'::uuid and auth.uid() in ('${owner}'::uuid,'${reader}'::uuid)$$;
 create function public.can_edit_household_module(home uuid,module text) returns boolean language sql stable as $$select public.can_view_household_module(home,module) and auth.uid()='${owner}'::uuid and not coalesce((select archived from public.households where id=home),true)$$;
 create function platform_security.guard_archived_write() returns trigger language plpgsql as $$begin if (select archived from public.households where id=coalesce(new.household_id,old.household_id)) then raise exception 'archived' using errcode='42501';end if;if tg_op='DELETE' then return old;end if;return new;end$$;
 create table savings_goals(id uuid primary key,household_id uuid references households(id),active boolean default true);
 create table budget_categories(id uuid primary key,household_id uuid references households(id),budget_group text);
 create table lists(id uuid primary key,household_id uuid references households(id),title text,list_type text);
 create table list_items(id uuid primary key,household_id uuid references households(id),list_id uuid references lists(id),text text,quantity text,notes text,completed boolean default false,sort_order integer default 0);
 create table finance_accounts(id uuid primary key,household_id uuid references households(id),opening_balance numeric,account_class text);
 create table transactions(id uuid primary key default gen_random_uuid(),household_id uuid references households(id),amount numeric,type text,transaction_date date,account_id uuid references finance_accounts(id),description text,category_id uuid,paid_by uuid,is_shared boolean,notes text);
 create table finance_transfers(id uuid primary key default gen_random_uuid(),household_id uuid references households(id),amount numeric,transfer_date date,from_account_id uuid references finance_accounts(id),to_account_id uuid references finance_accounts(id));
 create function quick_add_transaction(p_household_id uuid,p_description text,p_amount numeric,p_type text,p_transaction_date date,p_category_id uuid,p_account_id uuid,p_paid_by uuid,p_is_shared boolean,p_notes text) returns uuid language plpgsql as $$declare tx uuid;begin insert into public.transactions(household_id,description,amount,type,transaction_date,category_id,account_id,paid_by,is_shared,notes) values(p_household_id,p_description,p_amount,p_type,p_transaction_date,p_category_id,p_account_id,p_paid_by,p_is_shared,p_notes) returning id into tx;return tx;end$$;
 grant usage on schema public,auth,household_integrity,platform_security to authenticated;grant select on households to authenticated;
 grant select,insert,update,delete on savings_goals,budget_categories,lists,list_items,finance_accounts,transactions,finance_transfers to authenticated;
 insert into savings_goals values('${id(1)}','${h}',true),('${id(2)}','${foreign}',true);
 insert into budget_categories values('${id(3)}','${h}','saving'),('${id(4)}','${h}','variable'),('${id(5)}','${foreign}','saving');
 insert into lists values('${id(6)}','${h}','Super QA','shopping');
 insert into list_items(id,household_id,list_id,text,quantity,completed) values('${id(7)}','${h}','${id(6)}','Leche','2',true),('${id(8)}','${h}','${id(6)}','Arroz','1 kg',false),('${id(9)}','${h}','${id(6)}','Café','1',true);
 insert into finance_accounts values('${id(10)}','${h}',100,'asset'),('${id(11)}','${h}',100,'liability');
 insert into transactions(household_id,amount,type,transaction_date,account_id) values('${h}',50,'income','2026-01-10','${id(10)}'),('${h}',10,'expense','2026-01-11','${id(10)}'),('${h}',30,'expense','2026-01-11','${id(11)}'),('${h}',10,'income','2026-01-11','${id(11)}'),('${h}',900,'expense','2999-01-11','${id(10)}');
 insert into finance_transfers(household_id,amount,transfer_date,from_account_id,to_account_id) values('${h}',20,'2026-01-12','${id(10)}','${id(11)}');`);
  await db.exec(migration);
  await db.exec(`alter table households add column created_at timestamptz default now();alter table transactions add column recurring_transaction_id uuid;
 create table recurring_transactions(id uuid primary key default gen_random_uuid(),household_id uuid,category_id uuid,account_id uuid,type text,description text,amount numeric,due_day integer,paid_by uuid,is_shared boolean);
 create table recurring_transaction_occurrences(id uuid default gen_random_uuid(),recurring_transaction_id uuid,household_id uuid,period_month date,due_date date,status text,paid_at timestamptz,transaction_id uuid);
 create table household_backups(household_id uuid,created_at timestamptz);create table app_error_logs(household_id uuid,resolved_at timestamptz,last_seen_at timestamptz);
 create function platform_security.overview() returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin select jsonb_build_object('created_at',h.created_at) into result from public.households h limit 1;return result;end$$;
 grant select,insert,update,delete on recurring_transactions,recurring_transaction_occurrences to authenticated;`);
  await db.exec(draftsMigration);
  await db.exec(collaborationMigration);
  await db.exec(`create function public.save_finance_transaction(h uuid,p jsonb,t uuid,r uuid) returns uuid language plpgsql as $$declare tx uuid;rec uuid;m date;begin
 tx:=public.quick_add_transaction(h,p->>'description',(p->>'amount')::numeric,p->>'type',(p->>'transaction_date')::date,(p->>'category_id')::uuid,(p->>'account_id')::uuid,(p->>'paid_by')::uuid,(p->>'is_shared')::boolean,p->>'notes');
 if (p->>'recurring')::boolean then
 insert into public.recurring_transactions(household_id,type,description,amount,due_day) values(h,p->>'type',p->>'description',(p->>'amount')::numeric,(p->>'due_day')::integer) returning id into rec;
 update public.transactions set recurring_transaction_id=rec where id=tx;
 m:=date_trunc('month',(p->>'transaction_date')::date)::date;
 insert into public.recurring_transaction_occurrences(recurring_transaction_id,household_id,period_month,due_date,status,paid_at,transaction_id) values(rec,h,m,m+least((p->>'due_day')::integer,extract(day from(m+interval '1 month - 1 day'))::integer)-1,'paid',now(),tx);
 end if;return tx;end$$;`);
  await db.exec(reuseMigration);
  await db.exec(indexesMigration);
}, 30000);
afterAll(async () => db.close());
async function run(sql: string, user = owner) {
  await db.exec('begin');
  try {
    await db.exec(`set local role authenticated;select set_config('qa.uid','${user}',true)`);
    const result = await db.exec(sql);
    await db.exec('commit');
    return result;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}
const checkout = (request = id(20), item = id(7), amount = 25) =>
  `select checkout_shopping_purchase('${h}','${request}','${id(6)}',array['${item}']::uuid[],${amount},'2026-01-13','${id(4)}',null,'${owner}',true,'Compra QA') id`;
const state = (account = id(10)) => `select get_account_book_state('${h}','${account}','2026-01-15') value`;
describe.sequential('connected finance workflows on PostgreSQL', () => {
  it('links each goal once per month and rejects foreign or expense categories', async () => {
    await run(
      `insert into goal_budget_links values('${h}','${id(1)}','2026-01-01','${id(3)}'),('${h}','${id(1)}','2026-02-01','${id(3)}')`
    );
    for (const [goal, category] of [
      [id(2), id(3)],
      [id(1), id(5)],
      [id(1), id(4)]
    ])
      await expect(
        run(`insert into goal_budget_links values('${h}','${goal}','2026-03-01','${category}')`)
      ).rejects.toThrow();
    await expect(
      run(`insert into goal_budget_links values('${h}','${id(1)}','2026-01-01','${id(3)}')`)
    ).rejects.toThrow();
  });
  it('creates one expense with durable item snapshots and retries idempotently', async () => {
    const first = await run(checkout()),
      again = await run(checkout());
    expect(first[0].rows[0]).toEqual(again[0].rows[0]);
    expect((await db.query('select * from shopping_checkouts')).rows).toHaveLength(1);
    const rows = await db.query<{snapshot: {text: string; quantity: string}}>(
      'select snapshot from shopping_checkout_items'
    );
    expect(rows.rows[0].snapshot).toMatchObject({text: 'Leche', quantity: '2'});
  });
  it('rejects changed retries and a second charge for the same item', async () => {
    await expect(run(checkout(id(20), id(7), 26))).rejects.toThrow('otros datos');
    await expect(run(checkout(id(21), id(7)))).rejects.toThrow('ya vinculados');
    expect((await db.query('select * from shopping_checkouts')).rows).toHaveLength(1);
  });
  it('rejects pending, foreign or invalid selection without creating expenses', async () => {
    const before = (await db.query('select * from transactions')).rows.length;
    for (const sql of [
      checkout(id(21), id(8)),
      checkout(id(21), id(99)),
      checkout(id(21), id(9), 0),
      checkout(id(21), id(9), 0.001)
    ])
      await expect(run(sql)).rejects.toThrow();
    expect((await db.query('select * from transactions')).rows).toHaveLength(before);
  });
  it('enforces reader and outsider permissions for actions and new tables', async () => {
    for (const user of [reader, outsider]) {
      await expect(run(checkout(id(21), id(9)), user)).rejects.toThrow('Necesitas');
      await expect(
        run(`insert into goal_budget_links values('${h}','${id(1)}','2026-03-01','${id(3)}')`, user)
      ).rejects.toThrow();
    }
    for (const table of [
      'goal_budget_links',
      'shopping_checkouts',
      'shopping_checkout_items',
      'account_reconciliations'
    ])
      expect((await run('select * from ' + table, outsider))[0].rows).toHaveLength(0);
  });
  it('keeps purchase evidence when completed items are cleaned and blocks deleted-expense retries', async () => {
    await run(`delete from list_items where id='${id(7)}'`);
    expect(
      (
        await db.query<{snapshot: {text: string}; item_id: string | null}>(
          'select snapshot,item_id from shopping_checkout_items'
        )
      ).rows[0]
    ).toMatchObject({item_id: null, snapshot: {text: 'Leche'}});
    await run(`delete from transactions where id=(select transaction_id from shopping_checkouts where id='${id(20)}')`);
    await expect(run(checkout())).rejects.toThrow('eliminado');
  });
  it('uses correct asset and liability signs, transfers and cutoff', async () => {
    expect((await run(state()))[0].rows[0].value).toMatchObject({
      balance: 120,
      transaction_count: 2,
      transfer_count: 1
    });
    expect((await run(state(id(11))))[0].rows[0].value).toMatchObject({balance: 100});
  });
  it('confirms a balance once without changing money and refuses stale fingerprints', async () => {
    const s = (await run(state()))[0].rows[0].value as {fingerprint: string};
    const sql = `select confirm_account_reconciliation('${h}','${id(30)}','${id(10)}','2026-01-15',119.50,'${s.fingerprint}','Extracto QA')`;
    const count = (await db.query('select * from transactions')).rows.length;
    await run(sql);
    await run(sql);
    expect((await db.query('select * from account_reconciliations')).rows).toHaveLength(1);
    expect((await db.query('select * from transactions')).rows).toHaveLength(count);
    await run(
      `insert into transactions(household_id,account_id,amount,type,transaction_date) values('${h}','${id(10)}',1,'expense','2026-01-14')`
    );
    await expect(run(sql.replace(id(30), id(31)))).rejects.toThrow('cambió');
  });
  it('computes book balances server-side and retains immutable confirmations', async () => {
    const s = (await run(state()))[0].rows[0].value as {fingerprint: string};
    await run(
      `insert into account_reconciliations(id,household_id,account_id,cutoff,confirmed_balance,book_balance,fingerprint) values('${id(32)}','${h}','${id(10)}','2026-01-15',118,999,'${s.fingerprint}')`
    );
    expect(
      (await db.query<{book_balance: string}>(`select book_balance from account_reconciliations where id='${id(32)}'`))
        .rows[0].book_balance
    ).toBe('119.00');
    await expect(run('delete from account_reconciliations')).rejects.toThrow();
    await expect(run('update account_reconciliations set confirmed_balance=999')).rejects.toThrow();
  });
  it('preserves archive guards and denies anonymous RPC execution', async () => {
    await db.exec(`update households set archived=true where id='${h}'`);
    await expect(run(checkout(id(21), id(9)))).rejects.toThrow('Necesitas');
    await run('delete from goal_budget_links');
    expect((await db.query('select * from goal_budget_links')).rows).toHaveLength(2);
    await db.exec(`update households set archived=false where id='${h}'`);
    const rows = await db.query<{definer: boolean; anon: boolean}>(
      `select prosecdef definer,has_function_privilege('anon',oid,'execute') anon from pg_proc where proname in ('checkout_shopping_purchase','get_account_book_state','confirm_account_reconciliation')`
    );
    expect(rows.rows).toHaveLength(3);
    expect(rows.rows.every(r => !r.definer && !r.anon)).toBe(true);
  });
});

const movement = (request = id(40), amount = 10, recurring = false) =>
  `select save_transaction_once('${h}','${request}',jsonb_build_object('amount',${amount},'type','expense','date','2026-02-15','description','Safe QA','is_shared',true,'recurring',${recurring},'due_day',31)) id`;
describe.sequential('resilience and collaboration', () => {
  it('retries the same movement and recurring schedule as one atomic operation', async () => {
    const first = await run(movement(id(40), 10, true)),
      again = await run(movement(id(40), 10, true));
    expect(first[0].rows[0]).toEqual(again[0].rows[0]);
    expect((await db.query('select * from finance_write_requests')).rows).toHaveLength(1);
    expect((await db.query('select * from recurring_transactions')).rows).toHaveLength(1);
    const occurrences = await db.query<{due_date: string}>(
      'select due_date::text from recurring_transaction_occurrences'
    );
    expect(occurrences.rows).toEqual([{due_date: '2026-02-28'}]);
  });
  it('rejects changed, invalid and unauthorized submissions without a second expense', async () => {
    const count = (await db.query('select * from transactions')).rows.length;
    await expect(run(movement(id(40), 11, true))).rejects.toThrow('otros datos');
    for (const amount of [0, -1, 0.001]) await expect(run(movement(id(41), amount))).rejects.toThrow();
    for (const user of [reader, outsider]) await expect(run(movement(id(41)), user)).rejects.toThrow('Necesitas');
    expect((await db.query('select * from transactions')).rows).toHaveLength(count);
    expect((await run('select * from finance_write_requests', reader))[0].rows).toHaveLength(0);
  });
  it('never recreates a movement deleted after an uncertain response', async () => {
    await run(
      `delete from transactions where id=(select transaction_id from finance_write_requests where id='${id(40)}')`
    );
    await expect(run(movement(id(40), 10, true))).rejects.toThrow('eliminado');
  });
  it('keeps comment authors, targets and household boundaries server-controlled', async () => {
    await run(
      `insert into household_comments(id,household_id,list_item_id,body,created_by) values('${id(50)}','${h}','${id(9)}','Shared QA','${outsider}')`
    );
    const result = await run('select * from household_comments');
    expect(result[0].rows[0].created_by).toBe(owner);
    await expect(
      run(`insert into household_comments(household_id,list_item_id,body) values('${foreign}','${id(9)}','Invalid')`)
    ).rejects.toThrow();
    expect((await run('select * from household_comments', reader))[0].rows).toHaveLength(1);
    expect((await run('select * from household_comments', outsider))[0].rows).toHaveLength(0);
    await expect(
      run(`insert into household_comments(household_id,list_item_id,body) values('${h}','${id(9)}','Reader')`, reader)
    ).rejects.toThrow();
    await run('delete from household_comments', reader);
    expect((await db.query('select * from household_comments')).rows).toHaveLength(1);
    await expect(run("update household_comments set body='Changed'")).rejects.toThrow();
    await run('delete from household_comments');
    expect((await db.query('select * from household_comments')).rows).toHaveLength(0);
  });
  it('allows trusted restoration of evidence without recomputing historical book balances', async () => {
    const hash = 'c'.repeat(32);
    await db.exec(
      `insert into account_reconciliations(id,household_id,account_id,cutoff,confirmed_balance,book_balance,fingerprint,created_by) values('${id(60)}','${h}','${id(10)}','2026-01-15',90,95,'${hash}','${owner}')`
    );
    expect(
      (
        await db.query<{source: string; book_balance: string}>(
          `select source,book_balance from account_reconciliations where id='${id(60)}'`
        )
      ).rows
    ).toEqual([{source: 'restored', book_balance: '95.00'}]);
  });
  it('keeps new RPCs invoker-only and denies anonymous calls', async () => {
    const rows = await db.query<{definer: boolean; anon: boolean}>(
      `select prosecdef definer,has_function_privilege('anon',oid,'execute') anon from pg_proc where proname in ('save_transaction_once','get_household_comments_capability')`
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every(r => !r.definer && !r.anon)).toBe(true);
  });
});
