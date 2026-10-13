import {FormEvent,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowDownLeft,ArrowUpRight,CalendarDays,Car,Check,FileText,ListChecks,Package,Plus,ReceiptText,Search,ShoppingCart,Users,Utensils,WalletCards,Wrench,X} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type Mode='search'|'quick'|null;
type QuickAction='expense'|'income'|'task'|'shopping'|'event'|'document'|'maintenance'|null;
type SearchResult={result_type:string;entity_id:string;title:string;subtitle:string;action_tab:string;occurred_on:string|null;score:number};
type Category={id:string;name:string};
type Account={id:string;name:string;account_type:string;account_class:string};
type ListRow={id:string;title:string;list_type:string};
type Asset={id:string;name:string;asset_type:string};
type Member={user_id:string;full_name:string};

const iso=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const money=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:2}).format(n);

export default function GlobalCommandCenter({household,access,onNavigate,onChanged}:{household:Household;access?:Record<string,'none'|'view'|'edit'>;onNavigate:(tab:string)=>void;onChanged?:()=>void}){
 const canEdit=(module:string)=>!access||access[module]==='edit';
 const hasQuickEdit=canEdit('finance')||canEdit('lists')||canEdit('calendar')||canEdit('documents')||canEdit('maintenance');
 const [mode,setMode]=useState<Mode>(null),[action,setAction]=useState<QuickAction>(null);
 const [query,setQuery]=useState(''),[results,setResults]=useState<SearchResult[]>([]),[searching,setSearching]=useState(false);
 const [categories,setCategories]=useState<Category[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[lists,setLists]=useState<ListRow[]>([]),[assets,setAssets]=useState<Asset[]>([]),[members,setMembers]=useState<Member[]>([]),[userId,setUserId]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const searchInput=useRef<HTMLInputElement|null>(null);

 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch()}};
  const quick=()=>openQuick();
  window.addEventListener('keydown',key);window.addEventListener('nh:quick-add',quick as EventListener);
  return()=>{window.removeEventListener('keydown',key);window.removeEventListener('nh:quick-add',quick as EventListener)}
 },[household.id]);

 useEffect(()=>{if(!mode)return;loadMeta();if(mode==='search')setTimeout(()=>searchInput.current?.focus(),20)},[mode,household.id]);

 useEffect(()=>{
  if(mode!=='search'){setResults([]);return}
  const needle=query.trim();
  if(needle.length<2){setResults([]);setSearching(false);return}
  let cancelled=false;
  const timer=window.setTimeout(async()=>{
   setSearching(true);
   const {data,error}=await supabase.rpc('global_search',{p_household_id:household.id,p_query:needle,p_limit:50});
   if(cancelled)return;
   setSearching(false);
   if(error){setMessage(error.message);setResults([]);return}
   setResults((data||[]) as SearchResult[]);
  },220);
  return()=>{cancelled=true;window.clearTimeout(timer)}
 },[query,mode,household.id]);

 async function loadMeta(){
  const {data:{user}}=await supabase.auth.getUser();
  setUserId(user?.id||'');
  const [catR,accR,listR,assetR,memberR]=await Promise.all([
   supabase.from('budget_categories').select('id,name').eq('household_id',household.id).order('name'),
   supabase.from('finance_accounts').select('id,name,account_type,account_class').eq('household_id',household.id).eq('active',true).order('name'),
   supabase.from('lists').select('id,title,list_type').eq('household_id',household.id).order('created_at',{ascending:false}),
   supabase.from('finance_assets').select('id,name,asset_type').eq('household_id',household.id).eq('active',true).in('asset_type',['vehicle','property','other']).order('name'),
   supabase.from('household_members').select('user_id').eq('household_id',household.id)
  ]);
  setCategories((catR.data||[]) as Category[]);setAccounts((accR.data||[]) as Account[]);setLists((listR.data||[]) as ListRow[]);setAssets((assetR.data||[]) as Asset[]);
  const ids=(memberR.data||[]).map((m:any)=>m.user_id);
  const profiles=ids.length?await supabase.from('profiles').select('id,full_name').in('id',ids):{data:[] as any[]};
  const names=new Map((profiles.data||[]).map((p:any)=>[p.id,p.full_name||'Miembro']));
  setMembers(ids.map((id:string)=>({user_id:id,full_name:String(names.get(id)||'Miembro')})));
 }

 function openSearch(){setAction(null);setMessage('');setMode('search')}
 function openQuick(){setAction(null);setMessage('');setMode('quick')}
 function close(){setMode(null);setAction(null);setMessage('');setQuery('');setResults([])}
 function success(text:string){setBusy(false);setMessage(text);setAction(null);onChanged?.()}

 function openResult(row:SearchResult){close();onNavigate(row.action_tab)}

 async function saveTransaction(e:FormEvent<HTMLFormElement>,type:'expense'|'income'){
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const amount=Number(f.get('amount')||0);
  const {error}=await supabase.rpc('quick_add_transaction',{
   p_household_id:household.id,
   p_description:String(f.get('description')||'').trim(),
   p_amount:amount,
   p_type:type,
   p_transaction_date:String(f.get('date')||iso()),
   p_category_id:String(f.get('category_id')||'')||null,
   p_account_id:String(f.get('account_id')||'')||null,
   p_paid_by:userId||null,
   p_is_shared:f.get('is_shared')==='on',
   p_notes:String(f.get('notes')||'').trim()||null
  });
  if(error){setBusy(false);setMessage(error.message);return}
  success((type==='expense'?'Gasto':'Ingreso')+' guardado: '+money(amount));
 }

 async function ensureList(title:string,listType:string){
  const local=lists.find(l=>l.list_type===listType)||lists.find(l=>l.title.toLocaleLowerCase('es-GT')===title.toLocaleLowerCase('es-GT'));
  if(local)return local.id;
  const {data,error}=await supabase.from('lists').insert({household_id:household.id,title,list_type:listType}).select('id').single();
  if(error||!data)throw new Error(error?.message||'No se pudo crear la lista.');
  setLists(current=>[{id:data.id,title,list_type:listType},...current]);
  return data.id as string;
 }

 async function saveTask(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  try{
   const listId=String(f.get('list_id')||'')||await ensureList('Pendientes','tasks');
   const {error}=await supabase.from('list_items').insert({household_id:household.id,list_id:listId,text:String(f.get('text')||'').trim(),assigned_to:String(f.get('assigned_to')||'')||null,due_date:String(f.get('due_date')||'')||null,notes:String(f.get('notes')||'').trim()||null});
   if(error)throw error;success('Tarea agregada.');
  }catch(error:any){setBusy(false);setMessage(error?.message||'No se pudo guardar la tarea.')}
 }

 async function saveShopping(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  try{
   const listId=await ensureList('Supermercado','shopping'),text=String(f.get('text')||'').trim();
   const {data:existing}=await supabase.from('list_items').select('id').eq('household_id',household.id).eq('list_id',listId).eq('completed',false).ilike('text',text).limit(1).maybeSingle();
   if(existing?.id){setBusy(false);setMessage(text+' ya está pendiente en Supermercado.');return}
   const {error}=await supabase.from('list_items').insert({household_id:household.id,list_id:listId,text,quantity:String(f.get('quantity')||'').trim()||null,notes:String(f.get('notes')||'').trim()||null});
   if(error)throw error;success('Producto agregado a Supermercado.');
  }catch(error:any){setBusy(false);setMessage(error?.message||'No se pudo agregar la compra.')}
 }

 async function saveEvent(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const allDay=f.get('all_day')==='on';
  const {error}=await supabase.from('events').insert({
   household_id:household.id,title:String(f.get('title')||'').trim(),description:String(f.get('description')||'').trim()||null,
   event_date:String(f.get('date')||iso()),start_time:allDay?null:String(f.get('time')||'')||null,
   category:String(f.get('category')||'family'),assigned_to:String(f.get('assigned_to')||'')||null,
   all_day:allDay,recurrence:'none',reminder_minutes:1440
  });
  if(error){setBusy(false);setMessage(error.message);return}
  await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});
  success('Evento agregado a la agenda.');
 }

 async function saveDocument(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!userId)return;setBusy(true);setMessage('');const f=new FormData(e.currentTarget),file=f.get('file') as File|null;
  if(file&&file.size>15*1024*1024){setBusy(false);setMessage('El archivo supera el límite de 15 MB.');return}
  const id=crypto.randomUUID(),isPrivate=f.get('private')==='on';
  let path:string|null=null;
  if(file&&file.size){
   const safe=file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-100)||'archivo';
   path=isPrivate?household.id+'/private/'+userId+'/'+id+'/'+Date.now()+'-'+safe:household.id+'/household/'+id+'/'+Date.now()+'-'+safe;
   const upload=await supabase.storage.from('household-documents').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});
   if(upload.error){setBusy(false);setMessage(upload.error.message);return}
  }
  const {error}=await supabase.from('household_documents').insert({
   id,household_id:household.id,title:String(f.get('title')||'').trim(),category:String(f.get('category')||'other'),
   owner_user_id:isPrivate?userId:null,access_scope:isPrivate?'private':'household',expires_on:String(f.get('expires_on')||'')||null,
   file_path:path,original_filename:file?.size?file.name:null,mime_type:file?.size?(file.type||null):null,file_size:file?.size||null,
   notes:String(f.get('notes')||'').trim()||null,created_by:userId
  });
  if(error){if(path)await supabase.storage.from('household-documents').remove([path]);setBusy(false);setMessage(error.message);return}
  await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});
  success('Documento guardado en la bóveda.');
 }

 async function saveMaintenance(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const nextDate=String(f.get('next_due_date')||'')||null,nextKm=String(f.get('next_due_mileage')||'')?Number(f.get('next_due_mileage')):null,months=String(f.get('interval_months')||'')?Number(f.get('interval_months')):null,km=String(f.get('interval_km')||'')?Number(f.get('interval_km')):null;
  if(!nextDate&&nextKm==null&&months==null&&km==null){setBusy(false);setMessage('Indica una fecha, kilometraje o recurrencia.');return}
  const {data,error}=await supabase.from('maintenance_schedules').insert({
   household_id:household.id,asset_id:String(f.get('asset_id')||'')||null,title:String(f.get('title')||'').trim(),
   maintenance_type:String(f.get('maintenance_type')||'service'),provider:String(f.get('provider')||'').trim()||null,
   next_due_date:nextDate,next_due_mileage:nextKm,interval_months:months,interval_km:km,assigned_to:String(f.get('assigned_to')||'')||null
  }).select('id').single();
  if(error||!data){setBusy(false);setMessage(error?.message||'No se pudo crear el mantenimiento.');return}
  const sync=await supabase.rpc('sync_maintenance_event',{p_schedule_id:data.id});
  if(sync.error){setBusy(false);setMessage(sync.error.message);return}
  await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});
  success('Mantenimiento programado y sincronizado con Agenda.');
 }

 const grouped=useMemo(()=>{
  const map=new Map<string,SearchResult[]>();
  for(const row of results){const key=resultGroup(row.result_type);map.set(key,[...(map.get(key)||[]),row])}
  return [...map.entries()];
 },[results]);

 return <div className="global-command-center">
  <button className="global-search-trigger" onClick={openSearch} title="Buscar en Nuestro Hogar"><Search/><span>Buscar</span><kbd>⌘K</kbd></button>
  {hasQuickEdit&&<button className="global-add-trigger" onClick={openQuick} title="Agregar rápido"><Plus/></button>}

  {mode&&<><button className="global-command-scrim" onClick={close} aria-label="Cerrar"/><section className={'global-command-panel '+mode}>
   <div className="global-command-head">
    <div><p className="eyebrow">{mode==='search'?'BUSCADOR GLOBAL':'AGREGAR RÁPIDO'}</p><h3>{mode==='search'?'Encuentra cualquier cosa':'¿Qué quieres registrar?'}</h3></div>
    <button onClick={close}><X/></button>
   </div>

   {message&&<div className="global-command-message"><Check/>{message}<button onClick={()=>setMessage('')}><X/></button></div>}

   {mode==='search'&&<>
    <label className="global-search-box"><Search/><input ref={searchInput} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Busca gastos, documentos, recetas, vehículos, tareas..."/>{searching&&<span className="global-search-spinner"/>}{query&&<button onClick={()=>setQuery('')}><X/></button>}</label>
    {query.trim().length<2?<div className="global-search-hint"><Search/><strong>Busca en todo Nuestro Hogar</strong><span>Escribe al menos 2 caracteres. Puedes buscar nombres, placas, proveedores, números de documento, recetas y más.</span></div>
    :!searching&&!results.length?<div className="global-search-hint"><Search/><strong>Sin resultados</strong><span>No encontramos coincidencias para “{query.trim()}”.</span></div>
    :<div className="global-search-results">{grouped.map(([group,rows])=><section key={group}><div className="global-result-group-head"><span>{group}</span><b>{rows.length}</b></div>{rows.map(row=><button key={row.result_type+'-'+row.entity_id} onClick={()=>openResult(row)}><span className={'global-result-icon '+row.result_type}>{resultIcon(row.result_type)}</span><div><strong>{row.title}</strong><small>{row.subtitle}{row.occurred_on?' · '+formatDate(row.occurred_on):''}</small></div><ChevronResult/></button>)}</section>)}</div>}
   </>}

   {mode==='quick'&&<>
    {!action?<div className="quick-action-grid">
      {canEdit('finance')&&<QuickCard icon={<ArrowDownLeft/>} tone="expense" title="Gasto" subtitle="Registra un gasto y reparte automáticamente" onClick={()=>setAction('expense')}/>}
      {canEdit('finance')&&<QuickCard icon={<ArrowUpRight/>} tone="income" title="Ingreso" subtitle="Registra dinero que entró al hogar" onClick={()=>setAction('income')}/>}
      {canEdit('lists')&&<QuickCard icon={<ListChecks/>} tone="task" title="Tarea" subtitle="Pendiente para ti o la familia" onClick={()=>setAction('task')}/>}
      {canEdit('lists')&&<QuickCard icon={<ShoppingCart/>} tone="shopping" title="Compra" subtitle="Agrega algo a Supermercado" onClick={()=>setAction('shopping')}/>}
      {canEdit('calendar')&&<QuickCard icon={<CalendarDays/>} tone="event" title="Evento" subtitle="Cita o actividad en la agenda" onClick={()=>setAction('event')}/>}
      {canEdit('documents')&&<QuickCard icon={<FileText/>} tone="document" title="Documento" subtitle="Guarda archivo o vencimiento" onClick={()=>setAction('document')}/>}
      {canEdit('maintenance')&&<QuickCard icon={<Wrench/>} tone="maintenance" title="Mantenimiento" subtitle="Programa casa, vehículo o equipo" onClick={()=>setAction('maintenance')}/>}
      <QuickCard icon={<Search/>} tone="search" title="Buscar" subtitle="Encuentra cualquier información permitida" onClick={openSearch}/>
     </div>:<div className="quick-form-wrap">
      <button className="quick-back" onClick={()=>{setAction(null);setMessage('')}}>‹ Volver a acciones</button>
      {(action==='expense'||action==='income')&&<TransactionForm type={action} categories={categories} accounts={accounts} busy={busy} onSubmit={e=>saveTransaction(e,action)}/>}
      {action==='task'&&<TaskForm lists={lists} members={members} busy={busy} onSubmit={saveTask}/>}
      {action==='shopping'&&<ShoppingForm busy={busy} onSubmit={saveShopping}/>}
      {action==='event'&&<EventForm members={members} busy={busy} onSubmit={saveEvent}/>}
      {action==='document'&&<DocumentForm busy={busy} onSubmit={saveDocument}/>}
      {action==='maintenance'&&<MaintenanceForm assets={assets} members={members} busy={busy} onSubmit={saveMaintenance}/>}
     </div>}
   </>}
  </section></>}
 </div>
}

function QuickCard({icon,tone,title,subtitle,onClick}:{icon:React.ReactNode;tone:string;title:string;subtitle:string;onClick:()=>void}){return <button className={'quick-action-card '+tone} onClick={onClick}><span>{icon}</span><div><strong>{title}</strong><small>{subtitle}</small></div><Plus/></button>}

function TransactionForm({type,categories,accounts,busy,onSubmit}:{type:'expense'|'income';categories:Category[];accounts:Account[];busy:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
 const isExpense=type==='expense';
 return <form className="finance-form global-quick-form" onSubmit={onSubmit}><div className="quick-form-title"><span className={isExpense?'expense':'income'}>{isExpense?<ArrowDownLeft/>:<ArrowUpRight/>}</span><div><p className="eyebrow">{isExpense?'GASTO':'INGRESO'}</p><h3>{isExpense?'Registrar gasto':'Registrar ingreso'}</h3></div></div>
  <label>Descripción<input name="description" placeholder={isExpense?'Ej. Supermercado':'Ej. Salario'} required/></label>
  <div className="two"><label>Monto<input name="amount" type="number" min=".01" step=".01" placeholder="0.00" required/></label><label>Fecha<input name="date" type="date" defaultValue={iso()} required/></label></div>
  <div className="two"><label>Categoría<select name="category_id" defaultValue=""><option value="">Sin categoría</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Cuenta<select name="account_id" defaultValue=""><option value="">Sin cuenta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
  <label>Nota<input name="notes" placeholder="Opcional"/></label>
  {isExpense&&<label className="check-line"><input type="checkbox" name="is_shared" defaultChecked/> Gasto compartido según las reglas de aportes</label>}
  {!isExpense&&<input type="hidden" name="is_shared" value="on"/>}
  <button className="finance-primary" disabled={busy}><Check/>{busy?'Guardando...':'Guardar '+(isExpense?'gasto':'ingreso')}</button>
 </form>
}

function TaskForm({lists,members,busy,onSubmit}:{lists:ListRow[];members:Member[];busy:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
 return <form className="finance-form global-quick-form" onSubmit={onSubmit}><QuickTitle icon={<ListChecks/>} label="TAREA" title="Nuevo pendiente"/>
  <label>Tarea<input name="text" placeholder="Ej. Pagar internet" required/></label>
  <div className="two"><label>Lista<select name="list_id" defaultValue=""><option value="">Pendientes (automático)</option>{lists.filter(l=>l.list_type!=='shopping').map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</select></label><label>Responsable<select name="assigned_to" defaultValue=""><option value="">Sin asignar</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label></div>
  <label>Fecha límite<input name="due_date" type="date"/></label><label>Nota<input name="notes" placeholder="Opcional"/></label>
  <button className="finance-primary" disabled={busy}><Check/>{busy?'Guardando...':'Agregar tarea'}</button>
 </form>
}

function ShoppingForm({busy,onSubmit}:{busy:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
 return <form className="finance-form global-quick-form" onSubmit={onSubmit}><QuickTitle icon={<ShoppingCart/>} label="SUPERMERCADO" title="Agregar compra"/>
  <label>Producto<input name="text" placeholder="Ej. Leche" required/></label><div className="two"><label>Cantidad<input name="quantity" placeholder="Ej. 2 unidades"/></label><label>Nota<input name="notes" placeholder="Marca o detalle"/></label></div>
  <button className="finance-primary" disabled={busy}><ShoppingCart/>{busy?'Guardando...':'Agregar a Supermercado'}</button>
 </form>
}

function EventForm({members,busy,onSubmit}:{members:Member[];busy:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
 return <form className="finance-form global-quick-form" onSubmit={onSubmit}><QuickTitle icon={<CalendarDays/>} label="AGENDA" title="Nuevo evento"/>
  <label>Título<input name="title" placeholder="Ej. Cita médica" required/></label>
  <div className="two"><label>Fecha<input name="date" type="date" defaultValue={iso()} required/></label><label>Hora<input name="time" type="time"/></label></div>
  <div className="two"><label>Categoría<select name="category" defaultValue="family"><option value="family">Familia</option><option value="appointment">Cita</option><option value="task">Tarea</option><option value="social">Social</option><option value="health">Salud</option><option value="school">Estudios</option><option value="other">Otro</option></select></label><label>Responsable<select name="assigned_to" defaultValue=""><option value="">Todos</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label></div>
  <label className="check-line"><input name="all_day" type="checkbox"/> Todo el día</label><label>Descripción<input name="description" placeholder="Opcional"/></label>
  <button className="finance-primary" disabled={busy}><CalendarDays/>{busy?'Guardando...':'Agregar evento'}</button>
 </form>
}

function DocumentForm({busy,onSubmit}:{busy:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
 return <form className="finance-form global-quick-form" onSubmit={onSubmit}><QuickTitle icon={<FileText/>} label="BÓVEDA" title="Guardar documento"/>
  <label>Título<input name="title" placeholder="Ej. Seguro del vehículo" required/></label>
  <div className="two"><label>Categoría<select name="category" defaultValue="other"><option value="personal">Personal</option><option value="home">Casa</option><option value="vehicle">Vehículo</option><option value="health">Salud</option><option value="finance">Finanzas</option><option value="insurance">Seguro</option><option value="warranty">Garantía</option><option value="education">Educación</option><option value="other">Otro</option></select></label><label>Vence<input name="expires_on" type="date"/></label></div>
  <label>Archivo<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"/></label>
  <label>Nota<input name="notes" placeholder="Opcional"/></label><label className="check-line"><input type="checkbox" name="private"/> Solo yo puedo verlo</label>
  <button className="finance-primary" disabled={busy}><FileText/>{busy?'Guardando...':'Guardar documento'}</button>
 </form>
}

function MaintenanceForm({assets,members,busy,onSubmit}:{assets:Asset[];members:Member[];busy:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
 return <form className="finance-form global-quick-form" onSubmit={onSubmit}><QuickTitle icon={<Wrench/>} label="MANTENIMIENTO" title="Programar servicio"/>
  <label>Actividad<input name="title" placeholder="Ej. Cambio de aceite" required/></label>
  <div className="two"><label>Activo<select name="asset_id" defaultValue=""><option value="">General del hogar</option>{assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Tipo<select name="maintenance_type" defaultValue="service"><option value="service">Servicio</option><option value="repair">Reparación</option><option value="inspection">Inspección</option><option value="insurance">Seguro</option><option value="registration">Renovación</option><option value="warranty">Garantía</option><option value="cleaning">Limpieza</option><option value="other">Otro</option></select></label></div>
  <div className="two"><label>Próxima fecha<input name="next_due_date" type="date"/></label><label>Próximo km<input name="next_due_mileage" type="number" min="0" step="1"/></label></div>
  <div className="two"><label>Repetir cada meses<input name="interval_months" type="number" min="1" max="120" placeholder="Ej. 6"/></label><label>Repetir cada km<input name="interval_km" type="number" min="1" step="1" placeholder="Ej. 5000"/></label></div>
  <div className="two"><label>Proveedor<input name="provider" placeholder="Opcional"/></label><label>Responsable<select name="assigned_to" defaultValue=""><option value="">Todos</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label></div>
  <button className="finance-primary" disabled={busy}><Wrench/>{busy?'Guardando...':'Programar mantenimiento'}</button>
 </form>
}

function QuickTitle({icon,label,title}:{icon:React.ReactNode;label:string;title:string}){return <div className="quick-form-title"><span>{icon}</span><div><p className="eyebrow">{label}</p><h3>{title}</h3></div></div>}
function ChevronResult(){return <span className="global-result-chevron">›</span>}
function resultGroup(type:string){if(type==='transaction')return'Finanzas';if(type==='document')return'Documentos';if(type==='event')return'Agenda';if(type==='list'||type==='list_item')return'Listas';if(type==='recipe'||type==='pantry')return'Comidas';if(type==='maintenance'||type==='asset')return'Casa y activos';if(type==='person')return'Familia';return'Otros'}
function resultIcon(type:string){if(type==='transaction')return <ReceiptText/>;if(type==='document')return <FileText/>;if(type==='event')return <CalendarDays/>;if(type==='list'||type==='list_item')return <ListChecks/>;if(type==='recipe')return <Utensils/>;if(type==='pantry')return <Package/>;if(type==='maintenance')return <Wrench/>;if(type==='asset')return <Car/>;if(type==='person')return <Users/>;return <Search/>}
function formatDate(value:string){return new Date(value+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short',year:'numeric'}).replace('.','')}
