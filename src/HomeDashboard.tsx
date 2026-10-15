import BalanceFlow from './BalanceFlow';
import HouseScene from './HouseScene';
import {moduleCatalog,type Appearance} from './lib/appearance';
import type {ModuleIconName} from './ModuleIcon';
import ModuleIcon from './ModuleIcon';
import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,Bell,CheckCircle2,ChevronRight,Clock3,Package,PiggyBank,ReceiptText,Target,ArrowUpRight,Palette,ChevronDown,Sparkles} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type FinanceHome={income:number;expense:number;saving:number;available:number;pending:number;projected:number;overdue:number;nextPayment:string|null;nextPaymentAmount:number;nextPaymentDate:string|null;goalName:string|null;goalProgress:number};
type Attention={id:string;type:string;severity:'info'|'warning'|'danger'|'success';title:string;body:string|null;action_tab:string|null;created_at:string};
type AgendaItem={id:string;kind:'event'|'task'|'payment'|'birthday';title:string;date:string;time:string|null;subtitle:string;tab:string};
type EventSource={id:string;title:string;event_date:string;start_time:string|null;location:string|null;event_type:string|null;recurrence:'none'|'weekly'|'monthly'|'yearly';recurrence_until:string|null};
type SetupState={profile:boolean;finance:boolean;lists:boolean;family:boolean;backup:boolean};

const money=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:0}).format(n);
const iso=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const addDays=(d:Date,n:number)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const startOfDay=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const endOfWeek=()=>addDays(startOfDay(),6);
const severityRank=(s:string)=>s==='danger'?0:s==='warning'?1:s==='success'?2:3;

export default function HomeDashboard({household,finance,listCount,access,onNavigate,appearance,onPersonalize}:{appearance:Appearance;onPersonalize:()=>void;household:Household;finance:FinanceHome;listCount:number;access?:Record<string,'none'|'view'|'edit'>;onNavigate:(tab:string)=>void}){
 const [selectedDate,setSelectedDate]=useState(()=>iso());
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
   .on('postgres_changes',{event:'*',schema:'public',table:'events',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'*',schema:'public',table:'recurring_transaction_occurrences',filter:'household_id=eq.'+household.id},()=>load(false))
   .subscribe();
 })();return()=>{active=false;if(channel)supabase.removeChannel(channel)}},[household.id]);

 async function load(showLoader=true){
  if(showLoader)setLoading(true);
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setLoading(false);return}
  await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});
  const today=iso(),weekEnd=iso(endOfWeek());
  const [notificationR,taskR,eventR,occR,recR,memberR,profileR,accountR,backupR]=await Promise.all([
   supabase.from('notifications').select('id,type,severity,title,body,action_tab,created_at').eq('household_id',household.id).eq('user_id',user.id).is('read_at',null).neq('type','system').order('created_at',{ascending:false}).limit(20),
   supabase.from('list_items').select('id,text,due_date,assigned_to,completed').eq('household_id',household.id).eq('completed',false).gte('due_date',today).lte('due_date',weekEnd),
   supabase.from('events').select('id,title,event_date,start_time,location,event_type,recurrence,recurrence_until').eq('household_id',household.id).lte('event_date',weekEnd),
   supabase.from('recurring_transaction_occurrences').select('id,recurring_transaction_id,due_date,status').eq('household_id',household.id).eq('status','pending').gte('due_date',today).lte('due_date',weekEnd),
   supabase.from('recurring_transactions').select('id,description,amount,type').eq('household_id',household.id).eq('active',true),
   supabase.from('household_members').select('user_id').eq('household_id',household.id),
   supabase.from('profiles').select('id,full_name,birth_date,relationship').eq('id',user.id).maybeSingle(),
   can('finance')?supabase.from('finance_accounts').select('id').eq('household_id',household.id).eq('active',true).limit(1):Promise.resolve({data:[] as any[]}),
   can('backups')?supabase.from('household_backups').select('id').eq('household_id',household.id).limit(1):Promise.resolve({data:[] as any[]})
  ]);
  const memberIds=(memberR.data||[]).map((m:any)=>m.user_id);
  const birthdaysR=memberIds.length?await supabase.from('profiles').select('id,full_name,birth_date').in('id',memberIds):{data:[] as any[]};
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
  for(const task of (taskR.data||[]) as any[])items.push({id:'task-'+task.id,kind:'task',title:task.text,date:task.due_date,time:null,subtitle:task.assigned_to===user.id?'Asignada a ti':'Tarea compartida',tab:'listas'});

  const recurringMap=new Map(((recR.data||[]) as any[]).map(r=>[r.id,r]));
  for(const occ of (occR.data||[]) as any[]){const recurring:any=recurringMap.get(occ.recurring_transaction_id);if(!recurring||recurring.type!=='expense')continue;items.push({id:'pay-'+occ.id,kind:'payment',title:recurring.description,date:occ.due_date,time:null,subtitle:money(Number(recurring.amount)),tab:'presupuesto'})}

  for(const event of (eventR.data||[]) as EventSource[]){
   for(let d=startOfDay();d<=endOfWeek();d=addDays(d,1)){const date=iso(d);if(eventOccursOn(event,date))items.push({id:'event-'+event.id+'-'+date,kind:'event',title:event.title,date,time:event.start_time?.slice(0,5)||null,subtitle:event.location||(event.event_type==='maintenance'?'Mantenimiento':'Evento familiar'),tab:event.event_type==='maintenance'?'mantenimiento':'calendario'})}
  }

  for(const member of (birthdaysR.data||[]) as any[]){if(!member.birth_date)continue;const [,mm,dd]=String(member.birth_date).split('-');for(let d=startOfDay();d<=endOfWeek();d=addDays(d,1)){const date=iso(d);if(date.slice(5)===mm+'-'+dd)items.push({id:'birthday-'+member.id+'-'+date,kind:'birthday',title:'Cumpleaños de '+(member.full_name||'Miembro'),date,time:null,subtitle:'Familia',tab:'familia'})}}

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
 const todayItems=useMemo(()=>agenda.filter(item=>item.date===today),[agenda,today]);
 const laterItems=useMemo(()=>agenda.filter(item=>item.date>today).slice(0,5),[agenda,today]);
 const weekCounts=useMemo(()=>({events:agenda.filter(x=>x.kind==='event'||x.kind==='birthday').length,tasks:agenda.filter(x=>x.kind==='task').length,payments:agenda.filter(x=>x.kind==='payment').length}),[agenda]);
 const urgent=attention.filter(x=>x.severity==='danger'||x.severity==='warning');
 const hasFinance=Boolean(finance.income||finance.expense||finance.saving||finance.pending);
 const greeting=greetingLabel();
 const statusTitle=urgent.length?urgent.length+' asunto'+(urgent.length===1?'':'s')+' requieren atención':'Tu hogar está al día';
 const statusCopy=urgent.length?'Prioricé primero vencimientos, presupuesto y pendientes cercanos.':'No hay alertas urgentes. Puedes revisar lo programado para hoy y esta semana.';
 const setupSteps=[
  {key:'profile',done:setup.profile,title:'Completa tu perfil',detail:'Nombre, relación y datos básicos',tab:'familia',show:true},
  {key:'finance',done:setup.finance,title:'Agrega una cuenta',detail:'Efectivo, banco o tarjeta para empezar',tab:'presupuesto',show:can('finance')},
  {key:'lists',done:setup.lists,title:'Crea tu primera lista',detail:'Compras o tareas compartidas',tab:'listas',show:can('lists')},
  {key:'family',done:setup.family,title:'Invita a otra persona',detail:'Convierte el espacio en un hogar compartido',tab:'familia',show:true},
  {key:'backup',done:setup.backup,title:'Crea un respaldo',detail:'Protege la configuración inicial',tab:'respaldos',show:can('backups')}
 ].filter(x=>x.show);
 const setupCompleted=setupSteps.filter(x=>x.done).length,showSetup=setupSteps.length>0&&setupCompleted<setupSteps.length;

 const dates=Array.from({length:7},(_,i)=>addDays(startOfDay(),i));
 const selectedItems=agenda.filter(item=>item.date===selectedDate);
 const availableModules=moduleCatalog.filter(m=>!('module'in m)||can(m.module));
 const favorites=appearance.favorites.map(tab=>availableModules.find(m=>m.tab===tab)).filter(Boolean) as typeof availableModules;
 if(loading)return <div className="studio-skeleton" role="status" aria-label="Cargando tu hogar"><span/><i/><div><b/><b/><b/></div><i/><i/></div>;
 return <section className="home-dashboard home-control home-canvas" data-focus={appearance.focus}>
  <div className="home-intro"><div><p className="eyebrow">TU ESPACIO, CADA DÍA</p><h2>{greeting}{firstName?', '+firstName:''}<span>.</span></h2><p>Lo importante de tu hogar, en una sola mirada.</p></div><button onClick={onPersonalize}><Palette size={16}/><span>Personalizar</span></button></div>
  <section className={'control-hero studio-home-hero '+(urgent.length?'attention ':'')+(finance.projected<0?'risk':'')}>
   {appearance.cover&&<img className="home-cover" src={appearance.cover} alt=""/>}
   <div className="control-hero-copy"><p className="eyebrow">{can('finance')?'TU BALANCE DEL MES':'TU HOGAR, CONECTADO'}</p><h2>{can('finance')?money(finance.available):household.name}</h2><p>{can('finance')?'Balance de los movimientos registrados.':statusCopy}</p><div className="control-hero-tags"><span><ModuleIcon name="calendar"/> {todayItems.length} hoy</span><span><Clock3/> {weekCounts.payments} pagos esta semana</span></div>{can('finance')&&<button className="home-hero-link" onClick={()=>onNavigate('presupuesto:fortnight')}>Ver mi quincena <ArrowUpRight size={16}/></button>}</div>{can('finance')?<BalanceFlow income={finance.income} expense={finance.expense} saving={finance.saving} onOpen={()=>onNavigate('presupuesto:transactions')}/>:<div className="home-art"><HouseScene/></div>}
   {can('finance')&&<div className="home-hero-bottom"><span><i className={finance.projected<0?'risk':''}/>{hasFinance?'Cierre estimado':'Tu próximo comienzo'}</span><button type="button" onClick={()=>hasFinance?onNavigate('presupuesto:fortnight'):window.dispatchEvent(new CustomEvent('nh:quick-add'))}>{hasFinance?money(finance.projected):'Agrega tu primer movimiento'} <ArrowUpRight size={15}/></button></div>}
  </section>
  {can('finance')&&<div className="control-finance-strip studio-metrics">
   <button onClick={()=>onNavigate('presupuesto:income')}><span className="control-finance-icon available"><ArrowUpRight/></span><div><small>Ingresos</small><strong>{money(finance.income)}</strong><em>Registrados este mes</em></div></button>
   <button onClick={()=>onNavigate('presupuesto:transactions')}><span className="control-finance-icon expense"><ReceiptText/></span><div><small>Gastado</small><strong>{money(finance.expense)}</strong><em>{finance.income?Math.round(finance.expense/finance.income*100)+'% de ingresos':'Este mes'}</em></div></button>
   <button onClick={()=>onNavigate('presupuesto:goals')}><span className="control-finance-icon saving"><PiggyBank/></span><div><small>Ahorrado</small><strong>{money(finance.saving)}</strong><em>{finance.goalName?finance.goalProgress+'% de tu meta':'Para tus metas'}</em></div></button>
  </div>}
  <section className="home-priority-strip"><span className={urgent.length?'warning':'success'}>{urgent.length?<AlertTriangle size={19}/>:<CheckCircle2 size={19}/>}</span><div><strong>{urgent.length?statusTitle:'Todo bajo control'}</strong><small>{urgent.length?urgent[0].title:'Tus pendientes urgentes están al día.'}</small></div>{urgent.length>0&&<button onClick={()=>openAttention(urgent[0])}>Revisar <ChevronRight size={16}/></button>}</section>
  <section className="control-section studio-agenda">
   <div className="control-section-head"><div><p className="eyebrow">HAZ ESPACIO PARA LO IMPORTANTE</p><h3>Tu semana, de un vistazo</h3></div>{can('calendar')&&<button onClick={()=>onNavigate('calendario')}>Abrir agenda <ArrowUpRight size={16}/></button>}</div>
   <div className="home-week-picker" role="group" aria-label="Días de tu semana">{dates.map(date=>{const value=iso(date),count=agenda.filter(x=>x.date===value).length;return <button key={value} aria-pressed={selectedDate===value} aria-label={date.toLocaleDateString('es-GT',{weekday:'long',day:'numeric',month:'long'})+', '+count+' actividades'} onClick={()=>setSelectedDate(value)}><small>{date.toLocaleDateString('es-GT',{weekday:'short'}).replace('.','')}</small><strong>{date.getDate()}</strong><i className={count?'has-items':''}/></button>})}</div>
   {selectedItems.length?<div className="home-timeline">{selectedItems.slice(0,4).map(item=><AgendaRow key={item.id} item={item} onNavigate={onNavigate}/>) }{selectedItems.length>4&&can('calendar')&&<button className="home-see-more" onClick={()=>onNavigate('calendario')}>Ver las {selectedItems.length} actividades <ChevronRight size={15}/></button>}</div>:<div className="studio-agenda-empty"><span><ModuleIcon name="calendar" size={31}/></span><div><strong>Un poco de espacio para ustedes</strong><small>No hay actividades programadas para este día.</small></div>{can('calendar')&&<button onClick={()=>onNavigate('calendario')}>Organizar mi día <ArrowUpRight size={16}/></button>}</div>}
  </section>
  {can('finance')&&finance.goalName&&<button className="home-goal-preview" onClick={()=>onNavigate('presupuesto:goals')}><span className="studio-ring" style={{'--ring-progress':Math.max(0,Math.min(100,finance.goalProgress))+'%'} as React.CSSProperties}><Target size={22}/></span><div><p className="eyebrow">UN PASO MÁS CERCA</p><strong>{finance.goalName}</strong><small>{finance.goalProgress}% de tu meta completado</small></div><ArrowUpRight size={20}/></button>}
  <section className="home-favorites-section"><div className="control-section-head"><div><p className="eyebrow">A TU MANERA</p><h3>Tus favoritos</h3></div><button onClick={onPersonalize}>Editar <Palette size={15}/></button></div>{favorites.length?<div className="studio-favorites">{favorites.map(m=><button key={m.tab} className={'favorite-card module-'+m.icon} onClick={()=>onNavigate(m.tab)}><span><ModuleIcon name={m.icon as ModuleIconName} size={30}/></span><ArrowUpRight className="favorite-arrow" size={17}/><strong>{m.label}</strong><small>{m.detail}</small></button>)}</div>:<button className="home-see-more" onClick={onPersonalize}>Elige tus módulos favoritos <Palette size={16}/></button>}</section>
  <details className="control-section home-all-modules"><summary><span><p className="eyebrow">EXPLORA TU HOGAR</p><strong>Todos los espacios</strong></span><span>{availableModules.length} módulos <ChevronDown size={17}/></span></summary><div className="control-module-grid">{availableModules.map(m=><button key={m.tab} onClick={()=>onNavigate(m.tab)}><span className={m.icon}><ModuleIcon name={m.icon as ModuleIconName}/></span><div><strong>{m.label}</strong><small>{m.detail}</small></div><ChevronRight/></button>)}</div></details>
  {showSetup&&<details className="control-section home-setup-section"><summary><span><p className="eyebrow">TU PRÓXIMO PASO</p><strong>Prepara tu hogar</strong></span><span className="home-setup-count">{setupCompleted}/{setupSteps.length}<ChevronDown size={15}/></span></summary><div className="home-setup-progress"><span style={{width:Math.round(setupCompleted/setupSteps.length*100)+'%'}}/></div><div className="home-setup-list">{setupSteps.map((step,i)=><button key={step.key} className={step.done?'done':''} onClick={()=>!step.done&&onNavigate(step.tab)} disabled={step.done}><span>{step.done?<CheckCircle2/>:i+1}</span><div><strong>{step.title}</strong><small>{step.done?'Listo':step.detail}</small></div>{!step.done&&<ChevronRight/>}</button>)}</div></details>}
  <p className="home-signature"><ModuleIcon name="home" size={16}/> Hecho para compartir la vida.</p>
 </section>
}

function AgendaRow({item,onNavigate,compact=false}:{item:AgendaItem;onNavigate:(tab:string)=>void;compact?:boolean}){
 return <button className={'agenda-home-row '+(compact?'compact ':'')+item.kind} onClick={()=>onNavigate(item.tab)}><span className="agenda-home-icon">{agendaIcon(item.kind)}</span><div><strong>{item.title}</strong><small>{compact?formatDate(item.date)+' · ':''}{item.time?item.time+' · ':''}{item.subtitle}</small></div><ChevronRight/></button>
}

function attentionIcon(type:string){if(type==='payment')return <Clock3/>;if(type==='task')return <ModuleIcon name="lists"/>;if(type==='event')return <ModuleIcon name="calendar"/>;if(type==='birthday')return <ModuleIcon name="family"/>;if(type==='budget')return <AlertTriangle/>;if(type==='goal')return <Target/>;if(type==='document')return <ModuleIcon name="documents"/>;if(type==='maintenance')return <ModuleIcon name="maintenance"/>;if(type==='pantry')return <Package/>;if(type==='planning')return <ModuleIcon name="planning"/>;return <Bell/>}
function agendaIcon(kind:AgendaItem['kind']){if(kind==='payment')return <Clock3/>;if(kind==='task')return <ModuleIcon name="lists"/>;if(kind==='birthday')return <ModuleIcon name="family"/>;return <ModuleIcon name="calendar"/>}
function formatDate(value:string){const date=new Date(value+'T12:00');return date.toLocaleDateString('es-GT',{weekday:'short',day:'numeric'}).replace('.','')}
function greetingLabel(){const h=new Date().getHours();return h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches'}
function eventOccursOn(event:EventSource,target:string){
 if(target<event.event_date)return false;if(event.recurrence_until&&target>event.recurrence_until)return false;if(event.recurrence==='none')return target===event.event_date;
 const base=new Date(event.event_date+'T12:00'),date=new Date(target+'T12:00');
 if(event.recurrence==='weekly')return Math.round((date.getTime()-base.getTime())/86400000)%7===0;
 if(event.recurrence==='monthly')return date.getDate()===Math.min(base.getDate(),new Date(date.getFullYear(),date.getMonth()+1,0).getDate());
 if(event.recurrence==='yearly')return date.getMonth()===base.getMonth()&&date.getDate()===Math.min(base.getDate(),new Date(date.getFullYear(),base.getMonth()+1,0).getDate());
 return false;
}
