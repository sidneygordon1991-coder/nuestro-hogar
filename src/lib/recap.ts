import {buildCashFlow,type CashFlowSource,type CashMovement,type CashSaving} from './cashFlow';
import {halfOf,toCents,type FinancePeriod} from './financePeriods';
import {formatMoney} from './money';
import {dayDiff,overviewPeriod,periodBounds,shiftDay} from './homeOverview';

export type PeriodTotals={income:number;expense:number;saving:number;byCategory:Record<string,number>};
export type Recap={period:'first'|'second';start:string;end:string;title:string;income:number;expense:number;saving:number;
 expenseChange:number|null;savingChange:number|null;within:number;budgeted:number;topCategory:{name:string;amount:number;change:number|null}|null;highlights:string[]};

/** Totals of one fortnight from raw movements (used for the previous month's second half). */
/** Expenses in savings categories (savingIds) count as saving, as everywhere else in the app. */
export function periodTotals(transactions:CashMovement[],savings:CashSaving[],start:string,end:string,cutoff:string,savingIds:Set<string>=new Set()):PeriodTotals{
 const inRange=(d:string)=>d>=start&&d<=end&&d<=cutoff;
 const byCategory:Record<string,number>={};let income=0,expense=0,saving=0;
 for(const t of transactions){if(!inRange(t.transaction_date))continue;const c=toCents(t.amount);if(t.type==='income')income+=c;else if(t.type==='expense'&&t.category_id&&savingIds.has(t.category_id))saving+=c;else if(t.type==='expense'){expense+=c;const k=t.category_id||'';byCategory[k]=(byCategory[k]||0)+c}}
 for(const s of savings)if(inRange(s.contribution_date))saving+=toCents(s.amount);
 return {income:income/100,expense:expense/100,saving:saving/100,byCategory:Object.fromEntries(Object.entries(byCategory).map(([k,v])=>[k,v/100]))};
}
const change=(now:number,before:number)=>before>0?Math.round((now-before)/before*100):null;
const monthName=(date:string)=>new Date(date+'T12:00').toLocaleDateString('es-GT',{month:'long'});

/**
 * Summary of the current fortnight compared with the previous one: income, spending, savings,
 * budget discipline and the category that moved the most. Pass `previous` for the first fortnight
 * (its previous fortnight belongs to last month).
 */
export function fortnightRecap(source:CashFlowSource,previous?:PeriodTotals|null,period:'first'|'second'=halfOf(source.today) as 'first'|'second'):Recap{
 const {start,end}=periodBounds(source.month,period);
 const savingIds=new Set((source.categories as {id:string;budget_group?:string}[]).filter(c=>c.budget_group==='saving').map(c=>c.id));
 const current=periodTotals(source.transactions,source.savings,start,end,source.today,savingIds);
 // A fortnight still in progress is compared with the same number of days of the previous one, never with a full one.
 const inProgress=source.today>=start&&source.today<end,elapsed=inProgress?dayDiff(start,source.today)+1:null;
 const before=period==='second'?(()=>{const b=periodBounds(source.month,'first');const until=elapsed?shiftDay(b.start,elapsed-1):b.end;return periodTotals(source.transactions,source.savings,b.start,until<b.end?until:b.end,source.today,savingIds)})():previous||null;
 const versus=inProgress?'que en los mismos días de la quincena anterior':'que la quincena anterior';
 const view=overviewPeriod(source,period as FinancePeriod);
 const budgeted=view.budgets.filter(b=>b.planned>0),within=budgeted.filter(b=>b.spent<=b.planned).length;
 const names=new Map((source.categories as {id:string;name?:string}[]).map(c=>[c.id,c.name||'Sin categoría']));
 const top=Object.entries(current.byCategory).sort((a,b)=>b[1]-a[1])[0];
 const topCategory=top?{name:top[0]?names.get(top[0])||'Sin categoría':'Sin categoría',amount:top[1],change:before?change(top[1],before.byCategory[top[0]]||0):null}:null;
 const expenseChange=before?change(current.expense,before.expense):null,savingChange=before?change(current.saving,before.saving):null;
 const highlights:string[]=[];
 if(current.saving>0)highlights.push('Ahorraste '+formatMoney(current.saving)+(savingChange!==null&&savingChange>0?' ('+savingChange+'% más '+versus+')':''));
 if(expenseChange!==null)highlights.push(expenseChange<=0?'Gastaste '+Math.abs(expenseChange)+'% menos '+versus:'Gastaste '+expenseChange+'% más '+versus);
 if(budgeted.length)highlights.push(within+' de '+budgeted.length+' rubros dentro del presupuesto');
 if(topCategory&&topCategory.change!==null&&topCategory.change!==0)highlights.push(topCategory.name+': '+(topCategory.change<0?topCategory.change+'%':'+'+topCategory.change+'%')+' frente a '+(inProgress?'los mismos días de la quincena anterior':'la quincena anterior'));
 const flow=buildCashFlow({...source,period});
 if(!highlights.length)highlights.push(flow.income>0?'Registraste '+formatMoney(flow.income)+' de ingresos':'Aún no hay movimientos en esta quincena');
 const title='Tu quincena del '+Number(start.slice(8))+' al '+Number(end.slice(8))+' de '+monthName(start);
 return {period,start,end,title,income:current.income,expense:current.expense,saving:current.saving,expenseChange,savingChange,within,budgeted:budgeted.length,topCategory,highlights};
}

export function recapText(recap:Recap,household:string){
 return [recap.title+' · '+household,'',...recap.highlights.map(h=>'• '+h),'','Ingresos '+formatMoney(recap.income)+' · Gastos '+formatMoney(recap.expense)+' · Ahorro '+formatMoney(recap.saving),'Hecho con Nuestro Hogar'].join('\n');
}
