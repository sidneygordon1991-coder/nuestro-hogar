import {useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import {Check,FileSpreadsheet,Upload} from 'lucide-react';
import {supabase} from './lib/supabase';
import {formatMoney} from './lib/money';
import {fetchAllRows} from './lib/paging';
import {suggestCategory} from './lib/quickEntry';
import {autoMap,buildPreview,chunk,columnNames,dateRange,emptyMapping,FIELD_LABELS,mappingProblem,markDuplicates,readStatement,type CheckedRow,type ColumnField,type ColumnMapping,type ExistingMovement} from './lib/csvImport';
import './finance-tools.css';

type Option={id:string;name:string};
type Props={householdId:string;currentUser:string;accounts:Option[];categories:Option[];memberCount:number;onImported:()=>void;onClose:()=>void;onBusy?:(busy:boolean)=>void};
type Statement=ReturnType<typeof readStatement>&{fileName:string};
type Result={imported:number;total:number;expenses:number;incomes:number;failure:string};

const MAX_BYTES=5*1024*1024,MAX_ROWS=3000,CHUNK=100;
const FIELDS=Object.keys(FIELD_LABELS) as ColumnField[];
const shortDate=(date:string)=>new Date(date+'T12:00').toLocaleDateString('es-GT',{day:'2-digit',month:'short',year:'numeric'});
const message=(err:unknown,fallback:string)=>err instanceof Error?err.message:String((err as {message?:string})?.message||fallback);

/** Reads UTF-8 and falls back to Windows-1252, the usual encoding of bank exports opened in Excel. */
async function readText(file:File){
 const buffer=await file.arrayBuffer();
 const utf8=new TextDecoder('utf-8').decode(buffer);
 return utf8.includes('�')?new TextDecoder('windows-1252').decode(buffer):utf8;
}

/** "Importar estado de cuenta": CSV → preview and duplicates → atomic, idempotent blocks of 100. */
export default function ImportStatement({householdId,currentUser,accounts,categories,memberCount:_memberCount,onImported,onClose,onBusy}:Props){
 const requests=useRef(new Map<string,string>());
 const [statement,setStatement]=useState<Statement|null>(null),[fileError,setFileError]=useState('');
 const [headerIndex,setHeaderIndex]=useState(-1),[mapping,setMapping]=useState<ColumnMapping>(emptyMapping());
 const [accountId,setAccountId]=useState(''),[categoryId,setCategoryId]=useState('auto'),[shareMode,setShareMode]=useState<'shared'|'personal'>('shared'),[positiveIsExpense,setPositiveIsExpense]=useState(false);
 const [existing,setExisting]=useState<{status:'idle'|'loading'|'ready'|'error';rows:ExistingMovement[];error:string}>({status:'idle',rows:[],error:''});
 const [overrides,setOverrides]=useState<Record<number,boolean>>({}),[refresh,setRefresh]=useState(0);
 const [importing,setImporting]=useState(false),[progress,setProgress]=useState<{done:number;total:number}|null>(null),[result,setResult]=useState<Result|null>(null);
 useEffect(()=>{onBusy?.(importing)},[importing]);

 async function pick(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];setFileError('');setResult(null);setProgress(null);setOverrides({});
  if(!file)return;requests.current.clear();
  if(!/\.csv$/i.test(file.name)&&!/csv|text\/plain/i.test(file.type)){setStatement(null);setFileError('Elige un archivo .csv exportado desde tu banco.');return}
  if(file.size>MAX_BYTES){setStatement(null);setFileError('El archivo supera 5 MB. Exporta un período más corto.');return}
  try{
   const read=readStatement(await readText(file));
   if(!read.rows.length)throw new Error('El archivo está vacío.');
   if(read.rows.length>MAX_ROWS)throw new Error(`El archivo tiene más de ${MAX_ROWS.toLocaleString('es-GT')} filas. Exporta un período más corto.`);
   setStatement({...read,fileName:file.name});setHeaderIndex(read.headerIndex);setMapping(read.mapping);
  }catch(err){setStatement(null);setFileError(message(err,'No se pudo leer el archivo.'))}
 }

 function chooseHeader(value:number){
  if(!statement)return;setHeaderIndex(value);setMapping(value>=0?autoMap(statement.rows[value]):emptyMapping());setOverrides({});
 }

 const columns=useMemo(()=>statement?columnNames(statement.rows,headerIndex):[],[statement,headerIndex]);
 const problem=statement?mappingProblem(mapping):null;
 const preview=useMemo(()=>statement&&!problem?buildPreview(statement.rows,headerIndex,mapping,{positiveIsExpense}):[],[statement,headerIndex,mapping,positiveIsExpense,problem]);
 const range=useMemo(()=>dateRange(preview),[preview]);

 useEffect(()=>{
  if(!range){setExisting({status:'idle',rows:[],error:''});return}
  let live=true;setExisting({status:'loading',rows:[],error:''});
  fetchAllRows<ExistingMovement>((from,to)=>supabase.from('transactions').select('transaction_date,amount,description,type').eq('household_id',householdId).gte('transaction_date',range.from).lte('transaction_date',range.to).order('id').range(from,to))
   .then(rows=>{if(live)setExisting({status:'ready',rows,error:''})},err=>{if(live)setExisting({status:'error',rows:[],error:message(err,'No se pudieron revisar duplicados.')})});
  return()=>{live=false};
 },[householdId,range?.from,range?.to,refresh]);
 // Recent categorized movements teach the per-row suggestion ("Sugerida por la descripción").
 const [history,setHistory]=useState<{description:string|null;type:string;category_id:string|null;amount:number}[]>([]);
 useEffect(()=>{let live=true;supabase.from('transactions').select('description,type,category_id,amount').eq('household_id',householdId).not('category_id','is',null).order('transaction_date',{ascending:false}).limit(400).then(({data})=>{if(live)setHistory((data||[]) as any[])});return()=>{live=false}},[householdId]);
 const rowCategory=(row:CheckedRow)=>row.type!=='expense'?null:categoryId==='auto'?suggestCategory(row.description,history,categories,'expense'):categoryId||null;
 const categoryName=(id:string|null)=>categories.find(c=>c.id===id)?.name||'Sin categoría';

 const checked:CheckedRow[]=useMemo(()=>markDuplicates(preview,existing.status==='ready'?existing.rows:[]),[preview,existing]);
 const valid=checked.filter(r=>r.valid),skipped=checked.filter(r=>!r.valid),duplicates=valid.filter(r=>r.duplicate);
 const isSelected=(row:CheckedRow)=>overrides[row.line]??(!row.duplicate&&!row.transfer);
 const transfers=valid.filter(r=>r.transfer&&!r.duplicate);
 const selected=valid.filter(isSelected);
 const selectedExpense=selected.filter(r=>r.type==='expense').reduce((n,r)=>n+Math.round(r.amount*100),0)/100,selectedIncome=selected.filter(r=>r.type==='income').reduce((n,r)=>n+Math.round(r.amount*100),0)/100;

 async function runImport(){
  if(importing||!selected.length||existing.status!=='ready')return;
  const rows=selected,blocks=chunk(rows,CHUNK);
  setImporting(true);setResult(null);setProgress({done:0,total:rows.length});
  const outcome:Result={imported:0,total:rows.length,expenses:0,incomes:0,failure:''};
  for(const [index,block] of blocks.entries()){
   const payload=block.map(r=>{
    const values={description:r.description,amount:r.amount,type:r.type,date:r.date,account_id:accountId||null,category_id:rowCategory(r),paid_by:currentUser||null,is_shared:shareMode==='shared',recurring:false};
    const key=JSON.stringify([r.line,r.date,r.amount,r.type,r.description,accountId,shareMode]);// stable while category suggestions load
    let requestId=requests.current.get(key);if(!requestId){requestId=crypto.randomUUID();requests.current.set(key,requestId)}
    return {request_id:requestId,values};
   });
   try{
    const {data,error}=await supabase.rpc('import_finance_transactions_once',{p_household_id:householdId,p_entries:payload});
    if(error)throw error;
    if(!Array.isArray(data?.transaction_ids)||data.transaction_ids.length!==block.length)throw new Error('No se confirmó el bloque completo. Reintenta para verificarlo.');
   }catch(error){outcome.failure=`El bloque ${index+1} de ${blocks.length} no se confirmó: ${message(error,'Revisa tu conexión y reintenta.')}`;break}
   outcome.imported+=block.length;outcome.expenses+=block.filter(r=>r.type==='expense').length;outcome.incomes+=block.filter(r=>r.type==='income').length;
   setProgress({done:outcome.imported,total:rows.length});
  }
  setResult(outcome);setImporting(false);setOverrides({});
  if(outcome.imported){onImported();setRefresh(n=>n+1)}
 }

 const done=Boolean(result&&!result.failure);
 return <div className="import-statement">
  <p className="tools-note">Sube el archivo .csv de tu banco. Revisa las columnas y la vista previa antes de importar; nada se guarda hasta que confirmes.</p>
  <label className="import-file"><span><FileSpreadsheet size={16} aria-hidden="true"/> Archivo del estado de cuenta (.csv)</span><input type="file" accept=".csv,text/csv" disabled={importing} onChange={pick}/></label>
  {fileError&&<p className="tools-error" role="alert">{fileError}</p>}
  {statement&&<>
   <section className="import-section" aria-label="Columnas del archivo">
    <h4>Columnas · {statement.fileName}</h4>
    <div className="tools-grid">
     <label>Fila de encabezados<select value={headerIndex} disabled={importing} onChange={e=>chooseHeader(Number(e.target.value))}><option value={-1}>El archivo no tiene encabezados</option>{statement.rows.slice(0,10).map((row,i)=><option key={i} value={i}>Fila {i+1}: {row.filter(Boolean).slice(0,3).join(' · ').slice(0,60)}</option>)}</select></label>
     {FIELDS.map(field=><label key={field}>{FIELD_LABELS[field]}<select value={mapping[field]??''} disabled={importing} onChange={e=>{setMapping({...mapping,[field]:e.target.value===''?null:Number(e.target.value)});setOverrides({})}}><option value="">— No usar —</option>{columns.map((name,i)=><option key={i} value={i}>{name}</option>)}</select></label>)}
    </div>
    <p className="tools-note">Usa Débito y Crédito si el banco separa cargos y abonos, o Monto con signo si usa una sola columna (negativos o entre paréntesis = gastos).</p>
    {mapping.amount!==null&&<label className="import-check"><input type="checkbox" checked={positiveIsExpense} disabled={importing} onChange={e=>setPositiveIsExpense(e.target.checked)}/> En la columna Monto, los valores positivos son gastos</label>}
    {problem&&<p className="tools-alert" role="alert">{problem}</p>}
   </section>
   <section className="import-section" aria-label="Datos para los movimientos">
    <h4>Cómo se registran</h4>
    <div className="tools-grid">
     <label>Cuenta<select value={accountId} disabled={importing} onChange={e=>setAccountId(e.target.value)}><option value="">Sin cuenta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
     <label>Categoría de los gastos<select value={categoryId} disabled={importing} onChange={e=>setCategoryId(e.target.value)}><option value="auto">Sugerida por la descripción</option><option value="">Sin categoría</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
     <label>¿De quién son?<select value={shareMode} disabled={importing} onChange={e=>setShareMode(e.target.value as 'shared'|'personal')}><option value="shared">Compartido</option><option value="personal">Personal</option></select></label>
    </div>
    <p className="tools-note">Se registran como pagados por ti. Los ingresos quedan sin categoría. Puedes editar cada movimiento después.</p>
   </section>
   {!problem&&<section className="import-section" aria-label="Vista previa">
    <h4>Vista previa</h4>
    <div className="import-counts"><span className="tools-tag info">{valid.length} válidas</span><span className="tools-tag good">{selected.length} seleccionadas</span>{duplicates.length>0&&<span className="tools-tag warn">{duplicates.length} posibles duplicados</span>}{transfers.length>0&&<span className="tools-tag warn">{transfers.length} posibles transferencias</span>}{skipped.length>0&&<span className="tools-tag">{skipped.length} omitidas</span>}</div>
    {existing.status==='loading'&&<p className="tools-note" role="status">Buscando movimientos ya registrados en esas fechas…</p>}
    {existing.status==='error'&&<p className="tools-alert" role="alert">No se pudieron revisar duplicados: {existing.error} Vuelve a cargar el archivo para verificar duplicados antes de importar.</p>}
    {duplicates.length>0&&<p className="tools-note">Los posibles duplicados (misma fecha, mismo monto y descripción parecida a un movimiento existente) quedan sin seleccionar. Márcalos si de verdad son nuevos.</p>}
    {transfers.length>0&&<p className="tools-note">Los pagos de tarjeta, transferencias entre tus cuentas y retiros de efectivo no son ingresos ni gastos: si los importas se contarían dos veces. Quedan sin seleccionar; regístralos como transferencia en Cuentas si quieres moverlos entre cuentas.</p>}
    {valid.length>0&&<div className="tools-actions"><button type="button" className="tools-link" disabled={importing} onClick={()=>setOverrides(Object.fromEntries(valid.map(r=>[r.line,true])))}>Seleccionar todas</button><button type="button" className="tools-link" disabled={importing} onClick={()=>setOverrides(Object.fromEntries(valid.map(r=>[r.line,false])))}>Quitar todas</button></div>}
    <div className="import-rows">{valid.map(row=><label className={'import-row'+(row.duplicate?' duplicate':row.transfer?' transfer':'')} key={row.line}>
     <input type="checkbox" checked={isSelected(row)} disabled={importing} aria-label={`Importar línea ${row.line}: ${row.description}`} onChange={e=>setOverrides({...overrides,[row.line]:e.target.checked})}/>
     <div><strong>{row.description}</strong><small>{shortDate(row.date!)} · {row.type==='expense'?'Gasto · '+categoryName(rowCategory(row)):'Ingreso'} · línea {row.line}{row.duplicate?` · Posible duplicado de “${row.duplicateOf}”`:''}{row.transfer&&!row.duplicate?' · Posible transferencia o pago de tarjeta':''}</small></div>
     <b className={row.type||''}>{row.type==='expense'?'−':'+'}{formatMoney(row.amount)}</b>
    </label>)}</div>
    {!valid.length&&<p className="tools-alert">No hay filas válidas con estas columnas. Revisa la fila de encabezados y las columnas elegidas.</p>}
    {skipped.length>0&&<details><summary className="tools-note">Ver {skipped.length} fila{skipped.length===1?'':'s'} omitida{skipped.length===1?'':'s'} y el motivo</summary><ul className="import-skipped">{skipped.slice(0,200).map(r=><li key={r.line}>Línea {r.line}: {r.reason}</li>)}{skipped.length>200&&<li>… y {skipped.length-200} más.</li>}</ul></details>}
   </section>}
  </>}
  {progress&&importing&&<div className="import-progress" role="status"><span>Importando {progress.done} de {progress.total} movimientos…</span><progress max={progress.total} value={progress.done}/></div>}
  {result&&<div className={result.failure?'tools-error':'tools-success'} role={result.failure?'alert':'status'}>
   <strong>{result.failure?`Se importaron ${result.imported} de ${result.total} movimientos.`:`Listo: se importaron ${result.imported} movimientos.`}</strong>
   <p>{result.expenses} gasto{result.expenses===1?'':'s'} y {result.incomes} ingreso{result.incomes===1?'':'s'}.{skipped.length?` ${skipped.length} fila(s) omitidas por datos inválidos.`:''}</p>
   {result.failure&&<p>{result.failure} Los movimientos importados ya están en Movimientos; si vuelves a intentar, aparecerán como posibles duplicados.</p>}

  </div>}
  {statement&&!problem&&!done&&<button type="button" className="finance-primary" disabled={importing||!selected.length||existing.status!=='ready'} onClick={()=>void runImport()}>
   {importing?<><Upload size={17}/> Importando…</>:<><Check size={17}/> Importar {selected.length} movimiento{selected.length===1?'':'s'}{selected.length?` (${formatMoney(selectedExpense)} en gastos · ${formatMoney(selectedIncome)} en ingresos)`:''}</>}
  </button>}
  {done&&<button type="button" className="finance-primary" onClick={onClose}><Check size={17}/> Cerrar</button>}
 </div>;
}
