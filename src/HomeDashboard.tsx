import WorkspaceHeading from './WorkspaceHeading';
import HomeAgenda from './HomeAgenda';
import type {DailyAgendaItem as AgendaItem} from './lib/dailyAgenda';
import HomeMoneyWorkspace from './HomeMoneyWorkspace';
import type {HomeFinance as FinanceHome} from './lib/homeOverview';
import HouseScene from './HouseScene';
import {moduleCatalog,type Appearance} from './lib/appearance';
import type {ModuleIconName} from './ModuleIcon';
import ModuleIcon from './ModuleIcon';
import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,Bell,CheckCircle2,ChevronRight,Clock3,Package,Target,ArrowUpRight,Palette,ChevronDown,Plus} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type Attention={id:string;type:string;severity:'info'|'warning'|'danger'|'success';title:string;body:string|null;action_tab:string|null;created_at:string};
type EventSource={id:string;title:string;event_date:string;start_time:string|null;location:string|null;event_type:string|null;recurrence:'none'|'weekly'|'monthly'|'yearly';recurrence_until:string|null;assigned_to:string|null;all_day:boolean};
type SetupState={profile:boolean;finance:boolean;lists:boolean;family:boolean;backup:boolean};

const money=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:0}).format(n);
const iso=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const addDays=(d:Date,n:number)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const startOfDay=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const endOfWeek=()=>addDays(startOfDay(),6);
const severityRank=(s:string)=>s==='danger'?0:s==='warning'?1:s==='success'?2:3;

export default function HomeDashboard({household,finance,listCount,access,onNavigate,appearance,onPersonalize,onRefresh}:{appearance:Appearance;onPersonalize:()=>void;onRefresh:()=>void;household:Household;finance:FinanceHome;listCount:number;access?:Record<string,'none'|'view'|'edit'>;onNavigate:(tab:string)=>void}){
 const request=useRef(0);
 const [agendaError,setAgendaError]=useState(''),[members,setMembers]=useState<{user_id:string;full_name:string}[]>([]);
 const accessKey=JSON.stringify(access||{});
 const can=(module:string)=>!access||access[module]!=='none';
 const [attention,setAttention]=useState<Attention[]>([]),[agenda,setAgenda]=useState<AgendaItem[]>([]),[firstName,setFirstName]=useState(''),[loading,setLoading]=useState(true);
 const [setup,setSetup]=useState<SetupState>({profile:false,finance:false,lists:false,family:false,backup:false});

 useEffect(()=>{let channel:any,active=true;(async()=>{
  await load();
  if(!active)return;
  const {data:{user}}=await supabase.auth.getUser();
  channel=supabase.channel('home-control-'+household.id)
   .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:user?('user_id=eq.'+user.id):undefined},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'list_items',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'meal_plan_entries',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'maintenance_schedules',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'events',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'recurring_transaction_occurrences',filter:'household_id=eq.'+household.id},()=>load(false))
   .subscribe();
 })();return()=>{active=false;request.current++;if(channel)supabase.removeChannel(channel)}},[household.id,accessKey]);

 async function load(showLoader=true){
  const currentRequest=++request.current;
  if(showLoader)setLoading(true);
  const {data:{user}}=await supabase.auth.getUser();
  if(currentRequest!==request.current)return;
  if(!user){setLoading(false);return}
  await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});
  const today=iso(),weekEnd=iso(endOfWeek());
  const [notificationR,taskR,eventR,occR,recR,memberR,profileR,accountR,backupR,mealR,recipeR,maintenanceR]=await Promise.all([
   supabase.from('notifications').select('id,type,severity,title,body,action_tab,created_at').eq('household_id',household.id).eq('user_id',user.id).is('read_at',null).neq('type','system').order('created_at',{ascending:false}).limit(20),
   can('lists')?supabase.from('list_items').select('id,text,due_date,assigned_to,completed').eq('household_id',household.id).eq('completed',false).lte('due_date',weekEnd):Promise.resolve({data:[] as any[],error:null}),
   can('calendar')?supabase.from('events').select('id,title,event_date,start_time,location,event_type,recurrence,recurrence_until,assigned_to,all_day').eq('household_id',household.id).lte('event_date',weekEnd):Promise.resolve({data:[] as any[],error:null}),
   can('finance')?supabase.from('recurring_transaction_occurrences').select('id,recurring_transaction_id,due_date,status').eq('household_id',household.id).eq('status','pending').lte('due_date',weekEnd):Promise.resolve({data:[] as any[],error:null}),
   can('finance')?supabase.from('recurring_transactions').select('id,description,amount,type,paid_by').eq('household_id',household.id).eq('active',true):Promise.resolve({data:[] as any[],error:null}),
   supabase.from('household_members').select('user_id').eq('household_id',household.id),
   supabase.from('profiles').select('id,full_name,birth_date,relationship').eq('id',user.id).maybeSingle(),
   can('finance')?supabase.from('finance_accounts').select('id').eq('household_id',household.id).eq('active',true).limit(1):Promise.resolve({data:[] as any[]}),
   can('backups')?supabase.from('household_backups').select('id').eq('household_id',household.id).limit(1):Promise.resolve({data:[] as any[]}),
   can('meals')?supabase.from('meal_plan_entries').select('id,meal_date,meal_type,recipe_id,custom_title,status').eq('household_id',household.id).eq('status','planned').gte('meal_date',today).lte('meal_date',weekEnd):Promise.resolve({data:[] as any[],error:null}),
   can('meals')?supabase.from('recipes').select('id,name').eq('household_id',household.id):Promise.resolve({data:[] as any[],error:null}),
   can('maintenance')?supabase.from('maintenance_schedules').select('id,title,next_due_date,assigned_to,calendar_event_id').eq('household_id',household.id).eq('active',true).lte('next_due_date',weekEnd):Promise.resolve({data:[] as any[],error:null})
  ]);
  const memberIds=(memberR.data||[]).map((m:any)=>m.user_id);
  const birthdaysR=memberIds.length?await supabase.from('profiles').select('id,full_name,birth_date').in('id',memberIds):{data:[] as any[]};
  if(currentRequest!==request.current)return;
  setAgendaError([taskR,eventR,occR,recR,mealR,recipeR,maintenanceR].some(r=>r.error)?'No se pudieron verificar todas las actividades. La agenda puede estar incompleta.':'');
  setMembers(memberIds.map((id:string)=>({user_id:id,full_name:(birthdaysR.data||[]).find((p:any)=>p.id===id)?.full_name||'Miembro'})));
  setFirstName(String(profileR.data?.full_name||user.user_metadata?.full_name||'').trim().split(/\s+/)[0]||'');
  setSetup({
   profile:Boolean(String(profileR.data?.full_name||'').trim()&&String(profileR.data?.relationship||'').trim()),
   finance:!can('finance')||Boolean(accountR.data?.length),
   lists:!can('lists')||listCount>0,
   family:(memberR.data||[]).length>1,
   backup:!can('backups')||Boolean(backupR.data?.length)
  });

  const rows=((notificationR.data||[]) as Attention[]).sort((a,b)=>severityRank(a.severity)-severityRank(b.severity)||new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
  setAttention(rows);

  const items:AgendaItem[]=[];
  for(const task of (taskR.data||[]) as any[])items.push({id:'task-'+task.id,kind:'task',title:task.text,date:task.due_date,time:null,subtitle:'Tarea',assignedTo:task.assigned_to,tab:'listas'});

  const recurringMap=new Map(((recR.data||[]) as any[]).map(r=>[r.id,r]));
  for(const occ of (occR.data||[]) as any[]){const recurring:any=recurringMap.get(occ.recurring_transaction_id);if(!recurring||recurring.type!=='expense')continue;items.push({id:'pay-'+occ.id,kind:'payment',title:recurring.description,date:occ.due_date,time:null,subtitle:money(Number(recurring.amount)),assignedTo:recurring.paid_by,tab:'presupuesto:recurring'})}

  const maintenanceEvents=new Set((maintenanceR.data||[]).map((m:any)=>m.calendar_event_id).filter(Boolean));
  for(const event of (eventR.data||[]) as EventSource[]){
   if(maintenanceEvents.has(event.id))continue;
   for(let d=startOfDay();d<=endOfWeek();d=addDays(d,1)){const date=iso(d);if(eventOccursOn(event,date))items.push({id:'event-'+event.id+'-'+date,kind:'event',title:event.title,date,time:event.all_day?null:event.start_time?.slice(0,5)||null,assignedTo:event.assigned_to,subtitle:event.location||(event.event_type==='maintenance'?'Mantenimiento':'Evento familiar'),tab:event.event_type==='maintenance'?'mantenimiento':'calendario'})}
  }

  for(const member of (birthdaysR.data||[]) as any[]){if(!member.birth_date)continue;const [,mm,dd]=String(member.birth_date).split('-');for(let d=startOfDay();d<=endOfWeek();d=addDays(d,1)){const date=iso(d);if(date.slice(5)===mm+'-'+dd)items.push({id:'birthday-'+member.id+'-'+date,kind:'birthday',title:'Cumpleaños de '+(member.full_name||'Miembro'),date,time:null,subtitle:'Familia',tab:'familia'})}}

  const recipeNames=new Map((recipeR.data||[]).map((r:any)=>[r.id,r.name]));
  const mealLabels:Record<string,string>={breakfast:'Desayuno',lunch:'Almuerzo',dinner:'Cena',snack:'Snack'};
  for(const meal of (mealR.data||[]) as any[])items.push({id:'meal-'+meal.id,kind:'meal',title:meal.custom_title||String(recipeNames.get(meal.recipe_id)||'Comida planificada'),date:meal.meal_date,time:null,subtitle:mealLabels[meal.meal_type]||'Comida',tab:'comidas'});
  for(const job of (maintenanceR.data||[]) as any[])items.push({id:'maintenance-'+job.id,kind:'maintenance',title:job.title,date:job.next_due_date,time:null,subtitle:'Mantenimiento',assignedTo:job.assigned_to,tab:'mantenimiento'});

  items.sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99'));
  setAgenda(items);
  if(showLoader)setLoading(false);
 }

 async function openAttention(item:Attention){
  await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',item.id);
  setAttention(current=>current.filter(x=>x.id!==item.id));
  if(item.action_tab)onNavigate(item.action_tab);
 }

 const today=iso();
 const urgent=attention.filter(x=>x.severity==='danger'||x.severity==='warning');
 const overdueItems=agenda.filter(x=>x.date<today);
 const greeting=greetingLabel();
 const setupSteps=[
  {key:'profile',done:setup.profile,title:'Completa tu perfil',detail:'Nombre, relación y datos básicos',tab:'familia',show:true},
  {key:'finance',done:setup.finance,title:'Agrega una cuenta',detail:'Efectivo, banco o tarjeta para empezar',tab:'presupuesto',show:can('finance')},
  {key:'lists',done:setup.lists,title:'Crea tu primera lista',detail:'Compras o tareas compartidas',tab:'listas',show:can('lists')},
  {key:'family',done:setup.family,title:'Invita a otra persona (opcional)',detail:'Tu hogar también funciona solo para ti',tab:'familia',show:setup.family},
  {key:'backup',done:setup.backup,title:'Crea un respaldo',detail:'Protege la configuración inicial',tab:'respaldos',show:can('backups')}
 ].filter(x=>x.show);
 const setupCompleted=setupSteps.filter(x=>x.done).length,showSetup=setupSteps.length>0&&setupCompleted<setupSteps.length;

 const availableModules=moduleCatalog.filter(m=>!('module'in m)||can(m.module));
 const favorites=appearance.favorites.map(tab=>availableModules.find(m=>m.tab===tab)).filter(Boolean) as typeof availableModules;
 const showFinance=can('finance')&&!finance.error;
 if(loading||(showFinance&&finance.loading))return <div className="studio-skeleton" role="status" aria-label="Cargando tu hogar"><span/><i/><div><b/><b/><b/></div><i/><i/></div>;
 const agendaView=<HomeAgenda items={agenda} members={members} today={today} end={iso(endOfWeek())} error={agendaError} refresh={()=>load(false)} onNavigate={onNavigate} canCalendar={can('calendar')}/>;
 const attentionView=<section className="premium-card premium-attention" aria-label="Prioridades del hogar"><div className="premium-card-head"><div><p className="eyebrow">TU SIGUIENTE PASO</p><h3>Lo importante hoy</h3></div><Bell size={19}/></div>{urgent.length?urgent.slice(0,3).map(item=><button className={'premium-attention-row '+item.severity} key={item.id} onClick={()=>openAttention(item)}><span>{attentionIcon(item.type)}</span><div><strong>{item.title}</strong>{item.body&&<small>{item.body}</small>}</div><ChevronRight size={16}/></button>):overdueItems.length?overdueItems.slice(0,3).map(item=><button className="premium-attention-row" key={item.id} onClick={()=>onNavigate(item.tab)}><span><Clock3 size={18}/></span><div><strong>{item.title}</strong><small>Pendiente de días anteriores</small></div><ChevronRight size={16}/></button>):<p className="premium-caption">{agendaError?'Hay actividades pendientes de verificar.':'No hay avisos urgentes registrados. Consulta tu agenda y tus próximos pagos.'}</p>}{can('finance')&&!finance.error&&finance.nextPayment&&<button className="premium-attention-row" onClick={()=>onNavigate('presupuesto:recurring')}><span><Clock3 size={18}/></span><div><strong>{finance.nextPayment}</strong><small>{finance.nextPaymentDate?new Date(finance.nextPaymentDate+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short'}):'Próximo pago'} · {money(finance.nextPaymentAmount)} · Recurrente pendiente</small></div><ChevronRight size={16}/></button>}{urgent.length>3&&<button className="premium-text-link" onClick={()=>window.dispatchEvent(new CustomEvent('nh:notifications'))}>Ver todos los avisos</button>}</section>;
 return <section className="home-dashboard home-control premium-home" data-focus={appearance.focus}>
  <WorkspaceHeading><div className="home-intro premium-intro"><div><p className="eyebrow">{greeting}{firstName?', '+firstName:''}</p><h2>{can('finance')?'Tu dinero, en perspectiva.':'Tu hogar, en perspectiva.'}</h2><p>Tu hogar y tus planes, conectados.</p></div><div className="premium-intro-actions"><button className="premium-personalize" aria-label="Personalizar mi espacio" onClick={onPersonalize}><Palette size={17}/></button>{access?.finance!=='view'&&can('finance')&&<button className="premium-register" onClick={()=>window.dispatchEvent(new CustomEvent('nh:quick-add'))}><Plus size={18}/> Registrar</button>}</div></div></WorkspaceHeading>
  {can('finance')&&finance.error&&<div className="workspace-status error" role="alert"><AlertTriangle size={20}/><p>{finance.error}</p><button type="button" onClick={onRefresh}>Reintentar</button></div>}
  {showFinance&&finance.source?<HomeMoneyWorkspace householdId={household.id} finance={finance} onNavigate={onNavigate} onRefresh={onRefresh} agenda={agendaView} attention={attentionView} canHealth={can('health')} cover={appearance.cover}/>:<div className="premium-home-without-finance"><section className="premium-card premium-welcome"><HouseScene/><div><p className="eyebrow">TU HOGAR, CONECTADO</p><h3>{household.name}</h3><p>Tu agenda, tus pendientes y los espacios que compartes.</p></div></section>{attentionView}{agendaView}</div>}
  <section className="home-favorites-section"><div className="control-section-head"><div><p className="eyebrow">A TU MANERA</p><h3>Tus favoritos</h3></div><button aria-label="Personalizar mi espacio" onClick={onPersonalize}>Editar <Palette size={15}/></button></div>{favorites.length?<div className="studio-favorites">{favorites.map(m=><button key={m.tab} className={'favorite-card module-'+m.icon} onClick={()=>onNavigate(m.tab)}><span><ModuleIcon name={m.icon as ModuleIconName} size={30}/></span><ArrowUpRight className="favorite-arrow" size={17}/><strong>{m.label}</strong><small>{m.detail}</small></button>)}</div>:<button className="home-see-more" onClick={onPersonalize}>Elige tus módulos favoritos <Palette size={16}/></button>}</section>
  <details className="control-section home-all-modules"><summary><span><p className="eyebrow">EXPLORA TU HOGAR</p><strong>Todos los espacios</strong></span><span>{availableModules.length} módulos <ChevronDown size={17}/></span></summary><div className="control-module-grid">{availableModules.map(m=><button key={m.tab} onClick={()=>onNavigate(m.tab)}><span className={m.icon}><ModuleIcon name={m.icon as ModuleIconName}/></span><div><strong>{m.label}</strong><small>{m.detail}</small></div><ChevronRight/></button>)}</div></details>
  {showSetup&&<details className="control-section home-setup-section"><summary><span><p className="eyebrow">TU PRÓXIMO PASO</p><strong>Prepara tu hogar</strong></span><span className="home-setup-count">{setupCompleted}/{setupSteps.length}<ChevronDown size={15}/></span></summary><div className="home-setup-progress"><span style={{width:Math.round(setupCompleted/setupSteps.length*100)+'%'}}/></div><div className="home-setup-list">{setupSteps.map((step,i)=><button key={step.key} className={step.done?'done':''} onClick={()=>!step.done&&onNavigate(step.tab)} disabled={step.done}><span>{step.done?<CheckCircle2/>:i+1}</span><div><strong>{step.title}</strong><small>{step.done?'Listo':step.detail}</small></div>{!step.done&&<ChevronRight/>}</button>)}</div></details>}
  <p className="home-signature"><ModuleIcon name="home" size={16}/> Hecho para compartir la vida.</p>
 </section>
}

function attentionIcon(type:string){if(type==='payment')return <Clock3/>;if(type==='task')return <ModuleIcon name="lists"/>;if(type==='event')return <ModuleIcon name="calendar"/>;if(type==='birthday')return <ModuleIcon name="family"/>;if(type==='budget')return <AlertTriangle/>;if(type==='goal')return <Target/>;if(type==='document')return <ModuleIcon name="documents"/>;if(type==='maintenance')return <ModuleIcon name="maintenance"/>;if(type==='pantry')return <Package/>;if(type==='planning')return <ModuleIcon name="planning"/>;return <Bell/>}
function greetingLabel(){const h=new Date().getHours();return h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches'}
function eventOccursOn(event:EventSource,target:string){
 if(target<event.event_date)return false;if(event.recurrence_until&&target>event.recurrence_until)return false;if(event.recurrence==='none')return target===event.event_date;
 const base=new Date(event.event_date+'T12:00'),date=new Date(target+'T12:00');
 if(event.recurrence==='weekly')return Math.round((date.getTime()-base.getTime())/86400000)%7===0;
 if(event.recurrence==='monthly')return date.getDate()===Math.min(base.getDate(),new Date(date.getFullYear(),date.getMonth()+1,0).getDate());
 if(event.recurrence==='yearly')return date.getMonth()===base.getMonth()&&date.getDate()===Math.min(base.getDate(),new Date(date.getFullYear(),base.getMonth()+1,0).getDate());
 return false;
}
