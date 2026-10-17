import {useEffect,useState,type FormEvent} from 'react';
import {ArrowDownLeft,ArrowRight,CalendarClock,Check,RefreshCw,Target} from 'lucide-react';
import {supabase} from './lib/supabase';
import {platformError} from './lib/platform';
import {effectivePayDays,incomeAmount,type IncomePlan,monthlyIncomeSummary,type PayDays,payDays as validPayDays,usdRateInput} from './lib/monthlyIncome';
import {DEFAULT_USD_RATE} from './lib/currency';
import {unallocated,validateHalves} from './lib/financePeriods';
import './monthly-income.css';
import './finance-tools.css';
import {formatMoney as money} from './lib/money';
type Summary=ReturnType<typeof monthlyIncomeSummary>;

type IncomeSettingsProps={payDays:Record<string,PayDays>;usdRate:number|null;onSettingsSaved:(payDays:Record<string,PayDays>,usdRate:number)=>void};
export default function MonthlyIncomePlan({householdId,month,label,summary,readOnly,loadError,onSaved,onReload,onMovements,payDays,usdRate,onSettingsSaved}:{householdId:string;month:string;label:string;summary:Summary;readOnly:boolean;loadError:boolean;onSaved:(plans:IncomePlan[])=>void;onReload:()=>void;onMovements:()=>void}&IncomeSettingsProps){
 const [draft,setDraft]=useState<Record<string,string>>({}),[halves,setHalves]=useState<Record<string,{first:string;second:string}>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{setDraft(Object.fromEntries(summary.rows.map(row=>[row.user_id,String(row.expected)])));setHalves(Object.fromEntries(summary.rows.map(row=>[row.user_id,{first:row.first_half_amount==null?'':String(row.first_half_amount),second:row.second_half_amount==null?'':String(row.second_half_amount)}])))},[summary]);
 const changed=summary.rows.some(row=>Number(draft[row.user_id])!==row.expected||draft[row.user_id]===''||(halves[row.user_id]?.first??'')!==(row.first_half_amount==null?'':String(row.first_half_amount))||(halves[row.user_id]?.second??'')!==(row.second_half_amount==null?'':String(row.second_half_amount)));
 async function save(event:FormEvent){
  event.preventDefault();if(readOnly||busy||loadError)return;setError('');setSaved(false);setBusy(true);
  try{
   const plans=summary.rows.map(row=>{const expected_amount=incomeAmount(draft[row.user_id]??'');try{return {household_id:householdId,user_id:row.user_id,month,expected_amount,...validateHalves(expected_amount,halves[row.user_id]?.first??'',halves[row.user_id]?.second??''),updated_at:new Date().toISOString()}}catch(err){throw new Error(row.full_name+': '+(err instanceof Error?err.message:'Revisa las quincenas.'))}});
   const {error}=await supabase.from('finance_income_plans').upsert(plans,{onConflict:'household_id,month,user_id'});
   if(error)throw error;onSaved(plans);setSaved(true);
  }catch(err){setError(err instanceof Error?err.message:platformError(err))}finally{setBusy(false)}
 }
 return <><section className="monthly-income-plan finance-panel" aria-labelledby="monthly-income-title">
  <div className="monthly-income-heading"><span><Target size={23}/></span><div><p className="eyebrow">PLAN MENSUAL · {label}</p><h3 id="monthly-income-title">Lo que esperamos recibir</h3><p>Planifica el ingreso mensual de cada persona y distribúyelo entre el 1–15 y el 16 al cierre. Los ingresos reales vienen de los movimientos.</p></div></div>
  {loadError?<div className="monthly-income-alert" role="alert">No pudimos cargar el plan guardado. Recarga antes de editarlo.<button type="button" onClick={onReload}><RefreshCw size={15}/> Volver a cargar</button></div>:<>
   <div className="monthly-income-totals"><div><small>Esperado</small><strong>{money(summary.expected)}</strong><span>Plan del mes</span></div><div className="received"><small>Recibido</small><strong>{money(summary.received)}</strong><span>Ingresos registrados</span></div><div><small>Pendiente de recibir</small><strong>{money(summary.pending)}</strong><span>Suma pendiente por persona</span></div></div>
   {!summary.hasPlan&&<p className="monthly-income-hint">Este mes aún no tiene un plan guardado. Los importes iniciales vienen del ingreso de referencia de Aportes; puedes ajustarlos y guardar solo este mes.</p>}
   <form onSubmit={save}>
    <div className="monthly-income-people">{summary.rows.map(row=><article className="monthly-income-person" key={row.user_id}>
     <div className="monthly-income-person-head"><span>{row.full_name.slice(0,1).toUpperCase()}</span><div><strong>{row.full_name}</strong><small>{row.hasPlan?'Plan guardado de este mes':'Referencia · sin guardar este mes'}</small></div></div>
     <div className="monthly-income-person-values"><label>Esperado del mes<input aria-label={'Ingreso esperado de '+row.full_name} type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" required value={draft[row.user_id]??String(row.expected)} disabled={readOnly||busy} onChange={event=>{setDraft(current=>({...current,[row.user_id]:event.target.value}));setSaved(false)}}/></label><div><small>Recibido</small><strong>{money(row.received)}</strong></div><div><small>{row.extra>0?'Sobre lo esperado':'Pendiente'}</small><strong className={row.extra>0?'positive':''}>{money(row.extra>0?row.extra:row.pending)}</strong></div></div>
     <div className="fortnight-inputs"><label>Primera quincena · 1–15<input aria-label={'Ingreso primera quincena de '+row.full_name} type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" placeholder="Por distribuir" value={halves[row.user_id]?.first??''} disabled={readOnly||busy} onChange={event=>{setHalves(current=>({...current,[row.user_id]:{first:event.target.value,second:current[row.user_id]?.second??''}}));setSaved(false)}}/></label><label>Segunda quincena · 16 al cierre<input aria-label={'Ingreso segunda quincena de '+row.full_name} type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" placeholder="Por distribuir" value={halves[row.user_id]?.second??''} disabled={readOnly||busy} onChange={event=>{setHalves(current=>({...current,[row.user_id]:{first:current[row.user_id]?.first??'',second:event.target.value}}));setSaved(false)}}/></label><small>Por distribuir: {money(unallocated(draft[row.user_id]||0,{first_half_amount:halves[row.user_id]?.first,second_half_amount:halves[row.user_id]?.second}))}. Un campo vacío no asigna dinero; 0 indica que no esperas ingreso en esa quincena.</small></div>
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
 </section>
 {!loadError&&<IncomeSettings householdId={householdId} members={summary.rows} readOnly={readOnly} payDays={payDays} usdRate={usdRate} onSettingsSaved={onSettingsSaved}/>}</>;
}

const draftDays=(members:{user_id:string}[],saved:Record<string,PayDays>)=>Object.fromEntries(members.map(m=>{const d=effectivePayDays(saved[m.user_id]);return [m.user_id,{first:String(d.first),second:String(d.second)}]}));
/** Pay days per member (finance_member_settings) and the household dollar rate (finance_household_settings). */
function IncomeSettings({householdId,members,readOnly,payDays,usdRate,onSettingsSaved}:{householdId:string;members:{user_id:string;full_name:string}[];readOnly:boolean}&IncomeSettingsProps){
 const [days,setDays]=useState(()=>draftDays(members,payDays)),[rate,setRate]=useState(String(usdRate??DEFAULT_USD_RATE)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{setDays(draftDays(members,payDays));setRate(String(usdRate??DEFAULT_USD_RATE))},[members,payDays,usdRate]);
 const setDay=(id:string,half:'first'|'second',value:string)=>{setDays(current=>({...current,[id]:{...(current[id]||{first:'15',second:'31'}),[half]:value}}));setSaved(false)};
 async function save(event:FormEvent){
  event.preventDefault();if(readOnly||busy)return;setError('');setSaved(false);
  let rows:{household_id:string;user_id:string;first_pay_day:number;second_pay_day:number;updated_at:string}[],usd:number;
  try{
   rows=members.map(m=>{try{return {household_id:householdId,user_id:m.user_id,...validPayDays(days[m.user_id]?.first??'',days[m.user_id]?.second??''),updated_at:new Date().toISOString()}}catch(err){throw new Error(m.full_name+': '+(err instanceof Error?err.message:'Revisa los días de cobro.'))}});
   usd=usdRateInput(rate);
  }catch(err){setError(err instanceof Error?err.message:'Revisa los datos.');return}
  setBusy(true);
  try{
   const user=await supabase.auth.getUser();
   if(rows.length){const {error}=await supabase.from('finance_member_settings').upsert(rows,{onConflict:'household_id,user_id'});if(error)throw error}
   const {error}=await supabase.from('finance_household_settings').upsert({household_id:householdId,usd_rate:usd,updated_by:user.data.user?.id||null,updated_at:new Date().toISOString()},{onConflict:'household_id'});
   if(error)throw new Error('Los días de cobro se guardaron, pero el tipo de cambio no: '+(error.message||platformError(error)));
   onSettingsSaved(Object.fromEntries(rows.map(r=>[r.user_id,{first_pay_day:r.first_pay_day,second_pay_day:r.second_pay_day}])),usd);setSaved(true);
  }catch(err){setError(err instanceof Error?err.message:platformError(err))}finally{setBusy(false)}
 }
 return <section className="monthly-income-plan finance-panel income-settings" aria-labelledby="income-settings-title">
  <div className="monthly-income-heading"><span><CalendarClock size={23}/></span><div><p className="eyebrow">DÍAS DE COBRO Y DÓLARES</p><h3 id="income-settings-title">Cuándo cobra cada quien</h3><p>El día de cobro ubica el ingreso esperado en su fecha real dentro de cada quincena. El tipo de cambio se usa al registrar movimientos en dólares.</p></div></div>
  <form onSubmit={save} noValidate>
   <div className="income-settings-people">{members.map(m=><div className="income-settings-person" key={m.user_id}><strong>{m.full_name}</strong><div className="tools-grid">
    <label>Día de cobro · 1–15<input aria-label={'Día de cobro de la primera quincena de '+m.full_name} type="number" inputMode="numeric" min="1" max="15" step="1" required value={days[m.user_id]?.first??'15'} disabled={readOnly||busy} onChange={event=>setDay(m.user_id,'first',event.target.value)}/></label>
    <label>Día de cobro · 16 al cierre<select aria-label={'Día de cobro de la segunda quincena de '+m.full_name} value={days[m.user_id]?.second??'31'} disabled={readOnly||busy} onChange={event=>setDay(m.user_id,'second',event.target.value)}>{Array.from({length:15},(_,i)=>i+16).map(d=><option key={d} value={String(d)}>Día {d}</option>)}<option value="31">Último día del mes</option></select></label>
   </div></div>)}</div>
   <div className="income-settings-rate"><label className="tools-field">Tipo de cambio (Q por US$)<input type="number" inputMode="decimal" min="1" max="100" step="0.0001" required value={rate} disabled={readOnly||busy} onChange={event=>{setRate(event.target.value);setSaved(false)}}/></label><p>Al registrar un movimiento en dólares se guarda en quetzales con este tipo de cambio, junto con el monto original.</p></div>
   {!readOnly&&<div className="monthly-income-actions"><button className="finance-primary" type="submit" disabled={busy||!members.length}><Check size={17}/>{busy?'Guardando…':'Guardar días de cobro y tipo de cambio'}</button><small>Aplica a todos los meses. No cambia movimientos ya registrados.</small></div>}
  </form>
  {error&&<p className="monthly-income-alert" role="alert">{error}</p>}
  {saved&&<p className="monthly-income-saved" role="status">Días de cobro y tipo de cambio guardados.</p>}
 </section>;
}
