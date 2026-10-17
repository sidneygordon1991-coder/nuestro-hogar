import {buildCashFlow,type CashFlowSource} from './cashFlow';
import {periodAmount,toCents,type FinancePeriod} from './financePeriods';
import {budgetProgress} from './budgetProgress';

export type HomeGoal={id:string;name:string;target_amount:number;target_date:string|null;icon?:string};
export type HomeFinance={income:number;expense:number;saving:number;available:number;pending:number;projected:number;overdue:number;nextPayment:string|null;nextPaymentAmount:number;nextPaymentDate:string|null;goalName:string|null;goalProgress:number;remainingExpenses?:number;savingsRemaining?:number;expectedIncomeRemaining?:number;futureCount?:number;planComplete?:boolean;error?:string;loading?:boolean;source?:CashFlowSource;goals?:HomeGoal[];goalEntries?:{goal_id:string;amount:number;contribution_date:string}[]};
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
 const completeIncome=source.members.length>0&&source.members.every(m=>{const p=source.plans.find(p=>p.user_id===m.user_id&&p.month===source.month);return Boolean(p)&&(period==='month'||(period==='first'?p!.first_half_amount:p!.second_half_amount)!=null)});
 const completeBudget=source.allocations.some(a=>a.month===source.month)&&source.allocations.filter(a=>a.month===source.month).every(a=>period==='month'||(period==='first'?a.first_half_amount:a.second_half_amount)!=null);
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
 return {...goal,saved,progress:goal.target_amount>0?Math.max(0,Math.min(100,saved/Number(goal.target_amount)*100)):0};
}
