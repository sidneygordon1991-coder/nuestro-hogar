import ModuleIcon from './ModuleIcon';
import {FormEvent,useEffect,useMemo,useState} from 'react';
import {Cake,AlertTriangle,Check,Copy,Eye,History,LogOut,Phone,RefreshCw,Save,Settings2,Shield,ShieldCheck,Trash2,UserCog,UserRound,X} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type AccessLevel='none'|'view'|'edit';
type ModuleKey='finance'|'calendar'|'lists'|'documents'|'meals'|'maintenance'|'planning'|'health'|'monthly_close'|'automations';
type AccessInfo={role:string;can_manage_members:boolean;can_view_audit:boolean;modules:Record<ModuleKey,AccessLevel>};
type MemberRow={user_id:string;role:string;joined_at:string;responsibilities:string[];full_name:string;avatar_url:string|null;birth_date:string|null;relationship:string|null;phone:string|null};
type MemberAccess={role:string;effective:Record<ModuleKey,AccessLevel>;overrides:Partial<Record<ModuleKey,AccessLevel>>};
type AuditRow={id:number;actor_user_id:string|null;action:string;module:string;entity_type:string;entity_id:string|null;label:string|null;metadata:any;created_at:string};

const moduleDefs:{key:ModuleKey;label:string;description:string}[]=[
 {key:'finance',label:'Finanzas',description:'Presupuesto, movimientos, cuentas, metas y patrimonio.'},
 {key:'calendar',label:'Calendario',description:'Eventos, agenda familiar y fechas importantes.'},
 {key:'lists',label:'Listas',description:'Tareas, pendientes y listas de compras.'},
 {key:'documents',label:'Documentos',description:'Bóveda compartida, archivos y vencimientos.'},
 {key:'meals',label:'Comidas',description:'Recetas, despensa, menú y compras relacionadas.'},
 {key:'maintenance',label:'Mantenimiento',description:'Casa, vehículos, servicios y garantías.'},
 {key:'planning',label:'Planeación',description:'Objetivos, roadmap y seguimiento a 12 meses.'},
 {key:'health',label:'Salud del hogar',description:'Índice general y recomendaciones integradas.'},
 {key:'monthly_close',label:'Cierre mensual',description:'Resumen, reflexión y fotografía histórica del mes.'},
 {key:'automations',label:'Automatizaciones',description:'Reglas, umbrales y acciones automáticas.'}
];
const responsibilityDefs:{key:string;label:string}[]=[
 {key:'finances',label:'Finanzas'},{key:'shopping',label:'Compras'},{key:'calendar',label:'Agenda'},{key:'documents',label:'Documentos'},
 {key:'meals',label:'Comidas'},{key:'maintenance',label:'Mantenimiento'},{key:'planning',label:'Planeación'},{key:'home',label:'Hogar'}
];
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'?';
const emptyAccess:AccessInfo={role:'adult',can_manage_members:false,can_view_audit:false,modules:{finance:'none',calendar:'none',lists:'none',documents:'none',meals:'none',maintenance:'none',planning:'none',health:'none',monthly_close:'none',automations:'none'}};

export default function FamilyCenter({household,onChanged,onHouseholdRenamed}:{household:Household;onChanged?:()=>void;onHouseholdRenamed?:(name:string)=>void}){
 const [renamingHousehold,setRenamingHousehold]=useState(false),[householdName,setHouseholdName]=useState(household.name);
 const [members,setMembers]=useState<MemberRow[]>([]),[currentUser,setCurrentUser]=useState(''),[myAccess,setMyAccess]=useState<AccessInfo>(emptyAccess);
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[copied,setCopied]=useState(false),[inviteCode,setInviteCode]=useState(household.invite_code);
 const [managing,setManaging]=useState<MemberRow|null>(null),[memberAccess,setMemberAccess]=useState<MemberAccess|null>(null),[roleDraft,setRoleDraft]=useState('adult');
 const [overrides,setOverrides]=useState<Partial<Record<ModuleKey,AccessLevel>>>({}),[responsibilities,setResponsibilities]=useState<string[]>([]);
 const [audit,setAudit]=useState<AuditRow[]>([]),[auditNames,setAuditNames]=useState<Map<string,string>>(new Map());

 useEffect(()=>{setInviteCode(household.invite_code);setHouseholdName(household.name);load()},[household.id]);

 async function load(){
  setBusy(true);setMessage('');
  const [memberR,userR,accessR]=await Promise.all([
   supabase.from('household_members').select('user_id,role,joined_at,responsibilities').eq('household_id',household.id).order('joined_at'),
   supabase.auth.getUser(),
   supabase.rpc('get_my_household_access',{p_household_id:household.id})
  ]);
  const ids=(memberR.data||[]).map((m:any)=>m.user_id);
  const profileR=ids.length?await supabase.from('profiles').select('id,full_name,avatar_url,birth_date,relationship,phone').in('id',ids):{data:[] as any[],error:null};
  const rows=(memberR.data||[]).map((m:any)=>{const p=(profileR.data||[]).find((x:any)=>x.id===m.user_id);return{...m,responsibilities:m.responsibilities||[],full_name:p?.full_name||'Miembro',avatar_url:p?.avatar_url||null,birth_date:p?.birth_date||null,relationship:p?.relationship||null,phone:p?.phone||null}});
  setMembers(rows as MemberRow[]);setCurrentUser(userR.data.user?.id||'');
  if(accessR.data)setMyAccess(accessR.data as AccessInfo);
  if(memberR.error||profileR.error||accessR.error)setMessage(memberR.error?.message||profileR.error?.message||accessR.error?.message||'No se pudo cargar toda la información de la familia.');
  await loadAudit(Boolean((accessR.data as AccessInfo|undefined)?.can_view_audit),rows as MemberRow[]);
  setBusy(false);
 }

 async function loadAudit(canView=myAccess.can_view_audit,rows=members){
  if(!canView){setAudit([]);return}
  const {data,error}=await supabase.from('household_audit_log').select('id,actor_user_id,action,module,entity_type,entity_id,label,metadata,created_at').eq('household_id',household.id).order('created_at',{ascending:false}).limit(40);
  if(error)return;
  const log=(data||[]) as AuditRow[];setAudit(log);
  const ids=[...new Set(log.map(x=>x.actor_user_id).filter(Boolean))] as string[];
  const profiles=ids.length?await supabase.from('profiles').select('id,full_name').in('id',ids):{data:[] as any[]};
  const map=new Map<string,string>((profiles.data||[]).map((p:any)=>[p.id,p.full_name||'Miembro']));
  for(const row of rows)if(!map.has(row.user_id))map.set(row.user_id,row.full_name);
  setAuditNames(map);
 }

 const me=members.find(m=>m.user_id===currentUser);
 const admins=members.filter(m=>m.role==='owner'||m.role==='admin').length;
 const adults=members.filter(m=>m.role==='adult').length;

 async function saveHouseholdName(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const name=householdName.trim();if(!name||name.length>80){setMessage('El nombre debe tener entre 1 y 80 caracteres.');return}
  setBusy(true);setMessage('');const {data,error}=await supabase.from('households').update({name}).eq('id',household.id).select('id,name').single();setBusy(false);
  if(error){setMessage('No se pudo cambiar el nombre. Verifica que tengas permisos de administración: '+error.message);return}
  onHouseholdRenamed?.(data.name);setRenamingHousehold(false);setMessage('Nombre de la familia actualizado.');
 }

 async function saveProfile(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!currentUser)return;setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const payload={full_name:String(f.get('full_name')||'').trim(),birth_date:String(f.get('birth_date')||'')||null,relationship:String(f.get('relationship')||'').trim()||null,phone:String(f.get('phone')||'').trim()||null,avatar_url:String(f.get('avatar_url')||'').trim()||null,updated_at:new Date().toISOString()};
  const {error}=await supabase.from('profiles').update(payload).eq('id',currentUser);
  setBusy(false);if(error){setMessage(error.message);return}setMessage('Perfil actualizado.');setEditing(false);await load();onChanged?.();
 }

 async function openManager(member:MemberRow){
  setBusy(true);setMessage('');
  const {data,error}=await supabase.rpc('get_household_member_access',{p_household_id:household.id,p_user_id:member.user_id});
  setBusy(false);if(error){setMessage(error.message);return}
  const access=data as MemberAccess;setManaging(member);setMemberAccess(access);setRoleDraft(access.role);setOverrides(access.overrides||{});setResponsibilities(member.responsibilities||[]);
 }

 function setOverride(key:ModuleKey,value:string){
  setOverrides(current=>{const next={...current};if(value==='inherit')delete next[key];else next[key]=value as AccessLevel;return next});
 }
 async function saveMemberAccess(){
  if(!managing)return;setBusy(true);setMessage('');
  const [accessR,respR]=await Promise.all([
   supabase.rpc('set_household_member_access',{p_household_id:household.id,p_user_id:managing.user_id,p_role:roleDraft,p_overrides:overrides}),
   supabase.rpc('set_household_member_responsibilities',{p_household_id:household.id,p_user_id:managing.user_id,p_responsibilities:responsibilities})
  ]);
  setBusy(false);if(accessR.error||respR.error){setMessage(accessR.error?.message||respR.error?.message||'No se pudo guardar.');return}
  setMessage('Rol, permisos y responsabilidades actualizados.');setManaging(null);setMemberAccess(null);await load();onChanged?.();
 }

 async function removeMember(member:MemberRow){
  if(!window.confirm('¿Quitar a '+member.full_name+' de este hogar?'))return;
  setBusy(true);const {error}=await supabase.rpc('remove_household_member',{p_household_id:household.id,p_user_id:member.user_id});setBusy(false);
  if(error){setMessage(error.message);return}setMessage('Integrante eliminado del hogar.');setManaging(null);await load();onChanged?.();
 }

 async function leaveHousehold(){
  if(!me||me.role==='owner')return;
  if(!window.confirm('¿Salir de este hogar? Perderás acceso a su información compartida.'))return;
  setBusy(true);const {error}=await supabase.rpc('remove_household_member',{p_household_id:household.id,p_user_id:me.user_id});setBusy(false);
  if(error){setMessage(error.message);return}onChanged?.();window.location.reload();
 }

 async function copyInvite(){await navigator.clipboard.writeText(inviteCode);setCopied(true);setTimeout(()=>setCopied(false),1400)}
 async function rotateInvite(){
  if(!window.confirm('¿Generar un código nuevo? El código anterior dejará de funcionar inmediatamente.'))return;
  setBusy(true);setMessage('');
  const {data,error}=await supabase.rpc('rotate_household_invite_code',{p_household_id:household.id});
  setBusy(false);
  if(error){setMessage(error.message);return}
  setInviteCode(String(data||''));setMessage('Código de invitación renovado. El anterior ya no funciona.');
 }

 return <section className="family-v3">
  <div className="finance-top"><div><p className="eyebrow">MODO FAMILIA</p><h2 className="page-title">Mi familia</h2><p className="muted">Roles, responsabilidades, permisos y trazabilidad de lo que cambia en el hogar.</p></div>{me&&<button className="finance-new" onClick={()=>setEditing(true)}><UserRound/> Mi perfil</button>}</div>
  {message&&<div className="finance-message">{message}<button onClick={()=>setMessage('')}><X size={15}/></button></div>}

  <section className="family-access-panel"><div className="family-section-head"><div><p className="eyebrow">CONFIGURACIÓN</p><h3>Nombre de la familia</h3><p>{household.name}</p></div>{myAccess.can_manage_members&&<button className="member-edit" onClick={()=>setRenamingHousehold(true)}>Editar nombre</button>}</div></section>
  <div className="family-summary family-access-summary">
   <div><span><ModuleIcon name="family"/></span><div><small>Integrantes</small><strong>{members.length}</strong></div></div>
   <div><span><ShieldCheck/></span><div><small>Administración</small><strong>{admins}</strong><em>propietario / admin</em></div></div>
   <div><span><UserCog/></span><div><small>Adultos</small><strong>{adults}</strong></div></div>
   <div><span><Eye/></span><div><small>Tu rol</small><strong>{roleLabel(myAccess.role)}</strong></div></div>
  </div>

  <section className="family-access-panel">
   <div className="family-section-head"><div><p className="eyebrow">INTEGRANTES</p><h3>Acceso y responsabilidades</h3><p>Cada rol trae un nivel recomendado; los administradores pueden personalizar módulo por módulo.</p></div><Shield/></div>
   <div className="family-grid family-access-grid">{members.map(member=><article className={'family-member-card '+(member.user_id===currentUser?'me':'')} key={member.user_id}>
    <div className="family-avatar">{member.avatar_url?<img src={member.avatar_url} alt=""/>:<span>{initials(member.full_name)}</span>}</div>
    <div className="family-member-copy"><div><strong>{member.full_name}</strong>{member.user_id===currentUser&&<em>Tú</em>}<b className={'family-role '+member.role}>{roleLabel(member.role)}</b></div><small>{member.relationship||'Integrante del hogar'}</small>
     <div className="family-responsibility-list">{(member.responsibilities||[]).slice(0,4).map(tag=><span key={tag}>{responsibilityLabel(tag)}</span>)}{!member.responsibilities?.length&&<span className="empty">Sin responsabilidades asignadas</span>}</div>
     <div className="family-meta">{member.birth_date&&<span><Cake size={14}/> {new Date(member.birth_date+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'long'})}</span>}{member.phone&&<span><Phone/> {member.phone}</span>}</div>
    </div>
    <div className="family-member-actions">{member.user_id===currentUser&&<button className="member-edit" onClick={()=>setEditing(true)}>Editar perfil</button>}{myAccess.can_manage_members&&member.role!=='owner'&&<button className="member-access" onClick={()=>openManager(member)}><Settings2/> Permisos</button>}</div>
   </article>)}</div>
  </section>

  <section className="family-role-guide">
   <div className="family-section-head"><div><p className="eyebrow">ROLES</p><h3>Niveles recomendados</h3></div></div>
   <div className="family-role-grid">
    <RoleGuide role="owner" title="Propietario" text="Control total. Es el único rol que puede administrar a otros administradores."/>
    <RoleGuide role="admin" title="Administrador" text="Control total del contenido y gestión de adultos, adolescentes e invitados."/>
    <RoleGuide role="adult" title="Adulto" text="Puede ver y editar todos los módulos, sin administrar roles del hogar."/>
    <RoleGuide role="teen" title="Adolescente" text="Edita agenda, listas y comidas; puede consultar mantenimiento y planeación."/>
    <RoleGuide role="guest" title="Invitado" text="Acceso de solo lectura a agenda, listas y comidas. Sin información financiera o privada."/>
   </div>
  </section>

  {myAccess.can_manage_members?<div className="invite-v2">
   <div><p className="eyebrow">INVITAR A ALGUIEN</p><h3>Comparte tu hogar</h3><p>Quien use el código ingresará inicialmente como Invitado con acceso mínimo. Después puedes asignarle el rol y los permisos adecuados aquí.</p></div>
   <div className="invite-code-v2"><span>{inviteCode}</span><div><button onClick={copyInvite}>{copied?<Check/>:<Copy/>}{copied?'Copiado':'Copiar'}</button><button className="invite-rotate" onClick={rotateInvite} disabled={busy} title="Generar un código nuevo"><RefreshCw/>{busy?'Procesando':'Renovar'}</button></div></div>
  </div>:<div className="family-limited-note"><Shield/><div><strong>Invitaciones administradas</strong><span>Solo el propietario o un administrador puede compartir el código y cambiar permisos.</span></div></div>}

  {myAccess.can_view_audit&&<section className="family-audit-panel">
   <div className="family-section-head"><div><p className="eyebrow">ACTIVIDAD</p><h3>Historial del hogar</h3><p>Registra quién creó, editó o eliminó información importante, sin copiar datos sensibles completos.</p></div><History/></div>
   <div className="family-audit-list">{audit.slice(0,20).map(row=><div key={row.id}><span className={'audit-dot '+row.action}>{auditIcon(row.action)}</span><div><strong>{auditNames.get(row.actor_user_id||'')||'Sistema'} · {auditAction(row.action)}</strong><small>{auditEntity(row.module,row.entity_type,row.label)}</small></div><time>{relativeTime(row.created_at)}</time></div>)}</div>
   {!audit.length&&<div className="control-empty small"><History/><span>Los cambios importantes aparecerán aquí.</span></div>}
  </section>}

  {me?.role!=='owner'&&<button className="family-leave" onClick={leaveHousehold}><LogOut/> Salir de este hogar</button>}
  <button className="logout family-logout" onClick={()=>supabase.auth.signOut()}><LogOut size={17}/> Cerrar sesión</button>

  {renamingHousehold&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setRenamingHousehold(false)}}><div className="finance-modal"><div className="modal-head"><h3>Editar nombre de la familia</h3><button onClick={()=>setRenamingHousehold(false)} aria-label="Cerrar"><X/></button></div><form className="finance-form" onSubmit={saveHouseholdName}><label>Nombre de la familia<input value={householdName} maxLength={80} onChange={e=>setHouseholdName(e.target.value)} required autoFocus/></label><button className="finance-primary" disabled={busy||!householdName.trim()}><Save/>{busy?'Guardando...':'Guardar nombre'}</button></form></div></div>}
  {editing&&me&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(false)}}><div className="finance-modal"><div className="modal-head"><h3>Mi perfil</h3><button onClick={()=>setEditing(false)}><X/></button></div><form className="finance-form" onSubmit={saveProfile}>
   <label>Nombre completo<input name="full_name" defaultValue={me.full_name} required/></label>
   <div className="two"><label>Relación / rol en casa<input name="relationship" defaultValue={me.relationship||''} placeholder="Ej. Pareja"/></label><label>Fecha de cumpleaños<input name="birth_date" type="date" defaultValue={me.birth_date||''}/></label></div>
   <label>Teléfono<input name="phone" defaultValue={me.phone||''} placeholder="+502 ..."/></label>
   <label>Foto de perfil (URL)<input name="avatar_url" type="url" defaultValue={me.avatar_url||''} placeholder="https://..."/></label>
   <button className="finance-primary" disabled={busy}><Save/>{busy?'Guardando...':'Guardar perfil'}</button>
  </form></div></div>}

  {managing&&memberAccess&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setManaging(null);setMemberAccess(null)}}}><div className="finance-modal family-permission-modal">
   <div className="modal-head"><div><p className="eyebrow">ACCESO DEL HOGAR</p><h3>{managing.full_name}</h3></div><button onClick={()=>{setManaging(null);setMemberAccess(null)}}><X/></button></div>
   <div className="family-permission-form">
    <label className="family-role-select">Rol<select value={roleDraft} onChange={e=>{setRoleDraft(e.target.value);setOverrides({})}}><option value="adult">Adulto</option><option value="teen">Adolescente</option><option value="guest">Invitado</option>{myAccess.role==='owner'&&<option value="admin">Administrador</option>}</select><small>Cambiar el rol restablece la matriz a los valores recomendados.</small></label>

    <div className="family-responsibility-editor"><span>Responsabilidades principales</span><div>{responsibilityDefs.map(r=><button key={r.key} className={responsibilities.includes(r.key)?'active':''} onClick={()=>setResponsibilities(current=>current.includes(r.key)?current.filter(x=>x!==r.key):[...current,r.key])}>{responsibilities.includes(r.key)&&<Check/>}{r.label}</button>)}</div></div>

    <div className="family-permission-table">
     <div className="family-permission-table-head"><div><strong>Módulo</strong><small>Acceso efectivo</small></div><span>Personalización</span></div>
     {moduleDefs.map(mod=>{const override=overrides[mod.key],effective=override||defaultAccessForRole(roleDraft,mod.key);return <div key={mod.key} className="family-permission-row"><div><strong>{mod.label}</strong><small>{mod.description}</small></div><b className={'access-badge '+effective}>{accessLabel(effective)}</b><select value={override||'inherit'} onChange={e=>setOverride(mod.key,e.target.value)}><option value="inherit">Según rol</option><option value="none">Sin acceso</option><option value="view">Solo ver</option><option value="edit">Ver y editar</option></select></div>})}
    </div>
    <div className="family-permission-note"><AlertTriangle/><span>“Salud del hogar” necesita acceso a los módulos que resume. “Cierre mensual” necesita al menos acceso de lectura a Finanzas. Si falta una dependencia, el sistema bloqueará ese módulo aunque la personalización diga lo contrario.</span></div>
    <div className="family-permission-footer"><button className="family-remove-member" onClick={()=>removeMember(managing)}><Trash2/> Quitar del hogar</button><button className="finance-primary" onClick={saveMemberAccess} disabled={busy}><Save/>{busy?'Guardando...':'Guardar acceso'}</button></div>
   </div>
  </div></div>}
 </section>
}

function RoleGuide({role,title,text}:{role:string;title:string;text:string}){return <article className="family-role-guide-card"><span className={'family-role-icon '+role}><Shield/></span><div><strong>{title}</strong><p>{text}</p></div></article>}
function roleLabel(role:string){return role==='owner'?'Propietario':role==='admin'?'Administrador':role==='teen'?'Adolescente':role==='guest'?'Invitado':'Adulto'}
function responsibilityLabel(tag:string){return responsibilityDefs.find(x=>x.key===tag)?.label||tag}
function accessLabel(level:AccessLevel){return level==='edit'?'Editar':level==='view'?'Solo ver':'Sin acceso'}
function defaultAccessForRole(role:string,module:ModuleKey):AccessLevel{
 if(role==='owner'||role==='admin'||role==='adult'||role==='member')return'edit';
 if(role==='teen'){if(['calendar','lists','meals'].includes(module))return'edit';if(['maintenance','planning'].includes(module))return'view';return'none'}
 if(role==='guest'){if(['calendar','lists','meals'].includes(module))return'view';return'none'}
 return'none'
}
function auditAction(action:string){return action==='create'?'creó':action==='update'?'actualizó':action==='delete'?'eliminó':action==='role_change'?'cambió un rol':action==='access_change'?'cambió accesos':'quitó un integrante'}
function auditEntity(module:string,entity:string,label:string|null){const moduleName=moduleDefs.find(x=>x.key===module as ModuleKey)?.label||(module==='family'?'Familia':module);const clean=entity.replace(/_/g,' ');return moduleName+' · '+(label||clean)}
function auditIcon(action:string){return action==='delete'||action==='member_remove'?<Trash2/>:action==='role_change'||action==='access_change'?<Shield/>:<Check/>}
function relativeTime(value:string){const diff=Math.max(0,Date.now()-new Date(value).getTime()),minutes=Math.floor(diff/60000);if(minutes<1)return'Ahora';if(minutes<60)return'Hace '+minutes+' min';const hours=Math.floor(minutes/60);if(hours<24)return'Hace '+hours+' h';const days=Math.floor(hours/24);return'Hace '+days+' día'+(days===1?'':'s')}
