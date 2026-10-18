import DraftForm from './DraftForm';
import {useFocusTrap} from './lib/useFocusTrap';
import ModuleIcon from './ModuleIcon';
import {FormEvent,useEffect,useId,useMemo,useRef,useState} from 'react';
import {ArrowDownLeft,ArrowUpRight,Car,Check,History,Lock,Package,Plus,ReceiptText,Search,ShoppingCart,User,Users,X} from 'lucide-react';
import {supabase} from './lib/supabase';
import {ensureShoppingList} from './lib/shoppingList';
import {formatMoney} from './lib/money';
import {formatEntryAmount,usdRate,usdToQuetzales} from './lib/currency';
import {HISTORY_LIMIT,defaultVisibility,historyStart,isValidAmount,recentRepeats,suggestCategory,visibilityHint,type EntryCurrency,type EntryVisibility,type MovementType,type QuickHistoryRow,type RepeatChip} from './lib/quickEntry';
import './quick-entry.css';

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

export default function GlobalCommandCenter({household,access,onNavigate,onChanged}:{household:Household;access?:Record<string,'none'|'view'|'edit'>;onNavigate:(tab:string)=>void;onChanged?:()=>void}){
 const canEdit=(module:string)=>!access||access[module]==='edit';
 const hasQuickEdit=canEdit('finance')||canEdit('lists')||canEdit('calendar')||canEdit('documents')||canEdit('maintenance');
 const [mode,setMode]=useState<Mode>(null),[action,setAction]=useState<QuickAction>(null);
 const [query,setQuery]=useState(''),[results,setResults]=useState<SearchResult[]>([]),[searching,setSearching]=useState(false);
 const [categories,setCategories]=useState<Category[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[lists,setLists]=useState<ListRow[]>([]),[assets,setAssets]=useState<Asset[]>([]),[members,setMembers]=useState<Member[]>([]),[userId,setUserId]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [history,setHistory]=useState<QuickHistoryRow[]>([]),[rateValue,setRateValue]=useState<unknown>(null),[prefill,setPrefill]=useState<RepeatChip|null>(null),[saved,setSaved]=useState<{type:MovementType;text:string;detail:string}|null>(null);
 const rateFor=useRef(''),currentHousehold=useRef(household.id),againButton=useRef<HTMLButtonElement>(null);currentHousehold.current=household.id;
 const repeats=useMemo(()=>canEdit('finance')?recentRepeats(history,{since:historyStart()}):[],[history,access]);
 const searchInput=useRef<HTMLInputElement|null>(null),panel=useRef<HTMLElement>(null);
 useFocusTrap(panel,Boolean(mode),close);

 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch()}};
  const quick=()=>openQuick();
  window.addEventListener('keydown',key);window.addEventListener('nh:quick-add',quick as EventListener);
  return()=>{window.removeEventListener('keydown',key);window.removeEventListener('nh:quick-add',quick as EventListener)}
 },[household.id]);

 useEffect(()=>{if(!mode)return;loadMeta();if(mode==='quick')loadQuickFinance();if(mode==='search')setTimeout(()=>searchInput.current?.focus(),20)},[mode,household.id]);
 useEffect(()=>{setHistory([]);setRateValue(null);rateFor.current=''},[household.id]);
 useEffect(()=>{if(saved)againButton.current?.focus()},[saved]);

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

 // Recent movements (chips and category suggestions) plus the household dollar rate, read once per household.
 async function loadQuickFinance(){
  if(!canEdit('finance'))return;const hid=household.id;
  const [histR,rateR]=await Promise.all([
   supabase.from('transactions').select('description,type,category_id,amount,transaction_date,created_at').eq('household_id',hid).gte('transaction_date',historyStart()).order('transaction_date',{ascending:false}).order('created_at',{ascending:false}).limit(HISTORY_LIMIT),
   rateFor.current===hid?Promise.resolve(null):supabase.from('finance_household_settings').select('usd_rate').eq('household_id',hid).maybeSingle()
  ]);
  if(currentHousehold.current!==hid)return;
  setHistory(histR.error?[]:(histR.data||[]) as QuickHistoryRow[]);
  if(rateR&&!rateR.error){rateFor.current=hid;const row=Array.isArray(rateR.data)?rateR.data[0]:rateR.data;setRateValue((row as any)?.usd_rate??null)}
 }

 function openSearch(){setAction(null);setMessage('');setMode('search')}
 function openQuick(){setAction(null);setMessage('');setSaved(null);setPrefill(null);setMode('quick')}
 function close(){setMode(null);setAction(null);setMessage('');setSaved(null);setPrefill(null);setQuery('');setResults([])}
 function pickAction(next:QuickAction){setSaved(null);setPrefill(null);setMessage('');setAction(next)}
 function success(text:string){setBusy(false);setMessage(text);setAction(null);onChanged?.()}

 function openResult(row:SearchResult){close();onNavigate(row.action_tab)}

 async function saveTransaction(form:HTMLFormElement,requestId:string):Promise<boolean>{
  setBusy(true);setMessage('');const f=new FormData(form);
  const type:MovementType=f.get('type')==='income'?'income':'expense',usd=f.get('currency')==='USD',choice=String(f.get('visibility')||'');
  const visibility:EntryVisibility=choice==='private'&&canEdit('finance')?'private':choice==='personal'?'personal':'shared';
  const entered=Number(f.get('amount')||0),rate=usdRate(rateValue),amount=usd?usdToQuetzales(entered,rate):entered;
  // The description is optional: without one, the movement takes its category's name (or "Gasto"/"Ingreso").
  const categoryName=categories.find(c=>c.id===String(f.get('category_id')||''))?.name;
  const description=(String(f.get('description')||'').trim()||categoryName||(type==='income'?'Ingreso':'Gasto')).slice(0,choice==='private'?140:250),notes=String(f.get('notes')||'').trim()||null,date=String(f.get('date')||iso()),category=String(f.get('category_id')||'')||null;
  if(!isValidAmount(entered)||!isValidAmount(amount)){setBusy(false);setMessage('Escribe un monto mayor que cero, con hasta dos decimales.');return false}
  if(!description){setBusy(false);setMessage('Escribe una descripción.');return false}
  // Dollars: the movement keeps quetzales as its amount and also stores what was paid and the rate used (one atomic save).
  const original=usd?{original_currency:'USD',original_amount:entered,exchange_rate:rate}:null;
  try{
   if(visibility==='private'){
    // The request id is the row id: a retry after a lost response finds the row already saved instead of duplicating it.
    const values={id:requestId,household_id:household.id,description,amount,type,transaction_date:date,category_id:category,notes,original_currency:original?.original_currency||null,original_amount:original?.original_amount??null,exchange_rate:original?.exchange_rate??null};
    const {error}=await supabase.from('private_transactions').insert(values);
    if(error&&error.code!=='23505'){setMessage(error.message||'No se pudo guardar el movimiento privado.');return false}
    if(error){
     const saved=await supabase.from('private_transactions').select('id,household_id,description,amount,type,transaction_date,category_id,notes,original_currency,original_amount,exchange_rate').eq('id',requestId).maybeSingle();
     const row=saved.data as Record<string,unknown>|null;
     const same=!saved.error&&row&&Object.entries(values).every(([key,value])=>['amount','original_amount','exchange_rate'].includes(key)?(value===null?row[key]===null:Number(row[key])===Number(value)):row[key]===value);
     if(!same){setMessage('Este borrador ya se guardó con otros datos o no pudimos verificarlo. Revisa tus movimientos privados antes de registrar otro.');return false}
    }
   }else{
    const {data,error}=await supabase.rpc('save_transaction_once',{p_household_id:household.id,p_request_id:requestId,p_values:{description,amount,type,date,category_id:category,account_id:String(f.get('account_id')||'')||null,paid_by:userId||null,is_shared:visibility==='shared',notes,recurring:false,...(original||{})}});
    if(error||!data){setMessage(error?.message||'No se confirmó el movimiento.');return false}
    setHistory(current=>[{description,type,category_id:category,amount,transaction_date:date,created_at:new Date().toISOString()},...current].slice(0,HISTORY_LIMIT));
   }
   try{navigator.vibrate?.(12)}catch{/* Vibration is optional. */}
   setSaved({type,text:formatEntryAmount(amount,original||{}),detail:description+' · '+(visibility==='private'?'Solo tú lo ves':(type==='expense'?'Gasto':'Ingreso')+' '+(visibility==='shared'?'compartido':'personal'))});
   setAction(null);setPrefill(null);onChanged?.();return true;
  }catch{setMessage('No se confirmó el guardado. Reintenta con este borrador.');return false}finally{setBusy(false)}
 }

 async function ensureList(title:string,listType:string){
  if(listType==='shopping'){const id=await ensureShoppingList(supabase,household.id,title);if(!lists.some(l=>l.id===id))setLists(current=>current.some(l=>l.id===id)?current:[{id,title,list_type:listType},...current]);return id}
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

 const pendingMaintenance=useRef<{form:HTMLFormElement;id:string}|null>(null);
 async function saveMaintenance(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const nextDate=String(f.get('next_due_date')||'')||null,nextKm=String(f.get('next_due_mileage')||'')?Number(f.get('next_due_mileage')):null,months=String(f.get('interval_months')||'')?Number(f.get('interval_months')):null,km=String(f.get('interval_km')||'')?Number(f.get('interval_km')):null;
  if(!nextDate&&nextKm==null&&months==null&&km==null){setBusy(false);setMessage('Indica una fecha, kilometraje o recurrencia.');return}
  const values={
   household_id:household.id,asset_id:String(f.get('asset_id')||'')||null,title:String(f.get('title')||'').trim(),
   maintenance_type:String(f.get('maintenance_type')||'service'),provider:String(f.get('provider')||'').trim()||null,
   next_due_date:nextDate,next_due_mileage:nextKm,interval_months:months,interval_km:km,assigned_to:String(f.get('assigned_to')||'')||null
  };
  // A retry from the same form after a failed sync updates the record already created instead of inserting a duplicate.
  const form=e.currentTarget,pending=pendingMaintenance.current?.form===form?pendingMaintenance.current.id:null;
  const {data,error}=pending?await supabase.from('maintenance_schedules').update(values).eq('id',pending).eq('household_id',household.id).select('id').single():await supabase.from('maintenance_schedules').insert(values).select('id').single();
  if(error||!data){setBusy(false);setMessage(error?.message||'No se pudo crear el mantenimiento.');return}
  pendingMaintenance.current={form,id:data.id};
  const sync=await supabase.rpc('sync_maintenance_event',{p_schedule_id:data.id});
  if(sync.error){setBusy(false);setMessage('El mantenimiento se guardó, pero no se sincronizó con Agenda: '+sync.error.message+' Vuelve a guardar para reintentar.');return}
  pendingMaintenance.current=null;
  await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});
  success('Mantenimiento programado y sincronizado con Agenda.');
 }

 const grouped=useMemo(()=>{
  const map=new Map<string,SearchResult[]>();
  for(const row of results){const key=resultGroup(row.result_type);map.set(key,[...(map.get(key)||[]),row])}
  return [...map.entries()];
 },[results]);

 return <div className="global-command-center">
  <button className="global-search-trigger" aria-label="Buscar en Nuestro Hogar" onClick={openSearch} title="Buscar en Nuestro Hogar"><Search/><span>Buscar</span><kbd>⌘K</kbd></button>
  {hasQuickEdit&&<button type="button" className="global-add-trigger" onClick={openQuick} title="Agregar rápido" aria-label="Registrar"><Plus aria-hidden="true"/><span>Registrar</span></button>}

  {mode&&<><button className="global-command-scrim" onClick={close} aria-label="Cerrar"/><section ref={panel} className={'global-command-panel global-command-panel--'+mode} role="dialog" aria-modal="true" aria-labelledby="global-command-title">
   <div className="global-command-head">
    <div><p className="eyebrow">{mode==='search'?'BUSCADOR GLOBAL':'AGREGAR RÁPIDO'}</p><h3 id="global-command-title">{mode==='search'?'Encuentra cualquier cosa':'¿Qué quieres registrar?'}</h3></div>
    <button onClick={close} aria-label="Cerrar ventana"><X/></button>
   </div>

   {message&&<div className="global-command-message"><Check/>{message}<button onClick={()=>setMessage('')}><X/></button></div>}

   {mode==='search'&&<>
    <label className="global-search-box"><Search/><input ref={searchInput} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Busca gastos, documentos, recetas, vehículos, tareas..."/>{searching&&<span className="global-search-spinner"/>}{query&&<button onClick={()=>setQuery('')}><X/></button>}</label>
    {query.trim().length<2?<div className="global-search-hint"><Search/><strong>Busca en todo Nuestro Hogar</strong><span>Escribe al menos 2 caracteres. Puedes buscar nombres, placas, proveedores, números de documento, recetas y más.</span></div>
    :!searching&&!results.length?<div className="global-search-hint"><Search/><strong>Sin resultados</strong><span>No encontramos coincidencias para “{query.trim()}”.</span></div>
    :<div className="global-search-results">{grouped.map(([group,rows])=><section key={group}><div className="global-result-group-head"><span>{group}</span><b>{rows.length}</b></div>{rows.map(row=><button key={row.result_type+'-'+row.entity_id} onClick={()=>openResult(row)}><span className={'global-result-icon '+row.result_type}>{resultIcon(row.result_type)}</span><div><strong>{row.title}</strong><small>{row.subtitle}{row.occurred_on?' · '+formatDate(row.occurred_on):''}</small></div><ChevronResult/></button>)}</section>)}</div>}
   </>}

   {mode==='quick'&&<>
    {saved&&!action?<div className="quick-entry-success" role="status">
      <span className="quick-entry-success-check" aria-hidden="true"><Check/></span>
      <strong>Registrado</strong><span className="quick-entry-success-amount">{saved.text}</span><small>{saved.detail}</small>
      <div className="quick-entry-success-actions"><button ref={againButton} type="button" className="finance-primary" onClick={()=>pickAction(saved.type)}><Plus aria-hidden="true"/>Registrar otro</button><button type="button" className="quick-entry-done" onClick={close}>Listo</button></div>
     </div>
    :!action?<>
     {canEdit('finance')&&repeats.length>0&&<RepeatChips chips={repeats} categories={categories} onPick={chip=>{pickAction(chip.type);setPrefill(chip)}}/>}
     <div className="quick-action-grid">
      {canEdit('finance')&&<QuickCard icon={<ArrowDownLeft/>} tone="expense" title="Gasto" subtitle="Registra un gasto y reparte automáticamente" onClick={()=>pickAction('expense')}/>}
      {canEdit('finance')&&<QuickCard icon={<ArrowUpRight/>} tone="income" title="Ingreso" subtitle="Registra dinero que entró al hogar" onClick={()=>pickAction('income')}/>}
      {canEdit('lists')&&<QuickCard icon={<ModuleIcon name="lists"/>} tone="task" title="Tarea" subtitle="Pendiente para ti o la familia" onClick={()=>pickAction('task')}/>}
      {canEdit('lists')&&<QuickCard icon={<ShoppingCart/>} tone="shopping" title="Compra" subtitle="Agrega algo a Supermercado" onClick={()=>pickAction('shopping')}/>}
      {canEdit('calendar')&&<QuickCard icon={<ModuleIcon name="calendar"/>} tone="event" title="Evento" subtitle="Cita o actividad en la agenda" onClick={()=>pickAction('event')}/>}
      {canEdit('documents')&&<QuickCard icon={<ModuleIcon name="documents"/>} tone="document" title="Documento" subtitle="Guarda archivo o vencimiento" onClick={()=>pickAction('document')}/>}
      {canEdit('maintenance')&&<QuickCard icon={<ModuleIcon name="maintenance"/>} tone="maintenance" title="Mantenimiento" subtitle="Programa casa, vehículo o equipo" onClick={()=>pickAction('maintenance')}/>}
      <QuickCard icon={<Search/>} tone="search" title="Buscar" subtitle="Encuentra cualquier información permitida" onClick={openSearch}/>
     </div></>:<div className="quick-form-wrap">
      <button className="quick-back" onClick={()=>pickAction(null)}>‹ Volver a acciones</button>
      {(action==='expense'||action==='income')&&<TransactionForm key={household.id+userId+action+(prefill?.key||'')} householdId={household.id} userId={userId} errorMessage={message} type={action} categories={categories} accounts={accounts} busy={busy} history={history} repeats={repeats} rateValue={rateValue} memberCount={members.length} canPrivate={canEdit('finance')} prefill={prefill} onSubmit={saveTransaction}/>}
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

function RepeatChips({chips,categories,onPick}:{chips:RepeatChip[];categories:Category[];onPick:(chip:RepeatChip)=>void}){
 const names=new Map(categories.map(c=>[c.id,c.name]));
 return <div className="quick-repeats" role="group" aria-labelledby="quick-repeats-title"><p className="quick-repeats-title" id="quick-repeats-title"><History aria-hidden="true"/>Repetir reciente</p><div className="quick-repeats-list">{chips.map(chip=>{const label=(chip.type==='income'?'Ingreso':'Gasto')+(chip.category_id&&names.get(chip.category_id)?' · '+names.get(chip.category_id):'');return <button type="button" key={chip.key} className={'quick-repeat-chip '+chip.type} title={label} aria-label={'Repetir '+chip.description+', '+label+', '+formatMoney(chip.amount)} onClick={()=>onPick(chip)}><span>{chip.description}</span><b>{formatMoney(chip.amount)}</b></button>})}</div></div>
}

type Field=HTMLInputElement|HTMLSelectElement;
/** Sets a field like the user would, so the draft (form onChange) records chips and toggles too. */
function setField(el:Field|null,value:string,notify=true){
 if(!el)return;
 const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
 Object.getOwnPropertyDescriptor(proto,'value')?.set?.call(el,value);
 if(notify)el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));
}

function TransactionForm({type,categories,accounts,busy,onSubmit,householdId,userId,errorMessage,history,repeats,rateValue,memberCount,canPrivate,prefill}:{householdId:string;userId:string;errorMessage:string;type:MovementType;categories:Category[];accounts:Account[];busy:boolean;history:QuickHistoryRow[];repeats:RepeatChip[];rateValue:unknown;memberCount:number;canPrivate:boolean;prefill:RepeatChip|null;onSubmit:(form:HTMLFormElement,requestId:string)=>Promise<boolean>}){
 const amountId=useId(),initialVisibility=defaultVisibility(memberCount),rate=usdRate(rateValue),referenceRate=rateValue==null||Number(rateValue)!==rate;
 const amountRef=useRef<HTMLInputElement>(null),descriptionRef=useRef<HTMLInputElement>(null),categoryRef=useRef<HTMLSelectElement>(null),typeRef=useRef<HTMLInputElement>(null),currencyRef=useRef<HTMLInputElement>(null),visibilityRef=useRef<HTMLInputElement>(null);
 const [kind,setKind]=useState<MovementType>(prefill?.type||type),[currency,setCurrency]=useState<EntryCurrency>('GTQ'),[visibility,setVisibility]=useState<EntryVisibility>(initialVisibility),[amount,setAmount]=useState(prefill?String(prefill.amount):''),[suggested,setSuggested]=useState(false);
 // A category chosen by hand (or by a repeated movement) is never replaced by a suggestion.
 const touched=useRef({category:Boolean(prefill?.category_id),visibility:false}),automatic=useRef(false);
 const isExpense=kind==='expense',usd=currency==='USD',entered=Number(amount),converted=usd&&isValidAmount(entered)?usdToQuetzales(entered,rate):0;
 // Members load after the dialog opens: follow the household default until the person chooses.
 useEffect(()=>{if(touched.current.visibility||!visibilityRef.current)return;setField(visibilityRef.current,initialVisibility,false);setVisibility(initialVisibility)},[initialVisibility]);
 function suggest(description:string,movement:MovementType){
  if(touched.current.category||!categoryRef.current)return;
  const id=suggestCategory(description,history,categories,movement);
  if(id){setField(categoryRef.current,id,false);setSuggested(true)}else if(suggested){setField(categoryRef.current,'',false);setSuggested(false)}
 }
 function chooseType(next:MovementType){setField(typeRef.current,next);setKind(next);suggest(descriptionRef.current?.value||'',next)}
 function chooseCurrency(next:EntryCurrency){setField(currencyRef.current,next);setCurrency(next);amountRef.current?.focus()}
 function chooseVisibility(next:EntryVisibility){touched.current.visibility=true;setField(visibilityRef.current,next);setVisibility(next)}
 function repeat(chip:RepeatChip){
  automatic.current=true;
  setField(typeRef.current,chip.type,false);setField(descriptionRef.current,chip.description,false);setField(categoryRef.current,chip.category_id||'',false);setField(amountRef.current,String(chip.amount));
  automatic.current=false;touched.current.category=Boolean(chip.category_id);setKind(chip.type);setAmount(String(chip.amount));setSuggested(false);
 }
 // Recovering or discarding a draft rewrites the fields directly: mirror them back into the toggles.
 function syncFromFields(){
  const pick=(el:HTMLInputElement|null,fallback:string)=>el?.value||fallback;
  const nextType=pick(typeRef.current,type)==='income'?'income':'expense',nextCurrency=pick(currencyRef.current,'GTQ')==='USD'?'USD':'GTQ',nextVisibility=pick(visibilityRef.current,initialVisibility) as EntryVisibility;
  setKind(nextType);setCurrency(nextCurrency);setVisibility(canPrivate||nextVisibility!=='private'?nextVisibility:initialVisibility);setAmount(amountRef.current?.value||'');setSuggested(false);
  touched.current={category:Boolean(categoryRef.current?.value),visibility:true};
 }
 const audiences:[EntryVisibility,string,React.ReactNode][]=[['shared','Compartido',<Users aria-hidden="true"/>],['personal','Personal',<User aria-hidden="true"/>],...(canPrivate?[['private','Solo yo',<Lock aria-hidden="true"/>] as [EntryVisibility,string,React.ReactNode]]:[])];
 return <div className="quick-entry" onClick={e=>{if((e.target as HTMLElement).closest?.('.draft-recovery button'))syncFromFields()}}><DraftForm className="finance-form global-quick-form quick-entry-form" userId={userId} householdId={householdId} kind={'quick-'+type} errorMessage={errorMessage} onSubmit={onSubmit}>
  <div className="quick-form-title"><span className={isExpense?'expense':'income'}>{isExpense?<ArrowDownLeft/>:<ArrowUpRight/>}</span><div><p className="eyebrow">{isExpense?'GASTO':'INGRESO'}</p><h3>{isExpense?'Registrar gasto':'Registrar ingreso'}</h3></div>
   <div className="quick-segmented quick-type" role="group" aria-label="Tipo de movimiento"><button type="button" aria-pressed={isExpense} onClick={()=>chooseType('expense')}>Gasto</button><button type="button" aria-pressed={!isExpense} onClick={()=>chooseType('income')}>Ingreso</button></div>
  </div>
  <input ref={typeRef} type="text" name="type" defaultValue={prefill?.type||type} hidden readOnly tabIndex={-1} aria-hidden="true"/>
  <input ref={currencyRef} type="text" name="currency" defaultValue="GTQ" hidden readOnly tabIndex={-1} aria-hidden="true"/>
  <input ref={visibilityRef} type="text" name="visibility" defaultValue={initialVisibility} hidden readOnly tabIndex={-1} aria-hidden="true"/>
  <div className={'quick-amount'+(usd?' is-usd':'')}>
   <div className="quick-amount-field"><label className="quick-amount-label" htmlFor={amountId}>Monto</label><span className="quick-amount-row"><span className="quick-amount-symbol" aria-hidden="true">{usd?'US$':'Q'}</span><input ref={amountRef} id={amountId} className="quick-amount-input" name="amount" type="number" inputMode="decimal" min=".01" step=".01" placeholder="0.00" defaultValue={prefill?String(prefill.amount):undefined} onChange={e=>setAmount(e.currentTarget.value)} autoFocus required/></span></div>
   <div className="quick-segmented quick-currency" role="group" aria-label="Moneda"><button type="button" aria-pressed={!usd} aria-label="Quetzales" onClick={()=>chooseCurrency('GTQ')}>Q</button><button type="button" aria-pressed={usd} aria-label="Dólares" onClick={()=>chooseCurrency('USD')}>US$</button></div>
   {usd&&<p className="quick-amount-convert" aria-live="polite"><b>≈ {formatMoney(converted)}</b><small>{'Tipo de cambio '+rate.toLocaleString('es-GT',{maximumFractionDigits:4})+(referenceRate?' (referencia; ajústalo en Finanzas)':' del hogar')}</small></p>}
  </div>
  {repeats.length>0&&<RepeatChips chips={repeats} categories={categories} onPick={repeat}/>}
  <label>Descripción (opcional)<input ref={descriptionRef} name="description" placeholder={isExpense?'Ej. Supermercado':'Ej. Salario'} maxLength={visibility==='private'?140:250} defaultValue={prefill?.description} onChange={e=>suggest(e.currentTarget.value,kind)}/></label>
  <div className="two"><label>Categoría{suggested&&<em className="quick-suggested"> · sugerida</em>}<select ref={categoryRef} name="category_id" defaultValue={prefill?.category_id||''} onChange={()=>{if(!automatic.current){touched.current.category=true;setSuggested(false)}}}><option value="">Sin categoría</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Fecha<input name="date" type="date" defaultValue={iso()} required/></label></div>
  {memberCount>1&&<div className="quick-visibility"><span className="quick-visibility-label" id="quick-visibility-label">¿De quién es?</span><div className="quick-segmented quick-audience" role="group" aria-labelledby="quick-visibility-label">{audiences.map(([value,label,icon])=><button key={value} type="button" aria-pressed={visibility===value} onClick={()=>chooseVisibility(value)}>{icon}{label}</button>)}</div><p className="quick-visibility-hint">{visibilityHint(visibility)}</p></div>}
  <div className={visibility!=='private'&&accounts.length>0?'two':''}>{visibility!=='private'&&accounts.length>0&&<label>Cuenta<select name="account_id" defaultValue=""><option value="">Sin cuenta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}<label>Nota<input name="notes" placeholder="Opcional" maxLength={visibility==='private'?500:2000}/></label></div>
  <button className="finance-primary" disabled={busy}><Check/>{busy?'Guardando...':'Guardar '+(isExpense?'gasto':'ingreso')}</button>
 </DraftForm></div>
}

function TaskForm({lists,members,busy,onSubmit}:{lists:ListRow[];members:Member[];busy:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
 return <form className="finance-form global-quick-form" onSubmit={onSubmit}><QuickTitle icon={<ModuleIcon name="lists"/>} label="TAREA" title="Nuevo pendiente"/>
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
 return <form className="finance-form global-quick-form" onSubmit={onSubmit}><QuickTitle icon={<ModuleIcon name="calendar"/>} label="AGENDA" title="Nuevo evento"/>
  <label>Título<input name="title" placeholder="Ej. Cita médica" required/></label>
  <div className="two"><label>Fecha<input name="date" type="date" defaultValue={iso()} required/></label><label>Hora<input name="time" type="time"/></label></div>
  <div className="two"><label>Categoría<select name="category" defaultValue="family"><option value="family">Familia</option><option value="appointment">Cita</option><option value="task">Tarea</option><option value="social">Social</option><option value="health">Salud</option><option value="school">Estudios</option><option value="other">Otro</option></select></label><label>Responsable<select name="assigned_to" defaultValue=""><option value="">Todos</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label></div>
  <label className="check-line"><input name="all_day" type="checkbox"/> Todo el día</label><label>Descripción<input name="description" placeholder="Opcional"/></label>
  <button className="finance-primary" disabled={busy}><ModuleIcon name="calendar"/>{busy?'Guardando...':'Agregar evento'}</button>
 </form>
}

function DocumentForm({busy,onSubmit}:{busy:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
 return <form className="finance-form global-quick-form" onSubmit={onSubmit}><QuickTitle icon={<ModuleIcon name="documents"/>} label="BÓVEDA" title="Guardar documento"/>
  <label>Título<input name="title" placeholder="Ej. Seguro del vehículo" required/></label>
  <div className="two"><label>Categoría<select name="category" defaultValue="other"><option value="personal">Personal</option><option value="home">Casa</option><option value="vehicle">Vehículo</option><option value="health">Salud</option><option value="finance">Finanzas</option><option value="insurance">Seguro</option><option value="warranty">Garantía</option><option value="education">Educación</option><option value="other">Otro</option></select></label><label>Vence<input name="expires_on" type="date"/></label></div>
  <label>Archivo<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"/></label>
  <label>Nota<input name="notes" placeholder="Opcional"/></label><label className="check-line"><input type="checkbox" name="private"/> Solo yo puedo verlo</label>
  <button className="finance-primary" disabled={busy}><ModuleIcon name="documents"/>{busy?'Guardando...':'Guardar documento'}</button>
 </form>
}

function MaintenanceForm({assets,members,busy,onSubmit}:{assets:Asset[];members:Member[];busy:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
 return <form className="finance-form global-quick-form" onSubmit={onSubmit}><QuickTitle icon={<ModuleIcon name="maintenance"/>} label="MANTENIMIENTO" title="Programar servicio"/>
  <label>Actividad<input name="title" placeholder="Ej. Cambio de aceite" required/></label>
  <div className="two"><label>Activo<select name="asset_id" defaultValue=""><option value="">General del hogar</option>{assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Tipo<select name="maintenance_type" defaultValue="service"><option value="service">Servicio</option><option value="repair">Reparación</option><option value="inspection">Inspección</option><option value="insurance">Seguro</option><option value="registration">Renovación</option><option value="warranty">Garantía</option><option value="cleaning">Limpieza</option><option value="other">Otro</option></select></label></div>
  <div className="two"><label>Próxima fecha<input name="next_due_date" type="date"/></label><label>Próximo km<input name="next_due_mileage" type="number" min="0" step="1"/></label></div>
  <div className="two"><label>Repetir cada meses<input name="interval_months" type="number" min="1" max="120" placeholder="Ej. 6"/></label><label>Repetir cada km<input name="interval_km" type="number" min="1" step="1" placeholder="Ej. 5000"/></label></div>
  <div className="two"><label>Proveedor<input name="provider" placeholder="Opcional"/></label><label>Responsable<select name="assigned_to" defaultValue=""><option value="">Todos</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label></div>
  <button className="finance-primary" disabled={busy}><ModuleIcon name="maintenance"/>{busy?'Guardando...':'Programar mantenimiento'}</button>
 </form>
}

function QuickTitle({icon,label,title}:{icon:React.ReactNode;label:string;title:string}){return <div className="quick-form-title"><span>{icon}</span><div><p className="eyebrow">{label}</p><h3>{title}</h3></div></div>}
function ChevronResult(){return <span className="global-result-chevron">›</span>}
function resultGroup(type:string){if(type==='transaction')return'Finanzas';if(type==='document')return'Documentos';if(type==='event')return'Agenda';if(type==='list'||type==='list_item')return'Listas';if(type==='recipe'||type==='pantry')return'Comidas';if(type==='maintenance'||type==='asset')return'Casa y activos';if(type==='person')return'Familia';return'Otros'}
function resultIcon(type:string){if(type==='transaction')return <ReceiptText/>;if(type==='document')return <ModuleIcon name="documents"/>;if(type==='event')return <ModuleIcon name="calendar"/>;if(type==='list'||type==='list_item')return <ModuleIcon name="lists"/>;if(type==='recipe')return <ModuleIcon name="meals"/>;if(type==='pantry')return <Package/>;if(type==='maintenance')return <ModuleIcon name="maintenance"/>;if(type==='asset')return <Car/>;if(type==='person')return <ModuleIcon name="family"/>;return <Search/>}
function formatDate(value:string){return new Date(value+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short',year:'numeric'}).replace('.','')}
