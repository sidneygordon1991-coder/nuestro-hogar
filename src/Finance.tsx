import {FormEvent,useEffect,useMemo,useState} from 'react';
import {ArrowDownLeft,ArrowLeft,ArrowRight,ArrowUpRight,CalendarClock,Check,ChevronRight,CreditCard,Landmark,PiggyBank,Plus,ReceiptText,Target,Users,WalletCards,X} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type Category={id:string;name:string;icon:string};
type Tx={id:string;description:string;amount:number;type:'income'|'expense';transaction_date:string;category_id:string|null;paid_by:string|null;account_id:string|null;is_shared:boolean;notes:string|null};
type Allocation={id:string;category_id:string;planned_amount:number;month:string};
type Goal={id:string;name:string;target_amount:number;target_date:string|null;icon:string;active:boolean};
type Contribution={id:string;goal_id:string;amount:number;contribution_date:string;created_by:string|null};
type Recurring={id:string;description:string;amount:number;type:'income'|'expense';due_day:number;category_id:string|null;paid_by:string|null;is_shared:boolean};
type Account={id:string;name:string;account_type:string;opening_balance:number;owner_user_id:string|null;is_shared:boolean;active:boolean};
type Member={user_id:string;role:string;full_name:string};
type Split={transaction_id:string;user_id:string;share_amount:number};

const currency=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:0}).format(n||0);
const isoDate=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const monthDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
const monthBounds=(d:Date)=>{const start=new Date(d.getFullYear(),d.getMonth(),1),end=new Date(d.getFullYear(),d.getMonth()+1,0);return{start:isoDate(start),end:isoDate(end)}};
const monthLabel=(d:Date)=>d.toLocaleDateString('es-GT',{month:'long',year:'numeric'});
const pct=(a:number,b:number)=>b>0?Math.min(100,Math.round((a/b)*100)):0;

export default function Finance({household}:{household:Household}){
 const [tab,setTab]=useState<'summary'|'budget'|'transactions'|'goals'|'accounts'>('summary');
 const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [categories,setCategories]=useState<Category[]>([]),[txs,setTxs]=useState<Tx[]>([]),[allocations,setAllocations]=useState<Allocation[]>([]);
 const [goals,setGoals]=useState<Goal[]>([]),[contributions,setContributions]=useState<Contribution[]>([]),[recurring,setRecurring]=useState<Recurring[]>([]);
 const [accounts,setAccounts]=useState<Account[]>([]),[accountTxs,setAccountTxs]=useState<{account_id:string|null;type:string;amount:number}[]>([]);
 const [members,setMembers]=useState<Member[]>([]),[splits,setSplits]=useState<Split[]>([]),[currentUser,setCurrentUser]=useState('');
 const [showTxForm,setShowTxForm]=useState(false),[showGoalForm,setShowGoalForm]=useState(false),[showAccountForm,setShowAccountForm]=useState(false);
 const [budgetDraft,setBudgetDraft]=useState<Record<string,string>>({});

 useEffect(()=>{load()},[household.id,month.getFullYear(),month.getMonth()]);

 async function load(){
  setLoading(true);setMessage('');
  await supabase.rpc('seed_finance_categories',{p_household_id:household.id});
  const bounds=monthBounds(month),m=monthDate(month);
  const userPromise=supabase.auth.getUser();
  const [catR,txR,allocR,goalR,contR,recR,accR,accTxR,memberR,userR]=await Promise.all([
   supabase.from('budget_categories').select('id,name,icon').eq('household_id',household.id).order('created_at'),
   supabase.from('transactions').select('id,description,amount,type,transaction_date,category_id,paid_by,account_id,is_shared,notes').eq('household_id',household.id).gte('transaction_date',bounds.start).lte('transaction_date',bounds.end).order('transaction_date',{ascending:false}).order('created_at',{ascending:false}),
   supabase.from('budget_allocations').select('id,category_id,planned_amount,month').eq('household_id',household.id).eq('month',m),
   supabase.from('savings_goals').select('id,name,target_amount,target_date,icon,active').eq('household_id',household.id).eq('active',true).order('created_at'),
   supabase.from('goal_contributions').select('id,goal_id,amount,contribution_date,created_by').eq('household_id',household.id),
   supabase.from('recurring_transactions').select('id,description,amount,type,due_day,category_id,paid_by,is_shared').eq('household_id',household.id).eq('active',true).order('due_day'),
   supabase.from('finance_accounts').select('id,name,account_type,opening_balance,owner_user_id,is_shared,active').eq('household_id',household.id).eq('active',true).order('created_at'),
   supabase.from('transactions').select('account_id,type,amount').eq('household_id',household.id).not('account_id','is',null),
   supabase.from('household_members').select('user_id,role').eq('household_id',household.id),
   userPromise
  ]);
  const memberRows=(memberR.data||[]) as {user_id:string;role:string}[];
  const ids=memberRows.map(x=>x.user_id);
  const profileR=ids.length?await supabase.from('profiles').select('id,full_name').in('id',ids):{data:[] as any[]};
  const names=new Map((profileR.data||[]).map((p:any)=>[p.id,p.full_name||'Miembro']));
  const memberData=memberRows.map(x=>({...x,full_name:String(names.get(x.user_id)||'Miembro')}));
  const txData=(txR.data||[]) as unknown as Tx[];
  const txIds=txData.map(t=>t.id);
  const splitR=txIds.length?await supabase.from('transaction_splits').select('transaction_id,user_id,share_amount').in('transaction_id',txIds):{data:[]};
  setCategories((catR.data||[]) as Category[]);setTxs(txData);setAllocations((allocR.data||[]) as unknown as Allocation[]);
  setGoals((goalR.data||[]) as unknown as Goal[]);setContributions((contR.data||[]) as unknown as Contribution[]);setRecurring((recR.data||[]) as unknown as Recurring[]);
  setAccounts((accR.data||[]) as unknown as Account[]);setAccountTxs((accTxR.data||[]) as unknown as any[]);setMembers(memberData);setSplits((splitR.data||[]) as unknown as Split[]);
  setCurrentUser(userR.data.user?.id||'');
  const draft:Record<string,string>={};for(const c of (catR.data||[]) as Category[]){const a=((allocR.data||[]) as any[]).find(x=>x.category_id===c.id);draft[c.id]=a?String(Number(a.planned_amount)):'0'}setBudgetDraft(draft);
  const errors=[catR.error,txR.error,allocR.error,goalR.error,contR.error,recR.error,accR.error,memberR.error].filter(Boolean);
  if(errors.length)setMessage('No se pudo cargar toda la información financiera.');
  setLoading(false);
 }

 const totals=useMemo(()=>{
  const income=txs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const expense=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const saving=contributions.filter(c=>c.contribution_date>=monthBounds(month).start&&c.contribution_date<=monthBounds(month).end).reduce((s,c)=>s+Number(c.amount),0);
  const planned=allocations.reduce((s,a)=>s+Number(a.planned_amount),0);
  return{income,expense,saving,planned,available:income-expense-saving};
 },[txs,contributions,allocations,month]);

 const actualByCategory=useMemo(()=>{const map=new Map<string,number>();for(const t of txs){if(t.type==='expense'&&t.category_id)map.set(t.category_id,(map.get(t.category_id)||0)+Number(t.amount))}return map},[txs]);
 const allocationByCategory=useMemo(()=>new Map(allocations.map(a=>[a.category_id,Number(a.planned_amount)])),[allocations]);
 const categoryName=(id:string|null)=>categories.find(c=>c.id===id)?.name||'Sin categoría';
 const memberName=(id:string|null)=>members.find(m=>m.user_id===id)?.full_name||(id===currentUser?'Yo':'Miembro');
 const accountName=(id:string|null)=>accounts.find(a=>a.id===id)?.name||'Sin cuenta';

 const balances=useMemo(()=>{
  const map=new Map<string,number>();for(const m of members)map.set(m.user_id,0);
  for(const t of txs.filter(x=>x.type==='expense')){
   if(t.paid_by)map.set(t.paid_by,(map.get(t.paid_by)||0)+Number(t.amount));
  }
  for(const s of splits)map.set(s.user_id,(map.get(s.user_id)||0)-Number(s.share_amount));
  return members.map(m=>({...m,net:map.get(m.user_id)||0}));
 },[txs,splits,members]);

 const accountBalances=useMemo(()=>accounts.map(a=>{let balance=Number(a.opening_balance);for(const t of accountTxs.filter(x=>x.account_id===a.id))balance+=t.type==='income'?Number(t.amount):-Number(t.amount);return{...a,balance}}),[accounts,accountTxs]);

 async function addTransaction(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const type=String(f.get('type')) as 'income'|'expense',amount=Number(f.get('amount')),paidBy=String(f.get('paid_by')||currentUser),shareMode=String(f.get('share_mode')||'shared');
  const payload={household_id:household.id,description:String(f.get('description')).trim(),amount,type,transaction_date:String(f.get('date')),category_id:String(f.get('category_id')||'')||null,account_id:String(f.get('account_id')||'')||null,paid_by:paidBy||null,is_shared:shareMode==='shared',notes:String(f.get('notes')||'')||null};
  const {data,error}=await supabase.from('transactions').insert(payload).select('id').single();
  if(error||!data){setBusy(false);setMessage(error?.message||'No se pudo guardar el movimiento.');return}
  if(type==='expense'){
   const activeMembers=members.length?members:[{user_id:paidBy,role:'member',full_name:'Miembro'}];
   let rows:any[]=[];
   if(shareMode==='shared'&&activeMembers.length>1){
    const cents=Math.round(amount*100),base=Math.floor(cents/activeMembers.length),remainder=cents-base*activeMembers.length;
    rows=activeMembers.map((m,i)=>({transaction_id:data.id,household_id:household.id,user_id:m.user_id,share_amount:(base+(i===activeMembers.length-1?remainder:0))/100}));
   }else if(paidBy)rows=[{transaction_id:data.id,household_id:household.id,user_id:paidBy,share_amount:amount}];
   if(rows.length)await supabase.from('transaction_splits').insert(rows);
  }
  if(f.get('recurring')==='on')await supabase.from('recurring_transactions').insert({household_id:household.id,category_id:payload.category_id,account_id:payload.account_id,type,description:payload.description,amount,due_day:Number(f.get('due_day')||new Date(payload.transaction_date+'T12:00').getDate()),paid_by:paidBy||null,is_shared:shareMode==='shared'});
  setShowTxForm(false);setBusy(false);setMessage('Movimiento guardado.');await load();
 }

 async function saveBudget(){
  setBusy(true);setMessage('');const rows=categories.map(c=>({household_id:household.id,category_id:c.id,month:monthDate(month),planned_amount:Number(budgetDraft[c.id]||0)}));
  const {error}=await supabase.from('budget_allocations').upsert(rows,{onConflict:'household_id,category_id,month'});
  setBusy(false);setMessage(error?error.message:'Presupuesto mensual actualizado.');if(!error)await load();
 }

 async function addGoal(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);
  const {error}=await supabase.from('savings_goals').insert({household_id:household.id,name:String(f.get('name')).trim(),target_amount:Number(f.get('target_amount')),target_date:String(f.get('target_date')||'')||null});
  setBusy(false);setMessage(error?error.message:'Meta creada.');if(!error){setShowGoalForm(false);await load()}
 }
 async function contribute(goalId:string,amount:number){
  if(!amount||amount<=0)return;setBusy(true);const {error}=await supabase.from('goal_contributions').insert({goal_id:goalId,household_id:household.id,amount,contribution_date:isoDate()});setBusy(false);setMessage(error?error.message:'Aporte registrado.');if(!error)await load();
 }
 async function addAccount(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);
  const {error}=await supabase.from('finance_accounts').insert({household_id:household.id,name:String(f.get('name')).trim(),account_type:String(f.get('account_type')),opening_balance:Number(f.get('opening_balance')||0),owner_user_id:String(f.get('owner_user_id')||'')||null,is_shared:f.get('is_shared')==='on'});
  setBusy(false);setMessage(error?error.message:'Cuenta agregada.');if(!error){setShowAccountForm(false);await load()}
 }

 function moveMonth(delta:number){setMonth(m=>new Date(m.getFullYear(),m.getMonth()+delta,1))}

 if(loading)return <div className="finance-loading"><div className="loader"/></div>;

 return <section className="finance-v2">
  <div className="finance-top">
   <div><p className="eyebrow">FINANZAS DEL HOGAR</p><h2 className="page-title">Finanzas</h2><p className="muted">Presupuesto, movimientos, metas y aportes de la pareja.</p></div>
   <button className="finance-new" onClick={()=>setShowTxForm(true)}><Plus size={18}/> Movimiento</button>
  </div>

  <div className="month-switch"><button onClick={()=>moveMonth(-1)}><ArrowLeft size={18}/></button><strong>{monthLabel(month)}</strong><button onClick={()=>moveMonth(1)}><ArrowRight size={18}/></button></div>

  <div className="finance-tabs">
   <button className={tab==='summary'?'active':''} onClick={()=>setTab('summary')}>Resumen</button>
   <button className={tab==='budget'?'active':''} onClick={()=>setTab('budget')}>Presupuesto</button>
   <button className={tab==='transactions'?'active':''} onClick={()=>setTab('transactions')}>Movimientos</button>
   <button className={tab==='goals'?'active':''} onClick={()=>setTab('goals')}>Metas</button>
   <button className={tab==='accounts'?'active':''} onClick={()=>setTab('accounts')}>Cuentas</button>
  </div>

  {message&&<div className="finance-message">{message}<button onClick={()=>setMessage('')}><X size={15}/></button></div>}

  {tab==='summary'&&<>
   <div className="finance-kpis">
    <Kpi label="Ingresos" value={currency(totals.income)} icon={<ArrowDownLeft/>} tone="good"/>
    <Kpi label="Gastado" value={currency(totals.expense)} icon={<ArrowUpRight/>} tone="warn"/>
    <Kpi label="Ahorrado" value={currency(totals.saving)} icon={<PiggyBank/>} tone="save"/>
    <Kpi label="Disponible" value={currency(totals.available)} icon={<WalletCards/>} tone={totals.available>=0?'good':'bad'}/>
   </div>

   <div className="finance-panel">
    <div className="panel-heading"><div><span>Presupuesto utilizado</span><strong>{pct(totals.expense,totals.planned)}%</strong></div><small>{totals.planned?currency(totals.expense)+' de '+currency(totals.planned):'Define el presupuesto del mes'}</small></div>
    <Progress value={pct(totals.expense,totals.planned)}/>
   </div>

   <div className="finance-columns">
    <div className="finance-panel">
     <div className="panel-title"><h3>Distribución del hogar</h3><button onClick={()=>setTab('budget')}>Ver todo <ChevronRight size={16}/></button></div>
     <div className="budget-mini-head"><span>Categoría</span><span>Plan</span><span>Real</span></div>
     {categories.slice(0,6).map(c=><div className="budget-mini" key={c.id}><span>{c.name}</span><b>{currency(allocationByCategory.get(c.id)||0)}</b><b>{currency(actualByCategory.get(c.id)||0)}</b></div>)}
    </div>
    <div className="finance-panel">
     <div className="panel-title"><h3>Próximos pagos</h3><CalendarClock size={19}/></div>
     {recurring.length?recurring.slice(0,5).map(r=><div className="due-row" key={r.id}><span className="due-day">{r.due_day}</span><div><strong>{r.description}</strong><small>{categoryName(r.category_id)}</small></div><b>{currency(Number(r.amount))}</b></div>):<EmptyFinance text="Aún no hay pagos recurrentes. Márcalos al registrar un movimiento."/>}
    </div>
   </div>

   {members.length>1&&<div className="finance-panel">
    <div className="panel-title"><div><h3>Balance entre nosotros</h3><small>Basado en gastos compartidos de este mes.</small></div><Users size={20}/></div>
    <div className="couple-grid">{balances.map(b=><div className="couple-card" key={b.user_id}><span>{b.full_name}</span><strong className={b.net>=0?'positive':'negative'}>{b.net>=0?'+':''}{currency(b.net)}</strong><small>{b.net>0?'A favor':b.net<0?'Por compensar':'En equilibrio'}</small></div>)}</div>
   </div>}

   <div className="finance-panel">
    <div className="panel-title"><h3>Movimientos recientes</h3><button onClick={()=>setTab('transactions')}>Ver todos <ChevronRight size={16}/></button></div>
    <TransactionRows txs={txs.slice(0,6)} categoryName={categoryName} memberName={memberName}/>
   </div>
  </>}

  {tab==='budget'&&<div className="finance-panel">
   <div className="panel-title"><div><h3>Plan mensual</h3><small>Define cuánto quieren gastar en cada categoría.</small></div><b>{currency(categories.reduce((s,c)=>s+Number(budgetDraft[c.id]||0),0))}</b></div>
   <div className="budget-editor">
    {categories.map(c=>{const actual=actualByCategory.get(c.id)||0,planned=Number(budgetDraft[c.id]||0);return <div className="budget-edit-row" key={c.id}><div className="budget-cat"><span className="budget-dot"/><div><strong>{c.name}</strong><small>{currency(actual)} gastados · {pct(actual,planned)}%</small></div></div><input type="number" min="0" step="50" value={budgetDraft[c.id]??'0'} onChange={e=>setBudgetDraft({...budgetDraft,[c.id]:e.target.value})}/><Progress value={pct(actual,planned)}/></div>})}
   </div>
   <button className="finance-primary" disabled={busy} onClick={saveBudget}><Check size={17}/>{busy?'Guardando...':'Guardar presupuesto'}</button>
  </div>}

  {tab==='transactions'&&<div className="finance-panel">
   <div className="panel-title"><div><h3>Movimientos del mes</h3><small>{txs.length} registros</small></div><button className="mini-add" onClick={()=>setShowTxForm(true)}><Plus size={16}/> Agregar</button></div>
   <TransactionRows txs={txs} categoryName={categoryName} memberName={memberName}/>
   {!txs.length&&<EmptyFinance text="Todavía no hay movimientos en este mes."/>}
  </div>}

  {tab==='goals'&&<>
   <div className="finance-panel">
    <div className="panel-title"><div><h3>Metas de ahorro</h3><small>Casa, viajes, fondo de emergencia o cualquier proyecto.</small></div><button className="mini-add" onClick={()=>setShowGoalForm(true)}><Plus size={16}/> Nueva</button></div>
    <div className="goal-grid">{goals.map(g=>{const saved=contributions.filter(c=>c.goal_id===g.id).reduce((s,c)=>s+Number(c.amount),0);return <GoalCard key={g.id} goal={g} saved={saved} busy={busy} onContribute={contribute}/>})}</div>
    {!goals.length&&<EmptyFinance text="Crea la primera meta de ahorro del hogar."/>}
   </div>
  </>}

  {tab==='accounts'&&<div className="finance-panel">
   <div className="panel-title"><div><h3>Cuentas y medios</h3><small>Efectivo, banco, ahorro o tarjeta.</small></div><button className="mini-add" onClick={()=>setShowAccountForm(true)}><Plus size={16}/> Cuenta</button></div>
   <div className="account-grid">{accountBalances.map(a=><div className="account-card" key={a.id}><span className="account-icon">{a.account_type==='credit'?<CreditCard/>:<Landmark/>}</span><div><small>{accountTypeName(a.account_type)}</small><strong>{a.name}</strong><b>{currency(a.balance)}</b></div><em>{a.is_shared?'Compartida':'Personal'}</em></div>)}</div>
   {!accounts.length&&<EmptyFinance text="Agrega una cuenta para saber desde dónde sale y entra el dinero."/>}
  </div>}

  {showTxForm&&<Modal title="Nuevo movimiento" close={()=>setShowTxForm(false)}><form className="finance-form" onSubmit={addTransaction}>
   <div className="two"><label>Tipo<select name="type" defaultValue="expense"><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label><label>Monto<input name="amount" type="number" min=".01" step=".01" placeholder="0.00" required/></label></div>
   <label>Descripción<input name="description" placeholder="Ej. Supermercado" required/></label>
   <div className="two"><label>Categoría<select name="category_id"><option value="">Sin categoría</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Fecha<input name="date" type="date" defaultValue={isoDate()} required/></label></div>
   <div className="two"><label>Pagado por<select name="paid_by" defaultValue={currentUser}>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label><label>Cuenta<select name="account_id"><option value="">Sin cuenta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
   <label>¿De quién es?<select name="share_mode" defaultValue="shared"><option value="shared">Compartido entre el hogar</option><option value="personal">Personal de quien pagó</option></select></label>
   <label>Notas<input name="notes" placeholder="Opcional"/></label>
   <label className="check-line"><input type="checkbox" name="recurring"/> Repetir todos los meses</label>
   <label>Día de pago recurrente<input name="due_day" type="number" min="1" max="31" placeholder="Ej. 5"/></label>
   <button className="finance-primary" disabled={busy}>{busy?'Guardando...':'Guardar movimiento'}</button>
  </form></Modal>}

  {showGoalForm&&<Modal title="Nueva meta" close={()=>setShowGoalForm(false)}><form className="finance-form" onSubmit={addGoal}><label>Nombre<input name="name" placeholder="Ej. Fondo de emergencia" required/></label><label>Meta<input name="target_amount" type="number" min="1" step=".01" placeholder="50000" required/></label><label>Fecha objetivo<input name="target_date" type="date"/></label><button className="finance-primary" disabled={busy}>Crear meta</button></form></Modal>}

  {showAccountForm&&<Modal title="Nueva cuenta" close={()=>setShowAccountForm(false)}><form className="finance-form" onSubmit={addAccount}><label>Nombre<input name="name" placeholder="Ej. Cuenta principal" required/></label><div className="two"><label>Tipo<select name="account_type"><option value="checking">Cuenta bancaria</option><option value="savings">Ahorro</option><option value="cash">Efectivo</option><option value="credit">Tarjeta de crédito</option><option value="other">Otra</option></select></label><label>Saldo inicial<input name="opening_balance" type="number" step=".01" defaultValue="0"/></label></div><label>Propietario<select name="owner_user_id" defaultValue={currentUser}><option value="">Hogar</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label><label className="check-line"><input type="checkbox" name="is_shared" defaultChecked/> Cuenta compartida</label><button className="finance-primary" disabled={busy}>Agregar cuenta</button></form></Modal>}
 </section>
}

function Kpi({label,value,icon,tone}:{label:string;value:string;icon:any;tone:string}){return <div className={'finance-kpi '+tone}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>}
function Progress({value}:{value:number}){return <div className="progress"><span style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div>}
function EmptyFinance({text}:{text:string}){return <div className="finance-empty">{text}</div>}

function TransactionRows({txs,categoryName,memberName}:{txs:Tx[];categoryName:(x:string|null)=>string;memberName:(x:string|null)=>string}){
 return <div className="transaction-list">{txs.map(t=><div className="transaction-row" key={t.id}><span className={'transaction-icon '+t.type}>{t.type==='income'?<ArrowDownLeft/>:<ReceiptText/>}</span><div className="transaction-main"><strong>{t.description}</strong><small>{categoryName(t.category_id)} · {memberName(t.paid_by)}{t.is_shared?' · Compartido':''}</small></div><div className="transaction-value"><b className={t.type}>{t.type==='income'?'+':'−'}{currency(Number(t.amount))}</b><small>{new Date(t.transaction_date+'T12:00').toLocaleDateString('es-GT',{day:'2-digit',month:'short'})}</small></div></div>)}</div>
}

function GoalCard({goal,saved,busy,onContribute}:{goal:Goal;saved:number;busy:boolean;onContribute:(id:string,amount:number)=>void}){
 const [amount,setAmount]=useState('');const progress=pct(saved,Number(goal.target_amount));
 return <div className="goal-card"><div className="goal-head"><span><Target/></span><div><strong>{goal.name}</strong><small>{goal.target_date?'Meta '+new Date(goal.target_date+'T12:00').toLocaleDateString('es-GT'):'Sin fecha límite'}</small></div></div><div className="goal-amount"><strong>{currency(saved)}</strong><span>de {currency(Number(goal.target_amount))}</span></div><Progress value={progress}/><div className="goal-footer"><small>{progress}% completado</small><div><input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="1" placeholder="Aporte"/><button disabled={busy} onClick={()=>{onContribute(goal.id,Number(amount));setAmount('')}}>+</button></div></div></div>
}

function Modal({title,close,children}:{title:string;close:()=>void;children:any}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="finance-modal"><div className="modal-head"><h3>{title}</h3><button onClick={close}><X/></button></div>{children}</div></div>}
function accountTypeName(type:string){return({cash:'Efectivo',checking:'Banco',savings:'Ahorro',credit:'Tarjeta',other:'Otra'} as Record<string,string>)[type]||'Cuenta'}
