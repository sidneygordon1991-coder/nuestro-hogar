import {useEffect,useState,type FormEvent} from 'react';
import {ArrowDownLeft,ArrowRight,Check,RefreshCw,Target} from 'lucide-react';
import {supabase} from './lib/supabase';
import {platformError} from './lib/platform';
import {incomeAmount,type IncomePlan,monthlyIncomeSummary} from './lib/monthlyIncome';
import './monthly-income.css';
const money=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:2}).format(n);
type Summary=ReturnType<typeof monthlyIncomeSummary>;

export default function MonthlyIncomePlan({householdId,month,label,summary,readOnly,loadError,onSaved,onReload,onMovements}:{householdId:string;month:string;label:string;summary:Summary;readOnly:boolean;loadError:boolean;onSaved:(plans:IncomePlan[])=>void;onReload:()=>void;onMovements:()=>void}){
 const [draft,setDraft]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{setDraft(Object.fromEntries(summary.rows.map(row=>[row.user_id,String(row.expected)])))},[summary]);
 const changed=summary.rows.some(row=>Number(draft[row.user_id])!==row.expected||draft[row.user_id]==='');
 async function save(event:FormEvent){
  event.preventDefault();if(readOnly||busy||loadError)return;setError('');setSaved(false);setBusy(true);
  try{
   const plans=summary.rows.map(row=>({household_id:householdId,user_id:row.user_id,month,expected_amount:incomeAmount(draft[row.user_id]??''),updated_at:new Date().toISOString()}));
   const {error}=await supabase.from('finance_income_plans').upsert(plans,{onConflict:'household_id,month,user_id'});
   if(error)throw error;onSaved(plans);setSaved(true);
  }catch(err){setError(err instanceof Error?err.message:platformError(err))}finally{setBusy(false)}
 }
 return <section className="monthly-income-plan finance-panel" aria-labelledby="monthly-income-title">
  <div className="monthly-income-heading"><span><Target size={23}/></span><div><p className="eyebrow">PLAN MENSUAL · {label}</p><h3 id="monthly-income-title">Lo que esperamos recibir</h3><p>Planifica el ingreso de cada persona para este mes. Los ingresos reales se calculan con los movimientos registrados.</p></div></div>
  {loadError?<div className="monthly-income-alert" role="alert">No pudimos cargar el plan guardado. Recarga antes de editarlo.<button type="button" onClick={onReload}><RefreshCw size={15}/> Volver a cargar</button></div>:<>
   <div className="monthly-income-totals"><div><small>Esperado</small><strong>{money(summary.expected)}</strong><span>Plan del mes</span></div><div className="received"><small>Recibido</small><strong>{money(summary.received)}</strong><span>Ingresos registrados</span></div><div><small>Pendiente de recibir</small><strong>{money(summary.pending)}</strong><span>Suma pendiente por persona</span></div></div>
   {!summary.hasPlan&&<p className="monthly-income-hint">Este mes aún no tiene un plan guardado. Los importes iniciales vienen del ingreso de referencia de Aportes; puedes ajustarlos y guardar solo este mes.</p>}
   <form onSubmit={save}>
    <div className="monthly-income-people">{summary.rows.map(row=><article className="monthly-income-person" key={row.user_id}>
     <div className="monthly-income-person-head"><span>{row.full_name.slice(0,1).toUpperCase()}</span><div><strong>{row.full_name}</strong><small>{row.hasPlan?'Plan guardado de este mes':'Referencia · sin guardar este mes'}</small></div></div>
     <div className="monthly-income-person-values"><label>Esperado del mes<input aria-label={'Ingreso esperado de '+row.full_name} type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" required value={draft[row.user_id]??String(row.expected)} disabled={readOnly||busy} onChange={event=>{setDraft(current=>({...current,[row.user_id]:event.target.value}));setSaved(false)}}/></label><div><small>Recibido</small><strong>{money(row.received)}</strong></div><div><small>{row.extra>0?'Sobre lo esperado':'Pendiente'}</small><strong className={row.extra>0?'positive':''}>{money(row.extra>0?row.extra:row.pending)}</strong></div></div>
     <progress aria-label={'Avance del ingreso de '+row.full_name} max={Math.max(row.expected,1)} value={Math.min(row.received,Math.max(row.expected,1))}/>
    </article>)}</div>
    {!readOnly&&<div className="monthly-income-actions"><button className="finance-primary" type="submit" disabled={busy||!summary.rows.length}><Check size={17}/>{busy?'Guardando…':'Guardar plan de '+label}</button><small>Guarda este mes. No crea movimientos ni cambia el reparto de gastos.</small></div>}
   </form>
   {changed&&<p className="monthly-income-hint">Tienes cambios sin guardar. Los totales muestran el plan guardado o la referencia inicial.</p>}
   {summary.unassigned>0&&<p className="monthly-income-alert">Hay {money(summary.unassigned)} recibidos sin un integrante actual asociado. Están incluidos en el total recibido; revisa la persona del movimiento para compararlos con su plan.</p>}
   <button type="button" className="monthly-income-movements" onClick={onMovements}><ArrowDownLeft size={17}/> Ver ingresos registrados<ArrowRight size={16}/></button>
  </>}
  {error&&<p className="monthly-income-alert" role="alert">{error}</p>}
  {saved&&<p className="monthly-income-saved" role="status">Plan mensual guardado. No se crearon movimientos.</p>}
 </section>;
}
