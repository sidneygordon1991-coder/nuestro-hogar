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

export type PayDays={first_pay_day?:number|null;second_pay_day?:number|null};
/** Saved pay days with their defaults: no first day means the 15th; no second day (or 31) means the month's last day. */
export function effectivePayDays(row?:PayDays|null){return {first:Number(row?.first_pay_day)||15,second:Number(row?.second_pay_day)||31}}
/** "Día 15" or "Último día del mes". */
export function payDayLabel(day:number){return day>=31?'Último día del mes':'Día '+day}
/** Validates the two pay days typed by a person (31 = last day of the month). */
export function payDays(first:string,second:string){
 const a=first.trim(),b=second.trim();
 if(!/^\d{1,2}$/.test(a)||Number(a)<1||Number(a)>15)throw new Error('El día de cobro de la primera quincena debe ser un día entre 1 y 15.');
 if(!/^\d{1,2}$/.test(b)||Number(b)<16||Number(b)>31)throw new Error('El día de cobro de la segunda quincena debe ser un día entre 16 y 30, o el último día del mes.');
 return {first_pay_day:Number(a),second_pay_day:Number(b)};
}
/** Quetzales per US dollar typed by a person: between 1 and 100, up to four decimals. */
export function usdRateInput(value:string){
 const text=value.trim().replace(',','.');
 if(!/^\d+(\.\d{1,4})?$/.test(text))throw new Error('Escribe el tipo de cambio como un número, por ejemplo 7.75 (hasta 4 decimales).');
 const rate=Number(text);
 if(!(rate>=1&&rate<=100))throw new Error('El tipo de cambio debe estar entre Q 1 y Q 100 por dólar.');
 return rate;
}
