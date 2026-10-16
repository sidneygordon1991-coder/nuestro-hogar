import {toCents} from './financePeriods';
export const localDay=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
export const money=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ'}).format(n);
export type GoalLink={goal_id:string;category_id:string;month:string};
export function linkedSavings(category:string,month:string,links:GoalLink[],entries:{goal_id:string;amount:number;contribution_date:string}[],cutoff=localDay()){
 const goals=new Set(links.filter(l=>l.category_id===category&&l.month.slice(0,7)===month.slice(0,7)).map(l=>l.goal_id));
 return {linked:goals.size,net:entries.filter(e=>goals.has(e.goal_id)&&e.contribution_date<=cutoff&&e.contribution_date.slice(0,7)===month.slice(0,7)).reduce((sum,e)=>sum+toCents(e.amount),0)/100};
}
export function simulateMargin(base:number,extraIncome:number,delayedIncome:number,extraExpense:number,extraSaving:number){
 if([base,extraIncome,delayedIncome,extraExpense,extraSaving].some(x=>!Number.isFinite(x))||[extraIncome,delayedIncome,extraExpense,extraSaving].some(x=>x<0))return null;
 return (toCents(base)+toCents(extraIncome)-toCents(delayedIncome)-toCents(extraExpense)-toCents(extraSaving))/100;
}
