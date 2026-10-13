import ModuleIcon from './ModuleIcon';
import {useEffect,useMemo,useState} from 'react';
import {BellRing,Check,ChevronRight,Clock3,Gauge,History,Package,Play,Settings2,ShoppingCart,SlidersHorizontal} from 'lucide-react';
import {supabase} from './lib/supabase';
import './AutomationCenter.css';

type Household={id:string;name:string;invite_code:string};
type RuleKey='payment_due_alert'|'task_due_alert'|'budget_limit_alert'|'document_expiry_alert'|'maintenance_date_alert'|'maintenance_mileage_alert'|'warranty_expiry_alert'|'pantry_expiry_alert'|'pantry_low_to_shopping';
type Rule={household_id:string;rule_key:RuleKey;enabled:boolean;config:Record<string,any>;updated_at:string};
type RuleRun={id:string;rule_key:RuleKey;action:string;affected_count:number;summary:string;created_at:string};

const definitions:Record<RuleKey,{group:string;title:string;description:string;kind:'alert'|'action';field?:string;unit?:string;min?:number;max?:number;step?:number;icon:React.ReactNode;defaultValue?:number|string}> = {
 payment_due_alert:{group:'Finanzas',title:'Pagos por vencer',description:'Avisa antes de que venza un pago recurrente y mantiene alertas si queda vencido.',kind:'alert',field:'days_before',unit:'días antes',min:0,max:30,step:1,defaultValue:3,icon:<Clock3/>},
 budget_limit_alert:{group:'Finanzas',title:'Límite de presupuesto',description:'Advierte cuando una categoría alcanza el porcentaje configurado de su presupuesto mensual.',kind:'alert',field:'threshold_percent',unit:'% utilizado',min:50,max:100,step:1,defaultValue:90,icon:<ModuleIcon name="finance"/>},
 task_due_alert:{group:'Organización',title:'Tareas próximas',description:'Avisa por tareas asignadas que están próximas a su fecha límite o ya vencieron.',kind:'alert',field:'days_before',unit:'días antes',min:0,max:30,step:1,defaultValue:1,icon:<ModuleIcon name="lists"/>},
 document_expiry_alert:{group:'Documentos',title:'Documentos por vencer',description:'Anticipa renovaciones de pólizas, identificaciones, contratos y otros documentos.',kind:'alert',field:'days_before',unit:'días antes',min:0,max:90,step:1,defaultValue:30,icon:<ModuleIcon name="documents"/>},
 maintenance_date_alert:{group:'Casa y vehículos',title:'Mantenimiento por fecha',description:'Avisa antes de servicios programados para casa, vehículos y equipos.',kind:'alert',field:'days_before',unit:'días antes',min:0,max:90,step:1,defaultValue:30,icon:<ModuleIcon name="maintenance"/>},
 maintenance_mileage_alert:{group:'Casa y vehículos',title:'Mantenimiento por kilometraje',description:'Avisa cuando un vehículo se acerca al kilometraje de su próximo servicio.',kind:'alert',field:'km_before',unit:'km antes',min:0,max:10000,step:100,defaultValue:500,icon:<Gauge/>},
 warranty_expiry_alert:{group:'Casa y vehículos',title:'Garantías por vencer',description:'Avisa antes de que termine la garantía registrada de un activo.',kind:'alert',field:'days_before',unit:'días antes',min:0,max:90,step:1,defaultValue:30,icon:<BellRing/>},
 pantry_expiry_alert:{group:'Comidas',title:'Productos por vencer',description:'Avisa para usar primero los productos de despensa que están cerca de su vencimiento.',kind:'alert',field:'days_before',unit:'días antes',min:0,max:30,step:1,defaultValue:7,icon:<Package/>},
 pantry_low_to_shopping:{group:'Comidas',title:'Reposición automática',description:'Cuando un producto llega a su mínimo, lo agrega automáticamente a la lista de compras sin duplicarlo.',kind:'action',field:'list_title',unit:'lista destino',defaultValue:'Supermercado',icon:<ShoppingCart/>}
};

export default function AutomationCenter({household,onNavigate,readOnly=false}:{household:Household;onNavigate:(tab:string)=>void;readOnly?:boolean}){
 const [rules,setRules]=useState<Rule[]>([]),[runs,setRuns]=useState<RuleRun[]>([]),[drafts,setDrafts]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null),[running,setRunning]=useState(false),[message,setMessage]=useState('');

 useEffect(()=>{let channel:any,active=true;(async()=>{
  await load();
  if(!active)return;
  channel=supabase.channel('automation-center-'+household.id)
   .on('postgres_changes',{event:'*',schema:'public',table:'household_automation_rules',filter:'household_id=eq.'+household.id},()=>load(false))
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'automation_rule_runs',filter:'household_id=eq.'+household.id},()=>load(false))
   .subscribe();
 })();return()=>{active=false;if(channel)supabase.removeChannel(channel)}},[household.id]);

 async function load(showLoader=true){
  if(showLoader)setLoading(true);setMessage('');
  const ensured=await supabase.rpc('ensure_household_automation_rules',{p_household_id:household.id});
  if(ensured.error){setMessage(ensured.error.message);if(showLoader)setLoading(false);return}
  const [rulesR,runsR]=await Promise.all([
   supabase.from('household_automation_rules').select('household_id,rule_key,enabled,config,updated_at').eq('household_id',household.id).order('rule_key'),
   supabase.from('automation_rule_runs').select('id,rule_key,action,affected_count,summary,created_at').eq('household_id',household.id).order('created_at',{ascending:false}).limit(30)
  ]);
  if(rulesR.error||runsR.error)setMessage(rulesR.error?.message||runsR.error?.message||'No se pudieron cargar las automatizaciones.');
  const next=(rulesR.data||[]) as Rule[];setRules(next);setRuns((runsR.data||[]) as RuleRun[]);
  setDrafts(current=>{const copy={...current};for(const rule of next){const def=definitions[rule.rule_key];if(!def.field)continue;const raw=rule.config?.[def.field]??def.defaultValue??'';if(copy[rule.rule_key]===undefined)copy[rule.rule_key]=String(raw)}return copy});
  if(showLoader)setLoading(false);
 }

 async function saveRule(rule:Rule,enabled=rule.enabled){
  if(readOnly){setMessage('Modo solo lectura.');return}
  const def=definitions[rule.rule_key],config={...rule.config};
  if(def.field){
   if(typeof def.defaultValue==='number'){
    const value=Number(drafts[rule.rule_key]??config[def.field]??def.defaultValue);
    if(!Number.isFinite(value)){setMessage('Ingresa un valor válido para '+def.title+'.');return}
    config[def.field]=Math.max(def.min??value,Math.min(def.max??value,value));
   }else{
    config[def.field]=String((drafts[rule.rule_key]??config[def.field]??def.defaultValue) || '').trim()||String(def.defaultValue||'Supermercado');
   }
  }
  setBusy(rule.rule_key);setMessage('');
  const {error}=await supabase.rpc('update_household_automation_rule',{p_household_id:household.id,p_rule_key:rule.rule_key,p_enabled:enabled,p_config:config});
  if(error){setBusy(null);setMessage(error.message);return}
  if(enabled){
   const run=await supabase.rpc('run_my_household_automation_rules',{p_household_id:household.id});
   if(run.error)setMessage(run.error.message);
  }
  setBusy(null);setMessage(enabled?'Regla actualizada y evaluada.':'Regla desactivada.');await load(false);
 }

 async function runNow(){
  if(readOnly){setMessage('Modo solo lectura.');return}
  setRunning(true);setMessage('');
  const {data,error}=await supabase.rpc('run_my_household_automation_rules',{p_household_id:household.id});
  setRunning(false);
  if(error){setMessage(error.message);return}
  const affected=Number(data?.affected||0);
  setMessage(affected?affected+' acción'+(affected===1?'':'es')+' automática'+(affected===1?'':'s')+' ejecutada'+(affected===1?'':'s')+'.':'Reglas evaluadas. No había nuevas acciones pendientes.');
  await load(false);
 }

 const activeCount=rules.filter(r=>r.enabled).length;
 const actionCount=rules.filter(r=>r.enabled&&definitions[r.rule_key]?.kind==='action').length;
 const alertCount=rules.filter(r=>r.enabled&&definitions[r.rule_key]?.kind==='alert').length;
 const groups=useMemo(()=>['Finanzas','Organización','Documentos','Casa y vehículos','Comidas'].map(group=>({group,rules:rules.filter(r=>definitions[r.rule_key]?.group===group)})).filter(x=>x.rules.length),[rules]);
 const lastActivity=runs.find(r=>r.action!=='configured')||runs[0];

 if(loading)return <div className="finance-loading"><div className="loader"/></div>;

 return <section className="automation-center">
  <div className="automation-top"><div><p className="eyebrow">AUTOMATIZACIONES</p><h2 className="page-title">Reglas del hogar</h2><p className="muted">Decide qué debe vigilar Nuestro Hogar y qué acciones puede ejecutar automáticamente.</p></div>{!readOnly&&<button className="automation-run" onClick={runNow} disabled={running}><Play/>{running?'Evaluando...':'Ejecutar ahora'}</button>}</div>

  {message&&<div className="finance-message">{message}</div>}

  <section className="automation-hero">
   <div className="automation-hero-icon"><ModuleIcon name="automations"/></div>
   <div><p className="eyebrow">MOTOR ACTIVO</p><h3>{activeCount} de {rules.length} reglas activas</h3><p>Las reglas se evalúan automáticamente cada hora. Las alertas respetan además las preferencias personales de notificaciones de cada integrante.</p></div>
   <div className="automation-hero-stats"><span><BellRing/><b>{alertCount}</b><small>alertas</small></span><span><Settings2/><b>{actionCount}</b><small>acciones</small></span><span><History/><b>{lastActivity?relativeTime(lastActivity.created_at):'—'}</b><small>última actividad</small></span></div>
  </section>

  <div className="automation-groups">{groups.map(({group,rules:groupRules})=><section className="automation-group" key={group}>
   <div className="automation-group-head"><div><p className="eyebrow">{group.toUpperCase()}</p><h3>{group}</h3></div><span>{groupRules.filter(r=>r.enabled).length}/{groupRules.length} activas</span></div>
   <div className="automation-rule-grid">{groupRules.map(rule=><RuleCard key={rule.rule_key} rule={rule} draft={drafts[rule.rule_key]??''} setDraft={value=>setDrafts(current=>({...current,[rule.rule_key]:value}))} busy={busy===rule.rule_key} readOnly={readOnly} onToggle={enabled=>saveRule(rule,enabled)} onSave={()=>saveRule(rule)}/>)}</div>
  </section>)}</div>

  <div className="automation-bottom-grid">
   <section className="automation-log-panel">
    <div className="automation-panel-head"><div><p className="eyebrow">ACTIVIDAD</p><h3>Historial reciente</h3></div><History/></div>
    {runs.length?<div className="automation-log-list">{runs.slice(0,10).map(run=><div key={run.id}><span className={run.action==='configured'?'config':'run'}>{run.action==='configured'?<SlidersHorizontal/>:<ModuleIcon name="automations"/>}</span><div><strong>{definitions[run.rule_key]?.title||run.rule_key}</strong><small>{run.summary}</small></div><em>{relativeTime(run.created_at)}</em></div>)}</div>:<div className="control-empty small"><History/><span>Las ejecuciones y cambios de reglas aparecerán aquí.</span></div>}
   </section>
   <section className="automation-log-panel">
    <div className="automation-panel-head"><div><p className="eyebrow">CÓMO FUNCIONA</p><h3>Dos niveles de control</h3></div><Settings2/></div>
    <div className="automation-explainer">
     <div><span><ModuleIcon name="automations"/></span><div><strong>Regla del hogar</strong><small>Define si el hogar vigila una condición y el umbral que utiliza.</small></div></div>
     <div><span><BellRing/></span><div><strong>Preferencias personales</strong><small>Cada integrante decide qué categorías de alertas quiere recibir en su dispositivo.</small></div></div>
     <button onClick={()=>onNavigate('inicio')}>Abrir centro de alertas desde la campana <ChevronRight/></button>
    </div>
   </section>
  </div>
 </section>
}

function RuleCard({rule,draft,setDraft,busy,onToggle,onSave,readOnly=false}:{rule:Rule;draft:string;setDraft:(v:string)=>void;busy:boolean;onToggle:(v:boolean)=>void;onSave:()=>void;readOnly?:boolean}){
 const def=definitions[rule.rule_key],numeric=typeof def.defaultValue==='number';
 return <article className={'automation-rule-card '+def.kind+' '+(rule.enabled?'enabled':'disabled')}>
  <div className="automation-rule-main"><span>{def.icon}</span><div><small>{def.kind==='action'?'ACCIÓN AUTOMÁTICA':'ALERTA INTELIGENTE'}</small><strong>{def.title}</strong><p>{def.description}</p></div><label className="switch"><input type="checkbox" checked={rule.enabled} disabled={busy||readOnly} onChange={e=>onToggle(e.target.checked)}/><span/></label></div>
  <div className="automation-rule-config"><label>{def.unit}<div>{numeric?<input type="number" min={def.min} max={def.max} step={def.step} value={draft} disabled={!rule.enabled||busy||readOnly} onChange={e=>setDraft(e.target.value)}/>:<input value={draft} maxLength={80} disabled={!rule.enabled||busy} onChange={e=>setDraft(e.target.value)}/>}</div></label><button disabled={!rule.enabled||busy||readOnly} onClick={onSave}><Check/>{busy?'Guardando...':'Guardar'}</button></div>
 </article>
}
function relativeTime(value:string){const diff=Math.max(0,Date.now()-new Date(value).getTime()),minutes=Math.floor(diff/60000);if(minutes<1)return'Ahora';if(minutes<60)return minutes+' min';const hours=Math.floor(minutes/60);if(hours<24)return hours+' h';const days=Math.floor(hours/24);return days+' d'}
