import type {CashFlowSource} from './cashFlow';
import type {AccountMovement,AccountTransfer,HomeFinance,OverviewAccount} from './homeOverview';

/**
 * Fictitious household used by "Ver un ejemplo": everything is generated in the browser relative to today
 * and nothing is read from or written to the server.
 */
export const DEMO_ME='demo-me',DEMO_PARTNER='demo-partner';
export const demoMembers=[{user_id:DEMO_ME,full_name:'Tú'},{user_id:DEMO_PARTNER,full_name:'Alex'}];

export function demoHome(today:string):{finance:HomeFinance;accounts:{accounts:(OverviewAccount&Record<string,unknown>)[];movements:AccountMovement[];transfers:AccountTransfer[];reconciliations:{account_id:string;cutoff:string}[]}}{
 const month=today.slice(0,8)+'01',day=(n:number)=>today.slice(0,8)+String(Math.min(n,28)).padStart(2,'0');
 const past=(n:number)=>{const d=day(n);return d<=today?d:today};
 const cat={super:'c-super',trans:'c-trans',fuera:'c-fuera',serv:'c-serv',card:'c-card',save:'c-save'};
 const tx=(id:string,description:string,amount:number,type:'income'|'expense',date:string,category:string|null,by=DEMO_ME,shared=true)=>({id,description,amount,type,transaction_date:date,category_id:category,paid_by:by,is_shared:shared,account_id:'a-bank'});
 const transactions=[
  tx('t1','Salario quincenal',4500,'income',past(15),null),tx('t2','Salario quincenal',3500,'income',past(15),null,DEMO_PARTNER),
  tx('t3','Supermercado',1650,'expense',past(3),cat.super),tx('t4','Mercado y verdura',820,'expense',past(10),cat.super,DEMO_PARTNER),
  tx('t5','Supermercado',1430,'expense',past(14),cat.super,DEMO_PARTNER),tx('t6','Gasolina',600,'expense',past(5),cat.trans),
  tx('t7','Cena de aniversario',640,'expense',past(9),cat.fuera,DEMO_PARTNER),tx('t8','Farmacia',210,'expense',past(12),null)
 ];
 const source:CashFlowSource={month,today,transactions,
  savings:[{amount:1000,contribution_date:past(15),created_by:DEMO_ME}],
  categories:[{id:cat.super,name:'Supermercado',icon:'food',budget_group:'variable'},{id:cat.trans,name:'Transporte',icon:'transport',budget_group:'variable'},{id:cat.fuera,name:'Comidas fuera',icon:'restaurant',budget_group:'variable'},{id:cat.serv,name:'Servicios',icon:'utilities',budget_group:'fixed'},{id:cat.card,name:'Tarjeta',icon:'bills',budget_group:'fixed'},{id:cat.save,name:'Fondo de emergencia',icon:'saving',budget_group:'saving'}] as unknown as CashFlowSource['categories'],
  allocations:[[cat.super,6000],[cat.trans,1200],[cat.fuera,800],[cat.serv,1300],[cat.card,3500],[cat.save,2500]].map(([category_id,planned_amount])=>({category_id:String(category_id),planned_amount,month,first_half_amount:Number(planned_amount)/2,second_half_amount:Number(planned_amount)/2})),
  members:demoMembers,
  plans:[{user_id:DEMO_ME,month,expected_amount:9000,first_half_amount:4500,second_half_amount:4500},{user_id:DEMO_PARTNER,month,expected_amount:7000,first_half_amount:3500,second_half_amount:3500}],
  references:{},paydays:{[DEMO_ME]:{first:15,second:30},[DEMO_PARTNER]:{first:15,second:31}},
  recurring:[{id:'r1',description:'Servicios',amount:1300,type:'expense',due_day:20,category_id:cat.serv},{id:'r2',description:'Tarjeta',amount:3500,type:'expense',due_day:25,category_id:cat.card}],
  occurrences:[{id:'o1',recurring_transaction_id:'r1',due_date:day(20),status:'pending'},{id:'o2',recurring_transaction_id:'r2',due_date:day(25),status:'pending'}]};
 const finance:HomeFinance={source,income:8000,expense:5350,saving:1000,available:1650,pending:4800,projected:0,overdue:0,nextPayment:'Servicios',nextPaymentAmount:1300,nextPaymentDate:day(20),goalName:'Fondo de emergencia',goalProgress:60,
  goals:[{id:'g1',name:'Fondo de emergencia',target_amount:15000,target_date:shiftYear(today),icon:'shield'}],goalEntries:[{goal_id:'g1',amount:9000,contribution_date:past(1)}],
  splits:[{transaction_id:'t3',user_id:DEMO_ME,share_amount:825},{transaction_id:'t3',user_id:DEMO_PARTNER,share_amount:825},{transaction_id:'t4',user_id:DEMO_ME,share_amount:410},{transaction_id:'t4',user_id:DEMO_PARTNER,share_amount:410},{transaction_id:'t5',user_id:DEMO_ME,share_amount:715},{transaction_id:'t5',user_id:DEMO_PARTNER,share_amount:715},{transaction_id:'t6',user_id:DEMO_ME,share_amount:300},{transaction_id:'t6',user_id:DEMO_PARTNER,share_amount:300}],
  settlements:[],privateEntries:[],usdRate:7.75,planComplete:true};
 const bankMovements=transactions.map(t=>({account_id:'a-bank',type:t.type,amount:t.amount,transaction_date:t.transaction_date}));
 return {finance,accounts:{
  accounts:[{id:'a-bank',name:'Cuenta monetaria',account_type:'checking',account_class:'asset',opening_balance:8350,active:true},{id:'a-cash',name:'Efectivo',account_type:'cash',account_class:'asset',opening_balance:1450,active:true},
   {id:'a-card',name:'Tarjeta Visa',account_type:'credit',account_class:'liability',opening_balance:3200,active:true,statement_day:5,payment_due_day:25,minimum_payment:250,credit_limit:10000}],
  movements:bankMovements,transfers:[],reconciliations:[{account_id:'a-bank',cutoff:past(1)},{account_id:'a-cash',cutoff:past(1)}]}};
}
function shiftYear(date:string){return String(Number(date.slice(0,4))+1)+'-06-30'}
