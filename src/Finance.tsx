import {FormEvent,useEffect,useMemo,useState} from 'react';
import {ArrowDownLeft,ArrowLeft,ArrowRight,ArrowUpRight,CalendarClock,Check,ChevronRight,CreditCard,Landmark,PiggyBank,Plus,ReceiptText,Target,Users,WalletCards,X} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type Category={id:string;name:string;icon:string};
type Tx={id:string;description:string;amount:number;type:'income'|'expense';transaction_date:string;category_id:string|null;paid_by:string|null;account_id:string|null;is_shared:boolean;notes:string|null};
type Allocation={id:string;category_id:string;planned_amount:number;month:string};
type Goal={id:string;name:string;target_amount:number;target_date:string|null;icon:string;active:boolean};
type Contribution={id:string;goal_id:string;amount:number;contribution_date:string;created_by:string|null};
type Recurring={id:string;description:string;amount:number;type:'income'|'expense';due_day:number;category_id:string|null;account_id:string|null;paid_by:string|null;is_shared:boolean;created_at:string};
type RecurringOccurrence={id:string;recurring_transaction_id:string;period_month:string;due_date:string;status:'pending'|'paid'|'skipped';paid_at:string|null;transaction_id:string|null};
type Account={id:string;name:string;account_type:string;opening_balance:number;owner_user_id:string|null;is_shared:boolean;active:boolean};
type Member={user_id:string;role:string;full_name:string};
type Split={transaction_id:string;user_id:string;share_amount:number};
type SplitMethod='equal'|'income'|'custom';
type MemberFinanceDraft={monthly_income:string;custom_share_percent:string};
type CategoryRuleMethod='inherit'|'equal'|'income'|'custom'|'personal';
type CategoryRuleDraft={split_method:CategoryRuleMethod;responsible_user_id:string};

const currency=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:0}).format(n||0);
const isoDate=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const monthDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
const monthBounds=(d:Date)=>{const start=new Date(d.getFullYear(),d.getMonth(),1),end=new Date(d.getFullYear(),d.getMonth()+1,0);return{start:isoDate(start),end:isoDate(end)}};
const monthLabel=(d:Date)=>d.toLocaleDateString('es-GT',{month:'long',year:'numeric'});
const pct=(a:number,b:number)=>b>0?Math.min(100,Math.round((a/b)*100)):0;
const dueDateForMonth=(d:Date,dueDay:number)=>{const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();return isoDate(new Date(d.getFullYear(),d.getMonth(),Math.min(Math.max(1,dueDay),last)))};

export default function Finance({household}:{household:Household}){
 const [tab,setTab]=useState<'summary'|'budget'|'transactions'|'recurring'|'contributions'|'goals'|'accounts'>('summary');
 const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [categories,setCategories]=useState<Category[]>([]),[txs,setTxs]=useState<Tx[]>([]),[allocations,setAllocations]=useState<Allocation[]>([]);
 const [goals,setGoals]=useState<Goal[]>([]),[contributions,setContributions]=useState<Contribution[]>([]),[recurring,setRecurring]=useState<Recurring[]>([]),[occurrences,setOccurrences]=useState<RecurringOccurrence[]>([]);
 const [accounts,setAccounts]=useState<Account[]>([]),[accountTxs,setAccountTxs]=useState<{account_id:string|null;type:string;amount:number}[]>([]);
 const [members,setMembers]=useState<Member[]>([]),[splits,setSplits]=useState<Split[]>([]),[currentUser,setCurrentUser]=useState('');
 const [showTxForm,setShowTxForm]=useState(false),[showGoalForm,setShowGoalForm]=useState(false),[showAccountForm,setShowAccountForm]=useState(false);
 const [budgetDraft,setBudgetDraft]=useState<Record<string,string>>({});
 const [splitMethod,setSplitMethod]=useState<SplitMethod>('equal');
 const [memberFinance,setMemberFinance]=useState<Record<string,MemberFinanceDraft>>({});
 const [categoryRules,setCategoryRules]=useState<Record<string,CategoryRuleDraft>>({});
 const [categoryCustom,setCategoryCustom]=useState<Record<string,Record<string,string>>>({});

 useEffect(()=>{load()},[household.id,month.getFullYear(),month.getMonth()]);

 async function load(){
  setLoading(true);setMessage('');
  await supabase.rpc('seed_finance_categories',{p_household_id:household.id});
  const bounds=monthBounds(month),m=monthDate(month);
  const userPromise=supabase.auth.getUser();
  const [catR,txR,allocR,goalR,contR,recR,accR,accTxR,memberR,financeSettingsR,memberFinanceR,categorySettingsR,categoryMemberR,userR]=await Promise.all([
   supabase.from('budget_categories').select('id,name,icon').eq('household_id',household.id).order('created_at'),
   supabase.from('transactions').select('id,description,amount,type,transaction_date,category_id,paid_by,account_id,is_shared,notes').eq('household_id',household.id).gte('transaction_date',bounds.start).lte('transaction_date',bounds.end).order('transaction_date',{ascending:false}).order('created_at',{ascending:false}),
   supabase.from('budget_allocations').select('id,category_id,planned_amount,month').eq('household_id',household.id).eq('month',m),
   supabase.from('savings_goals').select('id,name,target_amount,target_date,icon,active').eq('household_id',household.id).eq('active',true).order('created_at'),
   supabase.from('goal_contributions').select('id,goal_id,amount,contribution_date,created_by').eq('household_id',household.id),
   supabase.from('recurring_transactions').select('id,description,amount,type,due_day,category_id,account_id,paid_by,is_shared,created_at').eq('household_id',household.id).eq('active',true).order('due_day'),
   supabase.from('finance_accounts').select('id,name,account_type,opening_balance,owner_user_id,is_shared,active').eq('household_id',household.id).eq('active',true).order('created_at'),
   supabase.from('transactions').select('account_id,type,amount').eq('household_id',household.id).not('account_id','is',null),
   supabase.from('household_members').select('user_id,role').eq('household_id',household.id),
   supabase.from('finance_household_settings').select('household_id,split_method').eq('household_id',household.id).maybeSingle(),
   supabase.from('finance_member_settings').select('user_id,monthly_income,custom_share_percent').eq('household_id',household.id),
   supabase.from('finance_category_settings').select('category_id,split_method,responsible_user_id').eq('household_id',household.id),
   supabase.from('finance_category_member_settings').select('category_id,user_id,custom_share_percent').eq('household_id',household.id),
   userPromise
  ]);
  const memberRows=(memberR.data||[]) as {user_id:string;role:string}[];
  const ids=memberRows.map(x=>x.user_id);
  const profileR=ids.length?await supabase.from('profiles').select('id,full_name').in('id',ids):{data:[] as any[]};
  const names=new Map((profileR.data||[]).map((p:any)=>[p.id,p.full_name||'Miembro']));
  const memberData=memberRows.map(x=>({...x,full_name:String(names.get(x.user_id)||'Miembro')}));
  if(!financeSettingsR.data)await supabase.from('finance_household_settings').insert({household_id:household.id,split_method:'equal',updated_by:userR.data.user?.id||null});
  const financeRows=(memberFinanceR.data||[]) as any[];
  const missingMembers=memberRows.filter(m=>!financeRows.some(x=>x.user_id===m.user_id));
  if(missingMembers.length)await supabase.from('finance_member_settings').insert(missingMembers.map(m=>({household_id:household.id,user_id:m.user_id})));
  const financeDraft:Record<string,MemberFinanceDraft>={};
  for(const m of memberRows){const row=financeRows.find(x=>x.user_id===m.user_id);financeDraft[m.user_id]={monthly_income:String(Number(row?.monthly_income||0)),custom_share_percent:String(Number(row?.custom_share_percent||0))}}
  const categoryRuleDraft:Record<string,CategoryRuleDraft>={};
  for(const cat of (catR.data||[]) as Category[]){
   const row=((categorySettingsR.data||[]) as any[]).find(x=>x.category_id===cat.id);
   categoryRuleDraft[cat.id]={split_method:(row?.split_method||'inherit') as CategoryRuleMethod,responsible_user_id:String(row?.responsible_user_id||'')};
  }
  const categoryCustomDraft:Record<string,Record<string,string>>={};
  for(const cat of (catR.data||[]) as Category[]){
   categoryCustomDraft[cat.id]={};
   for(const m of memberRows){
    const row=((categoryMemberR.data||[]) as any[]).find(x=>x.category_id===cat.id&&x.user_id===m.user_id);
    categoryCustomDraft[cat.id][m.user_id]=String(Number(row?.custom_share_percent||0));
   }
  }
  const txData=(txR.data||[]) as unknown as Tx[];
  const txIds=txData.map(t=>t.id);
  const splitR=txIds.length?await supabase.from('transaction_splits').select('transaction_id,user_id,share_amount').in('transaction_id',txIds):{data:[]};
  const recurringRows=(recR.data||[]) as unknown as Recurring[];
  const occurrenceSeeds=recurringRows
   .filter(r=>m>=monthDate(new Date(r.created_at)))
   .map(r=>({recurring_transaction_id:r.id,household_id:household.id,period_month:m,due_date:dueDateForMonth(month,Number(r.due_day)),status:'pending'}));
  if(occurrenceSeeds.length)await supabase.from('recurring_transaction_occurrences').upsert(occurrenceSeeds,{onConflict:'recurring_transaction_id,period_month',ignoreDuplicates:true});
  const occurrenceR=await supabase.from('recurring_transaction_occurrences').select('id,recurring_transaction_id,period_month,due_date,status,paid_at,transaction_id').eq('household_id',household.id).eq('period_month',m).order('due_date');
  setCategories((catR.data||[]) as Category[]);setTxs(txData);setAllocations((allocR.data||[]) as unknown as Allocation[]);
  setGoals((goalR.data||[]) as unknown as Goal[]);setContributions((contR.data||[]) as unknown as Contribution[]);setRecurring((recR.data||[]) as unknown as Recurring[]);setOccurrences((occurrenceR.data||[]) as unknown as RecurringOccurrence[]);
  setAccounts((accR.data||[]) as unknown as Account[]);setAccountTxs((accTxR.data||[]) as unknown as any[]);setMembers(memberData);setSplits((splitR.data||[]) as unknown as Split[]);
  setSplitMethod(((financeSettingsR.data as any)?.split_method||'equal') as SplitMethod);setMemberFinance(financeDraft);setCategoryRules(categoryRuleDraft);setCategoryCustom(categoryCustomDraft);
  setCurrentUser(userR.data.user?.id||'');
  const draft:Record<string,string>={};for(const c of (catR.data||[]) as Category[]){const a=((allocR.data||[]) as any[]).find(x=>x.category_id===c.id);draft[c.id]=a?String(Number(a.planned_amount)):'0'}setBudgetDraft(draft);
  const errors=[catR.error,txR.error,allocR.error,goalR.error,contR.error,recR.error,accR.error,memberR.error,financeSettingsR.error,memberFinanceR.error,categorySettingsR.error,categoryMemberR.error,occurrenceR.error].filter(Boolean);
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

 const accountBalances=useMemo(()=>accounts.map(a=>{let balance=Number(a.opening_balance);for(const t of accountTxs.filter(x=>x.account_id===a.id))balance+=t.type==='income'?Number(t.amount):-Number(t.amount);return{...a,balance}}),[accounts,accountTxs]);

 const contributionRatios=useMemo(()=>{
  if(!members.length)return [] as {user_id:string;ratio:number}[];
  const equal=members.map(m=>({user_id:m.user_id,ratio:1/members.length}));
  if(splitMethod==='equal')return equal;
  if(splitMethod==='income'){
   const total=members.reduce((s,m)=>s+Number(memberFinance[m.user_id]?.monthly_income||0),0);
   return total>0?members.map(m=>({user_id:m.user_id,ratio:Number(memberFinance[m.user_id]?.monthly_income||0)/total})):equal;
  }
  const customTotal=members.reduce((s,m)=>s+Number(memberFinance[m.user_id]?.custom_share_percent||0),0);
  return customTotal>0?members.map(m=>({user_id:m.user_id,ratio:Number(memberFinance[m.user_id]?.custom_share_percent||0)/customTotal})):equal;
 },[members,memberFinance,splitMethod]);

 function ratiosForCategory(categoryId:string|null){
  if(!members.length)return [] as {user_id:string;ratio:number}[];
  const equal=members.map(m=>({user_id:m.user_id,ratio:1/members.length}));
  if(!categoryId)return contributionRatios;
  const rule=categoryRules[categoryId]||{split_method:'inherit' as CategoryRuleMethod,responsible_user_id:''};
  if(rule.split_method==='inherit')return contributionRatios;
  if(rule.split_method==='equal')return equal;
  if(rule.split_method==='income'){
   const total=members.reduce((s,m)=>s+Number(memberFinance[m.user_id]?.monthly_income||0),0);
   return total>0?members.map(m=>({user_id:m.user_id,ratio:Number(memberFinance[m.user_id]?.monthly_income||0)/total})):equal;
  }
  if(rule.split_method==='personal'){
   const target=rule.responsible_user_id||members[0]?.user_id;
   return members.map(m=>({user_id:m.user_id,ratio:m.user_id===target?1:0}));
  }
  const customTotal=members.reduce((s,m)=>s+Number(categoryCustom[categoryId]?.[m.user_id]||0),0);
  return customTotal>0?members.map(m=>({user_id:m.user_id,ratio:Number(categoryCustom[categoryId]?.[m.user_id]||0)/customTotal})):equal;
 }

 function makeSplitRows(transactionId:string,amount:number,paidBy:string,shared:boolean,categoryId:string|null){
  if(!shared||members.length<=1)return paidBy?[{transaction_id:transactionId,household_id:household.id,user_id:paidBy,share_amount:amount}]:[];
  const ratios=ratiosForCategory(categoryId),cents=Math.round(amount*100);let used=0;
  return ratios.map((r,i)=>{const share=i===ratios.length-1?cents-used:Math.floor(cents*r.ratio);used+=share;return{transaction_id:transactionId,household_id:household.id,user_id:r.user_id,share_amount:share/100}});
 }


 const recurringById=(id:string)=>recurring.find(r=>r.id===id);
 const occurrenceStatus=(o:RecurringOccurrence)=>o.status==='pending'&&o.due_date<isoDate()?'overdue':o.status;
 const recurringStats=useMemo(()=>occurrences.reduce((acc,o)=>{const s=occurrenceStatus(o);if(s==='paid')acc.paid++;else if(s==='skipped')acc.skipped++;else if(s==='overdue')acc.overdue++;else acc.pending++;return acc},{pending:0,paid:0,overdue:0,skipped:0}),[occurrences]);

 const contributionOverview=useMemo(()=>members.map(m=>{
  const ratio=contributionRatios.find(r=>r.user_id===m.user_id)?.ratio||0;
  const planned=categories.reduce((sum,cat)=>{
   const categoryPlan=allocationByCategory.get(cat.id)||0;
   const categoryRatio=ratiosForCategory(cat.id).find(r=>r.user_id===m.user_id)?.ratio||0;
   return sum+categoryPlan*categoryRatio;
  },0);
  const paid=txs.filter(t=>t.type==='expense'&&t.is_shared&&t.paid_by===m.user_id).reduce((s,t)=>s+Number(t.amount),0);
  const assigned=txs.filter(t=>t.type==='expense'&&t.is_shared).reduce((sum,t)=>{
   const r=ratiosForCategory(t.category_id).find(r=>r.user_id===m.user_id)?.ratio||0;
   return sum+Number(t.amount)*r;
  },0);
  return{...m,ratio,planned,paid,assigned,balance:paid-assigned};
 }),[members,contributionRatios,txs,totals.planned,allocations,categoryRules,categoryCustom,memberFinance]);

 async function saveContributionSettings(){
  setBusy(true);setMessage('');
  const totalIncome=members.reduce((s,m)=>s+Number(memberFinance[m.user_id]?.monthly_income||0),0);
  const customTotal=members.reduce((s,m)=>s+Number(memberFinance[m.user_id]?.custom_share_percent||0),0);
  if(splitMethod==='income'&&totalIncome<=0){setBusy(false);setMessage('Ingresa al menos un ingreso mensual para usar reparto proporcional.');return}
  if(splitMethod==='custom'&&Math.abs(customTotal-100)>.01){setBusy(false);setMessage('Los porcentajes personalizados deben sumar exactamente 100%.');return}
  const user=await supabase.auth.getUser();
  const {error:settingsError}=await supabase.from('finance_household_settings').upsert({household_id:household.id,split_method:splitMethod,updated_by:user.data.user?.id||null,updated_at:new Date().toISOString()},{onConflict:'household_id'});
  const memberRows=members.map(m=>({household_id:household.id,user_id:m.user_id,monthly_income:Number(memberFinance[m.user_id]?.monthly_income||0),custom_share_percent:Number(memberFinance[m.user_id]?.custom_share_percent||0),updated_at:new Date().toISOString()}));
  const {error:memberError}=await supabase.from('finance_member_settings').upsert(memberRows,{onConflict:'household_id,user_id'});
  if(settingsError||memberError){setBusy(false);setMessage(settingsError?.message||memberError?.message||'No se pudo guardar la distribución.');return}
  const sharedExpenses=txs.filter(t=>t.type==='expense'&&t.is_shared);
  if(sharedExpenses.length){
   const ids=sharedExpenses.map(t=>t.id);
   const {error:deleteError}=await supabase.from('transaction_splits').delete().in('transaction_id',ids);
   if(deleteError){setBusy(false);setMessage(deleteError.message);return}
   const rows=sharedExpenses.flatMap(t=>makeSplitRows(t.id,Number(t.amount),t.paid_by||'',true,t.category_id));
   if(rows.length){const {error:insertError}=await supabase.from('transaction_splits').insert(rows);if(insertError){setBusy(false);setMessage(insertError.message);return}}
  }
  setBusy(false);setMessage('Regla de aportes guardada y gastos compartidos del mes recalculados.');await load();
 }

 async function saveCategoryRules(){
  setBusy(true);setMessage('');
  for(const cat of categories){
   const rule=categoryRules[cat.id]||{split_method:'inherit' as CategoryRuleMethod,responsible_user_id:''};
   if(rule.split_method==='custom'){
    const total=members.reduce((s,m)=>s+Number(categoryCustom[cat.id]?.[m.user_id]||0),0);
    if(Math.abs(total-100)>.01){setBusy(false);setMessage(`${cat.name}: los porcentajes personalizados deben sumar 100%.`);return}
   }
   if(rule.split_method==='personal'&&!rule.responsible_user_id){setBusy(false);setMessage(`${cat.name}: selecciona quién cubre esta categoría.`);return}
  }
  const user=await supabase.auth.getUser();
  const ruleRows=categories.map(cat=>({household_id:household.id,category_id:cat.id,split_method:(categoryRules[cat.id]?.split_method||'inherit'),responsible_user_id:categoryRules[cat.id]?.split_method==='personal'?(categoryRules[cat.id]?.responsible_user_id||null):null,updated_by:user.data.user?.id||null,updated_at:new Date().toISOString()}));
  const {error:ruleError}=await supabase.from('finance_category_settings').upsert(ruleRows,{onConflict:'household_id,category_id'});
  if(ruleError){setBusy(false);setMessage(ruleError.message);return}
  const customRows=categories.flatMap(cat=>members.map(m=>({household_id:household.id,category_id:cat.id,user_id:m.user_id,custom_share_percent:Number(categoryCustom[cat.id]?.[m.user_id]||0),updated_at:new Date().toISOString()})));
  if(customRows.length){const {error:customError}=await supabase.from('finance_category_member_settings').upsert(customRows,{onConflict:'household_id,category_id,user_id'});if(customError){setBusy(false);setMessage(customError.message);return}}
  const sharedExpenses=txs.filter(t=>t.type==='expense'&&t.is_shared);
  if(sharedExpenses.length){
   const ids=sharedExpenses.map(t=>t.id);
   const {error:deleteError}=await supabase.from('transaction_splits').delete().in('transaction_id',ids);
   if(deleteError){setBusy(false);setMessage(deleteError.message);return}
   const rows=sharedExpenses.flatMap(t=>makeSplitRows(t.id,Number(t.amount),t.paid_by||'',true,t.category_id));
   if(rows.length){const {error:insertError}=await supabase.from('transaction_splits').insert(rows);if(insertError){setBusy(false);setMessage(insertError.message);return}}
  }
  setBusy(false);setMessage('Reglas por categoría guardadas y gastos compartidos del mes recalculados.');await load();
 }

 async function payRecurringOccurrence(occurrence:RecurringOccurrence){
  const recurringItem=recurringById(occurrence.recurring_transaction_id);
  if(!recurringItem||occurrence.status==='paid')return;
  setBusy(true);setMessage('');
  const paymentDate=isoDate();
  const payload={household_id:household.id,description:recurringItem.description,amount:Number(recurringItem.amount),type:recurringItem.type,transaction_date:paymentDate,category_id:recurringItem.category_id,account_id:recurringItem.account_id,paid_by:recurringItem.paid_by||currentUser||null,is_shared:recurringItem.is_shared,notes:`Pago recurrente · ${monthLabel(month)}`,recurring_transaction_id:recurringItem.id};
  const {data,error}=await supabase.from('transactions').insert(payload).select('id').single();
  if(error||!data){setBusy(false);setMessage(error?.message||'No se pudo registrar el pago.');return}
  if(recurringItem.type==='expense'){
   const rows=makeSplitRows(data.id,Number(recurringItem.amount),recurringItem.paid_by||currentUser||'',recurringItem.is_shared,recurringItem.category_id);
   if(rows.length){const {error:splitError}=await supabase.from('transaction_splits').insert(rows);if(splitError){setBusy(false);setMessage(splitError.message);return}}
  }
  const {error:updateError}=await supabase.from('recurring_transaction_occurrences').update({status:'paid',paid_at:new Date().toISOString(),transaction_id:data.id,updated_at:new Date().toISOString()}).eq('id',occurrence.id);
  setBusy(false);
  if(updateError){setMessage(updateError.message);return}
  setMessage('Pago recurrente registrado y movimiento creado.');await load();
 }

 async function skipRecurringOccurrence(occurrence:RecurringOccurrence){
  if(occurrence.status==='paid')return;
  setBusy(true);const {error}=await supabase.from('recurring_transaction_occurrences').update({status:'skipped',updated_at:new Date().toISOString()}).eq('id',occurrence.id);setBusy(false);
  setMessage(error?error.message:'Pago omitido para este mes.');if(!error)await load();
 }

 async function addTransaction(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const type=String(f.get('type')) as 'income'|'expense',amount=Number(f.get('amount')),paidBy=String(f.get('paid_by')||currentUser),shareMode=String(f.get('share_mode')||'shared');
  const payload={household_id:household.id,description:String(f.get('description')).trim(),amount,type,transaction_date:String(f.get('date')),category_id:String(f.get('category_id')||'')||null,account_id:String(f.get('account_id')||'')||null,paid_by:paidBy||null,is_shared:shareMode==='shared',notes:String(f.get('notes')||'')||null};
  const {data,error}=await supabase.from('transactions').insert(payload).select('id').single();
  if(error||!data){setBusy(false);setMessage(error?.message||'No se pudo guardar el movimiento.');return}
  if(type==='expense'){
   const rows=makeSplitRows(data.id,amount,paidBy,shareMode==='shared',payload.category_id);
   if(rows.length)await supabase.from('transaction_splits').insert(rows);
  }
  if(f.get('recurring')==='on'){
   const dueDay=Number(f.get('due_day')||new Date(payload.transaction_date+'T12:00').getDate());
   const {data:recurringCreated,error:recurringError}=await supabase.from('recurring_transactions').insert({household_id:household.id,category_id:payload.category_id,account_id:payload.account_id,type,description:payload.description,amount,due_day:dueDay,paid_by:paidBy||null,is_shared:shareMode==='shared'}).select('id').single();
   if(recurringCreated&&!recurringError){
    await supabase.from('transactions').update({recurring_transaction_id:recurringCreated.id}).eq('id',data.id);
    const paidMonth=new Date(payload.transaction_date+'T12:00');
    await supabase.from('recurring_transaction_occurrences').upsert({recurring_transaction_id:recurringCreated.id,household_id:household.id,period_month:monthDate(paidMonth),due_date:dueDateForMonth(paidMonth,dueDay),status:'paid',paid_at:new Date().toISOString(),transaction_id:data.id,updated_at:new Date().toISOString()},{onConflict:'recurring_transaction_id,period_month'});
   }
  }
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
   <button className={tab==='recurring'?'active':''} onClick={()=>setTab('recurring')}>Recurrentes</button>
   <button className={tab==='contributions'?'active':''} onClick={()=>setTab('contributions')}>Aportes</button>
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
     <div className="panel-title"><div><h3>Próximos pagos</h3><small>{recurringStats.overdue?recurringStats.overdue+' vencido(s)':'Control mensual de recurrentes'}</small></div><button onClick={()=>setTab('recurring')}>Ver todos <ChevronRight size={16}/></button></div>
     {occurrences.filter(o=>recurringById(o.recurring_transaction_id)?.type==='expense').length?occurrences.filter(o=>recurringById(o.recurring_transaction_id)?.type==='expense').slice(0,5).map(o=>{const r=recurringById(o.recurring_transaction_id)!;const status=occurrenceStatus(o);return <div className="due-row recurring-summary-row" key={o.id}><span className="due-day">{new Date(o.due_date+'T12:00').getDate()}</span><div><strong>{r.description}</strong><small>{categoryName(r.category_id)} · <span className={'status-text '+status}>{statusLabel(status)}</span></small></div><div className="due-actions"><b>{currency(Number(r.amount))}</b>{(status==='pending'||status==='overdue')&&<button disabled={busy} onClick={()=>payRecurringOccurrence(o)}>Pagar</button>}</div></div>}):<EmptyFinance text="Aún no hay pagos recurrentes. Márcalos al registrar un movimiento."/>}
    </div>
   </div>

   {members.length>1&&<div className="finance-panel">
    <div className="panel-title"><div><h3>Balance entre nosotros</h3><small>{splitMethodLabel(splitMethod)} · gastos compartidos de este mes.</small></div><button onClick={()=>setTab('contributions')}>Configurar <ChevronRight size={16}/></button></div>
    <div className="couple-grid">{contributionOverview.map(b=><div className="couple-card" key={b.user_id}><span>{b.full_name}</span><strong className={b.balance>=0?'positive':'negative'}>{b.balance>=0?'+':''}{currency(b.balance)}</strong><small>{b.balance>0?'A favor':b.balance<0?'Por compensar':'En equilibrio'}</small></div>)}</div>
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

  {tab==='recurring'&&<>
   <div className="recurring-kpis">
    <div><small>Pendientes</small><strong>{recurringStats.pending}</strong></div>
    <div><small>Pagados</small><strong>{recurringStats.paid}</strong></div>
    <div><small>Vencidos</small><strong>{recurringStats.overdue}</strong></div>
   </div>
   <div className="finance-panel recurring-panel">
    <div className="panel-title"><div><h3>Pagos recurrentes</h3><small>Marca cada compromiso como pagado y el movimiento se crea automáticamente.</small></div><CalendarClock size={20}/></div>
    <div className="recurring-list">
     {occurrences.map(o=>{const r=recurringById(o.recurring_transaction_id);if(!r)return null;const status=occurrenceStatus(o);return <div className="recurring-row" key={o.id}>
      <div className={'recurring-date '+status}><span>{new Date(o.due_date+'T12:00').toLocaleDateString('es-GT',{day:'2-digit'})}</span><small>{new Date(o.due_date+'T12:00').toLocaleDateString('es-GT',{month:'short'})}</small></div>
      <div className="recurring-main"><div><strong>{r.description}</strong><small>{categoryName(r.category_id)} · {r.is_shared?'Compartido':'Personal'} · {accountName(r.account_id)}</small></div><span className={'status-pill '+status}>{statusLabel(status)}</span></div>
      <div className="recurring-amount"><strong>{r.type==='income'?'+':'−'}{currency(Number(r.amount))}</strong><small>{r.type==='income'?'Ingreso':'Gasto'}</small></div>
      <div className="recurring-actions">{(status==='pending'||status==='overdue')&&<><button className="pay" disabled={busy} onClick={()=>payRecurringOccurrence(o)}><Check size={15}/> Pagado</button><button className="skip" disabled={busy} onClick={()=>skipRecurringOccurrence(o)}>Omitir</button></>}{status==='paid'&&<span className="paid-note"><Check size={15}/> Registrado</span>}{status==='skipped'&&<span className="skipped-note">Omitido</span>}</div>
     </div>})}
    </div>
    {!occurrences.length&&<EmptyFinance text="Todavía no hay compromisos recurrentes para este mes."/>}
   </div>
  </>}

  {tab==='contributions'&&<div className="contribution-layout">
   <div className="finance-panel">
    <div className="panel-title"><div><h3>Cómo dividimos los gastos</h3><small>Esta regla se usa automáticamente en cada gasto marcado como compartido.</small></div><Users size={20}/></div>
    <div className="split-methods">
     <button className={splitMethod==='equal'?'active':''} onClick={()=>setSplitMethod('equal')}><strong>Partes iguales</strong><span>{members.length===2?'50 / 50':'Mismo porcentaje para todos'}</span></button>
     <button className={splitMethod==='income'?'active':''} onClick={()=>setSplitMethod('income')}><strong>Según ingresos</strong><span>Quien gana más aporta proporcionalmente más</span></button>
     <button className={splitMethod==='custom'?'active':''} onClick={()=>setSplitMethod('custom')}><strong>Personalizado</strong><span>Ustedes deciden el porcentaje de cada uno</span></button>
    </div>
   </div>

   <div className="finance-panel">
    <div className="panel-title"><div><h3>Integrantes y aportes</h3><small>{splitMethod==='income'?'Ingresa el ingreso mensual de referencia.':splitMethod==='custom'?'Los porcentajes deben sumar 100%.':'La división se calcula automáticamente.'}</small></div><b>{Math.round(contributionRatios.reduce((s,r)=>s+r.ratio,0)*100)}%</b></div>
    <div className="member-contribution-editor">
     {members.map(m=>{const ratio=contributionRatios.find(r=>r.user_id===m.user_id)?.ratio||0;return <div className="member-contribution-row" key={m.user_id}>
      <div className="member-ident"><span>{m.full_name.slice(0,1).toUpperCase()}</span><div><strong>{m.full_name}</strong><small>{Math.round(ratio*1000)/10}% del gasto compartido</small></div></div>
      {splitMethod==='income'&&<label>Ingreso mensual<input type="number" min="0" step="100" value={memberFinance[m.user_id]?.monthly_income||'0'} onChange={e=>setMemberFinance({...memberFinance,[m.user_id]:{...(memberFinance[m.user_id]||{monthly_income:'0',custom_share_percent:'0'}),monthly_income:e.target.value}})}/></label>}
      {splitMethod==='custom'&&<label>Porcentaje<input type="number" min="0" max="100" step=".1" value={memberFinance[m.user_id]?.custom_share_percent||'0'} onChange={e=>setMemberFinance({...memberFinance,[m.user_id]:{...(memberFinance[m.user_id]||{monthly_income:'0',custom_share_percent:'0'}),custom_share_percent:e.target.value}})}/></label>}
      {splitMethod==='equal'&&<div className="equal-share">{Math.round(ratio*1000)/10}%</div>}
     </div>})}
    </div>
    <button className="finance-primary" disabled={busy||members.length<2} onClick={saveContributionSettings}><Check size={17}/>{busy?'Guardando...':'Guardar regla de aportes'}</button>
   </div>

   <div className="finance-panel contribution-plan">
    <div className="contribution-plan-title"><h3>Plan de aportes del mes</h3><small>Calculado sobre el presupuesto mensual configurado y las reglas por categoría.</small><strong>{currency(totals.planned)}</strong></div>
    <div className="contribution-table-head"><span>Persona</span><span>% base</span><span>Plan</span><span>Pagó</span><span>Balance</span></div>
    {contributionOverview.map(m=><div className="contribution-table-row" key={m.user_id}><span>{m.full_name}</span><b>{Math.round(m.ratio*1000)/10}%</b><b>{currency(m.planned)}</b><b>{currency(m.paid)}</b><b className={m.balance>=0?'positive':'negative'}>{m.balance>=0?'+':''}{currency(m.balance)}</b></div>)}
    {!totals.planned&&<div className="finance-note">Configura el presupuesto del mes para ver cuánto debería aportar cada persona al plan.</div>}
   </div>

   <div className="finance-panel category-rule-panel">
    <div className="panel-title"><div><h3>Reglas por categoría</h3><small>Una categoría puede usar la regla general o tener su propia distribución.</small></div></div>
    <div className="category-rule-list">
     {categories.map(cat=>{const rule=categoryRules[cat.id]||{split_method:'inherit' as CategoryRuleMethod,responsible_user_id:''};return <div className="category-rule-card" key={cat.id}>
      <div className="category-rule-main"><div><strong>{cat.name}</strong><small>{categoryRuleLabel(rule.split_method,splitMethod)}</small></div>
       <select value={rule.split_method} onChange={e=>setCategoryRules({...categoryRules,[cat.id]:{...rule,split_method:e.target.value as CategoryRuleMethod}})}>
        <option value="inherit">Usar regla general</option><option value="equal">Partes iguales</option><option value="income">Según ingresos</option><option value="custom">Personalizado</option><option value="personal">Una persona cubre 100%</option>
       </select>
      </div>
      {rule.split_method==='personal'&&<div className="category-rule-detail"><label>Responsable<select value={rule.responsible_user_id} onChange={e=>setCategoryRules({...categoryRules,[cat.id]:{...rule,responsible_user_id:e.target.value}})}><option value="">Seleccionar</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label></div>}
      {rule.split_method==='custom'&&<div className="category-custom-grid">{members.map(m=><label key={m.user_id}>{m.full_name}<div><input type="number" min="0" max="100" step=".1" value={categoryCustom[cat.id]?.[m.user_id]||'0'} onChange={e=>setCategoryCustom({...categoryCustom,[cat.id]:{...(categoryCustom[cat.id]||{}),[m.user_id]:e.target.value}})}/><span>%</span></div></label>)}</div>}
     </div>})}
    </div>
    <button className="finance-primary" disabled={busy||members.length<1} onClick={saveCategoryRules}><Check size={17}/>{busy?'Guardando...':'Guardar reglas por categoría'}</button>
   </div>
  </div>}

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
   <label>¿De quién es?<select name="share_mode" defaultValue="shared"><option value="shared">Compartido · {splitMethodLabel(splitMethod)}</option><option value="personal">Personal de quien pagó</option></select></label>
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
function statusLabel(status:string){return status==='paid'?'Pagado':status==='overdue'?'Vencido':status==='skipped'?'Omitido':'Pendiente'}
function splitMethodLabel(method:SplitMethod){return method==='income'?'Proporcional a ingresos':method==='custom'?'Porcentaje personalizado':'Partes iguales'}
function categoryRuleLabel(method:CategoryRuleMethod,globalMethod:SplitMethod){return method==='inherit'?`General · ${splitMethodLabel(globalMethod)}`:method==='equal'?'Partes iguales':method==='income'?'Según ingresos':method==='custom'?'Porcentaje personalizado':'Una persona cubre 100%'}
function accountTypeName(type:string){return({cash:'Efectivo',checking:'Banco',savings:'Ahorro',credit:'Tarjeta',other:'Otra'} as Record<string,string>)[type]||'Cuenta'}
