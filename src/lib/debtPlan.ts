/**
 * Debt payoff planning: "Avalancha" (highest rate first) vs "Bola de nieve" (smallest balance first).
 *
 * Every month, in this order:
 *  1. each open debt accrues interest at apr/12 (rounded to cents);
 *  2. each open debt receives its minimum payment (never more than it owes);
 *  3. whatever is left of the monthly budget goes to the first open debt of the strategy's order,
 *     cascading to the next one when a debt is paid off.
 * The monthly budget is fixed: the sum of all minimums plus the extra amount, so the minimum of a
 * debt that is paid off rolls over to the next one. The simulation stops after 600 months.
 * All arithmetic is done in integer cents.
 */

export type DebtAccount={id:string;name:string;balance:number|string;apr?:number|string|null;minimum_payment?:number|string|null};
export type PlannedDebt={
 id:string;name:string;balance:number;apr:number;aprMissing:boolean;
 minimum:number;minimumEstimated:boolean;monthlyInterest:number;
 /** False when the minimum payment does not exceed the first month's interest: the debt does not go down. */
 minimumCoversInterest:boolean;
};
export type DebtStrategy='avalanche'|'snowball';
export type PayoffStep={id:string;name:string;month:number;date:string};
export type DebtPlanResult={
 strategy:DebtStrategy;
 /** Debts in the order the strategy targets them. */
 priority:{id:string;name:string}[];
 /** Debts in the order they are paid off (only those paid within the cap). */
 payoffs:PayoffStep[];
 /** Months until every debt is paid, or null when not reached within the cap. */
 months:number|null;
 /** Month of the last payment (YYYY-MM), or null when not reached within the cap. */
 debtFreeDate:string|null;
 totalInterest:number;totalPaid:number;monthlyBudget:number;
 /** Balance still owed when the cap stops the simulation (0 when everything is paid). */
 remaining:number;
 capped:boolean;
};
export type DebtComparison={
 debts:PlannedDebt[];avalanche:DebtPlanResult;snowball:DebtPlanResult;
 /** Snowball interest minus avalanche interest (positive: avalanche saves money). */
 interestSaved:number;
 estimatedMinimums:boolean;stalled:PlannedDebt[];
};

export const MAX_MONTHS=600;
export const MINIMUM_RATE=0.03;
export const MINIMUM_FLOOR=50;

const cents=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)?Math.round(n*100):0};
const monthlyInterestCents=(balanceCents:number,apr:number)=>Math.round(balanceCents*apr/1200);

/**
 * 3% of the balance with a Q 50 floor, never more than what is owed. With an annual rate, the estimate is at least the
 * month's interest plus 1% of the balance: Guatemalan cards often charge 36–60% a year, where 3% would never reduce the debt.
 */
export function estimatedMinimum(balance:number,apr=0){
 const owed=Math.max(0,cents(balance));
 const rate=Number.isFinite(apr)&&apr>0?apr:0;
 const amortizing=rate?monthlyInterestCents(owed,rate)+Math.round(owed*0.01):0;
 return Math.min(owed,Math.max(MINIMUM_FLOOR*100,Math.round(owed*MINIMUM_RATE),amortizing))/100;
}

/** Adds "YYYY-MM" + n months. */
export function addMonths(month:string,count:number){
 const y=Number(month.slice(0,4)),m=Number(month.slice(5,7))-1+count;
 const year=y+Math.floor(m/12),mm=((m%12)+12)%12+1;
 return year+'-'+String(mm).padStart(2,'0');
}

/** Liabilities with something owed, with their rate and minimum (estimated when missing). */
export function prepareDebts(accounts:DebtAccount[]):PlannedDebt[]{
 return accounts.filter(a=>cents(a.balance)>0).map(a=>{
  const balance=cents(a.balance)/100;
  const rawApr=a.apr===null||a.apr===undefined||a.apr===''?NaN:Number(a.apr);
  const aprMissing=!Number.isFinite(rawApr)||rawApr<0;
  const apr=aprMissing?0:rawApr;
  const given=cents(a.minimum_payment);
  const minimumEstimated=!(given>0);
  const minimum=minimumEstimated?estimatedMinimum(balance,apr):given/100;
  const interest=monthlyInterestCents(cents(balance),apr);
  return {id:a.id,name:a.name,balance,apr,aprMissing,minimum,minimumEstimated,monthlyInterest:interest/100,minimumCoversInterest:cents(minimum)>interest};
 });
}

/** Avalanche: highest rate first (ties: smaller balance). Snowball: smallest balance first (ties: higher rate). */
export function orderDebts<T extends {name:string;balance:number;apr:number}>(debts:T[],strategy:DebtStrategy):T[]{
 return debts.slice().sort((a,b)=>strategy==='avalanche'
  ?b.apr-a.apr||a.balance-b.balance||a.name.localeCompare(b.name)
  :a.balance-b.balance||b.apr-a.apr||a.name.localeCompare(b.name));
}

export function simulateDebtPlan(debts:PlannedDebt[],extra:number,strategy:DebtStrategy,startMonth:string,maxMonths=MAX_MONTHS):DebtPlanResult{
 const ordered=orderDebts(debts,strategy);
 const state=ordered.map(d=>({id:d.id,name:d.name,balance:cents(d.balance),minimum:cents(d.minimum),apr:d.apr,paidOff:0}));
 const budget=state.reduce((sum,d)=>sum+d.minimum,0)+Math.max(0,cents(extra));
 let month=0,interest=0,paid=0;
 const open=()=>state.some(d=>d.balance>0);
 while(open()&&month<maxMonths){
  month++;
  for(const d of state)if(d.balance>0){const i=monthlyInterestCents(d.balance,d.apr);d.balance+=i;interest+=i}
  let available=budget;
  for(const d of state)if(d.balance>0){const pay=Math.min(d.minimum,d.balance,available);d.balance-=pay;available-=pay;paid+=pay}
  for(const d of state){
   if(available<=0)break;
   if(d.balance<=0)continue;
   const pay=Math.min(available,d.balance);d.balance-=pay;available-=pay;paid+=pay;
  }
  for(const d of state)if(d.balance<=0&&!d.paidOff)d.paidOff=month;
 }
 const done=!open();
 const payoffs=state.filter(d=>d.paidOff>0).map(d=>({id:d.id,name:d.name,month:d.paidOff,date:addMonths(startMonth,d.paidOff-1)}))
  .sort((a,b)=>a.month-b.month||ordered.findIndex(d=>d.id===a.id)-ordered.findIndex(d=>d.id===b.id));
 return {
  strategy,priority:ordered.map(d=>({id:d.id,name:d.name})),payoffs,
  months:done?month:null,debtFreeDate:done?addMonths(startMonth,Math.max(0,month-1)):null,
  totalInterest:interest/100,totalPaid:paid/100,monthlyBudget:budget/100,
  remaining:state.reduce((sum,d)=>sum+Math.max(0,d.balance),0)/100,capped:!done
 };
}

/** Both strategies for the same debts and extra payment. `startMonth` is the month of the first payment (YYYY-MM). */
export function compareDebtPlans(accounts:DebtAccount[],extra:number,startMonth:string,maxMonths=MAX_MONTHS):DebtComparison{
 const debts=prepareDebts(accounts);
 const avalanche=simulateDebtPlan(debts,extra,'avalanche',startMonth,maxMonths);
 const snowball=simulateDebtPlan(debts,extra,'snowball',startMonth,maxMonths);
 return {debts,avalanche,snowball,interestSaved:(cents(snowball.totalInterest)-cents(avalanche.totalInterest))/100,
  estimatedMinimums:debts.some(d=>d.minimumEstimated),stalled:debts.filter(d=>!d.minimumCoversInterest)};
}
