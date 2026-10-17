import {formatMoney as money} from './lib/money';
import {useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowDownLeft,ArrowUpRight,CalendarDays,ChevronRight,Clock3,CreditCard,Info,Landmark,PiggyBank,RefreshCw,Target,Wallet} from 'lucide-react';
import {supabase} from './lib/supabase';
import {halfOf,toCents,type FinancePeriod} from './lib/financePeriods';
import {overviewAccounts,overviewGoal,overviewPeriod,registeredBalanceSeries,type HomeFinance,type OverviewAccount,type AccountMovement,type AccountTransfer} from './lib/homeOverview';
import BudgetCategoryProgress from './BudgetCategoryProgress';

const shortDate=(date:string)=>new Date(date+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short'});
const accountNames:Record<string,string>={cash:'Efectivo',checking:'Cuenta bancaria',savings:'Ahorro',credit:'Tarjeta',loan:'Préstamo',mortgage:'Hipoteca',investment:'Inversión'};

// Range paging avoids presenting the first API page as a complete account balance.
async function allRows(query:(from:number,to:number)=>any){
 const rows:any[]=[];
 for(let from=0;from<100000;from+=1000){const r=await query(from,from+999);if(r.error)throw r.error;if(!Array.isArray(r.data))throw new Error('Respuesta incompleta');rows.push(...r.data);if(r.data.length<1000)return rows}
 throw new Error('Demasiados registros para verificar el saldo. Abre Cuentas.');
}

export default function HomeMoneyWorkspace({householdId,finance,onNavigate,onRefresh,agenda,attention,canHealth,cover}:{householdId:string;finance:HomeFinance;onNavigate:(tab:string)=>void;onRefresh:()=>void;agenda:ReactNode;attention:ReactNode;canHealth:boolean;cover:string}){
 const source=finance.source!;
 const [period,setPeriod]=useState<FinancePeriod>(()=>source.allocations.some(a=>(halfOf(source.today)==='first'?a.first_half_amount:a.second_half_amount)!=null)?halfOf(source.today):'month'),[calculation,setCalculation]=useState(false);
 const [accountState,setAccountState]=useState<{rows:ReturnType<typeof overviewAccounts>;loading:boolean;error:string}>({rows:[],loading:true,error:''});
 const [accountAttempt,setAccountAttempt]=useState(0),[showAccounts,setShowAccounts]=useState(false),[showBudgets,setShowBudgets]=useState(false);
 const sequence=useRef(0);
 useEffect(()=>{const request=++sequence.current;setAccountState({rows:[],loading:true,error:''});(async()=>{
  try{
   const [accounts,movements,transfers]=await Promise.all([
    allRows((a,b)=>supabase.from('finance_accounts').select('id,name,account_type,account_class,opening_balance,institution,active').eq('household_id',householdId).eq('active',true).order('id').range(a,b)),
    allRows((a,b)=>supabase.from('transactions').select('id,account_id,type,amount,transaction_date').eq('household_id',householdId).lte('transaction_date',source.today).not('account_id','is',null).order('id').range(a,b)),
    allRows((a,b)=>supabase.from('finance_transfers').select('id,from_account_id,to_account_id,amount,transfer_date').eq('household_id',householdId).lte('transfer_date',source.today).order('id').range(a,b))
   ]);
   if(request===sequence.current)setAccountState({rows:overviewAccounts(accounts as OverviewAccount[],movements as AccountMovement[],transfers as AccountTransfer[],source.today),loading:false,error:''});
  }catch{if(request===sequence.current)setAccountState({rows:[],loading:false,error:'No pudimos verificar los saldos de las cuentas.'})}
 })();return()=>{sequence.current++}},[householdId,source,accountAttempt]);
 const selected=useMemo(()=>overviewPeriod(source,period),[source,period]);
 const monthly=useMemo(()=>overviewPeriod(source,'month'),[source]);
 const series=useMemo(()=>registeredBalanceSeries(source,period),[source,period]);
 const goals=useMemo(()=>(finance.goals||[]).map(goal=>overviewGoal(goal,finance.goalEntries||[],source.today)),[finance,source.today]);
 const liquid=accountState.rows.filter(a=>a.liquid).reduce((n,a)=>n+toCents(a.balance),0)/100;
 const visibleAccounts=showAccounts?accountState.rows:accountState.rows.slice(0,3);
 const visibleBudgets=showBudgets?selected.budgets:selected.budgets.slice(0,3);
 const planLabel=period==='month'?'este mes':period==='first'?'del 1 al 15':'del 16 al cierre';
 return <div className="premium-home-grid">
  <div className="premium-money-main">
   <MoneyMetrics finance={finance} onNavigate={onNavigate}/>
   <section className="premium-margin" aria-label="Margen del mes">
    {cover&&<img src={cover} alt="" className="premium-cover"/>}
    <div className="premium-margin-top"><span><Wallet size={19}/> TU MES, CON CLARIDAD</span><span className="premium-date">Al {shortDate(source.today)}</span></div>
    <p className="premium-margin-label">Margen del mes</p><h2 className={monthly.flow.availableAfterCommitments<0?'is-negative':''}>{money(monthly.flow.availableAfterCommitments)}</h2>
    <p>Después de pagos, fijos y ahorro por cubrir.</p>
    <button type="button" className="premium-calculation-toggle" aria-expanded={calculation} onClick={()=>setCalculation(v=>!v)}><Info size={15}/>{calculation?'Ocultar cálculo':'Ver cálculo'} <ArrowUpRight size={15}/></button>
    {calculation&&<div className="premium-calculation"><div><span>Ingresos − gastos − ahorro del mes</span><b>{money(finance.available)}</b></div><div><span>Pagos y fijos pendientes</span><b>− {money(finance.pending)}</b></div><div><span>Ahorro del plan aún pendiente</span><b>− {money(monthly.flow.savingsRemaining)}</b></div><p>Los ingresos esperados todavía no se suman. Este margen mensual no es el saldo de tus cuentas y no descuenta el presupuesto variable que aún podrías usar.</p></div>}
    <MoneyMetrics finance={finance} onNavigate={onNavigate} compact/>
    <div className="premium-margin-foot"><span>{finance.planComplete?'Según tu plan guardado':'Plan parcial · revisa lo pendiente'}</span><button onClick={()=>onNavigate('presupuesto:transactions')}>Ver movimientos <ArrowUpRight size={15}/></button></div>
   </section>
   <section className="premium-card premium-cashflow" aria-label="Balance y proyección por período">
    <div className="premium-card-head"><div><p className="eyebrow">ANTICIPA LO QUE VIENE</p><h3>Tu dinero en el tiempo</h3></div><div className="premium-segments" role="group" aria-label="Período del resumen">{([['first','1–15'],['second','16–cierre'],['month','Mes']] as const).map(([key,label])=><button key={key} aria-pressed={period===key} onClick={()=>{setPeriod(key);setShowBudgets(false)}}>{label}</button>)}</div></div>
    <p className="premium-caption">{shortDate(series.start)} – {shortDate(series.end)} · Registros hasta hoy.</p>
    <RegisteredChart rows={series.rows}/>
    <details className="premium-period-details"><summary>Ver ingresos y proyección <ChevronRight size={15}/></summary>
    <div className="premium-period-values"><div><small>Ingresos {planLabel}</small><strong>{money(selected.flow.income)}</strong></div><div><small>Gastado {planLabel}</small><strong>{money(selected.flow.expense)}</strong></div><div><small>Ahorro neto</small><strong>{money(selected.flow.saving)}</strong></div></div>
    <div className="home-money-answers premium-projection" aria-label="Lo siguiente para tu dinero"><div><small>Ingreso aún esperado</small><strong>{money(selected.flow.expectedIncomeRemaining)}</strong><span>Plan del período; aún no recibido</span></div><div><small>Resultado estimado del período</small><strong className={selected.flow.projectedClose<0?'negative':''}>{money(selected.flow.projectedClose)}</strong><span>{selected.complete?'Según el plan guardado':'Plan parcial: confirma la distribución'}</span></div></div>
    <p className="premium-footnote">La estimación usa el resultado de este período más ingresos esperados, menos presupuesto y ahorro pendientes. La curva solo muestra registros reales; no asigna fechas a ingresos esperados.</p>
    </details>
    <button className="premium-text-link" onClick={()=>onNavigate('presupuesto:fortnight')}>Abrir quincenas y reglas de aportes <ArrowUpRight size={15}/></button>
   </section>
   <section className="premium-card premium-budgets" aria-label="Resumen de presupuesto">
    <div className="premium-card-head"><div><p className="eyebrow">CADA RUBRO, A SU RITMO</p><h3>Así va tu presupuesto</h3></div><button className="premium-text-link" onClick={()=>onNavigate('presupuesto:budget')}>Administrar <ArrowUpRight size={15}/></button></div>
    <p className="premium-caption">{period==='month'?'Mes completo':period==='first'?'Primera quincena':'Segunda quincena'} · Las barras muestran gasto; el porcentaje indica lo disponible.</p>
    {visibleBudgets.length?<div className="premium-budget-list">{visibleBudgets.map(c=><div key={c.id}><BudgetCategoryProgress name={c.name} icon={c.icon} planned={c.planned} spent={c.spent}/></div>)}</div>:<div className="premium-empty"><PiggyBank/><strong>Dale un destino a tu dinero</strong><p>Guarda el presupuesto {planLabel} para ver cuánto queda en cada rubro.</p><button className="premium-text-link" onClick={()=>onNavigate('presupuesto:budget')}>Configurar presupuesto <ArrowUpRight size={15}/></button></div>}
    {selected.budgets.length>3&&<button className="premium-text-link" aria-expanded={showBudgets} onClick={()=>setShowBudgets(v=>!v)}>{showBudgets?'Mostrar menos':'Ver los '+selected.budgets.length+' rubros'}</button>}
   </section>
  </div>
  <aside className="premium-home-context" aria-label="Agenda, cuentas y metas">
   {attention}
   <div className="premium-calendar-slot">{agenda}</div>
   <section className="premium-card premium-accounts" aria-label="Cuentas disponibles">
    <div className="premium-card-head"><div><p className="eyebrow">EFECTIVO Y BANCOS</p><h3>Tus cuentas</h3></div><button className="premium-icon-button" aria-label="Actualizar cuentas" onClick={()=>setAccountAttempt(v=>v+1)}><RefreshCw size={16}/></button></div>
    {accountState.loading?<p role="status" className="premium-caption">Verificando saldos registrados…</p>:accountState.error?<div role="alert" className="premium-empty"><p>{accountState.error}</p><button className="premium-text-link" onClick={()=>setAccountAttempt(v=>v+1)}>Reintentar cuentas</button></div>:<>
     {accountState.rows.length>0&&<div className="premium-account-total"><small>Saldo en efectivo y cuentas líquidas</small><strong>{money(liquid)}</strong><span>Según saldos iniciales y registros hasta {shortDate(source.today)}. No incluye crédito ni inversiones.</span></div>}
     <div className="premium-account-list">{visibleAccounts.map(a=><button key={a.id} onClick={()=>onNavigate('presupuesto:accounts')}><span>{a.account_type==='credit'?<CreditCard size={19}/>:a.account_type==='cash'?<Wallet size={19}/>:<Landmark size={19}/>}</span><div><strong>{a.name}</strong><small>{accountNames[a.account_type]||'Cuenta'}{a.account_class==='liability'?' · Deuda registrada':!a.liquid?' · Activo no líquido':''}</small></div><b>{money(a.balance)}</b></button>)}</div>
     {!accountState.rows.length&&<div className="premium-empty"><Landmark/><strong>Ubica tu dinero</strong><p>Agrega efectivo, cuentas o tarjetas con sus saldos iniciales.</p></div>}
     {accountState.rows.length>3&&<button className="premium-text-link" aria-expanded={showAccounts} onClick={()=>setShowAccounts(v=>!v)}>{showAccounts?'Mostrar menos':'Ver las '+accountState.rows.length+' cuentas'}</button>}
    </>}
    <button className="premium-text-link" onClick={()=>onNavigate('presupuesto:accounts')}>Administrar y conciliar <ArrowUpRight size={15}/></button>
   </section>
   <section className="premium-card premium-goals" aria-label="Metas de ahorro">
    <div className="premium-card-head"><div><p className="eyebrow">UN PASO MÁS CERCA</p><h3>Tus metas</h3></div><Target size={21}/></div>
    {goals.length?goals.slice(0,2).map(g=><button key={g.id} className="premium-goal" onClick={()=>onNavigate('presupuesto:goals')}><strong>{g.name}<ChevronRight size={16}/></strong><span><b>{money(g.saved)}</b> de {money(Number(g.target_amount))}</span><div role="progressbar" aria-label={'Avance de '+g.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.progress}><i style={{width:g.progress+'%'}}/></div><small>{Math.round(g.progress)}% completado{g.target_date?' · '+shortDate(g.target_date):''}</small></button>):<div className="premium-empty"><Target/><strong>Tu próximo logro empieza aquí</strong><p>Define una meta y registra depósitos o retiros cuando los hagas.</p></div>}
    <button className="premium-text-link" onClick={()=>onNavigate('presupuesto:goals')}>Ver metas y aportes <ArrowUpRight size={15}/></button>
   </section>
   {canHealth&&<button className="premium-health premium-card" onClick={()=>onNavigate('salud')}><span><PiggyBank size={22}/></span><div><strong>Salud del hogar</strong><small>Comprende qué está cambiando y qué puedes mejorar.</small></div><ArrowUpRight size={18}/></button>}
   <button className="premium-text-link premium-refresh" onClick={onRefresh}><RefreshCw size={15}/> Actualizar resumen financiero</button>
  </aside>
 </div>;
}

function MoneyMetrics({finance,onNavigate,compact=false}:{finance:HomeFinance;onNavigate:(tab:string)=>void;compact?:boolean}){
 const rows=[{label:compact?'Ingresos':'Ingresos del mes',value:finance.income,detail:'Recibidos hasta hoy',route:'income',Icon:ArrowDownLeft,tone:''},{label:compact?'Por cubrir':'Pagos y fijos pendientes',value:finance.pending,detail:'Compromisos del mes',route:'recurring',Icon:Clock3,tone:'amber'},{label:compact?'Ahorro neto':'Ahorro del mes',value:finance.saving,detail:'Depósitos menos retiros',route:'goals',Icon:PiggyBank,tone:'sage'}];
 return <div className={compact?'premium-pocket-metrics':'premium-metrics studio-metrics'} aria-label="Cifras registradas del mes">{rows.map(({label,value,detail,route,Icon,tone})=><button key={route} onClick={()=>onNavigate('presupuesto:'+route)}><span className={tone}><Icon/></span><div><small>{label}</small><strong className={money(value).length>12?'long-amount':''}>{money(value)}</strong>{!compact&&<em>{detail}</em>}</div></button>)}</div>;
}

function RegisteredChart({rows}:{rows:{date:string;balance:number}[]}){
 const id=useId().replace(/:/g,'');
 const chart=useRef<HTMLElement>(null),[width,setWidth]=useState(640);
 useEffect(()=>{const el=chart.current;if(!el)return;const measure=()=>setWidth(Math.max(220,Math.round(el.getBoundingClientRect().width)));measure();if(typeof ResizeObserver==='undefined'){window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure)}const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect()},[rows.length===0]);
 if(!rows.length)return <div className="premium-chart-empty"><CalendarDays size={25}/><p>Este período todavía no tiene días registrados.</p></div>;
 const values=rows.map(r=>r.balance),min=Math.min(0,...values),max=Math.max(1,...values),range=max-min;
 const x=(i:number)=>42+i/Math.max(1,rows.length-1)*(width-54),y=(n:number)=>142-(n-min)/range*112;
 const points=rows.map((r,i)=>`${x(i)},${y(r.balance)}`).join(' '),last=rows[rows.length-1];
 return <figure ref={chart} className="premium-chart"><svg viewBox={`0 0 ${width} 184`} role="img" aria-label={'Balance registrado del mes al '+shortDate(last.date)+': '+money(last.balance)}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--nh-chart-accent)" stopOpacity=".22"/><stop offset="100%" stopColor="var(--nh-chart-accent)" stopOpacity="0"/></linearGradient></defs>{[min,min+range/2,max].map((n,i)=><g key={i}><line x1="42" y1={y(n)} x2={width-12} y2={y(n)} className="premium-grid-line"/><text x="6" y={y(n)-7}>{new Intl.NumberFormat('es-GT',{notation:'compact',maximumFractionDigits:1}).format(n)}</text></g>)}<polygon points={`42,142 ${points} ${x(rows.length-1)},142`} fill={`url(#${id})`}/><polyline points={points} className="premium-chart-line"/>{[0,Math.floor((rows.length-1)/2),rows.length-1].filter((n,i,a)=>a.indexOf(n)===i).map(i=><g key={i}><circle cx={x(i)} cy={y(rows[i].balance)} r="4"/><text x={x(i)} y="172" textAnchor={i===0?'start':i===rows.length-1?'end':'middle'}>{shortDate(rows[i].date)}</text></g>)}</svg><figcaption><i/> Registrado <b>{money(last.balance)}</b><span>Balance del mes, no saldo bancario</span></figcaption></figure>;
}
