import {maskAmountsIn} from './lib/money';
import ModuleIcon from './ModuleIcon';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AlertTriangle,ArrowLeft,Bell,BellRing,Check,CheckCheck,Clock3,Package,Settings,Target,Trash2,X} from 'lucide-react';
import {supabase} from './lib/supabase';
import './notifications.css';

type Household={id:string;name:string;invite_code:string};
type NotificationRow={id:string;type:'payment'|'event'|'task'|'birthday'|'budget'|'goal'|'document'|'maintenance'|'pantry'|'planning'|'system';severity:'info'|'warning'|'danger'|'success';title:string;body:string|null;action_tab:string|null;entity_type:string|null;entity_id:string|null;read_at:string|null;created_at:string};
type Preferences={browser_notifications:boolean;payments:boolean;events:boolean;tasks:boolean;birthdays:boolean;budget:boolean;goals:boolean;documents:boolean;maintenance:boolean;pantry:boolean;planning:boolean};

const defaults:Preferences={browser_notifications:false,payments:true,events:true,tasks:true,birthdays:true,budget:true,goals:true,documents:true,maintenance:true,pantry:true,planning:true};
const pageSize=50;
const notificationColumns='id,type,severity,title,body,action_tab,entity_type,entity_id,read_at,created_at';

export default function NotificationCenter({household,onNavigate}:{household:Household;onNavigate:(tab:string)=>void}){
 const [items,setItems]=useState<NotificationRow[]>([]),[prefs,setPrefs]=useState<Preferences>(defaults),[userId,setUserId]=useState(''),[open,setOpen]=useState(false),[settings,setSettings]=useState(false),[message,setMessage]=useState('');
 const [total,setTotal]=useState(0),[unreadTotal,setUnreadTotal]=useState(0),[loadingMore,setLoadingMore]=useState(false),[loading,setLoading]=useState(true);
 const [historyError,setHistoryError]=useState('');
 const root=useRef<HTMLDivElement>(null),panel=useRef<HTMLElement>(null),bell=useRef<HTMLButtonElement>(null),scope=useRef(household.id);scope.current=household.id;
 const countRequest=useRef(0),loadRequest=useRef(0),userRef=useRef('');userRef.current=userId;const loadedCount=useRef(0);loadedCount.current=items.length;
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('nh:notifications',show);return()=>window.removeEventListener('nh:notifications',show)},[]);
 const permission=typeof Notification==='undefined'?'unsupported':Notification.permission;
 const unread=useMemo(()=>Math.max(unreadTotal,items.filter(n=>!n.read_at).length),[items,unreadTotal]);
 useEffect(()=>{panel.current?.querySelector('.notification-scroll')?.scrollTo({top:0})},[settings,open]);

 useEffect(()=>{
  if(!open)return;
  panel.current?.querySelector<HTMLButtonElement>('.notification-head button')?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setOpen(false);return}
   if(event.key!=='Tab')return;
   const buttons=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')||[]).filter(el=>el.getClientRects().length),first=buttons[0],last=buttons[buttons.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
  };
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);bell.current?.focus()};
 },[open]);

 useEffect(()=>{let channel:any;let cancelled=false;(async()=>{
  const {data:{user}}=await supabase.auth.getUser();if(!user||cancelled)return;setUserId(user.id);
  await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});
  await load(user.id);
  if(cancelled)return;
  channel=supabase.channel('notifications-'+user.id+'-'+household.id)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+user.id},payload=>{
    const row=payload.new as NotificationRow;if((row as any).household_id!==household.id)return;
    setItems(current=>[row,...current.filter(x=>x.id!==row.id)]);setTotal(current=>current+1);if(!row.read_at)setUnreadTotal(current=>current+1);
    if(prefs.browser_notifications&&typeof Notification!=='undefined'&&Notification.permission==='granted'&&document.visibilityState!=='visible')showBrowserNotification(row);
   })
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'notifications',filter:'user_id=eq.'+user.id},payload=>{
    const row=payload.new as NotificationRow;if((row as any).household_id&&(row as any).household_id!==household.id)return;
    setItems(current=>current.map(x=>x.id===row.id?row:x));void refreshCounts(user.id);
   })
   .on('postgres_changes',{event:'DELETE',schema:'public',table:'notifications',filter:'user_id=eq.'+user.id},payload=>{
    const id=(payload.old as any)?.id;if(id)setItems(current=>current.filter(x=>x.id!==id));void refreshCounts(user.id);
   }).subscribe();
 })();return()=>{cancelled=true;if(channel)supabase.removeChannel(channel)}},[household.id,prefs.browser_notifications]);

 /** Re-reads the unread and total counts (the bell badge) after a notification is read or deleted elsewhere. */
 async function refreshCounts(uid=userRef.current){
  if(!uid)return;const householdId=household.id,req=++countRequest.current;
  const [unreadR,totalR]=await Promise.all([
   supabase.from('notifications').select('id',{count:'exact',head:true}).eq('household_id',householdId).eq('user_id',uid).is('read_at',null),
   supabase.from('notifications').select('id',{count:'exact',head:true}).eq('household_id',householdId).eq('user_id',uid)
  ]);
  if(scope.current!==householdId||req!==countRequest.current)return;
  if(!unreadR.error&&unreadR.count!=null)setUnreadTotal(unreadR.count);if(!totalR.error&&totalR.count!=null)setTotal(totalR.count);
 }
 useEffect(()=>{const changed=()=>{if(userRef.current)void load(userRef.current,true)};window.addEventListener('nh:notifications-changed',changed);return()=>window.removeEventListener('nh:notifications-changed',changed)},[household.id]);

 async function load(uid=userId,silent=false){
  if(!uid)return;
  const householdId=household.id,req=++loadRequest.current;countRequest.current++;if(!silent)setLoading(true);setHistoryError('');
  const [notificationR,prefR,unreadR]=await Promise.all([
   supabase.from('notifications').select(notificationColumns,{count:'exact'}).eq('household_id',householdId).eq('user_id',uid).order('created_at',{ascending:false}).order('id',{ascending:false}).range(0,(silent?Math.max(pageSize,loadedCount.current):pageSize)-1),
   supabase.from('notification_preferences').select('browser_notifications,payments,events,tasks,birthdays,budget,goals,documents,maintenance,pantry,planning').eq('household_id',household.id).eq('user_id',uid).maybeSingle(),
   supabase.from('notifications').select('id',{count:'exact',head:true}).eq('household_id',householdId).eq('user_id',uid).is('read_at',null)
  ]);
  if(scope.current!==householdId||req!==loadRequest.current)return;
  if(notificationR.error)setMessage('No se pudieron cargar las notificaciones. Intenta de nuevo.');
  setItems((notificationR.data||[]) as NotificationRow[]);setTotal(notificationR.count??notificationR.data?.length??0);setUnreadTotal(unreadR.count??0);setPrefs((prefR.data||defaults) as Preferences);setLoading(false);
 }

 async function loadMore(){
  if(loadingMore||loading||!userId)return;const householdId=household.id;setLoadingMore(true);setHistoryError('');
  try{
   const {data,count,error}=await supabase.from('notifications').select(notificationColumns,{count:'exact'}).eq('household_id',householdId).eq('user_id',userId).order('created_at',{ascending:false}).order('id',{ascending:false}).range(items.length,items.length+pageSize-1);
   if(scope.current!==householdId)return;
   if(error)throw error;
   setItems(current=>[...current,...(data||[]).filter(row=>!current.some(existing=>existing.id===row.id))] as NotificationRow[]);if(count!==null)setTotal(count);
  }catch{if(scope.current===householdId)setHistoryError('No se pudieron cargar las anteriores. Puedes intentarlo de nuevo.')}
  finally{setLoadingMore(false)}
 }

 async function showBrowserNotification(row:NotificationRow){
  if(!('serviceWorker' in navigator))return;
  const reg=await navigator.serviceWorker.ready;
  await reg.showNotification(row.title,{body:row.body||undefined,icon:import.meta.env.BASE_URL+'icon.svg',badge:import.meta.env.BASE_URL+'icon.svg',tag:'nh-'+row.id,data:{url:import.meta.env.BASE_URL+'?tab='+(row.action_tab||'inicio')}});
 }

 async function ensurePushSubscription(){
  if(!('serviceWorker' in navigator)){throw new Error('Este navegador no admite Service Worker.')}
  const reg=await navigator.serviceWorker.ready;
  if(!('pushManager' in reg)){throw new Error('Este navegador no admite notificaciones push.')}
  const {data:publicKey,error:keyError}=await supabase.rpc('get_web_push_public_key');
  if(keyError||!publicKey)throw new Error(keyError?.message||'La clave de notificaciones aún no está disponible. Intenta de nuevo en unos segundos.');
  let subscription=await reg.pushManager.getSubscription();
  if(!subscription){
   subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(String(publicKey))});
  }
  const json=subscription.toJSON(),keys=json.keys;
  if(!json.endpoint||!keys?.p256dh||!keys?.auth)throw new Error('No se pudo registrar este dispositivo.');
  const {error}=await supabase.from('push_subscriptions').upsert({
   household_id:household.id,user_id:userId,endpoint:json.endpoint,p256dh:keys.p256dh,auth:keys.auth,user_agent:navigator.userAgent,enabled:true,last_seen_at:new Date().toISOString()
  },{onConflict:'endpoint'});
  if(error)throw error;
 }

 async function enableBrowser(){
  if(typeof Notification==='undefined'){setMessage('Este navegador no admite notificaciones del sistema.');return}
  const result=await Notification.requestPermission();
  if(result!=='granted'){setMessage('El permiso no fue concedido. Puedes habilitarlo desde la configuración del navegador.');return}
  try{await ensurePushSubscription();await updatePrefs({browser_notifications:true});setMessage('Notificaciones push activadas. También llegarán con Nuestro Hogar cerrado.')}
  catch(error:any){setMessage(error?.message||'No se pudo activar el dispositivo.')}
 }

 async function toggleDeviceNotifications(enabled:boolean){
  if(!enabled){await updatePrefs({browser_notifications:false});setMessage('Notificaciones del dispositivo pausadas.');return}
  if(typeof Notification==='undefined'||Notification.permission!=='granted'){await enableBrowser();return}
  try{await ensurePushSubscription();await updatePrefs({browser_notifications:true});setMessage('Notificaciones push activadas.')}
  catch(error:any){setMessage(error?.message||'No se pudo activar el dispositivo.')}
 }

 async function updatePrefs(patch:Partial<Preferences>){
  if(!userId)return;const next={...prefs,...patch};setPrefs(next);
  const {error}=await supabase.from('notification_preferences').upsert({household_id:household.id,user_id:userId,...next,updated_at:new Date().toISOString()},{onConflict:'household_id,user_id'});
  if(error)setMessage(error.message);
 }

 async function openNotification(row:NotificationRow){
  if(!row.read_at){const stamp=new Date().toISOString();const {error}=await supabase.from('notifications').update({read_at:stamp}).eq('id',row.id);if(error){setMessage(error.message);return}setItems(current=>current.map(x=>x.id===row.id?{...x,read_at:stamp}:x));setUnreadTotal(current=>Math.max(0,current-1))}
  setOpen(false);if(row.action_tab)onNavigate(row.action_tab);
 }

 async function markAll(){
  if(!userId||!unread)return;const stamp=new Date().toISOString();const {error}=await supabase.from('notifications').update({read_at:stamp}).eq('household_id',household.id).eq('user_id',userId).is('read_at',null);
  if(error){setMessage(error.message);return}setItems(current=>current.map(x=>({...x,read_at:x.read_at||stamp})));setUnreadTotal(0);
 }

 async function clearRead(){
  if(!userId)return;const {error}=await supabase.from('notifications').delete().eq('household_id',household.id).eq('user_id',userId).not('read_at','is',null);
  if(error){setMessage(error.message);return}await load();
 }

 return <div className="notification-center" ref={root}>
  <button ref={bell} className={'notification-bell '+(unread?'has-unread':'')} onClick={()=>{setSettings(false);if(!open)void load();setOpen(v=>!v)}} aria-label="Notificaciones" aria-expanded={open} aria-haspopup="dialog"><Bell/>{unread>0&&<span>{unread>99?'99+':unread}</span>}</button>
  {open&&createPortal(<><button className="notification-scrim" onClick={()=>setOpen(false)} aria-label="Cerrar notificaciones" tabIndex={-1}/><aside ref={panel} className="notification-panel notification-panel--expanded" role="dialog" aria-modal="true" aria-labelledby="notification-title">
   <div className="notification-head"><div><p className="eyebrow">CENTRO DE ALERTAS</p><h3 id="notification-title">{settings?'Configurar alertas':'Notificaciones'}</h3></div><div><button aria-label={settings?'Volver a notificaciones':'Configurar notificaciones'} title={settings?'Volver a notificaciones':'Configuración'} aria-pressed={settings} onClick={()=>setSettings(v=>!v)}>{settings?<ArrowLeft/>:<Settings/>}</button><button aria-label="Cerrar notificaciones" title="Cerrar" onClick={()=>setOpen(false)}><X/></button></div></div>
   <div className="notification-scroll" tabIndex={0} aria-label={settings?'Preferencias de alertas':'Lista de notificaciones'}>
   {message&&<div className="notification-message">{message}<button onClick={()=>setMessage('')}><X/></button></div>}
   {settings?<div className="notification-settings">
    <div className="notification-device"><div><BellRing/><span><strong>Notificaciones del dispositivo</strong><small>{permission==='granted'?'Permitidas':permission==='denied'?'Bloqueadas por el navegador':'Aún no activadas'}</small></span></div>{permission==='granted'?<label className="switch"><input type="checkbox" checked={prefs.browser_notifications} onChange={e=>toggleDeviceNotifications(e.target.checked)}/><span/></label>:<button onClick={enableBrowser}>Activar</button>}</div>
    <Preference label="Pagos y vencimientos" checked={prefs.payments} onChange={v=>updatePrefs({payments:v})}/>
    <Preference label="Eventos" checked={prefs.events} onChange={v=>updatePrefs({events:v})}/>
    <Preference label="Tareas" checked={prefs.tasks} onChange={v=>updatePrefs({tasks:v})}/>
    <Preference label="Cumpleaños" checked={prefs.birthdays} onChange={v=>updatePrefs({birthdays:v})}/>
    <Preference label="Presupuesto" checked={prefs.budget} onChange={v=>updatePrefs({budget:v})}/>
    <Preference label="Metas" checked={prefs.goals} onChange={v=>updatePrefs({goals:v})}/>
    <Preference label="Documentos y vencimientos" checked={prefs.documents} onChange={v=>updatePrefs({documents:v})}/>
    <Preference label="Mantenimiento y garantías" checked={prefs.maintenance} onChange={v=>updatePrefs({maintenance:v})}/>
    <Preference label="Despensa y alimentos" checked={prefs.pantry} onChange={v=>updatePrefs({pantry:v})}/>
    <Preference label="Planeación y objetivos" checked={prefs.planning} onChange={v=>updatePrefs({planning:v})}/>
    <p className="notification-note">El centro de alertas se actualiza desde el servidor. Con el permiso activado, este dispositivo puede recibir avisos push incluso cuando Nuestro Hogar está cerrado. En iPhone/iPad, instala primero la app en la pantalla de inicio.</p>
   </div>:<>
    <div className="notification-toolbar"><span>{unread?unread+' sin leer':'Todo al día'}</span><div><button disabled={!unread} onClick={markAll}><CheckCheck/> Marcar todo</button><button onClick={clearRead}><Trash2/> Limpiar leídas</button></div></div>
    {loading&&<p className="notification-note" role="status">Cargando notificaciones…</p>}
    <div className="notification-list">{items.map(row=><button className={'notification-item '+row.severity+' '+(!row.read_at?'unread':'')} key={row.id} onClick={()=>openNotification(row)}><span className="notification-type-icon">{notificationIcon(row.type)}</span><div><div><strong>{maskAmountsIn(row.title)}</strong>{!row.read_at&&<i/>}</div>{row.body&&<p>{maskAmountsIn(row.body)}</p>}<small>{relativeTime(row.created_at)}</small></div></button>)}</div>
    {!loading&&!items.length&&<div className="notification-empty"><Bell/><strong>Todo bajo control</strong><span>No hay alertas pendientes para este hogar.</span></div>}
    {items.length>0&&<div className="notification-history"><span>{items.length} de {Math.max(total,items.length)} notificaciones</span>{historyError&&<p className="notification-history-error" role="alert">{historyError}</p>}{items.length<total&&<button onClick={loadMore} disabled={loadingMore}>{loadingMore?'Cargando…':'Ver notificaciones anteriores'}</button>}</div>}
   </>}
   </div>
  </aside></>,root.current?.closest('.app')||document.body)}
 </div>
}

function Preference({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="notification-pref"><span>{label}</span><span className="switch"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span/></span></label>}
function notificationIcon(type:string){if(type==='payment')return <Clock3/>;if(type==='event')return <ModuleIcon name="calendar"/>;if(type==='task')return <Check/>;if(type==='birthday')return <ModuleIcon name="family"/>;if(type==='budget')return <ModuleIcon name="finance"/>;if(type==='goal')return <Target/>;if(type==='document')return <ModuleIcon name="documents"/>;if(type==='maintenance')return <ModuleIcon name="maintenance"/>;if(type==='pantry')return <Package/>;if(type==='planning')return <ModuleIcon name="planning"/>;return <AlertTriangle/>}
function relativeTime(value:string){const diff=Math.max(0,Date.now()-new Date(value).getTime()),minutes=Math.floor(diff/60000);if(minutes<1)return'Ahora';if(minutes<60)return'Hace '+minutes+' min';const hours=Math.floor(minutes/60);if(hours<24)return'Hace '+hours+' h';const days=Math.floor(hours/24);return'Hace '+days+' día'+(days===1?'':'s')}

function urlBase64ToUint8Array(base64String:string){const padding='='.repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=window.atob(base64),output=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)output[i]=raw.charCodeAt(i);return output}
