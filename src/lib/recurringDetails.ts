export type RecurringTerms={description:string;amount:number|string;type:string;due_day?:number;category_id?:string|null;account_id?:string|null;paid_by?:string|null;is_shared?:boolean};
export type OccurrenceDetails=Partial<RecurringTerms>|null;
export function recurringTerms(r:RecurringTerms){return {description:r.description,amount:Number(r.amount),type:r.type,due_day:r.due_day,category_id:r.category_id??null,account_id:r.account_id??null,paid_by:r.paid_by??null,is_shared:r.is_shared??true}}
export function occurrenceDetails<T extends RecurringTerms>(r:T,snapshot:OccurrenceDetails|undefined):T{
 if(!snapshot||!Number.isFinite(Number(snapshot.amount))||Number(snapshot.amount)<=0||!['income','expense'].includes(String(snapshot.type))||typeof snapshot.description!=='string')return r;
 const result={...r,description:snapshot.description,amount:Number(snapshot.amount),type:snapshot.type!};
 for(const key of ['category_id','account_id','paid_by'] as const)if(snapshot[key]===null||typeof snapshot[key]==='string')result[key]=snapshot[key];
 if(typeof snapshot.is_shared==='boolean')result.is_shared=snapshot.is_shared;
 return result;
}
