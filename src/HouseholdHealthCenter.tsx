import WorkspaceTitle from './WorkspaceTitle';
import FinancialDiagnosis from './FinancialDiagnosis';
import ModuleLoading from './ModuleLoading';
import ModuleIcon from './ModuleIcon';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {AlertTriangle,CheckCircle2,ChevronRight,Gauge,Package,RefreshCw,Sparkles,TrendingUp} from 'lucide-react';
import {supabase} from './lib/supabase';
import './HouseholdHealthCenter.css';

type Household={id:string;name:string;invite_code:string};
type DomainKey='finance'|'organization'|'documents'|'maintenance'|'food';
type Domain={key:DomainKey;title:string;score:number;configured:boolean;tab:string;value:string;detail:string};
type Recommendation={key:string;severity:'danger'|'warning'|'info'|'success';priority:number;title:string;body:string;tab:string};
type Snapshot={
 generated_at:string;overall_score:number;coverage_score:number;status:'excellent'|'good'|'watch'|'risk';status_label:string;urgent_count:number;
 domains:Domain[];recommendations:Recommendation[];metrics:Record<string,number>;
};
type HealthHistory={snapshot_date:string;overall_score:number;finance_score:number;organization_score:number;documents_score:number;maintenance_score:number;pantry_score:number};

const money=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:0}).format(n);

export default function HouseholdHealthCenter({household,canEditFinance,onNavigate}:{household:Household;canEditFinance:boolean;onNavigate:(tab:string)=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[history,setHistory]=useState<HealthHistory[]>([]),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
 const sequence=useRef(0),currentHousehold=useRef(household.id);currentHousehold.current=household.id;const [revision,setRevision]=useState(0);

 useEffect(()=>{let channel:any;let active=true;(async()=>{await load();if(!active)return;
  channel=supabase.channel('household-health-'+household.id)
   .on('postgres_changes',{event:'*',schema:'public',table:'transactions',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'goal_contributions',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'budget_allocations',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'list_items',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'household_documents',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'maintenance_schedules',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'pantry_items',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'meal_plan_entries',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'events',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'finance_income_plans',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'finance_member_settings',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'finance_household_settings',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'finance_accounts',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'finance_transfers',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'recurring_transaction_occurrences',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'recurring_transactions',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'budget_categories',filter:'household_id=eq.'+household.id},()=>load(false))
   .subscribe();
 })();return()=>{active=false;sequence.current++;if(channel)supabase.removeChannel(channel)}},[household.id]);

 async function load(showLoader=true){
  const seq=++sequence.current,id=household.id;if(showLoader)setLoading(true);setMessage('');setRevision(r=>r+1);
  const {data,error}=await supabase.rpc('get_household_health_dashboard',{p_household_id:household.id});
  if(seq!==sequence.current||id!==currentHousehold.current)return;
  if(error){setMessage(error.message);setSnapshot(null);if(showLoader)setLoading(false);return}
  setSnapshot(data as Snapshot);
  const historyR=await supabase.from('household_health_snapshots').select('snapshot_date,overall_score,finance_score,organization_score,documents_score,maintenance_score,pantry_score').eq('household_id',household.id).order('snapshot_date').limit(60);
  if(seq!==sequence.current||id!==currentHousehold.current)return;
  if(historyR.error)setMessage(historyR.error.message);else setHistory((historyR.data||[]) as HealthHistory[]);
  if(showLoader)setLoading(false);
 }

 if(loading)return <ModuleLoading/>;
 if(!snapshot)return <section className="household-health-center"><div className="document-empty"><AlertTriangle/><strong>No se pudo calcular el estado del hogar</strong><span>{message||'Intenta actualizar nuevamente.'}</span><button onClick={()=>load()}><RefreshCw/> Reintentar</button></div></section>;

 const m=snapshot.metrics||{};
 const coverageLow=snapshot.coverage_score<60;
 const heroStatus=snapshot.coverage_score<40?'setup':snapshot.status;
 const heroLabel=snapshot.coverage_score<40?'Configuración inicial':snapshot.coverage_score<80&&snapshot.overall_score>=90?'En buen camino':snapshot.status_label;
 const heroText=snapshot.urgent_count>0
  ?snapshot.urgent_count+' asunto'+(snapshot.urgent_count===1?'':'s')+' requiere'+(snapshot.urgent_count===1?'':'n')+' atención prioritaria.'
  :coverageLow
   ?'Lo que ya configuraste está bajo control. Completa más módulos para tener una visión integral.'
   :'No detectamos vencimientos ni desviaciones críticas en este momento.';

 return <section className="household-health-center">
  <div className="health-top"><WorkspaceTitle module="health" eyebrow="ESTADO DEL HOGAR" title="Salud del hogar" description="Finanzas, pendientes y operación del hogar."/><button className="health-refresh" onClick={()=>load(false)}><RefreshCw/> Actualizar</button></div>

  {message&&<div className="finance-message">{message}</div>}

  <FinancialDiagnosis key={household.id} householdId={household.id} canEdit={canEditFinance} refreshKey={revision} onNavigate={onNavigate}/>

  <details className="health-operational"><summary><span className="health-operation-mark"><ModuleIcon name="home" size={24}/></span><span><strong>Operación del hogar</strong><small>{heroLabel} · {snapshot.urgent_count} urgentes · cobertura {snapshot.coverage_score}%</small></span><ChevronRight/></summary><div className="health-operation-content">
  <section className={'health-hero '+heroStatus}>
   <div className="health-score-ring" style={{'--score':snapshot.overall_score} as CSSProperties}><div><strong>{snapshot.overall_score}</strong><span>/ 100</span></div></div>
   <div className="health-hero-copy"><p className="eyebrow">ÍNDICE OPERATIVO</p><h3>{heroLabel}</h3><p>{heroText}</p><div className="health-hero-tags"><span><Gauge/> Cobertura {snapshot.coverage_score}%</span><span className={snapshot.urgent_count?'urgent':''}><AlertTriangle/> {snapshot.urgent_count} urgentes</span><span><Sparkles/> {snapshot.recommendations.length} recomendación{snapshot.recommendations.length===1?'':'es'}</span></div></div>
   <button className="health-primary-action" onClick={()=>onNavigate(snapshot.recommendations[0]?.tab||'inicio')}><small>PRIMERA ACCIÓN</small><strong>{snapshot.recommendations[0]?.title||'Todo al día'}</strong><span>Revisar ahora <ChevronRight/></span></button>
  </section>

  <div className="health-domain-grid">
   {snapshot.domains.map(domain=><button className={'health-domain-card '+scoreTone(domain.score)+' '+(!domain.configured?'unconfigured':'')} key={domain.key} onClick={()=>onNavigate(domain.tab)}>
    <span className="health-domain-icon">{domainIcon(domain.key)}</span>
    <div className="health-domain-copy"><small>{domain.title}</small><strong>{domain.configured?domain.value:'Sin configurar'}</strong><em>{domain.configured?domain.detail:'Completa este módulo para incluirlo en el diagnóstico.'}</em></div>
    <div className="health-domain-score"><b>{domain.configured?domain.score:'—'}</b><span>{domain.configured?'puntos':'pendiente'}</span></div>
    <div className="health-domain-bar"><span style={{width:(domain.configured?domain.score:8)+'%'}}/></div>
   </button>)}
  </div>

  <div className="health-columns">
   <section className="health-panel">
    <div className="health-panel-head"><div><p className="eyebrow">RECOMENDACIONES</p><h3>Qué conviene hacer ahora</h3></div><Sparkles/></div>
    <div className="health-recommendations">{snapshot.recommendations.slice(0,8).map((rec,index)=><button className={'health-rec '+rec.severity} key={rec.key} onClick={()=>onNavigate(rec.tab)}>
      <span className="health-rec-rank">{index+1}</span><span className="health-rec-icon">{recommendationIcon(rec.severity)}</span><div><strong>{rec.title}</strong><small>{rec.body}</small></div><ChevronRight/>
    </button>)}</div>
   </section>

   <section className="health-panel">
    <div className="health-panel-head"><div><p className="eyebrow">INDICADORES</p><h3>Resumen rápido</h3></div><TrendingUp/></div>
    <div className="health-metric-grid">
     <Metric icon={<ModuleIcon name="finance"/>} label="Balance del mes" value={money(Number(m.income||0)-Number(m.expense||0)-Number(m.saving||0))} detail={Math.round(Number(m.savings_rate||0))+'% tasa de ahorro'} tone="finance"/>
     <Metric icon={<TrendingUp/>} label="Patrimonio neto" value={money(Number(m.net_worth||0))} detail={Number(m.overbudget_categories||0)+' categorías excedidas'} tone="worth"/>
     <Metric icon={<ModuleIcon name="lists"/>} label="Pendientes" value={String(m.tasks_open||0)} detail={(m.tasks_overdue||0)+' vencidos · '+(m.tasks_due7||0)+' esta semana'} tone="tasks"/>
     <Metric icon={<ModuleIcon name="calendar"/>} label="Agenda 7 días" value={String(m.events7||0)} detail="eventos próximos" tone="agenda"/>
     <Metric icon={<ModuleIcon name="maintenance"/>} label="Mantenimientos" value={String(m.maintenance_overdue||0)} detail={(m.maintenance_upcoming||0)+' próximos'} tone="maintenance"/>
     <Metric icon={<Package/>} label="Despensa" value={String(m.pantry_low||0)} detail={(m.pantry_soon||0)+' por vencer'} tone="food"/>
    </div>
   </section>
  </div>

  <section className="health-panel health-history-panel">
   <div className="health-panel-head"><div><p className="eyebrow">EVOLUCIÓN</p><h3>Historial de salud del hogar</h3></div><TrendingUp/></div>
   <HealthTrend rows={history}/>
  </section>

  <section className="health-coverage-panel">
   <div><span><CheckCircle2/></span><div><p className="eyebrow">COBERTURA DEL CONTROL</p><h3>{snapshot.coverage_score}% del hogar conectado</h3><p>{coverageMessage(snapshot.coverage_score)}</p></div></div>
   <div className="health-coverage-track"><span style={{width:snapshot.coverage_score+'%'}}/></div>
   <div className="health-coverage-modules">{snapshot.domains.map(domain=><button key={domain.key} className={domain.configured?'done':'pending'} onClick={()=>onNavigate(domain.tab)}>{domain.configured?<CheckCircle2/>:<AlertTriangle/>}<span>{domain.title}</span></button>)}</div>
  </section>
  </div></details>
 </section>
}

function Metric({icon,label,value,detail,tone}:{icon:React.ReactNode;label:string;value:string;detail:string;tone:string}){return <div className={'health-metric '+tone}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></div>}
function domainIcon(key:DomainKey){if(key==='finance')return <ModuleIcon name="finance"/>;if(key==='organization')return <ModuleIcon name="lists"/>;if(key==='documents')return <ModuleIcon name="documents"/>;if(key==='maintenance')return <ModuleIcon name="maintenance"/>;return <ModuleIcon name="meals"/>}
function recommendationIcon(severity:Recommendation['severity']){if(severity==='danger')return <AlertTriangle/>;if(severity==='warning')return <Gauge/>;if(severity==='success')return <CheckCircle2/>;return <Sparkles/>}
function HealthTrend({rows}:{rows:HealthHistory[]}){
 if(!rows.length)return <div className="control-empty small"><TrendingUp/><span>El histórico comenzará a construirse desde hoy.</span></div>;
 const recent=rows.slice(-30),min=Math.min(...recent.map(r=>r.overall_score),40),range=Math.max(1,100-min);
 return <div className="health-trend"><div className="health-trend-chart">{recent.map((row,index)=>{const height=Math.max(8,(row.overall_score-min)/range*100);return <div className="health-trend-col" key={row.snapshot_date} title={formatHealthDate(row.snapshot_date)+' · '+row.overall_score+'/100'}><span style={{height:height+'%'}}/><small>{index===0||index===recent.length-1||index%Math.max(1,Math.floor(recent.length/4))===0?new Date(row.snapshot_date+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short'}).replace('.',''):''}</small></div>})}</div><div className="health-trend-foot"><span>Inicio <b>{recent[0].overall_score}</b></span><span>Actual <b>{recent[recent.length-1].overall_score}</b></span></div></div>
}
function formatHealthDate(value:string){return new Date(value+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short',year:'numeric'}).replace('.','')}
function scoreTone(score:number){return score>=90?'excellent':score>=75?'good':score>=55?'watch':'risk'}
function coverageMessage(score:number){if(score>=100)return'Todos los módulos principales aportan información al diagnóstico.';if(score>=80)return'El control está casi completo; falta muy poco para una vista integral.';if(score>=60)return'Ya tienes una base sólida. Completar los módulos pendientes hará las recomendaciones más precisas.';return'Configura los módulos pendientes para que el índice represente mejor la operación real del hogar.'}
