import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,Bell,BellRing,CalendarDays,Check,CheckCheck,Clock3,Settings,Target,Trash2,Users,WalletCards,X} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type NotificationRow={id:string;type:'payment'|'event'|'task'|'birthday'|'budget'|'goal'|'system';severity:'info'|'warning'|'danger'|'success';title:string;body:string|null;action_tab:string|null;entity_type:string|null;entity_id:string|null;read_at:string|null;created_at:string};
type Preferences={browser_notifications:boolean;payments:boolean;events:boolean;tasks:boolean;birthdays:boolean;budget:boolean;goals:boolean};

const defaults:Preferences={browser_notifications:false,payments:true,events:true,tasks:true,birthdays:true,budget:true,goals:true};

export default function NotificationCenter({household,onNavigate}:{household:Household;onNavigate:(tab:string)=>void}){
 const [items,setItems]=useState<NotificationRow[]>([]),[prefs,setPrefs]=useState<Preferences>(defaults),[userId,setUserId]=useState(''),[open,setOpen]=useState(false),[settings,setSettings]=useState(false),[message,setMessage]=useState('');
 const permission=typeof Notification==='undefined'?'unsupported':Notification.permission;
 const unread=useMemo(()=>items.filter(n=>!n.read_at).length,[items]);

 useEffect(()=>{let channel:any;let cancelled=false;(async()=>{
  const {data:{user}}=await supabase.auth.getUser();if(!user||cancelled)return;setUserId(user.id);
  await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});
  await load(user.id);
  channel=supabase.channel('notifications-'+user.id+'-'+household.id)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+user.id},payload=>{
    const row=payload.new as NotificationRow;if((row as any).household_id!==household.id)return;
    setItems(current=>[row,...current.filter(x=>x.id!==row.id)].slice(0,60));
    if(prefs.browser_notifications&&typeof Notification!=='undefined'&&Notification.permission==='granted'&&document.visibilityState!=='visible')showBrowserNotification(row);
   })
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'notifications',filter:'user_id=eq.'+user.id},payload=>{
    const row=payload.new as NotificationRow;setItems(current=>current.map(x=>x.id===row.id?row:x));
   }).subscribe();
 })();return()=>{cancelled=true;if(channel)supabase.removeChannel(channel)}},[household.id]);

 async function load(uid=userId){
  if(!uid)return;
  const [notificationR,prefR]=await Promise.all([
   supabase.from('notifications').select('id,type,severity,title,body,action_tab,entity_type,entity_id,read_at,created_at').eq('household_id',household.id).eq('user_id',uid).order('created_at',{ascending:false}).limit(60),
   supabase.from('notification_preferences').select('browser_notifications,payments,events,tasks,birthdays,budget,goals').eq('household_id',household.id).eq('user_id',uid).maybeSingle()
  ]);
  setItems((notificationR.data||[]) as NotificationRow[]);setPrefs((prefR.data||defaults) as Preferences);
 }

 async function showBrowserNotification(row:NotificationRow){
  if(!('serviceWorker' in navigator))return;
  const reg=await navigator.serviceWorker.ready;
  await reg.showNotification(row.title,{body:row.body||undefined,icon:import.meta.env.BASE_URL+'icon.svg',badge:import.meta.env.BASE_URL+'icon.svg',tag:'nh-'+row.id,data:{url:import.meta.env.BASE_URL+'?tab='+(row.action_tab||'inicio')}});
 }

 async function enableBrowser(){
  if(typeof Notification==='undefined'){setMessage('Este navegador no admite notificaciones del sistema.');return}
  const result=await Notification.requestPermission();
  if(result!=='granted'){setMessage('El permiso no fue concedido. Puedes habilitarlo desde la configuración del navegador.');return}
  await updatePrefs({browser_notifications:true});setMessage('Notificaciones del dispositivo activadas.');
 }

 async function updatePrefs(patch:Partial<Preferences>){
  if(!userId)return;const next={...prefs,...patch};setPrefs(next);
  const {error}=await supabase.from('notification_preferences').upsert({household_id:household.id,user_id:userId,...next,updated_at:new Date().toISOString()},{onConflict:'household_id,user_id'});
  if(error)setMessage(error.message);
 }

 async function openNotification(row:NotificationRow){
  if(!row.read_at){await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',row.id);setItems(current=>current.map(x=>x.id===row.id?{...x,read_at:new Date().toISOString()}:x))}
  setOpen(false);if(row.action_tab)onNavigate(row.action_tab);
 }

 async function markAll(){
  if(!userId||!unread)return;const stamp=new Date().toISOString();const {error}=await supabase.from('notifications').update({read_at:stamp}).eq('household_id',household.id).eq('user_id',userId).is('read_at',null);
  if(error){setMessage(error.message);return}setItems(current=>current.map(x=>({...x,read_at:x.read_at||stamp})));
 }

 async function clearRead(){
  if(!userId)return;const {error}=await supabase.from('notifications').delete().eq('household_id',household.id).eq('user_id',userId).not('read_at','is',null);
  if(error){setMessage(error.message);return}setItems(current=>current.filter(x=>!x.read_at));
 }

 return <div className="notification-center">
  <button className={'notification-bell '+(unread?'has-unread':'')} onClick={()=>setOpen(v=>!v)} aria-label="Notificaciones"><Bell/>{unread>0&&<span>{unread>99?'99+':unread}</span>}</button>
  {open&&<><button className="notification-scrim" onClick={()=>setOpen(false)} aria-label="Cerrar"/><aside className="notification-panel">
   <div className="notification-head"><div><p className="eyebrow">CENTRO DE ALERTAS</p><h3>Notificaciones</h3></div><div><button title="Configuración" onClick={()=>setSettings(v=>!v)}><Settings/></button><button title="Cerrar" onClick={()=>setOpen(false)}><X/></button></div></div>
   {message&&<div className="notification-message">{message}<button onClick={()=>setMessage('')}><X/></button></div>}
   {settings?<div className="notification-settings">
    <div className="notification-device"><div><BellRing/><span><strong>Notificaciones del dispositivo</strong><small>{permission==='granted'?'Permitidas':permission==='denied'?'Bloqueadas por el navegador':'Aún no activadas'}</small></span></div>{permission==='granted'?<label className="switch"><input type="checkbox" checked={prefs.browser_notifications} onChange={e=>updatePrefs({browser_notifications:e.target.checked})}/><span/></label>:<button onClick={enableBrowser}>Activar</button>}</div>
    <Preference label="Pagos y vencimientos" checked={prefs.payments} onChange={v=>updatePrefs({payments:v})}/>
    <Preference label="Eventos" checked={prefs.events} onChange={v=>updatePrefs({events:v})}/>
    <Preference label="Tareas" checked={prefs.tasks} onChange={v=>updatePrefs({tasks:v})}/>
    <Preference label="Cumpleaños" checked={prefs.birthdays} onChange={v=>updatePrefs({birthdays:v})}/>
    <Preference label="Presupuesto" checked={prefs.budget} onChange={v=>updatePrefs({budget:v})}/>
    <Preference label="Metas" checked={prefs.goals} onChange={v=>updatePrefs({goals:v})}/>
    <p className="notification-note">El centro de alertas se actualiza automáticamente desde el servidor. Las notificaciones del dispositivo se muestran cuando el navegador/PWA mantiene una sesión activa.</p>
   </div>:<>
    <div className="notification-toolbar"><span>{unread?unread+' sin leer':'Todo al día'}</span><div><button disabled={!unread} onClick={markAll}><CheckCheck/> Marcar todo</button><button onClick={clearRead}><Trash2/> Limpiar leídas</button></div></div>
    <div className="notification-list">{items.map(row=><button className={'notification-item '+row.severity+' '+(!row.read_at?'unread':'')} key={row.id} onClick={()=>openNotification(row)}><span className="notification-type-icon">{notificationIcon(row.type)}</span><div><div><strong>{row.title}</strong>{!row.read_at&&<i/>}</div>{row.body&&<p>{row.body}</p>}<small>{relativeTime(row.created_at)}</small></div></button>)}</div>
    {!items.length&&<div className="notification-empty"><Bell/><strong>Todo bajo control</strong><span>No hay alertas pendientes para este hogar.</span></div>}
   </>}
  </aside></>}
 </div>
}

function Preference({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="notification-pref"><span>{label}</span><span className="switch"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span/></span></label>}
function notificationIcon(type:string){if(type==='payment')return <Clock3/>;if(type==='event')return <CalendarDays/>;if(type==='task')return <Check/>;if(type==='birthday')return <Users/>;if(type==='budget')return <WalletCards/>;if(type==='goal')return <Target/>;return <AlertTriangle/>}
function relativeTime(value:string){const diff=Math.max(0,Date.now()-new Date(value).getTime()),minutes=Math.floor(diff/60000);if(minutes<1)return'Ahora';if(minutes<60)return'Hace '+minutes+' min';const hours=Math.floor(minutes/60);if(hours<24)return'Hace '+hours+' h';const days=Math.floor(hours/24);return'Hace '+days+' día'+(days===1?'':'s')}
