import {describe,it,expect} from 'vitest';
import {overviewAccounts,overviewGoal,overviewPeriod,registeredBalanceSeries} from './homeOverview';
import type {CashFlowSource} from './cashFlow';
import {permittedWorkspaceGroups,workspaceGroup} from './workspaceNavigation';
const source:CashFlowSource={month:'2026-10-01',today:'2026-10-16',transactions:[{id:'income',type:'income',amount:1000,transaction_date:'2026-10-02',category_id:null,paid_by:'a'},{id:'food',type:'expense',amount:65.25,transaction_date:'2026-10-10',category_id:'food',paid_by:'a'},{id:'today',type:'expense',amount:20,transaction_date:'2026-10-16',category_id:'food',paid_by:'a'},{id:'future',type:'income',amount:9999,transaction_date:'2026-10-30',category_id:null,paid_by:'a'},{id:'old',type:'income',amount:999,transaction_date:'2026-09-15',category_id:null,paid_by:'a'}],savings:[{amount:30,contribution_date:'2026-10-03'},{amount:-10,contribution_date:'2026-10-16'},{amount:500,contribution_date:'2026-10-31'}],categories:[{id:'food',budget_group:'variable'}],allocations:[{month:'2026-10-01',category_id:'food',planned_amount:200,first_half_amount:100,second_half_amount:100}],members:[{user_id:'a',full_name:'A'}],plans:[{month:'2026-10-01',user_id:'a',expected_amount:2000,first_half_amount:1000,second_half_amount:1000}],recurring:[],occurrences:[]};
describe('connected home financial integrity',()=>{
 it('shows monthly and fortnight budgets from the saved allocation and actual cutoff',()=>{const month=overviewPeriod(source,'month'),first=overviewPeriod(source,'first'),second=overviewPeriod(source,'second');expect(month.budgets[0].spent).toBe(85.25);expect(first.budgets[0].spent).toBe(65.25);expect(second.budgets[0].spent).toBe(20);expect(month.budgets[0].planned).toBe(200);expect(second.budgets[0].progress.availablePercent).toBe(80);expect(month.flow.income).toBe(1000);expect(month.flow.saving).toBe(20);expect(month.complete).toBe(true)});
 it('keeps incomplete fortnight plans visible without allocating half a monthly amount automatically',()=>{const partial={...source,plans:[],allocations:source.allocations.map(a=>({...a,first_half_amount:null,second_half_amount:null}))};const half=overviewPeriod(partial,'second');expect(half.complete).toBe(false);expect(half.budgets[0].planned).toBe(0);expect(half.budgets[0].progress.state).toBe('unplanned');expect(overviewPeriod(partial,'month').budgets[0].planned).toBe(200)});
 it('never turns expected or future income into the registered curve and carries actual first-half results',()=>{const series=registeredBalanceSeries(source,'second');expect(series.rows).toEqual([{date:'2026-10-16',balance:894.75}]);expect(registeredBalanceSeries(source,'month').rows.slice(-1)[0]?.balance).toBe(overviewPeriod(source,'month').flow.available);expect(registeredBalanceSeries(source,'first').rows.slice(-1)[0]?.balance).toBe(904.75)});
 it('handles leap years and periods that have not started',()=>{const feb={...source,month:'2028-02-01',today:'2028-02-10',transactions:[],savings:[]};expect(registeredBalanceSeries(feb,'second')).toEqual({rows:[],start:'2028-02-16',end:'2028-02-29'})});
 it('keeps transfers neutral across liquid accounts and excludes future account movements',()=>{const rows=overviewAccounts([{id:'bank',name:'Bank',account_type:'checking',account_class:'asset',opening_balance:100.10},{id:'cash',name:'Cash',account_type:'cash',account_class:'asset',opening_balance:0}],[{account_id:'bank',amount:20.20,type:'income',transaction_date:'2026-10-10'},{account_id:'bank',amount:999,type:'income',transaction_date:'2026-10-30'}],[{from_account_id:'bank',to_account_id:'cash',amount:30.30,transfer_date:'2026-10-12'}],'2026-10-16');expect(rows.map(r=>r.balance)).toEqual([90,30.3]);expect(rows.every(r=>r.liquid)).toBe(true)});
 it('distinguishes card debt, investments and archived accounts from available liquid money',()=>{const rows=overviewAccounts([{id:'card',name:'Card',account_type:'credit',account_class:'liability',opening_balance:100},{id:'bank',name:'Bank',account_type:'checking',account_class:'asset',opening_balance:500},{id:'investment',name:'Investment',account_type:'investment',account_class:'asset',opening_balance:9000},{id:'old',name:'Old',account_type:'cash',account_class:'asset',opening_balance:900,active:false}],[{account_id:'card',type:'expense',amount:50,transaction_date:'2026-10-10'}],[{from_account_id:'bank',to_account_id:'card',amount:80,transfer_date:'2026-10-12'}],'2026-10-16');expect(rows.find(r=>r.id==='card')?.balance).toBe(70);expect(rows.filter(r=>r.liquid).reduce((n,r)=>n+r.balance,0)).toBe(420);expect(rows).toHaveLength(3)});
 it('shows net goal progress with withdrawals and no future deposits',()=>{const g=overviewGoal({id:'g',name:'Goal',target_amount:100,target_date:null},[{goal_id:'g',amount:90,contribution_date:'2026-10-01'},{goal_id:'g',amount:-30,contribution_date:'2026-10-15'},{goal_id:'g',amount:999,contribution_date:'2026-10-30'},{goal_id:'other',amount:100,contribution_date:'2026-10-01'}],'2026-10-16');expect(g.saved).toBe(60);expect(g.progress).toBe(60)});
 it('does not count savings categories as spending rubrics',()=>{expect(overviewPeriod({...source,categories:[...source.categories,{id:'saving',budget_group:'saving'}],allocations:[...source.allocations,{category_id:'saving',planned_amount:100,month:source.month}]},'month').budgets.map(r=>r.id)).toEqual(['food'])});
});
describe('five primary spaces preserve authorized controls',()=>{
 it('routes financial sections and household modules to the correct space',()=>{expect(workspaceGroup('presupuesto','accounts')).toBe('money');expect(workspaceGroup('presupuesto','goals')).toBe('plan');expect(workspaceGroup('presupuesto','comparison')).toBe('progress');expect(workspaceGroup('calendario',null)).toBe('home');expect(workspaceGroup('inicio',null)).toBe('today')});
 it('removes forbidden sections while preserving family and other allowed modules',()=>{const groups=permittedWorkspaceGroups({finance:'none',health:'none',calendar:'none',planning:'none',monthly_close:'none'});expect(groups.map(g=>g.id)).toEqual(['today','home']);expect(groups.flatMap(g=>g.items).some(i=>i.route==='familia')).toBe(true);expect(groups.flatMap(g=>g.items).some(i=>i.route.startsWith('presupuesto'))).toBe(false)});
});

import {balanceTimeline,dayDiff,homeActions,homeMargin,periodBounds,scopeAccounts,scopeSource,shiftDay} from './homeOverview';
import {buildCashFlow} from './cashFlow';
describe('home 2026: margin, projection and personal lens',()=>{
 const me='me',partner='partner';
 const base:CashFlowSource={month:'2026-10-01',today:'2026-10-16',
  transactions:[
   {id:'i1',type:'income',amount:4500,transaction_date:'2026-10-15',category_id:null,paid_by:me,is_shared:true},
   {id:'i2',type:'income',amount:3500,transaction_date:'2026-10-15',category_id:null,paid_by:partner,is_shared:true},
   {id:'e1',type:'expense',amount:1000,transaction_date:'2026-10-05',category_id:'food',paid_by:me,is_shared:true},
   {id:'e2',type:'expense',amount:300.5,transaction_date:'2026-10-09',category_id:'fun',paid_by:me,is_shared:false},
   {id:'e3',type:'expense',amount:80,transaction_date:'2026-10-10',category_id:null,paid_by:partner,is_shared:false}],
  savings:[{amount:500,contribution_date:'2026-10-15',created_by:me},{amount:250,contribution_date:'2026-10-15',created_by:partner}],
  categories:[{id:'food',budget_group:'variable'},{id:'fun',budget_group:'variable'},{id:'rent',budget_group:'fixed'},{id:'save',budget_group:'saving'}],
  allocations:[{month:'2026-10-01',category_id:'rent',planned_amount:3000,first_half_amount:0,second_half_amount:3000},{month:'2026-10-01',category_id:'save',planned_amount:2000,first_half_amount:1000,second_half_amount:1000},{month:'2026-10-01',category_id:'food',planned_amount:2000,first_half_amount:1000,second_half_amount:1000}],
  members:[{user_id:me,full_name:'Yo'},{user_id:partner,full_name:'Pareja'}],
  plans:[{month:'2026-10-01',user_id:me,expected_amount:9000,first_half_amount:4500,second_half_amount:4500},{month:'2026-10-01',user_id:partner,expected_amount:7000,first_half_amount:3500,second_half_amount:3500}],
  recurring:[{id:'r1',description:'Alquiler',amount:3000,type:'expense',category_id:'rent',paid_by:me,is_shared:true},{id:'r2',description:'Gimnasio',amount:200,type:'expense',category_id:'fun',paid_by:me,is_shared:false}],
  occurrences:[{id:'o1',recurring_transaction_id:'r1',due_date:'2026-10-25',status:'pending'},{id:'o2',recurring_transaction_id:'r2',due_date:'2026-10-12',status:'pending'}]};

 it('subtracts pending commitments and the savings still to set aside from registered money',()=>{
  const flow=buildCashFlow(base);
  const withAccounts=homeMargin(flow,12450);
  expect(withAccounts.basis).toBe('accounts');expect(withAccounts.margin).toBe(12450-flow.fixedCommitments-flow.savingsRemaining);
  expect(flow.savingsRemaining).toBe(1250);
  const noAccounts=homeMargin(flow,null);
  expect(noAccounts.basis).toBe('month');expect(noAccounts.base).toBe(flow.available);
 });
 it('keeps cents exact in the margin',()=>{
  expect(homeMargin({available:0.3,fixedCommitments:0.1,savingsRemaining:0.2},null).margin).toBe(0);
 });
 it('personal lens shows my income, my personal movements and recurring, and my savings only',()=>{
  const mine=scopeSource(base,'personal',me);
  expect(mine.transactions.map(t=>t.id)).toEqual(['i1','e2']);
  expect(mine.savings).toHaveLength(1);expect(mine.allocations).toEqual([]);
  expect(mine.members.map(m=>m.user_id)).toEqual([me]);expect(mine.plans).toHaveLength(1);
  expect(mine.recurring.map(r=>r.id)).toEqual(['r2']);
  expect(scopeSource(base,'household',me)).toBe(base);
  const accounts=[{id:'a',name:'A',account_type:'checking',account_class:'asset',opening_balance:1,owner_user_id:me,is_shared:false},{id:'b',name:'B',account_type:'checking',account_class:'asset',opening_balance:1,owner_user_id:null,is_shared:true}];
  expect(scopeAccounts(accounts,'personal',me).map(a=>a.id)).toEqual(['a']);
  expect(scopeAccounts(accounts,'household',me)).toHaveLength(2);
 });
 it('projects pending payments on their due date and expected income on the last day of the period',()=>{
  const accounts={accounts:[{id:'bank',name:'Banco',account_type:'checking',account_class:'asset',opening_balance:10000}],movements:[] as any[],transfers:[] as any[]};
  const t=balanceTimeline(base,'second',accounts);
  expect(t.basis).toBe('accounts');expect(periodBounds('2026-10-01','second')).toEqual({start:'2026-10-16',end:'2026-10-31'});
  expect(t.registered).toEqual([{date:'2026-10-16',balance:10000}]);
  expect(t.context).toHaveLength(7);expect(t.context[0].date).toBe('2026-10-09');
  // The overdue gym payment (due the 12th, still pending) is applied today; rent on the 25th.
  expect(t.projected.find(p=>p.date==='2026-10-16')?.balance).toBe(9800);
  expect(t.projected.find(p=>p.date==='2026-10-25')?.balance).toBe(6800);
  expect(t.projected[t.projected.length-1]).toEqual({date:'2026-10-31',balance:6800+8000});
  expect(t.marks.map(m=>m.kind+':'+m.date)).toEqual(['payment:2026-10-16','payment:2026-10-25','income:2026-10-31']);
  expect(t.lowest).toEqual({date:'2026-10-25',balance:6800});expect(t.status).toBe('covered');
  const tight=balanceTimeline(base,'second',{...accounts,accounts:[{...accounts.accounts[0],opening_balance:3500}]});
  expect(tight.status).toBe('tight');
  const negative=balanceTimeline(base,'second',{...accounts,accounts:[{...accounts.accounts[0],opening_balance:1000}]});
  expect(negative.status).toBe('negative');expect(negative.lowest?.balance).toBe(-2200);
  expect(balanceTimeline(base,'first',accounts).status).toBe('closed');
 });
 it('falls back to the registered month result when there are no accounts',()=>{
  const t=balanceTimeline(base,'month',null);
  expect(t.basis).toBe('month');expect(t.context).toEqual([]);
  expect(t.registered[t.registered.length-1].balance).toBe(buildCashFlow(base).available);
 });
 it('derives concrete daily actions from registered data',()=>{
  const actions=homeActions({source:base,accounts:[{id:'bank',name:'Banco',liquid:true},{id:'card',name:'Tarjeta',liquid:false}],reconciliations:[{account_id:'bank',cutoff:'2026-08-01'}],today:'2026-10-16'});
  expect(actions.map(a=>a.kind)).toEqual(['reconcile','review','payment']);
  expect(actions[0].title).toBe('Conciliar Banco');expect(actions[1].title).toBe('Revisar un movimiento');
  expect(actions[2].detail).toContain('Venció el');
  expect(homeActions({source:{...base,occurrences:[],transactions:[]},accounts:[{id:'bank',name:'Banco',liquid:true}],reconciliations:[{account_id:'bank',cutoff:'2026-10-01'}],today:'2026-10-16'})).toEqual([]);
 });
 it('does arithmetic on local calendar days across month and leap-year boundaries',()=>{
  expect(shiftDay('2026-10-01',-1)).toBe('2026-09-30');expect(shiftDay('2028-02-28',1)).toBe('2028-02-29');
  expect(dayDiff('2026-10-09','2026-10-31')).toBe(22);expect(dayDiff('2026-12-31','2027-01-01')).toBe(1);
 });
 it('does not mark a fortnight plan partial because of zero-amount rows',()=>{
  const withZero={...base,allocations:[...base.allocations,{month:'2026-10-01',category_id:'fun',planned_amount:0,first_half_amount:null,second_half_amount:null}]};
  expect(overviewPeriod(withZero,'second').complete).toBe(true);
 });
});

import {dailyAllowance,expectedIncomeEvents,goalPace} from './homeOverview';
describe('pay days, daily allowance and goal pace',()=>{
 const src:CashFlowSource={month:'2026-10-01',today:'2026-10-16',transactions:[],savings:[],categories:[],allocations:[],
  members:[{user_id:'a',full_name:'A'},{user_id:'b',full_name:'B'},{user_id:'c',full_name:'C'}],
  plans:[{month:'2026-10-01',user_id:'a',expected_amount:9000,first_half_amount:4500,second_half_amount:4500},{month:'2026-10-01',user_id:'b',expected_amount:7000,first_half_amount:3500,second_half_amount:3500}],
  references:{c:1000},recurring:[],occurrences:[],paydays:{a:{first:10,second:25},b:{first:15,second:31}}};
 it('places each member income on their pay day; late income shows today',()=>{
  expect(expectedIncomeEvents(src,'second','2026-10-31')).toEqual([{date:'2026-10-25',amount:450000},{date:'2026-10-31',amount:350000}]);
  // Month view: the unpaid first half is late (today), references without a plan go on the default second pay day.
  expect(expectedIncomeEvents(src,'month','2026-10-31')).toEqual([{date:'2026-10-16',amount:800000},{date:'2026-10-25',amount:450000},{date:'2026-10-31',amount:450000}]);
  expect(expectedIncomeEvents({...src,month:'2026-02-01',today:'2026-02-16',plans:src.plans.map(p=>({...p,month:'2026-02-01'}))},'second','2026-02-28').map(e=>e.date)).toEqual(['2026-02-25','2026-02-28']);
 });
 it('spreads the margin over the days left until the next income',()=>{
  const t=balanceTimeline(src,'second',null);
  expect(dailyAllowance(4650,t)).toEqual({perDay:516.66,until:'2026-10-25',days:9,nextIncome:'2026-10-25'});
  expect(dailyAllowance(-50,t).perDay).toBe(0);
  const noIncome=balanceTimeline({...src,plans:[],references:{}},'second',null);
  expect(dailyAllowance(1600,noIncome)).toMatchObject({until:'2026-10-31',days:16,perDay:100,nextIncome:null});
 });
 it('tells how much to set aside per fortnight to reach a goal on time',()=>{
  expect(goalPace({target_amount:15000,target_date:'2027-06-30',saved:9000},'2026-10-16')).toEqual({state:'on-track',remaining:6000,perFortnight:352.95,fortnights:17});
  expect(goalPace({target_amount:100,target_date:null,saved:20},'2026-10-16').state).toBe('no-date');
  expect(goalPace({target_amount:100,target_date:'2026-10-01',saved:20},'2026-10-16').state).toBe('late');
  expect(goalPace({target_amount:100,target_date:'2027-01-01',saved:150},'2026-10-16').state).toBe('done');
 });
});
