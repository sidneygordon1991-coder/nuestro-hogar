import {FormEvent,useEffect,useMemo,useState} from 'react';
import {AlertTriangle,ArrowDownLeft,ArrowLeft,ArrowRight,ArrowRightLeft,ArrowUpRight,BarChart3,Building2,CalendarClock,Car,Check,ChevronRight,CircleDollarSign,Copy,CreditCard,Gauge,Gem,GraduationCap,HeartPulse,Home,Landmark,Pencil,Plane,PiggyBank,Plus,ReceiptText,ShoppingCart,Sparkles,Target,Trash2,TrendingDown,TrendingUp,Users,WalletCards,X} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type BudgetGroup='fixed'|'variable'|'saving';
type Category={id:string;name:string;icon:string;budget_group:BudgetGroup};
type Tx={id:string;description:string;amount:number;type:'income'|'expense';transaction_date:string;category_id:string|null;paid_by:string|null;account_id:string|null;is_shared:boolean;notes:string|null;recurring_transaction_id:string|null};
type Allocation={id:string;category_id:string;planned_amount:number;month:string};
type Goal={id:string;name:string;target_amount:number;target_date:string|null;icon:string;active:boolean};
type Contribution={id:string;goal_id:string;amount:number;contribution_date:string;created_by:string|null};
type Recurring={id:string;description:string;amount:number;type:'income'|'expense';due_day:number;category_id:string|null;account_id:string|null;paid_by:string|null;is_shared:boolean;created_at:string};
type RecurringOccurrence={id:string;recurring_transaction_id:string;period_month:string;due_date:string;status:'pending'|'paid'|'skipped';paid_at:string|null;transaction_id:string|null};
type AccountClass='asset'|'liability';
type Account={id:string;name:string;account_type:string;account_class:AccountClass;opening_balance:number;owner_user_id:string|null;is_shared:boolean;active:boolean;institution:string|null;credit_limit:number|null;statement_day:number|null;payment_due_day:number|null;apr:number|null;minimum_payment:number|null;notes:string|null};
type Transfer={id:string;from_account_id:string;to_account_id:string;amount:number;transfer_date:string;description:string|null};
type FinanceAsset={id:string;name:string;asset_type:'property'|'vehicle'|'investment'|'valuable'|'other';estimated_value:number;purchase_value:number|null;owner_user_id:string|null;is_shared:boolean;notes:string|null;active:boolean};
type NetWorthSnapshot={snapshot_date:string;account_assets:number;manual_assets:number;liabilities:number;net_worth:number};
type Member={user_id:string;role:string;full_name:string};
type Split={transaction_id:string;user_id:string;share_amount:number};
type SplitMethod='equal'|'income'|'custom';
type MemberFinanceDraft={monthly_income:string;custom_share_percent:string};
type CategoryRuleMethod='inherit'|'equal'|'income'|'custom'|'personal';
type CategoryRuleDraft={split_method:CategoryRuleMethod;responsible_user_id:string};
type HistoryTx={amount:number;type:'income'|'expense';transaction_date:string;category_id:string|null};
type HistoryContribution={amount:number;contribution_date:string};
type HistoryAllocation={planned_amount:number;month:string;category_id:string};
type MonthMetric={key:string;label:string;income:number;expense:number;saving:number;budget:number;balance:number;savingRate:number};

const currency=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:0}).format(n||0);
const isoDate=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const monthDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
const monthBounds=(d:Date)=>{const start=new Date(d.getFullYear(),d.getMonth(),1),end=new Date(d.getFullYear(),d.getMonth()+1,0);return{start:isoDate(start),end:isoDate(end)}};
const monthLabel=(d:Date)=>d.toLocaleDateString('es-GT',{month:'long',year:'numeric'});
const pct=(a:number,b:number)=>b>0?Math.min(100,Math.round((a/b)*100)):0;
const dueDateForMonth=(d:Date,dueDay:number)=>{const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();return isoDate(new Date(d.getFullYear(),d.getMonth(),Math.min(Math.max(1,dueDay),last)))};

export default function Finance({household}:{household:Household}){
 const [tab,setTab]=useState<'summary'|'budget'|'transactions'|'recurring'|'comparison'|'contributions'|'goals'|'networth'|'accounts'>('summary');
 const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [categories,setCategories]=useState<Category[]>([]),[txs,setTxs]=useState<Tx[]>([]),[allocations,setAllocations]=useState<Allocation[]>([]);
 const [goals,setGoals]=useState<Goal[]>([]),[contributions,setContributions]=useState<Contribution[]>([]),[recurring,setRecurring]=useState<Recurring[]>([]),[occurrences,setOccurrences]=useState<RecurringOccurrence[]>([]);
 const [accounts,setAccounts]=useState<Account[]>([]),[accountTxs,setAccountTxs]=useState<{account_id:string|null;type:string;amount:number}[]>([]);
 const [transfers,setTransfers]=useState<Transfer[]>([]),[assets,setAssets]=useState<FinanceAsset[]>([]),[netWorthSnapshots,setNetWorthSnapshots]=useState<NetWorthSnapshot[]>([]);
 const [members,setMembers]=useState<Member[]>([]),[splits,setSplits]=useState<Split[]>([]),[currentUser,setCurrentUser]=useState('');
 const [showTxForm,setShowTxForm]=useState(false),[editingTx,setEditingTx]=useState<Tx|null>(null),[showGoalForm,setShowGoalForm]=useState(false),[showAccountForm,setShowAccountForm]=useState(false),[editingAccount,setEditingAccount]=useState<Account|null>(null),[showAssetForm,setShowAssetForm]=useState(false),[editingAsset,setEditingAsset]=useState<FinanceAsset|null>(null),[showTransferForm,setShowTransferForm]=useState(false),[showCategoryForm,setShowCategoryForm]=useState(false);
 const [budgetDraft,setBudgetDraft]=useState<Record<string,string>>({});
 const [categoryGroupDraft,setCategoryGroupDraft]=useState<Record<string,BudgetGroup>>({});
 const [splitMethod,setSplitMethod]=useState<SplitMethod>('equal');
 const [memberFinance,setMemberFinance]=useState<Record<string,MemberFinanceDraft>>({});
 const [categoryRules,setCategoryRules]=useState<Record<string,CategoryRuleDraft>>({});
 const [categoryCustom,setCategoryCustom]=useState<Record<string,Record<string,string>>>({});
 const [historyTxs,setHistoryTxs]=useState<HistoryTx[]>([]),[historyContributions,setHistoryContributions]=useState<HistoryContribution[]>([]),[historyAllocations,setHistoryAllocations]=useState<HistoryAllocation[]>([]),[comparisonRange,setComparisonRange]=useState<3|6|12>(6);

 useEffect(()=>{load()},[household.id,month.getFullYear(),month.getMonth()]);

 async function load(){
  setLoading(true);setMessage('');
  await supabase.rpc('seed_finance_categories',{p_household_id:household.id});
  await supabase.rpc('refresh_my_net_worth_snapshot',{p_household_id:household.id});
  const bounds=monthBounds(month),m=monthDate(month);
  const historyStartDate=new Date(month.getFullYear(),month.getMonth()-11,1),historyStart=isoDate(historyStartDate),historyStartMonth=monthDate(historyStartDate);
  const userPromise=supabase.auth.getUser();
  const [catR,txR,allocR,goalR,contR,recR,accR,accTxR,transferR,assetR,netWorthR,memberR,financeSettingsR,memberFinanceR,categorySettingsR,categoryMemberR,historyTxR,historyContR,historyAllocR,userR]=await Promise.all([
   supabase.from('budget_categories').select('id,name,icon,budget_group').eq('household_id',household.id).order('created_at'),
   supabase.from('transactions').select('id,description,amount,type,transaction_date,category_id,paid_by,account_id,is_shared,notes,recurring_transaction_id').eq('household_id',household.id).gte('transaction_date',bounds.start).lte('transaction_date',bounds.end).order('transaction_date',{ascending:false}).order('created_at',{ascending:false}),
   supabase.from('budget_allocations').select('id,category_id,planned_amount,month').eq('household_id',household.id).eq('month',m),
   supabase.from('savings_goals').select('id,name,target_amount,target_date,icon,active').eq('household_id',household.id).eq('active',true).order('created_at'),
   supabase.from('goal_contributions').select('id,goal_id,amount,contribution_date,created_by').eq('household_id',household.id),
   supabase.from('recurring_transactions').select('id,description,amount,type,due_day,category_id,account_id,paid_by,is_shared,created_at').eq('household_id',household.id).eq('active',true).order('due_day'),
   supabase.from('finance_accounts').select('id,name,account_type,account_class,opening_balance,owner_user_id,is_shared,active,institution,credit_limit,statement_day,payment_due_day,apr,minimum_payment,notes').eq('household_id',household.id).eq('active',true).order('created_at'),
   supabase.from('transactions').select('account_id,type,amount').eq('household_id',household.id).not('account_id','is',null),
   supabase.from('finance_transfers').select('id,from_account_id,to_account_id,amount,transfer_date,description').eq('household_id',household.id).order('transfer_date',{ascending:false}).order('created_at',{ascending:false}),
   supabase.from('finance_assets').select('id,name,asset_type,estimated_value,purchase_value,owner_user_id,is_shared,notes,active').eq('household_id',household.id).eq('active',true).order('created_at'),
   supabase.from('finance_net_worth_snapshots').select('snapshot_date,account_assets,manual_assets,liabilities,net_worth').eq('household_id',household.id).order('snapshot_date').limit(365),
   supabase.from('household_members').select('user_id,role').eq('household_id',household.id),
   supabase.from('finance_household_settings').select('household_id,split_method').eq('household_id',household.id).maybeSingle(),
   supabase.from('finance_member_settings').select('user_id,monthly_income,custom_share_percent').eq('household_id',household.id),
   supabase.from('finance_category_settings').select('category_id,split_method,responsible_user_id').eq('household_id',household.id),
   supabase.from('finance_category_member_settings').select('category_id,user_id,custom_share_percent').eq('household_id',household.id),
   supabase.from('transactions').select('amount,type,transaction_date,category_id').eq('household_id',household.id).gte('transaction_date',historyStart).lte('transaction_date',bounds.end),
   supabase.from('goal_contributions').select('amount,contribution_date').eq('household_id',household.id).gte('contribution_date',historyStart).lte('contribution_date',bounds.end),
   supabase.from('budget_allocations').select('planned_amount,month,category_id').eq('household_id',household.id).gte('month',historyStartMonth).lte('month',m),
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
  const occurrenceR=await supabase.from('recurring_transaction_occurrences').select('id,recurring_transaction_id,period_month,due_date,status,paid_at,transaction_id').eq('household_id',household.id).eq('period_month',m).order('due_date');
  setCategories((catR.data||[]) as Category[]);setTxs(txData);setAllocations((allocR.data||[]) as unknown as Allocation[]);
  setGoals((goalR.data||[]) as unknown as Goal[]);setContributions((contR.data||[]) as unknown as Contribution[]);setRecurring((recR.data||[]) as unknown as Recurring[]);setOccurrences((occurrenceR.data||[]) as unknown as RecurringOccurrence[]);
  setAccounts((accR.data||[]) as unknown as Account[]);setAccountTxs((accTxR.data||[]) as unknown as any[]);setTransfers((transferR.data||[]) as unknown as Transfer[]);setAssets((assetR.data||[]) as unknown as FinanceAsset[]);setNetWorthSnapshots((netWorthR.data||[]) as unknown as NetWorthSnapshot[]);setMembers(memberData);setSplits((splitR.data||[]) as unknown as Split[]);
  setSplitMethod(((financeSettingsR.data as any)?.split_method||'equal') as SplitMethod);setMemberFinance(financeDraft);setCategoryRules(categoryRuleDraft);setCategoryCustom(categoryCustomDraft);
  setCurrentUser(userR.data.user?.id||'');
  setHistoryTxs((historyTxR.data||[]) as unknown as HistoryTx[]);setHistoryContributions((historyContR.data||[]) as unknown as HistoryContribution[]);setHistoryAllocations((historyAllocR.data||[]) as unknown as HistoryAllocation[]);
  const draft:Record<string,string>={};const groupDraft:Record<string,BudgetGroup>={};
  for(const c of (catR.data||[]) as Category[]){
   const a=((allocR.data||[]) as any[]).find(x=>x.category_id===c.id);
   draft[c.id]=a?String(Number(a.planned_amount)):'0';
   groupDraft[c.id]=(c.budget_group||'variable') as BudgetGroup;
  }
  setBudgetDraft(draft);setCategoryGroupDraft(groupDraft);
  const errors=[catR.error,txR.error,allocR.error,goalR.error,contR.error,recR.error,accR.error,transferR.error,assetR.error,netWorthR.error,memberR.error,financeSettingsR.error,memberFinanceR.error,categorySettingsR.error,categoryMemberR.error,historyTxR.error,historyContR.error,historyAllocR.error,occurrenceR.error].filter(Boolean);
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

 const accountBalances=useMemo(()=>accounts.map(a=>{
  let balance=Number(a.opening_balance);
  for(const t of accountTxs.filter(x=>x.account_id===a.id)){
   const amount=Number(t.amount);
   if(a.account_class==='asset')balance+=t.type==='income'?amount:-amount;
   else balance+=t.type==='expense'?amount:-amount;
  }
  for(const transfer of transfers){
   const amount=Number(transfer.amount);
   if(transfer.from_account_id===a.id)balance+=a.account_class==='asset'?-amount:amount;
   if(transfer.to_account_id===a.id)balance+=a.account_class==='asset'?amount:-amount;
  }
  return{...a,balance};
 }),[accounts,accountTxs,transfers]);

 const patrimony=useMemo(()=>{
  const accountAssets=accountBalances.filter(a=>a.account_class==='asset').reduce((sum,a)=>sum+Number(a.balance),0);
  const manualAssets=assets.reduce((sum,a)=>sum+Number(a.estimated_value),0);
  const liabilities=accountBalances.filter(a=>a.account_class==='liability').reduce((sum,a)=>sum+Math.max(0,Number(a.balance)),0);
  const liquidAssets=accountBalances.filter(a=>a.account_class==='asset'&&['cash','checking','savings'].includes(a.account_type)).reduce((sum,a)=>sum+Number(a.balance),0);
  const netWorth=accountAssets+manualAssets-liabilities;
  const debtRatio=accountAssets+manualAssets>0?liabilities/(accountAssets+manualAssets)*100:liabilities>0?100:0;
  const creditUsed=accountBalances.filter(a=>a.account_type==='credit').reduce((sum,a)=>sum+Math.max(0,Number(a.balance)),0);
  const creditLimit=accountBalances.filter(a=>a.account_type==='credit').reduce((sum,a)=>sum+Number(a.credit_limit||0),0);
  return{accountAssets,manualAssets,totalAssets:accountAssets+manualAssets,liabilities,liquidAssets,netWorth,debtRatio,creditUsed,creditLimit,creditUtilization:creditLimit>0?creditUsed/creditLimit*100:0};
 },[accountBalances,assets]);

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

 const smartBudget=useMemo(()=>{
  const configuredIncome=members.reduce((sum,m)=>sum+Number(memberFinance[m.user_id]?.monthly_income||0),0);
  const plannedIncome=configuredIncome>0?configuredIncome:totals.income;
  const expectedIncomeRemaining=Math.max(plannedIncome-totals.income,0);
  const groupFor=(id:string|null):BudgetGroup=>id?(categoryGroupDraft[id]||categories.find(cat=>cat.id===id)?.budget_group||'variable'):'variable';
  let plannedFixed=0,spentFixed=0,plannedVariable=0,spentVariable=0,plannedSaving=0;
  const fixedRemainingByCategory=new Map<string,number>();
  for(const cat of categories){
   const group=groupFor(cat.id),planned=allocationByCategory.get(cat.id)||0,actual=actualByCategory.get(cat.id)||0;
   if(group==='fixed'){plannedFixed+=planned;spentFixed+=actual;fixedRemainingByCategory.set(cat.id,Math.max(planned-actual,0))}
   else if(group==='saving')plannedSaving+=planned;
   else{plannedVariable+=planned;spentVariable+=actual}
  }
  const pendingByCategory=new Map<string,number>();let pendingRecurringAmount=0,pendingOutsideFixed=0;
  for(const o of occurrences){
   const status=occurrenceStatus(o),r=recurringById(o.recurring_transaction_id);
   if(!r||r.type!=='expense'||(status!=='pending'&&status!=='overdue'))continue;
   const amount=Number(r.amount);pendingRecurringAmount+=amount;
   if(r.category_id)pendingByCategory.set(r.category_id,(pendingByCategory.get(r.category_id)||0)+amount);
   if(groupFor(r.category_id)!=='fixed')pendingOutsideFixed+=amount;
  }
  let fixedCommitments=0;
  for(const cat of categories.filter(cat=>groupFor(cat.id)==='fixed')){
   fixedCommitments+=Math.max(fixedRemainingByCategory.get(cat.id)||0,pendingByCategory.get(cat.id)||0);
  }
  fixedCommitments+=pendingOutsideFixed;
  const variableRemaining=categories.filter(cat=>groupFor(cat.id)==='variable').reduce((sum,cat)=>sum+Math.max((allocationByCategory.get(cat.id)||0)-(actualByCategory.get(cat.id)||0),0),0);
  const savingsRemaining=Math.max(plannedSaving-totals.saving,0);
  const availableAfterCommitments=totals.available-fixedCommitments-savingsRemaining;
  const projectedClose=totals.available+expectedIncomeRemaining-fixedCommitments-savingsRemaining-variableRemaining;
  const health=projectedClose<0?'risk':projectedClose<Math.max(plannedIncome*.08,500)?'watch':'good';
  return{plannedIncome,expectedIncomeRemaining,plannedFixed,spentFixed,plannedVariable,spentVariable,plannedSaving,actualSaving:totals.saving,pendingRecurringAmount,fixedCommitments,variableRemaining,savingsRemaining,availableAfterCommitments,projectedClose,health};
 },[members,memberFinance,totals,categories,categoryGroupDraft,allocations,txs,occurrences,recurring]);

 const monthlyMetrics=useMemo(()=>{
  const rows:MonthMetric[]=[];
  for(let offset=comparisonRange-1;offset>=0;offset--){
   const d=new Date(month.getFullYear(),month.getMonth()-offset,1),key=monthDate(d),bounds=monthBounds(d);
   const income=historyTxs.filter(t=>t.transaction_date>=bounds.start&&t.transaction_date<=bounds.end&&t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
   const expense=historyTxs.filter(t=>t.transaction_date>=bounds.start&&t.transaction_date<=bounds.end&&t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
   const saving=historyContributions.filter(x=>x.contribution_date>=bounds.start&&x.contribution_date<=bounds.end).reduce((s,x)=>s+Number(x.amount),0);
   const budget=historyAllocations.filter(x=>x.month===key).reduce((s,x)=>s+Number(x.planned_amount),0);
   rows.push({key,label:d.toLocaleDateString('es-GT',{month:'short'}).replace('.',''),income,expense,saving,budget,balance:income-expense-saving,savingRate:income>0?saving/income*100:0});
  }
  return rows;
 },[historyTxs,historyContributions,historyAllocations,month,comparisonRange]);

 const currentMetric=monthlyMetrics[monthlyMetrics.length-1]||{income:0,expense:0,saving:0,budget:0,balance:0,savingRate:0} as MonthMetric;
 const previousMetric=monthlyMetrics[monthlyMetrics.length-2]||{income:0,expense:0,saving:0,budget:0,balance:0,savingRate:0} as MonthMetric;
 const metricDelta=(current:number,previous:number)=>previous===0?(current===0?0:100):((current-previous)/Math.abs(previous))*100;

 const categoryComparison=useMemo(()=>{
  const currentBounds=monthBounds(month),previousDate=new Date(month.getFullYear(),month.getMonth()-1,1),previousBounds=monthBounds(previousDate);
  return categories.map(cat=>{
   const current=historyTxs.filter(t=>t.type==='expense'&&t.category_id===cat.id&&t.transaction_date>=currentBounds.start&&t.transaction_date<=currentBounds.end).reduce((s,t)=>s+Number(t.amount),0);
   const previous=historyTxs.filter(t=>t.type==='expense'&&t.category_id===cat.id&&t.transaction_date>=previousBounds.start&&t.transaction_date<=previousBounds.end).reduce((s,t)=>s+Number(t.amount),0);
   return{id:cat.id,name:cat.name,current,previous,delta:metricDelta(current,previous)};
  }).filter(x=>x.current>0||x.previous>0).sort((a,b)=>Math.max(b.current,b.previous)-Math.max(a.current,a.previous)).slice(0,8);
 },[categories,historyTxs,month]);

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
  setBusy(true);setMessage('');
  const rows=categories.map(cat=>({household_id:household.id,category_id:cat.id,month:monthDate(month),planned_amount:Number(budgetDraft[cat.id]||0)}));
  const {error}=await supabase.from('budget_allocations').upsert(rows,{onConflict:'household_id,category_id,month'});
  const groupResults=await Promise.all(categories.map(cat=>supabase.from('budget_categories').update({budget_group:categoryGroupDraft[cat.id]||cat.budget_group||'variable'}).eq('id',cat.id).eq('household_id',household.id)));
  const groupError=groupResults.find(result=>result.error)?.error;
  setBusy(false);
  setMessage(error||groupError?(error?.message||groupError?.message||'No se pudo guardar el presupuesto.'):'Presupuesto mensual actualizado.');
  if(!error&&!groupError)await load();
 }

 async function copyPreviousBudget(){
  setBusy(true);setMessage('');
  const previous=new Date(month.getFullYear(),month.getMonth()-1,1);
  const {data,error}=await supabase.from('budget_allocations').select('category_id,planned_amount').eq('household_id',household.id).eq('month',monthDate(previous));
  if(error){setBusy(false);setMessage(error.message);return}
  if(!data?.length){setBusy(false);setMessage('El mes anterior no tiene un presupuesto guardado para copiar.');return}
  const rows=data.map(a=>({household_id:household.id,category_id:a.category_id,month:monthDate(month),planned_amount:Number(a.planned_amount)}));
  const {error:upsertError}=await supabase.from('budget_allocations').upsert(rows,{onConflict:'household_id,category_id,month'});
  setBusy(false);setMessage(upsertError?upsertError.message:'Presupuesto del mes anterior copiado.');if(!upsertError)await load();
 }

 async function addCategory(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const name=String(f.get('name')||'').trim(),group=String(f.get('budget_group')||'variable') as BudgetGroup;
  const {error}=await supabase.from('budget_categories').insert({household_id:household.id,name,icon:'wallet',monthly_limit:0,budget_group:group});
  setBusy(false);setMessage(error?error.message:'Categoría creada.');if(!error){setShowCategoryForm(false);await load()}
 }

 async function editTransaction(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!editingTx)return;setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const type=String(f.get('type')) as 'income'|'expense',amount=Number(f.get('amount')),paidBy=String(f.get('paid_by')||currentUser),shareMode=String(f.get('share_mode')||'shared');
  const payload={description:String(f.get('description')).trim(),amount,type,transaction_date:String(f.get('date')),category_id:String(f.get('category_id')||'')||null,account_id:String(f.get('account_id')||'')||null,paid_by:paidBy||null,is_shared:shareMode==='shared',notes:String(f.get('notes')||'')||null};
  const {error}=await supabase.from('transactions').update(payload).eq('id',editingTx.id).eq('household_id',household.id);
  if(error){setBusy(false);setMessage(error.message);return}
  await supabase.from('transaction_splits').delete().eq('transaction_id',editingTx.id);
  if(type==='expense'){
   const rows=makeSplitRows(editingTx.id,amount,paidBy,shareMode==='shared',payload.category_id);
   if(rows.length){const {error:splitError}=await supabase.from('transaction_splits').insert(rows);if(splitError){setBusy(false);setMessage(splitError.message);return}}
  }
  if(editingTx.recurring_transaction_id&&f.get('update_recurring')==='on'){
   const linked=recurringById(editingTx.recurring_transaction_id);
   const dueDay=Number(f.get('due_day')||linked?.due_day||new Date(payload.transaction_date+'T12:00').getDate());
   const {error:recurringError}=await supabase.from('recurring_transactions').update({category_id:payload.category_id,account_id:payload.account_id,type,description:payload.description,amount,due_day:dueDay,paid_by:paidBy||null,is_shared:shareMode==='shared'}).eq('id',editingTx.recurring_transaction_id).eq('household_id',household.id);
   if(recurringError){setBusy(false);setMessage(recurringError.message);return}
  }
  setBusy(false);setEditingTx(null);setMessage(editingTx.recurring_transaction_id&&f.get('update_recurring')==='on'?'Movimiento y recurrencia actualizados.':'Movimiento actualizado.');await load();
 }

 async function deleteTransaction(tx:Tx){
  if(!window.confirm('¿Eliminar este movimiento? Esta acción actualizará los saldos y el presupuesto.'))return;
  setBusy(true);setMessage('');
  if(tx.recurring_transaction_id){
   await supabase.from('recurring_transaction_occurrences').update({status:'pending',paid_at:null,transaction_id:null,updated_at:new Date().toISOString()}).eq('transaction_id',tx.id);
  }
  const {error}=await supabase.from('transactions').delete().eq('id',tx.id).eq('household_id',household.id);
  setBusy(false);setMessage(error?error.message:'Movimiento eliminado.');if(!error)await load();
 }

 async function addGoal(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);
  const {error}=await supabase.from('savings_goals').insert({household_id:household.id,name:String(f.get('name')).trim(),target_amount:Number(f.get('target_amount')),target_date:String(f.get('target_date')||'')||null});
  setBusy(false);setMessage(error?error.message:'Meta creada.');if(!error){setShowGoalForm(false);await load()}
 }
 async function contribute(goalId:string,amount:number){
  if(!amount||amount<=0)return;setBusy(true);const {error}=await supabase.from('goal_contributions').insert({goal_id:goalId,household_id:household.id,amount,contribution_date:isoDate()});setBusy(false);setMessage(error?error.message:'Aporte registrado.');if(!error)await load();
 }
 async function saveAccount(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const form=new FormData(e.currentTarget);
  const accountType=String(form.get('account_type')||'checking');
  const forcedClass:AccountClass=['credit','loan','mortgage'].includes(accountType)?'liability':['cash','checking','savings','investment'].includes(accountType)?'asset':String(form.get('account_class')||'asset') as AccountClass;
  const payload={
   household_id:household.id,
   name:String(form.get('name')||'').trim(),
   account_type:accountType,
   account_class:forcedClass,
   opening_balance:Number(form.get('opening_balance')||0),
   owner_user_id:String(form.get('owner_user_id')||'')||null,
   is_shared:form.get('is_shared')==='on',
   institution:String(form.get('institution')||'').trim()||null,
   credit_limit:String(form.get('credit_limit')||'')?Number(form.get('credit_limit')):null,
   statement_day:String(form.get('statement_day')||'')?Number(form.get('statement_day')):null,
   payment_due_day:String(form.get('payment_due_day')||'')?Number(form.get('payment_due_day')):null,
   apr:String(form.get('apr')||'')?Number(form.get('apr')):null,
   minimum_payment:String(form.get('minimum_payment')||'')?Number(form.get('minimum_payment')):null,
   notes:String(form.get('notes')||'').trim()||null,
   updated_at:new Date().toISOString()
  };
  const result=editingAccount
   ?await supabase.from('finance_accounts').update(payload).eq('id',editingAccount.id).eq('household_id',household.id)
   :await supabase.from('finance_accounts').insert(payload);
  setBusy(false);setMessage(result.error?result.error.message:editingAccount?'Cuenta actualizada.':'Cuenta agregada.');
  if(!result.error){setShowAccountForm(false);setEditingAccount(null);await supabase.rpc('refresh_my_net_worth_snapshot',{p_household_id:household.id});await load()}
 }

 async function archiveAccount(account:Account){
  if(!window.confirm('¿Archivar esta cuenta? Los movimientos históricos se conservarán.'))return;
  setBusy(true);const {error}=await supabase.from('finance_accounts').update({active:false,updated_at:new Date().toISOString()}).eq('id',account.id).eq('household_id',household.id);
  setBusy(false);setMessage(error?error.message:'Cuenta archivada.');if(!error){await supabase.rpc('refresh_my_net_worth_snapshot',{p_household_id:household.id});await load()}
 }

 async function saveAsset(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const form=new FormData(e.currentTarget);
  const payload={household_id:household.id,name:String(form.get('name')||'').trim(),asset_type:String(form.get('asset_type')||'other'),estimated_value:Number(form.get('estimated_value')||0),purchase_value:String(form.get('purchase_value')||'')?Number(form.get('purchase_value')):null,owner_user_id:String(form.get('owner_user_id')||'')||null,is_shared:form.get('is_shared')==='on',notes:String(form.get('notes')||'').trim()||null,updated_at:new Date().toISOString()};
  const result=editingAsset
   ?await supabase.from('finance_assets').update(payload).eq('id',editingAsset.id).eq('household_id',household.id)
   :await supabase.from('finance_assets').insert(payload);
  setBusy(false);setMessage(result.error?result.error.message:editingAsset?'Activo actualizado.':'Activo agregado.');
  if(!result.error){setShowAssetForm(false);setEditingAsset(null);await supabase.rpc('refresh_my_net_worth_snapshot',{p_household_id:household.id});await load()}
 }

 async function deleteAsset(asset:FinanceAsset){
  if(!window.confirm('¿Eliminar este activo del patrimonio?'))return;
  setBusy(true);const {error}=await supabase.from('finance_assets').delete().eq('id',asset.id).eq('household_id',household.id);
  setBusy(false);setMessage(error?error.message:'Activo eliminado.');if(!error){await supabase.rpc('refresh_my_net_worth_snapshot',{p_household_id:household.id});await load()}
 }

 async function addTransfer(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');const form=new FormData(e.currentTarget);
  const from=String(form.get('from_account_id')||''),to=String(form.get('to_account_id')||'');
  if(!from||!to||from===to){setBusy(false);setMessage('Selecciona dos cuentas diferentes.');return}
  const {error}=await supabase.from('finance_transfers').insert({household_id:household.id,from_account_id:from,to_account_id:to,amount:Number(form.get('amount')||0),transfer_date:String(form.get('transfer_date')||isoDate()),description:String(form.get('description')||'').trim()||null});
  setBusy(false);setMessage(error?error.message:'Transferencia registrada.');if(!error){setShowTransferForm(false);await supabase.rpc('refresh_my_net_worth_snapshot',{p_household_id:household.id});await load()}
 }

 async function deleteTransfer(transfer:Transfer){
  if(!window.confirm('¿Eliminar esta transferencia?'))return;
  setBusy(true);const {error}=await supabase.from('finance_transfers').delete().eq('id',transfer.id).eq('household_id',household.id);
  setBusy(false);setMessage(error?error.message:'Transferencia eliminada.');if(!error){await supabase.rpc('refresh_my_net_worth_snapshot',{p_household_id:household.id});await load()}
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
   <button className={tab==='comparison'?'active':''} onClick={()=>setTab('comparison')}>Comparación</button>
   <button className={tab==='contributions'?'active':''} onClick={()=>setTab('contributions')}>Aportes</button>
   <button className={tab==='goals'?'active':''} onClick={()=>setTab('goals')}>Metas</button>
   <button className={tab==='networth'?'active':''} onClick={()=>setTab('networth')}>Patrimonio</button>
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

   <div className={'finance-panel projection-panel '+smartBudget.health}>
    <div className="projection-head"><div><p className="eyebrow">PROYECCIÓN DEL MES</p><h3>Dinero realmente disponible</h3><small>Considera pagos fijos pendientes, ahorro planificado y el presupuesto que aún falta por usar.</small></div><span className={'projection-health '+smartBudget.health}>{smartBudget.health==='good'?<TrendingUp/>:<AlertTriangle/>}{smartBudget.health==='good'?'Saludable':smartBudget.health==='watch'?'Ajustado':'En riesgo'}</span></div>
    <div className="projection-grid">
     <div><small>Disponible hoy</small><strong>{currency(totals.available)}</strong></div>
     <div><small>Compromisos por cubrir</small><strong>{currency(smartBudget.fixedCommitments)}</strong></div>
     <div><small>Ahorro pendiente</small><strong>{currency(smartBudget.savingsRemaining)}</strong></div>
     <div className="projection-highlight"><small>Libre después de compromisos</small><strong>{currency(smartBudget.availableAfterCommitments)}</strong></div>
    </div>
    <div className="projection-footer"><span>Ingreso aún esperado <b>+{currency(smartBudget.expectedIncomeRemaining)}</b></span><span>Variables por usar <b>−{currency(smartBudget.variableRemaining)}</b></span><span>Cierre estimado <b className={smartBudget.projectedClose>=0?'positive':'negative'}>{currency(smartBudget.projectedClose)}</b></span></div>
    <div className="projection-insight">{smartBudget.health==='risk'?'El plan actual terminaría aproximadamente '+currency(Math.abs(smartBudget.projectedClose))+' por encima de lo disponible.':smartBudget.health==='watch'?'El mes está equilibrado, pero queda poco margen libre si se usa todo el presupuesto previsto.':'Si mantienen este plan, el mes cerraría con aproximadamente '+currency(smartBudget.projectedClose)+' disponibles.'}</div>
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

   <div className="finance-panel comparison-preview">
    <div className="panel-title"><div><h3>Tendencia financiera</h3><small>Ingresos, gastos y ahorro de los últimos {Math.min(6,monthlyMetrics.length)} meses.</small></div><button onClick={()=>setTab('comparison')}>Comparar <ChevronRight size={16}/></button></div>
    <MonthlyBars data={monthlyMetrics.slice(-6)}/>
   </div>

   <div className="finance-panel">
    <div className="panel-title"><h3>Movimientos recientes</h3><button onClick={()=>setTab('transactions')}>Ver todos <ChevronRight size={16}/></button></div>
    <TransactionRows txs={txs.slice(0,6)} categoryName={categoryName} memberName={memberName} onEdit={setEditingTx} onDelete={deleteTransaction}/>
   </div>
  </>}

  {tab==='budget'&&<>
   <div className="budget-group-summary">
    <div className="fixed"><small>Gastos fijos</small><strong>{currency(smartBudget.plannedFixed)}</strong><span>{currency(smartBudget.spentFixed)} usados</span></div>
    <div className="variable"><small>Gastos variables</small><strong>{currency(smartBudget.plannedVariable)}</strong><span>{currency(smartBudget.spentVariable)} usados</span></div>
    <div className="saving"><small>Ahorro</small><strong>{currency(smartBudget.plannedSaving)}</strong><span>{currency(smartBudget.actualSaving)} aportados</span></div>
   </div>
   <div className="finance-panel">
    <div className="panel-title budget-plan-head"><div><h3>Plan mensual</h3><small>Clasifica cada categoría para mejorar la proyección del mes.</small></div><div className="budget-head-actions"><button className="secondary-action" onClick={()=>setShowCategoryForm(true)}><Plus size={15}/> Categoría</button><button className="secondary-action" disabled={busy} onClick={copyPreviousBudget}><Copy size={15}/> Copiar mes anterior</button><b>{currency(categories.reduce((sum,cat)=>sum+Number(budgetDraft[cat.id]||0),0))}</b></div></div>
    <div className="budget-editor">
     {categories.map(cat=>{const actual=actualByCategory.get(cat.id)||0,planned=Number(budgetDraft[cat.id]||0),group=categoryGroupDraft[cat.id]||cat.budget_group||'variable',progressValue=group==='saving'?totals.saving:actual;return <div className={'budget-edit-row smart '+group} key={cat.id}><div className="budget-cat"><span className="budget-dot"/><div><strong>{cat.name}</strong><small>{group==='saving'?currency(totals.saving)+' aportados':currency(actual)+' gastados'} · {pct(progressValue,planned)}%</small></div></div><div className="budget-controls"><select value={group} onChange={e=>setCategoryGroupDraft({...categoryGroupDraft,[cat.id]:e.target.value as BudgetGroup})}><option value="fixed">Fijo</option><option value="variable">Variable</option><option value="saving">Ahorro</option></select><input type="number" min="0" step="50" value={budgetDraft[cat.id]??'0'} onChange={e=>setBudgetDraft({...budgetDraft,[cat.id]:e.target.value})}/></div><Progress value={pct(progressValue,planned)}/></div>})}
    </div>
    <button className="finance-primary" disabled={busy} onClick={saveBudget}><Check size={17}/>{busy?'Guardando...':'Guardar presupuesto'}</button>
   </div>
  </>}
  {tab==='transactions'&&<div className="finance-panel">
   <div className="panel-title"><div><h3>Movimientos del mes</h3><small>{txs.length} registros</small></div><button className="mini-add" onClick={()=>setShowTxForm(true)}><Plus size={16}/> Agregar</button></div>
   <TransactionRows txs={txs} categoryName={categoryName} memberName={memberName} onEdit={setEditingTx} onDelete={deleteTransaction}/>
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

  {tab==='comparison'&&<>
   <div className="comparison-head">
    <div><p className="eyebrow">EVOLUCIÓN FINANCIERA</p><h3>Comparación entre meses</h3><p>Analiza ingresos, gastos, ahorro, balance y presupuesto para detectar tendencias.</p></div>
    <div className="range-switch">{([3,6,12] as const).map(value=><button className={comparisonRange===value?'active':''} key={value} onClick={()=>setComparisonRange(value)}>{value} meses</button>)}</div>
   </div>

   <div className="comparison-kpis">
    <ComparisonKpi label="Ingresos" value={currentMetric.income} delta={metricDelta(currentMetric.income,previousMetric.income)} goodWhenUp/>
    <ComparisonKpi label="Gastos" value={currentMetric.expense} delta={metricDelta(currentMetric.expense,previousMetric.expense)} goodWhenUp={false}/>
    <ComparisonKpi label="Ahorro" value={currentMetric.saving} delta={metricDelta(currentMetric.saving,previousMetric.saving)} goodWhenUp/>
    <ComparisonKpi label="Balance" value={currentMetric.balance} delta={metricDelta(currentMetric.balance,previousMetric.balance)} goodWhenUp/>
   </div>

   <div className="finance-panel">
    <div className="panel-title"><div><h3>Ingresos vs gastos vs ahorro</h3><small>{comparisonRange} meses terminando en {monthLabel(month)}.</small></div><BarChart3 size={19}/></div>
    <MonthlyBars data={monthlyMetrics}/>
   </div>

   <div className="finance-columns comparison-columns">
    <div className="finance-panel">
     <div className="panel-title"><div><h3>Balance mensual</h3><small>Lo que queda después de gastos y ahorro.</small></div></div>
     <BalanceChart data={monthlyMetrics}/>
    </div>
    <div className="finance-panel">
     <div className="panel-title"><div><h3>Tasa de ahorro</h3><small>Porcentaje del ingreso destinado a metas.</small></div><strong>{Math.round(currentMetric.savingRate)}%</strong></div>
     <SavingsRateChart data={monthlyMetrics}/>
    </div>
   </div>

   <div className="finance-panel">
    <div className="panel-title"><div><h3>Categorías: este mes vs anterior</h3><small>Top categorías con movimiento en cualquiera de los dos meses.</small></div></div>
    <CategoryComparison rows={categoryComparison}/>
   </div>

   <div className="finance-panel comparison-table-panel">
    <div className="panel-title"><div><h3>Detalle mensual</h3><small>Resumen completo del periodo seleccionado.</small></div></div>
    <div className="comparison-table">
     <div className="comparison-table-head"><span>Mes</span><span>Ingresos</span><span>Gastos</span><span>Ahorro</span><span>Balance</span><span>Presupuesto</span></div>
     {monthlyMetrics.map(row=><div className="comparison-table-row" key={row.key}><strong>{row.label}</strong><span>{currency(row.income)}</span><span>{currency(row.expense)}</span><span>{currency(row.saving)}</span><span className={row.balance>=0?'positive':'negative'}>{currency(row.balance)}</span><span>{currency(row.budget)}</span></div>)}
    </div>
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

  {tab==='networth'&&<>
   <div className={'net-worth-hero '+(patrimony.netWorth<0?'negative':'')}>
    <div><p className="eyebrow">PATRIMONIO NETO</p><h3>{currency(patrimony.netWorth)}</h3><p>Activos y cuentas menos deudas. Se actualiza automáticamente con movimientos y transferencias.</p></div>
    <span className="net-worth-icon"><CircleDollarSign/></span>
   </div>
   <div className="net-worth-kpis">
    <div><span className="asset"><TrendingUp/></span><small>Activos totales</small><strong>{currency(patrimony.totalAssets)}</strong><em>{currency(patrimony.liquidAssets)} líquidos</em></div>
    <div><span className="liability"><TrendingDown/></span><small>Deudas</small><strong>{currency(patrimony.liabilities)}</strong><em>{patrimony.debtRatio.toFixed(1)}% de activos</em></div>
    <div><span className="credit"><Gauge/></span><small>Uso de crédito</small><strong>{patrimony.creditLimit?Math.round(patrimony.creditUtilization)+'%':'—'}</strong><em>{patrimony.creditLimit?currency(patrimony.creditUsed)+' de '+currency(patrimony.creditLimit):'Sin límites configurados'}</em></div>
    <div><span className="manual"><Gem/></span><small>Bienes registrados</small><strong>{currency(patrimony.manualAssets)}</strong><em>{assets.length} activo{assets.length===1?'':'s'}</em></div>
   </div>

   <div className="finance-panel">
    <div className="panel-title"><div><h3>Evolución del patrimonio</h3><small>Se guarda una fotografía diaria para construir el histórico real.</small></div><BarChart3 size={18}/></div>
    <NetWorthChart data={netWorthSnapshots}/>
   </div>

   <div className="finance-columns patrimony-columns">
    <div className="finance-panel">
     <div className="panel-title"><div><h3>Activos financieros</h3><small>Cuentas, efectivo, ahorro e inversiones.</small></div><button onClick={()=>{setEditingAccount(null);setShowAccountForm(true)}}><Plus size={15}/> Cuenta</button></div>
     <div className="wealth-list">{accountBalances.filter(a=>a.account_class==='asset').map(a=><div className="wealth-row" key={a.id}><span>{accountIcon(a.account_type)}</span><div><strong>{a.name}</strong><small>{a.institution||accountTypeName(a.account_type)} · {a.is_shared?'Compartida':'Personal'}</small></div><b>{currency(a.balance)}</b></div>)}</div>
     {!accountBalances.some(a=>a.account_class==='asset')&&<EmptyFinance text="Agrega una cuenta o inversión para comenzar a medir tus activos."/>}
    </div>
    <div className="finance-panel">
     <div className="panel-title"><div><h3>Deudas y tarjetas</h3><small>Saldo pendiente, utilización y próximas fechas.</small></div><button onClick={()=>{setEditingAccount(null);setShowAccountForm(true)}}><Plus size={15}/> Deuda</button></div>
     <div className="wealth-list">{accountBalances.filter(a=>a.account_class==='liability').map(a=><div className="debt-summary-row" key={a.id}><div className="wealth-row"><span>{accountIcon(a.account_type)}</span><div><strong>{a.name}</strong><small>{a.institution||accountTypeName(a.account_type)}{a.payment_due_day?' · paga día '+a.payment_due_day:''}</small></div><b>{currency(Math.max(0,a.balance))}</b></div>{a.account_type==='credit'&&a.credit_limit?<div className="debt-utilization"><div><span>Utilización</span><strong>{Math.round(Math.max(0,a.balance)/Number(a.credit_limit)*100)}%</strong></div><Progress value={Math.max(0,a.balance)/Number(a.credit_limit)*100}/><small>{currency(Math.max(0,Number(a.credit_limit)-Math.max(0,a.balance)))} disponible</small></div>:null}</div>)}</div>
     {!accountBalances.some(a=>a.account_class==='liability')&&<EmptyFinance text="Agrega tarjetas, préstamos o hipotecas para ver tu deuda total."/>}
    </div>
   </div>

   <div className="finance-panel">
    <div className="panel-title"><div><h3>Bienes y otros activos</h3><small>Casa, vehículo, inversiones externas y objetos de valor.</small></div><button className="mini-add" onClick={()=>{setEditingAsset(null);setShowAssetForm(true)}}><Plus size={15}/> Activo</button></div>
    <div className="asset-grid">{assets.map(asset=><article className="asset-card" key={asset.id}><span className={'asset-type-icon '+asset.asset_type}>{assetIcon(asset.asset_type)}</span><div><small>{assetTypeName(asset.asset_type)}</small><strong>{asset.name}</strong><b>{currency(Number(asset.estimated_value))}</b><em>{asset.is_shared?'Del hogar':memberName(asset.owner_user_id)}</em></div><div className="asset-actions"><button onClick={()=>{setEditingAsset(asset);setShowAssetForm(true)}}><Pencil/></button><button onClick={()=>deleteAsset(asset)}><Trash2/></button></div></article>)}</div>
    {!assets.length&&<EmptyFinance text="Registra bienes para tener una visión completa del patrimonio del hogar."/>}
   </div>
  </>}

  {tab==='accounts'&&<>
   <div className="account-toolbar">
    <div><p className="eyebrow">CUENTAS Y DEUDAS</p><h3>Dinero, crédito y transferencias</h3><p>Los pagos entre cuentas no se contabilizan como gasto doble.</p></div>
    <div><button className="secondary-action" onClick={()=>setShowTransferForm(true)} disabled={accounts.length<2}><ArrowRightLeft/> Transferir / pagar deuda</button><button className="finance-new" onClick={()=>{setEditingAccount(null);setShowAccountForm(true)}}><Plus/> Cuenta</button></div>
   </div>
   <div className="account-grid advanced">{accountBalances.map(a=><article className={'account-card advanced '+a.account_class} key={a.id}>
    <span className="account-icon">{accountIcon(a.account_type)}</span>
    <div className="account-card-copy"><small>{accountTypeName(a.account_type)}{a.institution?' · '+a.institution:''}</small><strong>{a.name}</strong><b>{currency(a.account_class==='liability'?Math.max(0,a.balance):a.balance)}</b><em>{a.is_shared?'Compartida':'Personal'}{a.owner_user_id?' · '+memberName(a.owner_user_id):''}</em></div>
    <div className="account-card-actions"><button title="Editar" onClick={()=>{setEditingAccount(a);setShowAccountForm(true)}}><Pencil/></button><button title="Archivar" onClick={()=>archiveAccount(a)}><Trash2/></button></div>
    {a.account_class==='liability'&&<div className="account-debt-details">{a.credit_limit?<div><span>Límite</span><b>{currency(Number(a.credit_limit))}</b></div>:null}{a.statement_day?<div><span>Corte</span><b>Día {a.statement_day}</b></div>:null}{a.payment_due_day?<div><span>Pago</span><b>Día {a.payment_due_day}</b></div>:null}{a.minimum_payment?<div><span>Mínimo</span><b>{currency(Number(a.minimum_payment))}</b></div>:null}{a.apr!=null?<div><span>Tasa</span><b>{Number(a.apr).toFixed(2)}%</b></div>:null}</div>}
    {a.account_type==='credit'&&a.credit_limit?<div className="account-utilization"><div><span>Utilización</span><b>{Math.round(Math.max(0,a.balance)/Number(a.credit_limit)*100)}%</b></div><Progress value={Math.max(0,a.balance)/Number(a.credit_limit)*100}/></div>:null}
   </article>)}</div>
   {!accounts.length&&<EmptyFinance text="Agrega cuentas, tarjetas o préstamos para controlar de dónde sale el dinero y cuánto debes."/>}

   <div className="finance-panel transfer-history">
    <div className="panel-title"><div><h3>Transferencias y pagos de deuda</h3><small>Mover dinero entre cuentas no altera tus ingresos o gastos.</small></div><button onClick={()=>setShowTransferForm(true)} disabled={accounts.length<2}><Plus size={15}/> Registrar</button></div>
    <div>{transfers.slice(0,10).map(t=><div className="transfer-row" key={t.id}><span><ArrowRightLeft/></span><div><strong>{accountName(t.from_account_id)} → {accountName(t.to_account_id)}</strong><small>{t.description||'Transferencia'} · {new Date(t.transfer_date+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short'})}</small></div><b>{currency(Number(t.amount))}</b><button onClick={()=>deleteTransfer(t)}><Trash2/></button></div>)}</div>
    {!transfers.length&&<EmptyFinance text="Aquí aparecerán pagos de tarjeta, préstamos y transferencias entre cuentas."/>}
   </div>
  </>}

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

  {editingTx&&<Modal title="Editar movimiento" close={()=>setEditingTx(null)}><form className="finance-form" onSubmit={editTransaction}>
   <div className="two"><label>Tipo<select name="type" defaultValue={editingTx.type}><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label><label>Monto<input name="amount" type="number" min=".01" step=".01" defaultValue={Number(editingTx.amount)} required/></label></div>
   <label>Descripción<input name="description" defaultValue={editingTx.description} required/></label>
   <div className="two"><label>Categoría<select name="category_id" defaultValue={editingTx.category_id||''}><option value="">Sin categoría</option>{categories.map(cat=><option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label><label>Fecha<input name="date" type="date" defaultValue={editingTx.transaction_date} required/></label></div>
   <div className="two"><label>Pagado por<select name="paid_by" defaultValue={editingTx.paid_by||currentUser}>{members.map(member=><option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}</select></label><label>Cuenta<select name="account_id" defaultValue={editingTx.account_id||''}><option value="">Sin cuenta</option>{accounts.map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</select></label></div>
   <label>¿De quién es?<select name="share_mode" defaultValue={editingTx.is_shared?'shared':'personal'}><option value="shared">Compartido · {splitMethodLabel(splitMethod)}</option><option value="personal">Personal de quien pagó</option></select></label>
   <label>Notas<input name="notes" defaultValue={editingTx.notes||''} placeholder="Opcional"/></label>
   {editingTx.recurring_transaction_id&&<div className="linked-recurring-edit"><label className="check-line"><input type="checkbox" name="update_recurring" defaultChecked/> Actualizar también los próximos pagos recurrentes</label><label>Día de vencimiento<input name="due_day" type="number" min="1" max="31" defaultValue={recurringById(editingTx.recurring_transaction_id)?.due_day||new Date(editingTx.transaction_date+'T12:00').getDate()}/></label></div>}
   <button className="finance-primary" disabled={busy}><Check size={17}/>{busy?'Guardando...':'Guardar cambios'}</button>
  </form></Modal>}

  {showCategoryForm&&<Modal title="Nueva categoría" close={()=>setShowCategoryForm(false)}><form className="finance-form" onSubmit={addCategory}><label>Nombre<input name="name" placeholder="Ej. Mascotas" required/></label><label>Tipo<select name="budget_group" defaultValue="variable"><option value="fixed">Gasto fijo</option><option value="variable">Gasto variable</option><option value="saving">Ahorro</option></select></label><button className="finance-primary" disabled={busy}>{busy?'Guardando...':'Crear categoría'}</button></form></Modal>}

  {showGoalForm&&<Modal title="Nueva meta" close={()=>setShowGoalForm(false)}><form className="finance-form" onSubmit={addGoal}><label>Nombre<input name="name" placeholder="Ej. Fondo de emergencia" required/></label><label>Meta<input name="target_amount" type="number" min="1" step=".01" placeholder="50000" required/></label><label>Fecha objetivo<input name="target_date" type="date"/></label><button className="finance-primary" disabled={busy}>Crear meta</button></form></Modal>}

  {showAccountForm&&<Modal title="Nueva cuenta" close={()=>setShowAccountForm(false)}><form className="finance-form" onSubmit={addAccount}><label>Nombre<input name="name" placeholder="Ej. Cuenta principal" required/></label><div className="two"><label>Tipo<select name="account_type"><option value="checking">Cuenta bancaria</option><option value="savings">Ahorro</option><option value="cash">Efectivo</option><option value="credit">Tarjeta de crédito</option><option value="other">Otra</option></select></label><label>Saldo inicial<input name="opening_balance" type="number" step=".01" defaultValue="0"/></label></div><label>Propietario<select name="owner_user_id" defaultValue={currentUser}><option value="">Hogar</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label><label className="check-line"><input type="checkbox" name="is_shared" defaultChecked/> Cuenta compartida</label><button className="finance-primary" disabled={busy}>Agregar cuenta</button></form></Modal>}
 </section>
}

function Kpi({label,value,icon,tone}:{label:string;value:string;icon:any;tone:string}){return <div className={'finance-kpi '+tone}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>}
function Progress({value}:{value:number}){return <div className="progress"><span style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div>}
function EmptyFinance({text}:{text:string}){return <div className="finance-empty">{text}</div>}

function TransactionRows({txs,categoryName,memberName,onEdit,onDelete}:{txs:Tx[];categoryName:(x:string|null)=>string;memberName:(x:string|null)=>string;onEdit:(tx:Tx)=>void;onDelete:(tx:Tx)=>void}){
 return <div className="transaction-list">{txs.map(t=>{const category=categoryName(t.category_id);return <div className="transaction-row polished" key={t.id}><span className={'transaction-icon '+t.type}>{transactionIcon(t.type,category)}</span><div className="transaction-main"><strong>{t.description}</strong><small>{category} · {memberName(t.paid_by)}{t.is_shared?' · Compartido':''}{t.recurring_transaction_id?' · Recurrente':''}</small></div><div className="transaction-value"><b className={t.type}>{t.type==='income'?'+':'−'}{currency(Number(t.amount))}</b><small>{new Date(t.transaction_date+'T12:00').toLocaleDateString('es-GT',{day:'2-digit',month:'short'})}</small></div><div className="transaction-actions"><button className="transaction-action edit" title="Editar movimiento" aria-label="Editar movimiento" onClick={()=>onEdit(t)}><Pencil/></button><button className="transaction-action delete" title="Eliminar movimiento" aria-label="Eliminar movimiento" onClick={()=>onDelete(t)}><Trash2/></button></div></div>})}</div>
}

function ComparisonKpi({label,value,delta,goodWhenUp}:{label:string;value:number;delta:number;goodWhenUp:boolean}){
 const up=delta>0,neutral=Math.abs(delta)<.05,good=neutral?true:(up===goodWhenUp);
 return <div className="comparison-kpi"><div><small>{label}</small><strong>{currency(value)}</strong></div><span className={neutral?'neutral':good?'good':'bad'}>{neutral?'—':up?<TrendingUp/>:<TrendingDown/>}{neutral?'Sin cambio':Math.abs(delta).toFixed(1)+'%'}</span></div>
}

function MonthlyBars({data}:{data:MonthMetric[]}){
 const max=Math.max(1,...data.flatMap(row=>[row.income,row.expense,row.saving]));
 return <div className="monthly-bars"><div className="chart-legend"><span><i className="income"/>Ingresos</span><span><i className="expense"/>Gastos</span><span><i className="saving"/>Ahorro</span></div><div className="monthly-bars-grid">{data.map(row=><div className="month-bar-group" key={row.key}><div className="month-bars"><span className="income" style={{height:(row.income/max*100)+'%'}} title={'Ingresos '+currency(row.income)}/><span className="expense" style={{height:(row.expense/max*100)+'%'}} title={'Gastos '+currency(row.expense)}/><span className="saving" style={{height:(row.saving/max*100)+'%'}} title={'Ahorro '+currency(row.saving)}/></div><small>{row.label}</small></div>)}</div></div>
}

function BalanceChart({data}:{data:MonthMetric[]}){
 const max=Math.max(1,...data.map(row=>Math.abs(row.balance)));
 return <div className="balance-chart">{data.map(row=><div className="balance-column" key={row.key}><div className="balance-track"><span className={row.balance>=0?'positive':'negative'} style={{height:(Math.abs(row.balance)/max*48)+'%',bottom:row.balance>=0?'50%':'auto',top:row.balance<0?'50%':'auto'}} title={currency(row.balance)}/><i/></div><small>{row.label}</small></div>)}</div>
}

function SavingsRateChart({data}:{data:MonthMetric[]}){
 const max=Math.max(10,...data.map(row=>row.savingRate));
 return <div className="savings-rate-chart">{data.map(row=><div key={row.key}><div className="saving-rate-track"><span style={{height:Math.min(100,row.savingRate/max*100)+'%'}}/><b>{Math.round(row.savingRate)}%</b></div><small>{row.label}</small></div>)}</div>
}

function CategoryComparison({rows}:{rows:{id:string;name:string;current:number;previous:number;delta:number}[]}){
 const max=Math.max(1,...rows.flatMap(row=>[row.current,row.previous]));
 if(!rows.length)return <EmptyFinance text="Aún no hay suficientes movimientos para comparar categorías."/>;
 return <div className="category-comparison"><div className="category-comparison-legend"><span><i className="previous"/>Mes anterior</span><span><i className="current"/>Mes actual</span></div>{rows.map(row=><div className="category-compare-row" key={row.id}><div><strong>{row.name}</strong><small className={row.delta>0?'negative':row.delta<0?'positive':''}>{row.previous===0&&row.current>0?'Nueva':Math.abs(row.delta)<.05?'Sin cambio':(row.delta>0?'+':'')+row.delta.toFixed(0)+'%'}</small></div><div className="category-bars"><span className="previous" style={{width:(row.previous/max*100)+'%'}}/><span className="current" style={{width:(row.current/max*100)+'%'}}/></div><div><small>{currency(row.previous)}</small><strong>{currency(row.current)}</strong></div></div>)}</div>
}

function GoalCard({goal,saved,busy,onContribute}:{goal:Goal;saved:number;busy:boolean;onContribute:(id:string,amount:number)=>void}){
 const [amount,setAmount]=useState('');const progress=pct(saved,Number(goal.target_amount));
 return <div className="goal-card"><div className="goal-head"><span><Target/></span><div><strong>{goal.name}</strong><small>{goal.target_date?'Meta '+new Date(goal.target_date+'T12:00').toLocaleDateString('es-GT'):'Sin fecha límite'}</small></div></div><div className="goal-amount"><strong>{currency(saved)}</strong><span>de {currency(Number(goal.target_amount))}</span></div><Progress value={progress}/><div className="goal-footer"><small>{progress}% completado</small><div><input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="1" placeholder="Aporte"/><button disabled={busy} onClick={()=>{onContribute(goal.id,Number(amount));setAmount('')}}>+</button></div></div></div>
}

function Modal({title,close,children}:{title:string;close:()=>void;children:any}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="finance-modal"><div className="modal-head"><h3>{title}</h3><button onClick={close}><X/></button></div>{children}</div></div>}
function transactionIcon(type:'income'|'expense',category:string){
 if(type==='income')return <ArrowDownLeft/>;
 const key=category.toLocaleLowerCase('es-GT');
 if(key.includes('vivienda'))return <Home/>;
 if(key.includes('aliment'))return <ShoppingCart/>;
 if(key.includes('transport'))return <Car/>;
 if(key.includes('servicio'))return <ReceiptText/>;
 if(key.includes('salud'))return <HeartPulse/>;
 if(key.includes('educa'))return <GraduationCap/>;
 if(key.includes('ahorro'))return <PiggyBank/>;
 if(key.includes('viaje'))return <Plane/>;
 if(key.includes('entreten'))return <Sparkles/>;
 return <WalletCards/>;
}
function statusLabel(status:string){return status==='paid'?'Pagado':status==='overdue'?'Vencido':status==='skipped'?'Omitido':'Pendiente'}
function splitMethodLabel(method:SplitMethod){return method==='income'?'Proporcional a ingresos':method==='custom'?'Porcentaje personalizado':'Partes iguales'}
function categoryRuleLabel(method:CategoryRuleMethod,globalMethod:SplitMethod){return method==='inherit'?`General · ${splitMethodLabel(globalMethod)}`:method==='equal'?'Partes iguales':method==='income'?'Según ingresos':method==='custom'?'Porcentaje personalizado':'Una persona cubre 100%'}
function accountTypeName(type:string){return({cash:'Efectivo',checking:'Banco',savings:'Ahorro',credit:'Tarjeta',other:'Otra'} as Record<string,string>)[type]||'Cuenta'}
