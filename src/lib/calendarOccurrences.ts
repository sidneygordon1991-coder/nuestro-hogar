/** Calendar recurrence expansion on plain 'YYYY-MM-DD' strings, so no time-of-day or timezone can drop an occurrence. */
export type Recurrence='none'|'weekly'|'monthly'|'yearly';
export type RecurringEvent={id:string;event_date:string;recurrence:Recurrence|string;recurrence_until:string|null};
export type Occurrence<T>={key:string;date:string;event:T};
const pad=(n:number)=>String(n).padStart(2,'0');
const daysInMonth=(year:number,month0:number)=>new Date(Date.UTC(year,month0+1,0)).getUTCDate();
const ymd=(year:number,month0:number,day:number)=>year+'-'+pad(month0+1)+'-'+pad(day);
const toDay=(date:string)=>{const [y,m,d]=date.split('-').map(Number);return Date.UTC(y,m-1,d)/86400000};
const fromDay=(day:number)=>{const x=new Date(day*86400000);return ymd(x.getUTCFullYear(),x.getUTCMonth(),x.getUTCDate())};
/** Occurrences of each event inside the month (month0 is 0-based). Monthly events on the 29–31 fall on the last day of shorter months; yearly Feb 29 falls on Feb 28 in common years. */
export function expandMonthOccurrences<T extends RecurringEvent>(events:T[],year:number,month0:number):Occurrence<T>[]{
 const last=daysInMonth(year,month0),start=ymd(year,month0,1),end=ymd(year,month0,last),out:Occurrence<T>[]=[];
 const push=(event:T,date:string)=>out.push({key:event.id+'-'+date,date,event});
 for(const event of events){
  const base=String(event.event_date||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(base))continue;
  const until=event.recurrence_until?String(event.recurrence_until).slice(0,10):end,limit=until<end?until:end;
  if(event.recurrence==='weekly'){if(base>limit)continue;let day=toDay(base);const first=toDay(start);if(day<first)day+=Math.ceil((first-day)/7)*7;for(let d=fromDay(day);d<=limit;day+=7,d=fromDay(day))push(event,d);continue}
  if(event.recurrence==='monthly'){const candidate=ymd(year,month0,Math.min(Number(base.slice(8,10)),last));if(candidate>=base&&candidate<=limit)push(event,candidate);continue}
  if(event.recurrence==='yearly'){if(Number(base.slice(5,7))-1!==month0)continue;const candidate=ymd(year,month0,Math.min(Number(base.slice(8,10)),last));if(candidate>=base&&candidate<=limit)push(event,candidate);continue}
  if(base>=start&&base<=end)push(event,base);
 }
 return out;
}
