import {FormEvent,useEffect,useMemo,useState} from 'react';import {CalendarDays,CheckCircle2,ChevronDown,Clock3,Home,LogOut,Menu,Plus,ReceiptText,ShoppingCart,Target,TrendingUp,Users,WalletCards} from 'lucide-react';import {supabase} from './lib/supabase';import Finance from './Finance';import HomeDashboard from './HomeDashboard';import ListsCenter from './ListsCenter';import CalendarCenter from './CalendarCenter';import FamilyCenter from './FamilyCenter';import ProfileAvatar from './ProfileAvatar';import PwaInstallPrompt from './PwaInstallPrompt';import type {Session} from '@supabase/supabase-js';

type Household={id:string;name:string;invite_code:string};
type ListRow={id:string;title:string};
type EventRow={id:string;title:string;event_date:string;start_time:string|null};
type Tx={id:string;description:string;amount:number;type:string;transaction_date:string;category_id:string|null};
type FinanceHome={income:number;expense:number;saving:number;available:number;pending:number;projected:number;overdue:number;nextPayment:string|null;nextPaymentAmount:number;nextPaymentDate:string|null;goalName:string|null;goalProgress:number};

const money=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:0}).format(n);
const localIso=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const today=()=>localIso();
const currentMonth=()=>{const d=new Date(),start=new Date(d.getFullYear(),d.getMonth(),1),end=new Date(d.getFullYear(),d.getMonth()+1,0);return{start:localIso(start),end:localIso(end),month:localIso(start)}};
const authRedirectUrl=()=>`${window.location.origin}${import.meta.env.BASE_URL}`;

export default function App(){
 const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[recovery,setRecovery]=useState(()=>new URLSearchParams(window.location.hash.replace(/^#/,'')).get('type')==='recovery');
 const [households,setHouseholds]=useState<Household[]>([]),[household,setHousehold]=useState<Household|null>(null);
 const [tab,setTab]=useState('inicio'),[lists,setLists]=useState<ListRow[]>([]),[events,setEvents]=useState<EventRow[]>([]),[txs,setTxs]=useState<Tx[]>([]);
 const [financeHome,setFinanceHome]=useState<FinanceHome>({income:0,expense:0,saving:0,available:0,pending:0,projected:0,overdue:0,nextPayment:null,nextPaymentAmount:0,nextPaymentDate:null,goalName:null,goalProgress:0});
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const {data}=supabase.auth.onAuthStateChange((event,s)=>{setSession(s);if(event==='PASSWORD_RECOVERY')setRecovery(true);if(event==='SIGNED_OUT')setRecovery(false)});return()=>data.subscription.unsubscribe()},[]);
 useEffect(()=>{if(session)loadHouseholds();else{setHouseholds([]);setHousehold(null)}},[session]);
 useEffect(()=>{if(household)loadData(household.id)},[household,tab]);
 async function loadHouseholds(){const {data,error}=await supabase.from('household_members').select('household_id, households(id,name,invite_code)');if(error)return;const rows=(data||[]).map((r:any)=>r.households).filter(Boolean);setHouseholds(rows);if(rows[0])setHousehold(rows[0])}
 async function loadData(id:string){
  const period=currentMonth();
  const [listR,eventR,txR,catR,allocR,contR,recR,occR,memberFinanceR,goalR,goalContR]=await Promise.all([
   supabase.from('lists').select('id,title').eq('household_id',id).order('created_at',{ascending:false}),
   supabase.from('events').select('id,title,event_date,start_time').eq('household_id',id).gte('event_date',today()).order('event_date').limit(6),
   supabase.from('transactions').select('id,description,amount,type,transaction_date,category_id').eq('household_id',id).gte('transaction_date',period.start).lte('transaction_date',period.end).order('transaction_date',{ascending:false}),
   supabase.from('budget_categories').select('id,budget_group').eq('household_id',id),
   supabase.from('budget_allocations').select('category_id,planned_amount').eq('household_id',id).eq('month',period.month),
   supabase.from('goal_contributions').select('goal_id,amount,contribution_date').eq('household_id',id).gte('contribution_date',period.start).lte('contribution_date',period.end),
   supabase.from('recurring_transactions').select('id,description,amount,type,due_day,category_id,created_at').eq('household_id',id).eq('active',true),
   supabase.from('recurring_transaction_occurrences').select('id,recurring_transaction_id,due_date,status').eq('household_id',id).eq('period_month',period.month),
   supabase.from('finance_member_settings').select('monthly_income').eq('household_id',id),
   supabase.from('savings_goals').select('id,name,target_amount,target_date').eq('household_id',id).eq('active',true).order('target_date',{ascending:true,nullsFirst:false}),
   supabase.from('goal_contributions').select('goal_id,amount').eq('household_id',id)
  ]);
  setLists(listR.data||[]);setEvents(eventR.data||[]);setTxs((txR.data||[]) as Tx[]);
  const txData=(txR.data||[]) as Tx[],categories=(catR.data||[]) as any[],allocations=(allocR.data||[]) as any[],recurring=(recR.data||[]) as any[];
  const income=txData.filter(t=>t.type==='income').reduce((sum,t)=>sum+Number(t.amount),0);
  const expense=txData.filter(t=>t.type==='expense').reduce((sum,t)=>sum+Number(t.amount),0);
  const saving=(contR.data||[]).reduce((sum:any,row:any)=>sum+Number(row.amount),0);
  const available=income-expense-saving;
  const categoryGroup=new Map(categories.map((cat:any)=>[cat.id,cat.budget_group||'variable']));
  const plannedByCategory=new Map(allocations.map((row:any)=>[row.category_id,Number(row.planned_amount)]));
  const spentByCategory=new Map<string,number>();
  for(const row of txData as any[]){if(row.type==='expense'&&row.category_id)spentByCategory.set(row.category_id,(spentByCategory.get(row.category_id)||0)+Number(row.amount))}
  let occurrences=(occR.data||[]) as any[];
  const missing=recurring.filter((r:any)=>localIso(new Date(r.created_at))<=period.end&&!occurrences.some((o:any)=>o.recurring_transaction_id===r.id));
  if(missing.length){
   const seeds=missing.map((r:any)=>{const last=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate();const day=Math.min(Number(r.due_day),last);return{recurring_transaction_id:r.id,household_id:id,period_month:period.month,due_date:localIso(new Date(new Date().getFullYear(),new Date().getMonth(),day)),status:'pending'}});
   await supabase.from('recurring_transaction_occurrences').upsert(seeds,{onConflict:'recurring_transaction_id,period_month',ignoreDuplicates:true});
   const refreshed=await supabase.from('recurring_transaction_occurrences').select('id,recurring_transaction_id,due_date,status').eq('household_id',id).eq('period_month',period.month);
   occurrences=(refreshed.data||[]) as any[];
  }
  const recMap=new Map(recurring.map((r:any)=>[r.id,r]));
  const openOccurrences=occurrences.filter((o:any)=>o.status==='pending');
  const overdue=openOccurrences.filter((o:any)=>o.due_date<today()).length;
  let pending=0,pendingOutsideFixed=0;const pendingFixedByCategory=new Map<string,number>();
  for(const o of openOccurrences){const r:any=recMap.get(o.recurring_transaction_id);if(!r||r.type!=='expense')continue;const amount=Number(r.amount);pending+=amount;const group=r.category_id?categoryGroup.get(r.category_id)||'variable':'variable';if(group==='fixed'&&r.category_id)pendingFixedByCategory.set(r.category_id,(pendingFixedByCategory.get(r.category_id)||0)+amount);else pendingOutsideFixed+=amount}
  let fixedCommitments=pendingOutsideFixed,variableRemaining=0,plannedSaving=0;
  for(const cat of categories as any[]){const planned=plannedByCategory.get(cat.id)||0,spent=spentByCategory.get(cat.id)||0;if(cat.budget_group==='fixed')fixedCommitments+=Math.max(planned-spent,pendingFixedByCategory.get(cat.id)||0);else if(cat.budget_group==='saving')plannedSaving+=planned;else variableRemaining+=Math.max(planned-spent,0)}
  const savingsRemaining=Math.max(plannedSaving-saving,0);
  const configuredIncome=(memberFinanceR.data||[]).reduce((sum:any,row:any)=>sum+Number(row.monthly_income||0),0);
  const expectedIncome=Math.max((configuredIncome||income)-income,0);
  const projected=available+expectedIncome-fixedCommitments-savingsRemaining-variableRemaining;
  const nextOccurrence=openOccurrences.slice().sort((a:any,b:any)=>String(a.due_date).localeCompare(String(b.due_date)))[0];
  const nextRecurring:any=nextOccurrence?recMap.get(nextOccurrence.recurring_transaction_id):null;
  const primaryGoal=(goalR.data||[])[0] as any;
  const allGoalContributions=(goalContR.data||[]) as any[];
  const goalSaved=primaryGoal?allGoalContributions.filter(row=>row.goal_id===primaryGoal.id).reduce((sum,row)=>sum+Number(row.amount),0):0;
  const goalProgress=primaryGoal&&Number(primaryGoal.target_amount)>0?Math.min(100,Math.round(goalSaved/Number(primaryGoal.target_amount)*100)):0;
  setFinanceHome({income,expense,saving,available,pending:fixedCommitments,projected,overdue,nextPayment:nextRecurring?.description||null,nextPaymentAmount:Number(nextRecurring?.amount||0),nextPaymentDate:nextOccurrence?.due_date||null,goalName:primaryGoal?.name||null,goalProgress});
 }
 if(loading)return <div className="center"><div className="loader"/></div>;
 if(recovery)return <UpdatePassword onDone={()=>{setRecovery(false);window.history.replaceState({},'',authRedirectUrl())}}/>;
 if(!session)return <Auth/>;
 if(!household)return <Onboarding onDone={loadHouseholds}/>;
 return <Shell household={household} households={households} tab={tab} setTab={setTab} onSwitch={setHousehold} onRefresh={()=>loadData(household.id)} lists={lists} events={events} txs={txs} financeHome={financeHome}/>;
}

function Auth(){
 const [mode,setMode]=useState<'login'|'signup'|'reset'>('login'),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[pendingEmail,setPendingEmail]=useState('');
 useEffect(()=>{const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
   const error=hash.get('error_description');
   if(error)setMsg(decodeURIComponent(error.replace(/\+/g,' ')));
 },[]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMsg('');
  const f=new FormData(e.currentTarget),email=String(f.get('email')),password=String(f.get('password')||''),full_name=String(f.get('name')||'');
  if(mode==='reset'){
   const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl()});
   setBusy(false);
   setMsg(error?error.message:'Te enviamos un enlace para crear una nueva contraseña. Revisa también Spam o Promociones.');
   return;
  }
  const res=mode==='login'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password,options:{data:{full_name},emailRedirectTo:authRedirectUrl()}});
  setBusy(false);
  if(res.error)setMsg(res.error.message);
  else if(mode==='signup'&&!res.data.session){setPendingEmail(email);setMsg('Revisa tu correo para confirmar la cuenta. El enlace abrirá esta misma aplicación.')}
 }
 async function resend(){if(!pendingEmail)return;setBusy(true);const {error}=await supabase.auth.resend({type:'signup',email:pendingEmail,options:{emailRedirectTo:authRedirectUrl()}});setBusy(false);setMsg(error?error.message:'Correo de confirmación reenviado. Usa el enlace más reciente.')}
 return <main className="auth"><section className="auth-card"><div className="brand-mark">⌂</div><p className="eyebrow">TU ESPACIO COMPARTIDO</p><h1>{mode==='reset'?'Recuperar contraseña':'Nuestro Hogar'}</h1><p className="muted">{mode==='reset'?'Ingresa tu correo y te enviaremos un enlace seguro para crear una nueva contraseña.':'Finanzas, calendario, listas y vida familiar en un solo lugar.'}</p><form onSubmit={submit}>{mode==='signup'&&<input name="name" placeholder="Nombre completo" required/>}<input name="email" type="email" placeholder="Correo electrónico" required/>{mode!=='reset'&&<input name="password" type="password" minLength={6} placeholder="Contraseña" required/>}<button disabled={busy}>{busy?'Procesando...':mode==='login'?'Entrar':mode==='signup'?'Crear cuenta':'Enviar enlace de recuperación'}</button></form>{msg&&<p className="status">{msg}</p>}{pendingEmail&&<button className="link" disabled={busy} onClick={resend}>Reenviar correo de confirmación</button>}{mode==='login'&&<button className="link" onClick={()=>{setMode('reset');setMsg('')}}>¿Olvidaste tu contraseña?</button>}<button className="link" onClick={()=>{setMode(mode==='login'?'signup':'login');setMsg('');setPendingEmail('')}}>{mode==='login'?'¿Primera vez? Crear cuenta':mode==='signup'?'Ya tengo cuenta':'Volver a iniciar sesión'}</button></section></main>
}

function UpdatePassword({onDone}:{onDone:()=>void}){
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMsg('');
  const f=new FormData(e.currentTarget),password=String(f.get('password')),confirm=String(f.get('confirm'));
  if(password!==confirm){setBusy(false);setMsg('Las contraseñas no coinciden.');return}
  const {error}=await supabase.auth.updateUser({password});
  setBusy(false);
  if(error)setMsg(error.message);else{setMsg('Contraseña actualizada correctamente.');setTimeout(onDone,700)}
 }
 return <main className="auth"><section className="auth-card"><div className="brand-mark">⌂</div><p className="eyebrow">SEGURIDAD</p><h1>Nueva contraseña</h1><p className="muted">Crea una contraseña nueva para volver a entrar a Nuestro Hogar.</p><form onSubmit={submit}><input name="password" type="password" minLength={6} placeholder="Nueva contraseña" required/><input name="confirm" type="password" minLength={6} placeholder="Confirmar contraseña" required/><button disabled={busy}>{busy?'Actualizando...':'Guardar nueva contraseña'}</button></form>{msg&&<p className="status">{msg}</p>}</section></main>
}

function Onboarding({onDone}:{onDone:()=>void}){
 const [join,setJoin]=useState(false),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 async function go(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);const {error}=join?await supabase.rpc('join_household',{p_invite_code:String(f.get('value'))}):await supabase.rpc('create_household',{p_name:String(f.get('value'))});setBusy(false);if(error)setMsg(error.message);else onDone()}
 return <main className="auth"><section className="auth-card wide"><p className="eyebrow">BIENVENIDO</p><h1>{join?'Únete a un hogar':'Crea tu hogar'}</h1><p className="muted">{join?'Ingresa el código de invitación que te compartieron.':'Este será el espacio privado para compartir con tu familia.'}</p><form onSubmit={go}><input name="value" placeholder={join?'Código de invitación':'Ej. Nuestro Hogar'} required/><button disabled={busy}>{join?'Unirme':'Crear hogar'}</button></form>{msg&&<p className="status">{msg}</p>}<button className="link" onClick={()=>setJoin(!join)}>{join?'Prefiero crear un hogar':'Ya tengo un código de invitación'}</button></section></main>
}

function Shell(p:any){
 return <div className="app"><header><div><div className="home-select-wrap"><select className="home-select" value={p.household.id} onChange={e=>p.onSwitch(p.households.find((h:Household)=>h.id===e.target.value)||p.household)}>{p.households.map((h:Household)=><option key={h.id} value={h.id}>{h.name}</option>)}</select><ChevronDown size={18}/></div><p>{new Date().toLocaleDateString('es-GT',{weekday:'long',day:'numeric',month:'long'})}</p></div><ProfileAvatar/></header>
 <main className="content">
 {p.tab==='inicio'&&<HomeDashboard finance={p.financeHome} events={p.events} listCount={p.lists.length} onNavigate={p.setTab}/>}
 {p.tab==='listas'&&<ListsCenter household={p.household} onChanged={p.onRefresh}/>}
 {p.tab==='calendario'&&<CalendarCenter household={p.household} onChanged={p.onRefresh} onNavigate={p.setTab}/>}
 {p.tab==='presupuesto'&&<Finance household={p.household}/>}
 {p.tab==='familia'&&<FamilyCenter household={p.household} onChanged={p.onRefresh}/>}
 </main><PwaInstallPrompt/><nav><button className={p.tab==='inicio'?'active':''} onClick={()=>p.setTab('inicio')}><Home/><span>Inicio</span></button><button className={p.tab==='calendario'?'active':''} onClick={()=>p.setTab('calendario')}><CalendarDays/><span>Calendario</span></button><button className="fab" onClick={()=>p.setTab('listas')}><Plus/></button><button className={p.tab==='presupuesto'?'active':''} onClick={()=>p.setTab('presupuesto')}><WalletCards/><span>Finanzas</span></button><button className={p.tab==='familia'?'active':''} onClick={()=>p.setTab('familia')}><Users/><span>Familia</span></button></nav></div>
}
function Icon({kind}:{kind:string}){const map:any={list:<CheckCircle2/>,calendar:<CalendarDays/>,budget:<WalletCards/>,family:<Users/>,docs:<ReceiptText/>,birthday:<CalendarDays/>,meal:<ShoppingCart/>,recipe:<ReceiptText/>};return <span className={'ico '+kind}>{map[kind]}</span>}

function Page({title,subtitle,children}:{title:string;subtitle:string;children:any}){return <section><p className="eyebrow">NUESTRO HOGAR</p><h2 className="page-title">{title}</h2><p className="muted">{subtitle}</p>{children}</section>}

function Lists({household,lists,refresh}:any){const [title,setTitle]=useState('');async function add(e:FormEvent){e.preventDefault();if(!title.trim())return;await supabase.from('lists').insert({household_id:household.id,title:title.trim()});setTitle('');refresh()}return <Page title="Listas" subtitle="Compras, pendientes y todo lo que quieran recordar."><form className="quick" onSubmit={add}><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Nueva lista"/><button><Plus size={18}/></button></form><div className="stack">{lists.map((l:ListRow)=><article className="row" key={l.id}><span className="rowicon"><CheckCircle2/></span><div><strong>{l.title}</strong><small>Lista compartida</small></div></article>)}{!lists.length&&<Empty text="Aún no hay listas."/ >}</div></Page>}

function Events({household,events,refresh}:any){const [show,setShow]=useState(false);async function add(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);await supabase.from('events').insert({household_id:household.id,title:String(f.get('title')),event_date:String(f.get('date')),start_time:String(f.get('time')||'')||null});setShow(false);refresh()}return <Page title="Calendario" subtitle="Los próximos momentos importantes de la familia."><button className="primary compact" onClick={()=>setShow(!show)}><Plus size={17}/> Nuevo evento</button>{show&&<form className="panel formgrid" onSubmit={add}><input name="title" placeholder="Evento" required/><input name="date" type="date" defaultValue={today()} required/><input name="time" type="time"/><button>Guardar</button></form>}<div className="stack">{events.map((e:EventRow)=><article className="row" key={e.id}><span className="datebox">{new Date(e.event_date+'T12:00').getDate()}<small>{new Date(e.event_date+'T12:00').toLocaleDateString('es-GT',{month:'short'})}</small></span><div><strong>{e.title}</strong><small>{e.start_time?.slice(0,5)||'Todo el día'}</small></div></article>)}{!events.length&&<Empty text="No hay eventos próximos."/ >}</div></Page>}

function Budget({household,txs,refresh}:any){const [show,setShow]=useState(false);const expense=useMemo(()=>txs.filter((x:Tx)=>x.type==='expense').reduce((a:number,b:Tx)=>a+Number(b.amount),0),[txs]);const income=useMemo(()=>txs.filter((x:Tx)=>x.type==='income').reduce((a:number,b:Tx)=>a+Number(b.amount),0),[txs]);async function add(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);await supabase.from('transactions').insert({household_id:household.id,description:String(f.get('description')),amount:Number(f.get('amount')),type:String(f.get('type')),transaction_date:String(f.get('date'))});setShow(false);refresh()}return <Page title="Presupuesto" subtitle="Una vista sencilla de las finanzas compartidas."><div className="finance"><div><span>Ingresos</span><strong>{money(income)}</strong></div><div><span>Gastos</span><strong>{money(expense)}</strong></div><div><span>Balance</span><strong>{money(income-expense)}</strong></div></div><button className="primary compact" onClick={()=>setShow(!show)}><Plus size={17}/> Movimiento</button>{show&&<form className="panel formgrid" onSubmit={add}><input name="description" placeholder="Descripción" required/><input name="amount" type="number" step="0.01" min="0.01" placeholder="Monto" required/><select name="type"><option value="expense">Gasto</option><option value="income">Ingreso</option></select><input name="date" type="date" defaultValue={today()} required/><button>Guardar</button></form>}<div className="stack">{txs.map((t:Tx)=><article className="row" key={t.id}><span className={'moneydot '+t.type}>{t.type==='income'?'+':'−'}</span><div className="grow"><strong>{t.description}</strong><small>{new Date(t.transaction_date+'T12:00').toLocaleDateString('es-GT')}</small></div><b>{t.type==='income'?'+':'−'}{money(Number(t.amount))}</b></article>)}{!txs.length&&<Empty text="Aún no hay movimientos."/ >}</div></Page>}

function Family({household}:any){return <Page title="Mi familia" subtitle="Comparte este código para invitar a otra persona a tu hogar."><div className="invite"><span>CÓDIGO DE INVITACIÓN</span><strong>{household.invite_code}</strong><button onClick={()=>navigator.clipboard.writeText(household.invite_code)}>Copiar código</button></div><button className="logout" onClick={()=>supabase.auth.signOut()}><LogOut size={17}/> Cerrar sesión</button></Page>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}
