import WorkspaceHeading from './WorkspaceHeading';
import WorkspaceTitle from './WorkspaceTitle';
import ModuleLoading from './ModuleLoading';
import ModuleIcon from './ModuleIcon';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {AlertTriangle,ArrowRight,Building2,Car,Check,CheckCircle2,ChevronRight,CircleDollarSign,Clock3,CreditCard,Edit3,Flag,Pause,Plane,Plus,ReceiptText,Sparkles,Target,Trash2,TrendingUp,X} from 'lucide-react';
import {supabase} from './lib/supabase';
import {formatMoney} from './lib/money';
import './PlanningCenter.css';

type Household={id:string;name:string;invite_code:string};
type GoalType='saving'|'travel'|'purchase'|'housing'|'vehicle'|'debt'|'maintenance'|'event'|'home'|'other';
type Priority='high'|'medium'|'low';
type GoalStatus='active'|'paused'|'completed';
type PaceStatus='completed'|'overdue'|'at_risk'|'due_soon'|'on_track';
type Goal={
 id:string;title:string;goal_type:GoalType;description:string|null;horizon_months:1|3|6|12;target_date:string;
 target_amount:number|null;current_amount:number;manual_current_amount:number;priority:Priority;status:GoalStatus;
 progress_pct:number;pace_status:PaceStatus;remaining:number;months_remaining:number;required_monthly:number|null;
 milestone_count:number;milestone_done:number;milestone_overdue:number;
 linked_savings_goal_id:string|null;linked_account_id:string|null;linked_maintenance_id:string|null;linked_event_id:string|null;notes:string|null
};
type PlanData={summary:{active:number;at_risk:number;due_soon:number;completed:number;monthly_required:number};goals:Goal[];generated_at:string};
type Milestone={id:string;planning_goal_id:string;title:string;due_date:string|null;estimated_amount:number|null;status:'pending'|'completed'|'skipped';linked_tab:string|null;sort_order:number;completed_at:string|null};
type SavingGoal={id:string;name:string;target_amount:number;target_date:string|null};
type FinanceAccount={id:string;name:string;opening_balance:number;account_class:string;account_type:string};
type Maintenance={id:string;title:string;next_due_date:string|null};
type EventRow={id:string;title:string;event_date:string};

const iso=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const money=(n:number)=>formatMoney(Number(n||0));
const fmtDate=(value:string|null)=>value?new Date(value+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short',year:'numeric'}).replace('.',''):'Sin fecha';
const addMonths=(months:number)=>{const d=new Date();d.setMonth(d.getMonth()+months);return iso(d)};

export default function PlanningCenter({household,onNavigate,readOnly=false}:{household:Household;onNavigate:(tab:string)=>void;readOnly?:boolean}){
 const [plan,setPlan]=useState<PlanData|null>(null),[milestones,setMilestones]=useState<Milestone[]>([]);
 const [savings,setSavings]=useState<SavingGoal[]>([]),[accounts,setAccounts]=useState<FinanceAccount[]>([]),[maintenance,setMaintenance]=useState<Maintenance[]>([]),[events,setEvents]=useState<EventRow[]>([]);
 const [horizon,setHorizon]=useState<1|3|6|12|0>(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [showGoal,setShowGoal]=useState(false),[editingGoal,setEditingGoal]=useState<Goal|null>(null),[openGoal,setOpenGoal]=useState<string|null>(null),[showMilestone,setShowMilestone]=useState<string|null>(null);

 useEffect(()=>{load();const channel=supabase.channel('planning-'+household.id)
  .on('postgres_changes',{event:'*',schema:'public',table:'household_planning_goals',filter:'household_id=eq.'+household.id},()=>load(false))
  .on('postgres_changes',{event:'*',schema:'public',table:'planning_milestones',filter:'household_id=eq.'+household.id},()=>load(false))
  .subscribe();return()=>{supabase.removeChannel(channel)}
 },[household.id]);

 async function load(showLoader=true){
  if(showLoader)setLoading(true);setMessage('');
  const [planR,milestoneR,savingR,accountR,maintenanceR,eventR]=await Promise.all([
   supabase.rpc('get_household_plan',{p_household_id:household.id}),
   supabase.from('planning_milestones').select('id,planning_goal_id,title,due_date,estimated_amount,status,linked_tab,sort_order,completed_at').eq('household_id',household.id).order('due_date',{ascending:true,nullsFirst:false}).order('sort_order'),
   supabase.from('savings_goals').select('id,name,target_amount,target_date').eq('household_id',household.id).eq('active',true).order('created_at'),
   supabase.from('finance_accounts').select('id,name,opening_balance,account_class,account_type').eq('household_id',household.id).eq('active',true).order('name'),
   supabase.from('maintenance_schedules').select('id,title,next_due_date').eq('household_id',household.id).eq('active',true).order('next_due_date',{ascending:true,nullsFirst:false}),
   supabase.from('events').select('id,title,event_date').eq('household_id',household.id).gte('event_date',iso()).order('event_date').limit(100)
  ]);
  if(planR.error||milestoneR.error)setMessage(planR.error?.message||milestoneR.error?.message||'No se pudo cargar la planeación.');
  setPlan((planR.data||{summary:{active:0,at_risk:0,due_soon:0,completed:0,monthly_required:0},goals:[],generated_at:new Date().toISOString()}) as PlanData);
  setMilestones((milestoneR.data||[]) as Milestone[]);setSavings((savingR.data||[]) as SavingGoal[]);
  setAccounts((accountR.data||[]) as FinanceAccount[]);setMaintenance((maintenanceR.data||[]) as Maintenance[]);setEvents((eventR.data||[]) as EventRow[]);
  if(showLoader)setLoading(false);
 }

 const goals=plan?.goals||[];
 const filtered=useMemo(()=>goals.filter(g=>horizon===0||g.horizon_months===horizon),[goals,horizon]);
 const activeGoals=goals.filter(g=>g.status==='active');
 const nextMilestones=useMemo(()=>milestones.filter(m=>m.status==='pending').slice().sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')).slice(0,6),[milestones]);
 const roadmap=useMemo(()=>[1,3,6,12].map(h=>({horizon:h as 1|3|6|12,goals:activeGoals.filter(g=>g.horizon_months===h)})),[goals]);

 function startGoal(goal:Goal|null=null){if(readOnly)return;setEditingGoal(goal);setShowGoal(true)}
 function closeGoal(){setEditingGoal(null);setShowGoal(false)}

 async function saveGoal(e:FormEvent<HTMLFormElement>){
  if(readOnly){setMessage('Modo solo lectura.');return}
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const goalType=String(f.get('goal_type')||'other') as GoalType;
  const targetAmount=String(f.get('target_amount')||'')?Number(f.get('target_amount')):null;
  const linkedSavings=String(f.get('linked_savings_goal_id')||'')||null;
  const linkedAccount=String(f.get('linked_account_id')||'')||null;
  const linkedMaintenance=String(f.get('linked_maintenance_id')||'')||null;
  const linkedEvent=String(f.get('linked_event_id')||'')||null;
  if(editingGoal){
   const payload={title:String(f.get('title')||'').trim(),goal_type:goalType,description:String(f.get('description')||'').trim()||null,horizon_months:Number(f.get('horizon_months')||3),target_date:String(f.get('target_date')||''),target_amount:targetAmount,current_amount:Number(f.get('current_amount')||0),priority:String(f.get('priority')||'medium'),linked_savings_goal_id:linkedSavings,linked_account_id:linkedAccount,linked_maintenance_id:linkedMaintenance,linked_event_id:linkedEvent,notes:String(f.get('notes')||'').trim()||null,updated_at:new Date().toISOString()};
   const {error}=await supabase.from('household_planning_goals').update(payload).eq('id',editingGoal.id).eq('household_id',household.id);
   setBusy(false);if(error){setMessage(error.message);return}setMessage('Objetivo actualizado.');
  }else{
   const {error}=await supabase.rpc('create_planning_goal',{
    p_household_id:household.id,p_title:String(f.get('title')||'').trim(),p_goal_type:goalType,p_horizon_months:Number(f.get('horizon_months')||3),
    p_target_date:String(f.get('target_date')||''),p_target_amount:targetAmount,p_current_amount:Number(f.get('current_amount')||0),p_priority:String(f.get('priority')||'medium'),
    p_description:String(f.get('description')||'').trim()||null,p_linked_savings_goal_id:linkedSavings,p_linked_account_id:linkedAccount,
    p_linked_maintenance_id:linkedMaintenance,p_linked_event_id:linkedEvent,p_notes:String(f.get('notes')||'').trim()||null
   });
   setBusy(false);if(error){setMessage(error.message);return}setMessage('Objetivo creado con un roadmap inicial de 3 pasos.');
  }
  closeGoal();await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});await load(false);
 }

 async function setGoalStatus(goal:Goal,status:GoalStatus){
  if(readOnly){setMessage('Modo solo lectura.');return}
  setBusy(true);const {error}=await supabase.from('household_planning_goals').update({status,updated_at:new Date().toISOString()}).eq('id',goal.id).eq('household_id',household.id);
  setBusy(false);setMessage(error?error.message:status==='completed'?'Objetivo completado.':status==='paused'?'Objetivo pausado.':'Objetivo reactivado.');
  if(!error){await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});await load(false)}
 }

 async function deleteGoal(goal:Goal){
  if(readOnly){setMessage('Modo solo lectura.');return}
  if(!window.confirm('¿Eliminar este objetivo y todos sus pasos?'))return;
  setBusy(true);const {error}=await supabase.from('household_planning_goals').delete().eq('id',goal.id).eq('household_id',household.id);
  setBusy(false);setMessage(error?error.message:'Objetivo eliminado.');if(!error)await load(false);
 }

 async function toggleMilestone(m:Milestone){
  if(readOnly){setMessage('Modo solo lectura.');return}
  setBusy(true);const {error}=await supabase.rpc('complete_planning_milestone',{p_milestone_id:m.id,p_completed:m.status!=='completed'});
  setBusy(false);setMessage(error?error.message:m.status==='completed'?'Paso reabierto.':'Paso completado.');if(!error){await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});await load(false)}
 }

 async function addMilestone(e:FormEvent<HTMLFormElement>){
  if(readOnly){setMessage('Modo solo lectura.');return}
  e.preventDefault();if(!showMilestone)return;setBusy(true);const f=new FormData(e.currentTarget);
  const {error}=await supabase.from('planning_milestones').insert({household_id:household.id,planning_goal_id:showMilestone,title:String(f.get('title')||'').trim(),due_date:String(f.get('due_date')||'')||null,estimated_amount:String(f.get('estimated_amount')||'')?Number(f.get('estimated_amount')):null,linked_tab:String(f.get('linked_tab')||'')||null,sort_order:milestones.filter(m=>m.planning_goal_id===showMilestone).length*10+40});
  setBusy(false);setMessage(error?error.message:'Paso agregado al roadmap.');if(!error){setShowMilestone(null);await load(false)}
 }

 async function deleteMilestone(m:Milestone){
  if(readOnly){setMessage('Modo solo lectura.');return}
  if(!window.confirm('¿Eliminar este paso?'))return;
  const {error}=await supabase.from('planning_milestones').delete().eq('id',m.id).eq('household_id',household.id);
  setMessage(error?error.message:'Paso eliminado.');if(!error)await load(false);
 }

 if(loading)return <ModuleLoading/>;
 const summary=plan?.summary||{active:0,at_risk:0,due_soon:0,completed:0,monthly_required:0};

 return <section className="planning-center">
  <WorkspaceHeading className="planning-top"><WorkspaceTitle module="planning" eyebrow="PLANEACIÓN DEL HOGAR" title="Roadmap de objetivos" description="Convierte metas de 1, 3, 6 y 12 meses en pasos, fechas y montos concretos."/>{!readOnly&&<button className="planning-new" onClick={()=>startGoal()}><Plus/> Nuevo objetivo</button>}</WorkspaceHeading>
  {message&&<div className="finance-message">{message}</div>}

  <div className="planning-kpis">
   <div><span className="active"><Target/></span><small>Objetivos activos</small><strong>{summary.active}</strong><em>{summary.completed} completado{summary.completed===1?'':'s'}</em></div>
   <div><span className="funding"><CircleDollarSign/></span><small>Requerido por mes</small><strong>{money(summary.monthly_required)}</strong><em>para metas con monto</em></div>
   <div><span className={summary.at_risk?'danger':'good'}><AlertTriangle/></span><small>En riesgo</small><strong>{summary.at_risk}</strong><em>{summary.at_risk?'requieren ajuste':'sin alertas'}</em></div>
   <div><span className="soon"><Clock3/></span><small>Próximos 30 días</small><strong>{summary.due_soon}</strong><em>objetivos por vencer</em></div>
  </div>

  <section className="planning-roadmap-panel">
   <div className="planning-panel-head"><div><p className="eyebrow">ROADMAP</p><h3>Horizonte de los próximos 12 meses</h3></div><ModuleIcon name="planning"/></div>
   <div className="planning-roadmap">{roadmap.map(bucket=><div className="planning-roadmap-column" key={bucket.horizon}><div className="planning-roadmap-column-head"><strong>{bucket.horizon} {bucket.horizon===1?'mes':'meses'}</strong><span>{bucket.goals.length}</span></div>{bucket.goals.length?bucket.goals.slice(0,4).map(goal=><button key={goal.id} className={'planning-roadmap-goal '+paceTone(goal.pace_status)} onClick={()=>setOpenGoal(goal.id)}><span>{goalIcon(goal.goal_type)}</span><div><strong>{goal.title}</strong><small>{goal.target_amount?Math.round(goal.progress_pct)+'% · '+money(goal.required_monthly||0)+'/mes':Math.round(goal.progress_pct)+'% completado'}</small></div></button>):<div className="planning-roadmap-empty">Sin objetivos</div>}</div>)}</div>
  </section>

  <div className="planning-tabs"><button className={horizon===0?'active':''} onClick={()=>setHorizon(0)}>Todos</button>{([1,3,6,12] as const).map(h=><button className={horizon===h?'active':''} key={h} onClick={()=>setHorizon(h)}>{h} {h===1?'mes':'meses'}</button>)}</div>

  <div className="planning-layout">
   <section className="planning-goals-panel">
    <div className="planning-panel-head"><div><p className="eyebrow">OBJETIVOS</p><h3>{horizon?'Horizonte '+horizon+' '+(horizon===1?'mes':'meses'):'Todos los objetivos'}</h3></div><span>{filtered.length}</span></div>
    <div className="planning-goal-list">{filtered.map(goal=><GoalCard key={goal.id} goal={goal} milestones={milestones.filter(m=>m.planning_goal_id===goal.id)} expanded={openGoal===goal.id} onExpand={()=>setOpenGoal(openGoal===goal.id?null:goal.id)} onEdit={()=>startGoal(goal)} onStatus={status=>setGoalStatus(goal,status)} onDelete={()=>deleteGoal(goal)} onToggleMilestone={toggleMilestone} onDeleteMilestone={deleteMilestone} onAddMilestone={()=>setShowMilestone(goal.id)} onNavigate={onNavigate} readOnly={readOnly}/>)}</div>
    {!filtered.length&&<div className="document-empty"><ModuleIcon name="planning"/><strong>No hay objetivos en este horizonte</strong><span>{readOnly?'No hay objetivos disponibles para consultar.':'Agrega una meta y Nuestro Hogar construirá el primer roadmap automáticamente.'}</span>{!readOnly&&<button onClick={()=>startGoal()}><Plus/> Crear objetivo</button>}</div>}
   </section>

   <aside className="planning-side">
    <section className="planning-side-panel">
     <div className="planning-panel-head"><div><p className="eyebrow">SIGUIENTES PASOS</p><h3>Qué toca ahora</h3></div><ModuleIcon name="lists"/></div>
     <div className="planning-next-list">{nextMilestones.map(m=>{const g=goals.find(x=>x.id===m.planning_goal_id);return <button key={m.id} onClick={()=>{setOpenGoal(m.planning_goal_id);if(m.linked_tab)onNavigate(String(m.linked_tab))}}><span className={m.due_date&&m.due_date<iso()?'danger':'normal'}><Flag/></span><div><strong>{m.title}</strong><small>{g?.title||'Objetivo'} · {fmtDate(m.due_date)}</small></div><ChevronRight/></button>})}</div>
     {!nextMilestones.length&&<div className="control-empty small"><CheckCircle2/><span>No hay pasos pendientes.</span></div>}
    </section>

    <section className="planning-side-panel">
     <div className="planning-panel-head"><div><p className="eyebrow">CARGA FINANCIERA</p><h3>Compromiso mensual</h3></div><ModuleIcon name="finance"/></div>
     <div className="planning-funding"><strong>{money(summary.monthly_required)}</strong><span>necesarios al mes para cumplir objetivos financieros activos en fecha.</span></div>
     <div className="planning-funding-list">{activeGoals.filter(g=>g.required_monthly!=null&&Number(g.required_monthly)>0).sort((a,b)=>Number(b.required_monthly)-Number(a.required_monthly)).slice(0,5).map(g=><div key={g.id}><span>{g.title}</span><b>{money(Number(g.required_monthly))}</b></div>)}</div>
     <button className="planning-finance-link" onClick={()=>onNavigate('presupuesto')}>Revisar capacidad en Finanzas <ChevronRight/></button>
    </section>
   </aside>
  </div>

  {showGoal&&!readOnly&&<GoalModal goal={editingGoal} savings={savings} accounts={accounts} maintenance={maintenance} events={events} busy={busy} onClose={closeGoal} onSubmit={saveGoal}/>}
  {showMilestone&&!readOnly&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowMilestone(null)}}><div className="finance-modal"><div className="modal-head"><div><p className="eyebrow">ROADMAP</p><h3>Nuevo paso</h3></div><button onClick={()=>setShowMilestone(null)}><X/></button></div><form className="finance-form" onSubmit={addMilestone}><label>Actividad<input name="title" placeholder="Ej. Cotizar tres opciones" required/></label><div className="two"><label>Fecha objetivo<input name="due_date" type="date"/></label><label>Monto estimado<input name="estimated_amount" type="number" min="0" step=".01"/></label></div><label>Ir a módulo<select name="linked_tab" defaultValue=""><option value="">Ninguno</option><option value="presupuesto">Finanzas</option><option value="calendario">Agenda</option><option value="listas">Listas</option><option value="documentos">Documentos</option><option value="mantenimiento">Mantenimiento</option><option value="comidas">Comidas</option></select></label><button className="finance-primary" disabled={busy}><Check/>{busy?'Guardando...':'Agregar paso'}</button></form></div></div>}
 </section>
}

function GoalCard({goal,milestones,expanded,onExpand,onEdit,onStatus,onDelete,onToggleMilestone,onDeleteMilestone,onAddMilestone,onNavigate,readOnly=false}:{goal:Goal;milestones:Milestone[];expanded:boolean;onExpand:()=>void;onEdit:()=>void;onStatus:(s:GoalStatus)=>void;onDelete:()=>void;onToggleMilestone:(m:Milestone)=>void;onDeleteMilestone:(m:Milestone)=>void;onAddMilestone:()=>void;onNavigate:(tab:string)=>void;readOnly?:boolean}){
 const tone=paceTone(goal.pace_status),financial=goal.target_amount!=null&&Number(goal.target_amount)>0;
 return <article className={'planning-goal-card '+tone+' '+goal.status}><button className="planning-goal-summary" onClick={onExpand}><span className="planning-goal-icon">{goalIcon(goal.goal_type)}</span><div className="planning-goal-main"><div><small>{goalTypeLabel(goal.goal_type)} · {goal.horizon_months} {goal.horizon_months===1?'mes':'meses'}</small><strong>{goal.title}</strong></div><p>{goal.description||'Objetivo para '+fmtDate(goal.target_date)}</p><div className="planning-goal-progress"><span style={{width:Math.min(100,Math.max(3,goal.progress_pct))+'%'}}/></div><div className="planning-goal-progress-label"><span>{Math.round(goal.progress_pct)}% completado</span><b>{paceLabel(goal.pace_status)}</b></div></div><div className="planning-goal-date"><small>Objetivo</small><strong>{fmtDate(goal.target_date)}</strong><ChevronRight className={expanded?'open':''}/></div></button>
  {expanded&&<div className="planning-goal-details">
   <div className="planning-goal-numbers">{financial&&<><div><small>Avance</small><strong>{money(goal.current_amount)}</strong></div><div><small>Meta</small><strong>{money(Number(goal.target_amount))}</strong></div><div><small>Falta</small><strong>{money(goal.remaining)}</strong></div><div><small>Necesario / mes</small><strong>{money(Number(goal.required_monthly||0))}</strong></div></>}<div><small>Pasos</small><strong>{goal.milestone_done}/{goal.milestone_count}</strong></div><div><small>Prioridad</small><strong>{priorityLabel(goal.priority)}</strong></div></div>
   <div className="planning-milestones-head"><div><strong>Roadmap</strong><small>{goal.milestone_overdue?goal.milestone_overdue+' paso'+(goal.milestone_overdue===1?'':'s')+' vencido'+(goal.milestone_overdue===1?'':'s'):'Pasos hacia el objetivo'}</small></div>{!readOnly&&<button onClick={e=>{e.stopPropagation();onAddMilestone()}}><Plus/> Paso</button>}</div>
   <div className="planning-milestones">{milestones.map(m=><div key={m.id} className={m.status==='completed'?'done':m.due_date&&m.due_date<iso()?'late':''}><button disabled={readOnly} onClick={()=>onToggleMilestone(m)}>{m.status==='completed'?<Check/>:<span/>}</button><div><strong>{m.title}</strong><small>{fmtDate(m.due_date)}{m.estimated_amount!=null?' · '+money(Number(m.estimated_amount)):''}</small></div>{m.linked_tab&&<button className="go" onClick={()=>onNavigate(String(m.linked_tab))}><ArrowRight/></button>}{!readOnly&&<button className="delete" onClick={()=>onDeleteMilestone(m)}><Trash2/></button>}</div>)}</div>
   {!readOnly&&<div className="planning-goal-actions"><button onClick={onEdit}><Edit3/> Editar</button>{goal.status==='active'?<button onClick={()=>onStatus('paused')}><Pause/> Pausar</button>:goal.status==='paused'?<button onClick={()=>onStatus('active')}><TrendingUp/> Reactivar</button>:null}{goal.status!=='completed'&&<button className="complete" onClick={()=>onStatus('completed')}><CheckCircle2/> Completar</button>}<button className="danger" onClick={onDelete}><Trash2/> Eliminar</button></div>}
  </div>}
 </article>
}

function GoalModal({goal,savings,accounts,maintenance,events,busy,onClose,onSubmit}:{goal:Goal|null;savings:SavingGoal[];accounts:FinanceAccount[];maintenance:Maintenance[];events:EventRow[];busy:boolean;onClose:()=>void;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
 const [type,setType]=useState<GoalType>(goal?.goal_type||'saving'),[horizon,setHorizon]=useState<number>(goal?.horizon_months||3);
 const [targetDate,setTargetDate]=useState(goal?.target_date||addMonths(goal?.horizon_months||3));
 useEffect(()=>{if(!goal)setTargetDate(addMonths(horizon))},[horizon]);
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="finance-modal planning-modal"><div className="modal-head"><div><p className="eyebrow">PLANEACIÓN</p><h3>{goal?'Editar objetivo':'Nuevo objetivo'}</h3></div><button onClick={onClose}><X/></button></div><form className="finance-form" onSubmit={onSubmit}>
  <label>Objetivo<input name="title" defaultValue={goal?.title||''} placeholder="Ej. Fondo para vivienda" required/></label>
  <div className="two"><label>Tipo<select name="goal_type" value={type} onChange={e=>setType(e.target.value as GoalType)}><option value="saving">Ahorro</option><option value="travel">Viaje</option><option value="purchase">Compra</option><option value="housing">Vivienda</option><option value="vehicle">Vehículo</option><option value="debt">Deuda</option><option value="maintenance">Mantenimiento</option><option value="event">Evento</option><option value="home">Hogar</option><option value="other">Otro</option></select></label><label>Prioridad<select name="priority" defaultValue={goal?.priority||'medium'}><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select></label></div>
  <label>Descripción<input name="description" defaultValue={goal?.description||''} placeholder="Qué quieren lograr y por qué"/></label>
  <div className="planning-horizon-picker"><span>Horizonte</span>{([1,3,6,12] as const).map(h=><label key={h} className={horizon===h?'active':''}><input type="radio" name="horizon_months" value={h} checked={horizon===h} onChange={()=>setHorizon(h)}/><b>{h}</b><small>{h===1?'mes':'meses'}</small></label>)}</div>
  <label>Fecha objetivo<input name="target_date" type="date" min={iso()} value={targetDate} onChange={e=>setTargetDate(e.target.value)} required/></label>
  <div className="two"><label>Monto objetivo<input name="target_amount" type="number" min="0" step=".01" defaultValue={goal?.target_amount??''} placeholder="Opcional"/></label><label>Avance manual<input name="current_amount" type="number" min="0" step=".01" defaultValue={goal?.manual_current_amount??0} disabled={!!goal?.linked_savings_goal_id||!!goal?.linked_account_id}/></label></div>
  {(type==='saving'||type==='travel'||type==='purchase'||type==='housing'||type==='vehicle')&&<label>Vincular meta de ahorro<select name="linked_savings_goal_id" defaultValue={goal?.linked_savings_goal_id||''}><option value="">Sin vincular</option>{savings.map(g=><option key={g.id} value={g.id}>{g.name} · {money(Number(g.target_amount))}</option>)}</select></label>}
  {type==='debt'&&<label>Vincular deuda<select name="linked_account_id" defaultValue={goal?.linked_account_id||''}><option value="">Sin vincular</option>{accounts.filter(a=>a.account_class==='liability').map(a=><option key={a.id} value={a.id}>{a.name} · saldo inicial {money(Number(a.opening_balance))}</option>)}</select></label>}
  {type==='maintenance'&&<label>Vincular mantenimiento<select name="linked_maintenance_id" defaultValue={goal?.linked_maintenance_id||''}><option value="">Sin vincular</option>{maintenance.map(m=><option key={m.id} value={m.id}>{m.title}{m.next_due_date?' · '+fmtDate(m.next_due_date):''}</option>)}</select></label>}
  {type==='event'&&<label>Vincular evento<select name="linked_event_id" defaultValue={goal?.linked_event_id||''}><option value="">Sin vincular</option>{events.map(e=><option key={e.id} value={e.id}>{e.title} · {fmtDate(e.event_date)}</option>)}</select></label>}
  <label>Notas<textarea name="notes" rows={3} defaultValue={goal?.notes||''} placeholder="Condiciones, ideas o decisiones importantes"/></label>
  {!goal&&<div className="planning-auto-roadmap"><Sparkles/><div><strong>Roadmap automático</strong><small>Al crear el objetivo agregaremos tres pasos iniciales: preparación, revisión al 50% y cierre.</small></div></div>}
  <button className="finance-primary" disabled={busy}><Check/>{busy?'Guardando...':goal?'Guardar cambios':'Crear objetivo'}</button>
 </form></div></div>
}

function goalIcon(type:GoalType){if(type==='saving')return <CircleDollarSign/>;if(type==='travel')return <Plane/>;if(type==='housing')return <Building2/>;if(type==='vehicle')return <Car/>;if(type==='debt')return <CreditCard/>;if(type==='maintenance')return <ModuleIcon name="maintenance"/>;if(type==='event')return <ModuleIcon name="calendar"/>;if(type==='purchase')return <ReceiptText/>;if(type==='home')return <ModuleIcon name="home"/>;return <Target/>}
function goalTypeLabel(type:GoalType){return({saving:'Ahorro',travel:'Viaje',purchase:'Compra',housing:'Vivienda',vehicle:'Vehículo',debt:'Deuda',maintenance:'Mantenimiento',event:'Evento',home:'Hogar',other:'Otro'} as Record<string,string>)[type]||'Objetivo'}
function priorityLabel(p:Priority){return p==='high'?'Alta':p==='medium'?'Media':'Baja'}
function paceTone(p:PaceStatus){return p==='completed'||p==='on_track'?'good':p==='due_soon'?'soon':p==='at_risk'?'warning':'danger'}
function paceLabel(p:PaceStatus){return p==='completed'?'Completado':p==='on_track'?'En ruta':p==='due_soon'?'Próximo':p==='at_risk'?'En riesgo':'Vencido'}
