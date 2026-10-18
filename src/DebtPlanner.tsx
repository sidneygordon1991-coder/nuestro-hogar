import {useMemo,useState} from 'react';
import {AlertTriangle,Calculator,Mountain,Snowflake} from 'lucide-react';
import {formatMoney} from './lib/money';
import {incomeAmount} from './lib/monthlyIncome';
import {compareDebtPlans,MAX_MONTHS,MINIMUM_FLOOR,MINIMUM_RATE,type DebtAccount,type DebtPlanResult} from './lib/debtPlan';
import './finance-tools.css';

const monthName=(month:string)=>new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1,1).toLocaleDateString('es-GT',{month:'long',year:'numeric'});
const shortMonth=(month:string)=>new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1,1).toLocaleDateString('es-GT',{month:'short',year:'numeric'}).replace('.','');
const monthsText=(n:number)=>{const years=Math.floor(n/12),rest=n%12;return n+(n===1?' mes':' meses')+(years?` (${years} año${years===1?'':'s'}${rest?' y '+rest+' m':''})`:'')};
const rate=(apr:number)=>apr.toLocaleString('es-GT',{maximumFractionDigits:2})+'%';
const nextMonth=()=>{const d=new Date();const n=new Date(d.getFullYear(),d.getMonth()+1,1);return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')};

/** Avalancha vs Bola de nieve for the household's liabilities with a positive balance. Calculation only: nothing is saved. */
export default function DebtPlanner({debts}:{debts:DebtAccount[]}){
 const [extraText,setExtraText]=useState('0');
 let extra=0,extraError='';
 try{extra=incomeAmount(extraText===''?'0':extraText.replace(',','.'))}catch(err){extraError=err instanceof Error?err.message:'Revisa el monto.'}
 const start=nextMonth();
 const result=useMemo(()=>compareDebtPlans(debts,extra,start),[debts,extra,start]);
 if(!result.debts.length)return null;
 const {avalanche,snowball}=result,stuck=avalanche.capped&&snowball.capped;
 const best=stuck?null:avalanche.capped?'snowball':snowball.capped?'avalanche':result.interestSaved>0.004?'avalanche':result.interestSaved<-0.004?'snowball':null;
 const badge=avalanche.capped!==snowball.capped?'Sí liquida todo':'Menos intereses';
 const monthlyInterest=result.debts.reduce((sum,d)=>sum+Math.round(d.monthlyInterest*100),0)/100;
 const verdict=stuck?`Con estos pagos ninguna estrategia liquida las deudas: los intereses del primer mes suman ${formatMoney(monthlyInterest)} y pagarías ${formatMoney(avalanche.monthlyBudget)}. Aumenta el pago extra.`
  :avalanche.capped!==snowball.capped?`Solo ${best==='avalanche'?'Avalancha':'Bola de nieve'} liquida todas las deudas en ${MAX_MONTHS/12} años con estos pagos.`
  :best==='avalanche'?`Avalancha te ahorra ${formatMoney(result.interestSaved)} en intereses frente a Bola de nieve.`:best==='snowball'?`Bola de nieve te ahorra ${formatMoney(-result.interestSaved)} en intereses con estos datos.`:'Con estos datos ambos métodos cuestan lo mismo; Bola de nieve te da las primeras victorias antes.';
 return <section className="finance-panel debt-planner" aria-labelledby="debt-planner-title">
  <div className="panel-title"><div><p className="eyebrow">PLAN PARA SALIR DE DEUDAS</p><h3 id="debt-planner-title">¿Qué deuda pagar primero?</h3><small>Compara Avalancha (tasa más alta primero) y Bola de nieve (saldo más pequeño primero).</small></div><Calculator size={20} aria-hidden="true"/></div>
  <div className="debt-planner-debts">{result.debts.map(d=><div className="debt-planner-debt" key={d.id}>
   <strong>{d.name}</strong><b>{formatMoney(d.balance)}</b>
   <small>{d.aprMissing?'Sin tasa registrada: se calcula sin intereses':'Tasa '+rate(d.apr)+' anual · interés del mes ≈ '+formatMoney(d.monthlyInterest)} · Pago mínimo {formatMoney(d.minimum)}{d.minimumEstimated?' (estimado)':''}</small>
   {!d.minimumCoversInterest&&<p className="tools-alert"><AlertTriangle size={14} aria-hidden="true"/> Con este pago mínimo la deuda no baja: los intereses del mes ({formatMoney(d.monthlyInterest)}) igualan o superan el pago mínimo ({formatMoney(d.minimum)}).</p>}
  </div>)}</div>
  <div className="debt-planner-extra">
   <label className="tools-field">Pago extra mensual (Q)<input type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" value={extraText} aria-invalid={Boolean(extraError)} onChange={e=>setExtraText(e.target.value)}/></label>
   <p className="tools-note">Se suma a los pagos mínimos: pagarías {formatMoney(result.avalanche.monthlyBudget)} al mes. Cuando una deuda se liquida, su pago pasa a la siguiente.</p>
  </div>
  {extraError&&<p className="tools-error" role="alert">{extraError} Se calcula sin pago extra.</p>}
  <div className="debt-plan-compare">
   <PlanCard plan={avalanche} title="Avalancha" icon={<Mountain size={18} aria-hidden="true"/>} text="Primero la deuda con la tasa más alta: pagas menos intereses." badge={best==='avalanche'?badge:''}/>
   <PlanCard plan={snowball} title="Bola de nieve" icon={<Snowflake size={18} aria-hidden="true"/>} text="Primero el saldo más pequeño: liquidas deudas antes y ganas impulso." badge={best==='snowball'?badge:''}/>
  </div>
  <p className={stuck?'tools-alert':'tools-note'} role="status">{verdict}</p>
  {result.estimatedMinimums&&<p className="tools-note">Los pagos mínimos marcados como estimados usan el {MINIMUM_RATE*100}% del saldo (mínimo {formatMoney(MINIMUM_FLOOR)}) o, si la tasa es alta, el interés del mes más 1% del saldo. Regístralos en cada cuenta para un cálculo exacto.</p>}
  <p className="tools-note">Estimación: interés mensual = tasa anual ÷ 12, sin comisiones ni nuevos cargos. Primer pago en {monthName(start)}.</p>
 </section>;
}

function PlanCard({plan,title,icon,text,badge}:{plan:DebtPlanResult;title:string;icon:any;text:string;badge:string}){
 return <article className={'debt-plan-card'+(badge?' best':'')} aria-label={'Plan '+title}>
  <div className="debt-plan-head"><strong>{icon}{title}</strong>{badge&&<span className="tools-tag good">{badge}</span>}</div>
  <p>{text}</p>
  <dl>
   <div><dt>Tiempo</dt><dd>{plan.months===null?'Más de '+MAX_MONTHS/12+' años':monthsText(plan.months)}</dd></div>
   <div><dt>Sin deudas en</dt><dd>{plan.debtFreeDate?monthName(plan.debtFreeDate):'—'}</dd></div>
   <div><dt>Intereses</dt><dd>{plan.capped?'Sin límite':formatMoney(plan.totalInterest)}</dd></div>
  </dl>
  {plan.capped&&<p className="tools-alert">Con estos pagos no se liquida todo en {MAX_MONTHS/12} años: los intereses crecen más rápido que lo que pagas.</p>}
  <small className="tools-note">Orden en que se liquidan</small>
  <ol>{[...plan.payoffs.map(p=>p.id),...plan.priority.map(d=>d.id).filter(id=>!plan.payoffs.some(p=>p.id===id))].map(id=>{const d=plan.priority.find(x=>x.id===id)!,step=plan.payoffs.find(p=>p.id===id);return <li key={id}>{d.name} <small>{step?'· '+shortMonth(step.date)+' (mes '+step.month+')':'· no se liquida en el plazo'}</small></li>})}</ol>
 </article>;
}
