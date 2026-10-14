import ModuleIcon from './ModuleIcon';
import {FormEvent,useEffect,useMemo,useState} from 'react';
import {AlertTriangle,BadgeCheck,CalendarClock,Car,ExternalLink,GraduationCap,LockKeyhole,Paperclip,Pencil,Plus,Search,ShieldCheck,Trash2,Upload,X} from 'lucide-react';
import {supabase} from './lib/supabase';
import {checkHouseholdUpload,platformError} from './lib/platform';

type Household={id:string;name:string;invite_code:string};
type Member={user_id:string;full_name:string};
type DocCategory='personal'|'home'|'vehicle'|'health'|'finance'|'insurance'|'warranty'|'education'|'other';
type AccessScope='household'|'private';
type DocumentRow={
 id:string;title:string;category:DocCategory;document_number:string|null;issuer:string|null;owner_user_id:string|null;access_scope:AccessScope;
 issued_on:string|null;expires_on:string|null;file_path:string|null;original_filename:string|null;mime_type:string|null;file_size:number|null;notes:string|null;tags:string[];
 created_by:string|null;created_at:string;updated_at:string;
};

const categories:{id:DocCategory;label:string}[]=[
 {id:'personal',label:'Personales'},{id:'home',label:'Casa'},{id:'vehicle',label:'Vehículos'},{id:'health',label:'Salud'},
 {id:'finance',label:'Finanzas'},{id:'insurance',label:'Seguros'},{id:'warranty',label:'Garantías'},{id:'education',label:'Educación'},{id:'other',label:'Otros'}
];
const iso=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const formatDate=(value:string|null)=>value?new Date(value+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short',year:'numeric'}):'Sin fecha';
const formatSize=(bytes:number|null)=>!bytes?'':bytes<1024*1024?Math.max(1,Math.round(bytes/1024))+' KB':(bytes/1024/1024).toFixed(1)+' MB';

export default function DocumentVault({household,readOnly=false}:{household:Household;readOnly?:boolean}){
 const [documents,setDocuments]=useState<DocumentRow[]>([]),[members,setMembers]=useState<Member[]>([]),[userId,setUserId]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [query,setQuery]=useState(''),[category,setCategory]=useState<'all'|DocCategory>('all'),[showForm,setShowForm]=useState(false),[editing,setEditing]=useState<DocumentRow|null>(null);
 const [scopeDraft,setScopeDraft]=useState<AccessScope>('household');

 useEffect(()=>{load()},[household.id]);

 async function load(){
  setLoading(true);setMessage('');
  const {data:{user}}=await supabase.auth.getUser();if(!user){setLoading(false);return}setUserId(user.id);
  const [docR,memberR]=await Promise.all([
   supabase.from('household_documents').select('*').eq('household_id',household.id).order('expires_on',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false}),
   supabase.from('household_members').select('user_id').eq('household_id',household.id)
  ]);
  const ids=(memberR.data||[]).map((x:any)=>x.user_id);
  const profileR=ids.length?await supabase.from('profiles').select('id,full_name').in('id',ids):{data:[] as any[]};
  const names=new Map((profileR.data||[]).map((p:any)=>[p.id,p.full_name||'Miembro']));
  setMembers(ids.map(id=>({user_id:id,full_name:String(names.get(id)||'Miembro')})));
  setDocuments((docR.data||[]) as DocumentRow[]);
  if(docR.error)setMessage(docR.error.message);
  setLoading(false);
 }

 const stats=useMemo(()=>{
  const today=iso(),soon=new Date();soon.setDate(soon.getDate()+30);const soonIso=soon.toISOString().slice(0,10);
  const expired=documents.filter(d=>d.expires_on&&d.expires_on<today).length;
  const expiring=documents.filter(d=>d.expires_on&&d.expires_on>=today&&d.expires_on<=soonIso).length;
  const withFile=documents.filter(d=>d.file_path).length;
  return{expired,expiring,withFile,total:documents.length};
 },[documents]);

 const filtered=useMemo(()=>{
  const needle=query.trim().toLocaleLowerCase('es-GT');
  return documents.filter(d=>{
   if(category!=='all'&&d.category!==category)return false;
   if(!needle)return true;
   return [d.title,d.document_number,d.issuer,d.notes,...(d.tags||[])].filter(Boolean).some(v=>String(v).toLocaleLowerCase('es-GT').includes(needle));
  });
 },[documents,query,category]);

 function startNew(){if(readOnly)return;setEditing(null);setScopeDraft('household');setShowForm(true)}
 function startEdit(doc:DocumentRow){if(readOnly)return;setEditing(doc);setScopeDraft(doc.access_scope);setShowForm(true)}
 function closeForm(){setShowForm(false);setEditing(null);setScopeDraft('household')}

 async function saveDocument(e:FormEvent<HTMLFormElement>){
  if(readOnly){setMessage('Modo solo lectura.');return}
  e.preventDefault();if(!userId)return;setBusy(true);setMessage('');
  const form=e.currentTarget,data=new FormData(form),file=(data.get('file') as File|null);
  if(file&&file.size>15*1024*1024){setBusy(false);setMessage('El archivo supera el límite de 15 MB.');return}
  const id=editing?.id||crypto.randomUUID();
  const requestedScope=(editing?.file_path?editing.access_scope:scopeDraft) as AccessScope;
  const owner=requestedScope==='private'?userId:(String(data.get('owner_user_id')||'')||null);
  let uploadedPath:string|null=editing?.file_path||null;
  let originalFilename=editing?.original_filename||null,mimeType=editing?.mime_type||null,fileSize=editing?.file_size||null;
  let newUpload:string|null=null;
  if(file&&file.size){
   try{await checkHouseholdUpload(supabase,household.id,file.size)}catch(error){setBusy(false);setMessage(platformError(error));return}
   const safeName=file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-100)||'archivo';
   const path=requestedScope==='private'
    ?`${household.id}/private/${userId}/${id}/${Date.now()}-${safeName}`
    :`${household.id}/household/${id}/${Date.now()}-${safeName}`;
   const {error:uploadError}=await supabase.storage.from('household-documents').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});
   if(uploadError){setBusy(false);setMessage(uploadError.message);return}
   newUpload=path;uploadedPath=path;originalFilename=file.name;mimeType=file.type||null;fileSize=file.size;
  }
  const payload={
   id,household_id:household.id,title:String(data.get('title')||'').trim(),category:String(data.get('category')||'other'),
   document_number:String(data.get('document_number')||'').trim()||null,issuer:String(data.get('issuer')||'').trim()||null,
   owner_user_id:owner,access_scope:requestedScope,issued_on:String(data.get('issued_on')||'')||null,expires_on:String(data.get('expires_on')||'')||null,
   file_path:uploadedPath,original_filename:originalFilename,mime_type:mimeType,file_size:fileSize,
   notes:String(data.get('notes')||'').trim()||null,tags:String(data.get('tags')||'').split(',').map(x=>x.trim()).filter(Boolean),
   created_by:editing?.created_by||userId,updated_at:new Date().toISOString()
  };
  const result=editing
   ?await supabase.from('household_documents').update(payload).eq('id',editing.id).eq('household_id',household.id)
   :await supabase.from('household_documents').insert(payload);
  if(result.error){
   if(newUpload)await supabase.storage.from('household-documents').remove([newUpload]);
   setBusy(false);setMessage(result.error.message);return;
  }
  if(newUpload&&editing?.file_path&&editing.file_path!==newUpload)await supabase.storage.from('household-documents').remove([editing.file_path]);
  await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});
  setBusy(false);setMessage(editing?'Documento actualizado.':'Documento guardado en la bóveda.');closeForm();await load();
 }

 async function openFile(doc:DocumentRow){
  if(!doc.file_path)return;
  setMessage('');
  const {data,error}=await supabase.storage.from('household-documents').createSignedUrl(doc.file_path,120);
  if(error||!data?.signedUrl){setMessage(error?.message||'No se pudo abrir el archivo.');return}
  window.open(data.signedUrl,'_blank','noopener,noreferrer');
 }

 async function deleteDocument(doc:DocumentRow){
  if(readOnly){setMessage('Modo solo lectura.');return}
  if(!window.confirm('¿Eliminar este documento de la bóveda?'))return;setBusy(true);setMessage('');
  const {error}=await supabase.from('household_documents').delete().eq('id',doc.id).eq('household_id',household.id);
  if(!error&&doc.file_path)await supabase.storage.from('household-documents').remove([doc.file_path]);
  setBusy(false);setMessage(error?error.message:'Documento eliminado.');if(!error)await load();
 }

 if(loading)return <div className="finance-loading"><div className="loader"/></div>;

 return <section className="document-vault">
  <div className="document-top">
   <div><p className="eyebrow">BÓVEDA DEL HOGAR</p><h2 className="page-title">Documentos</h2><p className="muted">Archivos importantes, vencimientos y garantías en un solo lugar privado.</p></div>
   {!readOnly&&<button className="finance-new" onClick={startNew}><Plus/> Documento</button>}
  </div>

  {message&&<div className="finance-message">{message}<button onClick={()=>setMessage('')}><X size={15}/></button></div>}

  <div className="document-kpis">
   <div><span className="all"><ModuleIcon name="documents"/></span><small>Documentos</small><strong>{stats.total}</strong><em>{stats.withFile} con archivo</em></div>
   <div><span className="soon"><CalendarClock/></span><small>Vencen en 30 días</small><strong>{stats.expiring}</strong><em>{stats.expiring?'Revisar próximos':'Sin vencimientos próximos'}</em></div>
   <div><span className="expired"><AlertTriangle/></span><small>Vencidos</small><strong>{stats.expired}</strong><em>{stats.expired?'Requieren atención':'Todo vigente'}</em></div>
  </div>

  <div className="document-toolbar">
   <label className="document-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por nombre, número, entidad o etiqueta"/></label>
   <select value={category} onChange={e=>setCategory(e.target.value as any)}><option value="all">Todas las categorías</option>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>
  </div>

  <div className="document-category-strip">
   <button className={category==='all'?'active':''} onClick={()=>setCategory('all')}><ModuleIcon name="documents"/><span>Todos</span><b>{documents.length}</b></button>
   {categories.map(cat=>{const count=documents.filter(d=>d.category===cat.id).length;return <button className={category===cat.id?'active':''} key={cat.id} onClick={()=>setCategory(cat.id)}>{categoryIcon(cat.id)}<span>{cat.label}</span><b>{count}</b></button>})}
  </div>

  <div className="document-grid">
   {filtered.map(doc=>{const status=expiryStatus(doc.expires_on);return <article className={'document-card '+status.tone} key={doc.id}>
    <div className="document-card-head"><span className={'document-category-icon '+doc.category}>{categoryIcon(doc.category)}</span><div><small>{categoryLabel(doc.category)}</small><strong>{doc.title}</strong><p>{doc.issuer||doc.document_number||'Documento del hogar'}</p></div><span className={'document-status '+status.tone}>{status.label}</span></div>
    <div className="document-meta">
     {doc.document_number&&<div><span>Número</span><b>{doc.document_number}</b></div>}
     {doc.expires_on&&<div><span>Vencimiento</span><b>{formatDate(doc.expires_on)}</b></div>}
     {doc.owner_user_id&&<div><span>Titular</span><b>{memberName(doc.owner_user_id,members,userId)}</b></div>}
     <div><span>Acceso</span><b>{doc.access_scope==='private'?<><LockKeyhole/> Privado</>:<><ModuleIcon name="family"/> Hogar</>}</b></div>
    </div>
    {doc.tags?.length>0&&<div className="document-tags">{doc.tags.slice(0,5).map(tag=><span key={tag}>#{tag}</span>)}</div>}
    <div className="document-file">{doc.file_path?<><Paperclip/><div><strong>{doc.original_filename||'Archivo adjunto'}</strong><small>{formatSize(doc.file_size)}{doc.mime_type?' · '+fileTypeLabel(doc.mime_type):''}</small></div><button onClick={()=>openFile(doc)}><ExternalLink/> Abrir</button></>:<><ModuleIcon name="documents"/><div><strong>Solo registro</strong><small>Sin archivo adjunto</small></div></>}</div>
    {!readOnly&&<div className="document-actions"><button onClick={()=>startEdit(doc)}><Pencil/> Editar</button><button className="danger" onClick={()=>deleteDocument(doc)} disabled={busy}><Trash2/> Eliminar</button></div>}
   </article>})}
  </div>
  {!filtered.length&&<div className="document-empty"><ModuleIcon name="documents"/><strong>{documents.length?'No encontramos documentos':'Tu bóveda está vacía'}</strong><span>{documents.length?'Prueba con otra búsqueda o categoría.':'Guarda aquí DPI, pasaportes, contratos, seguros, facturas y garantías.'}</span>{!documents.length&&!readOnly&&<button onClick={startNew}><Plus/> Agregar primer documento</button>}</div>}

  {showForm&&!readOnly&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeForm()}}><div className="finance-modal document-modal">
   <div className="modal-head"><div><p className="eyebrow">BÓVEDA SEGURA</p><h3>{editing?'Editar documento':'Nuevo documento'}</h3></div><button onClick={closeForm}><X/></button></div>
   <form className="finance-form" onSubmit={saveDocument}>
    <label>Nombre del documento<input name="title" defaultValue={editing?.title||''} placeholder="Ej. Pasaporte Sidney" required/></label>
    <div className="two"><label>Categoría<select name="category" defaultValue={editing?.category||'personal'}>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label><label>Entidad / emisor<input name="issuer" defaultValue={editing?.issuer||''} placeholder="Ej. SAT, aseguradora, banco"/></label></div>
    <div className="two"><label>Número / referencia<input name="document_number" defaultValue={editing?.document_number||''} placeholder="Opcional"/></label><label>Titular<select name="owner_user_id" defaultValue={editing?.owner_user_id||userId}><option value="">Hogar</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label></div>
    <div className="two"><label>Fecha de emisión<input name="issued_on" type="date" defaultValue={editing?.issued_on||''}/></label><label>Fecha de vencimiento<input name="expires_on" type="date" defaultValue={editing?.expires_on||''}/></label></div>
    <label>Privacidad<select name="access_scope" value={editing?.file_path?editing.access_scope:scopeDraft} disabled={Boolean(editing?.file_path)} onChange={e=>setScopeDraft(e.target.value as AccessScope)}><option value="household">Compartido con el hogar</option><option value="private">Privado · solo yo</option></select></label>
    {editing?.file_path&&<p className="document-privacy-note"><LockKeyhole/> Para proteger correctamente el archivo, la privacidad no puede cambiar mientras exista un adjunto. Puedes reemplazar el archivo manteniendo el mismo nivel de acceso.</p>}
    <label>Etiquetas<input name="tags" defaultValue={(editing?.tags||[]).join(', ')} placeholder="Ej. viaje, carro, 2027"/></label>
    <label>Notas<textarea name="notes" defaultValue={editing?.notes||''} rows={3} placeholder="Información útil, cobertura, ubicación física, etc."/></label>
    <label className="document-upload"><Upload/><div><strong>{editing?.file_path?'Reemplazar archivo':'Adjuntar archivo'}</strong><small>PDF, imágenes, Word o Excel · máximo 15 MB</small></div><input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"/></label>
    <button className="finance-primary" disabled={busy}><BadgeCheck/>{busy?'Guardando...':editing?'Guardar cambios':'Guardar en la bóveda'}</button>
   </form>
  </div></div>}
 </section>
}

function expiryStatus(value:string|null){
 if(!value)return{tone:'neutral',label:'Sin vencimiento'};
 const today=iso(),target=new Date(value+'T12:00'),now=new Date(today+'T12:00'),days=Math.ceil((target.getTime()-now.getTime())/86400000);
 if(days<0)return{tone:'expired',label:'Vencido'};
 if(days===0)return{tone:'urgent',label:'Vence hoy'};
 if(days<=7)return{tone:'urgent',label:'Vence en '+days+' d'};
 if(days<=30)return{tone:'soon',label:'Vence en '+days+' d'};
 return{tone:'valid',label:'Vigente'};
}
function categoryLabel(id:DocCategory){return categories.find(c=>c.id===id)?.label||'Otros'}
function memberName(id:string,members:Member[],userId:string){if(id===userId)return'Yo';return members.find(m=>m.user_id===id)?.full_name||'Miembro'}
function fileTypeLabel(mime:string){if(mime==='application/pdf')return'PDF';if(mime.startsWith('image/'))return'Imagen';if(mime.includes('word'))return'Word';if(mime.includes('excel')||mime.includes('sheet'))return'Excel';return'Archivo'}
function categoryIcon(category:DocCategory){if(category==='personal')return <ModuleIcon name="documents"/>;if(category==='home')return <ModuleIcon name="home"/>;if(category==='vehicle')return <Car/>;if(category==='health')return <ModuleIcon name="health"/>;if(category==='finance')return <ModuleIcon name="finance"/>;if(category==='insurance')return <ShieldCheck/>;if(category==='warranty')return <BadgeCheck/>;if(category==='education')return <GraduationCap/>;return <ModuleIcon name="documents"/>}
