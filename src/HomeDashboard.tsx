import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,Bell,CalendarDays,CheckCircle2,ChevronRight,ClipboardCheck,Clock3,FileText,Gauge,HeartPulse,Home,ListChecks,Map as MapIcon,Package,PiggyBank,ReceiptText,Settings2,Target,TrendingUp,Users,Utensils,WalletCards,Wrench,Zap} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type FinanceHome={income:number;expense:number;saving:number;available:number;pending:number;projected:number;overdue:number;nextPayment:string|null;nextPaymentAmount:number;nextPaymentDate:string|null;goalName:string|null;goalProgress:number};
type Attention={id:string;type:string;severity:'info'|'warning'|'danger'|'success';title:string;body:string|null;action_tab:string|null;created_at:string};
type AgendaItem={id:string;kind:'event'|'task'|'payment'|'birthday';title:string;date:string;time:string|null;subtitle:string;tab:string};
type EventSource={id:string;title:string;event_date:string;start_time:string|null;location:string|null;event_type:string|null;recurrence:'none'|'weekly'|'monthly'|'yearly';recurrence_until:string|null};

const money=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:0}).format(n);
const iso=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const addDays=(d:Date,n:number)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const startOfDay=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const endOfWeek=()=>addDays(startOfDay(),6);
const severityRank=(s:string)=>s==='danger'?0:s==='warning'?1:s==='success'?2:3;

export default function HomeDashboard({household,finance,listCount,onNavigate}:{household:Household;finance:FinanceHome;listCount:number;onNavigate:(tab:string)=>void}){
 const [attention,setAttention]=useState<Attention[]>([]),[agenda,setAgenda]=useState<AgendaItem[]>([]),[firstName,setFirstName]=useState(''),[loading,setLoading]=useState(true);

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
  const [notificationR,taskR,eventR,occR,recR,memberR,profileR]=await Promise.all([
   supabase.from('notifications').select('id,type,severity,title,body,action_tab,created_at').eq('household_id',household.id).eq('user_id',user.id).is('read_at',null).neq('type','system').order('created_at',{ascending:false}).limit(20),
   supabase.from('list_items').select('id,text,due_date,assigned_to,completed').eq('household_id',household.id).eq('completed',false).gte('due_date',today).lte('due_date',weekEnd),
   supabase.from('events').select('id,title,event_date,start_time,location,event_type,recurrence,recurrence_until').eq('household_id',household.id).lte('event_date',weekEnd),
   supabase.from('recurring_transaction_occurrences').select('id,recurring_transaction_id,due_date,status').eq('household_id',household.id).eq('status','pending').gte('due_date',today).lte('due_date',weekEnd),
   supabase.from('recurring_transactions').select('id,description,amount,type').eq('household_id',household.id).eq('active',true),
   supabase.from('household_members').select('user_id').eq('household_id',household.id),
   supabase.from('profiles').select('id,full_name,birth_date').eq('id',user.id).maybeSingle()
  ]);
  const memberIds=(memberR.data||[]).map((m:any)=>m.user_id);
  const birthdaysR=memberIds.length?await supabase.from('profiles').select('id,full_name,birth_date').in('id',memberIds):{data:[] as any[]};
  setFirstName(String(profileR.data?.full_name||user.user_metadata?.full_name||'').trim().split(/\s+/)[0]||'');

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

 return <section className="home-dashboard home-control">
  <section className={'control-hero '+(urgent.length?'attention ':'')+(finance.projected<0?'risk':'')}>
   <div className="control-hero-copy"><p className="eyebrow">{greeting}{firstName?', '+firstName:''}</p><h2>{statusTitle}</h2><p>{statusCopy}</p><div className="control-hero-tags"><span><CalendarDays/> {todayItems.length} hoy</span><span><Clock3/> {weekCounts.payments} pagos esta semana</span><span><ListChecks/> {weekCounts.tasks} tareas</span></div></div>
   <button className="control-money" onClick={()=>onNavigate('presupuesto')}><small>CIERRE ESTIMADO</small><strong>{hasFinance?money(finance.projected):'—'}</strong><span className={finance.projected<0?'bad':'good'}>{finance.projected<0?'Revisar presupuesto':'Plan del mes'} <ChevronRight/></span></button>
  </section>

  <div className="control-finance-strip">
   <button onClick={()=>onNavigate('presupuesto')}><span className="control-finance-icon available"><WalletCards/></span><div><small>Disponible hoy</small><strong>{money(finance.available)}</strong><em>{finance.pending?money(finance.pending)+' comprometidos':'Sin compromisos'}</em></div></button>
   <button onClick={()=>onNavigate('presupuesto')}><span className="control-finance-icon saving"><PiggyBank/></span><div><small>Ahorro del mes</small><strong>{money(finance.saving)}</strong><em>{finance.goalName?finance.goalProgress+'% de '+finance.goalName:'Sin meta principal'}</em></div></button>
   <button onClick={()=>onNavigate('presupuesto')}><span className="control-finance-icon expense"><ReceiptText/></span><div><small>Gastado</small><strong>{money(finance.expense)}</strong><em>{finance.income?Math.round(finance.expense/finance.income*100)+'% de ingresos':'Sin ingresos registrados'}</em></div></button>
  </div>

  <section className="control-section">
   <div className="control-section-head"><div><p className="eyebrow">PRIORIDAD</p><h3>Necesita atención</h3></div><button onClick={()=>onNavigate('presupuesto')}>Ver finanzas <ChevronRight/></button></div>
   {urgent.length?<div className="attention-list">{urgent.slice(0,5).map(item=><button className={'attention-row '+item.severity} key={item.id} onClick={()=>openAttention(item)}><span>{attentionIcon(item.type)}</span><div><strong>{item.title}</strong><small>{item.body||'Requiere revisión'}</small></div><ChevronRight/></button>)}</div>:<div className="control-clear"><CheckCircle2/><div><strong>Todo bajo control</strong><span>No hay pagos, presupuestos o tareas urgentes.</span></div></div>}
  </section>

  <div className="control-two-columns">
   <section className="control-section">
    <div className="control-section-head"><div><p className="eyebrow">HOY</p><h3>{new Date().toLocaleDateString('es-GT',{weekday:'long',day:'numeric',month:'long'})}</h3></div><button onClick={()=>onNavigate('calendario')}>Agenda <ChevronRight/></button></div>
    {todayItems.length?<div className="today-list">{todayItems.slice(0,5).map(item=><AgendaRow key={item.id} item={item} onNavigate={onNavigate}/>)}</div>:<div className="control-empty"><CalendarDays/><strong>Día despejado</strong><span>No tienes actividades programadas para hoy.</span></div>}
   </section>

   <section className="control-section">
    <div className="control-section-head"><div><p className="eyebrow">ESTA SEMANA</p><h3>Lo próximo</h3></div><button onClick={()=>onNavigate('calendario')}>Calendario <ChevronRight/></button></div>
    <div className="week-summary"><div><CalendarDays/><strong>{weekCounts.events}</strong><span>eventos</span></div><div><ListChecks/><strong>{weekCounts.tasks}</strong><span>tareas</span></div><div><Clock3/><strong>{weekCounts.payments}</strong><span>pagos</span></div></div>
    {laterItems.length?<div className="week-upcoming">{laterItems.map(item=><AgendaRow key={item.id} item={item} onNavigate={onNavigate} compact/>)}</div>:<div className="control-empty small"><CheckCircle2/><span>No hay más compromisos esta semana.</span></div>}
   </section>
  </div>

  <section className="control-section quick-access-section">
   <div className="control-section-head"><div><p className="eyebrow">TU HOGAR</p><h3>Accesos rápidos</h3></div></div>
   <div className="control-module-grid">
    <button onClick={()=>onNavigate('salud')}><span className="health"><HeartPulse/></span><div><strong>Salud del hogar</strong><small>Diagnóstico y recomendaciones automáticas</small></div><ChevronRight/></button>
    <button onClick={()=>onNavigate('automatizaciones')}><span className="automations"><Zap/></span><div><strong>Automatizaciones</strong><small>Reglas, umbrales y acciones automáticas</small></div><ChevronRight/></button>
    <button onClick={()=>onNavigate('cierre')}><span className="monthly-close"><ClipboardCheck/></span><div><strong>Cierre mensual</strong><small>Resumen, comparación y objetivos del mes</small></div><ChevronRight/></button>
    <button onClick={()=>onNavigate('planeacion')}><span className="planning"><MapIcon/></span><div><strong>Planeación</strong><small>Objetivos de 1, 3, 6 y 12 meses</small></div><ChevronRight/></button>
    <button onClick={()=>onNavigate('presupuesto')}><span className="finance"><WalletCards/></span><div><strong>Finanzas</strong><small>Presupuesto, movimientos y comparación</small></div><ChevronRight/></button>
    <button onClick={()=>onNavigate('calendario')}><span className="calendar"><CalendarDays/></span><div><strong>Agenda</strong><small>Eventos, pagos y cumpleaños</small></div><ChevronRight/></button>
    <button onClick={()=>onNavigate('listas')}><span className="lists"><ListChecks/></span><div><strong>Listas</strong><small>{listCount} lista{listCount===1?'':'s'} compartida{listCount===1?'':'s'}</small></div><ChevronRight/></button>
    <button onClick={()=>onNavigate('familia')}><span className="family"><Users/></span><div><strong>Familia</strong><small>Perfiles y hogar compartido</small></div><ChevronRight/></button>
    <button onClick={()=>onNavigate('documentos')}><span className="documents"><FileText/></span><div><strong>Documentos</strong><small>Bóveda, vencimientos y garantías</small></div><ChevronRight/></button>
    <button onClick={()=>onNavigate('comidas')}><span className="meals"><Utensils/></span><div><strong>Comidas</strong><small>Plan semanal, recetas, despensa y compras</small></div><ChevronRight/></button>
    <button onClick={()=>onNavigate('mantenimiento')}><span className="maintenance"><Wrench/></span><div><strong>Mantenimiento</strong><small>Casa, vehículos, servicios y garantías</small></div><ChevronRight/></button>
   </div>
  </section>

  {loading&&<div className="home-control-loading"><span/></div>}
 </section>
}

function AgendaRow({item,onNavigate,compact=false}:{item:AgendaItem;onNavigate:(tab:string)=>void;compact?:boolean}){
 return <button className={'agenda-home-row '+(compact?'compact ':'')+item.kind} onClick={()=>onNavigate(item.tab)}><span className="agenda-home-icon">{agendaIcon(item.kind)}</span><div><strong>{item.title}</strong><small>{compact?formatDate(item.date)+' · ':''}{item.time?item.time+' · ':''}{item.subtitle}</small></div><ChevronRight/></button>
}

function attentionIcon(type:string){if(type==='payment')return <Clock3/>;if(type==='task')return <ListChecks/>;if(type==='event')return <CalendarDays/>;if(type==='birthday')return <Users/>;if(type==='budget')return <AlertTriangle/>;if(type==='goal')return <Target/>;if(type==='document')return <FileText/>;if(type==='maintenance')return <Wrench/>;if(type==='pantry')return <Package/>;if(type==='planning')return <MapIcon/>;return <Bell/>}
function agendaIcon(kind:AgendaItem['kind']){if(kind==='payment')return <Clock3/>;if(kind==='task')return <ListChecks/>;if(kind==='birthday')return <Users/>;return <CalendarDays/>}
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
