import WorkspaceHeading from './WorkspaceHeading';
import WorkspaceTitle from './WorkspaceTitle';
import {fetchAllRows,pagedResult} from './lib/paging';
import ModuleLoading from './ModuleLoading';
import FileBackupPanel from './FileBackupPanel';
import ModuleIcon from './ModuleIcon';
import {ChangeEvent,useEffect,useMemo,useRef,useState} from 'react';
import {ArchiveRestore,CheckCircle2,Database,Download,FileJson,FileSpreadsheet,History,Package,Printer,RefreshCw,ShieldCheck,Trash2,UploadCloud,X} from 'lucide-react';
import {supabase} from './lib/supabase';
import {formatMoney} from './lib/money';
import {localISODate} from './lib/localDate';
import './BackupCenter.css';

type Household={id:string;name:string;invite_code:string};
type BackupRow={id:string;name:string;schema_version:number;counts:any;size_bytes:number;source:'manual'|'imported';created_at:string};
type RecoveryRow={id:string;module:string;source_table:string;source_id:string;label:string|null;deleted_at:string;expires_at:string;restored_at:string|null};
type Snapshot={product:string;schema_version:number;exported_at:string;household:{id:string;name:string};members:any[];tables:Record<string,any[]>;notes?:Record<string,any>};

const money=(n:number)=>formatMoney(Number(n||0));
const dateTime=(value:string)=>new Date(value).toLocaleString('es-GT',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace('.','');
const safeName=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'nuestro-hogar';
const escapeHtml=(value:any)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]||ch));

export default function BackupCenter({household}:{household:Household}){
 const [backups,setBackups]=useState<BackupRow[]>([]),[recovery,setRecovery]=useState<RecoveryRow[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
 const [showCreate,setShowCreate]=useState(false),[backupName,setBackupName]=useState('');
 const fileRef=useRef<HTMLInputElement|null>(null);

 useEffect(()=>{load()},[household.id]);

 async function load(showLoader=true){
  if(showLoader)setLoading(true);
  const [b,r]=await Promise.all([
   supabase.from('household_backups').select('id,name,schema_version,counts,size_bytes,source,created_at').eq('household_id',household.id).order('created_at',{ascending:false}),
   supabase.from('household_recovery_items').select('id,module,source_table,source_id,label,deleted_at,expires_at,restored_at').eq('household_id',household.id).is('restored_at',null).gt('expires_at',new Date().toISOString()).order('deleted_at',{ascending:false}).limit(50)
  ]);
  if(b.error||r.error)setMessage(b.error?.message||r.error?.message||'No se pudo cargar el centro de respaldo.');
  setBackups((b.data||[]) as BackupRow[]);setRecovery((r.data||[]) as RecoveryRow[]);if(showLoader)setLoading(false);
 }

 async function createBackup(){
  setBusy('create');setMessage('');
  const {error}=await supabase.rpc('create_household_backup',{p_household_id:household.id,p_name:backupName.trim()||null});
  setBusy('');if(error){setMessage(error.message);return}
  setBackupName('');setShowCreate(false);setMessage('Respaldo creado correctamente.');await load();
 }

 async function downloadLiveJson(){
  setBusy('json');setMessage('');
  const {data,error}=await supabase.rpc('build_household_backup_snapshot',{p_household_id:household.id});
  setBusy('');if(error){setMessage(error.message);return}
  downloadBlob(JSON.stringify(data,null,2),`${safeName(household.name)}-respaldo-${localISODate()}.json`,'application/json;charset=utf-8');
  setMessage('Respaldo JSON descargado.');
 }

 async function downloadStored(backup:BackupRow){
  setBusy('download-'+backup.id);
  const {data,error}=await supabase.from('household_backups').select('snapshot').eq('id',backup.id).single();
  setBusy('');if(error){setMessage(error.message);return}
  downloadBlob(JSON.stringify(data.snapshot,null,2),`${safeName(household.name)}-${safeName(backup.name)}.json`,'application/json;charset=utf-8');
 }

 async function restoreBackup(backup:BackupRow){
  if(!window.confirm('¿Restaurar registros faltantes desde este respaldo? No se sobrescribirá información que todavía exista.'))return;
  setBusy('restore-'+backup.id);setMessage('');
  const {data,error}=await supabase.rpc('restore_household_backup_missing',{p_backup_id:backup.id});
  setBusy('');if(error){setMessage(error.message);return}
  const count=Number(data?.restored_records||0);
  setMessage(count?count+' registro'+(count===1?'':'s')+' restaurado'+(count===1?'':'s')+'.':'No faltaba ningún registro de este respaldo.');
  await load();
 }

 async function deleteBackup(backup:BackupRow){
  if(!window.confirm('¿Eliminar definitivamente este respaldo?'))return;
  setBusy('delete-'+backup.id);
  const {error}=await supabase.rpc('delete_household_backup',{p_backup_id:backup.id});
  setBusy('');setMessage(error?error.message:'Respaldo eliminado.');if(!error)await load();
 }

 async function importBackup(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  setBusy('import');setMessage('');
  try{
   const text=await file.text();const snapshot=JSON.parse(text) as Snapshot;
   if(!snapshot||snapshot.product!=='Nuestro Hogar'||snapshot.schema_version!==1||!snapshot.tables)throw new Error('El archivo no parece ser un respaldo compatible de Nuestro Hogar.');
   const {error}=await supabase.rpc('import_household_backup',{p_household_id:household.id,p_snapshot:snapshot,p_name:file.name.replace(/\.json$/i,'')});
   setBusy('');if(error){setMessage(error.message);return}
   setMessage('Respaldo importado. Ahora puedes usar “Restaurar faltantes” si lo necesitas.');await load();
  }catch(err:any){setBusy('');setMessage(err?.message||'No se pudo leer el archivo JSON.')}
 }

 async function restoreRecovery(item:RecoveryRow){
  setBusy('recovery-'+item.id);setMessage('');
  const {data,error}=await supabase.rpc('restore_recovery_item',{p_item_id:item.id});
  setBusy('');if(error){setMessage(error.message);return}
  setMessage(Number(data?.records||0)+' registro'+(Number(data?.records||0)===1?'':'s')+' recuperado'+(Number(data?.records||0)===1?'':'s')+'.');await load();
 }

 async function discardRecovery(item:RecoveryRow){
  if(!window.confirm('¿Eliminar este elemento de recuperación? Después no podrá restaurarse desde la papelera.'))return;
  setBusy('discard-'+item.id);
  const {error}=await supabase.rpc('discard_recovery_item',{p_item_id:item.id});
  setBusy('');setMessage(error?error.message:'Elemento eliminado de la papelera.');if(!error)await load();
 }

 async function exportFinance(){
  setBusy('finance');
  // Every export pages through all rows: a single query stops at the server's 1,000-row limit without warning.
  const [txR,catR]=await Promise.all([
   pagedResult(()=>fetchAllRows((a,b)=>supabase.from('transactions').select('id,transaction_date,type,description,amount,category_id,notes,is_shared').eq('household_id',household.id).order('transaction_date').order('id').range(a,b))),
   supabase.from('budget_categories').select('id,name').eq('household_id',household.id)
  ]);
  setBusy('');if(txR.error||catR.error){setMessage(txR.error?.message||catR.error?.message||'No se pudo exportar.');return}
  const cats=new Map((catR.data||[]).map((x:any)=>[x.id,x.name]));
  downloadCsv(`${safeName(household.name)}-finanzas.csv`,(txR.data||[]).map((x:any)=>({
   Fecha:x.transaction_date,Tipo:x.type==='income'?'Ingreso':'Gasto',Descripcion:x.description,Categoria:cats.get(x.category_id)||'',Monto:Number(x.amount),Compartido:x.is_shared?'Sí':'No',Notas:x.notes||''
  })));
 }

 async function exportCalendar(){
  setBusy('calendar');
  const {data,error}=await pagedResult(()=>fetchAllRows((a,b)=>supabase.from('events').select('id,event_date,start_time,end_time,title,category,location,all_day,recurrence,description').eq('household_id',household.id).order('event_date').order('id').range(a,b)));
  setBusy('');if(error){setMessage(error.message);return}
  downloadCsv(`${safeName(household.name)}-agenda.csv`,(data||[]).map((x:any)=>({Fecha:x.event_date,Inicio:x.start_time||'',Fin:x.end_time||'',Evento:x.title,Categoria:x.category,Lugar:x.location||'',Todo_el_dia:x.all_day?'Sí':'No',Repeticion:x.recurrence,Descripcion:x.description||''})));
 }

 async function exportLists(){
  setBusy('lists');
  const [lR,iR]=await Promise.all([
   supabase.from('lists').select('id,title,list_type').eq('household_id',household.id),
   pagedResult(()=>fetchAllRows((a,b)=>supabase.from('list_items').select('id,list_id,text,quantity,completed,due_date,notes').eq('household_id',household.id).order('created_at').order('id').range(a,b)))
  ]);
  setBusy('');if(lR.error||iR.error){setMessage(lR.error?.message||iR.error?.message||'No se pudo exportar.');return}
  const lists=new Map((lR.data||[]).map((x:any)=>[x.id,x]));
  downloadCsv(`${safeName(household.name)}-listas.csv`,(iR.data||[]).map((x:any)=>({Lista:lists.get(x.list_id)?.title||'',Tipo:lists.get(x.list_id)?.list_type||'',Elemento:x.text,Cantidad:x.quantity||'',Completado:x.completed?'Sí':'No',Vence:x.due_date||'',Notas:x.notes||''})));
 }

 async function exportPantry(){
  setBusy('pantry');
  const {data,error}=await pagedResult(()=>fetchAllRows((a,b)=>supabase.from('pantry_items').select('id,name,category,quantity,unit,minimum_quantity,location,expires_on,notes,active').eq('household_id',household.id).order('name').order('id').range(a,b)));
  setBusy('');if(error){setMessage(error.message);return}
  downloadCsv(`${safeName(household.name)}-despensa.csv`,(data||[]).map((x:any)=>({Producto:x.name,Categoria:x.category,Cantidad:Number(x.quantity),Unidad:x.unit,Minimo:Number(x.minimum_quantity),Ubicacion:x.location,Vence:x.expires_on||'',Activo:x.active?'Sí':'No',Notas:x.notes||''})));
 }

 async function printMonthly(){
  setBusy('print');setMessage('');
  const {data:closed}=await supabase.from('monthly_household_closures').select('month,snapshot,reflection,next_month_focus,closed_at').eq('household_id',household.id).order('month',{ascending:false}).limit(1).maybeSingle();
  let snapshot:any=closed?.snapshot||null,period=closed?.month||null;
  if(!snapshot){
   const d=new Date(),month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
   const r=await supabase.rpc('build_monthly_household_close',{p_household_id:household.id,p_month:month});
   if(r.error){setBusy('');setMessage(r.error.message);return}
   snapshot=r.data;period=month;
  }
  try{const {downloadMonthlyPdf}=await import('./lib/monthlyPdf');await downloadMonthlyPdf(household.name,snapshot,{reflection:closed?.reflection,focus:closed?.next_month_focus,closed:Boolean(closed)})}catch(error){setMessage(error instanceof Error?error.message:'No se pudo descargar el PDF.')}finally{setBusy('')}

 }

 const totalRecords=useMemo(()=>backups.reduce((sum,b)=>sum+Number(b.counts?.total_records||0),0),[backups]);
 const newest=backups[0];

 if(loading)return <ModuleLoading/>;

 return <section className="backup-center">
  <WorkspaceHeading className="backup-top"><WorkspaceTitle module="backups" eyebrow="SEGURIDAD DE DATOS" title="Respaldos y recuperación" description="Exporta tu información, conserva fotografías completas y recupera eliminaciones accidentales."/><button className="backup-primary" onClick={()=>setShowCreate(true)}><ModuleIcon name="backups"/> Crear respaldo</button></WorkspaceHeading>
  {message&&<div className="finance-message">{message}<button onClick={()=>setMessage('')}><X size={15}/></button></div>}

  <div className="backup-kpis">
   <div><span className="safe"><ShieldCheck/></span><small>Respaldos guardados</small><strong>{backups.length}</strong><em>{newest?'Último '+relativeTime(newest.created_at):'Aún no has creado uno'}</em></div>
   <div><span className={recovery.length?'warning':'safe'}><ArchiveRestore/></span><small>Papelera</small><strong>{recovery.length}</strong><em>{recovery.length?'recuperables por 30 días':'Sin eliminaciones pendientes'}</em></div>
   <div><span className="data"><Database/></span><small>Registros respaldados</small><strong>{newest?Number(newest.counts?.total_records||0):0}</strong><em>{backups.length?totalRecords+' entre todos los respaldos':'Se calcula al crear respaldo'}</em></div>
  </div>

  <section className="backup-panel">
   <div className="backup-panel-head"><div><p className="eyebrow">EXPORTAR</p><h3>Lleva tus datos contigo</h3><p>CSV abre directamente en Excel. El JSON conserva la estructura completa para respaldo e importación.</p></div><Download/></div>
   <div className="backup-export-grid">
    <ExportCard icon={<FileJson/>} title="Registros en JSON" text="Datos del hogar y metadatos; usa ZIP para incluir archivos." action="Descargar JSON" busy={busy==='json'} onClick={downloadLiveJson}/>
    <ExportCard icon={<ModuleIcon name="finance"/>} title="Finanzas" text="Movimientos con categoría, monto, fecha y notas." action="Descargar CSV" busy={busy==='finance'} onClick={exportFinance}/>
    <ExportCard icon={<ModuleIcon name="calendar"/>} title="Agenda" text="Eventos, horarios, recurrencia y ubicaciones." action="Descargar CSV" busy={busy==='calendar'} onClick={exportCalendar}/>
    <ExportCard icon={<FileSpreadsheet/>} title="Listas" text="Compras, tareas, cantidades y estados." action="Descargar CSV" busy={busy==='lists'} onClick={exportLists}/>
    <ExportCard icon={<Package/>} title="Despensa" text="Inventario, mínimos, ubicaciones y vencimientos." action="Descargar CSV" busy={busy==='pantry'} onClick={exportPantry}/>
    <ExportCard icon={<Printer/>} title="Informe mensual" text="Resumen listo para imprimir o guardar como PDF." action="Descargar PDF" busy={busy==='print'} onClick={printMonthly}/>
   </div>
  </section>

  <FileBackupPanel key={household.id} household={household} onChanged={()=>load(false)}/>
  <div className="backup-two">
   <section className="backup-panel">
    <div className="backup-panel-head"><div><p className="eyebrow">RESPALDOS</p><h3>Fotografías completas</h3></div><button className="backup-import" onClick={()=>fileRef.current?.click()} disabled={busy==='import'}><UploadCloud/>{busy==='import'?'Importando...':'Importar JSON'}</button><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importBackup}/></div>
    {backups.length?<div className="backup-list">{backups.map(b=><article key={b.id}><span className="backup-list-icon"><ModuleIcon name="backups"/></span><div><strong>{b.name}</strong><small>{dateTime(b.created_at)} · {formatBytes(b.size_bytes)} · {Number(b.counts?.total_records||0)} registros</small><em>{b.source==='imported'?'Importado':'Creado en Nuestro Hogar'} · v{b.schema_version}</em></div><div className="backup-list-actions"><button title="Descargar" onClick={()=>downloadStored(b)} disabled={busy==='download-'+b.id}><Download/></button><button title="Restaurar faltantes" onClick={()=>restoreBackup(b)} disabled={busy==='restore-'+b.id}><RefreshCw/></button><button className="danger" title="Eliminar respaldo" onClick={()=>deleteBackup(b)} disabled={busy==='delete-'+b.id}><Trash2/></button></div></article>)}</div>:<div className="control-empty small"><ModuleIcon name="backups"/><span>Crea tu primer respaldo para conservar una fotografía completa del hogar.</span></div>}
   </section>

   <section className="backup-panel">
    <div className="backup-panel-head"><div><p className="eyebrow">RECUPERACIÓN</p><h3>Papelera de 30 días</h3><p>Las eliminaciones compatibles aparecen aquí antes de desaparecer definitivamente.</p></div><History/></div>
    {recovery.length?<div className="recovery-list">{recovery.map(item=><article key={item.id}><span className={'recovery-icon '+item.module}>{recoveryIcon(item.source_table)}</span><div><strong>{item.label||sourceLabel(item.source_table)}</strong><small>{sourceLabel(item.source_table)} · eliminado {relativeTime(item.deleted_at)}</small><em>Disponible {daysRemaining(item.expires_at)} día{daysRemaining(item.expires_at)===1?'':'s'} más</em></div><div><button className="restore" onClick={()=>restoreRecovery(item)} disabled={busy==='recovery-'+item.id}><ArchiveRestore/> Restaurar</button><button className="discard" onClick={()=>discardRecovery(item)} disabled={busy==='discard-'+item.id}><Trash2/></button></div></article>)}</div>:<div className="control-empty small"><CheckCircle2/><span>La papelera está vacía.</span></div>}
   </section>
  </div>

  <section className="backup-safety">
   <span><ShieldCheck/></span><div><strong>Recuperación conservadora</strong><p>Restaurar un respaldo solo vuelve a insertar registros que ya no existen; nunca sobrescribe información actual. El respaldo ZIP incluye los archivos físicos. En el JSON: se respaldan sus metadatos. Si un archivo adjunto fue eliminado del almacenamiento, habrá que volver a subirlo.</p></div>
  </section>

  {showCreate&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false)}}><div className="finance-modal backup-modal"><div className="modal-head"><div><p className="eyebrow">RESPALDO MANUAL</p><h3>Crear fotografía del hogar</h3></div><button onClick={()=>setShowCreate(false)}><X/></button></div><div className="finance-form"><label>Nombre del respaldo<input value={backupName} onChange={e=>setBackupName(e.target.value)} placeholder="Ej. Antes de cierre de octubre"/></label><div className="backup-create-note"><Database/><span>Incluye finanzas, agenda, listas, documentos (metadatos), comidas, mantenimiento, planeación, cierres y configuraciones operativas.</span></div><button className="finance-primary" onClick={createBackup} disabled={busy==='create'}><ModuleIcon name="backups"/>{busy==='create'?'Creando...':'Crear respaldo'}</button></div></div></div>}
 </section>
}

function ExportCard({icon,title,text,action,busy,onClick}:{icon:React.ReactNode;title:string;text:string;action:string;busy:boolean;onClick:()=>void}){
 return <button className="backup-export-card" onClick={onClick} disabled={busy}><span>{icon}</span><div><strong>{title}</strong><small>{text}</small></div><em>{busy?'Procesando...':action}<Download/></em></button>
}
function downloadBlob(content:string,filename:string,type:string){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function downloadCsv(filename:string,rows:Record<string,any>[]){if(!rows.length){downloadBlob('\ufeffSin datos\r\n',filename,'text/csv;charset=utf-8');return}const keys=Object.keys(rows[0]);// Text that starts like a formula (=, +, -, @) is prefixed with ' so Excel never runs it; numbers stay numbers.
 const cell=(v:any)=>{let text=String(v??'');if(typeof v==='string'&&/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};const csv='\ufeff'+keys.map(cell).join(',')+'\r\n'+rows.map(r=>keys.map(k=>cell(r[k])).join(',')).join('\r\n');downloadBlob(csv,filename,'text/csv;charset=utf-8')}
function formatBytes(value:number){if(value<1024)return value+' B';if(value<1024*1024)return(value/1024).toFixed(1)+' KB';return(value/1024/1024).toFixed(1)+' MB'}
function relativeTime(value:string){const ms=Math.max(0,Date.now()-new Date(value).getTime()),m=Math.floor(ms/60000);if(m<1)return'ahora';if(m<60)return'hace '+m+' min';const h=Math.floor(m/60);if(h<24)return'hace '+h+' h';const d=Math.floor(h/24);return'hace '+d+' día'+(d===1?'':'s')}
function daysRemaining(value:string){return Math.max(0,Math.ceil((new Date(value).getTime()-Date.now())/86400000))}
function sourceLabel(t:string){return({transactions:'Movimiento financiero',events:'Evento',lists:'Lista',list_items:'Elemento de lista',household_documents:'Documento',pantry_items:'Producto de despensa',recipes:'Receta',maintenance_schedules:'Mantenimiento',household_planning_goals:'Objetivo de planeación'} as Record<string,string>)[t]||t.replace(/_/g,' ')}
function recoveryIcon(t:string){if(t==='transactions')return <ModuleIcon name="finance"/>;if(t==='events')return <ModuleIcon name="calendar"/>;if(t==='household_documents')return <ModuleIcon name="documents"/>;if(t==='pantry_items'||t==='recipes')return <Package/>;if(t==='maintenance_schedules')return <RefreshCw/>;return <ArchiveRestore/>}
