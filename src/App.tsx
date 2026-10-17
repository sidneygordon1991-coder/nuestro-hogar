import {clearLocalDrafts} from './lib/formDrafts';
import {WorkspaceHeadingSlot} from './WorkspaceHeading';
import ConnectionStatus from './ConnectionStatus';
import {buildCashFlow,type CashFlowSource} from './lib/cashFlow';
import type {HomeFinance as FinanceHome} from './lib/homeOverview';
import {financeSection} from './lib/financeNavigation';
import {useDialogFocus} from './lib/useDialogFocus';
import {lazyWithReload} from './lib/lazyRetry';
import DesktopRail from './DesktopRail';
import BrandMark from './BrandMark';
import {appearanceKey,readAppearance,type Appearance} from './lib/appearance';
import ModuleIcon from './ModuleIcon';
import EmailAuth from './EmailAuth';
import MasterSecurityGate from './MasterSecurityGate';
import HouseholdWelcome from './HouseholdWelcome';
import './sharing.css';
import HouseholdStorageNote from './HouseholdStorageNote';
import './master.css';
import {FormEvent,Suspense,useEffect,useRef,useState} from 'react';import {ChevronDown,Sun,Moon,Eye,ShieldOff} from 'lucide-react';import {supabase} from './lib/supabase';import GlobalCommandCenter from './GlobalCommandCenter';import {AppErrorBoundary,ClientErrorReporter} from './AppDiagnostics';import AppMenu,{toggleTheme,useEffectiveTheme} from './AppMenu';import ProfileAvatar from './ProfileAvatar';import PwaInstallPrompt from './PwaInstallPrompt';import PwaUpdatePrompt from './PwaUpdatePrompt';import NotificationCenter from './NotificationCenter';import type {Session} from '@supabase/supabase-js';import {validateStrongPassword} from './lib/authSecurity';

const HomeDashboard=lazyWithReload(()=>import('./HomeDashboard'));
const AppearanceDialog=lazyWithReload(()=>import('./AppearancePanel'));
const MasterPanel=lazyWithReload(()=>import('./MasterPanel'));
const Finance=lazyWithReload(()=>import('./Finance'));
const ListsCenter=lazyWithReload(()=>import('./ListsCenter'));
const CalendarCenter=lazyWithReload(()=>import('./CalendarCenter'));
const FamilyCenter=lazyWithReload(()=>import('./FamilyCenter'));
const DocumentVault=lazyWithReload(()=>import('./DocumentVault'));
const MealsCenter=lazyWithReload(()=>import('./MealsCenter'));
const MaintenanceCenter=lazyWithReload(()=>import('./MaintenanceCenter'));
const HouseholdHealthCenter=lazyWithReload(()=>import('./HouseholdHealthCenter'));
const AutomationCenter=lazyWithReload(()=>import('./AutomationCenter'));
const MonthlyCloseCenter=lazyWithReload(()=>import('./MonthlyCloseCenter'));
const PlanningCenter=lazyWithReload(()=>import('./PlanningCenter'));
const BackupCenter=lazyWithReload(()=>import('./BackupCenter'));
const DiagnosticCenter=lazyWithReload(()=>import('./DiagnosticCenter'));

type Household={id:string;name:string;invite_code:string};
type ListRow={id:string;title:string};
type EventRow={id:string;title:string;event_date:string;start_time:string|null};
type Tx={id:string;description:string;amount:number;type:string;transaction_date:string;category_id:string|null;paid_by?:string|null;is_shared?:boolean|null};
type AccessLevel='none'|'view'|'edit';
type HouseholdAccess={role:string;can_manage_members:boolean;can_view_audit:boolean;modules:Record<string,AccessLevel>};

const localIso=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const today=()=>localIso();
const currentMonth=()=>{const d=new Date(),start=new Date(d.getFullYear(),d.getMonth(),1),end=new Date(d.getFullYear(),d.getMonth()+1,0);return{start:localIso(start),end:localIso(end),month:localIso(start)}};
const authRedirectUrl=()=>`${window.location.origin}${import.meta.env.BASE_URL}`;

export default function App(){
 useDialogFocus();
 const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[recovery,setRecovery]=useState(()=>new URLSearchParams(window.location.hash.replace(/^#/,'')).get('type')==='recovery');
 const [households,setHouseholds]=useState<Household[]>([]),[household,setHousehold]=useState<Household|null>(null);
 const [householdsLoading,setHouseholdsLoading]=useState(true),[householdsLoadedFor,setHouseholdsLoadedFor]=useState(''),[householdsError,setHouseholdsError]=useState(''),[accessError,setAccessError]=useState('');
 const [tab,setTabState]=useState(()=>normalizeTab(new URLSearchParams(window.location.search).get('tab'))),[lists,setLists]=useState<ListRow[]>([]),[events,setEvents]=useState<EventRow[]>([]),[txs,setTxs]=useState<Tx[]>([]);
 const [financeHome,setFinanceHome]=useState<FinanceHome>({income:0,expense:0,saving:0,available:0,pending:0,projected:0,overdue:0,nextPayment:null,nextPaymentAmount:0,nextPaymentDate:null,goalName:null,goalProgress:0});
 const [accessValue,setAccess]=useState<HouseholdAccess|null>(null),[accessScope,setAccessScope]=useState('');
 const scope=(session?.user.id||'')+':'+(household?.id||'');
 const scopeRef=useRef(scope);scopeRef.current=scope;
 const userRef=useRef(session?.user.id);userRef.current=session?.user.id;
 const dataSequence=useRef(0),householdsSequence=useRef(0);
 const [dataScope,setDataScope]=useState('');
 const access=accessScope===scope?accessValue:null;
 const [masterUserId,setMasterUserId]=useState(''),[masterLoading,setMasterLoading]=useState(true);
 const isMaster=Boolean(session&&masterUserId===session.user.id);
 useEffect(()=>{let live=true;setMasterUserId('');setMasterLoading(true);if(!session){setMasterLoading(false);return}supabase.rpc('get_my_platform_access').then(({data,error})=>{if(live){setMasterUserId(!error&&data===true?session.user.id:'');setMasterLoading(false)}});return()=>{live=false}},[session?.user.id]);
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const {data}=supabase.auth.onAuthStateChange((event,s)=>{setSession(s);if(event==='PASSWORD_RECOVERY')setRecovery(true);if(event==='SIGNED_OUT'){setRecovery(false);clearLocalDrafts()}});return()=>data.subscription.unsubscribe()},[]);
 // Auth can confirm the same session on focus; membership loading follows account identity.
 useEffect(()=>{if(session)loadHouseholds();else{setHouseholds([]);setHousehold(null);setAccess(null)}},[session?.user.id]);
 useEffect(()=>{const pop=()=>setTabState(normalizeTab(new URLSearchParams(window.location.search).get('tab')));window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[]);
 function setTab(next:string){
  const [destination,section]=next.split(':');const normalized=normalizeTab(destination);if(normalized===tab&&!section)return;
  setTabState(normalized);
  const url=new URL(window.location.href);
  if(normalized==='inicio')url.searchParams.delete('tab');else url.searchParams.set('tab',normalized);
  url.searchParams.delete('quick');
  if(normalized==='presupuesto'&&section)url.searchParams.set('finance',financeSection(section));else url.searchParams.delete('finance');
  window.history.pushState({},'',url);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 }
 useEffect(()=>{if(household){setAccess(null);setAccessError('');loadAccess(household.id);loadData(household.id)}},[household?.id,session?.user.id]);
 // Returning to Inicio refreshes its summary; the first render is already covered by the household effect.
 const previousTab=useRef(tab);
 useEffect(()=>{if(previousTab.current!==tab&&tab==='inicio'&&household)loadData(household.id);previousTab.current=tab},[tab]);
 async function loadHouseholds(){
  const sequence=++householdsSequence.current;const userId=session?.user.id;if(!userId)return;setHouseholdsLoading(true);setHouseholdsError('');
  const {data,error}=await supabase.from('household_members').select('household_id, households(id,name,invite_code)').eq('user_id',userId);
  if(userRef.current!==userId||sequence!==householdsSequence.current)return;setHouseholdsLoading(false);setHouseholdsLoadedFor(userId);if(error){setHouseholdsError('No pudimos consultar tus hogares. Reintenta antes de crear uno nuevo.');return}
  const joined=(data||[]).map((r:any)=>r.households).filter(Boolean) as Household[];
  const rows=Array.from(new Map(joined.map(h=>[h.id,h])).values());
  setHouseholds(rows);setHousehold(current=>rows.find(h=>h.id===current?.id)||rows[0]||null);
 }
 async function loadAccess(id:string){const requestedScope=(session?.user.id||'')+':'+id;const {data,error}=await supabase.rpc('get_my_household_access',{p_household_id:id});if(scopeRef.current!==requestedScope)return;if(error){setAccess(null);setAccessError('No pudimos verificar tus permisos.');return}setAccessError('');setAccessScope(requestedScope);setAccess(data as HouseholdAccess)}
 async function loadData(id:string){
  const requestedScope=(session?.user.id||'')+':'+id,sequence=++dataSequence.current;
  const period=currentMonth();
  const [listR,eventR,txR,catR,allocR,contR,recR,occR,memberFinanceR,goalR,goalContR,planR,membersR]=await Promise.all([
   supabase.from('lists').select('id,title').eq('household_id',id).order('created_at',{ascending:false}),
   supabase.from('events').select('id,title,event_date,start_time').eq('household_id',id).gte('event_date',today()).order('event_date').limit(6),
   supabase.from('transactions').select('id,description,amount,type,transaction_date,category_id,paid_by,is_shared').eq('household_id',id).gte('transaction_date',period.start).lte('transaction_date',period.end).order('transaction_date',{ascending:false}),
   supabase.from('budget_categories').select('id,name,icon,budget_group').eq('household_id',id),
   supabase.from('budget_allocations').select('category_id,planned_amount,month,first_half_amount,second_half_amount').eq('household_id',id).eq('month',period.month),
   supabase.from('goal_contributions').select('goal_id,amount,contribution_date,created_by').eq('household_id',id).gte('contribution_date',period.start).lte('contribution_date',period.end),
   supabase.from('recurring_transactions').select('id,description,amount,type,due_day,category_id,paid_by,is_shared,created_at').eq('household_id',id).eq('active',true),
   supabase.from('recurring_transaction_occurrences').select('id,recurring_transaction_id,due_date,status,transaction_id,details_snapshot').eq('household_id',id).eq('period_month',period.month),
   supabase.from('finance_member_settings').select('user_id,monthly_income').eq('household_id',id),
   supabase.from('savings_goals').select('id,name,target_amount,target_date,icon').eq('household_id',id).eq('active',true).order('target_date',{ascending:true,nullsFirst:false}),
   supabase.from('goal_contributions').select('goal_id,amount,contribution_date').eq('household_id',id),
   supabase.from('finance_income_plans').select('user_id,month,expected_amount,first_half_amount,second_half_amount').eq('household_id',id).eq('month',period.month),
   supabase.from('household_members').select('user_id').eq('household_id',id)
  ]);
  if(scopeRef.current!==requestedScope||sequence!==dataSequence.current)return;
  setLists(listR.data||[]);setEvents(eventR.data||[]);setTxs((txR.data||[]) as Tx[]);setDataScope(requestedScope);
  if([txR,catR,allocR,contR,recR,occR,memberFinanceR,goalR,goalContR,planR,membersR].some(r=>r.error)){
   setFinanceHome(current=>({...current,loading:false,error:'No pudimos verificar el resumen financiero. Reintenta para ver cifras actualizadas.'}));return;
  }
  const members=(membersR.data||[]).map((r:any)=>({user_id:r.user_id,full_name:'Integrante'}));
  const source:CashFlowSource={month:period.month,today:today(),transactions:(txR.data||[]) as any[],savings:(contR.data||[]) as any[],categories:catR.data||[],allocations:(allocR.data||[]) as any[],members,plans:planR.data||[],references:Object.fromEntries((memberFinanceR.data||[]).map((r:any)=>[r.user_id,Number(r.monthly_income)])),recurring:(recR.data||[]) as any[],occurrences:(occR.data||[]) as any[]};
  const flow=buildCashFlow(source);
  const primaryGoal=(goalR.data||[])[0] as any;
  const goalSaved=primaryGoal?(goalContR.data||[]).filter((r:any)=>r.goal_id===primaryGoal.id&&r.contribution_date<=today()).reduce((sum:number,r:any)=>sum+Math.round(Number(r.amount)*100),0)/100:0;
  const goalProgress=primaryGoal&&Number(primaryGoal.target_amount)>0?Math.min(100,Math.round(goalSaved/Number(primaryGoal.target_amount)*100)):0;
  setFinanceHome({source,goals:goalR.data||[],goalEntries:(goalContR.data||[]) as any[],income:flow.income,expense:flow.expense,saving:flow.saving,available:flow.available,pending:flow.fixedCommitments,projected:flow.projectedClose,overdue:flow.overdue,nextPayment:flow.nextPayment?.terms.description||null,nextPaymentAmount:Number(flow.nextPayment?.terms.amount||0),nextPaymentDate:flow.nextPayment?.due_date||null,goalName:primaryGoal?.name||null,goalProgress,remainingExpenses:flow.remainingExpenses,savingsRemaining:flow.savingsRemaining,expectedIncomeRemaining:flow.expectedIncomeRemaining,futureCount:flow.futureCount,planComplete:members.length>0&&members.every((m:any)=>(planR.data||[]).some((p:any)=>p.user_id===m.user_id))&&(allocR.data||[]).length>0});
 }
 if(loading)return <div className="center"><div className="loader"/></div>;
 if(recovery)return <UpdatePassword onDone={()=>{setRecovery(false);window.history.replaceState({},'',authRedirectUrl())}}/>;
 if(!session)return <><Auth/><PwaUpdatePrompt/></>;
 if(tab==='master')return <div className="app master-standalone"><MasterHeader onBack={()=>setTab('inicio')} onProfile={()=>setTab('familia')}/><main className="content" id="main-content">{masterLoading?<ModuleFallback/>:isMaster?<AppErrorBoundary householdId={household?.id||''}><Suspense fallback={<ModuleFallback/>}><MasterSecurityGate><MasterPanel onChanged={()=>{if(household){loadAccess(household.id);loadData(household.id)}}}/></MasterSecurityGate></Suspense></AppErrorBoundary>:<section className="access-denied"><ShieldOff/><h2>Acceso master requerido</h2><p>Tu cuenta no está autorizada para la administración global.</p><button onClick={()=>setTab('inicio')}>Volver a Inicio</button></section>}</main><PwaUpdatePrompt/></div>;
 if(householdsError)return <main className="center"><div className="workspace-status error" role="alert"><p>{householdsError}</p><button onClick={loadHouseholds}>Reintentar</button></div></main>;
 if(householdsLoading||householdsLoadedFor!==session.user.id)return <div className="center"><div className="loader"/></div>;
 if(!household)return <><Onboarding onDone={loadHouseholds}/><PwaUpdatePrompt/></>;
 if(!access)return accessError?<main className="center"><div className="workspace-status error" role="alert"><p>{accessError}</p><button onClick={()=>loadAccess(household.id)}>Reintentar</button></div></main>:<div className="center"><div className="loader"/></div>;
 return <AppErrorBoundary key={scope} householdId={household.id}><ClientErrorReporter householdId={household.id}/><Shell key={scope} userId={session.user.id} isMaster={isMaster} household={household} households={households} tab={tab} setTab={setTab} onSwitch={setHousehold} onRefresh={()=>loadData(household.id)} onAccessChanged={()=>loadAccess(household.id)} onHouseholdRenamed={(name:string)=>{setHousehold(current=>current?{...current,name}:current);setHouseholds(current=>current.map(h=>h.id===household.id?{...h,name}:h))}} lists={dataScope===scope?lists:[]} events={dataScope===scope?events:[]} txs={dataScope===scope?txs:[]} financeHome={dataScope===scope?financeHome:{...financeHome,loading:true}} access={access}/></AppErrorBoundary>;
}

function Auth(){return <EmailAuth/>}

function UpdatePassword({onDone}:{onDone:()=>void}){
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMsg('');
  const f=new FormData(e.currentTarget),password=String(f.get('password')),confirm=String(f.get('confirm'));
  if(password!==confirm){setBusy(false);setMsg('Las contraseñas no coinciden.');return}
  const strength=validateStrongPassword(password);if(!strength.ok){setBusy(false);setMsg(strength.message);return}
  const {error}=await supabase.auth.updateUser({password});
  setBusy(false);
  if(error)setMsg(error.message);else{setMsg('Contraseña actualizada correctamente.');setTimeout(onDone,700)}
 }
 return <main className="auth"><section className="auth-card"><div className="brand-mark"><ModuleIcon name="home"/></div><p className="eyebrow">SEGURIDAD</p><h1>Nueva contraseña</h1><p className="muted">Crea una contraseña nueva para volver a entrar a Nuestro Hogar.</p><form onSubmit={submit}><input name="password" type="password" minLength={10} autoComplete="new-password" placeholder="Nueva contraseña" required/><input name="confirm" type="password" minLength={10} autoComplete="new-password" placeholder="Confirmar contraseña" required/><button disabled={busy}>{busy?'Actualizando...':'Guardar nueva contraseña'}</button></form>{msg&&<p className="status">{msg}</p>}</section></main>
}

function Onboarding({onDone}:{onDone:()=>void}){
 const [join,setJoin]=useState(false),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 async function go(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);const {error}=join?await supabase.rpc('join_household',{p_invite_code:String(f.get('value'))}):await supabase.rpc('create_household',{p_name:String(f.get('value'))});setBusy(false);if(error)setMsg(error.message);else onDone()}
 return <main className="auth"><section className="auth-card wide"><p className="eyebrow">BIENVENIDO</p><h1>{join?'Únete a un hogar':'Crea tu hogar'}</h1><p className="muted">{join?'Ingresa el código de invitación que te compartieron.':'Tu espacio para ti, tu pareja o tu familia. Puedes empezar solo e invitar después.'}</p><form onSubmit={go}><label>{join?'Código de invitación':'Nombre de tu hogar'}<input name="value" placeholder={join?'Código de invitación':'Ej. Mi espacio'} maxLength={100} required/></label><button disabled={busy}>{join?'Unirme':'Crear hogar'}</button></form>{msg&&<p className="status">{msg}</p>}<button className="link" onClick={()=>setJoin(!join)}>{join?'Prefiero crear un hogar':'Ya tengo un código de invitación'}</button></section></main>
}

function MasterHeader({onBack,onProfile}:{onBack:()=>void;onProfile:()=>void}){
 const theme=useEffectiveTheme();
 return <header><div><button className="primary compact" onClick={onBack}>Volver al hogar</button><strong>Nuestro Hogar</strong></div><div className="header-actions"><button type="button" className="header-theme-toggle" onClick={toggleTheme} aria-label={theme==='light'?'Activar tema de noche':'Activar tema de día'} aria-pressed={theme==='dark'}><Sun className="theme-sun" size={18}/><Moon className="theme-moon" size={18}/></button><ProfileAvatar onClick={onProfile}/></div></header>;
}

function Shell(p:any){
 const [headingSlot,setHeadingSlot]=useState<HTMLDivElement|null>(null);
 const effectiveTheme=useEffectiveTheme();
 const preferenceKey=appearanceKey(p.userId,p.household.id);
 const [appearanceOpen,setAppearanceOpen]=useState(false),[savedAppearance,setSavedAppearance]=useState(()=>({key:preferenceKey,value:readAppearance(preferenceKey)}));
 const appearance=savedAppearance.key===preferenceKey?savedAppearance.value:readAppearance(preferenceKey);
 function saveAppearance(value:Appearance){localStorage.setItem(preferenceKey,JSON.stringify(value));setSavedAppearance({key:preferenceKey,value});window.dispatchEvent(new CustomEvent('nh:appearance-saved'))}

 const module=tabModule(p.tab),level=module?p.access?.modules?.[module]:null,denied=level==='none';
 useEffect(()=>{const url=new URL(window.location.href);if(url.searchParams.get('quick')!=='1')return;const timer=window.setTimeout(()=>window.dispatchEvent(new CustomEvent('nh:quick-add')),180);url.searchParams.delete('quick');window.history.replaceState({},'',url);return()=>window.clearTimeout(timer)},[p.household.id]);
 return <WorkspaceHeadingSlot.Provider value={headingSlot}><div className="app app-studio" data-accent={appearance.accent} data-module={p.tab}><DesktopRail essential={appearance.view==='essential'} favorites={appearance.favorites} currentTab={p.tab} access={p.access.modules} isMaster={p.isMaster} onNavigate={p.setTab} onAppearance={()=>setAppearanceOpen(true)}/><a className="skip-link" href="#main-content">Saltar al contenido</a><header className="workspace-header"><div className="workspace-household"><div className="home-select-wrap household-pill">{appearance.cover?<img className="household-pill-photo" src={appearance.cover} alt=""/>:<span className="household-pill-photo" aria-hidden="true"><BrandMark size={16}/></span>}<span className="home-select-label" aria-hidden="true">{p.household.name}</span><select className="home-select" aria-label="Cambiar de familia" value={p.household.id} onChange={e=>p.onSwitch(p.households.find((h:Household)=>h.id===e.target.value)||p.household)}>{p.households.map((h:Household)=><option key={h.id} value={h.id}>{h.name}</option>)}</select><ChevronDown size={16} aria-hidden="true"/></div><button type="button" className="header-theme-toggle" onClick={toggleTheme} aria-label={effectiveTheme==='light'?'Activar tema de noche':'Activar tema de día'} aria-pressed={effectiveTheme==='dark'} title={effectiveTheme==='light'?'Tema de día · cambiar a noche':'Tema de noche · cambiar a día'}><span className="theme-sun"><Sun size={16}/></span><span className="theme-moon"><Moon size={16}/></span></button></div><div className="header-actions"><AppMenu essential={appearance.view==='essential'} favorites={appearance.favorites} onPersonalize={()=>setAppearanceOpen(true)} isMaster={p.isMaster} currentTab={p.tab} access={p.access.modules} onNavigate={p.setTab}/><GlobalCommandCenter household={p.household} access={p.access.modules} onNavigate={p.setTab} onChanged={p.onRefresh}/><NotificationCenter household={p.household} onNavigate={p.setTab}/><ProfileAvatar onClick={()=>p.setTab('familia')}/></div><div className="workspace-header-slot" ref={setHeadingSlot}/></header>
 <main className="content" id="main-content" tabIndex={-1}><ConnectionStatus/>
 <HouseholdWelcome household={p.household} canManage={p.access.can_manage_members} onChanged={()=>{p.onRefresh();p.onAccessChanged?.()}}/>
 <HouseholdStorageNote householdId={p.household.id} version={p.tab+JSON.stringify(p.access.modules)}/>
 {level==='view'&&<div className="module-readonly-banner"><Eye/><div><strong>Modo solo lectura</strong><span>Puedes consultar esta sección, pero los cambios están bloqueados por los permisos de tu rol.</span></div></div>}
 {denied?<AccessDenied role={p.access.role} onHome={()=>p.setTab('inicio')}/>:<Suspense key={p.household.id+':'+p.tab+':'+JSON.stringify(p.access.modules)} fallback={<ModuleFallback/>}>
 {p.tab==='inicio'&&<HomeDashboard onRefresh={p.onRefresh} appearance={appearance} onPersonalize={()=>setAppearanceOpen(true)} household={p.household} finance={p.financeHome} listCount={p.lists.length} access={p.access.modules} onNavigate={p.setTab}/>}
 {p.tab==='listas'&&<ListsCenter household={p.household} financeAccess={p.access.modules.finance} readOnly={level==='view'} onChanged={p.onRefresh}/>}
 {p.tab==='calendario'&&<CalendarCenter household={p.household} readOnly={level==='view'} onChanged={p.onRefresh} onNavigate={p.setTab}/>} 
 {p.tab==='presupuesto'&&<Finance household={p.household} readOnly={level==='view'}/>} 
 {p.tab==='familia'&&<FamilyCenter household={p.household} onHouseholdRenamed={p.onHouseholdRenamed} onChanged={()=>{p.onRefresh();p.onAccessChanged?.()}}/>} {p.tab==='documentos'&&<DocumentVault household={p.household} readOnly={level==='view'}/>}  {p.tab==='comidas'&&<MealsCenter household={p.household} canManageShopping={p.access.modules.lists==='edit'} readOnly={level==='view'} onNavigate={p.setTab}/>}  {p.tab==='mantenimiento'&&<MaintenanceCenter household={p.household} readOnly={level==='view'} onNavigate={p.setTab}/>}  {p.tab==='salud'&&<HouseholdHealthCenter household={p.household} canEditFinance={p.access?.modules.finance==='edit'} onNavigate={p.setTab}/>} {p.tab==='automatizaciones'&&<AutomationCenter household={p.household} readOnly={level==='view'} onNavigate={p.setTab}/>}  {p.tab==='cierre'&&<MonthlyCloseCenter household={p.household} readOnly={level==='view'} onNavigate={p.setTab}/>}  {p.tab==='planeacion'&&<PlanningCenter household={p.household} readOnly={level==='view'} onNavigate={p.setTab}/>} {p.tab==='respaldos'&&<BackupCenter household={p.household}/>} {p.tab==='diagnostico'&&<DiagnosticCenter household={p.household} onNavigate={p.setTab}/>}
 </Suspense>}{appearanceOpen&&<Suspense fallback={<ModuleFallback/>}><AppearanceDialog key={preferenceKey} value={appearance} access={p.access.modules} onSave={saveAppearance} onClose={()=>setAppearanceOpen(false)}/></Suspense>}
 </main><PwaInstallPrompt/><PwaUpdatePrompt/></div></WorkspaceHeadingSlot.Provider>
}

function AccessDenied({role,onHome}:{role:string;onHome:()=>void}){return <section className="access-denied"><span><ShieldOff/></span><h2>Módulo restringido</h2><p>Tu rol de {role==='teen'?'Adolescente':role==='guest'?'Invitado':role==='admin'?'Administrador':role==='owner'?'Propietario':'Adulto'} no tiene acceso a esta sección. Un administrador del hogar puede cambiar el permiso desde Familia.</p><button onClick={onHome}>Volver a Inicio</button></section>}
function tabModule(tab:string){return({listas:'lists',calendario:'calendar',presupuesto:'finance',documentos:'documents',comidas:'meals',mantenimiento:'maintenance',planeacion:'planning',salud:'health',cierre:'monthly_close',automatizaciones:'automations',respaldos:'backups',diagnostico:'diagnostics'} as Record<string,string>)[tab]||null}
const VALID_TABS=new Set(['inicio','listas','calendario','presupuesto','familia','documentos','comidas','mantenimiento','salud','automatizaciones','cierre','planeacion','respaldos','diagnostico','master']);
function normalizeTab(tab:string|null){return tab&&VALID_TABS.has(tab)?tab:'inicio'}
function ModuleFallback(){return <div className="studio-skeleton" role="status" aria-label="Cargando módulo"><span/><i/><div><b/><b/><b/></div><i/><i/></div>}
