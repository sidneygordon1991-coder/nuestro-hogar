import {FormEvent,useEffect,useState} from 'react';
import {Check,Copy,LogOut,Mail,Phone,RefreshCw,Save,Shield,UserRound,Users,X} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type MemberRow={user_id:string;role:string;joined_at:string;full_name:string;avatar_url:string|null;birth_date:string|null;relationship:string|null;phone:string|null};
const initials=(name:string)=>name.split(/s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'?';

export default function FamilyCenter({household,onChanged}:{household:Household;onChanged?:()=>void}){
 const [members,setMembers]=useState<MemberRow[]>([]),[currentUser,setCurrentUser]=useState(''),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[copied,setCopied]=useState(false);

 useEffect(()=>{load()},[household.id]);

 async function load(){
  setBusy(true);setMessage('');
  const [memberR,userR]=await Promise.all([
   supabase.from('household_members').select('user_id,role,joined_at').eq('household_id',household.id).order('joined_at'),
   supabase.auth.getUser()
  ]);
  const ids=(memberR.data||[]).map((m:any)=>m.user_id);
  const profileR=ids.length?await supabase.from('profiles').select('id,full_name,avatar_url,birth_date,relationship,phone').in('id',ids):{data:[] as any[],error:null};
  const rows=(memberR.data||[]).map((m:any)=>{const p=(profileR.data||[]).find((x:any)=>x.id===m.user_id);return{...m,full_name:p?.full_name||'Miembro',avatar_url:p?.avatar_url||null,birth_date:p?.birth_date||null,relationship:p?.relationship||null,phone:p?.phone||null}});
  setMembers(rows as MemberRow[]);setCurrentUser(userR.data.user?.id||'');if(memberR.error||profileR.error)setMessage('No se pudo cargar toda la información de la familia.');setBusy(false);
 }

 const me=members.find(m=>m.user_id===currentUser);

 async function saveProfile(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!currentUser)return;setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const payload={full_name:String(f.get('full_name')||'').trim(),birth_date:String(f.get('birth_date')||'')||null,relationship:String(f.get('relationship')||'').trim()||null,phone:String(f.get('phone')||'').trim()||null,avatar_url:String(f.get('avatar_url')||'').trim()||null,updated_at:new Date().toISOString()};
  const {error}=await supabase.from('profiles').update(payload).eq('id',currentUser);
  setBusy(false);if(error){setMessage(error.message);return}setMessage('Perfil actualizado.');setEditing(false);await load();onChanged?.();
 }

 async function copyInvite(){await navigator.clipboard.writeText(household.invite_code);setCopied(true);setTimeout(()=>setCopied(false),1400)}

 return <section className="family-v2">
  <div className="finance-top"><div><p className="eyebrow">HOGAR COMPARTIDO</p><h2 className="page-title">Mi familia</h2><p className="muted">Perfiles, invitaciones y datos importantes de cada integrante.</p></div>{me&&<button className="finance-new" onClick={()=>setEditing(true)}><UserRound/> Mi perfil</button>}</div>
  {message&&<div className="finance-message">{message}<button onClick={()=>setMessage('')}><X size={15}/></button></div>}

  <div className="family-summary">
   <div><span><Users/></span><div><small>Integrantes</small><strong>{members.length}</strong></div></div>
   <div><span><Shield/></span><div><small>Privacidad</small><strong>Solo este hogar</strong></div></div>
  </div>

  <div className="family-grid">{members.map(member=><article className={'family-member-card '+(member.user_id===currentUser?'me':'')} key={member.user_id}>
   <div className="family-avatar">{member.avatar_url?<img src={member.avatar_url} alt=""/>:<span>{initials(member.full_name)}</span>}</div>
   <div className="family-member-copy"><div><strong>{member.full_name}</strong>{member.user_id===currentUser&&<em>Tú</em>}</div><small>{member.relationship||roleLabel(member.role)}</small>
    <div className="family-meta">{member.birth_date&&<span>🎂 {new Date(member.birth_date+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'long'})}</span>}{member.phone&&<span><Phone/> {member.phone}</span>}</div>
   </div>
   {member.user_id===currentUser&&<button className="member-edit" onClick={()=>setEditing(true)}>Editar</button>}
  </article>)}</div>

  <div className="invite-v2">
   <div><p className="eyebrow">INVITAR A ALGUIEN</p><h3>Comparte tu hogar</h3><p>La otra persona debe crear su cuenta y usar este código en “Ya tengo un código de invitación”.</p></div>
   <div className="invite-code-v2"><span>{household.invite_code}</span><button onClick={copyInvite}>{copied?<Check/>:<Copy/>}{copied?'Copiado':'Copiar'}</button></div>
  </div>

  <button className="logout family-logout" onClick={()=>supabase.auth.signOut()}><LogOut size={17}/> Cerrar sesión</button>

  {editing&&me&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(false)}}><div className="finance-modal"><div className="modal-head"><h3>Mi perfil</h3><button onClick={()=>setEditing(false)}><X/></button></div><form className="finance-form" onSubmit={saveProfile}>
   <label>Nombre completo<input name="full_name" defaultValue={me.full_name} required/></label>
   <div className="two"><label>Relación / rol en casa<input name="relationship" defaultValue={me.relationship||''} placeholder="Ej. Pareja"/></label><label>Fecha de cumpleaños<input name="birth_date" type="date" defaultValue={me.birth_date||''}/></label></div>
   <label>Teléfono<input name="phone" defaultValue={me.phone||''} placeholder="+502 ..."/></label>
   <label>Foto de perfil (URL)<input name="avatar_url" type="url" defaultValue={me.avatar_url||''} placeholder="https://..."/></label>
   <button className="finance-primary" disabled={busy}><Save/>{busy?'Guardando...':'Guardar perfil'}</button>
  </form></div></div>}
 </section>
}

function roleLabel(role:string){return role==='owner'?'Administrador del hogar':role==='admin'?'Administrador':'Integrante'}
