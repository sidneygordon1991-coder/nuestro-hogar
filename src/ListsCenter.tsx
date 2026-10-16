import WorkspaceTitle from './WorkspaceTitle';
import ModuleIcon from './ModuleIcon';
import {FormEvent,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,CalendarClock,Check,CheckCircle2,ChevronRight,Pencil,Pin,Plus,Repeat2,ShoppingCart,Trash2,X} from 'lucide-react';
import {supabase} from './lib/supabase';
type Household={id:string;name:string;invite_code:string};
type ListType='general'|'shopping'|'tasks';
type ListRow={id:string;title:string;list_type:ListType;created_at:string;is_pinned:boolean;shopping_week:string|null};
type Frequency='none'|'daily'|'weekly';
type ListItem={id:string;list_id:string;text:string;completed:boolean;quantity:string|null;assigned_to:string|null;due_date:string|null;notes:string|null;sort_order:number;created_at:string;routine_frequency:Frequency;routine_series_id:string|null;routine_members:string[];shopping_week:string|null};
type Member={user_id:string;full_name:string};
const today=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const frequencyLabel=(f:Frequency)=>f==='daily'?'Cada día':f==='weekly'?'Cada semana':'Sin repetición';
export default function ListsCenter({household,onChanged,readOnly=false}:{household:Household;onChanged?:()=>void;readOnly?:boolean}){
 const [lists,setLists]=useState<ListRow[]>([]),[items,setItems]=useState<ListItem[]>([]),[members,setMembers]=useState<Member[]>([]);
 const [selected,setSelected]=useState<string|null>(null),[showNew,setShowNew]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [editingList,setEditingList]=useState<ListRow|null>(null),[editingItem,setEditingItem]=useState<ListItem|null>(null);
 const [newFrequency,setNewFrequency]=useState<Frequency>('none'),[editFrequency,setEditFrequency]=useState<Frequency>('none');
 const request=useRef(0);
 useEffect(()=>{load();const channel=supabase.channel('shared-lists-'+household.id)
  .on('postgres_changes',{event:'*',schema:'public',table:'lists',filter:'household_id=eq.'+household.id},()=>load(false))
  .on('postgres_changes',{event:'*',schema:'public',table:'list_items',filter:'household_id=eq.'+household.id},()=>load(false)).subscribe();
  return()=>{request.current++;supabase.removeChannel(channel)};
 },[household.id]);
 async function load(showLoader=true){
  const req=++request.current;if(showLoader)setBusy(true);
  const [listR,itemR,memberR]=await Promise.all([
   supabase.from('lists').select('id,title,list_type,created_at,is_pinned,shopping_week').eq('household_id',household.id).order('created_at',{ascending:false}),
   supabase.from('list_items').select('id,list_id,text,completed,quantity,assigned_to,due_date,notes,sort_order,created_at,routine_frequency,routine_series_id,routine_members,shopping_week').eq('household_id',household.id).order('completed').order('due_date').order('sort_order').order('created_at'),
   supabase.from('household_members').select('user_id').eq('household_id',household.id)
  ]);
  const memberIds=(memberR.data||[]).map((m:any)=>m.user_id);
  const profileR=memberIds.length?await supabase.from('profiles').select('id,full_name').in('id',memberIds):{data:[] as any[]};
  if(req!==request.current)return;
  const names=new Map((profileR.data||[]).map((p:any)=>[p.id,p.full_name||'Miembro']));
  if(listR.error||itemR.error){setMessage('No se pudieron verificar las listas. Vuelve a intentarlo.');if(showLoader)setBusy(false);return}
  setLists((listR.data||[]) as ListRow[]);setItems((itemR.data||[]) as ListItem[]);setMembers(memberIds.map((id:string)=>({user_id:id,full_name:String(names.get(id)||'Miembro')})));
  if(showLoader)setBusy(false);
 }
 const selectedList=lists.find(l=>l.id===selected)||null;
 const selectedItems=useMemo(()=>items.filter(i=>i.list_id===selected),[items,selected]);
 const pendingCount=selectedItems.filter(i=>!i.completed).length;
 const memberName=(id:string|null)=>members.find(m=>m.user_id===id)?.full_name||'Sin asignar';
 async function mutate(action:()=>PromiseLike<{error:any}>,success?:()=>void){
  if(readOnly||busy)return;setBusy(true);setMessage('');
  try{const {error}=await action();if(error)throw error;success?.();await load(false);onChanged?.()}
  catch(e:any){setMessage(e?.message||'No se pudo guardar. Tus datos siguen en el formulario.')}
  finally{setBusy(false)}
 }
 async function addList(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const f=new FormData(e.currentTarget),title=String(f.get('title')||'').trim();if(!title){setMessage('Escribe un nombre para la lista.');return}
  await mutate(async()=>{const r=await supabase.from('lists').insert({household_id:household.id,title,list_type:String(f.get('list_type')||'general')}).select('id').single();if(!r.error&&r.data)setSelected(r.data.id);return r},()=>setShowNew(false));
 }
 function fields(f:FormData,frequency:Frequency,existing?:ListItem){
  const text=String(f.get('text')||'').trim(),due_date=String(f.get('due_date')||'')||null;
  if(!text)throw new Error('Escribe el nombre del elemento.');
  if(frequency!=='none'&&!due_date)throw new Error('Elige una fecha para comenzar la rutina.');
  const routine_members=existing?.completed?existing.routine_members:frequency==='none'?[]:f.getAll('routine_members').map(String);
  return {text,quantity:String(f.get('quantity')||'').trim()||null,assigned_to:existing?.completed?existing.assigned_to:String(f.get('assigned_to')||'')||routine_members[0]||null,due_date,notes:String(f.get('notes')||'').trim()||null,routine_frequency:frequency,routine_members,routine_series_id:existing?.routine_series_id||(frequency==='none'?null:crypto.randomUUID())};
 }
 async function addItem(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!selectedList)return;const form=e.currentTarget;
  try{const payload=fields(new FormData(form),selectedList.list_type==='shopping'?'none':newFrequency);
   await mutate(()=>supabase.from('list_items').insert({...payload,household_id:household.id,list_id:selectedList.id,sort_order:selectedItems.length}),()=>{form.reset();const options=form.querySelector('details');if(options)options.open=false;setNewFrequency('none')});
  }catch(e:any){setMessage(e.message);const options=form.querySelector('details');if(options)options.open=true}
 }
 async function saveItem(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!editingItem)return;
  try{const payload=fields(new FormData(e.currentTarget),editFrequency,editingItem);
   await mutate(()=>supabase.from('list_items').update(payload).eq('id',editingItem.id).eq('household_id',household.id).eq('completed',editingItem.completed).select('id').single(),()=>setEditingItem(null));
  }catch(e:any){setMessage(e.message)}
 }
 async function saveList(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!editingList)return;const title=String(new FormData(e.currentTarget).get('title')||'').trim();if(!title){setMessage('Escribe un nombre para la lista.');return}
  await mutate(()=>supabase.from('lists').update({title,updated_at:new Date().toISOString()}).eq('id',editingList.id).eq('household_id',household.id).select('id').single(),()=>setEditingList(null));
 }
 async function deleteList(){
  if(!selectedList||!window.confirm('¿Eliminar esta lista y sus elementos? Las rutinas de esta lista dejarán de continuar.'))return;
  await mutate(()=>supabase.from('lists').delete().eq('id',selectedList.id).eq('household_id',household.id),()=>setSelected(null));
 }
 const notice=message&&<div className="finance-message" role="alert">{message}<button aria-label="Cerrar aviso" onClick={()=>setMessage('')}><X size={15}/></button></div>;
 return <section className="lists-v2">
  {selectedList?<>
   <div className="list-detail-head"><button className="icon-button" aria-label="Volver a mis listas" onClick={()=>{setSelected(null);setNewFrequency('none')}}><ArrowLeft/></button><div><p className="eyebrow">{listTypeLabel(selectedList.list_type)}</p><h2 className="page-title">{selectedList.title}</h2><p className="muted">{pendingCount} pendiente{pendingCount===1?'':'s'} · {selectedItems.length} elemento{selectedItems.length===1?'':'s'}</p></div>{!readOnly&&<div className="list-head-actions"><button className="icon-button" disabled={busy} aria-label="Editar nombre de lista" onClick={()=>setEditingList(selectedList)}><Pencil/></button><button className="icon-button danger" disabled={busy} aria-label="Eliminar lista" onClick={deleteList}><Trash2/></button></div>}</div>
   {notice}
   {!readOnly&&<form className="list-item-form" noValidate onSubmit={addItem}>
    <div className="list-item-main-input"><input name="text" aria-label="Nuevo elemento" placeholder={selectedList.list_type==='shopping'?'Ej. Leche, verduras, café':'Agregar pendiente'} maxLength={500} required/><input name="quantity" aria-label="Cantidad" placeholder="Cant." maxLength={100}/></div>
    <button className="list-item-submit" disabled={busy}><Plus/> Agregar</button>
    <details className="list-options-details"><summary>Responsable, fecha y opciones</summary><div className="list-item-options"><select name="assigned_to" aria-label="Responsable" defaultValue=""><option value="">Sin asignar</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select><input name="due_date" aria-label="Fecha del pendiente" type="date" required={newFrequency!=='none'}/><input name="notes" aria-label="Nota del elemento" placeholder="Nota opcional" maxLength={2000}/></div>
    {selectedList.list_type!=='shopping'&&<RoutineFields frequency={newFrequency} setFrequency={setNewFrequency} members={members}/>}</details>
   </form>}
   {selectedList.shopping_week&&<p className="daily-agenda-caption">Lista del menú semanal. Al sincronizar desde Comidas, solo se recalculan las cantidades automáticas pendientes. Se conservan los elementos manuales y las compras completadas.</p>}
   <div className="list-progress-card"><div><strong>{selectedItems.length?Math.round((selectedItems.length-pendingCount)/selectedItems.length*100):0}%</strong><span>completado</span></div><div className="progress"><span style={{width:(selectedItems.length?Math.round((selectedItems.length-pendingCount)/selectedItems.length*100):0)+'%'}}/></div>{!readOnly&&selectedItems.some(i=>i.completed)&&<button disabled={busy} onClick={()=>{if(window.confirm('¿Eliminar los elementos completados? Las próximas tareas de las rutinas se conservan.'))mutate(()=>supabase.from('list_items').delete().eq('list_id',selectedList.id).eq('household_id',household.id).eq('completed',true))}}>Limpiar completados</button>}</div>
   <div className="list-items-v2">{selectedItems.map(item=><article className={'list-item-v2 '+(item.completed?'done':'')} key={item.id}>
    <button className="list-check" disabled={readOnly||busy} aria-label={(item.completed?'Marcar pendiente ':'Completar ')+item.text} aria-pressed={item.completed} onClick={()=>mutate(()=>supabase.rpc('complete_household_list_item',{p_household_id:household.id,p_item_id:item.id,p_completed:!item.completed}))}>{item.completed?<Check/>:null}</button>
    <div className="list-item-copy"><div><strong>{item.text}</strong>{item.quantity&&<span className="qty">{item.quantity}</span>}</div><small>{item.assigned_to&&<><ModuleIcon name="family"/> {memberName(item.assigned_to)}</>}{item.due_date&&<><CalendarClock/> {new Date(item.due_date+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short'})}{!item.completed&&item.due_date<today()?' · Vencido':''}</>}</small>{item.routine_frequency&&item.routine_frequency!=='none'&&<span className="routine-badge"><Repeat2 size={13}/>{frequencyLabel(item.routine_frequency)}{item.routine_members?.length>1?' · responsables rotativos':''}</span>}{item.notes&&<em>{item.notes}</em>}</div>
    {!readOnly&&<div className="list-row-actions"><button className="list-delete-item" disabled={busy} aria-label={'Editar elemento '+item.text} onClick={()=>{setEditingItem(item);setEditFrequency(item.routine_frequency||'none')}}><Pencil/></button><button className="list-delete-item" disabled={busy} aria-label={'Eliminar elemento '+item.text} onClick={()=>{if(item.routine_frequency!=='none'&&!item.completed&&!window.confirm('¿Eliminar esta tarea? La rutina no continuará desde este elemento.'))return;mutate(()=>supabase.from('list_items').delete().eq('id',item.id).eq('household_id',household.id))}}><Trash2/></button></div>}
   </article>)}{!selectedItems.length&&<div className="list-empty-v2"><ModuleIcon name="lists"/><strong>Lista vacía</strong><span>Agrega el primer elemento para empezar.</span></div>}</div>
  </>:<>
   <div className="finance-top"><WorkspaceTitle module="lists" eyebrow="NUESTRO HOGAR" title="Listas" description="Compras, tareas y rutinas que se reparten en casa."/>{!readOnly&&<button className="finance-new" onClick={()=>setShowNew(true)}><Plus/> Lista</button>}</div>{notice}
   <div className="lists-overview">{[...lists].sort((a,b)=>Number(Boolean(b.is_pinned))-Number(Boolean(a.is_pinned))).map(list=>{const all=items.filter(i=>i.list_id===list.id),done=all.filter(i=>i.completed).length,progress=all.length?Math.round(done/all.length*100):0;return <div className="list-overview-entry" key={list.id}><button className="list-card-v2" onClick={()=>setSelected(list.id)}><span className={'list-card-icon '+list.list_type}>{list.list_type==='shopping'?<ShoppingCart/>:list.list_type==='tasks'?<CheckCircle2/>:<ModuleIcon name="lists"/>}</span><div className="list-card-copy"><strong>{list.title}</strong><small>{all.length-done} pendientes · {all.length} total{list.is_pinned?' · Fijada':''}</small><div className="progress"><span style={{width:progress+'%'}}/></div></div><div className="list-card-progress"><b>{progress}%</b><ChevronRight/></div></button>{!readOnly&&<button className="list-pin" disabled={busy} aria-pressed={Boolean(list.is_pinned)} aria-label={(list.is_pinned?'Desfijar ':'Fijar ')+list.title} title="Fijar para todo el hogar" onClick={()=>mutate(()=>supabase.from('lists').update({is_pinned:!list.is_pinned}).eq('id',list.id).eq('household_id',household.id))}><Pin size={16}/></button>}</div>})}</div>
   {!lists.length&&!busy&&<div className="list-empty-v2"><ModuleIcon name="lists"/><strong>Aún no hay listas</strong><span>{readOnly?'No hay listas compartidas disponibles.':'Crea una lista de compras, tareas o pendientes.'}</span>{!readOnly&&<button onClick={()=>setShowNew(true)}><Plus/> Crear primera lista</button>}</div>}
  </>}
  {showNew&&!readOnly&&<div className="modal-backdrop"><div className="finance-modal"><div className="modal-head"><h3>Nueva lista</h3><button disabled={busy} onClick={()=>setShowNew(false)}><X/></button></div>{notice}<form className="finance-form" onSubmit={addList}><label>Nombre<input name="title" placeholder="Ej. Supermercado" maxLength={120} required/></label><label>Tipo<select name="list_type" defaultValue="shopping"><option value="shopping">Compras</option><option value="tasks">Tareas</option><option value="general">General</option></select></label><button className="finance-primary" disabled={busy}>{busy?'Creando...':'Crear lista'}</button></form></div></div>}
  {editingList&&!readOnly&&<div className="modal-backdrop"><div className="finance-modal"><div className="modal-head"><h3>Editar lista</h3><button disabled={busy} onClick={()=>setEditingList(null)}><X/></button></div>{notice}<form className="finance-form" onSubmit={saveList}><label>Nombre de la lista<input name="title" defaultValue={editingList.title} maxLength={120} required/></label><button className="finance-primary" disabled={busy}>Guardar lista</button></form></div></div>}
  {editingItem&&!readOnly&&<div className="modal-backdrop"><div className="finance-modal"><div className="modal-head"><h3>Editar elemento</h3><button disabled={busy} onClick={()=>setEditingItem(null)}><X/></button></div>{notice}<form className="finance-form" onSubmit={saveItem}><label>Elemento<input name="text" defaultValue={editingItem.text} maxLength={500} required/></label><label>Cantidad del elemento<input name="quantity" defaultValue={editingItem.quantity||''} maxLength={100}/></label><label>Responsable del elemento<select name="assigned_to" defaultValue={editingItem.assigned_to||''}><option value="">Sin asignar</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label><label>Fecha del elemento<input type="date" name="due_date" defaultValue={editingItem.due_date||''} required={editFrequency!=='none'}/></label><label>Nota del elemento<textarea name="notes" defaultValue={editingItem.notes||''} rows={3} maxLength={2000}/></label>{selectedList?.list_type!=='shopping'&&<RoutineFields frequency={editFrequency} setFrequency={setEditFrequency} members={members} selected={editingItem.routine_members||[]} disabled={editingItem.completed}/>}{editingItem.completed&&editingItem.routine_frequency!=='none'&&<p className="daily-agenda-caption">Este registro conserva el historial. Edita la próxima tarea pendiente para cambiar la rutina. Desmarcar este registro no elimina la próxima tarea.</p>}<button className="finance-primary" disabled={busy}>Guardar elemento</button></form></div></div>}
 </section>;
}
function RoutineFields({frequency,setFrequency,members,selected=[],disabled=false}:{frequency:Frequency;setFrequency:(f:Frequency)=>void;members:Member[];selected?:string[];disabled?:boolean}){
 return <div className="routine-options"><label>Repetir tarea<select value={frequency} disabled={disabled} onChange={e=>setFrequency(e.target.value as Frequency)}><option value="none">No repetir</option><option value="daily">Cada día</option><option value="weekly">Cada semana</option></select></label>{frequency!=='none'&&<><p>Al completarla, se conserva el historial y se crea la próxima fecha. Si está atrasada, continúa en la siguiente fecha futura.</p><fieldset disabled={disabled}><legend>Rotar responsables (opcional)</legend><small>Selecciona dos o más personas. El turno sigue el orden mostrado.</small>{members.map(m=><label key={m.user_id}><input type="checkbox" name="routine_members" value={m.user_id} defaultChecked={selected.includes(m.user_id)}/>{m.full_name}</label>)}</fieldset></>}</div>;
}
function listTypeLabel(type:ListType){return type==='shopping'?'LISTA DE COMPRAS':type==='tasks'?'LISTA DE TAREAS':'LISTA COMPARTIDA'}
