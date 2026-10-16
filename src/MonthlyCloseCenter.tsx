import WorkspaceTitle from './WorkspaceTitle';
import ModuleLoading from './ModuleLoading';
import ModuleIcon from './ModuleIcon';
import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,ArrowDownRight,ArrowUpRight,CalendarCheck2,Check,CheckCircle2,ChevronLeft,ChevronRight,Copy,Download,Minus,Plus,ReceiptText,RefreshCw,Sparkles,Target,TrendingUp} from 'lucide-react';
import {supabase} from './lib/supabase';
import './MonthlyCloseCenter.css';

type Household={id:string;name:string;invite_code:string};
type Insight={tone:'positive'|'warning'|'danger'|'info';title:string;body:string;tab:string};
type CategoryRow={category_id:string|null;name:string;amount:number;previous_amount:number;share:number;change_pct:number|null};
type CloseSnapshot={
 month:string;period_end:string;is_complete_month:boolean;score:number;status:'excellent'|'good'|'watch'|'risk';status_label:string;
 financial:{income:number;expense:number;saving:number;budget:number;balance:number;saving_rate:number;budget_usage:number;net_worth:number|null};
 previous:{month:string;period_end:string;income:number;expense:number;saving:number;budget:number;balance:number;saving_rate:number;budget_usage:number;net_worth:number|null};
 changes:{income_pct:number|null;expense_pct:number|null;saving_pct:number|null;net_worth_amount:number|null};
 operations:{recurring_paid:number;recurring_pending:number;tasks_completed:number;tasks_overdue:number;events:number;maintenance_count:number;maintenance_cost:number;documents_due:number;meals_prepared:number};
 top_categories:CategoryRow[];insights:Insight[];suggested_focus:string[];generated_at:string;
};
type CloseRow={id:string;month:string;status:'closed';snapshot:CloseSnapshot;reflection:string|null;next_month_focus:string[];closed_at:string;closed_by:string|null};
type HistoryRow={id:string;month:string;snapshot:CloseSnapshot;closed_at:string};

const currency=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:0}).format(Number(n||0));
const monthKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
const monthLabel=(value:string|Date)=>{
 const d=value instanceof Date?value:new Date(value+'T12:00');
 return d.toLocaleDateString('es-GT',{month:'long',year:'numeric'});
};
const shortDate=(value:string)=>new Date(value+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short'}).replace('.','');
const currentMonth=()=>new Date(new Date().getFullYear(),new Date().getMonth(),1);

export default function MonthlyCloseCenter({household,onNavigate,readOnly=false}:{household:Household;onNavigate:(tab:string)=>void;readOnly?:boolean}){
 const [month,setMonth]=useState(()=>currentMonth());
 const [snapshot,setSnapshot]=useState<CloseSnapshot|null>(null),[closure,setClosure]=useState<CloseRow|null>(null),[history,setHistory]=useState<HistoryRow[]>([]);
 const [reflection,setReflection]=useState(''),[focus,setFocus]=useState<string[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 useEffect(()=>{load()},[household.id,month.getFullYear(),month.getMonth()]);

 async function load(showLoader=true){
  if(showLoader)setLoading(true);setMessage('');
  const key=monthKey(month);
  const [closeR,historyR]=await Promise.all([
   supabase.from('monthly_household_closures').select('id,month,status,snapshot,reflection,next_month_focus,closed_at,closed_by').eq('household_id',household.id).eq('month',key).maybeSingle(),
   supabase.from('monthly_household_closures').select('id,month,snapshot,closed_at').eq('household_id',household.id).order('month',{ascending:true}).limit(18)
  ]);
  if(closeR.error||historyR.error){setMessage(closeR.error?.message||historyR.error?.message||'No se pudo cargar el cierre mensual.');if(showLoader)setLoading(false);return}
  const existing=(closeR.data||null) as CloseRow|null;
  setClosure(existing);setHistory((historyR.data||[]) as HistoryRow[]);
  if(existing){
   setSnapshot(existing.snapshot);setReflection(existing.reflection||'');setFocus((existing.next_month_focus||[]).filter(Boolean));
  }else{
   const built=await supabase.rpc('build_monthly_household_close',{p_household_id:household.id,p_month:key});
   if(built.error){setMessage(built.error.message);setSnapshot(null)}
   else{
    const snap=built.data as CloseSnapshot;setSnapshot(snap);setReflection('');setFocus((snap.suggested_focus||[]).filter(Boolean).slice(0,5));
   }
  }
  if(showLoader)setLoading(false);
 }

 const nowMonth=currentMonth(),isCurrent=monthKey(month)===monthKey(nowMonth),isFuture=month>nowMonth;
 const canNext=month<nowMonth;
 const displayHistory=useMemo(()=>{
  const rows=history.map(h=>({month:h.month,score:Number(h.snapshot?.score||0),closed:true}));
  if(snapshot&&!closure&&!rows.some(r=>r.month===snapshot.month))rows.push({month:snapshot.month,score:Number(snapshot.score||0),closed:false});
  return rows.sort((a,b)=>a.month.localeCompare(b.month)).slice(-12);
 },[history,snapshot,closure]);

 function moveMonth(delta:number){const d=new Date(month);d.setMonth(d.getMonth()+delta);d.setDate(1);if(d<=nowMonth)setMonth(d)}
 function setFocusValue(index:number,value:string){setFocus(current=>current.map((x,i)=>i===index?value:x))}
 function addFocus(){if(focus.length<5)setFocus(current=>[...current,''])}
 function removeFocus(index:number){setFocus(current=>current.filter((_,i)=>i!==index))}

 async function finalize(){
  if(readOnly){setMessage('Modo solo lectura.');return}
  if(isCurrent||isFuture)return;
  setBusy(true);setMessage('');
  const clean=focus.map(x=>x.trim()).filter(Boolean);
  const {error}=await supabase.rpc('finalize_monthly_household_close',{
   p_household_id:household.id,p_month:monthKey(month),p_reflection:reflection.trim()||null,p_next_month_focus:clean
  });
  setBusy(false);
  if(error){setMessage(error.message);return}
  setMessage('Mes cerrado. El resumen quedó guardado como fotografía histórica.');
  await load(false);
 }

 async function saveReflection(){
  if(readOnly){setMessage('Modo solo lectura.');return}
  if(!closure)return;
  setBusy(true);setMessage('');
  const clean=focus.map(x=>x.trim()).filter(Boolean);
  const {error}=await supabase.rpc('update_monthly_close_reflection',{
   p_household_id:household.id,p_month:monthKey(month),p_reflection:reflection.trim(),p_next_month_focus:clean
  });
  setBusy(false);
  if(error){setMessage(error.message);return}
  setMessage('Reflexión y objetivos actualizados.');await load(false);
 }

 async function copySummary(){
  if(!snapshot)return;
  const f=snapshot.financial,o=snapshot.operations;
  const lines=[
   `Cierre de ${monthLabel(snapshot.month)} — ${snapshot.score}/100 (${snapshot.status_label})`,
   `Ingresos: ${currency(f.income)} | Gastos: ${currency(f.expense)} | Ahorro: ${currency(f.saving)} | Balance: ${currency(f.balance)}`,
   `Presupuesto utilizado: ${f.budget?f.budget_usage+'%':'Sin presupuesto'} | Tasa de ahorro: ${f.saving_rate}%`,
   `Tareas completadas: ${o.tasks_completed} | Tareas vencidas: ${o.tasks_overdue} | Pagos pendientes: ${o.recurring_pending}`,
   ...snapshot.insights.slice(0,4).map(i=>`• ${i.title}: ${i.body}`),
   ...(focus.filter(Boolean).length?['Objetivos próximo mes:',...focus.filter(Boolean).map(x=>`• ${x}`)]:[])
  ];
  try{await navigator.clipboard.writeText(lines.join('\n'));setMessage('Resumen copiado al portapapeles.')}catch{setMessage('No se pudo copiar automáticamente en este dispositivo.')}
 }

 if(loading)return <ModuleLoading/>;
 if(!snapshot)return <section className="monthly-close-center"><div className="document-empty"><ModuleIcon name="monthly_close"/><strong>No pudimos preparar el cierre</strong><span>{message||'Intenta nuevamente.'}</span><button onClick={()=>load()}><RefreshCw/> Reintentar</button></div></section>;

 const f=snapshot.financial,p=snapshot.previous,c=snapshot.changes,o=snapshot.operations;
 const maxCategory=Math.max(1,...snapshot.top_categories.map(x=>Number(x.amount||0)));
 const statusCopy=snapshot.status==='excellent'?'Un mes muy sólido. Mantengan las decisiones que están funcionando.':snapshot.status==='good'?'El mes terminó bien, con algunos puntos concretos para optimizar.':snapshot.status==='watch'?'El mes deja oportunidades claras de ajuste para el siguiente período.':'Conviene priorizar las acciones señaladas antes de asumir nuevos compromisos.';

 return <section className="monthly-close-center">
  <div className="monthly-close-top">
   <WorkspaceTitle module="monthly_close" eyebrow="CIERRE MENSUAL" title="Resumen del hogar" description="Convierte cada mes en una fotografía comparable de finanzas, organización y operación del hogar."/>
   <div className="monthly-close-actions"><button onClick={copySummary}><Copy/> Copiar resumen</button><button onClick={()=>load()}><RefreshCw/> Actualizar</button></div>
  </div>

  {message&&<div className="finance-message">{message}</div>}

  <div className="monthly-close-period">
   <button aria-label="Mes anterior" onClick={()=>moveMonth(-1)}><ChevronLeft/></button>
   <div><small>{closure?'MES CERRADO':isCurrent?'VISTA PREVIA':'PENDIENTE DE CIERRE'}</small><strong>{monthLabel(month)}</strong>{!closure&&isCurrent&&<span>Datos al {shortDate(snapshot.period_end)}</span>}{closure&&<span>Cerrado {new Date(closure.closed_at).toLocaleDateString('es-GT',{day:'numeric',month:'short',year:'numeric'}).replace('.','')}</span>}</div>
   <button aria-label="Mes siguiente" onClick={()=>moveMonth(1)} disabled={!canNext}><ChevronRight/></button>
  </div>

  <button className="primary compact" disabled={busy} onClick={async()=>{setBusy(true);try{const {downloadMonthlyPdf}=await import('./lib/monthlyPdf');await downloadMonthlyPdf(household.name,snapshot,{reflection:closure?.reflection??reflection,focus:closure?.next_month_focus??focus.filter(Boolean),closed:Boolean(closure)})}catch(error){setMessage(error instanceof Error?error.message:'No se pudo generar el PDF.')}finally{setBusy(false)}}}><Download size={17}/> Descargar resumen PDF</button>
  <section className={'monthly-close-hero '+snapshot.status}>
   <div className="monthly-close-score" style={{'--score':snapshot.score} as React.CSSProperties}><div><strong>{snapshot.score}</strong><span>/100</span></div></div>
   <div className="monthly-close-hero-copy"><p className="eyebrow">{closure?'RESULTADO FINAL':'RESULTADO PROVISIONAL'}</p><h3>{snapshot.status_label}</h3><p>{statusCopy}</p><div><span><Sparkles/> {snapshot.insights.length} hallazgo{snapshot.insights.length===1?'':'s'}</span><span><Target/> {focus.filter(Boolean).length} objetivo{focus.filter(Boolean).length===1?'':'s'} próximo mes</span></div></div>
   <div className="monthly-close-balance"><small>Balance después de ahorro</small><strong className={f.balance>=0?'positive':'negative'}>{currency(f.balance)}</strong><span>{f.income?Math.round((f.balance/f.income)*100)+'% de los ingresos':'Sin ingresos registrados'}</span></div>
  </section>

  <div className="monthly-close-kpis">
   <CloseMetric title="Ingresos" value={currency(f.income)} previous={currency(p.income)} change={c.income_pct} kind="income"/>
   <CloseMetric title="Gastos" value={currency(f.expense)} previous={currency(p.expense)} change={c.expense_pct} kind="expense"/>
   <CloseMetric title="Ahorro" value={currency(f.saving)} previous={currency(p.saving)} change={c.saving_pct} kind="saving"/>
   <CloseMetric title="Presupuesto" value={f.budget?Math.round(f.budget_usage)+'%':'—'} previous={p.budget?Math.round(p.budget_usage)+'%':'—'} change={null} kind="budget" subtitle={f.budget?currency(f.expense)+' de '+currency(f.budget):'Sin presupuesto asignado'}/>
  </div>

  <div className="monthly-close-main-grid">
   <section className="monthly-close-panel">
    <div className="monthly-close-panel-head"><div><p className="eyebrow">LECTURA DEL MES</p><h3>Qué cambió y por qué importa</h3></div><Sparkles/></div>
    {snapshot.insights.length?<div className="monthly-close-insights">{snapshot.insights.map((insight,index)=><button key={index} className={insight.tone} onClick={()=>onNavigate(insight.tab)}><span>{insightIcon(insight.tone)}</span><div><strong>{insight.title}</strong><small>{insight.body}</small></div><ChevronRight/></button>)}</div>:<div className="control-empty small"><CheckCircle2/><span>No hay hallazgos importantes para este período.</span></div>}
   </section>

   <section className="monthly-close-panel">
    <div className="monthly-close-panel-head"><div><p className="eyebrow">GASTOS</p><h3>Categorías principales</h3></div><button onClick={()=>onNavigate('presupuesto')}>Finanzas <ChevronRight/></button></div>
    {snapshot.top_categories.length?<div className="monthly-close-categories">{snapshot.top_categories.map(row=><div key={row.category_id||row.name}><div><strong>{row.name}</strong><span>{currency(row.amount)} · {Math.round(row.share)}%</span></div><div className="monthly-category-bar"><span style={{width:Math.max(4,Number(row.amount)/maxCategory*100)+'%'}}/></div><small>{row.change_pct==null?'Sin base anterior':row.change_pct===0?'Sin cambio':`${row.change_pct>0?'+':''}${Math.round(row.change_pct)}% vs período anterior`}</small></div>)}</div>:<div className="control-empty small"><ReceiptText/><span>No hay gastos clasificados en este período.</span></div>}
   </section>
  </div>

  <div className="monthly-close-operations">
   <OperationCard icon={<CheckCircle2/>} title="Tareas completadas" value={o.tasks_completed} detail={o.tasks_overdue?o.tasks_overdue+' vencida'+(o.tasks_overdue===1?'':'s'):'Sin vencidas'} tone={o.tasks_overdue?'warning':'good'} onClick={()=>onNavigate('listas')}/>
   <OperationCard icon={<CalendarCheck2/>} title="Agenda" value={o.events} detail="eventos del período" tone="neutral" onClick={()=>onNavigate('calendario')}/>
   <OperationCard icon={<ModuleIcon name="maintenance"/>} title="Mantenimiento" value={o.maintenance_count} detail={o.maintenance_count?currency(o.maintenance_cost):'sin servicios'} tone="neutral" onClick={()=>onNavigate('mantenimiento')}/>
   <OperationCard icon={<ModuleIcon name="documents"/>} title="Documentos" value={o.documents_due} detail="con vencimiento en el mes" tone={o.documents_due?'warning':'good'} onClick={()=>onNavigate('documentos')}/>
   <OperationCard icon={<ModuleIcon name="meals"/>} title="Comidas preparadas" value={o.meals_prepared} detail="registradas" tone="neutral" onClick={()=>onNavigate('comidas')}/>
   <OperationCard icon={<ModuleIcon name="finance"/>} title="Pagos recurrentes" value={o.recurring_paid} detail={o.recurring_pending?o.recurring_pending+' pendiente'+(o.recurring_pending===1?'':'s'):'todos resueltos'} tone={o.recurring_pending?'danger':'good'} onClick={()=>onNavigate('presupuesto')}/>
  </div>

  <div className="monthly-close-secondary-grid">
   <section className="monthly-close-panel">
    <div className="monthly-close-panel-head"><div><p className="eyebrow">EVOLUCIÓN</p><h3>Cierres anteriores</h3></div><TrendingUp/></div>
    <CloseTrend rows={displayHistory}/>
   </section>

   <section className="monthly-close-panel">
    <div className="monthly-close-panel-head"><div><p className="eyebrow">PATRIMONIO</p><h3>Posición financiera</h3></div><ModuleIcon name="finance"/></div>
    <div className="monthly-networth"><small>Patrimonio registrado</small><strong>{f.net_worth==null?'Sin dato':currency(f.net_worth)}</strong>{c.net_worth_amount!=null&&<span className={c.net_worth_amount>=0?'positive':'negative'}>{c.net_worth_amount>=0?<ArrowUpRight/>:<ArrowDownRight/>}{currency(Math.abs(c.net_worth_amount))} vs período anterior</span>}</div>
    <div className="monthly-rate-row"><div><span>Tasa de ahorro</span><strong>{f.saving_rate}%</strong></div><div className="monthly-rate-track"><span style={{width:Math.min(100,Math.max(2,f.saving_rate*4))+'%'}}/></div><small>{f.saving_rate>=15?'Nivel sólido':f.saving_rate>=10?'Buen punto de partida':'Objetivo sugerido: 10% o más'}</small></div>
   </section>
  </div>

  <section className="monthly-close-reflection">
   <div className="monthly-close-panel-head"><div><p className="eyebrow">APRENDIZAJE</p><h3>Reflexión y enfoque del próximo mes</h3><p>El cierre conserva los números; esta parte conserva las decisiones.</p></div><Target/></div>
   <div className="monthly-reflection-grid">
    <label><span>¿Qué aprendimos este mes?</span><textarea rows={6} value={reflection} disabled={readOnly} onChange={e=>setReflection(e.target.value)} placeholder="Ej. Gastamos más en salidas, pero logramos cubrir todos los pagos y avanzar en la meta de ahorro."/></label>
    <div className="monthly-focus-editor"><span>Objetivos del próximo mes</span>{focus.map((item,index)=><div key={index}><input value={item} disabled={readOnly} onChange={e=>setFocusValue(index,e.target.value)} placeholder={'Objetivo '+(index+1)}/>{!readOnly&&<button onClick={()=>removeFocus(index)} title="Quitar"><Minus/></button>}</div>)}{!readOnly&&focus.length<5&&<button className="monthly-add-focus" onClick={addFocus}><Plus/> Agregar objetivo</button>}</div>
   </div>
   <div className="monthly-close-footer">
    {isCurrent&&!closure?<div className="monthly-close-notice"><CalendarCheck2/><span><strong>Mes en curso</strong><small>Puedes revisar la vista previa ahora. El cierre definitivo estará disponible cuando termine {monthLabel(month).split(' ')[0]}.</small></span></div>:closure?<div className="monthly-close-notice closed"><CheckCircle2/><span><strong>Cierre protegido</strong><small>Los números quedaron congelados; solo puedes actualizar la reflexión y los objetivos.</small></span></div>:<div className="monthly-close-notice ready"><ModuleIcon name="monthly_close"/><span><strong>Listo para cerrar</strong><small>Al cerrar, guardaremos esta fotografía para futuras comparaciones.</small></span></div>}
    {!readOnly&&<button className="monthly-close-primary" disabled={busy||isCurrent} onClick={closure?saveReflection:finalize}>{busy?'Guardando...':closure?'Guardar reflexión':'Cerrar mes'}</button>}
   </div>
  </section>
 </section>
}

function CloseMetric({title,value,previous,change,kind,subtitle}:{title:string;value:string;previous:string;change:number|null;kind:'income'|'expense'|'saving'|'budget';subtitle?:string}){
 const good=change==null?null:kind==='expense'?change<=0:change>=0;
 return <article className={'monthly-close-metric '+kind}><span>{kind==='income'?<ArrowUpRight/>:kind==='expense'?<ArrowDownRight/>:kind==='saving'?<Target/>:<ModuleIcon name="finance"/>}</span><div><small>{title}</small><strong>{value}</strong><em>{subtitle||'Anterior: '+previous}</em></div>{change!=null&&<b className={good?'good':'bad'}>{change>0?'+':''}{Math.round(change)}%</b>}</article>
}
function OperationCard({icon,title,value,detail,tone,onClick}:{icon:React.ReactNode;title:string;value:number;detail:string;tone:'good'|'warning'|'danger'|'neutral';onClick:()=>void}){
 return <button className={'monthly-operation '+tone} onClick={onClick}><span>{icon}</span><div><small>{title}</small><strong>{value}</strong><em>{detail}</em></div><ChevronRight/></button>
}
function CloseTrend({rows}:{rows:{month:string;score:number;closed:boolean}[]}){
 if(!rows.length)return <div className="control-empty small"><TrendingUp/><span>El historial empezará con tu primer cierre mensual.</span></div>;
 const min=Math.min(50,...rows.map(r=>r.score)),range=Math.max(1,100-min);
 return <div className="monthly-close-trend"><div className="monthly-close-chart">{rows.map((row,index)=>{const h=Math.max(7,(row.score-min)/range*100);return <div key={row.month} title={monthLabel(row.month)+' · '+row.score+'/100'}><span className={row.closed?'closed':'preview'} style={{height:h+'%'}}/><small>{index===0||index===rows.length-1||rows.length<=6?new Date(row.month+'T12:00').toLocaleDateString('es-GT',{month:'short'}).replace('.',''):''}</small></div>})}</div><div className="monthly-close-trend-foot"><span>Primer cierre <b>{rows[0].score}</b></span><span>Último <b>{rows[rows.length-1].score}</b></span></div></div>
}
function insightIcon(tone:Insight['tone']){if(tone==='positive')return <Check/>;if(tone==='danger')return <AlertTriangle/>;if(tone==='warning')return <ArrowUpRight/>;return <Sparkles/>}
