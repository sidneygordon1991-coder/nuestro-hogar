import WorkspaceHeading from './WorkspaceHeading';
import WorkspaceTitle from './WorkspaceTitle';
import ModuleLoading from './ModuleLoading';
import AssetIllustration from './AssetIllustration';
import ModuleIcon from './ModuleIcon';
import {FormEvent,useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,Building2,CalendarClock,Car,Check,CheckCircle2,ChevronRight,Gauge,History,Plus,ReceiptText,ShieldCheck,Trash2,X} from 'lucide-react';
import {supabase} from './lib/supabase';
import {formatMoney} from './lib/money';

type Household={id:string;name:string;invite_code:string};
type AssetType='property'|'vehicle'|'investment'|'valuable'|'other';
type MaintenanceType='service'|'repair'|'inspection'|'insurance'|'registration'|'warranty'|'cleaning'|'other';
type Asset={id:string;name:string;asset_type:AssetType;estimated_value:number;brand:string|null;model:string|null;asset_year:number|null;serial_number:string|null;license_plate:string|null;current_mileage:number|null;purchase_date:string|null;warranty_expires_on:string|null;notes:string|null;active:boolean};
type Schedule={id:string;asset_id:string|null;title:string;maintenance_type:MaintenanceType;provider:string|null;estimated_cost:number|null;assigned_to:string|null;next_due_date:string|null;next_due_mileage:number|null;interval_months:number|null;interval_km:number|null;last_completed_date:string|null;last_completed_mileage:number|null;document_id:string|null;calendar_event_id:string|null;notes:string|null;active:boolean};
type RecordRow={id:string;schedule_id:string|null;asset_id:string|null;title:string;maintenance_type:MaintenanceType;completed_date:string;mileage:number|null;cost:number|null;provider:string|null;document_id:string|null;notes:string|null;created_at:string};
type Member={user_id:string;full_name:string};
type Doc={id:string;title:string;category:string;expires_on:string|null};

const iso=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const money=formatMoney;
const fmtDate=(value:string|null)=>value?new Date(value+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short',year:'numeric'}):'Sin fecha';
const fmtKm=(n:number|null)=>n==null?'—':new Intl.NumberFormat('es-GT',{maximumFractionDigits:0}).format(n)+' km';

export default function MaintenanceCenter({household,onNavigate,readOnly=false}:{household:Household;onNavigate?:(tab:string)=>void;readOnly?:boolean}){
 const [tab,setTab]=useState<'summary'|'assets'|'plans'|'history'>('summary');
 const [assets,setAssets]=useState<Asset[]>([]),[schedules,setSchedules]=useState<Schedule[]>([]),[records,setRecords]=useState<RecordRow[]>([]),[members,setMembers]=useState<Member[]>([]),[documents,setDocuments]=useState<Doc[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [showAsset,setShowAsset]=useState(false),[editingAsset,setEditingAsset]=useState<Asset|null>(null);
 const [showSchedule,setShowSchedule]=useState(false),[editingSchedule,setEditingSchedule]=useState<Schedule|null>(null);
 const [completing,setCompleting]=useState<Schedule|null>(null);
 const request=useRef(0);

 useEffect(()=>{setMessage('');load();const channel=supabase.channel('maintenance-'+household.id+'-'+Math.random().toString(36).slice(2))
  .on('postgres_changes',{event:'*',schema:'public',table:'maintenance_schedules',filter:'household_id=eq.'+household.id},()=>load(false))
  .on('postgres_changes',{event:'*',schema:'public',table:'maintenance_records',filter:'household_id=eq.'+household.id},()=>load(false))
  .on('postgres_changes',{event:'*',schema:'public',table:'finance_assets',filter:'household_id=eq.'+household.id},()=>load(false))
  .subscribe();
  return()=>{supabase.removeChannel(channel)}
 },[household.id]);

 async function load(showLoader=true){
  // Messages are cleared by each user action, not here: realtime reloads must not wipe 'Plan creado…' or an error.
  const req=++request.current;if(showLoader)setLoading(true);
  const [assetR,scheduleR,recordR,memberR,docR]=await Promise.all([
   supabase.from('finance_assets').select('id,name,asset_type,estimated_value,brand,model,asset_year,serial_number,license_plate,current_mileage,purchase_date,warranty_expires_on,notes,active').eq('household_id',household.id).eq('active',true).in('asset_type',['property','vehicle','other']).order('created_at'),
   supabase.from('maintenance_schedules').select('id,asset_id,title,maintenance_type,provider,estimated_cost,assigned_to,next_due_date,next_due_mileage,interval_months,interval_km,last_completed_date,last_completed_mileage,document_id,calendar_event_id,notes,active').eq('household_id',household.id).eq('active',true).order('next_due_date',{ascending:true,nullsFirst:false}),
   supabase.from('maintenance_records').select('id,schedule_id,asset_id,title,maintenance_type,completed_date,mileage,cost,provider,document_id,notes,created_at').eq('household_id',household.id).order('completed_date',{ascending:false}).order('created_at',{ascending:false}).limit(100),
   supabase.from('household_members').select('user_id').eq('household_id',household.id),
   supabase.from('household_documents').select('id,title,category,expires_on').eq('household_id',household.id).in('category',['home','vehicle','insurance','warranty','other']).order('title')
  ]);
  const ids=(memberR.data||[]).map((m:any)=>m.user_id);
  const profileR=ids.length?await supabase.from('profiles').select('id,full_name').in('id',ids):{data:[] as any[]};
  if(req!==request.current)return;
  const names=new Map((profileR.data||[]).map((p:any)=>[p.id,p.full_name||'Miembro']));
  setMembers(ids.map((id:string)=>({user_id:id,full_name:String(names.get(id)||'Miembro')})));
  setAssets((assetR.data||[]) as Asset[]);setSchedules((scheduleR.data||[]) as Schedule[]);setRecords((recordR.data||[]) as RecordRow[]);setDocuments((docR.data||[]) as Doc[]);
  if(assetR.error||scheduleR.error||recordR.error||docR.error)setMessage('No se pudo cargar toda la información de mantenimiento.');
  setLoading(false);
 }

 const assetMap=useMemo(()=>new Map(assets.map(a=>[a.id,a])),[assets]);
 const docMap=useMemo(()=>new Map(documents.map(d=>[d.id,d])),[documents]);
 const today=iso();
 const soonDate=iso(new Date(Date.now()+30*86400000));
 const overdue=useMemo(()=>schedules.filter(s=>(s.next_due_date&&s.next_due_date<today)||mileageState(s,assetMap.get(s.asset_id||'')).due),[schedules,assets,today]);
 const upcoming=useMemo(()=>schedules.filter(s=>!overdue.some(x=>x.id===s.id)&&((s.next_due_date&&s.next_due_date<=soonDate)||mileageState(s,assetMap.get(s.asset_id||'')).near)),[schedules,overdue,assets,soonDate]);
 const warrantySoon=useMemo(()=>assets.filter(a=>a.warranty_expires_on&&a.warranty_expires_on>=today&&a.warranty_expires_on<=soonDate),[assets,today,soonDate]);
 const year=new Date().getFullYear();
 const yearCost=useMemo(()=>records.filter(r=>new Date(r.completed_date+'T12:00').getFullYear()===year).reduce((sum,r)=>sum+Number(r.cost||0),0),[records,year]);

 const assetName=(id:string|null)=>id?assetMap.get(id)?.name||'Activo':'Hogar';
 const memberName=(id:string|null)=>id?members.find(m=>m.user_id===id)?.full_name||'Miembro':'Todos';

 function startAsset(asset:Asset|null=null){if(readOnly)return;setEditingAsset(asset);setShowAsset(true)}
 function closeAsset(){setEditingAsset(null);setShowAsset(false)}
 function startSchedule(schedule:Schedule|null=null){if(readOnly)return;setEditingSchedule(schedule);setShowSchedule(true)}
 function closeSchedule(){setEditingSchedule(null);setShowSchedule(false)}

 async function saveAsset(e:FormEvent<HTMLFormElement>){
  if(readOnly){setMessage('Modo solo lectura.');return}
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const payload={household_id:household.id,name:String(f.get('name')||'').trim(),asset_type:String(f.get('asset_type')||'other'),estimated_value:Number(f.get('estimated_value')||0),brand:String(f.get('brand')||'').trim()||null,model:String(f.get('model')||'').trim()||null,asset_year:String(f.get('asset_year')||'')?Number(f.get('asset_year')):null,serial_number:String(f.get('serial_number')||'').trim()||null,license_plate:String(f.get('license_plate')||'').trim()||null,current_mileage:String(f.get('current_mileage')||'')?Number(f.get('current_mileage')):null,purchase_date:String(f.get('purchase_date')||'')||null,warranty_expires_on:String(f.get('warranty_expires_on')||'')||null,notes:String(f.get('notes')||'').trim()||null,updated_at:new Date().toISOString()};
  const result=editingAsset?await supabase.from('finance_assets').update(payload).eq('id',editingAsset.id).eq('household_id',household.id):await supabase.from('finance_assets').insert({...payload,is_shared:true});
  setBusy(false);setMessage(result.error?result.error.message:editingAsset?'Activo actualizado.':'Activo agregado.');
  if(!result.error){closeAsset();await supabase.rpc('refresh_my_net_worth_snapshot',{p_household_id:household.id});await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});await load(false)}
 }

 async function saveSchedule(e:FormEvent<HTMLFormElement>){
  if(readOnly){setMessage('Modo solo lectura.');return}
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const nextDate=String(f.get('next_due_date')||'')||null,nextKm=String(f.get('next_due_mileage')||'')?Number(f.get('next_due_mileage')):null,intervalMonths=String(f.get('interval_months')||'')?Number(f.get('interval_months')):null,intervalKm=String(f.get('interval_km')||'')?Number(f.get('interval_km')):null;
  if(!nextDate&&nextKm==null&&intervalMonths==null&&intervalKm==null){setBusy(false);setMessage('Indica una próxima fecha, kilometraje o recurrencia.');return}
  const payload={household_id:household.id,asset_id:String(f.get('asset_id')||'')||null,title:String(f.get('title')||'').trim(),maintenance_type:String(f.get('maintenance_type')||'service'),provider:String(f.get('provider')||'').trim()||null,estimated_cost:String(f.get('estimated_cost')||'')?Number(f.get('estimated_cost')):null,assigned_to:String(f.get('assigned_to')||'')||null,next_due_date:nextDate,next_due_mileage:nextKm,interval_months:intervalMonths,interval_km:intervalKm,document_id:String(f.get('document_id')||'')||null,notes:String(f.get('notes')||'').trim()||null,updated_at:new Date().toISOString()};
  let id=editingSchedule?.id||'';
  if(editingSchedule){
   const {error}=await supabase.from('maintenance_schedules').update(payload).eq('id',editingSchedule.id).eq('household_id',household.id);
   if(error){setBusy(false);setMessage(error.message);return}
  }else{
   const {data,error}=await supabase.from('maintenance_schedules').insert(payload).select('id').single();
   if(error||!data){setBusy(false);setMessage(error?.message||'No se pudo crear el plan.');return}id=data.id;
   // From here on the form edits this record, so retrying after a failed sync never inserts a duplicate plan.
   setEditingSchedule({...payload,id,last_completed_date:null,last_completed_mileage:null,calendar_event_id:null,active:true} as Schedule);
  }
  const sync=await supabase.rpc('sync_maintenance_event',{p_schedule_id:id});
  setBusy(false);setMessage(sync.error?'El plan se guardó, pero no se sincronizó con el calendario: '+sync.error.message+' Vuelve a guardar para reintentar.':editingSchedule?'Plan actualizado y calendario sincronizado.':'Plan creado y agregado al calendario.');
  if(!sync.error){closeSchedule();await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});await load(false)}
 }

 async function archiveSchedule(schedule:Schedule){
  if(readOnly){setMessage('Modo solo lectura.');return}
  if(!window.confirm('¿Archivar este plan de mantenimiento?'))return;
  setBusy(true);setMessage('');const {error}=await supabase.from('maintenance_schedules').update({active:false,updated_at:new Date().toISOString()}).eq('id',schedule.id).eq('household_id',household.id);
  if(!error)await supabase.rpc('sync_maintenance_event',{p_schedule_id:schedule.id});
  setBusy(false);setMessage(error?error.message:'Plan archivado.');if(!error)await load(false);
 }

 async function completeSchedule(e:FormEvent<HTMLFormElement>){
  if(readOnly){setMessage('Modo solo lectura.');return}
  e.preventDefault();if(!completing)return;setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const {error}=await supabase.rpc('complete_maintenance',{p_schedule_id:completing.id,p_completed_date:String(f.get('completed_date')||today),p_mileage:String(f.get('mileage')||'')?Number(f.get('mileage')):null,p_cost:String(f.get('cost')||'')?Number(f.get('cost')):null,p_provider:String(f.get('provider')||'')||null,p_document_id:String(f.get('document_id')||'')||null,p_notes:String(f.get('notes')||'')||null});
  setBusy(false);setMessage(error?error.message:'Mantenimiento completado. El próximo servicio y calendario fueron actualizados.');
  if(!error){setCompleting(null);await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});await load(false)}
 }

 async function updateMileage(asset:Asset){
  if(readOnly){setMessage('Modo solo lectura.');return}
  const raw=window.prompt('Kilometraje actual de '+asset.name,String(asset.current_mileage||0));if(raw==null)return;
  const value=Number(raw);if(!Number.isFinite(value)||value<0){setMessage('Ingresa un kilometraje válido.');return}
  setMessage('');const {error}=await supabase.from('finance_assets').update({current_mileage:value,updated_at:new Date().toISOString()}).eq('id',asset.id).eq('household_id',household.id);
  setMessage(error?error.message:'Kilometraje actualizado.');if(!error){await supabase.rpc('refresh_my_notifications',{p_household_id:household.id});await load(false)}
 }

 if(loading)return <ModuleLoading/>;

 return <section className="maintenance-center">
  <WorkspaceHeading className="finance-top"><WorkspaceTitle module="maintenance" eyebrow="CASA Y VEHÍCULOS" title="Mantenimiento" description="Servicios, reparaciones, seguros, garantías y kilometraje conectados con Agenda, Documentos y Alertas."/>{!readOnly&&<button className="finance-new" onClick={()=>startSchedule()}><Plus/> Plan</button>}</WorkspaceHeading>

  <div className="maintenance-tabs"><button className={tab==='summary'?'active':''} onClick={()=>setTab('summary')}><ModuleIcon name="home"/> Resumen</button><button className={tab==='assets'?'active':''} onClick={()=>setTab('assets')}><Car/> Activos</button><button className={tab==='plans'?'active':''} onClick={()=>setTab('plans')}><ModuleIcon name="maintenance"/> Planes</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}><History/> Historial</button></div>
  {message&&<div className="finance-message">{message}<button onClick={()=>setMessage('')}><X size={15}/></button></div>}

  {tab==='summary'&&<>
   <div className="maintenance-kpis">
    <div><span className="danger"><AlertTriangle/></span><small>Vencidos / por km</small><strong>{overdue.length}</strong><em>{overdue.length?'Requieren atención':'Todo al día'}</em></div>
    <div><span className="warning"><CalendarClock/></span><small>Próximos 30 días</small><strong>{upcoming.length}</strong><em>{upcoming.length?'Servicios próximos':'Sin vencimientos'}</em></div>
    <div><span className="asset"><Car/></span><small>Activos controlados</small><strong>{assets.length}</strong><em>{assets.filter(a=>a.asset_type==='vehicle').length} vehículo{assets.filter(a=>a.asset_type==='vehicle').length===1?'':'s'}</em></div>
    <div><span className="cost"><ReceiptText/></span><small>Costo {year}</small><strong>{money(yearCost)}</strong><em>{records.filter(r=>new Date(r.completed_date+'T12:00').getFullYear()===year).length} servicios</em></div>
   </div>

   <div className="maintenance-columns">
    <div className="finance-panel">
     <div className="panel-title"><div><h3>Necesita atención</h3><small>Ordenado por urgencia, fecha y kilometraje.</small></div><button onClick={()=>setTab('plans')}>Ver planes <ChevronRight/></button></div>
     <div className="maintenance-alert-list">{[...overdue,...upcoming].slice(0,6).map(s=><ScheduleRow key={s.id} schedule={s} asset={assetMap.get(s.asset_id||'')} readOnly={readOnly} onComplete={()=>setCompleting(s)} onEdit={()=>startSchedule(s)}/>)}</div>
     {!overdue.length&&!upcoming.length&&<div className="control-clear"><CheckCircle2/><div><strong>Todo al día</strong><span>No hay mantenimientos próximos ni vencidos.</span></div></div>}
    </div>
    <div className="finance-panel">
     <div className="panel-title"><div><h3>Garantías y documentos</h3><small>Activos con garantía próxima y accesos relacionados.</small></div><button onClick={()=>onNavigate?.('documentos')}>Documentos <ChevronRight/></button></div>
     <div className="maintenance-warranty-list">{warrantySoon.slice(0,5).map(a=><div key={a.id}><span><ShieldCheck/></span><div><strong>{a.name}</strong><small>Garantía vence {fmtDate(a.warranty_expires_on)}</small></div><button onClick={()=>onNavigate?.('documentos')}><ModuleIcon name="documents"/></button></div>)}</div>
     {!warrantySoon.length&&<div className="control-empty small"><ShieldCheck/><span>No hay garantías por vencer en 30 días.</span></div>}
    </div>
   </div>

   <div className="finance-panel">
    <div className="panel-title"><div><h3>Activos del hogar</h3><small>Estado rápido de casa, vehículos y equipos.</small></div><button onClick={()=>setTab('assets')}>Administrar <ChevronRight/></button></div>
    <div className="maintenance-asset-strip">{assets.slice(0,6).map(a=><AssetMini key={a.id} asset={a} schedules={schedules.filter(s=>s.asset_id===a.id)}/>)}</div>
    {!assets.length&&<div className="document-empty"><Car/><strong>Aún no hay activos</strong><span>{readOnly?'No hay activos registrados.':'Agrega casa, vehículo u otro equipo para empezar a controlar mantenimiento.'}</span>{!readOnly&&<button onClick={()=>startAsset()}><Plus/> Agregar activo</button>}</div>}
   </div>
  </>}

  {tab==='assets'&&<>
   <div className="maintenance-section-head"><div><p className="eyebrow">ACTIVOS</p><h3>Casa, vehículos y equipos</h3><p>Estos mismos activos también forman parte del patrimonio financiero.</p></div>{!readOnly&&<button className="finance-new" onClick={()=>startAsset()}><Plus/> Activo</button>}</div>
   <div className="maintenance-assets-grid">{assets.map(asset=><article className="maintenance-asset-card" key={asset.id}><AssetIllustration kind={asset.asset_type}/><div className="maintenance-asset-head"><span>{assetIcon(asset.asset_type)}</span><div><small>{assetTypeName(asset.asset_type)}</small><strong>{asset.name}</strong><p>{[asset.brand,asset.model,asset.asset_year].filter(Boolean).join(' · ')||'Sin detalles técnicos'}</p></div>{!readOnly&&<button onClick={()=>startAsset(asset)}><ModuleIcon name="maintenance"/></button>}</div><div className="maintenance-asset-data">{asset.license_plate&&<div><span>Placa</span><b>{asset.license_plate}</b></div>}{asset.current_mileage!=null&&<div><span>Kilometraje</span><b>{fmtKm(asset.current_mileage)}</b></div>}{asset.warranty_expires_on&&<div><span>Garantía</span><b>{fmtDate(asset.warranty_expires_on)}</b></div>}<div><span>Planes</span><b>{schedules.filter(s=>s.asset_id===asset.id).length}</b></div></div>{!readOnly&&asset.asset_type==='vehicle'&&<button className="maintenance-mileage-button" onClick={()=>updateMileage(asset)}><Gauge/> Actualizar kilometraje</button>}</article>)}</div>
   {!assets.length&&<div className="document-empty"><Building2/><strong>Sin activos registrados</strong><span>{readOnly?'No hay activos disponibles para consultar.':'Agrega primero tu vivienda, vehículo o equipo principal.'}</span>{!readOnly&&<button onClick={()=>startAsset()}><Plus/> Agregar activo</button>}</div>}
  </>}

  {tab==='plans'&&<>
   <div className="maintenance-section-head"><div><p className="eyebrow">PLANIFICACIÓN</p><h3>Planes de mantenimiento</h3><p>Pueden vencer por fecha, kilometraje o ambos. Los planes con fecha aparecen automáticamente en Agenda.</p></div>{!readOnly&&<button className="finance-new" onClick={()=>startSchedule()}><Plus/> Plan</button>}</div>
   <div className="maintenance-plans-grid">{schedules.map(schedule=>{const asset=assetMap.get(schedule.asset_id||''),m=mileageState(schedule,asset);return <article className={'maintenance-plan-card '+scheduleStatus(schedule,asset).tone} key={schedule.id}><div className="maintenance-plan-head"><span>{maintenanceIcon(schedule.maintenance_type)}</span><div><small>{maintenanceTypeName(schedule.maintenance_type)}</small><strong>{schedule.title}</strong><p>{asset?.name||'Mantenimiento general del hogar'}</p></div><b>{scheduleStatus(schedule,asset).label}</b></div><div className="maintenance-plan-details">{schedule.next_due_date&&<div><CalendarClock/><span>Próxima fecha<b>{fmtDate(schedule.next_due_date)}</b></span></div>}{schedule.next_due_mileage!=null&&<div><Gauge/><span>Próximo km<b>{fmtKm(schedule.next_due_mileage)}</b></span></div>}{schedule.provider&&<div><ModuleIcon name="maintenance"/><span>Proveedor<b>{schedule.provider}</b></span></div>}{schedule.estimated_cost!=null&&<div><ReceiptText/><span>Estimado<b>{money(Number(schedule.estimated_cost))}</b></span></div>}</div>{schedule.next_due_mileage!=null&&asset?.current_mileage!=null&&<div className="maintenance-km-progress"><div><span>{fmtKm(asset.current_mileage)} actual</span><strong>{Math.max(0,Number(schedule.next_due_mileage)-Number(asset.current_mileage)).toLocaleString('es-GT')} km restantes</strong></div><div className="progress"><span style={{width:Math.min(100,Math.max(4,m.progress))+'%'}}/></div></div>}{schedule.document_id&&<button className="maintenance-doc-link" onClick={()=>onNavigate?.('documentos')}><ModuleIcon name="documents"/> {docMap.get(schedule.document_id)?.title||'Documento vinculado'} <ChevronRight/></button>}{!readOnly&&<div className="maintenance-plan-actions"><button onClick={()=>setCompleting(schedule)}><Check/> Completar</button><button onClick={()=>startSchedule(schedule)}><ModuleIcon name="maintenance"/> Editar</button><button className="danger" onClick={()=>archiveSchedule(schedule)}><Trash2/> Archivar</button></div>}</article>})}</div>
   {!schedules.length&&<div className="document-empty"><ModuleIcon name="maintenance"/><strong>No hay planes de mantenimiento</strong><span>{readOnly?'No hay planes registrados.':'Programa aceite, seguro, fumigación, filtros, reparaciones o renovaciones.'}</span>{!readOnly&&<button onClick={()=>startSchedule()}><Plus/> Crear primer plan</button>}</div>}
  </>}

  {tab==='history'&&<>
   <div className="maintenance-section-head"><div><p className="eyebrow">HISTORIAL</p><h3>Servicios realizados</h3><p>Costos, kilometraje, proveedor y documentos vinculados.</p></div></div>
   <div className="maintenance-history">{records.map(record=><article key={record.id}><span>{maintenanceIcon(record.maintenance_type)}</span><div><strong>{record.title}</strong><small>{assetName(record.asset_id)} · {fmtDate(record.completed_date)}{record.provider?' · '+record.provider:''}</small>{record.notes&&<p>{record.notes}</p>}</div><div><b>{record.cost!=null?money(Number(record.cost)):'—'}</b><small>{record.mileage!=null?fmtKm(record.mileage):''}</small></div>{record.document_id&&<button onClick={()=>onNavigate?.('documentos')}><ModuleIcon name="documents"/></button>}</article>)}</div>
   {!records.length&&<div className="document-empty"><History/><strong>Aún no hay historial</strong><span>Los mantenimientos completados aparecerán aquí automáticamente.</span></div>}
  </>}

  {showAsset&&!readOnly&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeAsset()}}><div className="finance-modal"><div className="modal-head"><h3>{editingAsset?'Editar activo':'Nuevo activo'}</h3><button type="button" aria-label="Cerrar" onClick={closeAsset}><X/></button></div><form className="finance-form" onSubmit={saveAsset}>
   <label>Nombre<input name="name" defaultValue={editingAsset?.name||''} placeholder="Ej. Mazda CX-5 o Casa" required/></label>
   <div className="two"><label>Tipo<select name="asset_type" defaultValue={editingAsset?.asset_type||'vehicle'}><option value="vehicle">Vehículo</option><option value="property">Propiedad / casa</option><option value="other">Equipo / otro</option></select></label><label>Valor estimado<input name="estimated_value" type="number" min="0" step=".01" defaultValue={editingAsset?Number(editingAsset.estimated_value):0}/></label></div>
   <div className="three"><label>Marca<input name="brand" defaultValue={editingAsset?.brand||''}/></label><label>Modelo<input name="model" defaultValue={editingAsset?.model||''}/></label><label>Año<input name="asset_year" type="number" min="1900" max="2200" defaultValue={editingAsset?.asset_year||''}/></label></div>
   <div className="two"><label>Placa<input name="license_plate" defaultValue={editingAsset?.license_plate||''} placeholder="Vehículos"/></label><label>Serie / VIN<input name="serial_number" defaultValue={editingAsset?.serial_number||''}/></label></div>
   <div className="three"><label>Kilometraje<input name="current_mileage" type="number" min="0" step="1" defaultValue={editingAsset?.current_mileage??''}/></label><label>Fecha compra<input name="purchase_date" type="date" defaultValue={editingAsset?.purchase_date||''}/></label><label>Garantía vence<input name="warranty_expires_on" type="date" defaultValue={editingAsset?.warranty_expires_on||''}/></label></div>
   <label>Notas<input name="notes" defaultValue={editingAsset?.notes||''} placeholder="Información útil"/></label>
   <button className="finance-primary" disabled={busy}><Check/>{busy?'Guardando...':editingAsset?'Guardar cambios':'Agregar activo'}</button>
  </form></div></div>}

  {showSchedule&&!readOnly&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeSchedule()}}><div className="finance-modal maintenance-modal"><div className="modal-head"><div><p className="eyebrow">PLAN DE MANTENIMIENTO</p><h3>{editingSchedule?'Editar plan':'Nuevo plan'}</h3></div><button type="button" aria-label="Cerrar" onClick={closeSchedule}><X/></button></div><form className="finance-form" onSubmit={saveSchedule}>
   <label>Actividad<input name="title" defaultValue={editingSchedule?.title||''} placeholder="Ej. Cambio de aceite" required/></label>
   <div className="two"><label>Activo<select name="asset_id" defaultValue={editingSchedule?.asset_id||''}><option value="">General del hogar</option>{assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Tipo<select name="maintenance_type" defaultValue={editingSchedule?.maintenance_type||'service'}><option value="service">Servicio</option><option value="repair">Reparación</option><option value="inspection">Inspección</option><option value="insurance">Seguro</option><option value="registration">Renovación / circulación</option><option value="warranty">Garantía</option><option value="cleaning">Limpieza</option><option value="other">Otro</option></select></label></div>
   <div className="two"><label>Próxima fecha<input name="next_due_date" type="date" defaultValue={editingSchedule?.next_due_date||''}/></label><label>Próximo kilometraje<input name="next_due_mileage" type="number" min="0" step="1" defaultValue={editingSchedule?.next_due_mileage??''} placeholder="Vehículos"/></label></div>
   <div className="two"><label>Repetir cada meses<input name="interval_months" type="number" min="1" max="120" defaultValue={editingSchedule?.interval_months??''} placeholder="Ej. 6"/></label><label>Repetir cada km<input name="interval_km" type="number" min="1" step="1" defaultValue={editingSchedule?.interval_km??''} placeholder="Ej. 5000"/></label></div>
   <div className="two"><label>Proveedor<input name="provider" defaultValue={editingSchedule?.provider||''} placeholder="Taller, aseguradora, técnico"/></label><label>Costo estimado<input name="estimated_cost" type="number" min="0" step=".01" defaultValue={editingSchedule?.estimated_cost??''}/></label></div>
   <div className="two"><label>Responsable<select name="assigned_to" defaultValue={editingSchedule?.assigned_to||''}><option value="">Todos</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label><label>Documento relacionado<select name="document_id" defaultValue={editingSchedule?.document_id||''}><option value="">Ninguno</option>{documents.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label></div>
   <label>Notas<textarea name="notes" rows={3} defaultValue={editingSchedule?.notes||''} placeholder="Detalles, piezas, cobertura o instrucciones"/></label>
   <div className="maintenance-calendar-note"><CalendarClock/><span>Si agregas una próxima fecha, Nuestro Hogar crea o actualiza automáticamente el evento correspondiente en Agenda.</span></div>
   <button className="finance-primary" disabled={busy}><Check/>{busy?'Guardando...':editingSchedule?'Guardar cambios':'Crear plan'}</button>
  </form></div></div>}

  {completing&&!readOnly&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setCompleting(null)}}><div className="finance-modal"><div className="modal-head"><div><p className="eyebrow">{assetName(completing.asset_id)}</p><h3>Completar {completing.title}</h3></div><button onClick={()=>setCompleting(null)}><X/></button></div><form className="finance-form" onSubmit={completeSchedule}>
   <div className="two"><label>Fecha realizada<input name="completed_date" type="date" defaultValue={today} required/></label><label>Kilometraje<input name="mileage" type="number" min="0" step="1" defaultValue={completing.asset_id?assetMap.get(completing.asset_id)?.current_mileage??'':''}/></label></div>
   <div className="two"><label>Costo real<input name="cost" type="number" min="0" step=".01" placeholder="0.00"/></label><label>Proveedor<input name="provider" defaultValue={completing.provider||''}/></label></div>
   <label>Documento / factura<select name="document_id" defaultValue={completing.document_id||''}><option value="">Ninguno</option>{documents.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
   <label>Notas<textarea name="notes" rows={3} placeholder="Trabajo realizado, piezas cambiadas, observaciones"/></label>
   <div className="maintenance-complete-preview"><CheckCircle2/><div><strong>Al completar</strong><small>Se guardará en historial, actualizará el kilometraje y calculará automáticamente el próximo servicio según la recurrencia configurada.</small></div></div>
   <button className="finance-primary" disabled={busy}><Check/>{busy?'Actualizando...':'Marcar completado'}</button>
  </form></div></div>}
 </section>
}

function ScheduleRow({schedule,asset,onComplete,onEdit,readOnly=false}:{schedule:Schedule;asset?:Asset;onComplete:()=>void;onEdit:()=>void;readOnly?:boolean}){
 const status=scheduleStatus(schedule,asset);
 return <div className={'maintenance-alert-row '+status.tone}><span>{maintenanceIcon(schedule.maintenance_type)}</span><div><strong>{schedule.title}</strong><small>{asset?.name||'Hogar'} · {schedule.next_due_date?fmtDate(schedule.next_due_date):schedule.next_due_mileage!=null?fmtKm(schedule.next_due_mileage):'Sin fecha'}</small></div><b>{status.label}</b>{!readOnly&&<div><button type="button" aria-label="Marcar como hecho" title="Marcar como hecho" onClick={onComplete}><Check/></button><button onClick={onEdit}><ModuleIcon name="maintenance"/></button></div>}</div>
}
function AssetMini({asset,schedules}:{asset:Asset;schedules:Schedule[]}){const next=schedules.slice().sort((a,b)=>(a.next_due_date||'9999').localeCompare(b.next_due_date||'9999'))[0];return <div className="maintenance-asset-mini"><span>{assetIcon(asset.asset_type)}</span><div><strong>{asset.name}</strong><small>{asset.asset_type==='vehicle'&&asset.current_mileage!=null?fmtKm(asset.current_mileage):assetTypeName(asset.asset_type)}</small></div><em>{next?next.title:'Sin plan'}</em></div>}
function mileageState(schedule:Schedule,asset?:Asset){if(schedule.next_due_mileage==null||asset?.current_mileage==null)return{due:false,near:false,progress:0};const target=Number(schedule.next_due_mileage),current=Number(asset.current_mileage),remaining=target-current;const base=Number(schedule.last_completed_mileage??Math.max(0,target-Number(schedule.interval_km||target||1))),span=Math.max(1,target-base);return{due:remaining<=0,near:remaining>0&&remaining<=500,progress:(current-base)/span*100}}
function scheduleStatus(schedule:Schedule,asset?:Asset){const today=iso(),m=mileageState(schedule,asset);if((schedule.next_due_date&&schedule.next_due_date<today)||m.due)return{tone:'danger',label:'Vencido'};const limit=iso(new Date(Date.now()+7*86400000));if((schedule.next_due_date&&schedule.next_due_date<=limit)||m.near)return{tone:'warning',label:'Próximo'};return{tone:'ok',label:'Al día'}}
function maintenanceIcon(type:MaintenanceType){if(type==='repair')return <ModuleIcon name="maintenance"/>;if(type==='insurance')return <ShieldCheck/>;if(type==='registration')return <ModuleIcon name="documents"/>;if(type==='warranty')return <ShieldCheck/>;if(type==='inspection')return <CheckCircle2/>;if(type==='cleaning')return <ModuleIcon name="home"/>;return <ModuleIcon name="maintenance"/>}
function maintenanceTypeName(type:MaintenanceType){return({service:'Servicio',repair:'Reparación',inspection:'Inspección',insurance:'Seguro',registration:'Renovación',warranty:'Garantía',cleaning:'Limpieza',other:'Otro'} as Record<string,string>)[type]||'Mantenimiento'}
function assetIcon(type:AssetType){if(type==='vehicle')return <Car/>;if(type==='property')return <Building2/>;return <ModuleIcon name="home"/>}
function assetTypeName(type:AssetType){if(type==='vehicle')return'Vehículo';if(type==='property')return'Propiedad';return'Equipo / otro'}
