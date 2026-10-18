import {buildCashFlow,type CashFlowSource} from './cashFlow';
import {occurrenceDetails} from './recurringDetails';
import {periodAmount,toCents,type FinancePeriod} from './financePeriods';
import {budgetProgress} from './budgetProgress';
import {formatMoney} from './money';

export type HomeGoal={id:string;name:string;target_amount:number;target_date:string|null;icon?:string};
export type HomeFinance={splits?:{transaction_id:string;user_id:string;share_amount:number|string}[];settlements?:{id:string;from_user_id:string;to_user_id:string;amount:number|string;settled_on:string;note?:string|null}[];privateEntries?:PrivateEntry[];usdRate?:number;income:number;expense:number;saving:number;available:number;pending:number;projected:number;overdue:number;nextPayment:string|null;nextPaymentAmount:number;nextPaymentDate:string|null;goalName:string|null;goalProgress:number;remainingExpenses?:number;savingsRemaining?:number;expectedIncomeRemaining?:number;futureCount?:number;planComplete?:boolean;error?:string;loading?:boolean;source?:CashFlowSource;goals?:HomeGoal[];goalEntries?:{goal_id:string;amount:number;contribution_date:string}[]};
export type OverviewAccount={id:string;name:string;account_type:string;account_class:string;opening_balance:number;active?:boolean;institution?:string|null};
export type AccountMovement={account_id:string|null;type:string;amount:number;transaction_date:string};
export type AccountTransfer={from_account_id:string;to_account_id:string;amount:number;transfer_date:string};

/** Account balances include opening balances and transfers. A credit limit is never cash. */
export function overviewAccounts(accounts:OverviewAccount[],movements:AccountMovement[],transfers:AccountTransfer[],cutoff:string){
 return accounts.filter(a=>a.active!==false).map(a=>{
  let balance=toCents(a.opening_balance);
  for(const t of movements)if(t.account_id===a.id&&t.transaction_date<=cutoff&&['income','expense'].includes(t.type))balance+=toCents(t.amount)*(a.account_class==='asset'?(t.type==='income'?1:-1):(t.type==='expense'?1:-1));
  for(const t of transfers)if(t.transfer_date<=cutoff){if(t.from_account_id===a.id)balance+=toCents(t.amount)*(a.account_class==='asset'?-1:1);if(t.to_account_id===a.id)balance+=toCents(t.amount)*(a.account_class==='asset'?1:-1)}
  return {...a,balance:balance/100,liquid:a.account_class==='asset'&&['cash','checking','savings'].includes(a.account_type)};
 });
}

export function overviewPeriod(source:CashFlowSource,period:FinancePeriod){
 const flow=buildCashFlow({...source,period});
 const categories=source.categories as {id:string;name?:string;icon?:string;budget_group?:string}[];
 const budgets=categories.filter(c=>c.budget_group!=='saving').map(c=>{
  const allocation=source.allocations.find(a=>a.category_id===c.id&&a.month===source.month);
  const planned=allocation?periodAmount(allocation.planned_amount,allocation,period):0;
  const spent=flow.transactions.filter(t=>t.type==='expense'&&t.category_id===c.id).reduce((n,t)=>n+toCents(t.amount),0)/100;
  return {...c,name:c.name||'Rubro',planned,spent,progress:budgetProgress(planned,spent)!};
 }).filter(c=>c.planned>0||c.spent>0).sort((a,b)=>{
  const rank=(s:string)=>s==='exceeded'||s==='unplanned'?0:s==='near'||s==='reached'?1:2;
  return rank(a.progress.state)-rank(b.progress.state)||b.spent-a.spent||a.name.localeCompare(b.name);
 });
 // A zero monthly amount needs no fortnight split, so it never leaves the plan "partial".
 const completeIncome=source.members.length>0&&source.members.every(m=>{const p=source.plans.find(p=>p.user_id===m.user_id&&p.month===source.month);return Boolean(p)&&(period==='month'||toCents(p!.expected_amount)===0||(period==='first'?p!.first_half_amount:p!.second_half_amount)!=null)});
 const completeBudget=source.allocations.some(a=>a.month===source.month)&&source.allocations.filter(a=>a.month===source.month).every(a=>period==='month'||toCents(a.planned_amount)===0||(period==='first'?a.first_half_amount:a.second_half_amount)!=null);
 return {flow,budgets,complete:completeIncome&&completeBudget};
}

/** Only registered entries form the curve. Expected income has no invented payment date. */
export function registeredBalanceSeries(source:CashFlowSource,period:FinancePeriod){
 const last=new Date(Number(source.month.slice(0,4)),Number(source.month.slice(5,7)),0).getDate();
 const start=period==='second'?16:1,end=period==='first'?15:last;
 const date=(day:number)=>source.month.slice(0,8)+String(day).padStart(2,'0');
 let balance=0;
 const rows:{date:string;balance:number}[]=[];
 // Carry the month's registered result into the second half, never bank balances.
 for(let day=1;day<=end;day++){
  const d=date(day);if(d>source.today)break;
  for(const t of source.transactions)if(t.transaction_date===d&&['income','expense'].includes(t.type))balance+=(t.type==='income'?1:-1)*toCents(t.amount);
  for(const s of source.savings)if(s.contribution_date===d)balance-=toCents(s.amount);
  if(day>=start)rows.push({date:d,balance:balance/100});
 }
 return {rows,start:date(start),end:date(end)};
}

export function overviewGoal(goal:HomeGoal,entries:{goal_id:string;amount:number;contribution_date:string}[],cutoff:string){
 const saved=entries.filter(e=>e.goal_id===goal.id&&e.contribution_date<=cutoff).reduce((n,e)=>n+toCents(e.amount),0)/100;
 return {...goal,saved,progress:goal.target_amount>0?Math.max(0,Math.min(100,Math.floor(saved/Number(goal.target_amount)*1000)/10)):0};
}

/* ---------- Home 2026: personal lens, projected fortnight and daily actions ---------- */

export type FinanceScope='household'|'personal';

/**
 * Personal lens. Household budgets are shared, so they are left out; the member sees their own income,
 * their income plan, the movements and recurring payments they registered as Personal, and their savings entries.
 */
export type PrivateEntry={id:string;description:string;amount:number|string;type:string;transaction_date:string;category_id:string|null;original_currency?:string|null;original_amount?:number|string|null};
export function scopeSource(source:CashFlowSource,scope:FinanceScope,userId:string,privateEntries:PrivateEntry[]=[],splits:{transaction_id:string;user_id:string;share_amount:number|string}[]=[]):CashFlowSource{
 if(scope==='household'||!userId)return source;
 // Private movements ("Solo yo") only exist for their owner and only in the personal lens.
 const privateRows=privateEntries.map(p=>({id:'private-'+p.id,type:p.type,amount:p.amount,transaction_date:p.transaction_date,category_id:p.category_id,paid_by:userId,is_shared:false}));
 // My part of each shared expense (its saved split) also comes out of my money, whoever paid it.
 const myShare=new Map(splits.filter(r=>r.user_id===userId).map(r=>[r.transaction_id,r.share_amount]));
 const shareRows=source.transactions.filter(t=>t.type==='expense'&&t.is_shared!==false&&myShare.has(t.id)&&toCents(myShare.get(t.id))>0)
  .map(t=>({id:'share-'+t.id,type:'expense',amount:myShare.get(t.id)!,transaction_date:t.transaction_date,category_id:t.category_id,paid_by:userId,is_shared:false}));
 const personal=(row:{paid_by?:string|null;is_shared?:boolean|null})=>row.paid_by===userId&&row.is_shared===false;
 const references=source.references&&userId in source.references?{[userId]:source.references[userId]}:{};
 return {...source,
  transactions:[...source.transactions.filter(t=>t.type==='income'?t.paid_by===userId:personal(t)),...shareRows,...privateRows],
  savings:source.savings.filter(s=>s.created_by===userId),
  allocations:[],
  members:source.members.filter(m=>m.user_id===userId),
  plans:source.plans.filter(p=>p.user_id===userId),
  references,
  recurring:source.recurring.filter(r=>personal(r))
 };
}

/** Accounts that belong to the lens: every active account for the household, owned non-shared ones for a member. */
export function scopeAccounts<T extends OverviewAccount&{owner_user_id?:string|null;is_shared?:boolean|null}>(accounts:T[],scope:FinanceScope,userId:string){
 return scope==='household'?accounts:accounts.filter(a=>a.owner_user_id===userId&&a.is_shared===false);
}

export function liquidBalance(accounts:OverviewAccount[],movements:AccountMovement[],transfers:AccountTransfer[],cutoff:string){
 return overviewAccounts(accounts,movements,transfers,cutoff).filter(a=>a.liquid).reduce((n,a)=>n+toCents(a.balance),0)/100;
}

const monthDay=(month:string,day:number)=>month.slice(0,8)+String(day).padStart(2,'0');
export function periodBounds(month:string,period:FinancePeriod){
 const last=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
 return {start:monthDay(month,period==='second'?16:1),end:monthDay(month,period==='first'?15:last)};
}

/**
 * Money available today after the month's pending commitments and the savings still to set aside.
 * With registered accounts the base is the liquid balance (cash, checking, savings); otherwise the month's registered result.
 * Variable budget that could still be spent is intentionally not subtracted.
 */
export function homeMargin(flow:{available:number;fixedCommitments:number;savingsRemaining:number},liquid:number|null,extra:{goalSaved?:number;cardsDue?:number}={}){
 const basis:'accounts'|'month'=liquid===null?'month':'accounts';
 const base=liquid===null?flow.available:liquid;
 // Account balances still hold the money already set aside for goals and owe what was charged to cards:
 // neither is free to spend. (The month's result already counts card purchases and goal contributions.)
 const goals=basis==='accounts'?Math.min(Math.max(0,toCents(extra.goalSaved||0)),Math.max(0,toCents(base))):0;
 const cards=basis==='accounts'?Math.max(0,toCents(extra.cardsDue||0)):0;
 const margin=(toCents(base)-goals-cards-toCents(flow.fixedCommitments)-toCents(flow.savingsRemaining))/100;
 return {basis,base,pending:flow.fixedCommitments,reserved:flow.savingsRemaining,goals:goals/100,cards:cards/100,margin};
}

/** Money already set aside in active goals up to a date (contributions minus withdrawals). */
export function goalBalance(goals:{id:string}[],entries:{goal_id:string;amount:number|string;contribution_date:string}[],cutoff:string){
 const ids=new Set(goals.map(g=>g.id));
 return Math.max(0,entries.filter(e=>ids.has(e.goal_id)&&e.contribution_date<=cutoff).reduce((n,e)=>n+toCents(e.amount),0))/100;
}

export type TimelinePoint={date:string;balance:number};
export type TimelineMark={date:string;label:string;kind:'payment'|'income';amount:number};
export type BalanceTimeline={start:string;end:string;today:string;basis:'accounts'|'month';context:TimelinePoint[];registered:TimelinePoint[];projected:TimelinePoint[];marks:TimelineMark[];lowest:TimelinePoint|null;startBalance:number;pendingPayments:number;expectedIncome:number;
 status:'covered'|'tight'|'negative'|'closed'};

/**
 * Registered balance up to today and a projection to the end of the period.
 * The projection only uses known pending recurring payments (on their due dates) and the income still expected in the
 * period. Expected income has no registered date, so it is placed on the last day of the period and labelled as such.
 */
export function balanceTimeline(source:CashFlowSource,period:FinancePeriod,accounts?:{accounts:OverviewAccount[];movements:AccountMovement[];transfers:AccountTransfer[]}|null):BalanceTimeline{
 const {start,end}=periodBounds(source.month,period);
 const useAccounts=Boolean(accounts&&accounts.accounts.some(a=>a.account_class==='asset'&&['cash','checking','savings'].includes(a.account_type)&&a.active!==false));
 let registered:TimelinePoint[];
 if(useAccounts){
  registered=[];
  const last=new Date(Number(source.month.slice(0,4)),Number(source.month.slice(5,7)),0).getDate();
  for(let day=Number(start.slice(8));day<=last;day++){const d=monthDay(source.month,day);if(d>end||d>source.today)break;registered.push({date:d,balance:liquidBalance(accounts!.accounts,accounts!.movements,accounts!.transfers,d)})}
 }else registered=registeredBalanceSeries(source,period).rows;
 // Early in a period, the previous week of account balances gives the curve some context.
 const context:TimelinePoint[]=[];
 if(useAccounts&&registered.length<5)for(let k=7;k>=1;k--){const d=shiftDay(start,-k);context.push({date:d,balance:liquidBalance(accounts!.accounts,accounts!.movements,accounts!.transfers,d)})}
 const flow=buildCashFlow({...source,period});
 const base={start,end,today:source.today,basis:(useAccounts?'accounts':'month') as 'accounts'|'month',context,registered,expectedIncome:flow.expectedIncomeRemaining};
 if(source.today>end||source.today<start)return {...base,projected:[],marks:[],lowest:null,startBalance:registered.length?registered[registered.length-1].balance:0,pendingPayments:0,status:'closed'};
 const startBalance=registered.length?registered[registered.length-1].balance:0;
 const recurring=new Map(source.recurring.map(r=>[r.id,r]));
 const actualIds=new Set(source.transactions.map(t=>t.id));
 const payments=source.occurrences.flatMap(o=>{
  const r=recurring.get(o.recurring_transaction_id);
  // Still-pending payments from earlier in the month are overdue: they are applied today.
  const due=inPeriodRange(o.due_date,start,end)||o.due_date<start;
  if(!r||r.active===false||o.status!=='pending'||!due||(o.transaction_id&&actualIds.has(o.transaction_id)))return [];
  const terms=occurrenceDetails(r,o.details_snapshot);
  return terms.type==='expense'?[{date:o.due_date<source.today?source.today:o.due_date,label:terms.description||'Pago',amount:toCents(terms.amount)}]:[];
 }).sort((a,b)=>a.date.localeCompare(b.date));
 // Expected income lands on each member's pay day (15 and the month's end unless configured);
 // income that is late is shown today, never after the end of the period.
 const incomes=expectedIncomeEvents(source,period,end);
 const projected:TimelinePoint[]=[];let balance=toCents(startBalance),lowest:TimelinePoint|null=null,incomeSeen=false;
 for(let day=Number(source.today.slice(8));day<=Number(end.slice(8));day++){
  const d=monthDay(source.month,day);
  for(const p of payments)if(p.date===d)balance-=p.amount;
  // "Before the next income": the lowest point is tracked until the first income arrives.
  if(!incomeSeen&&(!lowest||balance/100<lowest.balance))lowest={date:d,balance:balance/100};
  for(const i of incomes)if(i.date===d){balance+=i.amount;incomeSeen=true}
  projected.push({date:d,balance:balance/100});
 }
 const marks:TimelineMark[]=[...payments.map(p=>({date:p.date,label:p.label,kind:'payment' as const,amount:p.amount/100})),...incomes.map(i=>({date:i.date,label:'Ingreso esperado',kind:'income' as const,amount:i.amount/100}))];
 const pendingPayments=payments.reduce((n,p)=>n+p.amount,0)/100;
 const status=lowest&&lowest.balance<0?'negative':pendingPayments>0&&lowest&&toCents(lowest.balance)<toCents(startBalance)*.2?'tight':'covered';
 return {...base,projected,marks,lowest,startBalance,pendingPayments,status};
}
const inPeriodRange=(date:string,start:string,end:string)=>date>=start&&date<=end;

/** Pending expected income per pay date for a period, in cents, grouped by date. */
export function expectedIncomeEvents(source:CashFlowSource,period:FinancePeriod,end:string){
 const byDate=new Map<string,number>();
 const place=(userId:string,half:'first'|'second',cents:number)=>{
  if(cents<=0)return;
  const pay=source.paydays?.[userId],day=half==='first'?(pay?.first||15):(pay?.second||31);
  let date=monthDay(source.month,clampDay(source.month,day));
  if(date>end)date=end;if(date<source.today)date=source.today;
  byDate.set(date,(byDate.get(date)||0)+cents);
 };
 if(period==='month'){
  // The month keeps references for members without a plan; the first-half part goes on the first pay day.
  const month=buildCashFlow({...source,period:'month'}).incomePlan.rows,first=buildCashFlow({...source,period:'first'}).incomePlan.rows;
  for(const row of month){const p1=Math.min(toCents(row.pending),toCents(first.find(r=>r.user_id===row.user_id)?.pending||0));place(row.user_id,'first',p1);place(row.user_id,'second',toCents(row.pending)-p1)}
 }else for(const row of buildCashFlow({...source,period}).incomePlan.rows)place(row.user_id,period,toCents(row.pending));
 return [...byDate.entries()].map(([date,amount])=>({date,amount})).sort((a,b)=>a.date.localeCompare(b.date));
}
const lastDayOf=(month:string)=>new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
function clampDay(month:string,day:number){return Math.min(day,lastDayOf(month))}

/** "Puedes gastar Q X por día": the margin spread over the days left until the next expected income. */
export function dailyAllowance(margin:number,timeline:BalanceTimeline){
 const today=timeline.today,next=timeline.marks.filter(m=>m.kind==='income'&&m.date>today).map(m=>m.date).sort()[0]||null;
 const until=next||timeline.end,days=Math.max(1,dayDiff(today,until)+(next?0:1));
 return {perDay:Math.max(0,Math.floor(toCents(margin)/days))/100,until,days,nextIncome:next};
}

/** Pace for a savings goal: how much to set aside each fortnight to reach it on its date. */
export function goalPace(goal:{target_amount:number|string;target_date:string|null;saved:number},today:string){
 const remaining=Math.max(0,toCents(goal.target_amount)-toCents(goal.saved));
 if(remaining===0)return {state:'done' as const,remaining:0,perFortnight:0,fortnights:0};
 if(!goal.target_date)return {state:'no-date' as const,remaining:remaining/100,perFortnight:null,fortnights:null};
 const days=dayDiff(today,goal.target_date);
 if(days<=0)return {state:'late' as const,remaining:remaining/100,perFortnight:remaining/100,fortnights:0};
 const fortnights=Math.max(1,Math.ceil(days/15.2));
 return {state:'on-track' as const,remaining:remaining/100,perFortnight:Math.ceil(remaining/fortnights)/100,fortnights};
}
/** Calendar arithmetic on local YYYY-MM-DD strings (noon avoids daylight-saving edges). */
export function shiftDay(date:string,days:number){const d=new Date(date+'T12:00');d.setDate(d.getDate()+days);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
export function dayDiff(from:string,to:string){return Math.round((new Date(to+'T12:00').getTime()-new Date(from+'T12:00').getTime())/86400000)}

export type HomeAction={id:string;kind:'reconcile'|'review'|'payment'|'card'|'recap';title:string;detail:string;route:string};
/** Small, concrete next steps derived from registered data (no external services). */
export function homeActions({source,accounts,reconciliations,today}:{source:CashFlowSource;accounts:{id:string;name:string;liquid:boolean}[];reconciliations:{account_id:string;cutoff:string}[];today:string}):HomeAction[]{
 const actions:HomeAction[]=[];
 const monthAgo=shiftDay(today,-30);
 const stale=accounts.filter(a=>a.liquid&&!reconciliations.some(r=>r.account_id===a.id&&r.cutoff>=monthAgo));
 if(stale.length)actions.push({id:'reconcile',kind:'reconcile',title:stale.length===1?'Conciliar '+stale[0].name:'Conciliar '+stale.length+' cuentas',detail:'Confirma tu saldo registrado',route:'presupuesto:accounts'});
 const uncategorized=source.transactions.filter(t=>t.type==='expense'&&!t.category_id&&t.transaction_date<=today&&t.transaction_date.slice(0,7)===source.month.slice(0,7)).length;
 if(uncategorized)actions.push({id:'review',kind:'review',title:uncategorized===1?'Revisar un movimiento':'Revisar '+uncategorized+' movimientos',detail:'Completa su categoría',route:'presupuesto:transactions'});
 const flow=buildCashFlow(source);
 if(flow.nextPayment){const due=flow.nextPayment.due_date;actions.push({id:'payment',kind:'payment',title:'Preparar '+(flow.nextPayment.terms.description||'el siguiente pago'),detail:(due<today?'Venció el ':'Vence el ')+new Date(due+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short'})+' · '+formatMoney(Number(flow.nextPayment.terms.amount)),route:'presupuesto:recurring'})}
 return actions;
}
