// The exact migration runs against isolated PostgreSQL; production records are never test fixtures.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import migration from '../../supabase/migrations/20261022220000_allow_wrapping_fortnight_cycles.sql?raw';
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create table public.finance_income_plans (
    id integer primary key, expected_amount numeric not null check(expected_amount >= 0),
    cycle_first_day smallint not null default 1 constraint finance_income_plans_cycle_first_day_check check(cycle_first_day between 1 and 28),
    cycle_second_day smallint not null default 16 constraint finance_income_plans_cycle_second_day_check check(cycle_second_day between 2 and 31),
    constraint finance_income_cycle_order check(cycle_first_day < cycle_second_day));
    alter table public.finance_income_plans enable row level security;
    create policy cycle_read on public.finance_income_plans for select using (true);
    insert into public.finance_income_plans values(1,1000,1,16),(2,2000,14,29);`);
  await db.exec(migration);
}, 30000);
afterAll(async () => db.close());
describe.sequential('wrapping cycle database validation', () => {
  it('preserves saved plans and financial validation', async () => {
    expect(
      (
        await db.query(
          'select id,expected_amount::text,cycle_first_day,cycle_second_day from public.finance_income_plans order by id'
        )
      ).rows
    ).toEqual([
      {id: 1, expected_amount: '1000', cycle_first_day: 1, cycle_second_day: 16},
      {id: 2, expected_amount: '2000', cycle_first_day: 14, cycle_second_day: 29}
    ]);
    await expect(db.exec('insert into public.finance_income_plans values(99,-1,29,14)')).rejects.toThrow();
  });
  it('persists 29 then 14, end-of-month starts and a second start on day one', async () => {
    await db.exec('insert into public.finance_income_plans values(3,0,29,14),(4,100,31,16),(5,100,16,1)');
    expect(
      (await db.query('select cycle_first_day,cycle_second_day from public.finance_income_plans where id=3')).rows
    ).toEqual([{cycle_first_day: 29, cycle_second_day: 14}]);
  });
  it('rejects repeated starts, out-of-range days and two missing February starts', async () => {
    for (const [first, second] of [
      [14, 14],
      [0, 14],
      [32, 14],
      [14, 0],
      [14, 32],
      [29, 30]
    ])
      await expect(
        db.exec(`insert into public.finance_income_plans values(99,0,${first},${second})`)
      ).rejects.toThrow();
  });
  it('can be applied again without changing rows or row-level access policies', async () => {
    await db.exec(migration);
    expect((await db.query('select count(*)::int as count from public.finance_income_plans')).rows).toEqual([
      {count: 5}
    ]);
    expect(
      (await db.query("select relrowsecurity from pg_class where oid='public.finance_income_plans'::regclass")).rows
    ).toEqual([{relrowsecurity: true}]);
    expect((await db.query("select policyname from pg_policies where tablename='finance_income_plans'")).rows).toEqual([
      {policyname: 'cycle_read'}
    ]);
  });
});
