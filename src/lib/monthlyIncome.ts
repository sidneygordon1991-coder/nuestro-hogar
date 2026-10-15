export type IncomePlan={user_id:string;month:string;expected_amount:number|string;first_half_amount?:number|string|null;second_half_amount?:number|string|null};
export type IncomeMember={user_id:string;full_name:string};
type IncomeMovement={type:string;amount:number|string;transaction_date:string;paid_by:string|null};
const cents=(value:number|string)=>{const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round(n*100):0};

export function incomeAmount(value:string){
 const text=value.trim();
 if(!/^\d+(\.\d{0,2})?$/.test(text))throw new Error('Usa un monto positivo o cero, con hasta dos decimales.');
 const amount=Number(text);
 if(!Number.isFinite(amount)||amount>9999999999.99)throw new Error('El monto supera el límite permitido.');
 return Math.round(amount*100)/100;
}

export function monthlyIncomeSummary(month:string,members:IncomeMember[],plans:IncomePlan[],movements:IncomeMovement[],references:Record<string,number>={}){
 const saved=new Map(plans.filter(p=>p.month===month).map(p=>[p.user_id,p]));
 const received=new Map<string,number>();let totalReceived=0;
 for(const movement of movements){
  if(movement.type!=='income'||movement.transaction_date.slice(0,7)!==month.slice(0,7))continue;
  const amount=cents(movement.amount);totalReceived+=amount;
  if(movement.paid_by)received.set(movement.paid_by,(received.get(movement.paid_by)||0)+amount);
 }
 const rows=members.map(member=>{
  const plan=saved.get(member.user_id),expected=cents(plan?plan.expected_amount:references[member.user_id]||0),actual=received.get(member.user_id)||0;
  return {...member,hasPlan:Boolean(plan),first_half_amount:plan?.first_half_amount??null,second_half_amount:plan?.second_half_amount??null,expected:expected/100,received:actual/100,pending:Math.max(0,expected-actual)/100,extra:Math.max(0,actual-expected)/100};
 });
 const expected=rows.reduce((sum,row)=>sum+cents(row.expected),0),pending=rows.reduce((sum,row)=>sum+cents(row.pending),0),attributed=rows.reduce((sum,row)=>sum+cents(row.received),0);
 return {rows,expected:expected/100,received:totalReceived/100,pending:pending/100,unassigned:(totalReceived-attributed)/100,hasPlan:rows.some(row=>row.hasPlan)};
}
