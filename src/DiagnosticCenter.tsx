import WorkspaceTitle from './WorkspaceTitle';
import ModuleLoading from './ModuleLoading';
import ModuleIcon from './ModuleIcon';
import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,BellRing,Bug,Check,CheckCircle2,ChevronRight,Clock3,Cloud,Database,History,MonitorSmartphone,RefreshCw,Server,ShieldCheck,Wifi,WifiOff} from 'lucide-react';
import {supabase} from './lib/supabase';
import {clientReadiness,formatLatency,qualityLabel,type QualityStatus} from './lib/quality';
import './DiagnosticCenter.css';

type Household={id:string;name:string;invite_code:string};
type CheckState='ok'|'info'|'warning'|'error';
type DiagnosticCheck={key:string;module:string;title:string;severity:'info'|'warning'|'error';status:CheckState;count:number;detail:string;action_tab:string|null};
type DiagnosticResult={run_id:string;score:number;status:QualityStatus;error_count:number;warning_count:number;info_count:number;checks:DiagnosticCheck[];generated_at:string};
type DiagnosticRun={id:string;score:number;status:QualityStatus;error_count:number;warning_count:number;info_count:number;created_at:string};
type ErrorLog={id:string;source:string;message:string;stack:string|null;context:any;app_version:string|null;url:string|null;occurrence_count:number;first_seen_at:string;last_seen_at:string;resolved_at:string|null};
type DeviceState={
 online:boolean;serviceWorkerSupported:boolean;serviceWorkerControlled:boolean;standalone:boolean;
 notifications:'granted'|'denied'|'default'|'unsupported';pushActive:boolean;storageUsed:number|null;storageQuota:number|null
};

const initialDevice:DeviceState={
 online:navigator.onLine,serviceWorkerSupported:'serviceWorker'in navigator,serviceWorkerControlled:!!navigator.serviceWorker?.controller,
 standalone:window.matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true,
 notifications:'Notification'in window?Notification.permission:'unsupported',pushActive:false,storageUsed:null,storageQuota:null
};

export default function DiagnosticCenter({household,onNavigate}:{household:Household;onNavigate:(tab:string)=>void}){
 const [result,setResult]=useState<DiagnosticResult|null>(null),[history,setHistory]=useState<DiagnosticRun[]>([]),[errors,setErrors]=useState<ErrorLog[]>([]);
 const [device,setDevice]=useState<DeviceState>(initialDevice),[latency,setLatency]=useState<number|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[message,setMessage]=useState('');

 useEffect(()=>{let alive=true;
  const online=()=>setDevice(v=>({...v,online:true})),offline=()=>setDevice(v=>({...v,online:false}));
  window.addEventListener('online',online);window.addEventListener('offline',offline);
  (async()=>{await inspectDevice();if(alive)await runDiagnostics(true)})();
  return()=>{alive=false;window.removeEventListener('online',online);window.removeEventListener('offline',offline)}
 },[household.id]);

 async function inspectDevice(){
  const next={...initialDevice,online:navigator.onLine,serviceWorkerControlled:!!navigator.serviceWorker?.controller,
   standalone:window.matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true,
   notifications:'Notification'in window?Notification.permission:'unsupported'} as DeviceState;
  try{
   if('serviceWorker'in navigator){
    const registration=await navigator.serviceWorker.ready;
    next.serviceWorkerControlled=!!navigator.serviceWorker.controller;
    next.pushActive=!!(await registration.pushManager?.getSubscription());
   }
  }catch{}
  try{
   if(navigator.storage?.estimate){
    const estimate=await navigator.storage.estimate();
    next.storageUsed=estimate.usage??null;next.storageQuota=estimate.quota??null;
   }
  }catch{}
  setDevice(next);
 }

 async function loadSupporting(){
  const [historyR,errorR]=await Promise.all([
   supabase.from('household_diagnostic_runs').select('id,score,status,error_count,warning_count,info_count,created_at').eq('household_id',household.id).order('created_at',{ascending:false}).limit(20),
   supabase.from('app_error_logs').select('id,source,message,stack,context,app_version,url,occurrence_count,first_seen_at,last_seen_at,resolved_at').eq('household_id',household.id).is('resolved_at',null).order('last_seen_at',{ascending:false}).limit(25)
  ]);
  if(historyR.error||errorR.error)setMessage(historyR.error?.message||errorR.error?.message||'No se pudo cargar el historial técnico.');
  setHistory((historyR.data||[]) as DiagnosticRun[]);setErrors((errorR.data||[]) as ErrorLog[]);
 }

 async function runDiagnostics(initial=false){
  if(initial)setLoading(true);else setBusy('diagnose');
  setMessage('');const started=performance.now();
  const {data,error}=await supabase.rpc('run_household_diagnostics',{p_household_id:household.id});
  const elapsed=performance.now()-started;setLatency(elapsed);
  if(error){setMessage(error.message);if(initial)setLoading(false);else setBusy('');return}
  setResult(data as DiagnosticResult);await Promise.all([loadSupporting(),inspectDevice()]);
  if(initial)setLoading(false);else{setBusy('');setMessage('Diagnóstico actualizado.')}
 }

 async function runMaintenance(){
  setBusy('maintenance');setMessage('');
  const {data,error}=await supabase.rpc('run_household_diagnostic_maintenance',{p_household_id:household.id});
  if(error){setBusy('');setMessage(error.message);return}
  const total=Number(data?.occurrences_created||0)+Number(data?.recurring_states_fixed||0)+Number(data?.expired_notifications_removed||0)+Number(data?.expired_recovery_removed||0)+Number(data?.notification_preferences_created||0);
  setMessage(total?total+' ajuste'+(total===1?'':'s')+' de mantenimiento ejecutado'+(total===1?'':'s')+'.':'Mantenimiento completado. No había correcciones seguras pendientes.');
  setBusy('');await runDiagnostics(false);
 }

 async function resolveError(row:ErrorLog){
  setBusy('error-'+row.id);
  const {error}=await supabase.rpc('resolve_app_error',{p_error_id:row.id,p_resolved:true});
  setBusy('');if(error){setMessage(error.message);return}
  setErrors(current=>current.filter(x=>x.id!==row.id));setMessage('Error marcado como resuelto.');
 }

 const readiness=clientReadiness({
  online:device.online,serviceWorkerSupported:device.serviceWorkerSupported,serviceWorkerControlled:device.serviceWorkerControlled,
  standalone:device.standalone,notifications:device.notifications
 });
 const checks=result?.checks||[];
 const issues=useMemo(()=>checks.filter(c=>c.status!=='ok').sort((a,b)=>rankState(a.status)-rankState(b.status)),[checks]);
 const healthyChecks=checks.filter(c=>c.status==='ok').length;

 if(loading)return <ModuleLoading/>;
 if(!result)return <section className="diagnostic-center"><div className="document-empty"><ModuleIcon name="diagnostics"/><strong>No pudimos ejecutar el diagnóstico</strong><span>{message||'Intenta nuevamente.'}</span><button onClick={()=>runDiagnostics(true)}><RefreshCw/> Reintentar</button></div></section>;

 return <section className="diagnostic-center">
  <div className="diagnostic-top">
   <WorkspaceTitle module="diagnostics" eyebrow="CALIDAD Y CONFIABILIDAD" title="Centro de diagnóstico" description="Verifica integridad de datos, sincronización, PWA, errores de cliente y preparación del dispositivo."/>
   <div className="diagnostic-actions"><button onClick={runMaintenance} disabled={!!busy}><ModuleIcon name="maintenance"/>{busy==='maintenance'?'Ejecutando...':'Mantenimiento seguro'}</button><button className="primary" onClick={()=>runDiagnostics(false)} disabled={!!busy}><RefreshCw/>{busy==='diagnose'?'Analizando...':'Ejecutar diagnóstico'}</button></div>
  </div>
  {message&&<div className="finance-message">{message}</div>}

  <section className={'diagnostic-hero '+result.status}>
   <div className="diagnostic-score" style={{'--score':result.score} as React.CSSProperties}><div><strong>{result.score}</strong><span>/100</span></div></div>
   <div className="diagnostic-hero-copy"><p className="eyebrow">SALUD TÉCNICA</p><h3>{qualityLabel(result.status)}</h3><p>{diagnosticCopy(result.status)}</p><div><span><CheckCircle2/> {healthyChecks} controles correctos</span><span><Clock3/> {formatLatency(latency)}</span></div></div>
   <div className="diagnostic-issue-totals"><div className="error"><strong>{result.error_count}</strong><span>críticos</span></div><div className="warning"><strong>{result.warning_count}</strong><span>avisos</span></div><div className="info"><strong>{result.info_count}</strong><span>informativos</span></div></div>
  </section>

  <div className="diagnostic-system-grid">
   <SystemCard icon={device.online?<Wifi/>:<WifiOff/>} title="Conexión" value={device.online?'En línea':'Sin conexión'} detail={device.online?'El dispositivo tiene conectividad.':'La app depende del caché local hasta recuperar internet.'} tone={device.online?'good':'danger'}/>
   <SystemCard icon={<Server/>} title="Backend" value={formatLatency(latency)} detail="Tiempo de respuesta del último diagnóstico." tone={latency!=null&&latency<600?'good':latency!=null?'warning':'neutral'}/>
   <SystemCard icon={<MonitorSmartphone/>} title="PWA" value={device.serviceWorkerControlled?'Controlada':'No controlada'} detail={device.standalone?'Instalada como aplicación.':device.serviceWorkerSupported?'Disponible en navegador, no instalada.':'Service Worker no soportado.'} tone={device.serviceWorkerControlled?'good':'warning'}/>
   <SystemCard icon={<BellRing/>} title="Notificaciones" value={device.notifications==='granted'?(device.pushActive?'Push activo':'Permiso activo'):device.notifications==='denied'?'Bloqueadas':'Sin habilitar'} detail={device.notifications==='granted'?'Permiso del navegador concedido.':'Puedes habilitarlas desde la campana si tu navegador lo permite.'} tone={device.notifications==='granted'?'good':device.notifications==='denied'?'danger':'warning'}/>
   <SystemCard icon={<ModuleIcon name="backups"/>} title="Almacenamiento local" value={device.storageUsed==null?'Sin medición':formatBytes(device.storageUsed)} detail={device.storageQuota?formatBytes(device.storageQuota)+' disponibles como cuota del navegador.':'El navegador no expuso la cuota.'} tone="neutral"/>
   <SystemCard icon={<ShieldCheck/>} title="Preparación del dispositivo" value={readiness.score+'/100'} detail="Conectividad + Service Worker + instalación + notificaciones." tone={readiness.score>=80?'good':readiness.score>=50?'warning':'danger'}/>
  </div>

  <div className="diagnostic-main-grid">
   <section className="diagnostic-panel">
    <div className="diagnostic-panel-head"><div><p className="eyebrow">INTEGRIDAD</p><h3>Controles automáticos</h3></div><Database/></div>
    <div className="diagnostic-check-list">{checks.map(check=><button key={check.key} className={'diagnostic-check '+check.status} onClick={()=>check.action_tab&&onNavigate(check.action_tab)}><span>{checkIcon(check.status)}</span><div><strong>{check.title}</strong><small>{check.detail}</small></div><em>{check.status==='ok'?'Correcto':check.count+' detectado'+(check.count===1?'':'s')}</em>{check.action_tab&&<ChevronRight/>}</button>)}</div>
   </section>

   <section className="diagnostic-panel">
    <div className="diagnostic-panel-head"><div><p className="eyebrow">ATENCIÓN</p><h3>Qué revisar primero</h3></div><AlertTriangle/></div>
    {issues.length?<div className="diagnostic-priority-list">{issues.slice(0,7).map(check=><button key={check.key} className={check.status} onClick={()=>check.action_tab&&onNavigate(check.action_tab)}><span>{checkIcon(check.status)}</span><div><strong>{check.title}</strong><small>{check.detail}</small></div><ChevronRight/></button>)}</div>:<div className="diagnostic-all-good"><ShieldCheck/><div><strong>Sin inconsistencias detectadas</strong><span>Los controles de integridad están pasando correctamente.</span></div></div>}
    <div className="diagnostic-maintenance-note"><ModuleIcon name="maintenance"/><div><strong>Mantenimiento seguro</strong><span>Regenera recurrentes faltantes, sincroniza estados con movimientos enlazados y limpia datos vencidos. No elimina información vigente ni modifica importes.</span></div></div>
   </section>
  </div>

  <div className="diagnostic-secondary-grid">
   <section className="diagnostic-panel">
    <div className="diagnostic-panel-head"><div><p className="eyebrow">ERRORES DE CLIENTE</p><h3>Registro de fallos</h3></div><Bug/></div>
    {errors.length?<div className="diagnostic-error-list">{errors.map(row=><article key={row.id}><span><Bug/></span><div><strong>{row.message}</strong><small>{row.source} · {relativeTime(row.last_seen_at)}{row.app_version?' · v'+row.app_version:''}</small>{row.url&&<em>{trimUrl(row.url)}</em>}</div><b>{row.occurrence_count}×</b><button disabled={busy==='error-'+row.id} onClick={()=>resolveError(row)}><Check/> Resolver</button></article>)}</div>:<div className="control-empty small"><CheckCircle2/><span>No hay errores de aplicación sin resolver.</span></div>}
   </section>

   <section className="diagnostic-panel">
    <div className="diagnostic-panel-head"><div><p className="eyebrow">EVOLUCIÓN</p><h3>Historial de diagnósticos</h3></div><History/></div>
    <DiagnosticTrend rows={history}/>
    <div className="diagnostic-ci"><Cloud/><div><strong>Puerta de calidad del despliegue</strong><span>Cada publicación ejecuta pruebas unitarias, TypeScript y build de Vite antes de desplegar GitHub Pages.</span></div></div>
   </section>
  </div>
 </section>
}

function SystemCard({icon,title,value,detail,tone}:{icon:React.ReactNode;title:string;value:string;detail:string;tone:'good'|'warning'|'danger'|'neutral'}){
 return <article className={'diagnostic-system-card '+tone}><span>{icon}</span><div><small>{title}</small><strong>{value}</strong><em>{detail}</em></div></article>
}
function DiagnosticTrend({rows}:{rows:DiagnosticRun[]}){
 const recent=rows.slice().reverse().slice(-16);
 if(!recent.length)return <div className="control-empty small"><History/><span>El histórico comenzará con el primer diagnóstico.</span></div>;
 const min=Math.min(50,...recent.map(r=>r.score)),range=Math.max(1,100-min);
 return <div className="diagnostic-trend"><div className="diagnostic-trend-chart">{recent.map((row,index)=><div key={row.id} title={dateLabel(row.created_at)+' · '+row.score+'/100'}><span className={row.status} style={{height:Math.max(8,(row.score-min)/range*100)+'%'}}/><small>{index===0||index===recent.length-1||recent.length<=6?new Date(row.created_at).toLocaleDateString('es-GT',{day:'numeric',month:'short'}).replace('.',''):''}</small></div>)}</div><div className="diagnostic-trend-foot"><span>Inicio <b>{recent[0].score}</b></span><span>Actual <b>{recent[recent.length-1].score}</b></span></div></div>
}
function checkIcon(status:CheckState){if(status==='ok')return <CheckCircle2/>;if(status==='error')return <AlertTriangle/>;if(status==='warning')return <ModuleIcon name="maintenance"/>;return <ModuleIcon name="diagnostics"/>}
function rankState(status:CheckState){return status==='error'?0:status==='warning'?1:status==='info'?2:3}
function diagnosticCopy(status:QualityStatus){return status==='excellent'?'La estructura técnica está limpia y no hay señales relevantes de inconsistencia.':status==='healthy'?'El sistema está estable. Hay ajustes menores que conviene mantener bajo control.':status==='attention'?'Hay inconsistencias o mantenimiento pendiente que conviene resolver antes de seguir creciendo.':'Hay fallos importantes de integridad o confiabilidad que requieren revisión prioritaria.'}
function relativeTime(value:string){const ms=Math.max(0,Date.now()-new Date(value).getTime()),m=Math.floor(ms/60000);if(m<1)return'ahora';if(m<60)return'hace '+m+' min';const h=Math.floor(m/60);if(h<24)return'hace '+h+' h';const d=Math.floor(h/24);return'hace '+d+' día'+(d===1?'':'s')}
function dateLabel(value:string){return new Date(value).toLocaleString('es-GT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).replace('.','')}
function formatBytes(value:number){if(value<1024)return Math.round(value)+' B';if(value<1024*1024)return(value/1024).toFixed(1)+' KB';if(value<1024*1024*1024)return(value/1024/1024).toFixed(1)+' MB';return(value/1024/1024/1024).toFixed(1)+' GB'}
function trimUrl(value:string){try{const u=new URL(value);return u.pathname+(u.search||'')}catch{return value.slice(0,120)}}
