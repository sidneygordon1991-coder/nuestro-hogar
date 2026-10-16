// Isolated PostgreSQL (PGlite). No production connection or real user records.
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import migration from '../../supabase/migrations/20261016052021_savings_ledger_withdrawals.sql?raw';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',home='44444444-4444-4444-8444-444444444444',goal='55555555-5555-4555-8555-555555555555',goal2='66666666-6666-4666-8666-666666666666';
const deposit='77777777-7777-4777-8777-777777777777',withdrawal='88888888-8888-4888-8888-888888888888';
const db=new PGlite();
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema household_integrity;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
 create table qa_access(user_id uuid primary key,can_edit boolean);insert into qa_access values('${a}',true),('${b}',false);
 create function public.can_view_household_module(h uuid,m text) returns boolean language sql stable as $$select h='${home}'::uuid and exists(select 1 from public.qa_access where user_id=auth.uid())$$;
 create function public.can_edit_household_module(h uuid,m text) returns boolean language sql stable as $$select h='${home}'::uuid and exists(select 1 from public.qa_access where user_id=auth.uid() and can_edit)$$;
 create table households(id uuid primary key,archived boolean default false);insert into households(id) values('${home}');
 create table savings_goals(id uuid primary key,household_id uuid references households(id),active boolean default true);
 insert into savings_goals(id,household_id) values('${goal}','${home}'),('${goal2}','${home}');
 create table goal_contributions(id uuid primary key default gen_random_uuid(),household_id uuid references households(id),goal_id uuid references savings_goals(id),amount numeric(12,2) not null constraint goal_contributions_amount_check check(amount>0),contribution_date date not null,created_by uuid default auth.uid());
 alter table savings_goals enable row level security;alter table goal_contributions enable row level security;
 create policy goal_view on savings_goals for select to authenticated using(can_view_household_module(household_id,'finance'));
 create policy goal_edit on savings_goals for update to authenticated using(can_edit_household_module(household_id,'finance')) with check(can_edit_household_module(household_id,'finance'));
 create policy entries_view on goal_contributions for select to authenticated using(can_view_household_module(household_id,'finance'));
 create policy entries_edit on goal_contributions for all to authenticated using(can_edit_household_module(household_id,'finance')) with check(can_edit_household_module(household_id,'finance'));
 create function household_integrity.archive_guard() returns trigger language plpgsql as $$begin if (select archived from public.households where id=coalesce(new.household_id,old.household_id)) then raise exception 'archived' using errcode='42501';end if;if tg_op='DELETE' then return old;end if;return new;end$$;
 create trigger archive_guard before insert or update or delete on goal_contributions for each row execute function household_integrity.archive_guard();
 grant usage on schema public,auth,household_integrity to authenticated;grant select on qa_access,households to authenticated;grant select,update on savings_goals to authenticated;grant select,insert,update,delete on goal_contributions to authenticated;
 `);
 await db.exec(migration);
},30000);
afterAll(async()=>db.close());
async function run(sql:string,user=a){
 await db.exec('begin');
 try{await db.exec(`set local role authenticated;select set_config('qa.uid','${user}',true);`);const result=await db.exec(sql);await db.exec('set constraints all immediate');await db.exec('commit');return result}
 catch(e){await db.exec('rollback');throw e}
}
const entry=(id:string,amount:number,direction='deposit',date='2026-01-05',target=goal)=>`select public.save_savings_entry('${home}','${target}','${id}',${amount},'${direction}','${date}')`;
describe.sequential('savings migration on isolated PostgreSQL',()=>{
 it('keeps existing positive entries and permits one idempotent deposit',async()=>{await run(entry(deposit,100));await run(entry(deposit,100));const r=await db.query<{n:number;total:string}>('select count(*)::integer n,sum(amount)::text total from goal_contributions');expect(r.rows[0]).toEqual({n:1,total:'100.00'})});
 it('records a withdrawal without inventing an income or erasing the deposit',async()=>{await run(entry(withdrawal,40,'withdrawal','2026-01-06'));const r=await db.query<{total:string}>('select sum(amount)::text total from goal_contributions');expect(r.rows[0].total).toBe('60.00')});
 it('rejects repeated request IDs with different terms',async()=>{await expect(run(entry(withdrawal,30,'withdrawal','2026-01-06'))).rejects.toThrow('otros datos')});
 it('rejects an overdraft and rolls back the failed insert',async()=>{await expect(run(entry(other,61,'withdrawal','2026-01-06'))).rejects.toThrow('supera');expect((await db.query('select id from goal_contributions')).rows).toHaveLength(2)});
 it('rejects a backdated withdrawal funded only by a later deposit',async()=>{await expect(run(entry(other,10,'withdrawal','2026-01-04'))).rejects.toThrow('supera')});
 it('prevents edits and deletes that would invalidate later withdrawals',async()=>{await expect(run(`update goal_contributions set amount=30 where id='${deposit}'`)).rejects.toThrow('supera');await expect(run(`delete from goal_contributions where id='${deposit}'`)).rejects.toThrow('supera')});
 it('locks both goals when moving a deposit and prevents the old goal from overdrawing',async()=>{await expect(run(`update goal_contributions set goal_id='${goal2}' where id='${deposit}'`)).rejects.toThrow('supera')});
 it('also guards direct API inserts, without requiring callers to use the RPC',async()=>{await expect(run(`insert into goal_contributions(id,household_id,goal_id,amount,contribution_date) values('${other}','${home}','${goal}',-100,'2026-01-07')`)).rejects.toThrow('supera')});
 it('allows transactional restore in arbitrary row order while checking the final ledger',async()=>{await run(`insert into goal_contributions(household_id,goal_id,amount,contribution_date) values('${home}','${goal2}',-10,'2026-01-06'),('${home}','${goal2}',20,'2026-01-05')`);expect((await db.query<{total:string}>(`select sum(amount)::text total from goal_contributions where goal_id='${goal2}'`)).rows[0].total).toBe('10.00')});
 it('rejects read-only and unrelated users and prevents cross-household goal references',async()=>{await expect(run(entry(other,1),b)).rejects.toThrow('permiso');await expect(run(entry(other,1),other)).rejects.toThrow('permiso');await expect(run(entry(other,1,'deposit','2026-01-05',other))).rejects.toThrow('no está disponible')});
 it('rejects zero, invalid direction, fractions below a cent and future dates',async()=>{for(const sql of [entry(other,0),entry(other,1,'transfer'),entry(other,0.001),entry(other,1,'deposit','2999-01-01')])await expect(run(sql)).rejects.toThrow('Revisa')});
 it('retains the existing archived-household write guard',async()=>{await db.exec(`update households set archived=true where id='${home}'`);await expect(run(entry(other,1))).rejects.toThrow('archived');await db.exec(`update households set archived=false where id='${home}'`)});
 it('publishes only invoker RPCs, denies anon execute and retains RLS',async()=>{const r=await db.query<{name:string;definer:boolean;anon:boolean}>(`select proname name,prosecdef definer,has_function_privilege('anon',oid,'execute') anon from pg_proc where proname in ('save_savings_entry','get_savings_ledger_capability')`);expect(r.rows).toHaveLength(2);expect(r.rows.every(x=>!x.definer&&!x.anon)).toBe(true);const q=await db.query<{rls:boolean}>(`select relrowsecurity rls from pg_class where relname='goal_contributions'`);expect(q.rows[0].rls).toBe(true)});
});
