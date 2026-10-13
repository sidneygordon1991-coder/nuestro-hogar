import {FormEvent,useEffect,useMemo,useState} from 'react';
import {ArrowLeft,CalendarClock,Check,CheckCircle2,ChevronRight,ListChecks,Plus,ShoppingCart,Trash2,Users,X} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type ListType='general'|'shopping'|'tasks';
type ListRow={id:string;title:string;list_type:ListType;created_at:string};
type ListItem={id:string;list_id:string;text:string;completed:boolean;quantity:string|null;assigned_to:string|null;due_date:string|null;notes:string|null;sort_order:number;created_at:string};
type Member={user_id:string;full_name:string};

const today=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};

export default function ListsCenter({household,onChanged}:{household:Household;onChanged?:()=>void}){
 const [lists,setLists]=useState<ListRow[]>([]),[items,setItems]=useState<ListItem[]>([]),[members,setMembers]=useState<Member[]>([]);
 const [selected,setSelected]=useState<string|null>(null),[showNew,setShowNew]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 useEffect(()=>{load();const channel=supabase.channel('shared-lists-'+household.id)
  .on('postgres_changes',{event:'*',schema:'public',table:'lists',filter:'household_id=eq.'+household.id},()=>load(false))
  .on('postgres_changes',{event:'*',schema:'public',table:'list_items',filter:'household_id=eq.'+household.id},()=>load(false))
  .subscribe();
  return()=>{supabase.removeChannel(channel)}
 },[household.id]);

 async function load(showLoader=true){
  if(showLoader)setBusy(true);
  const [listR,itemR,memberR]=await Promise.all([
   supabase.from('lists').select('id,title,list_type,created_at').eq('household_id',household.id).order('created_at',{ascending:false}),
   supabase.from('list_items').select('id,list_id,text,completed,quantity,assigned_to,due_date,notes,sort_order,created_at').eq('household_id',household.id).order('completed').order('sort_order').order('created_at'),
   supabase.from('household_members').select('user_id').eq('household_id',household.id)
  ]);
  const memberIds=(memberR.data||[]).map((m:any)=>m.user_id);
  const profileR=memberIds.length?await supabase.from('profiles').select('id,full_name').in('id',memberIds):{data:[] as any[]};
  const nameMap=new Map((profileR.data||[]).map((p:any)=>[p.id,p.full_name||'Miembro']));
  setLists((listR.data||[]) as ListRow[]);setItems((itemR.data||[]) as ListItem[]);
  setMembers(memberIds.map((id:string)=>({user_id:id,full_name:String(nameMap.get(id)||'Miembro')})));
  if(listR.error||itemR.error)setMessage('No se pudieron cargar todas las listas.');
  if(showLoader)setBusy(false);
 }

 const selectedList=lists.find(l=>l.id===selected)||null;
 const selectedItems=useMemo(()=>items.filter(i=>i.list_id===selected),[items,selected]);
 const pendingCount=selectedItems.filter(i=>!i.completed).length;

 async function addList(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const {data,error}=await supabase.from('lists').insert({household_id:household.id,title:String(f.get('title')).trim(),list_type:String(f.get('list_type')||'general')}).select('id').single();
  setBusy(false);if(error){setMessage(error.message);return}setShowNew(false);await load(false);onChanged?.();if(data?.id)setSelected(data.id);
 }

 async function addItem(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!selectedList)return;setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const {error}=await supabase.from('list_items').insert({household_id:household.id,list_id:selectedList.id,text:String(f.get('text')).trim(),quantity:String(f.get('quantity')||'').trim()||null,assigned_to:String(f.get('assigned_to')||'')||null,due_date:String(f.get('due_date')||'')||null,notes:String(f.get('notes')||'').trim()||null,sort_order:selectedItems.length});
  setBusy(false);if(error){setMessage(error.message);return}(e.currentTarget as HTMLFormElement).reset();await load(false);
 }

 async function toggleItem(item:ListItem){
  const {error}=await supabase.from('list_items').update({completed:!item.completed,completed_at:!item.completed?new Date().toISOString():null}).eq('id',item.id).eq('household_id',household.id);
  if(error)setMessage(error.message);else await load(false);
 }

 async function deleteItem(item:ListItem){
  const {error}=await supabase.from('list_items').delete().eq('id',item.id).eq('household_id',household.id);
  if(error)setMessage(error.message);else await load(false);
 }

 async function clearCompleted(){
  if(!selectedList||!selectedItems.some(i=>i.completed))return;
  const {error}=await supabase.from('list_items').delete().eq('list_id',selectedList.id).eq('household_id',household.id).eq('completed',true);
  if(error)setMessage(error.message);else await load(false);
 }

 async function deleteList(){
  if(!selectedList||!window.confirm('¿Eliminar esta lista y todos sus elementos?'))return;
  setBusy(true);await supabase.from('list_items').delete().eq('list_id',selectedList.id).eq('household_id',household.id);
  const {error}=await supabase.from('lists').delete().eq('id',selectedList.id).eq('household_id',household.id);
  setBusy(false);if(error){setMessage(error.message);return}setSelected(null);await load(false);onChanged?.();
 }

 const memberName=(id:string|null)=>members.find(m=>m.user_id===id)?.full_name||'Sin asignar';

 if(selectedList)return <section className="lists-v2">
  <div className="list-detail-head"><button className="icon-button" onClick={()=>setSelected(null)}><ArrowLeft/></button><div><p className="eyebrow">{listTypeLabel(selectedList.list_type)}</p><h2 className="page-title">{selectedList.title}</h2><p className="muted">{pendingCount} pendiente{pendingCount===1?'':'s'} · {selectedItems.length} elemento{selectedItems.length===1?'':'s'}</p></div><button className="icon-button danger" onClick={deleteList}><Trash2/></button></div>
  {message&&<div className="finance-message">{message}<button onClick={()=>setMessage('')}><X size={15}/></button></div>}

  <form className="list-item-form" onSubmit={addItem}>
   <div className="list-item-main-input"><input name="text" placeholder={selectedList.list_type==='shopping'?'Ej. Leche, verduras, café':'Agregar pendiente'} required/><input name="quantity" placeholder="Cant."/></div>
   <div className="list-item-options"><select name="assigned_to" defaultValue=""><option value="">Sin asignar</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select><input name="due_date" type="date" min={today()}/><input name="notes" placeholder="Nota opcional"/><button disabled={busy}><Plus/> Agregar</button></div>
  </form>

  <div className="list-progress-card"><div><strong>{selectedItems.length?Math.round(selectedItems.filter(i=>i.completed).length/selectedItems.length*100):0}%</strong><span>completado</span></div><div className="progress"><span style={{width:(selectedItems.length?Math.round(selectedItems.filter(i=>i.completed).length/selectedItems.length*100):0)+'%'}}/></div>{selectedItems.some(i=>i.completed)&&<button onClick={clearCompleted}>Limpiar completados</button>}</div>

  <div className="list-items-v2">{selectedItems.map(item=><article className={'list-item-v2 '+(item.completed?'done':'')} key={item.id}>
   <button className="list-check" onClick={()=>toggleItem(item)}>{item.completed?<Check/>:null}</button>
   <div className="list-item-copy"><div><strong>{item.text}</strong>{item.quantity&&<span className="qty">{item.quantity}</span>}</div><small>{item.assigned_to&&<><Users/> {memberName(item.assigned_to)}</>}{item.due_date&&<><CalendarClock/> {new Date(item.due_date+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short'})}</>}</small>{item.notes&&<em>{item.notes}</em>}</div>
   <button className="list-delete-item" onClick={()=>deleteItem(item)}><Trash2/></button>
  </article>)}
  {!selectedItems.length&&<div className="list-empty-v2"><ListChecks/><strong>Lista vacía</strong><span>Agrega el primer elemento para empezar.</span></div>}
 </div>
 </section>;

 return <section className="lists-v2">
  <div className="finance-top"><div><p className="eyebrow">NUESTRO HOGAR</p><h2 className="page-title">Listas</h2><p className="muted">Compras, tareas y pendientes compartidos en tiempo real.</p></div><button className="finance-new" onClick={()=>setShowNew(true)}><Plus/> Lista</button></div>
  {message&&<div className="finance-message">{message}<button onClick={()=>setMessage('')}><X size={15}/></button></div>}
  <div className="lists-overview">{lists.map(list=>{const listItems=items.filter(i=>i.list_id===list.id),done=listItems.filter(i=>i.completed).length,progress=listItems.length?Math.round(done/listItems.length*100):0;return <button className="list-card-v2" key={list.id} onClick={()=>setSelected(list.id)}><span className={'list-card-icon '+list.list_type}>{list.list_type==='shopping'?<ShoppingCart/>:list.list_type==='tasks'?<CheckCircle2/>:<ListChecks/>}</span><div className="list-card-copy"><strong>{list.title}</strong><small>{listItems.length-done} pendientes · {listItems.length} total</small><div className="progress"><span style={{width:progress+'%'}}/></div></div><div className="list-card-progress"><b>{progress}%</b><ChevronRight/></div></button>})}</div>
  {!lists.length&&!busy&&<div className="list-empty-v2"><ListChecks/><strong>Aún no hay listas</strong><span>Crea una lista de compras, tareas o pendientes.</span><button onClick={()=>setShowNew(true)}><Plus/> Crear primera lista</button></div>}

  {showNew&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowNew(false)}}><div className="finance-modal"><div className="modal-head"><h3>Nueva lista</h3><button onClick={()=>setShowNew(false)}><X/></button></div><form className="finance-form" onSubmit={addList}><label>Nombre<input name="title" placeholder="Ej. Supermercado" required/></label><label>Tipo<select name="list_type" defaultValue="shopping"><option value="shopping">Compras</option><option value="tasks">Tareas</option><option value="general">General</option></select></label><button className="finance-primary" disabled={busy}>{busy?'Creando...':'Crear lista'}</button></form></div></div>}
 </section>
}

function listTypeLabel(type:ListType){return type==='shopping'?'LISTA DE COMPRAS':type==='tasks'?'LISTA DE TAREAS':'LISTA COMPARTIDA'}
