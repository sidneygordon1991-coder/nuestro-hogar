import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Archive,CheckCircle2,Database,FolderOpen,HardDrive,LockKeyhole,RefreshCw,Search,Settings2,ShieldCheck,Users,X} from 'lucide-react';
import {supabase} from './lib/supabase';
import {platformError,quotaBytes,storageLabel,storageState,usagePercent,type PlatformFamily,type PlatformMember,type PlatformOverview} from './lib/platform';
import './master.css';
const roles:Record<string,string>={owner:'Propietario',admin:'Administrador',adult:'Adulto',teen:'Adolescente',guest:'Invitado',remove:'Retirar de esta familia'};
export default function MasterPanel({onChanged}:{onChanged:()=>void}){
 const returnFocus=useRef<HTMLElement|null>(null);
 const [data,setData]=useState<PlatformOverview|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[query,setQuery]=useState('');
 const [selected,setSelected]=useState<PlatformFamily|null>(null),[members,setMembers]=useState<PlatformMember[]>([]),[membersLoading,setMembersLoading]=useState(false),[membersError,setMembersError]=useState('');
 const [editing,setEditing]=useState<PlatformFamily|null>(null),[target,setTarget]=useState<PlatformMember|null>(null),[busy,setBusy]=useState(false),[formError,setFormError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{let live=true;setLoading(true);setError('');supabase.rpc('get_platform_overview').then(({data,error})=>{if(!live)return;if(error){setError(platformError(error));setData(null)}else setData(data as PlatformOverview);setLoading(false)});return()=>{live=false}},[version]);
 useEffect(()=>{if(!selected){setMembers([]);return}let live=true;setMembersLoading(true);setMembersError('');setMembers([]);supabase.rpc('get_platform_members',{p_household_id:selected.id}).then(({data,error})=>{if(!live)return;if(error)setMembersError(platformError(error));else setMembers((data||[]) as PlatformMember[]);setMembersLoading(false)});return()=>{live=false}},[selected?.id,version]);
 function edit(family:PlatformFamily,member:PlatformMember|null=null){returnFocus.current=document.activeElement as HTMLElement;setEditing(family);setTarget(member);setFormError('')}
 useEffect(()=>{
  if(!editing)return;
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!busy)setEditing(null);
   if(event.key==='Tab'){
    const dialog=document.querySelector('.master-dialog');
    const nodes=Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')||[]);
    const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
   }
  };
  window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);if(!document.querySelector('.master-dialog'))returnFocus.current?.focus()};
 },[editing,busy]);
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!editing||!data||busy)return;const form=new FormData(event.currentTarget);setBusy(true);setFormError('');
  try{
   const common={p_household_id:editing.id,p_confirmation:String(form.get('confirmation')||''),p_reason:String(form.get('reason')||'').trim()};
   if(common.p_confirmation!==editing.name)throw new Error('Escribe el nombre exacto de la familia para confirmar.');
   if(common.p_reason.length<5)throw new Error('Indica un motivo de al menos 5 caracteres.');
   const result=target?await supabase.rpc('manage_platform_member',{...common,p_user_id:target.user_id,p_role:String(form.get('role'))}):await supabase.rpc('configure_platform_resources',{...common,p_member_limit:Number(form.get('member_limit')),p_quota_bytes:quotaBytes(String(form.get('quota')),data.storage_limit_bytes,editing.used_bytes),p_status:String(form.get('status'))});
   if(result.error)throw result.error;
   setEditing(null);setNotice(target?'Permiso actualizado. La acción quedó registrada.':'Configuración guardada. La acción quedó registrada.');setVersion(v=>v+1);onChanged();
  }catch(err){setFormError(platformError(err))}finally{setBusy(false)}
 }
 const families=(data?.households||[]).filter(f=>f.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return <section className="master-panel">
  <div className="master-heading"><div><p className="eyebrow">ADMINISTRACIÓN GLOBAL</p><h2 className="page-title">Panel master</h2><p className="muted">Familias, accesos y almacenamiento de Nuestro Hogar.</p></div><span className="master-badge"><ShieldCheck/> Master</span></div>
  <div className="master-toolbar"><span><LockKeyhole/> Acceso exclusivo a cuentas autorizadas</span><button disabled={loading||busy} onClick={()=>setVersion(v=>v+1)}><RefreshCw size={17}/> Actualizar</button></div>
  {notice&&<p className="master-success" role="status"><CheckCircle2/>{notice}</p>}
  {error&&<p className="master-error" role="alert">{error}</p>}
  {loading&&!data&&<p className="muted" role="status">Consultando familias y consumo…</p>}
  {data&&<>
   <div className="master-stats"><StorageCard icon={<Database/>} title="Base de datos" used={data.database_bytes} limit={data.database_limit_bytes}/><StorageCard icon={<HardDrive/>} title="Fotos y archivos" used={data.storage_bytes} limit={data.storage_limit_bytes}/><article><span><Users/> Familias</span><strong>{data.households.length}</strong><small>{data.households.reduce((n,f)=>n+f.members,0)} membresías · {data.households.filter(f=>f.status==='active').length} familias activas</small></article></div>
   <p className="master-footnote">Plan {data.plan} · Cuotas asignadas: {storageLabel(data.allocated_bytes)} de {storageLabel(data.storage_limit_bytes)}. Disponible para asignar: {storageLabel(Math.max(0,data.storage_limit_bytes-data.allocated_bytes))}. El consumo de archivos incluye todos los buckets del proyecto. Esta pantalla no cambia tu suscripción ni mide las descargas del mes.</p>
   <div className="master-section-heading"><h3>Familias</h3><label className="master-search"><Search size={17}/><input aria-label="Buscar familia" placeholder="Buscar familia" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
   <div className="master-family-grid">{families.map(f=><article className="master-family" key={f.id}>
    <div className="master-family-top"><span className="master-family-icon"><Users/></span><div><h3>{f.name}</h3><span className={'master-status '+f.status}>{f.status==='active'?'Activa':'Archivada · solo lectura'}</span></div></div>
    <div className="master-family-counts"><span><Users/>{f.members} / {f.member_limit} miembros</span><span><FolderOpen/>{f.files} archivos</span><span>{f.movements} movimientos</span></div>
    <StorageMeter used={f.used_bytes} limit={f.quota_bytes}/>
    <div className="master-family-actions"><button onClick={()=>edit(f)}><Settings2 size={17}/> Configurar</button><button aria-expanded={selected?.id===f.id} onClick={()=>setSelected(selected?.id===f.id?null:f)}><Users size={17}/> Miembros</button></div>
   </article>)}</div>
   {!families.length&&<p className="muted">No hay familias que coincidan con la búsqueda.</p>}
   {selected&&<section className="master-members"><div className="master-section-heading"><h3>Miembros · {selected.name}</h3><button aria-label="Cerrar miembros" onClick={()=>setSelected(null)}><X/></button></div>{membersLoading&&<p role="status">Cargando miembros…</p>}{membersError&&<p className="master-error" role="alert">{membersError}</p>}{members.map(m=><article key={m.user_id}><div><strong>{m.name||'Sin nombre'}</strong><small>{m.email}</small><span>{roles[m.role]||m.role}</span></div>{m.role==='owner'?<span className="master-protected"><LockKeyhole size={15}/> Propietario protegido</span>:<button disabled={busy} onClick={()=>edit(data.households.find(f=>f.id===selected.id)||selected,m)}>Administrar</button>}</article>)}{!membersLoading&&!membersError&&!members.length&&<p className="muted">Esta familia no tiene miembros.</p>}</section>}
   <section className="master-audit"><h3>Actividad administrativa</h3><p className="muted">Últimas 50 acciones. Cada cambio conserva su motivo.</p>{data.audit.map(a=><article key={a.id}><ShieldCheck size={18}/><div><strong>{a.action==='family_configured'?'Configuración de familia':a.action==='member_managed'?'Cambio de miembro':a.action==='master_granted'?'Cuenta master activada':a.action}</strong><small>{a.household_name||'Administración global'} · {a.actor_name||'Master'} · {new Date(a.created_at).toLocaleString('es-GT')}</small><p>{a.detail.reason||''}{a.detail.status?' · '+(a.detail.status==='archived'?'Archivada':'Activa'):''}{a.detail.role?' · '+(roles[a.detail.role]||a.detail.role):''}</p></div></article>)}{!data.audit.length&&<p className="muted">Todavía no hay cambios administrativos registrados.</p>}</section>
   <div className="master-explainer"><Archive/><p><strong>Archivar conserva la información.</strong> La familia queda en modo consulta y puedes reactivarla desde Configurar. Retirar un miembro revoca su acceso a esa familia y conserva los registros. El propietario y las cuentas master están protegidos.</p></div>
  </>}
  {editing&&<div className="modal-backdrop"><section className="modal master-dialog" role="dialog" aria-modal="true" aria-labelledby="master-dialog-title"><div className="master-section-heading"><div><p className="eyebrow">CAMBIO ADMINISTRATIVO</p><h3 id="master-dialog-title">{target?'Administrar miembro':'Configurar familia'}</h3></div><button disabled={busy} aria-label="Cerrar configuración" onClick={()=>setEditing(null)}><X/></button></div><p className="muted">{editing.name}{target?' · '+(target.name||target.email):''}</p><form onSubmit={save} onChange={()=>setFormError('')}>
   {target?<label>Acceso a esta familia<select name="role" defaultValue={target.role}>{['admin','adult','teen','guest','remove'].map(role=><option key={role} value={role}>{roles[role]}</option>)}</select></label>:<><label>Cuota de archivos (MB)<input name="quota" type="number" min="1" max={(data?.storage_limit_bytes||1000000000)/1000000} step="0.1" defaultValue={editing.quota_bytes/1000000} required/></label><small>Ya almacenados: {storageLabel(editing.used_bytes)}. La suma de las cuotas no puede superar el espacio global.</small><label>Máximo de miembros<input name="member_limit" type="number" min={Math.max(1,editing.members)} max="50" step="1" defaultValue={editing.member_limit} required/></label><label>Estado<select name="status" defaultValue={editing.status}><option value="active">Activa</option><option value="archived">Archivada · solo lectura</option></select></label></>}
   <label>Motivo del cambio<textarea name="reason" minLength={5} maxLength={500} rows={3} required autoFocus placeholder="Explica el motivo para el registro administrativo"/></label><label>Escribe «{editing.name}» para confirmar<input name="confirmation" autoComplete="off" required/></label>
   {formError&&<p className="master-error" role="alert">{formError}</p>}<div className="master-dialog-actions"><button type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button><button className="master-primary" disabled={busy} type="submit">{busy?'Guardando…':'Guardar cambio'}</button></div>
  </form></section></div>}
 </section>;
}
function StorageCard({icon,title,used,limit}:{icon:React.ReactNode;title:string;used:number;limit:number}){return <article><span>{icon}{title}</span><strong>{storageLabel(used)}</strong><StorageMeter used={used} limit={limit}/></article>}
function StorageMeter({used,limit}:{used:number;limit:number}){const pct=usagePercent(used,limit),state=storageState(used,limit);return <div className={'master-meter '+state}><div><span>{storageLabel(used)} de {storageLabel(limit)}</span><b>{pct.toLocaleString('es-GT',{maximumFractionDigits:1})}%</b></div><progress aria-label="Espacio utilizado" value={pct} max={100}/>{state!=='normal'&&<small>{state==='critical'?'Espacio casi agotado':'Revisar espacio disponible'}</small>}</div>}
