import {toCents} from './financePeriods';
import {dayDiff,overviewAccounts,type AccountMovement,type AccountTransfer,type OverviewAccount} from './homeOverview';

export type CardAccount=OverviewAccount&{statement_day?:number|null;payment_due_day?:number|null;minimum_payment?:number|string|null;credit_limit?:number|string|null;apr?:number|string|null};
export type CardStatus={id:string;name:string;balance:number;statementDate:string|null;statementBalance:number|null;paidSinceStatement:number;toAvoidInterest:number;minimum:number|null;dueDate:string|null;daysToDue:number|null;available:number|null;utilization:number|null;state:'clear'|'due'|'soon'|'overdue'};

const lastDay=(y:number,m:number)=>new Date(y,m,0).getDate();
const dateOf=(y:number,m:number,day:number)=>{while(m<1){m+=12;y--}while(m>12){m-=12;y++}return y+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(day,lastDay(y,m))).padStart(2,'0')};

/** Most recent statement cut on or before today (days beyond the month's end fall on its last day). */
export function lastStatementDate(statementDay:number,today:string){
 const y=Number(today.slice(0,4)),m=Number(today.slice(5,7));
 const thisMonth=dateOf(y,m,statementDay);return thisMonth<=today?thisMonth:dateOf(y,m-1,statementDay);
}
/** First payment due date strictly after a statement cut. */
export function dueAfter(statement:string,dueDay:number){
 const y=Number(statement.slice(0,4)),m=Number(statement.slice(5,7));
 const same=dateOf(y,m,dueDay);return same>statement?same:dateOf(y,m+1,dueDay);
}
/** Next due date on or after today when no statement day is configured. */
export function nextDue(dueDay:number,today:string){const y=Number(today.slice(0,4)),m=Number(today.slice(5,7));const d=dateOf(y,m,dueDay);return d>=today?d:dateOf(y,m+1,dueDay)}

/**
 * What to pay on each credit card. With a statement day: the statement balance minus payments made since the cut
 * avoids interest. Without it, the whole current balance is the safe amount. Never invents a minimum payment.
 */
export function creditCardStatus(cards:CardAccount[],movements:AccountMovement[],transfers:AccountTransfer[],today:string):CardStatus[]{
 return cards.filter(c=>c.account_type==='credit'&&c.account_class==='liability'&&c.active!==false).map(card=>{
  const balance=overviewAccounts([card],movements,transfers,today)[0].balance;
  const statementDate=card.statement_day?lastStatementDate(Number(card.statement_day),today):null;
  const statementBalance=statementDate?overviewAccounts([card],movements,transfers,statementDate)[0].balance:null;
  let paid=0;
  if(statementDate){
   for(const t of transfers)if(t.to_account_id===card.id&&t.transfer_date>statementDate&&t.transfer_date<=today)paid+=toCents(t.amount);
   for(const t of movements)if(t.account_id===card.id&&t.type==='income'&&t.transaction_date>statementDate&&t.transaction_date<=today)paid+=toCents(t.amount);
  }
  const owed=statementBalance===null?Math.max(0,toCents(balance)):Math.max(0,toCents(statementBalance)-paid);
  const dueDate=card.payment_due_day?(statementDate?dueAfter(statementDate,Number(card.payment_due_day)):nextDue(Number(card.payment_due_day),today)):null;
  // A due date already passed with money still owed for that statement is overdue.
  const daysToDue=dueDate?dayDiff(today,dueDate):null;
  const limit=Number(card.credit_limit)>0?Number(card.credit_limit):null;
  const state:CardStatus['state']=owed===0?'clear':daysToDue!==null&&daysToDue<0?'overdue':daysToDue!==null&&daysToDue<=3?'soon':'due';
  const minimum=Number(card.minimum_payment)>0?Math.min(Number(card.minimum_payment),owed/100):null;
  return {id:card.id,name:card.name,balance,statementDate,statementBalance,paidSinceStatement:paid/100,toAvoidInterest:owed/100,minimum,dueDate,daysToDue,
   available:limit===null?null:Math.max(0,toCents(limit)-Math.max(0,toCents(balance)))/100,utilization:limit===null?null:Math.round(Math.max(0,Math.min(100,balance/limit*100))*10)/10,state};
 });
}
