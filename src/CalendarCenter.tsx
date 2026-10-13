import {FormEvent,useEffect,useMemo,useState} from 'react';
import {Bell,CalendarDays,Check,ChevronLeft,ChevronRight,Clock3,MapPin,Pencil,Plus,ReceiptText,Repeat2,Trash2,Users,Wrench,X} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type Member={user_id:string;full_name:string;birth_date:string|null};
type EventCategory='family'|'appointment'|'task'|'birthday'|'social'|'health'|'school'|'maintenance'|'other';
type EventRow={id:string;title:string;description:string|null;event_date:string;start_time:string|null;end_time:string|null;event_type:string|null;location:string|null;category:EventCategory;assigned_to:string|null;all_day:boolean;recurrence:'none'|'weekly'|'monthly'|'yearly';recurrence_until:string|null;reminder_minutes:number|null};
type AgendaItem={id:string;source:'event'|'task'|'payment'|'birthday';title:string;date:string;time:string|null;category:string;subtitle:string;event?:EventRow;completed?:boolean};

const iso=(d:Date)=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const monthStart=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),1);
const monthEnd=(d:Date)=>new Date(d.getFullYear(),d.getMonth()+1,0);
const addDays=(d:Date,n:number)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const categoryLabel=(c:string)=>({family:'Familia',appointment:'Cita',task:'Tarea',birthday:'Cumpleaños',social:'Social',health:'Salud',school:'Estudios',maintenance:'Mantenimiento',other:'Otro'} as Record<string,string>)[c]||'Otro';

export default function CalendarCenter({household,onChanged,onNavigate}:{household:Household;onChanged?:()=>void;onNavigate?:(tab:string)=>void}){
 const [month,setMonth]=useState(()=>monthStart(new Date())),[events,setEvents]=useState<EventRow[]>([]),[members,setMembers]=useState<Member[]>([]),[agendaExtra,setAgendaExtra]=useState<AgendaItem[]>([]);
 const [selectedDay,setSelectedDay]=useState<string|null>(null),[editing,setEditing]=useState<EventRow|null>(null),[showForm,setShowForm]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 useEffect(()=>{load();const channel=supabase.channel('calendar-'+household.id).on('postgres_changes',{event:'*',schema:'public',table:'events',filter:'household_id=eq.'+household.id},()=>load(false)).subscribe();return()=>{supabase.removeChannel(channel)}},[household.id,month.getFullYear(),month.getMonth()]);

 async function load(showLoader=true){
  if(showLoader)setBusy(true);setMessage('');
  const start=iso(monthStart(month)),end=iso(monthEnd(month));
  const lookback=iso(new Date(month.getFullYear()-2,month.getMonth(),1));
  const [eventR,memberR,taskR,occR,recR]=await Promise.all([
   supabase.from('events').select('id,title,description,event_date,start_time,end_time,event_type,location,category,assigned_to,all_day,recurrence,recurrence_until,reminder_minutes').eq('household_id',household.id).lte('event_date',end).or(`recurrence.eq.none,recurrence_until.is.null,recurrence_until.gte.${start}`).gte('event_date',lookback).order('event_date'),
   supabase.from('household_members').select('user_id').eq('household_id',household.id),
   supabase.from('list_items').select('id,text,due_date,completed,assigned_to,list_id').eq('household_id',household.id).gte('due_date',start).lte('due_date',end),
   supabase.from('recurring_transaction_occurrences').select('id,recurring_transaction_id,due_date,status').eq('household_id',household.id).gte('due_date',start).lte('due_date',end),
   supabase.from('recurring_transactions').select('id,description,amount,type').eq('household_id',household.id).eq('active',true)
  ]);
  const ids=(memberR.data||[]).map((m:any)=>m.user_id);
  const profileR=ids.length?await supabase.from('profiles').select('id,full_name,birth_date').in('id',ids):{data:[] as any[]};
  const memberData=ids.map((id:string)=>{const p=(profileR.data||[]).find((x:any)=>x.id===id);return{user_id:id,full_name:p?.full_name||'Miembro',birth_date:p?.birth_date||null}});
  setMembers(memberData);setEvents((eventR.data||[]) as EventRow[]);
  const extras:AgendaItem[]=[];
  for(const task of (taskR.data||[]) as any[])extras.push({id:'task-'+task.id,source:'task',title:task.text,date:task.due_date,time:null,category:'task',subtitle:(task.completed?'Completada':'Pendiente')+(task.assigned_to?' · '+(memberData.find(m=>m.user_id===task.assigned_to)?.full_name||'Miembro'):''),completed:task.completed});
  const recMap=new Map(((recR.data||[]) as any[]).map(r=>[r.id,r]));
  for(const occ of (occR.data||[]) as any[]){const r:any=recMap.get(occ.recurring_transaction_id);if(!r)continue;extras.push({id:'pay-'+occ.id,source:'payment',title:r.description,date:occ.due_date,time:null,category:'payment',subtitle:(occ.status==='paid'?'Pagado':occ.status==='skipped'?'Omitido':occ.due_date<iso(new Date())?'Vencido':'Pendiente')+' · '+new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:0}).format(Number(r.amount))});}
  for(const m of memberData){if(!m.birth_date)continue;const parts=m.birth_date.split('-'),candidate=`${month.getFullYear()}-${parts[1]}-${parts[2]}`;if(candidate>=start&&candidate<=end)extras.push({id:'birthday-'+m.user_id,source:'birthday',title:'Cumpleaños de '+m.full_name,date:candidate,time:null,category:'birthday',subtitle:'Familia'});}
  setAgendaExtra(extras);if(eventR.error||taskR.error||occR.error)setMessage('No se pudo cargar toda la agenda.');if(showLoader)setBusy(false);
 }

 const eventOccurrences=useMemo(()=>expandEvents(events,month),[events,month]);
 const agenda=useMemo(()=>[...eventOccurrences.map(x=>({id:'event-'+x.key,source:'event' as const,title:x.event.title,date:x.date,time:x.event.all_day?null:x.event.start_time?.slice(0,5)||null,category:x.event.category,subtitle:[categoryLabel(x.event.category),x.event.assigned_to?members.find(m=>m.user_id===x.event.assigned_to)?.full_name:null,x.event.location].filter(Boolean).join(' · '),event:x.event})),...agendaExtra].sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99')),[eventOccurrences,agendaExtra,members]);
 const visibleAgenda=selectedDay?agenda.filter(a=>a.date===selectedDay):agenda;
 const calendarDays=useMemo(()=>{const first=monthStart(month),last=monthEnd(month),leading=(first.getDay()+6)%7;const cells:(Date|null)[]=Array(leading).fill(null);for(let d=1;d<=last.getDate();d++)cells.push(new Date(month.getFullYear(),month.getMonth(),d));while(cells.length%7)cells.push(null);return cells},[month]);

 async function saveEvent(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget),allDay=f.get('all_day')==='on';
  const payload={household_id:household.id,title:String(f.get('title')).trim(),description:String(f.get('description')||'').trim()||null,event_date:String(f.get('date')),start_time:allDay?null:String(f.get('start_time')||'')||null,end_time:allDay?null:String(f.get('end_time')||'')||null,location:String(f.get('location')||'').trim()||null,category:String(f.get('category')||'family'),assigned_to:String(f.get('assigned_to')||'')||null,all_day:allDay,recurrence:String(f.get('recurrence')||'none'),recurrence_until:String(f.get('recurrence_until')||'')||null,reminder_minutes:String(f.get('reminder_minutes')||'')?Number(f.get('reminder_minutes')):null};
  const result=editing?await supabase.from('events').update(payload).eq('id',editing.id).eq('household_id',household.id):await supabase.from('events').insert(payload);
  setBusy(false);if(result.error){setMessage(result.error.message);return}setEditing(null);setShowForm(false);await load(false);onChanged?.();
 }

 async function deleteEvent(event:EventRow){
  if(!window.confirm('¿Eliminar este evento?'))return;setBusy(true);const {error}=await supabase.from('events').delete().eq('id',event.id).eq('household_id',household.id);setBusy(false);if(error)setMessage(error.message);else{setEditing(null);setShowForm(false);await load(false);onChanged?.()}
 }

 function openEdit(event:EventRow){setEditing(event);setShowForm(true)}
 function newEvent(date?:string){setEditing(null);if(date)setSelectedDay(date);setShowForm(true)}
 function shiftMonth(n:number){setSelectedDay(null);setMonth(d=>new Date(d.getFullYear(),d.getMonth()+n,1))}

 return <section className="calendar-v2">
  <div className="finance-top"><div><p className="eyebrow">AGENDA FAMILIAR</p><h2 className="page-title">Calendario</h2><p className="muted">Eventos, tareas, cumpleaños y pagos en un mismo lugar.</p></div><button className="finance-new" onClick={()=>newEvent()}><Plus/> Evento</button></div>
  {message&&<div className="finance-message">{message}<button onClick={()=>setMessage('')}><X size={15}/></button></div>}

  <div className="calendar-layout">
   <div className="calendar-panel">
    <div className="calendar-month-head"><button onClick={()=>shiftMonth(-1)}><ChevronLeft/></button><div><strong>{month.toLocaleDateString('es-GT',{month:'long',year:'numeric'})}</strong><small>{agenda.length} elementos en agenda</small></div><button onClick={()=>shiftMonth(1)}><ChevronRight/></button></div>
    <div className="calendar-weekdays">{['L','M','M','J','V','S','D'].map((d,i)=><span key={i}>{d}</span>)}</div>
    <div className="calendar-grid">{calendarDays.map((d,i)=>{if(!d)return <span className="calendar-cell empty" key={i}/>;const date=iso(d),dayItems=agenda.filter(a=>a.date===date),isToday=date===iso(new Date()),selected=date===selectedDay;return <button key={date} className={'calendar-cell '+(isToday?'today ':'')+(selected?'selected':'')} onClick={()=>setSelectedDay(selected?null:date)} onDoubleClick={()=>newEvent(date)}><strong>{d.getDate()}</strong><div className="calendar-dots">{dayItems.slice(0,4).map(item=><i className={'dot '+item.source+' '+item.category} key={item.id}/>)}</div>{dayItems.length>4&&<small>+{dayItems.length-4}</small>}</button>})}</div>
    <div className="calendar-legend"><span><i className="dot event family"/> Evento</span><span><i className="dot task"/> Tarea</span><span><i className="dot payment"/> Pago</span><span><i className="dot birthday"/> Cumpleaños</span></div>
   </div>

   <div className="agenda-panel">
    <div className="agenda-head"><div><p className="eyebrow">{selectedDay?'DÍA SELECCIONADO':'MES COMPLETO'}</p><h3>{selectedDay?new Date(selectedDay+'T12:00').toLocaleDateString('es-GT',{weekday:'long',day:'numeric',month:'long'}):'Agenda'}</h3></div>{selectedDay&&<button onClick={()=>newEvent(selectedDay)}><Plus/> Agregar</button>}</div>
    <div className="agenda-list">{visibleAgenda.map(item=><article className={'agenda-item '+item.source} key={item.id} onClick={()=>item.source==='event'&&item.event&&openEdit(item.event)}>
      <span className="agenda-date"><strong>{new Date(item.date+'T12:00').getDate()}</strong><small>{new Date(item.date+'T12:00').toLocaleDateString('es-GT',{month:'short'})}</small></span>
      <div className="agenda-copy"><div><strong>{item.title}</strong><span className={'agenda-kind '+item.source}>{item.source==='event'?categoryLabel(item.category):item.source==='task'?'Tarea':item.source==='payment'?'Pago':'Cumpleaños'}</span></div><small>{item.time&&<><Clock3/> {item.time}</>} {item.subtitle}</small></div>
      {item.source==='event'&&<Pencil/>}{item.source==='payment'&&<button className="agenda-open" onClick={e=>{e.stopPropagation();onNavigate?.('presupuesto')}}><ReceiptText/></button>}{item.source==='task'&&item.completed&&<Check className="agenda-check"/>}
    </article>)}</div>
    {!visibleAgenda.length&&<div className="calendar-empty"><CalendarDays/><strong>Sin actividades</strong><span>No hay elementos para mostrar en este periodo.</span></div>}
   </div>
  </div>

  {showForm&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setShowForm(false);setEditing(null)}}}><div className="finance-modal calendar-modal"><div className="modal-head"><h3>{editing?'Editar evento':'Nuevo evento'}</h3><button onClick={()=>{setShowForm(false);setEditing(null)}}><X/></button></div><form className="finance-form" onSubmit={saveEvent}>
   <label>Título<input name="title" defaultValue={editing?.title||''} placeholder="Ej. Cena familiar" required/></label>
   <div className="two"><label>Categoría<select name="category" defaultValue={editing?.category||'family'}><option value="family">Familia</option><option value="appointment">Cita</option><option value="task">Tarea</option><option value="social">Social</option><option value="health">Salud</option><option value="school">Estudios</option><option value="maintenance">Mantenimiento</option><option value="other">Otro</option></select></label><label>Responsable<select name="assigned_to" defaultValue={editing?.assigned_to||''}><option value="">Todos / sin asignar</option>{members.map(m=><option value={m.user_id} key={m.user_id}>{m.full_name}</option>)}</select></label></div>
   <label>Fecha<input name="date" type="date" defaultValue={editing?.event_date||selectedDay||iso(new Date())} required/></label>
   <label className="check-line"><input name="all_day" type="checkbox" defaultChecked={editing?.all_day||false}/> Todo el día</label>
   <div className="two"><label>Hora inicio<input name="start_time" type="time" defaultValue={editing?.start_time?.slice(0,5)||''}/></label><label>Hora fin<input name="end_time" type="time" defaultValue={editing?.end_time?.slice(0,5)||''}/></label></div>
   <label>Ubicación<input name="location" defaultValue={editing?.location||''} placeholder="Opcional"/></label>
   <div className="two"><label>Repetir<select name="recurrence" defaultValue={editing?.recurrence||'none'}><option value="none">No repetir</option><option value="weekly">Cada semana</option><option value="monthly">Cada mes</option><option value="yearly">Cada año</option></select></label><label>Hasta<input name="recurrence_until" type="date" defaultValue={editing?.recurrence_until||''}/></label></div>
   <label>Recordatorio<select name="reminder_minutes" defaultValue={editing?.reminder_minutes==null?'':String(editing.reminder_minutes)}><option value="">Sin recordatorio</option><option value="0">A la hora del evento</option><option value="15">15 minutos antes</option><option value="30">30 minutos antes</option><option value="60">1 hora antes</option><option value="1440">1 día antes</option></select></label>
   <label>Descripción<textarea name="description" defaultValue={editing?.description||''} placeholder="Notas del evento"/></label>
   <button className="finance-primary" disabled={busy}>{busy?'Guardando...':editing?'Guardar cambios':'Crear evento'}</button>
   {editing&&<button type="button" className="calendar-delete" onClick={()=>deleteEvent(editing)}><Trash2/> Eliminar evento</button>}
  </form></div></div>}
 </section>
}

function expandEvents(events:EventRow[],month:Date){
 const start=monthStart(month),end=monthEnd(month),out:{key:string;date:string;event:EventRow}[]=[];
 for(const event of events){
  const base=new Date(event.event_date+'T12:00'),until=event.recurrence_until?new Date(event.recurrence_until+'T12:00'):end;
  if(event.recurrence==='none'){if(base>=start&&base<=end)out.push({key:event.id+'-'+event.event_date,date:event.event_date,event});continue}
  if(event.recurrence==='weekly'){let d=new Date(base);while(d<start)d=addDays(d,7);while(d<=end&&d<=until){out.push({key:event.id+'-'+iso(d),date:iso(d),event});d=addDays(d,7)}}
  if(event.recurrence==='monthly'){const day=base.getDate();const candidate=new Date(month.getFullYear(),month.getMonth(),Math.min(day,monthEnd(month).getDate()));if(candidate>=base&&candidate<=end&&candidate<=until)out.push({key:event.id+'-'+iso(candidate),date:iso(candidate),event})}
  if(event.recurrence==='yearly'){const candidate=new Date(month.getFullYear(),base.getMonth(),Math.min(base.getDate(),new Date(month.getFullYear(),base.getMonth()+1,0).getDate()));if(candidate.getMonth()===month.getMonth()&&candidate>=base&&candidate<=until)out.push({key:event.id+'-'+iso(candidate),date:iso(candidate),event})}
 }
 return out;
}
