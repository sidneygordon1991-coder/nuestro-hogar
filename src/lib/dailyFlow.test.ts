import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import migration from '../../supabase/migrations/20261016141553_family_daily_flow.sql?raw';
import compatibility from '../../supabase/migrations/20261016142118_list_routine_completion_compatibility.sql?raw';
import {selectDailyAgenda, type DailyAgendaItem} from './dailyAgenda';
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222',
  outsider = '33333333-3333-4333-8333-333333333333',
  h = '44444444-4444-4444-8444-444444444444',
  l = '55555555-5555-4555-8555-555555555555',
  p = '66666666-6666-4666-8666-666666666666',
  r = '77777777-7777-4777-8777-777777777777';
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema household_integrity;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
 create function can_view_household_module(x uuid,m text) returns boolean language sql stable as $$select x='${h}' and auth.uid() in ('${a}'::uuid,'${b}'::uuid)$$;
 create function can_edit_household_module(x uuid,m text) returns boolean language sql stable as $$select x='${h}' and auth.uid()='${a}'::uuid$$;
 create table household_members(household_id uuid,user_id uuid);insert into household_members values('${h}','${a}'),('${h}','${b}');
 create table lists(id uuid primary key default gen_random_uuid(),household_id uuid,title text,list_type text,created_at timestamptz default now(),updated_at timestamptz default now());
 create table list_items(id uuid primary key default gen_random_uuid(),household_id uuid,list_id uuid,text text,completed boolean not null default false,completed_at timestamptz,quantity text,notes text,assigned_to uuid,due_date date,sort_order int default 0,source_pantry_item_id uuid,source_recipe_id uuid);
 create table recipes(id uuid primary key,household_id uuid,name text,servings integer,active boolean default true);
 create table recipe_ingredients(id uuid default gen_random_uuid(),household_id uuid,recipe_id uuid,pantry_item_id uuid,ingredient_name text,quantity numeric,unit text,optional boolean default false);
 create table meal_plan_entries(id uuid default gen_random_uuid(),household_id uuid,recipe_id uuid,meal_date date,servings integer,status text default 'planned');
 create table pantry_items(id uuid primary key,household_id uuid,name text,quantity numeric,unit text,active boolean default true,expires_on date);
 grant usage on schema public,auth,household_integrity to authenticated;
 grant select on household_members to authenticated;
 `);
  for (const t of ['lists', 'list_items', 'recipes', 'recipe_ingredients', 'meal_plan_entries', 'pantry_items'])
    await db.exec(
      `alter table ${t} enable row level security;create policy view_${t} on ${t} for select to authenticated using(can_view_household_module(household_id,'lists'));create policy edit_${t} on ${t} for all to authenticated using(can_edit_household_module(household_id,'lists')) with check(can_edit_household_module(household_id,'lists'));grant select,insert,update,delete on ${t} to authenticated;`
    );
  await db.exec(migration);
  await db.exec(compatibility);
}, 30000);
beforeEach(async () => {
  await db.exec(`delete from list_items;delete from lists;delete from recipe_ingredients;delete from meal_plan_entries;delete from recipes;delete from pantry_items;
 insert into lists(id,household_id,title,list_type) values('${l}','${h}','Tareas','tasks');
 insert into pantry_items(id,household_id,name,quantity,unit) values('${p}','${h}','Arroz',200,'g');
 insert into recipes(id,household_id,name,servings) values('${r}','${h}','Arroz familiar',2);
 insert into recipe_ingredients(household_id,recipe_id,pantry_item_id,ingredient_name,quantity,unit) values('${h}','${r}','${p}','Arroz',0.5,'kg');
 insert into meal_plan_entries(household_id,recipe_id,meal_date,servings) values('${h}','${r}','2026-10-12',2),('${h}','${r}','2026-10-13',2);`);
});
afterAll(async () => db.close());
async function run(sql: string, uid = a) {
  await db.exec('begin');
  try {
    await db.exec(`set local role authenticated;select set_config('qa.uid','${uid}',true);`);
    const result = await db.query<{result: any}>(sql);
    await db.exec('commit');
    return result.rows[0]?.result;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}
const preview = () => run(`select get_weekly_shopping_plan('${h}','2026-10-12') result`);
const sync = (fingerprint: string) =>
  run(`select sync_weekly_shopping_plan('${h}','2026-10-12','${fingerprint}') result`);
async function task(frequency = 'daily', offset = -3) {
  return run(
    `insert into list_items(household_id,list_id,text,assigned_to,due_date,routine_frequency,routine_members) values('${h}','${l}','Limpiar','${a}',(now() at time zone 'America/Guatemala')::date+(${offset}),'${frequency}',array['${a}'::uuid,'${b}'::uuid]) returning id result`
  );
}
describe.sequential('daily flow SQL invariants', () => {
  it('consolidates two recipes and deducts the shared pantry only once, with metric conversions', async () => {
    const plan = await preview();
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({required: 1000, available: 200, missing: 800, unit: 'g'});
    expect(plan.fingerprint).toHaveLength(32);
  });
  it('scales portions, excludes prepared meals and optional ingredients', async () => {
    await db.exec(
      `update meal_plan_entries set servings=4;update meal_plan_entries set status='prepared' where meal_date='2026-10-13';insert into recipe_ingredients(household_id,recipe_id,ingredient_name,quantity,unit,optional) values('${h}','${r}','Sal',5,'g',true)`
    );
    const plan = await preview();
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].missing).toBe(800);
  });
  it('does not use expired stock or invent unit conversions', async () => {
    await db.exec(`update pantry_items set expires_on='2000-01-01'`);
    expect((await preview()).rows[0]).toMatchObject({
      available: 0,
      missing: 1000,
      warning: 'No se descontó producto vencido.'
    });
    await db.exec(`update pantry_items set expires_on=null,unit='taza'`);
    expect((await preview()).rows[0]).toMatchObject({
      available: 0,
      missing: 1000,
      warning: 'Unidades incompatibles: revisa la cantidad.'
    });
  });
  it('counts meals without ingredients and never guesses unlinked pantry matches', async () => {
    await db.exec(
      `update recipe_ingredients set pantry_item_id=null;insert into meal_plan_entries(household_id,meal_date) values('${h}','2026-10-14')`
    );
    const plan = await preview();
    expect(plan.unquantified_meals).toBe(1);
    expect(plan.rows[0].available).toBe(0);
  });
  it('rejects a stale preview before creating a list', async () => {
    const plan = await preview();
    await db.exec('update pantry_items set quantity=300');
    await expect(sync(plan.fingerprint)).rejects.toThrow('cambiaron');
    expect((await db.query('select id from lists where shopping_week is not null')).rows).toHaveLength(0);
  });
  it('synchronizes idempotently and keeps manual rows and completed purchases', async () => {
    const plan = await preview();
    const id = await sync(plan.fingerprint);
    expect(await sync(plan.fingerprint)).toBe(id);
    await db.exec(
      `update list_items set completed=true where shopping_week is not null;insert into list_items(household_id,list_id,text) values('${h}','${id}','Manual');update pantry_items set quantity=0`
    );
    await sync((await preview()).fingerprint);
    const rows = (
      await db.query<{text: string; quantity: string; completed: boolean}>(
        'select text,quantity,completed from list_items order by text'
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({text: 'Arroz', quantity: '800 g', completed: true});
    expect(rows[1].text).toBe('Manual');
  });
  it('only removes obsolete automatic pending rows on resynchronization', async () => {
    const id = await sync((await preview()).fingerprint);
    await db.exec(
      `insert into list_items(household_id,list_id,text) values('${h}','${id}','Manual');delete from recipe_ingredients`
    );
    await sync((await preview()).fingerprint);
    expect((await db.query('select text from list_items')).rows).toEqual([{text: 'Manual'}]);
  });
  it('creates one future routine occurrence, rotates responsible people, and tolerates duplicate completion', async () => {
    const id = await task();
    await run(`select complete_household_list_item('${h}','${id}',true) result`);
    const next = (await db.query<{id: string}>('select id from list_items where not completed')).rows[0].id;
    await run(`select complete_household_list_item('${h}','${id}',true) result`);
    const rows = (
      await db.query<{id: string; completed: boolean; assigned_to: string; future: boolean}>(
        `select id,completed,assigned_to,due_date=(now() at time zone 'America/Guatemala')::date+1 future from list_items order by due_date`
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].completed).toBe(true);
    expect(rows[1]).toMatchObject({id: next, completed: false, assigned_to: b, future: true});
  });
  it('advances routines completed by older clients using a direct update', async () => {
    const id = await task();
    await run(`update list_items set completed=true where id='${id}' returning id result`);
    expect((await db.query('select id from list_items where not completed')).rows).toHaveLength(1);
  });
  it('keeps the weekly anchor after overdue completion and never creates a backlog', async () => {
    const id = await task('weekly', -15);
    await run(`select complete_household_list_item('${h}','${id}',true) result`);
    expect(
      (
        await db.query<{n: number}>(
          `select (due_date-(now() at time zone 'America/Guatemala')::date)::integer n from list_items where not completed`
        )
      ).rows[0].n
    ).toBe(6);
  });
  it('keeps the next occurrence after undo/recomplete and excludes departed members', async () => {
    const id = await task();
    await db.exec(`delete from household_members where user_id='${b}'`);
    await run(`select complete_household_list_item('${h}','${id}',true) result`);
    await run(`select complete_household_list_item('${h}','${id}',false) result`).catch(() => null);
    await db.exec(`insert into household_members values('${h}','${b}')`);
    await run(`select complete_household_list_item('${h}','${id}',false) result`);
    await run(`select complete_household_list_item('${h}','${id}',true) result`);
    expect((await db.query('select id from list_items')).rows).toHaveLength(2);
  });
  it('validates dates and household membership on routine writes', async () => {
    await expect(
      run(
        `insert into list_items(household_id,list_id,text,routine_frequency) values('${h}','${l}','Bad','daily') returning id result`
      )
    ).rejects.toThrow();
    await expect(
      run(
        `insert into list_items(household_id,list_id,text,due_date,routine_frequency,routine_members) values('${h}','${l}','Bad',current_date,'daily',array['${outsider}'::uuid]) returning id result`
      )
    ).rejects.toThrow('pertenecer');
  });
  it('preserves old backup rows whose new columns are null', async () => {
    const id = await run(
      `insert into lists select x.* from jsonb_populate_record(null::lists,'{"id":"${outsider}","household_id":"${h}","title":"Legacy","list_type":"tasks"}') x returning id result`
    );
    expect(id).toBe(outsider);
    const item = await run(
      `insert into list_items select x.* from jsonb_populate_record(null::list_items,'{"id":"${outsider}","household_id":"${h}","list_id":"${l}","text":"Legacy","completed":false}') x returning routine_frequency result`
    );
    expect(item).toBe('none');
  });
  it('allows view-only previews while denying writes and unrelated households', async () => {
    const id = await task();
    expect((await run(`select get_weekly_shopping_plan('${h}','2026-10-12') result`, b)).rows).toHaveLength(1);
    await expect(run(`select complete_household_list_item('${h}','${id}',true) result`, b)).rejects.toThrow('permiso');
    await expect(run(`select sync_weekly_shopping_plan('${h}','2026-10-12','x') result`, b)).rejects.toThrow(
      'Necesitas'
    );
    await expect(run(`select get_weekly_shopping_plan('${h}','2026-10-12') result`, outsider)).rejects.toThrow(
      'permiso'
    );
  });
  it('exposes only invoker RPCs with no anonymous execute access', async () => {
    const rows = (
      await db.query<{definer: boolean; anon: boolean}>(
        `select prosecdef definer,has_function_privilege('anon',oid,'execute') anon from pg_proc where proname in ('complete_household_list_item','get_weekly_shopping_plan','sync_weekly_shopping_plan','grocery_unit')`
      )
    ).rows;
    expect(rows).toHaveLength(4);
    expect(rows.every(x => !x.definer && !x.anon)).toBe(true);
  });
});
describe('daily agenda selection', () => {
  const row = (id: string, date: string, assignedTo?: string): DailyAgendaItem => ({
    id,
    date,
    assignedTo,
    kind: 'task',
    title: id,
    time: null,
    subtitle: '',
    tab: 'listas'
  });
  const items = [
    row('overdue', '2026-10-14', a),
    row('today', '2026-10-16', b),
    row('shared', '2026-10-16'),
    row('future', '2026-10-19', a),
    row('beyond', '2026-10-23')
  ];
  it('includes overdue tasks in today and respects responsibility plus shared activities', () =>
    expect(selectDailyAgenda(items, '2026-10-16', '2026-10-22', 'today', a).map(x => x.id)).toEqual([
      'overdue',
      'shared'
    ]));
  it('shows the full upcoming week or the selected day without hiding overdue tasks', () => {
    expect(selectDailyAgenda(items, '2026-10-16', '2026-10-22', 'week', '').map(x => x.id)).toEqual([
      'overdue',
      'shared',
      'today',
      'future'
    ]);
    expect(selectDailyAgenda(items, '2026-10-16', '2026-10-22', 'week', '', '2026-10-19').map(x => x.id)).toEqual([
      'overdue',
      'future'
    ]);
  });
});
